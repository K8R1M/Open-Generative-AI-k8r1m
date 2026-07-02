'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

process.env.NATIVE_MEDIA_ROOT = path.join(process.cwd(), '.native-media-test', `health-${process.pid}`);

const { createServer } = require('../native-media-gateway/server.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

test('native gateway health exposes boot fingerprint', async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(process.env.NATIVE_MEDIA_ROOT, { recursive: true, force: true });
  });

  const res = await fetch(`http://127.0.0.1:${port}/api/native-media/v1/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'native-media');
  assert.equal(body.pid, process.pid);
  assert.equal(typeof body.sourceFingerprint, 'number');
  assert.ok(body.sourceFingerprint > 0);
  assert.ok(Number.isFinite(Date.parse(body.startedAt)));
  assert.equal(typeof body.port, 'number');
});
