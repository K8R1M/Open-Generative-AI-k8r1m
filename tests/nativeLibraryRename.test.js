'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `library-rename-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const { handleNativeRequest } = require('../native-media-gateway/server.js');

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

test.afterEach(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test.after(async () => {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('PATCH /library/:id renames completed jobs and can rename again', async () => {
  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'rename me',
  });

  const first = await request('PATCH', `/api/native-media/v1/library/${job.id}`, { displayName: 'folder/Scene 🎬 01.png' });
  assert.equal(first.status, 200);
  assert.equal(first.body.displayName, 'folder-Scene-01');
  assert.equal(first.body.downloadName, 'folder-Scene-01');
  assert.equal(first.body.outputPath, undefined);

  const second = await request('PATCH', `/api/native-media/v1/library/${job.id}`, { displayName: 'Scene_02' });
  assert.equal(second.status, 200);
  assert.equal(second.body.displayName, 'Scene_02');

  const stored = await gateway.getGeneration(job.id);
  assert.equal(stored.displayName, 'Scene_02');
  assert.equal(stored.downloadName, 'Scene_02');
  assert.equal(typeof stored.updatedAt, 'string');
});

test('PATCH /library/:id rejects unknown, tombstoned, and invalid display names', async () => {
  const unknown = await request('PATCH', '/api/native-media/v1/library/job-missing', { displayName: 'Name' });
  assert.equal(unknown.status, 404);

  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'delete me',
  });
  await gateway.deleteLibraryJob(job.id);
  const tombstoned = await request('PATCH', `/api/native-media/v1/library/${job.id}`, { displayName: 'Name' });
  assert.equal(tombstoned.status, 409);
  assert.equal(tombstoned.body.error, 'CONFLICT');

  const tooLong = await request('PATCH', `/api/native-media/v1/library/${job.id}`, { displayName: 'x'.repeat(121) });
  assert.equal(tooLong.status, 400);

  const empty = await request('PATCH', `/api/native-media/v1/library/${job.id}`, { displayName: '🎬' });
  assert.equal(empty.status, 400);
});
