'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `library-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;
delete process.env.NATIVE_MEDIA_LIVE_GROK;

const gateway = require('../native-media-gateway/exports.js');
const { handleNativeRequest } = require('../native-media-gateway/server.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);

async function request(method, url) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(body) {
      this.body = body ? Buffer.from(body).toString('utf8') : '';
      this.resolve();
    },
  };
  const done = new Promise((resolve) => {
    res.resolve = resolve;
  });
  handleNativeRequest(req, res);
  process.nextTick(() => req.emit('end'));
  await done;
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

test.afterEach(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('library route lists completed generated assets newest first without private fields', async () => {
  const oldJob = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'old',
  });
  const newJob = await gateway.submitGeneration({
    modelId: 'native.grok.imagine-video',
    task: 'image-to-video',
    prompt: 'new',
  });
  const oldAsset = await gateway.getAsset(oldJob.assetId);
  await fsp.rm(oldAsset.path, { force: true });

  const res = await request('GET', '/api/native-media/v1/library?kind=all&limit=100');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((job) => job.id), [newJob.id]);
  assert.equal(res.body.nextCursor, null);
  assert.equal(res.body.items[0].prompt, undefined);
  assert.equal(res.body.items[0].providerConfig, undefined);
  assert.equal(res.body.items[0].asset.assetId, newJob.assetId);

  const videos = await request('GET', '/api/native-media/v1/library?kind=video');
  assert.deepEqual(videos.body.items.map((job) => job.id), [newJob.id]);
});

test('library delete tombstones job and removes only generated asset', async () => {
  const upload = await gateway.uploadAsset({ bytes: PNG_1X1, mime: 'image/png' });
  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'delete me',
    inputs: [{ kind: 'asset', assetId: upload.assetId, role: 'reference' }],
  });

  const deleted = await request('DELETE', `/api/native-media/v1/library/${job.id}`);
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, null);

  assert.equal(await gateway.getAsset(job.assetId), null);
  assert.ok(await gateway.getAsset(upload.assetId), 'uploads are not library-delete targets');

  const listed = await request('GET', '/api/native-media/v1/library?kind=image');
  assert.deepEqual(listed.body.items, []);

  const stored = await gateway.getGeneration(job.id);
  assert.equal(typeof stored.deletedAt, 'string');
  assert.equal(stored.status, 'asset_deleted');
  assert.equal(stored.assetDeleted, true);
});

test('library delete tombstone survives a concurrent submit', async () => {
  const doomed = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'delete race',
  });

  const [deleted, created] = await Promise.all([
    gateway.deleteLibraryJob(doomed.id),
    gateway.submitGeneration({
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'new race',
    }),
  ]);

  assert.equal(deleted.status, 'asset_deleted');
  assert.equal(created.status, 'completed');

  const storedDeleted = await gateway.getGeneration(doomed.id);
  const storedCreated = await gateway.getGeneration(created.id);
  assert.equal(storedDeleted.status, 'asset_deleted');
  assert.equal(storedDeleted.assetDeleted, true);
  assert.equal(storedCreated.status, 'completed');
});

test('library delete rejects traversal-shaped job ids', async () => {
  const res = await request('DELETE', '/api/native-media/v1/library/../x');
  assert.equal(res.status, 404);
});
