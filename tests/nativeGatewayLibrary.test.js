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

async function request(method, url, body) {
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
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });
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
  const newAsset = await gateway.getAsset(newJob.assetId);
  const newAssetBytes = await fsp.readFile(newAsset.path);
  assert.ok(newAssetBytes.includes(Buffer.from('moov')), 'fake video MP4 must include moov metadata');

  const res = await request('GET', '/api/native-media/v1/library?kind=all&limit=100');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((job) => job.id), [newJob.id]);
  assert.equal(res.body.nextCursor, null);
  assert.equal(res.body.items[0].prompt, 'new');
  assert.equal(res.body.items[0].providerConfig, undefined);
  assert.equal(res.body.items[0].asset.assetId, newJob.assetId);

  const videos = await request('GET', '/api/native-media/v1/library?kind=video');
  assert.deepEqual(videos.body.items.map((job) => job.id), [newJob.id]);
});

test('POST generations keeps Grok live without fake-completing unavailable image providers', async () => {
  process.env.NATIVE_MEDIA_LIVE_GROK = '1';
  const originalRunGrok = gateway.grokVideoProvider.runGrokVideoProvider;
  let ranGrok = false;
  try {
    const vertex = await request('POST', '/api/native-media/v1/generations', {
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'vertex should not fake complete',
      clientRequestId: 'server-vertex-fake-' + Date.now(),
    });
    assert.equal(vertex.status, 503);
    assert.equal(vertex.body.error, 'REAL_PROVIDER_UNAVAILABLE');
    assert.equal(vertex.body.status, undefined);
    assert.equal(vertex.body.url, undefined);

    const codex = await request('POST', '/api/native-media/v1/generations', {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'codex should not fake complete',
      clientRequestId: 'server-codex-fake-' + Date.now(),
    });
    assert.equal(codex.status, 503);
    assert.equal(codex.body.error, 'REAL_PROVIDER_UNAVAILABLE');
    assert.equal(codex.body.status, undefined);
    assert.equal(codex.body.url, undefined);

    gateway.grokVideoProvider.runGrokVideoProvider = async (_job, _clean, api) => {
      ranGrok = true;
      const child = new EventEmitter();
      child.pid = 987654321;
      child.kill = () => false;
      api.register(child, {
        outputPath: path.join(TEST_ROOT, 'tmp', 'fake-grok-output.mp4'),
        expectedMime: 'video/mp4',
        timeoutMs: 1000,
      });
      return { child, outputPath: path.join(TEST_ROOT, 'tmp', 'fake-grok-output.mp4'), expectedMime: 'video/mp4' };
    };
    const upload = await gateway.uploadAsset({ bytes: PNG_1X1, mime: 'image/png' });
    const grok = await request('POST', '/api/native-media/v1/generations', {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt: 'grok should be live',
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: upload.assetId, role: 'first-frame' }],
      clientRequestId: 'server-grok-live-' + Date.now(),
    });
    assert.equal(grok.status, 201);
    assert.equal(grok.body.status, 'running');
    assert.equal(ranGrok, true);
    assert.equal((await gateway.getGeneration(grok.body.id)).subprocessProvider, 'grok');
  } finally {
    gateway.grokVideoProvider.runGrokVideoProvider = originalRunGrok;
    delete process.env.NATIVE_MEDIA_LIVE_GROK;
  }
});

test('POST generations returns bad request for null or malformed bodies', async () => {
  const empty = await request('POST', '/api/native-media/v1/generations', null);
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, 'BAD_REQUEST');

  const malformed = await request('POST', '/api/native-media/v1/generations', '{');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, 'BAD_REQUEST');
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
