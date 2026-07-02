'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `frame-from-job-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const { handleNativeRequest } = require('../native-media-gateway/server.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const MP4 = Buffer.from('00000020667479706d703432000000006d70343269736f6d000000086d646174', 'hex');

async function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(body = '') {
      this.body = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
      this.resolve();
    },
  };
  const done = new Promise((resolve) => {
    res.resolve = resolve;
  });
  handleNativeRequest(req, res);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  await done;
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function seedVideoJob(id = 'job-video') {
  await fsp.mkdir(path.join(TEST_ROOT, 'assets', 'asset-video'), { recursive: true });
  const file = path.join(TEST_ROOT, 'assets', 'asset-video', 'data.mp4');
  await fsp.writeFile(file, MP4);
  await fsp.writeFile(path.join(TEST_ROOT, 'assets', 'asset-video', 'meta.json'), JSON.stringify({
    id: 'asset-video',
    assetId: 'asset-video',
    mime: 'video/mp4',
    path: file,
    url: '/api/native-media/v1/assets/asset-video',
    createdAt: '2026-07-01T00:00:00.000Z',
  }, null, 2));
  await fsp.mkdir(TEST_ROOT, { recursive: true });
  await fsp.writeFile(path.join(TEST_ROOT, 'jobs.json'), JSON.stringify({
    [id]: {
      id,
      request_id: id,
      status: 'completed',
      task: 'image-to-video',
      modelId: 'native.grok.imagine-video',
      assetId: 'asset-video',
      url: '/api/native-media/v1/assets/asset-video',
      outputs: ['/api/native-media/v1/assets/asset-video'],
      completedAt: '2026-07-01T00:00:00.000Z',
      native: true,
    },
  }, null, 2));
  await fsp.writeFile(path.join(TEST_ROOT, 'idempotency.json'), '{}');
  return id;
}

test.afterEach(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  delete process.env.NATIVE_MEDIA_PROJECTS;
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test.after(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('POST /projects/frame-from-job is gated off unless projects are enabled', async () => {
  const jobId = await seedVideoJob();
  const res = await request('POST', '/api/native-media/v1/projects/frame-from-job', { jobId });
  assert.equal(res.status, 404);
});

test('POST /projects/frame-from-job saves extracted last frame as a derived asset', async (t) => {
  process.env.NATIVE_MEDIA_PROJECTS = '1';
  const jobId = await seedVideoJob();
  const originalSpawn = childProcess.spawn;
  t.after(() => {
    childProcess.spawn = originalSpawn;
  });
  childProcess.spawn = (_command, args) => {
    const child = new EventEmitter();
    child.kill = () => true;
    process.nextTick(async () => {
      await fsp.writeFile(args[2], PNG);
      child.emit('close', 0);
    });
    return child;
  };

  const res = await request('POST', '/api/native-media/v1/projects/frame-from-job', { jobId });
  assert.equal(res.status, 201);
  assert.match(res.body.assetId, /^asset-/);
  assert.equal(res.body.url, `/api/native-media/v1/assets/${res.body.assetId}`);
  assert.equal(res.body.mime, 'image/png');

  const asset = await gateway.getAsset(res.body.assetId);
  assert.equal(asset.mime, 'image/png');
  assert.deepEqual(await fsp.readFile(asset.path), PNG);
  const meta = JSON.parse(await fsp.readFile(path.join(path.dirname(asset.path), 'meta.json'), 'utf8'));
  assert.deepEqual(meta.derivedFrom, { jobId, kind: 'last-frame' });
});

test('POST /projects/frame-from-job rejects invalid helper bytes without saving an asset', async (t) => {
  process.env.NATIVE_MEDIA_PROJECTS = '1';
  const jobId = await seedVideoJob();
  const originalSpawn = childProcess.spawn;
  t.after(() => {
    childProcess.spawn = originalSpawn;
  });
  childProcess.spawn = (_command, args) => {
    const child = new EventEmitter();
    child.kill = () => true;
    process.nextTick(async () => {
      await fsp.writeFile(args[2], Buffer.from('not-a-png'));
      child.emit('close', 0);
    });
    return child;
  };

  const before = await fsp.readdir(path.join(TEST_ROOT, 'assets'));
  const res = await request('POST', '/api/native-media/v1/projects/frame-from-job', { jobId });
  const after = await fsp.readdir(path.join(TEST_ROOT, 'assets'));

  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'FRAME_EXTRACTION_FAILED');
  assert.deepEqual(after.sort(), before.sort());
});

test('POST /projects/frame-from-job rejects unknown and non-video jobs', async () => {
  process.env.NATIVE_MEDIA_PROJECTS = '1';
  assert.equal((await request('POST', '/api/native-media/v1/projects/frame-from-job', { jobId: 'job-missing' })).status, 404);

  const imageJob = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'not video',
  });
  const nonVideo = await request('POST', '/api/native-media/v1/projects/frame-from-job', { jobId: imageJob.id });
  assert.equal(nonVideo.status, 400);
});
