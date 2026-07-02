'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const childProcess = require('node:child_process');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { NATIVE_ROUTES } = require('./fixtures/nativeContract');

process.env.NATIVE_MEDIA_ROOT = path.join(process.cwd(), '.native-media-test', `library-${process.pid}`);
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;
delete process.env.NATIVE_MEDIA_LIVE_GROK;

const { handleNativeRequest } = require('../native-media-gateway/server.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const MP4 = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431000003176d6f6f76d6f6f760000086d646174', 'hex');

async function invoke(method, url) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const res = {
    statusCode: null,
    headers: null,
    body: Buffer.alloc(0),
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(chunk = '') {
      this.body = Buffer.concat([this.body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
    },
  };
  await handleNativeRequest(req, res);
  return {
    status: res.statusCode,
    body: res.body.length ? JSON.parse(res.body.toString('utf8')) : null,
  };
}

async function invokeRaw(method, url) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const chunks = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.statusCode = null;
  res.headers = null;
  res.writeHead = (status, headers) => {
    res.statusCode = status;
    res.headers = headers || {};
  };
  res.end = (chunk = '') => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    Writable.prototype.end.call(res);
  };
  res.destroy = () => {
    resolveDone();
  };
  res.on('finish', resolveDone);
  const handled = handleNativeRequest(req, res);
  await done;
  await handled;
  const body = Buffer.concat(chunks);
  return { status: res.statusCode, headers: res.headers || {}, body };
}

async function seedStore(jobs) {
  const root = process.env.NATIVE_MEDIA_ROOT;
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.mkdir(path.join(root, 'assets'), { recursive: true });
  await fsp.mkdir(path.join(root, 'uploads'), { recursive: true });
  await fsp.mkdir(path.join(root, 'tmp'), { recursive: true });
  await fsp.writeFile(path.join(root, 'jobs.json'), JSON.stringify(jobs, null, 2));
  await fsp.writeFile(path.join(root, 'idempotency.json'), '{}');
}

async function asset(assetId, mime = 'image/png') {
  const ext = mime === 'video/mp4' ? 'mp4' : 'png';
  const dir = path.join(process.env.NATIVE_MEDIA_ROOT, 'assets', assetId);
  const file = path.join(dir, `data.${ext}`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, mime === 'video/mp4' ? MP4 : PNG);
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({
    id: assetId,
    assetId,
    mime,
    path: file,
    url: `/api/native-media/v1/assets/${assetId}`,
    createdAt: '2026-07-01T00:00:00.000Z',
  }));
}

function job(id, patch = {}) {
  const assetId = patch.assetId || `asset-${id}`;
  return {
    id,
    request_id: id,
    status: 'completed',
    native: true,
    task: 'text-to-image',
    modelId: 'native.vertex.nano-banana-2',
    model: 'native.vertex.nano-banana-2',
    prompt: `prompt ${id}`,
    assetId,
    url: `/api/native-media/v1/assets/${assetId}`,
    outputs: [`/api/native-media/v1/assets/${assetId}`],
    createdAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-01T00:00:01.000Z',
    outputPath: '/private/output.png',
    detail: 'private detail',
    codexDiagnostics: { private: true },
    ...patch,
  };
}

test.after(async () => {
  await fsp.rm(process.env.NATIVE_MEDIA_ROOT, { recursive: true, force: true });
});

test('library routes exist in the frozen V1 route contract', () => {
  assert.ok(NATIVE_ROUTES.includes('GET /api/native-media/v1/library'));
  assert.ok(NATIVE_ROUTES.includes('DELETE /api/native-media/v1/library/:jobId'));
  assert.ok(NATIVE_ROUTES.includes('POST /api/native-media/v1/library/:jobId/last-frame'));
});

test('native library lists completed assets, filters kind, paginates with jobId tie-break, and redacts private fields', async () => {
  await seedStore({
    'job-c': job('job-c', { task: 'image-to-video', modelId: 'native.grok.imagine-video', assetId: 'asset-c', displayName: 'video-studio-0001', downloadName: 'video-studio-0001', createdAt: '2026-07-01T00:00:02.000Z', url: '/api/native-media/v1/assets/asset-c', outputs: ['/api/native-media/v1/assets/asset-c'] }),
    'job-b': job('job-b', { assetId: 'asset-b', displayName: 'image-studio-0001', downloadName: 'image-studio-0001', createdAt: '2026-07-01T00:00:01.000Z', url: '/api/native-media/v1/assets/asset-b', outputs: ['/api/native-media/v1/assets/asset-b'] }),
    'job-a': job('job-a', { assetId: 'asset-a', createdAt: '2026-07-01T00:00:01.000Z', url: '/api/native-media/v1/assets/asset-a', outputs: ['/api/native-media/v1/assets/asset-a'] }),
    'job-deleted': job('job-deleted', { status: 'asset_deleted', assetDeleted: true }),
    'job-fake': job('job-fake', { fake: true, assetId: null, url: 'fake://asset' }),
    'job-missing': job('job-missing', { assetId: 'asset-missing', url: '/api/native-media/v1/assets/asset-missing' }),
  });
  await asset('asset-a');
  await asset('asset-b');
  await asset('asset-c', 'video/mp4');

  const first = await invoke('GET', '/api/native-media/v1/library?kind=image&limit=1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.items.map((i) => i.jobId), ['job-b']);
  assert.equal(first.body.items[0].displayName, 'image-studio-0001');
  assert.equal(first.body.items[0].downloadName, 'image-studio-0001');
  assert.ok(first.body.nextCursor, 'a page boundary must return an opaque cursor');

  const second = await invoke('GET', `/api/native-media/v1/library?kind=image&limit=10&cursor=${encodeURIComponent(first.body.nextCursor)}`);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.items.map((i) => i.jobId), ['job-a']);
  assert.equal(second.body.items[0].prompt, 'prompt job-a');
  assert.equal(JSON.stringify(second.body).includes('outputPath'), false);
  assert.equal(JSON.stringify(second.body).includes('codexDiagnostics'), false);

  const videos = await invoke('GET', '/api/native-media/v1/library?kind=video&limit=10');
  assert.equal(videos.status, 200);
  assert.deepEqual(videos.body.items.map((i) => i.jobId), ['job-c']);
  assert.equal(videos.body.items[0].prompt, 'prompt job-c');
  assert.equal(videos.body.items[0].displayName, 'video-studio-0001');
  assert.equal(videos.body.items[0].downloadName, 'video-studio-0001');
});

test('native library delete is jobId-only, tombstones before rm, tolerates missing assets, and rejects path tricks', async () => {
  await seedStore({
    'job-ok': job('job-ok', { assetId: 'asset-ok', url: '/api/native-media/v1/assets/asset-ok' }),
    'job-missing': job('job-missing', { assetId: 'asset-missing', url: '/api/native-media/v1/assets/asset-missing' }),
    'job-bad': job('job-bad', { assetId: '../outside', url: '/api/native-media/v1/assets/../outside' }),
  });
  await asset('asset-ok');

  assert.equal((await invoke('DELETE', '/api/native-media/v1/library/asset-ok')).status, 404);
  assert.equal((await invoke('DELETE', '/api/native-media/v1/library/job-missing')).status, 204);

  const ok = await invoke('DELETE', '/api/native-media/v1/library/job-ok');
  assert.equal(ok.status, 204);
  await assert.rejects(() => fsp.stat(path.join(process.env.NATIVE_MEDIA_ROOT, 'assets', 'asset-ok')), /ENOENT/);

  const bad = await invoke('DELETE', '/api/native-media/v1/library/job-bad');
  assert.equal(bad.status, 400);
});

test('native library concurrent deletes leave one tombstone and a readable job store', async () => {
  await seedStore({ 'job-race': job('job-race', { assetId: 'asset-race', url: '/api/native-media/v1/assets/asset-race' }) });
  await asset('asset-race');

  const statuses = await Promise.all([
    invoke('DELETE', '/api/native-media/v1/library/job-race').then((r) => r.status),
    invoke('DELETE', '/api/native-media/v1/library/job-race').then((r) => r.status),
  ]);
  assert.deepEqual(statuses.sort(), [204, 404]);

  const raw = await fsp.readFile(path.join(process.env.NATIVE_MEDIA_ROOT, 'jobs.json'), 'utf8');
  const stored = JSON.parse(raw);
  assert.equal(stored['job-race'].assetDeleted, true);
  assert.equal(stored['job-race'].status, 'asset_deleted');
});

test('native library last-frame streams a png attachment from trusted video asset only', async (t) => {
  await seedStore({
    'job-video': job('job-video', {
      task: 'image-to-video',
      modelId: 'native.grok.imagine-video',
      model: 'native.grok.imagine-video',
      assetId: 'asset-video',
      displayName: 'video-studio-0007',
      downloadName: 'video-studio-0007',
      url: '/api/native-media/v1/assets/asset-video',
      outputs: ['/api/native-media/v1/assets/asset-video'],
    }),
  });
  await asset('asset-video', 'video/mp4');

  const originalSpawn = childProcess.spawn;
  const calls = [];
  t.after(() => {
    childProcess.spawn = originalSpawn;
  });
  childProcess.spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.kill = () => true;
    process.nextTick(async () => {
      await fsp.writeFile(args[2], PNG);
      child.emit('close', 0);
    });
    return child;
  };

  const beforeTemps = new Set((await fsp.readdir(os.tmpdir())).filter((name) => name.startsWith('native-last-frame-')));
  const res = await invokeRaw('POST', '/api/native-media/v1/library/job-video/last-frame');
  const afterTemps = (await fsp.readdir(os.tmpdir())).filter((name) => name.startsWith('native-last-frame-') && !beforeTemps.has(name));

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.equal(res.headers['content-disposition'], 'attachment; filename="video-studio-0007-last-frame.png"');
  assert.deepEqual(res.body, PNG);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.match(calls[0].args[0], /native-media-gateway\/bin\/extract-last-frame\.js$/);
  assert.match(calls[0].args[1], /\/assets\/asset-video\/data\.mp4$/);
  assert.match(calls[0].args[2], /native-last-frame-/);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(afterTemps, []);
});

test('native library last-frame rejects invalid job states and asset escapes', async () => {
  await seedStore({
    'job-image': job('job-image', { assetId: 'asset-image' }),
    'job-running': job('job-running', { status: 'running', assetId: 'asset-running' }),
    'job-deleted': job('job-deleted', { status: 'asset_deleted', assetDeleted: true, deletedAt: '2026-07-01T00:00:02.000Z', assetId: 'asset-deleted' }),
    'job-missing': job('job-missing', {
      task: 'image-to-video',
      modelId: 'native.grok.imagine-video',
      model: 'native.grok.imagine-video',
      assetId: 'asset-missing',
    }),
    'job-escape': job('job-escape', {
      task: 'image-to-video',
      modelId: 'native.grok.imagine-video',
      model: 'native.grok.imagine-video',
      assetId: 'asset-escape',
    }),
  });
  await asset('asset-image');
  await asset('asset-running', 'video/mp4');
  const outside = path.join(process.env.NATIVE_MEDIA_ROOT, 'outside.mp4');
  await fsp.writeFile(outside, MP4);
  const escapeDir = path.join(process.env.NATIVE_MEDIA_ROOT, 'assets', 'asset-escape');
  await fsp.mkdir(escapeDir, { recursive: true });
  await fsp.symlink(outside, path.join(escapeDir, 'data.mp4'));
  await fsp.writeFile(path.join(escapeDir, 'meta.json'), JSON.stringify({
    id: 'asset-escape',
    assetId: 'asset-escape',
    mime: 'video/mp4',
    path: path.join(escapeDir, 'data.mp4'),
    url: '/api/native-media/v1/assets/asset-escape',
  }));

  assert.equal((await invoke('POST', '/api/native-media/v1/library/not-a-job/last-frame')).status, 400);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-nope/last-frame')).status, 404);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-deleted/last-frame')).status, 404);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-running/last-frame')).status, 400);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-image/last-frame')).status, 400);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-missing/last-frame')).status, 400);
  assert.equal((await invoke('POST', '/api/native-media/v1/library/job-escape/last-frame')).status, 400);
});

test('native library last-frame returns redacted public error on helper failure', async (t) => {
  await seedStore({
    'job-video': job('job-video', {
      task: 'image-to-video',
      modelId: 'native.grok.imagine-video',
      model: 'native.grok.imagine-video',
      assetId: 'asset-video',
    }),
  });
  await asset('asset-video', 'video/mp4');

  const originalSpawn = childProcess.spawn;
  const originalConsoleError = console.error;
  t.after(() => {
    childProcess.spawn = originalSpawn;
    console.error = originalConsoleError;
  });
  console.error = () => {};
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.kill = () => true;
    process.nextTick(() => child.emit('close', 1));
    return child;
  };

  const res = await invoke('POST', '/api/native-media/v1/library/job-video/last-frame');
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'NATIVE_MEDIA_ERROR');
  assert.equal(JSON.stringify(res.body).includes(process.env.NATIVE_MEDIA_ROOT), false);
  assert.equal(JSON.stringify(res.body).includes('ffmpeg'), false);
});
