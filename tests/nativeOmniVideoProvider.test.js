'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `omni-video-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;
delete process.env.NATIVE_MEDIA_LIVE_OMNI;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;
const omni = require('../native-media-gateway/omniVideoProvider.js');
const { handleNativeRequest, publicJob } = require('../native-media-gateway/server.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const MP4_STUB = Buffer.from('00000018667479706d703432000000006d70343269736f6d000000086d646174', 'hex');

function setLiveGate(on) {
  if (on) process.env.NATIVE_MEDIA_LIVE_OMNI = '1';
  else delete process.env.NATIVE_MEDIA_LIVE_OMNI;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollStatus(id, predicate, { timeoutMs = 4000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await gateway.getGeneration(id);
    if (job && predicate(job)) return job;
    await sleep(intervalMs);
  }
  throw new Error(`pollStatus timed out for job ${id}`);
}

async function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const res = {
    statusCode: 0,
    body: null,
    writeHead(status) {
      this.statusCode = status;
    },
    end(bodyBytes) {
      this.body = bodyBytes ? Buffer.from(bodyBytes).toString('utf8') : '';
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

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = Math.floor(Math.random() * 1e6) + 1000;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.kill = () => {
      this.emit('exit', 143, 'SIGTERM');
      return true;
    };
  }
}

function fakeOmniSpawn({ writeMp4 = true, exitCode = 0, delayMs = 15, stderrText = '', stdoutText = '', timeout = false } = {}) {
  return (_cmd, argv) => {
    const child = new FakeChild();
    if (timeout) {
      child.kill = () => false;
      return child;
    }
    const outIdx = argv.indexOf('--output');
    const outputPath = outIdx >= 0 ? argv[outIdx + 1] : null;
    const timer = setTimeout(() => {
      if (stderrText) child.stderr.emit('data', Buffer.from(stderrText));
      if (writeMp4 && outputPath) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, MP4_STUB);
        child.stdout.emit('data', Buffer.from(stdoutText || `MEDIA:${outputPath}\n`));
      } else if (stdoutText) {
        child.stdout.emit('data', Buffer.from(stdoutText));
      }
      child.emit('exit', exitCode, null);
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    return child;
  };
}

async function uploadImage() {
  const asset = await gateway.uploadAsset({ bytes: PNG_1X1, mime: 'image/png' });
  const full = await gateway.getAsset(asset.assetId);
  return { ...asset, path: full.path };
}

test.afterEach(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  setLiveGate(false);
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('Omni model is registered under provider key omni and live gate is explicit', () => {
  assert.equal(gateway.providerFor('native.vertex.gemini-omni-flash-preview'), 'omni');
  assert.equal(omni.isOmniVideoModel('native.vertex.gemini-omni-flash-preview'), true);
  assert.equal(omni.liveOmniEnabled(), false);
  setLiveGate(true);
  assert.equal(omni.liveOmniEnabled(), true);
  const model = gateway.getNativeCapabilities().models.find((m) => m.id === 'native.vertex.gemini-omni-flash-preview');
  assert.deepEqual(model.tasks, ['text-to-video', 'image-to-video']);
  assert.equal(gateway.PROVIDER_CONCURRENCY.omni, 1);
});

test('buildOmniVideoArgs maps prompt, duration, aspect ratio, image and video refs', () => {
  const args = omni.buildOmniVideoArgs({
    modelId: 'native.vertex.gemini-omni-flash-preview',
    task: 'image-to-video',
    prompt: 'create video',
    parameters: { durationSeconds: 6, aspectRatio: '9:16' },
    outputPath: '/tmp/out.mp4',
    inputPaths: [
      { path: '/tmp/a.png', mime: 'image/png', assetId: 'a' },
      { path: '/tmp/b.mp4', mime: 'video/mp4', assetId: 'b' },
    ],
  });
  assert.equal(args[0], omni.OMNI_VIDEO_SCRIPT);
  assert.equal(args[args.indexOf('--prompt') + 1], 'create video');
  assert.equal(args[args.indexOf('--duration') + 1], '6');
  assert.equal(args[args.indexOf('--aspect-ratio') + 1], '9:16');
  assert.equal(args[args.indexOf('--input-image') + 1], '/tmp/a.png');
  assert.equal(args[args.indexOf('--input-video') + 1], '/tmp/b.mp4');
});

test('server rejects Omni when live gate is off without fake-completing a gallery result', async () => {
  const res = await request('POST', '/api/native-media/v1/generations', {
    modelId: 'native.vertex.gemini-omni-flash-preview',
    task: 'text-to-video',
    prompt: 'must fail closed',
    clientRequestId: 'omni-gate-off-' + Date.now(),
  });
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'REAL_PROVIDER_UNAVAILABLE');
  assert.equal(res.body.status, undefined);
  assert.equal(res.body.url, undefined);
  const library = await request('GET', '/api/native-media/v1/library?kind=video');
  assert.deepEqual(library.body.items, []);
});

test('gateway fake:false without live Omni runner persists REAL_PROVIDER_UNAVAILABLE safely', async () => {
  let jobId;
  await assert.rejects(
    () => gateway.submitGeneration(
      {
        modelId: 'native.vertex.gemini-omni-flash-preview',
        task: 'text-to-video',
        prompt: 'no runner',
        parameters: { durationSeconds: 6, aspectRatio: '16:9' },
        clientRequestId: 'omni-no-runner-' + Date.now(),
      },
      {
        liveOmni: true,
        provider: { fake: false },
        onEvent: (event) => {
          if (event && event.type === 'job_created') jobId = event.jobId;
        },
      }
    ),
    /real provider requested/
  );
  const failed = await gateway.getGeneration(jobId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'REAL_PROVIDER_UNAVAILABLE');
  assert.equal(publicJob(failed).message, 'Native provider unavailable.');
  assert.equal(publicJob(failed).prompt, 'no runner');
  assert.equal(publicJob(failed).parameters, undefined);
  assert.equal(publicJob(failed).inputs, undefined);
  assert.equal(publicJob(failed).detail, undefined);
  assert.equal(failed.url, undefined);
});

test('gateway imports completed Omni output as same-origin MP4 asset', async () => {
  setLiveGate(true);
  const start = await uploadImage();
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.gemini-omni-flash-preview',
      task: 'image-to-video',
      prompt: 'complete',
      parameters: { durationSeconds: 6, aspectRatio: '16:9' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'reference' }],
      clientRequestId: 'omni-complete-' + Date.now(),
    },
    { liveOmni: true, provider: { fake: false }, spawn: fakeOmniSpawn({ writeMp4: true }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.provider, 'omni');
  assert.equal(settled.expectedMime, 'video/mp4');
  assert.match(settled.url, /^\/api\/native-media\/v1\/assets\//);
  const publicSettled = publicJob(settled);
  assert.equal(publicSettled.prompt, 'complete');
  assert.equal(publicSettled.parameters, undefined);
  assert.equal(publicSettled.inputs, undefined);
  assert.equal(publicSettled.jobId || publicSettled.id, settled.id);
});

test('Omni unsupported input persists specific validation message', async () => {
  setLiveGate(true);
  let jobId;
  await assert.rejects(
    () => gateway.submitGeneration(
      {
        modelId: 'native.vertex.gemini-omni-flash-preview',
        task: 'text-to-video',
        prompt: 'bad duration',
        parameters: { durationSeconds: 99, aspectRatio: '16:9' },
        clientRequestId: 'omni-unsupported-' + Date.now(),
      },
      {
        liveOmni: true,
        provider: { fake: false },
        spawn: fakeOmniSpawn(),
        onEvent: (event) => {
          if (event && event.type === 'job_created') jobId = event.jobId;
        },
      }
    ),
    /unsupported Omni duration: 99/
  );
  const failed = await gateway.getGeneration(jobId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'OMNI_UNSUPPORTED_INPUT');
  assert.equal(failed.message, 'unsupported Omni duration: 99');
  assert.equal(publicJob(failed).message, failed.message);
  assert.equal(publicJob(failed).prompt, 'bad duration');
  assert.equal(failed.url, undefined);
  const jobs = (await gateway.listLibrary({ kind: 'video' })).items;
  assert.equal(jobs.some((job) => job.id === failed.id), false);
});

test('Omni nonzero, missing output, and timeout persist distinct safe errors', async () => {
  setLiveGate(true);
  const cases = [
    {
      id: 'nonzero',
      spawn: fakeOmniSpawn({ writeMp4: false, exitCode: 1, stderrText: 'RESOURCE_EXHAUSTED quota exceeded' }),
      expected: 'OMNI_QUOTA_OR_RATE_LIMIT',
    },
    {
      id: 'missing',
      spawn: fakeOmniSpawn({ writeMp4: false, exitCode: 0 }),
      expected: 'OMNI_OUTPUT_MISSING',
    },
    {
      id: 'timeout',
      spawn: fakeOmniSpawn({ timeout: true }),
      expected: 'OMNI_PROVIDER_TIMEOUT',
      timeoutMs: 1000,
    },
  ];
  for (const c of cases) {
    const job = await gateway.submitGeneration(
      {
        modelId: 'native.vertex.gemini-omni-flash-preview',
        task: 'text-to-video',
        prompt: c.id,
        parameters: { durationSeconds: 6, aspectRatio: '16:9' },
        clientRequestId: `omni-${c.id}-${Date.now()}`,
      },
      { liveOmni: true, provider: { fake: false }, spawn: c.spawn, timeoutMs: c.timeoutMs }
    );
    const settled = await pollStatus(job.id, (j) => j.status === 'failed');
    assert.equal(settled.error, c.expected);
    assert.ok(settled.message);
    assert.equal(settled.url, undefined);
    assert.equal(publicJob(settled).detail, undefined);
    assert.equal(publicJob(settled).omniDiagnostics, undefined);
    assert.equal(publicJob(settled).message, settled.message);
  }
});
