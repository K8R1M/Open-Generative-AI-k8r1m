'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `validation-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;
delete process.env.NATIVE_MEDIA_LIVE_GROK;
delete process.env.NATIVE_MEDIA_LIVE_OMNI;

const gateway = require('../native-media-gateway/exports.js');
const { createServer } = require('../native-media-gateway/server.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function postJson(base, pathName, body) {
  const res = await fetch(`${base}${pathName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.afterEach(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
  delete process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES;
});

test('validation errors pass through real request messages', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${port}`;

  const upload = await gateway.uploadAsset({ bytes: PNG_1X1, mime: 'image/png' });
  const i2v = await postJson(base, '/api/native-media/v1/generations', {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'image-to-video',
    prompt: '',
    parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
    inputs: [{ kind: 'asset', assetId: upload.assetId, role: 'first-frame' }],
  });
  assert.equal(i2v.status, 201);
  assert.ok(i2v.body.id);

  const t2v = await postJson(base, '/api/native-media/v1/generations', {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: '',
    parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
  });
  assert.equal(t2v.status, 400);
  assert.equal(t2v.body.message, 'prompt is required');

  process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES = 'true';
  const combo = await postJson(base, '/api/native-media/v1/generations', {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'image-to-video',
    prompt: 'animate',
    parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '720p' },
    inputs: [
      { kind: 'asset', assetId: upload.assetId, role: 'first-frame' },
      { kind: 'asset', assetId: upload.assetId, role: 'reference' },
    ],
  });
  assert.equal(combo.status, 400);
  assert.equal(combo.body.message, 'Veo reference images cannot be combined with a first or last frame');

  const wrongAspect = await postJson(base, '/api/native-media/v1/generations', {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'image-to-video',
    prompt: 'animate',
    parameters: { durationSeconds: 8, aspectRatio: '9:16', resolution: '720p' },
    inputs: [{ kind: 'asset', assetId: upload.assetId, role: 'reference' }],
  });
  assert.equal(wrongAspect.status, 400);
  assert.equal(wrongAspect.body.message, 'Veo reference images require 16:9 aspect ratio');
});

test('upload validation rejects empty, oversized, and unsupported files with contract messages', () => {
  assert.throws(
    () => gateway.validateUpload(Buffer.alloc(0), 'image/png'),
    (err) => err.nativeMediaStatus === 400 && err.nativeMediaBody.message === 'upload file is empty'
  );
  assert.throws(
    () => gateway.validateUpload({ length: 250 * 1024 * 1024 + 1 }, 'image/png'),
    (err) => err.nativeMediaStatus === 400 && err.nativeMediaBody.message === 'upload exceeds 250MB limit'
  );
  assert.throws(
    () => gateway.validateUpload(Buffer.from('gif89a'), 'image/gif'),
    (err) => err.nativeMediaStatus === 400 && /allowed: png, jpeg, webp, mp4/.test(err.nativeMediaBody.message)
  );
});

test('capabilities reflect the Veo reference-image gateway flag per request', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${port}`;

  delete process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES;
  const off = await fetch(`${base}/api/native-media/v1/capabilities`).then((r) => r.json());
  assert.equal(off.constraints.veoMaxReferenceImages, 0);

  process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES = 'true';
  const on = await fetch(`${base}/api/native-media/v1/capabilities`).then((r) => r.json());
  assert.equal(on.constraints.veoMaxReferenceImages, 3);
});

test('video provider arg builders omit empty prompts', () => {
  const vertexArgs = gateway.vertexVideoProvider.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'image-to-video',
    prompt: '',
    parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '720p' },
    inputPaths: [{ role: 'reference', path: '/tmp/ref.png' }],
    outputPath: '/tmp/out.mp4',
  });
  assert.equal(vertexArgs.includes('--prompt'), false);

  const grokArgs = gateway.grokVideoProvider.buildGrokVideoArgs({
    modelId: 'native.grok.imagine-video',
    task: 'image-to-video',
    prompt: '',
    parameters: { durationSeconds: 6, resolution: '480p' },
    inputPaths: [{ path: '/tmp/ref.png', mime: 'image/png', assetId: 'asset-ref', role: 'first-frame' }],
    outputPath: '/tmp/out.mp4',
  });
  assert.equal(grokArgs.includes('--prompt'), false);

  const omniArgs = gateway.omniVideoProvider.buildOmniVideoArgs({
    modelId: 'native.vertex.gemini-omni-flash-preview',
    task: 'image-to-video',
    prompt: '',
    parameters: { durationSeconds: 6, aspectRatio: '16:9' },
    inputPaths: [{ path: '/tmp/ref.mp4', mime: 'video/mp4', assetId: 'asset-ref' }],
    outputPath: '/tmp/out.mp4',
  });
  assert.equal(omniArgs.includes('--prompt'), false);
});
