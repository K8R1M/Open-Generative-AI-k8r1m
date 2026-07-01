'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fsp = require('node:fs/promises');
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
});

test('native library lists completed assets, filters kind, paginates with jobId tie-break, and redacts private fields', async () => {
  await seedStore({
    'job-c': job('job-c', { task: 'image-to-video', modelId: 'native.grok.imagine-video', assetId: 'asset-c', createdAt: '2026-07-01T00:00:02.000Z', url: '/api/native-media/v1/assets/asset-c', outputs: ['/api/native-media/v1/assets/asset-c'] }),
    'job-b': job('job-b', { assetId: 'asset-b', createdAt: '2026-07-01T00:00:01.000Z', url: '/api/native-media/v1/assets/asset-b', outputs: ['/api/native-media/v1/assets/asset-b'] }),
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
