'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

process.env.NATIVE_MEDIA_ROOT = path.join(process.cwd(), '.native-media-test', `server-${process.pid}`);
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;

const { createServer } = require('../native-media-gateway/server.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

test('native gateway loopback server exposes public generation responses only', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(process.env.NATIVE_MEDIA_ROOT, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/native-media/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'native-media');

  const res = await fetch(`${base}/api/native-media/v1/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'loopback fake only',
    }),
  });
  assert.equal(res.status, 201);
  const job = await res.json();
  assert.equal(job.status, 'completed');
  assert.match(job.url, /^\/api\/native-media\/v1\/assets\//);
  for (const field of ['outputPath', 'detail', 'pid', 'pgid', 'subprocessProvider', 'providerConfig']) {
    assert.equal(Object.hasOwn(job, field), false, `${field} must not be public`);
  }
});

test('native gateway support for range and suffix range requests', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(process.env.NATIVE_MEDIA_ROOT, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;

  // Submit a generation to create an asset
  const res = await fetch(`${base}/api/native-media/v1/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'range testing asset',
    }),
  });
  assert.equal(res.status, 201);
  const job = await res.json();
  assert.equal(job.status, 'completed');
  const assetUrl = `${base}${job.url}`;

  // 1. Full asset request
  const fullRes = await fetch(assetUrl);
  assert.equal(fullRes.status, 200);
  assert.equal(fullRes.headers.get('accept-ranges'), 'bytes');
  const fullBody = Buffer.from(await fullRes.arrayBuffer());
  const size = fullBody.length;
  assert.ok(size > 0);

  // 2. Normal range request: first 10 bytes (0-9)
  const rangeRes1 = await fetch(assetUrl, {
    headers: { 'range': 'bytes=0-9' },
  });
  assert.equal(rangeRes1.status, 206);
  assert.equal(rangeRes1.headers.get('content-range'), `bytes 0-9/${size}`);
  assert.equal(rangeRes1.headers.get('content-length'), '10');
  const body1 = Buffer.from(await rangeRes1.arrayBuffer());
  assert.equal(body1.length, 10);
  assert.deepEqual(body1, fullBody.subarray(0, 10));

  // 3. Prefix range request: bytes from index 10 to end
  const rangeRes2 = await fetch(assetUrl, {
    headers: { 'range': `bytes=10-` },
  });
  assert.equal(rangeRes2.status, 206);
  assert.equal(rangeRes2.headers.get('content-range'), `bytes 10-${size - 1}/${size}`);
  assert.equal(rangeRes2.headers.get('content-length'), String(size - 10));
  const body2 = Buffer.from(await rangeRes2.arrayBuffer());
  assert.equal(body2.length, size - 10);
  assert.deepEqual(body2, fullBody.subarray(10));

  // 4. Suffix range request: last 10 bytes
  const suffixRes = await fetch(assetUrl, {
    headers: { 'range': 'bytes=-10' },
  });
  assert.equal(suffixRes.status, 206);
  assert.equal(suffixRes.headers.get('content-range'), `bytes ${size - 10}-${size - 1}/${size}`);
  assert.equal(suffixRes.headers.get('content-length'), '10');
  const suffixBody = Buffer.from(await suffixRes.arrayBuffer());
  assert.equal(suffixBody.length, 10);
  assert.deepEqual(suffixBody, fullBody.subarray(size - 10));

  // 5. Out-of-bounds/invalid range: start >= size
  const invalidRangeRes1 = await fetch(assetUrl, {
    headers: { 'range': `bytes=${size}-` },
  });
  assert.equal(invalidRangeRes1.status, 416);
  assert.equal(invalidRangeRes1.headers.get('content-range'), `bytes */${size}`);

  // 6. Zero or invalid suffix range: bytes=-0 or invalid digit
  const invalidSuffixRes = await fetch(assetUrl, {
    headers: { 'range': 'bytes=-0' },
  });
  assert.equal(invalidSuffixRes.status, 416);
  assert.equal(invalidSuffixRes.headers.get('content-range'), `bytes */${size}`);

  const invalidSuffixResAbc = await fetch(assetUrl, {
    headers: { 'range': 'bytes=-abc' },
  });
  assert.equal(invalidSuffixResAbc.status, 416);
  assert.equal(invalidSuffixResAbc.headers.get('content-range'), `bytes */${size}`);

  const invalidSuffixResEmpty = await fetch(assetUrl, {
    headers: { 'range': 'bytes=-' },
  });
  assert.equal(invalidSuffixResEmpty.status, 416);
  assert.equal(invalidSuffixResEmpty.headers.get('content-range'), `bytes */${size}`);
});

test('native gateway handles stale or missing files safely without crash', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(process.env.NATIVE_MEDIA_ROOT, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;

  // Submit a generation to create an asset
  const res = await fetch(`${base}/api/native-media/v1/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'volatile asset',
    }),
  });
  assert.equal(res.status, 201);
  const job = await res.json();
  const assetUrl = `${base}${job.url}`;

  // Verify full asset is 200 first
  const initialRes = await fetch(assetUrl);
  assert.equal(initialRes.status, 200);

  // Now, find the actual file on disk and delete it!
  const assetId = job.url.split('/').pop();
  const assetDir = path.join(process.env.NATIVE_MEDIA_ROOT, 'assets', assetId);
  const meta = JSON.parse(await fsp.readFile(path.join(assetDir, 'meta.json'), 'utf8'));
  const filePath = meta.path;

  // Let's delete the file on disk (make it missing/stale)
  await fsp.rm(filePath, { force: true });

  // Fetching the asset now should safely produce a 404 response
  const missingRes = await fetch(assetUrl);
  assert.equal(missingRes.status, 404);

  // Non-existent asset ID should also safely produce 404
  const nonExistentRes = await fetch(`${base}/api/native-media/v1/assets/asset-ghost`);
  assert.equal(nonExistentRes.status, 404);
});
