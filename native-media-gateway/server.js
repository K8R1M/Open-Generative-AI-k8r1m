'use strict';

const http = require('node:http');
const fs = require('node:fs');
const gateway = require('./exports.js');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 19334;
const PRIVATE_JOB_FIELDS = new Set([
  'outputPath',
  'detail',
  'pid',
  'pgid',
  'subprocessProvider',
  'providerConfig',
  'codexDiagnostics',
  'grokDiagnostics',
  'prompt',
]);

function json(res, body, status = 200) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
  });
  res.end(payload);
}

function noContent(res) {
  res.writeHead(204);
  res.end();
}

function safeError(error) {
  const message = String(error && error.message || '');
  if (/credential|unsupported|required|forbidden|invalid|missing|not found|mime|duration|reference|input|asset/i.test(message)) {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'Invalid native media request.' } };
  }
  console.error('[native-media-gateway]', error);
  return { status: 500, body: { error: 'NATIVE_MEDIA_ERROR', message: 'Native media request failed.' } };
}

function publicFailureMessage(job) {
  const detail = String(job && job.detail || '');
  if (!detail) return null;
  const support = /Support codes?:\s*([0-9,\s]+)/i.exec(detail);
  if (/input image violates Vertex AI'?s usage guidelines/i.test(detail)) {
    return `Veo could not generate the video because the input image violates Vertex AI usage guidelines.${support ? ` Support code: ${support[1].trim()}.` : ''}`;
  }
  if (
    /rai_media_filtered/i.test(detail) ||
    /videos? (?:were|was) filtered out because (?:they|it) violated Vertex AI'?s usage guidelines/i.test(detail)
  ) {
    return `Veo could not generate the video because Vertex AI filtered the result under its usage guidelines. Try rephrasing the prompt or using a different input image.${support ? ` Support code: ${support[1].trim()}.` : ''}`;
  }
  if (/Reauthentication is needed|gcloud auth application-default login|RefreshError/i.test(detail)) {
    return 'Vertex authentication failed before generation. The native worker needs valid Google Application Default Credentials or a configured service account.';
  }
  if (/Grok timed out|TIMEOUT/i.test(detail)) {
    return 'Grok video generation timed out before a verified MP4 was available. Try a shorter or simpler prompt.';
  }
  if (/usage guidelines|safety|policy|filtered/i.test(detail)) {
    return 'Grok could not generate the video under provider safety rules. Try a different input image or prompt.';
  }
  if (/Grok CLI not found|grok_imagine_video|GROK_IMAGINE_CLI|auth|login|permission/i.test(detail)) {
    return 'Grok video generation failed before completion. The native worker may need local Grok CLI setup.';
  }
  return null;
}

function publicJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return job;
  const out = Object.fromEntries(Object.entries(job).filter(([key]) => !PRIVATE_JOB_FIELDS.has(key)));
  const message = publicFailureMessage(job);
  if (message) out.message = message;
  return out;
}

function generationOptions() {
  const liveVertex = process.env.NATIVE_MEDIA_LIVE_VERTEX === '1';
  const liveCodex = process.env.NATIVE_MEDIA_LIVE_CODEX === '1';
  const liveGrok = process.env.NATIVE_MEDIA_LIVE_GROK === '1';
  return {
    provider: { fake: !(liveVertex || liveCodex || liveGrok) },
    liveVertex,
    liveCodex,
    liveGrok,
  };
}

function routeParts(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const mediaIndex = parts[0] === 'api' && parts[1] === 'native-media' ? 2 : 0;
  const path = parts.slice(mediaIndex);
  return path[0] === 'v1' ? path.slice(1) : path;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  return JSON.parse(body.toString('utf8'));
}

async function uploadFromRequest(req, url) {
  const contentType = req.headers['content-type'] || '';
  const body = await readBody(req);
  if (contentType.includes('multipart/form-data')) {
    const request = new Request(url.href, { method: 'POST', headers: req.headers, body });
    const form = await request.formData();
    const file = form.get('file') || form.get('asset');
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('upload file is required');
    return gateway.uploadAsset({
      name: file.name,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }
  return gateway.uploadAsset(body.length ? JSON.parse(body.toString('utf8')) : {});
}

function streamAsset(res, asset, rangeHeader) {
  const headers = {
    'content-type': asset.mime || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  };

  const errorHandler = (error) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'NATIVE_MEDIA_ERROR', message: 'Asset streaming failed.' }));
    } else {
      res.destroy();
    }
  };

  let start;
  let end;
  let isRange = false;

  if (rangeHeader) {
    if (rangeHeader.startsWith('bytes=-')) {
      const suffixPart = rangeHeader.slice(7);
      if (!/^\d+$/.test(suffixPart) || Number(suffixPart) <= 0) {
        res.writeHead(416, { 'content-range': `bytes */${asset.size}` });
        res.end();
        return;
      }
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match) {
      if (!match[1]) {
        // Suffix byte range: e.g. bytes=-500
        const suffixLength = Number(match[2]);
        if (Number.isNaN(suffixLength) || suffixLength <= 0 || !match[2]) {
          res.writeHead(416, { 'content-range': `bytes */${asset.size}` });
          res.end();
          return;
        }
        start = Math.max(asset.size - suffixLength, 0);
        end = asset.size - 1;
        isRange = true;
      } else {
        // Prefix or normal range: e.g. bytes=500- or bytes=500-1000
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), asset.size - 1) : asset.size - 1;
        isRange = true;
      }

      if (isRange) {
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= asset.size || start < 0) {
          res.writeHead(416, { 'content-range': `bytes */${asset.size}` });
          res.end();
          return;
        }
      }
    }
  }

  const streamOptions = isRange ? { start, end } : {};
  const rStream = fs.createReadStream(asset.path, streamOptions);

  rStream.on('error', errorHandler);

  rStream.on('open', () => {
    if (isRange) {
      headers['content-range'] = `bytes ${start}-${end}/${asset.size}`;
      headers['content-length'] = String(end - start + 1);
      res.writeHead(206, headers);
    } else {
      headers['content-length'] = String(asset.size);
      res.writeHead(200, headers);
    }
    rStream.pipe(res);
  });
}

async function handleNativeRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const parts = routeParts(url);
  const [resource, id] = parts;
  try {
    if (req.method === 'GET') {
      if (!resource || resource === 'health') return json(res, { ok: true, service: 'native-media' });
      if (resource === 'ready') return json(res, { ok: true, ready: true });
      if (resource === 'capabilities') return json(res, gateway.getNativeCapabilities());
      if (resource === 'library' && !id) {
        const library = await gateway.listLibrary({
          kind: url.searchParams.get('kind') || 'all',
          limit: url.searchParams.get('limit') || 100,
          cursor: url.searchParams.get('cursor') || 0,
        });
        return json(res, { ...library, items: library.items.map(publicJob) });
      }
      if (resource === 'generations' && id) {
        const job = await gateway.getGeneration(id);
        return job ? json(res, publicJob(job)) : json(res, { error: 'generation not found' }, 404);
      }
      if (resource === 'assets' && id) {
        const asset = await gateway.getAsset(id);
        return asset ? streamAsset(res, asset, req.headers.range) : json(res, { error: 'asset not found' }, 404);
      }
    }
    if (req.method === 'POST') {
      if (resource === 'uploads') return json(res, await uploadFromRequest(req, url), 201);
      if (resource === 'generations') {
        const job = await gateway.submitGeneration(await readJson(req), generationOptions());
        return json(res, publicJob(job), 201);
      }
    }
    if (req.method === 'DELETE' && resource === 'generations' && id) {
      const job = await gateway.cancelGeneration(id);
      return job ? json(res, publicJob(job)) : json(res, { error: 'generation not found' }, 404);
    }
    if (req.method === 'DELETE' && resource === 'library' && id && parts.length === 2) {
      const job = await gateway.deleteLibraryJob(id);
      return job ? noContent(res) : json(res, { error: 'library job not found' }, 404);
    }
    return json(res, { error: 'native media route not found' }, 404);
  } catch (error) {
    const safe = safeError(error);
    return json(res, safe.body, safe.status);
  }
}

function createServer() {
  return http.createServer(handleNativeRequest);
}

async function start() {
  const counts = await gateway.reconcileOnRestart();
  const store = await gateway.getStoreInfo();
  const port = Number(process.env.NATIVE_MEDIA_GATEWAY_PORT || DEFAULT_PORT);
  const server = createServer();
  await new Promise((resolve) => server.listen(port, HOST, resolve));
  console.log(`[native-media-gateway] root=${store.root} jobs=${store.jobs} assets=${store.assets} uploads=${store.uploads} reconcile=${JSON.stringify(counts)}`);
  console.log(`[native-media-gateway] listening on http://${HOST}:${port}`);
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[native-media-gateway] failed to start', error);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  handleNativeRequest,
  publicJob,
  start,
};
