// C6 contract test — Vertex video provider adapter around the existing
// Native media `genai-video` wrapper. Uses fake subprocesses only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `vertex-video-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;
const vertex = require('../native-media-gateway/vertexVideoProvider.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const JPEG_MIN = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const MP4_STUB = Buffer.from('00000018667479706d703432000000006d70343269736f6d000000086d646174', 'hex');

const ORIG_LIVE_GATE = process.env.NATIVE_MEDIA_LIVE_VERTEX;
const ORIG_REFERENCE_GATE = process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES;

function setLiveGate(on) {
  if (on) process.env.NATIVE_MEDIA_LIVE_VERTEX = '1';
  else delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollStatus(id, predicate, { timeoutMs = 4000, intervalMs = 30 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await gateway.getGeneration(id);
    if (job && predicate(job)) return job;
    await sleep(intervalMs);
  }
  throw new Error(`pollStatus timed out for job ${id}`);
}

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timed out');
}

async function uploadAsset(bytes, mime) {
  const asset = await gateway.uploadAsset({ bytes, mime });
  const full = await gateway.getAsset(asset.assetId);
  return { assetId: asset.assetId, mime, path: full.path };
}

class FakeChild extends EventEmitter {
  constructor(argv, opts) {
    super();
    this.pid = Math.floor(Math.random() * 1e6) + 1000;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.argv = argv;
    this.opts = opts;
    this.killed = false;
    this.kill = (signal) => {
      this.killed = true;
      this.killSignal = signal;
      return true;
    };
  }
}

function fakeSpawn({ writeMp4 = true, exitCode = 0, delayMs = 20, mediaBasename = null, emitMedia = true, writeRequestedMp4 = false, stderrText = null }) {
  return (cmd, argv, opts) => {
    const child = new FakeChild(argv, opts);
    const outIdx = argv.indexOf('--output');
    const requestedOutput = outIdx >= 0 ? argv[outIdx + 1] : null;
    const outputPath = mediaBasename && requestedOutput
      ? path.join(path.dirname(requestedOutput), mediaBasename)
      : requestedOutput;
    const timer = setTimeout(() => {
      try {
        if (stderrText && child.stderr) child.stderr.emit('data', Buffer.from(stderrText));
        if (writeMp4 && outputPath) {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          if (writeRequestedMp4 && requestedOutput && requestedOutput !== outputPath) fs.writeFileSync(requestedOutput, MP4_STUB);
          fs.writeFileSync(outputPath, MP4_STUB);
          if (emitMedia && child.stdout) child.stdout.emit('data', Buffer.from(`MEDIA:${outputPath}\n`));
        }
      } catch {
        /* best effort */
      }
      child.emit('exit', exitCode, null);
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    return child;
  };
}

test.afterEach(async () => {
  scheduler.disposeAll();
  scheduler.reset();
  if (ORIG_LIVE_GATE === undefined) delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
  else process.env.NATIVE_MEDIA_LIVE_VERTEX = ORIG_LIVE_GATE;
  if (ORIG_REFERENCE_GATE === undefined) delete process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES;
  else process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES = ORIG_REFERENCE_GATE;
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('buildVertexVideoArgs: prompt-only T2V maps to fixed wrapper flags', () => {
  const argv = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: 'waves on a beach',
    parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', audio: true },
    outputPath: '/abs/out.mp4',
  });
  assert.equal(argv[0], vertex.VERTEX_VIDEO_SCRIPT);
  assert.equal(argv[argv.indexOf('--model') + 1], 'veo-3.1-fast');
  assert.equal(argv[argv.indexOf('--duration') + 1], '4');
  assert.equal(argv[argv.indexOf('--aspect-ratio') + 1], '16:9');
  assert.equal(argv[argv.indexOf('--resolution') + 1], '720p');
  assert.equal(argv[argv.indexOf('--output') + 1], '/abs/out.mp4');
  assert.ok(!argv.includes('--no-audio'), '--no-audio must not be sent when audio is enabled');
});

test('buildVertexVideoArgs: maps Veo aliases and includes --no-audio only for audio false', () => {
  const pro = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1',
    task: 'text-to-video',
    prompt: 'p',
    parameters: { durationSeconds: 8, audio: false },
    outputPath: '/o.mp4',
  });
  assert.equal(pro[pro.indexOf('--model') + 1], 'veo-3.1');
  assert.ok(pro.includes('--no-audio'));

  const omitted = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: 'p',
    parameters: { durationSeconds: 8 },
    outputPath: '/o.mp4',
  });
  assert.ok(!omitted.includes('--no-audio'));
});

test('buildVertexVideoArgs: I2V frame mode and reference mode preserve order', () => {
  const argv = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1',
    task: 'image-to-video',
    prompt: 'animate',
    parameters: { durationSeconds: 8, aspectRatio: '9:16', resolution: '1080p' },
    outputPath: '/o.mp4',
    inputPaths: [
      { role: 'start', path: '/start.png' },
      { role: 'last', path: '/end.png' },
    ],
  });
  assert.equal(argv[argv.indexOf('--input-image') + 1], '/start.png');
  assert.equal(argv[argv.indexOf('--last-frame') + 1], '/end.png');
  assert.equal(argv.includes('--reference-image'), false);

  const refs = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1',
    task: 'image-to-video',
    prompt: 'animate',
    parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '1080p' },
    outputPath: '/o.mp4',
    inputPaths: [
      { role: 'reference', path: '/ref-a.png' },
      { role: 'reference', path: '/ref-b.png' },
    ],
  });
  const refIdxs = [];
  for (let i = 0; i < refs.length; i++) if (refs[i] === '--reference-image') refIdxs.push(i);
  assert.deepEqual(refIdxs.map((i) => refs[i + 1]), ['/ref-a.png', '/ref-b.png']);
});

test('buildVertexVideoArgs: rejects unsupported model, task, duration, and last frame without start', () => {
  assert.throws(
    () => vertex.buildVertexVideoArgs({ modelId: 'native.vertex.nano-banana-pro', task: 'text-to-video', prompt: 'p', parameters: { durationSeconds: 4 }, outputPath: '/o.mp4' }),
    /unsupported Vertex video model/
  );
  assert.throws(
    () => vertex.buildVertexVideoArgs({ modelId: 'native.vertex.veo-3.1', task: 'text-to-image', prompt: 'p', parameters: { durationSeconds: 4 }, outputPath: '/o.mp4' }),
    /unsupported Vertex video task/
  );
  assert.throws(
    () => vertex.buildVertexVideoArgs({ modelId: 'native.vertex.veo-3.1', task: 'text-to-video', prompt: 'p', parameters: { durationSeconds: 5 }, outputPath: '/o.mp4' }),
    /unsupported Veo duration/
  );
  assert.throws(
    () => vertex.buildVertexVideoArgs({
      modelId: 'native.vertex.veo-3.1',
      task: 'image-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 8 },
      outputPath: '/o.mp4',
      inputPaths: [{ role: 'last', path: '/end.png' }],
    }),
    /last frame requires a start frame/
  );
  assert.throws(
    () => vertex.buildVertexVideoArgs({
      modelId: 'native.vertex.veo-3.1',
      task: 'image-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4 },
      outputPath: '/o.mp4',
      inputPaths: [
        { role: 'start', path: '/start.png' },
        { role: 'last', path: '/end.png' },
      ],
    }),
    /last frame requires 8s duration/
  );
});

test('validateVertexVideoInputs: rejects unsafe inputs before provider calls', async () => {
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: [{ kind: 'url', url: 'http://internal/ref.png', role: 'first-frame' }],
      resolvedFiles: [],
      parameters: { durationSeconds: 8 },
    }),
    /asset references|external URLs|resolution mismatch/
  );
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: [{ kind: 'asset', assetId: 'a', role: 'first-frame' }],
      resolvedFiles: [{ role: 'start', path: '/a.mp4', mime: 'video/mp4', size: 100 }],
      parameters: { durationSeconds: 8 },
    }),
    /unsupported Vertex video input MIME type/
  );
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: [{ kind: 'asset', assetId: 'big', role: 'first-frame' }],
      resolvedFiles: [{ role: 'start', path: '/big.png', mime: 'image/png', size: vertex.CONSTRAINTS.inputMaxBytes + 1 }],
      parameters: { durationSeconds: 8 },
    }),
    /exceeds max bytes/
  );
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: [
        { kind: 'asset', assetId: 'start', role: 'first-frame' },
        { kind: 'asset', assetId: 'end', role: 'last-frame' },
      ],
      resolvedFiles: [
        { role: 'start', path: '/start.png', mime: 'image/png', size: 100 },
        { role: 'last', path: '/end.png', mime: 'image/png', size: 100 },
      ],
      parameters: { durationSeconds: 4 },
    }),
    /last frame requires 8s duration/
  );
});

test('validateVertexVideoInputs: enforces Veo reference gates', async () => {
  const refs = Array.from({ length: 4 }, (_, i) => ({ kind: 'asset', assetId: `r${i}`, role: 'reference' }));
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: refs,
      resolvedFiles: refs.map((r) => ({ role: 'reference', path: `/${r.assetId}.png`, mime: 'image/png', size: 100 })),
      parameters: { durationSeconds: 8 },
    }),
    /exceed maximum of 3/
  );
  await assert.rejects(
    () => vertex.validateVertexVideoInputs({
      task: 'image-to-video',
      inputs: [{ kind: 'asset', assetId: 'r', role: 'reference' }],
      resolvedFiles: [{ role: 'reference', path: '/r.png', mime: 'image/png', size: 100 }],
      parameters: { durationSeconds: 6 },
    }),
    /require 8s duration/
  );
});

test('resolveInputAssets: rejects path traversal and missing assets', async () => {
  const getAsset = async () => ({ path: '/x', mime: 'image/png' });
  await assert.rejects(
    () => vertex.resolveInputAssets([{ kind: 'asset', assetId: '../escape', role: 'first-frame' }], getAsset),
    /invalid native asset id/
  );
  await assert.rejects(
    () => vertex.resolveInputAssets([{ kind: 'asset', assetId: 'ghost', role: 'first-frame' }], async () => null),
    /not found/
  );
});

test('buildEnv forwards worker ADC without leaking other credentials and argv never carries credential paths', () => {
  const env = vertex.buildEnv({
    PATH: '/usr/bin',
    HOME: '/h',
    GOOGLE_APPLICATION_CREDENTIALS: '/secret/sa.json',
    NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS: '0',
    GEMINI_API_KEY: 'secret',
    GOOGLE_CLOUD_PROJECT: 'proj-x',
    RANDOM_BAD: 'nope',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/h');
  assert.equal(env.GOOGLE_CLOUD_PROJECT, 'proj-x');
  assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, '/secret/sa.json');
  assert.equal(env.NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS, '1');
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.RANDOM_BAD, undefined);

  const argv = vertex.buildVertexVideoArgs({
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: 'p',
    parameters: { durationSeconds: 4 },
    outputPath: '/o.mp4',
  });
  const joined = argv.join(' ');
  assert.ok(!argv.includes('--service-account'));
  assert.ok(!argv.includes('--credentials'));
  assert.ok(!argv.includes('--use-aistudio'));
  assert.ok(!/GOOGLE_APPLICATION_CREDENTIALS|\.json/i.test(joined));
});

test('buildEnv preserves explicit worker ADC allow marker when present', () => {
  const env = vertex.buildEnv({
    PATH: '/usr/bin',
    GOOGLE_CLOUD_PROJECT: 'proj-x',
    GOOGLE_APPLICATION_CREDENTIALS: '/service/accounts/native.json',
    NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS: '1',
    GEMINI_API_KEY: 'secret',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.GOOGLE_CLOUD_PROJECT, 'proj-x');
  assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, '/service/accounts/native.json');
  assert.equal(env.NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS, '1');
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test('live runner uses fixed python + script paths with shell:false', async () => {
  let captured;
  let registerMeta;
  const spawnProbe = (cmd, argv, opts) => {
    captured = { cmd, argv, opts };
    const child = new FakeChild(argv, opts);
    setTimeout(() => child.emit('exit', 0, null), 5);
    return child;
  };
  await vertex.runVertexVideoProvider(
    { id: 'probe-' + Date.now() },
    { modelId: 'native.vertex.veo-3.1-fast', task: 'text-to-video', prompt: 'p', parameters: { durationSeconds: 4 }, inputs: [] },
    {
      register: (_child, meta) => { registerMeta = meta; },
      getAsset: async () => null,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
    },
    { spawn: spawnProbe, env: { PATH: '/bin' }, python: '/tmp/browser-controlled-python' }
  );
  assert.equal(captured.cmd, vertex.VERTEX_VIDEO_PYTHON);
  assert.equal(captured.argv[0], vertex.VERTEX_VIDEO_SCRIPT);
  assert.equal(captured.opts.shell, false);
  assert.equal(captured.opts.detached, false);
  assert.deepEqual(captured.opts.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(registerMeta.killGroup, false);
  assert.equal(captured.opts.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(captured.opts.env.PATH, '/bin');
});

test('live runner forwards gateway service-account ADC env to the wrapper child', async () => {
  let captured;
  const spawnProbe = (cmd, argv, opts) => {
    captured = { cmd, argv, opts };
    const child = new FakeChild(argv, opts);
    setTimeout(() => child.emit('exit', 0, null), 5);
    return child;
  };
  await vertex.runVertexVideoProvider(
    { id: 'probe-adc-' + Date.now() },
    { modelId: 'native.vertex.veo-3.1-fast', task: 'text-to-video', prompt: 'p', parameters: { durationSeconds: 4 }, inputs: [] },
    {
      register: () => {},
      getAsset: async () => null,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
    },
    {
      spawn: spawnProbe,
      env: {
        PATH: '/bin',
        GOOGLE_CLOUD_PROJECT: 'proj-x',
        GOOGLE_APPLICATION_CREDENTIALS: '/service/accounts/native.json',
      },
    }
  );
  assert.equal(captured.opts.env.GOOGLE_APPLICATION_CREDENTIALS, '/service/accounts/native.json');
  assert.equal(captured.opts.env.NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS, '1');
  assert.equal(captured.opts.env.GOOGLE_CLOUD_PROJECT, 'proj-x');
});

test('runVertexVideoProvider redacts child env ADC path from failure detail', async () => {
  const rid = 'c6-stderr-adc-' + Date.now();
  const credentialPath = '/service/accounts/native.json';
  const settled = [];
  const ctx = {
    scheduler,
    tmpDir: path.join(TEST_ROOT, 'tmp'),
    getAsset: gateway.getAsset,
    register: (child, meta) =>
      scheduler.registerSubprocess(rid, {
        child,
        provider: 'vertex',
        outputPath: meta.outputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        resolveOutputPath: meta.resolveOutputPath,
        settlePatch: meta.settlePatch,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('vertex', id),
        onDrain: () => {},
      }),
  };
  await vertex.runVertexVideoProvider(
    { id: rid },
    { modelId: 'native.vertex.veo-3.1-fast', task: 'text-to-video', prompt: 'p', parameters: { durationSeconds: 4 }, inputs: [] },
    ctx,
    {
      spawn: fakeSpawn({ writeMp4: false, exitCode: 1, delayMs: 15, stderrText: `Vertex video error: ${credentialPath}` }),
      env: { GOOGLE_APPLICATION_CREDENTIALS: credentialPath },
    }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'INTERRUPTED_PROCESS');
  assert.doesNotMatch(settled[0].detail, new RegExp(credentialPath));
  assert.match(settled[0].detail, /<google-credentials>/);
});

test('default video wrapper paths are repo-local', () => {
  const forbidden = ['/home/k8r1m', 'merlin'].join('/');
  const forbiddenVenv = ['merlin', '.venv'].join('/');
  const forbiddenBin = ['merlin', 'bin'].join('/');
  assert.ok(vertex.VERTEX_VIDEO_PYTHON.endsWith(path.join('.native-media', 'venv', 'bin', 'python3')));
  assert.ok(vertex.VERTEX_VIDEO_SCRIPT.endsWith(path.join('native-media-gateway', 'bin', 'genai-video')));
  assert.ok(!vertex.VERTEX_VIDEO_PYTHON.includes(forbidden));
  assert.ok(!vertex.VERTEX_VIDEO_PYTHON.includes(forbiddenVenv));
  assert.ok(!vertex.VERTEX_VIDEO_PYTHON.includes(forbiddenBin));
  assert.ok(!vertex.VERTEX_VIDEO_SCRIPT.includes(forbidden));
  assert.ok(!vertex.VERTEX_VIDEO_SCRIPT.includes(forbiddenVenv));
  assert.ok(!vertex.VERTEX_VIDEO_SCRIPT.includes(forbiddenBin));
});

test('parseMediaStdout: extracts the MEDIA output path', () => {
  assert.equal(vertex.parseMediaStdout('noise\nMEDIA:/abs/out.mp4\ntail'), '/abs/out.mp4');
  assert.equal(vertex.parseMediaStdout('no media line'), null);
});

test('runVertexVideoProvider: I2V reference assets resolve and scheduler verifies MP4', async () => {
  const ref = await uploadAsset(PNG_1X1, 'image/png');
  const rid = 'c6-i2v-' + Date.now();
  let argvSeen;
  const settled = [];
  const spawnProbe = (cmd, argv, opts) => {
    argvSeen = argv;
    return fakeSpawn({ writeMp4: true, delayMs: 10 })(cmd, argv, opts);
  };
  await vertex.runVertexVideoProvider(
    { id: rid },
    {
      modelId: 'native.vertex.veo-3.1',
      task: 'image-to-video',
      prompt: 'animate',
      parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '1080p' },
      inputs: [
        { kind: 'asset', assetId: ref.assetId, role: 'reference' },
      ],
    },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'vertex',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('vertex', id),
        onDrain: () => {},
      }),
    },
    { spawn: spawnProbe }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'completed');
  assert.equal(argvSeen.includes('--input-image'), false);
  assert.equal(argvSeen.includes('--last-frame'), false);
  assert.equal(argvSeen[argvSeen.indexOf('--reference-image') + 1], ref.path);
});

test('gateway.submitGeneration: live Vertex video runner is not invoked by default', async () => {
  setLiveGate(false);
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-default-' + Date.now(),
    },
    { onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; } }
  );
  assert.equal(subprocessRegistered, 0);
  assert.equal(job.status, 'completed');
  assert.ok(job.url && job.url.startsWith('/api/native-media/v1/assets/'));
});

test('gateway.submitGeneration: live gate + liveVertex routes Veo through tracked MP4 subprocess', async () => {
  setLiveGate(true);
  const rid = 'c6-live-' + Date.now();
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', audio: false },
      clientRequestId: rid,
    },
    {
      liveVertex: true,
      spawn: fakeSpawn({ writeMp4: true, delayMs: 15 }),
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 1);
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.expectedMime, 'video/mp4');
  assert.ok(settled.url && settled.url.startsWith('/api/native-media/v1/assets/'));
  assert.ok(Array.isArray(settled.outputs) && settled.outputs[0] === settled.url);
  assert.ok(typeof settled.pid === 'number' && settled.outputPath);
});

test('gateway.submitGeneration: live Veo returns after subprocess registration while child stays running', async () => {
  setLiveGate(true);
  let captured;
  const spawnProbe = (cmd, argv, opts) => {
    captured = { cmd, argv, opts };
    return new FakeChild(argv, opts);
  };
  const started = Date.now();
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', audio: false },
      clientRequestId: 'c6-pre-registration-' + Date.now(),
    },
    { liveVertex: true, provider: { fake: false }, spawn: spawnProbe }
  );
  assert.ok(Date.now() - started < 500, 'submit must return after registration, not wait for Veo completion');
  assert.equal(job.status, 'running');
  assert.ok(typeof job.pid === 'number' && job.outputPath);
  assert.equal(job.subprocessProvider, 'vertex');
  assert.equal(scheduler.isTracked(job.id), true);
  assert.deepEqual(captured.opts.stdio, ['ignore', 'pipe', 'pipe']);
  await gateway.cancelGeneration(job.id);
});

test('gateway.submitGeneration: provider fake:false still routes live Vertex video runner when live gate is on', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '1080p' },
      clientRequestId: 'c6-real-intent-' + Date.now(),
    },
    { liveVertex: true, provider: { fake: false }, spawn: fakeSpawn({ writeMp4: true, delayMs: 15 }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.expectedMime, 'video/mp4');
});

test('gateway.submitGeneration: invalid live Vertex video params fail and release the slot', async () => {
  setLiveGate(true);
  const rid = 'c6-invalid-live-' + Date.now();
  assert.equal(scheduler.acquireSlot('vertex', 'manual-blocker-a'), true);
  assert.equal(scheduler.acquireSlot('vertex', 'manual-blocker-b'), true);
  const queued = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'queued',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-drain-after-invalid-' + Date.now(),
    },
    { provider: { fake: true } }
  );
  assert.equal(queued.status, 'queued');
  scheduler.releaseSlot('vertex', 'manual-blocker-b');

  await assert.rejects(
    () => gateway.submitGeneration(
      {
        modelId: 'native.vertex.veo-3.1-fast',
        task: 'text-to-video',
        prompt: 'p',
        parameters: { durationSeconds: 5, aspectRatio: '16:9', resolution: '720p' },
        clientRequestId: rid,
      },
      { liveVertex: true, spawn: fakeSpawn({ writeMp4: true }) }
    ),
    /unsupported Veo duration/
  );

  const jobs = JSON.parse(await fsp.readFile(path.join(TEST_ROOT, 'jobs.json'), 'utf8'));
  const job = Object.values(jobs).find((j) => j.clientRequestId === rid);
  assert.ok(job);
  assert.equal(job.status, 'failed');
  const drained = await pollStatus(queued.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(drained.status, 'completed');
  scheduler.releaseSlot('vertex', 'manual-blocker-a');
  assert.equal(scheduler.activeCount('vertex'), 0);
});

test('gateway.submitGeneration: queued live Veo drains with live intent after pre-registration failure', async () => {
  setLiveGate(true);
  assert.equal(scheduler.acquireSlot('vertex', 'manual-live-blocker-a'), true);
  assert.equal(scheduler.acquireSlot('vertex', 'manual-live-blocker-b'), true);
  let subprocessRegistered = 0;
  const queued = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'queued live',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-queued-live-drain-' + Date.now(),
    },
    {
      liveVertex: true,
      provider: { fake: false },
      spawn: fakeSpawn({ writeMp4: true, delayMs: 15 }),
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(queued.status, 'queued');
  scheduler.releaseSlot('vertex', 'manual-live-blocker-b');

  await assert.rejects(
    () => gateway.submitGeneration(
      {
        modelId: 'native.vertex.veo-3.1-fast',
        task: 'text-to-video',
        prompt: 'invalid live',
        parameters: { durationSeconds: 5, aspectRatio: '16:9', resolution: '720p' },
        clientRequestId: 'c6-invalid-before-drain-' + Date.now(),
      },
      { liveVertex: true, spawn: fakeSpawn({ writeMp4: true }) }
    ),
    /unsupported Veo duration/
  );

  const drained = await pollStatus(queued.id, (j) => j.status !== 'queued' && j.status !== 'running');
  assert.equal(drained.status, 'completed');
  assert.equal(drained.expectedMime, 'video/mp4');
  assert.ok(drained.outputPath, 'queued live job must not fake-complete without provider output');
  assert.notEqual(drained.error, 'REAL_PROVIDER_UNAVAILABLE');
  assert.equal(subprocessRegistered, 1, 'queued live job must relaunch through the live runner');
  scheduler.releaseSlot('vertex', 'manual-live-blocker-a');
  assert.equal(scheduler.activeCount('vertex'), 0);
});

test('gateway.submitGeneration: live video runner accepts MEDIA stdout path before requested output fallback', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-media-' + Date.now(),
    },
    { liveVertex: true, spawn: fakeSpawn({ writeMp4: true, delayMs: 15, mediaBasename: 'media-output.mp4' }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(path.basename(settled.outputPath), 'media-output.mp4');
});

test('gateway.submitGeneration: live video runner prefers MEDIA stdout when requested output also exists', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-media-preferred-' + Date.now(),
    },
    { liveVertex: true, spawn: fakeSpawn({ writeMp4: true, delayMs: 15, mediaBasename: 'media-output.mp4', writeRequestedMp4: true }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(path.basename(settled.outputPath), 'media-output.mp4');
});

test('gateway.submitGeneration: live video runner falls back to requested output path without MEDIA stdout', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-output-fallback-' + Date.now(),
    },
    { liveVertex: true, spawn: fakeSpawn({ writeMp4: true, delayMs: 15, emitMedia: false }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(path.basename(settled.outputPath), 'output.mp4');
});

test('gateway.submitGeneration: cancel kills the live Vertex video subprocess directly', async () => {
  setLiveGate(true);
  let childSeen;
  const spawnProbe = (cmd, argv, opts) => {
    childSeen = fakeSpawn({ writeMp4: false, exitCode: 0, delayMs: 60000 })(cmd, argv, opts);
    return childSeen;
  };
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-cancel-' + Date.now(),
    },
    { liveVertex: true, spawn: spawnProbe }
  );
  assert.equal(scheduler.isTracked(job.id), true);
  const outcome = await gateway.cancelGeneration(job.id);
  assert.ok(outcome && outcome.cancelled);
  assert.equal(childSeen.killed, true);
  assert.equal(childSeen.killSignal, 'SIGTERM');
  assert.equal(scheduler.isTracked(job.id), false);
  assert.notEqual(outcome.status, 'completed');
});

test('gateway.submitGeneration: live Vertex video failures retain redacted provider stderr privately', async () => {
  setLiveGate(true);
  const prompt = 'secret-ish prompt text';
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt,
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: 'c6-stderr-' + Date.now(),
    },
    {
      liveVertex: true,
      spawn: fakeSpawn({
        writeMp4: false,
        exitCode: 1,
        delayMs: 15,
        stderrText: `Vertex error in ${process.cwd()}: ${prompt}`,
      }),
    }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'INTERRUPTED_PROCESS');
  assert.equal(settled.error, 'NONZERO_EXIT');
  assert.match(settled.detail, /Vertex error/);
  assert.match(settled.detail, /<repo>|<prompt>/);
  assert.doesNotMatch(settled.detail, new RegExp(prompt));
});

test('vertexVideoProvider exports never expose credential paths or provider internals', () => {
  const exported = Object.keys(vertex).join(' ');
  assert.ok(!/credential|secret|token|key/i.test(exported));
});
