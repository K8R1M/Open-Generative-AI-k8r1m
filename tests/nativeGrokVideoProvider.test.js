// C8 contract test — Grok Imagine native video provider adapter.
// Fake subprocesses only; no live Grok/xAI generation is performed.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `grok-video-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const JPEG_MIN = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const MP4_STUB = Buffer.from('00000018667479706d703432000000006d70343269736f6d000000086d646174', 'hex');

const ORIG_LIVE_GROK = process.env.NATIVE_MEDIA_LIVE_GROK;

function grok() {
  return require('../native-media-gateway/grokVideoProvider.js');
}

function setLiveGate(on) {
  if (on) process.env.NATIVE_MEDIA_LIVE_GROK = '1';
  else delete process.env.NATIVE_MEDIA_LIVE_GROK;
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
      this.emit('exit', 143, signal);
      return true;
    };
  }
}

function fakeGrokSpawn({ writeMp4 = true, exitCode = 0, delayMs = 20, jsonOutputBasename = null, emitJson = true, stderrText = null }) {
  return (cmd, argv, opts) => {
    const child = new FakeChild(argv, opts);
    const outIdx = argv.indexOf('--output');
    const requestedOutput = outIdx >= 0 ? argv[outIdx + 1] : null;
    const outputPath = jsonOutputBasename && requestedOutput
      ? path.join(path.dirname(requestedOutput), jsonOutputBasename)
      : requestedOutput;
    const timer = setTimeout(() => {
      try {
        if (stderrText && child.stderr) child.stderr.emit('data', Buffer.from(stderrText));
        if (writeMp4 && outputPath) {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, MP4_STUB);
          if (emitJson && child.stdout) child.stdout.emit('data', Buffer.from(JSON.stringify({ output: outputPath }) + '\n'));
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
  await scheduler.disposeAll();
  scheduler.reset();
  if (ORIG_LIVE_GROK === undefined) delete process.env.NATIVE_MEDIA_LIVE_GROK;
  else process.env.NATIVE_MEDIA_LIVE_GROK = ORIG_LIVE_GROK;
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('recognizer and live gate are Grok-specific', () => {
  const provider = grok();
  assert.equal(provider.isGrokVideoModel('native.grok.imagine-video'), true);
  assert.equal(provider.isGrokVideoModel('native.vertex.veo-3.1'), false);
  setLiveGate(false);
  assert.equal(provider.liveGrokEnabled(), false);
  setLiveGate(true);
  assert.equal(provider.liveGrokEnabled(), true);
});

test('buildGrokVideoArgs maps single image and reference modes to fixed wrapper flags', () => {
  const provider = grok();
  const single = provider.buildGrokVideoArgs({
    modelId: 'native.grok.imagine-video',
    task: 'image-to-video',
    prompt: 'animate',
    parameters: { durationSeconds: 6, resolution: '480p' },
    inputPaths: [{ path: '/tmp/start.png', mime: 'image/png', assetId: 'start', role: 'first-frame' }],
    outputPath: '/tmp/grok-output.mp4',
  });
  assert.ok(single.includes('--mode'));
  assert.equal(single[single.indexOf('--mode') + 1], 'image-to-video');
  assert.equal(single[single.indexOf('--image') + 1], '/tmp/start.png');
  assert.equal(single[single.indexOf('--duration') + 1], '6');
  assert.equal(single[single.indexOf('--resolution') + 1], '480p');
  assert.equal(single[single.indexOf('--output') + 1], '/tmp/grok-output.mp4');
  assert.ok(single.includes('--overwrite'));

  const refs = provider.buildGrokVideoArgs({
    modelId: 'native.grok.imagine-video',
    task: 'image-to-video',
    prompt: 'blend',
    parameters: { durationSeconds: 10, resolution: '720p' },
    inputPaths: [
      { path: '/tmp/start.png', mime: 'image/png', assetId: 'start', role: 'first-frame' },
      { path: '/tmp/ref.png', mime: 'image/png', assetId: 'ref', role: 'reference' },
    ],
    outputPath: '/tmp/grok-output.mp4',
  });
  assert.equal(refs[refs.indexOf('--mode') + 1], 'reference-to-video');
  assert.deepEqual(
    refs.filter((v, i) => refs[i - 1] === '--ref'),
    ['start-composition=/tmp/start.png', 'reference-1=/tmp/ref.png']
  );
});

test('Grok validation rejects unsupported task, model, duration, resolution, MIME, counts, URLs, path traversal, and T2V before spawn', async () => {
  const provider = grok();
  const start = await uploadAsset(PNG_1X1, 'image/png');
  const resolved = [{ path: start.path, mime: 'image/png', size: PNG_1X1.length, role: 'first-frame' }];
  assert.throws(() => provider.buildGrokVideoArgs({ modelId: 'native.vertex.veo-3.1', task: 'image-to-video', prompt: 'p', inputPaths: resolved, parameters: { durationSeconds: 6, resolution: '480p' }, outputPath: '/tmp/out.mp4' }), /unsupported/i);
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'text-to-video', inputs: [], resolvedFiles: [], parameters: { durationSeconds: 6, resolution: '480p' } }), /text-to-video|unsupported/i);
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'image-to-video', inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }], resolvedFiles: resolved, parameters: { durationSeconds: 8, resolution: '480p' } }), /duration/i);
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'image-to-video', inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }], resolvedFiles: resolved, parameters: { durationSeconds: 6, resolution: '1080p' } }), /resolution/i);
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'image-to-video', inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }], resolvedFiles: [{ ...resolved[0], mime: 'image/gif' }], parameters: { durationSeconds: 6, resolution: '480p' } }), /mime/i);
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'image-to-video', inputs: [], resolvedFiles: [], parameters: { durationSeconds: 6, resolution: '480p' } }), /input|image/i);
  await assert.rejects(() => provider.resolveInputAssets([{ kind: 'url', url: 'https://example.invalid/a.png', role: 'first-frame' }], gateway.getAsset), /asset|url|external/i);
  await assert.rejects(() => provider.resolveInputAssets([{ kind: 'asset', assetId: '../secret', role: 'first-frame' }], gateway.getAsset), /asset id|traversal|invalid/i);
  const many = Array.from({ length: 8 }, (_, i) => ({ kind: 'asset', assetId: `a${i}`, role: i === 0 ? 'first-frame' : 'reference' }));
  assert.throws(() => provider.validateGrokVideoInputs({ modelId: 'native.grok.imagine-video', task: 'image-to-video', inputs: many, resolvedFiles: many.map((_, i) => ({ path: `/tmp/${i}.png`, mime: 'image/png', role: i === 0 ? 'first-frame' : 'reference' })), parameters: { durationSeconds: 6, resolution: '480p' } }), /maximum|too many|7/);
});

test('buildEnv drops Grok/xAI credentials from provider subprocess env', () => {
  const provider = grok();
  const env = provider.buildEnv({
    PATH: '/bin',
    HOME: '/tmp/home',
    XAI_API_KEY: 'xai-secret',
    GROK_API_KEY: 'grok-secret',
    authorization: 'Bearer secret',
    cookie: 'session=secret',
  });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/tmp/home');
  assert.equal(env.XAI_API_KEY, undefined);
  assert.equal(env.GROK_API_KEY, undefined);
  assert.equal(env.authorization, undefined);
  assert.equal(env.cookie, undefined);
});

test('runGrokVideoProvider uses fixed wrapper path, shell:false, job-local MP4, and JSON output', async () => {
  const provider = grok();
  const start = await uploadAsset(PNG_1X1, 'image/png');
  const rid = 'c8-run-' + Date.now();
  let captured;
  const settled = [];
  const prompt = 'private grok prompt';
  await provider.runGrokVideoProvider(
    { id: rid },
    {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt,
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }],
    },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'grok',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        settlePatch: meta.settlePatch,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('grok', id),
        onDrain: () => {},
      }),
    },
    {
      spawn: (cmd, argv, opts) => {
        captured = { cmd, argv, opts };
        return fakeGrokSpawn({
          writeMp4: true,
          delayMs: 15,
          jsonOutputBasename: 'json-output.mp4',
        })(cmd, argv, opts);
      },
      env: { PATH: '/bin', XAI_API_KEY: 'must-not-leak', GROK_API_KEY: 'must-not-leak' },
    }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(captured.opts.shell, false);
  assert.equal(captured.opts.detached, true);
  assert.equal(captured.opts.env.XAI_API_KEY, undefined);
  assert.equal(captured.opts.env.GROK_API_KEY, undefined);
  assert.match(captured.cmd, /python3$/);
  assert.match(captured.argv[0], /grok_imagine_video\.py$/);
  assert.equal(captured.argv[captured.argv.indexOf('--output') + 1], path.join(TEST_ROOT, 'tmp', rid, 'grok-output.mp4'));
  assert.equal(settled[0].status, 'completed');
  assert.equal(settled[0].outputVerified, true);
  assert.equal(path.basename(settled[0].outputPath), 'json-output.mp4');
});

test('runGrokVideoProvider stores redacted diagnostics on provider failure', async () => {
  const provider = grok();
  const start = await uploadAsset(PNG_1X1, 'image/png');
  const rid = 'c8-redacted-' + Date.now();
  const prompt = 'private grok prompt';
  const settled = [];
  await provider.runGrokVideoProvider(
    { id: rid },
    {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt,
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }],
    },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'grok',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        settlePatch: meta.settlePatch,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('grok', id),
        onDrain: () => {},
      }),
    },
    {
      spawn: fakeGrokSpawn({
        writeMp4: false,
        exitCode: 1,
        delayMs: 15,
        stderrText: `${process.cwd()} ${prompt} XAI_API_KEY=secret GROK_API_KEY=secret`,
      }),
    }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'INTERRUPTED_PROCESS');
  assert.match(settled[0].detail, /<repo>|<prompt>|<redacted>/);
  assert.doesNotMatch(settled[0].detail, new RegExp(prompt));
  assert.doesNotMatch(settled[0].detail, /XAI_API_KEY=secret|GROK_API_KEY=secret/);
});

test('runGrokVideoProvider falls back to requested output without wrapper JSON', async () => {
  const provider = grok();
  const start = await uploadAsset(PNG_1X1, 'image/png');
  const rid = 'c8-fallback-' + Date.now();
  const settled = [];
  await provider.runGrokVideoProvider(
    { id: rid },
    {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt: 'fallback',
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }],
    },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'grok',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('grok', id),
        onDrain: () => {},
      }),
    },
    { spawn: fakeGrokSpawn({ writeMp4: true, delayMs: 15, emitJson: false }) }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'completed');
  assert.equal(path.basename(settled[0].outputPath), 'grok-output.mp4');
});

test('gateway liveGrok gate routes Grok through tracked MP4 subprocess and cancel kills it', async () => {
  setLiveGate(true);
  const start = await uploadAsset(JPEG_MIN, 'image/jpeg');
  let childSeen;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt: 'cancel',
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }],
      clientRequestId: 'c8-live-' + Date.now(),
    },
    {
      liveGrok: true,
      provider: { fake: false },
      spawn: (cmd, argv, opts) => {
        childSeen = new FakeChild(argv, opts);
        return childSeen;
      },
    }
  );
  assert.equal(job.status, 'running');
  assert.equal(job.subprocessProvider, 'grok');
  assert.equal(job.expectedMime, 'video/mp4');
  assert.ok(job.outputPath.endsWith(path.join(job.id, 'grok-output.mp4')));
  assert.equal(scheduler.isTracked(job.id), true);
  const outcome = await gateway.cancelGeneration(job.id);
  assert.ok(outcome.cancelled);
  assert.equal(childSeen.killed, false, 'fake PID cannot receive process-group SIGTERM');
  assert.equal(scheduler.isTracked(job.id), false);
});

test('gateway imports completed Grok output as same-origin MP4 asset', async () => {
  setLiveGate(true);
  const start = await uploadAsset(PNG_1X1, 'image/png');
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.grok.imagine-video',
      task: 'image-to-video',
      prompt: 'complete',
      parameters: { durationSeconds: 6, resolution: '480p' },
      inputs: [{ kind: 'asset', assetId: start.assetId, role: 'first-frame' }],
      clientRequestId: 'c8-complete-' + Date.now(),
    },
    { liveGrok: true, provider: { fake: false }, spawn: fakeGrokSpawn({ writeMp4: true, delayMs: 15 }) }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.expectedMime, 'video/mp4');
  assert.match(settled.url, /^\/api\/native-media\/v1\/assets\//);
  assert.deepEqual(settled.outputs, [settled.url]);
});
