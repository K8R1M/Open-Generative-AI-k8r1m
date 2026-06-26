// C5 contract test — Vertex image provider adapter around the existing
// Native media `genai-image` wrapper.
//
// Covers: command construction (pure), input resolution + validation (SSRF,
// MIME, size, reference count), environment allowlist (no credential passthrough),
// MEDIA: stdout parsing, and the live runner integration through the C1b
// scheduler hooks using a *fake* spawned subprocess that writes a verified PNG
// to the requested output path. No live Vertex call is ever made.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `vertex-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;
const vertex = require('../native-media-gateway/vertexImageProvider.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
// Minimal valid JPEG SOI + EOI for MIME sniffing (3 bytes SOI is enough for sniffMime).
const JPEG_MIN = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const ORIG_LIVE_GATE = process.env.NATIVE_MEDIA_LIVE_VERTEX;

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

// Poll a bare predicate (no gateway job row required). Used by direct-runner
// tests that exercise runVertexImageProvider without going through submitGeneration.
async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timed out');
}

// Upload a real asset into the native store and return { assetId, mime, path }.
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
    this.killed = false;
    this.argv = argv;
    this.opts = opts;
    this.kill = (signal) => {
      this.killed = true;
      this.killSignal = signal;
      return true;
    };
  }
  // scheduler registers exit/error via .on(); EventEmitter provides it.
}

// Build a fake spawn that writes a PNG (or nothing) to the requested --output
// path after `delayMs`, then emits 'exit' with `exitCode`. Lets tests exercise
// the full live-runner path through the scheduler settle + asset import with
// zero live provider calls.
function fakeSpawn({ writePng = true, exitCode = 0, delayMs = 20 }) {
  return (cmd, argv, opts) => {
    const child = new FakeChild(argv, opts);
    const outIdx = argv.indexOf('--output');
    const outputPath = outIdx >= 0 ? argv[outIdx + 1] : null;
    const timer = setTimeout(() => {
      try {
        if (writePng && outputPath) {
          fsp.mkdir(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, PNG_1X1);
          if (child.stdout) child.stdout.emit('data', Buffer.from(`MEDIA:${outputPath}\n`));
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
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------- command build

test('buildVertexImageArgs: prompt-only T2I maps to prompt + model + output', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-pro',
    task: 'text-to-image',
    prompt: 'a red panda',
    parameters: {},
    outputPath: '/abs/out.png',
  });
  assert.equal(argv[0], vertex.VERTEX_IMAGE_SCRIPT, 'argv must start at the fixed wrapper script path');
  assert.deepEqual(argv.slice(1, 6), ['--prompt', 'a red panda', '--model', 'nano-banana-pro', '--output', '/abs/out.png'].slice(0, 5));
  assert.ok(argv.includes('--prompt') && argv.includes('--model') && argv.includes('--output'));
  assert.equal(argv[argv.indexOf('--model') + 1], 'nano-banana-pro');
  assert.equal(argv[argv.indexOf('--output') + 1], '/abs/out.png');
  assert.ok(!argv.includes('--input-image'), 'T2I must not add --input-image');
  assert.ok(!argv.includes('--reference-image'), 'T2I must not add --reference-image');
});

test('buildVertexImageArgs: model alias maps nano-banana-2 distinctly', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'p',
    outputPath: '/o.png',
  });
  assert.equal(argv[argv.indexOf('--model') + 1], 'nano-banana-2');
});

test('buildVertexImageArgs: I2I primary input maps to --input-image', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-pro',
    task: 'image-to-image',
    prompt: 'put it on a beach',
    outputPath: '/o.png',
    inputPaths: [{ role: 'primary', path: '/up/primary.png' }],
  });
  assert.equal(argv[argv.indexOf('--input-image') + 1], '/up/primary.png');
  assert.ok(!argv.includes('--reference-image'));
});

test('buildVertexImageArgs: repeated references map to repeated --reference-image and preserve order', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-2',
    task: 'image-to-image',
    prompt: 'combine these',
    outputPath: '/o.png',
    inputPaths: [
      { role: 'primary', path: '/p.png' },
      { role: 'reference', path: '/r1.png' },
      { role: 'reference', path: '/r2.png' },
      { role: 'reference', path: '/r3.png' },
    ],
  });
  const refIdxs = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--reference-image') refIdxs.push(i);
  assert.deepEqual(refIdxs.map((i) => argv[i + 1]), ['/r1.png', '/r2.png', '/r3.png'], 'reference order must be preserved');
  assert.equal(argv[argv.indexOf('--input-image') + 1], '/p.png');
});

test('buildVertexImageArgs: aspectRatio and imageSize map to wrapper flags', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-pro',
    task: 'text-to-image',
    prompt: 'p',
    parameters: { aspectRatio: '16:9', imageSize: '2K' },
    outputPath: '/o.png',
  });
  assert.equal(argv[argv.indexOf('--aspect-ratio') + 1], '16:9');
  assert.equal(argv[argv.indexOf('--image-size') + 1], '2K');
});

test('buildVertexImageArgs: rejects unsupported Vertex image model', () => {
  assert.throws(
    () => vertex.buildVertexImageArgs({ modelId: 'native.vertex.veo-3.1', task: 'text-to-image', prompt: 'p', outputPath: '/o.png' }),
    /unsupported Vertex image model/,
    'Veo models must not route through the image adapter'
  );
});

test('buildVertexImageArgs: rejects unsupported task', () => {
  assert.throws(
    () => vertex.buildVertexImageArgs({ modelId: 'native.vertex.nano-banana-pro', task: 'text-to-video', prompt: 'p', outputPath: '/o.png' }),
    /unsupported Vertex image task/
  );
});

test('buildVertexImageArgs: rejects multiple primary inputs', () => {
  assert.throws(
    () =>
      vertex.buildVertexImageArgs({
        modelId: 'native.vertex.nano-banana-pro',
        task: 'image-to-image',
        prompt: 'p',
        outputPath: '/o.png',
        inputPaths: [
          { role: 'primary', path: '/a.png' },
          { role: 'primary', path: '/b.png' },
        ],
      }),
    /at most one primary input/,
    'Nano Banana supports a single --input-image'
  );
});

// ------------------------------------------------------------ validation / SSRF

test('validateVertexImageInputs: rejects non-asset inputs before any provider call (SSRF guard)', async () => {
  await assert.rejects(
    () =>
      vertex.validateVertexImageInputs({
        task: 'image-to-image',
        inputs: [{ kind: 'url', url: 'http://internal/gcs-key', role: 'reference' }],
        resolvedFiles: [],
      }),
    /asset references|external URLs|resolution mismatch/,
    'external URLs and non-asset kinds must be rejected'
  );
});

test('validateVertexImageInputs: rejects unsupported MIME before provider call', async () => {
  await assert.rejects(
    () =>
      vertex.validateVertexImageInputs({
        task: 'image-to-image',
        inputs: [{ kind: 'asset', assetId: 'a', role: 'reference' }],
        resolvedFiles: [{ role: 'reference', path: '/a.mp4', mime: 'video/mp4', size: 100 }],
      }),
    /unsupported Vertex image input MIME type/,
    'video inputs must be rejected for the image path'
  );
});

test('validateVertexImageInputs: rejects oversized input (>7MB) before provider call', async () => {
  const tooBig = vertex.CONSTRAINTS.inputMaxBytes + 1;
  await assert.rejects(
    () =>
      vertex.validateVertexImageInputs({
        task: 'image-to-image',
        inputs: [{ kind: 'asset', assetId: 'big', role: 'reference' }],
        resolvedFiles: [{ role: 'reference', path: '/big.png', mime: 'image/png', size: tooBig }],
      }),
    /exceeds max bytes/,
    'inputs over the 7MB cap must be rejected'
  );
});

test('validateVertexImageInputs: rejects more than 10 references', async () => {
  const refs = Array.from({ length: 11 }, (_, i) => ({ kind: 'asset', assetId: `r${i}`, role: 'reference' }));
  const resolved = refs.map((r) => ({ role: 'reference', path: `/${r.assetId}.png`, mime: 'image/png', size: 100 }));
  await assert.rejects(
    () => vertex.validateVertexImageInputs({ task: 'image-to-image', inputs: refs, resolvedFiles: resolved }),
    /exceed maximum of 10/,
    'more than 10 Nano Banana references must be rejected'
  );
});

test('validateVertexImageInputs: allows two references for nano-banana-2', async () => {
  const refs = Array.from({ length: 2 }, (_, i) => ({ kind: 'asset', assetId: `r${i}`, role: 'reference' }));
  const resolved = refs.map((r) => ({ role: 'reference', path: `/${r.assetId}.png`, mime: 'image/png', size: 100 }));
  await assert.doesNotReject(
    () =>
      vertex.validateVertexImageInputs({
        modelId: 'native.vertex.nano-banana-2',
        task: 'image-to-image',
        inputs: refs,
        resolvedFiles: resolved,
      }),
    'nano-banana-2 should allow two reference images'
  );
});

test('validateVertexImageInputs: rejects more than 1 reference for nano-banana-pro', async () => {
  const refs = Array.from({ length: 2 }, (_, i) => ({ kind: 'asset', assetId: `pro-r${i}`, role: 'reference' }));
  const resolved = refs.map((r) => ({ role: 'reference', path: `/${r.assetId}.png`, mime: 'image/png', size: 100 }));
  await assert.rejects(
    () =>
      vertex.validateVertexImageInputs({
        modelId: 'native.vertex.nano-banana-pro',
        task: 'image-to-image',
        inputs: refs,
        resolvedFiles: resolved,
      }),
    /only accepts 1 ref image/i,
    'Nano Banana Pro should only allow one reference image'
  );
});

test('validateVertexImageInputs: allows one reference for nano-banana-pro', async () => {
  const refs = [{ kind: 'asset', assetId: 'pro-r1', role: 'reference' }];
  const resolved = [{ role: 'reference', path: '/pro-r1.png', mime: 'image/png', size: 100 }];
  await assert.doesNotReject(
    () =>
      vertex.validateVertexImageInputs({
        modelId: 'native.vertex.nano-banana-pro',
        task: 'image-to-image',
        inputs: refs,
        resolvedFiles: resolved,
      }),
    'nano-banana-pro should allow one reference image'
  );
});

test('validateVertexImageInputs: rejects image-to-image with no input images', async () => {
  await assert.rejects(
    () => vertex.validateVertexImageInputs({ task: 'image-to-image', inputs: [], resolvedFiles: [] }),
    /at least one input image/,
    'image-to-image must require at least one image input'
  );
});

test('validateVertexImageInputs: rejects unknown input role', async () => {
  await assert.rejects(
    () =>
      vertex.validateVertexImageInputs({
        task: 'image-to-image',
        inputs: [{ kind: 'asset', assetId: 'a', role: 'shapeshift' }],
        resolvedFiles: [{ role: 'reference', path: '/a.png', mime: 'image/png', size: 1 }],
      }),
    /unsupported Vertex image input role/,
    'roles outside the frozen allowlist must be rejected'
  );
});

test('resolveInputAssets: rejects path-traversal / non-opaque asset ids', async () => {
  const getAsset = async () => ({ path: '/x', mime: 'image/png' });
  await assert.rejects(
    () => vertex.resolveInputAssets([{ kind: 'asset', assetId: '../escape', role: 'reference' }], getAsset),
    /invalid native asset id/
  );
});

test('resolveInputAssets: rejects missing asset before provider call', async () => {
  const getAsset = async () => null;
  await assert.rejects(
    () => vertex.resolveInputAssets([{ kind: 'asset', assetId: 'ghost', role: 'reference' }], getAsset),
    /not found/
  );
});

// ---------------------------------------------------------- environment boundary

test('buildEnv: copies only allowlisted keys and never credentials', () => {
  const env = vertex.buildEnv({
    PATH: '/usr/bin',
    HOME: '/h',
    GOOGLE_APPLICATION_CREDENTIALS: '/secret/sa.json',
    GEMINI_API_KEY: 'AIza-secret',
    GOOGLE_CLOUD_PROJECT: 'proj-x',
    RANDOM_BAD: 'nope',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/h');
  assert.equal(env.GOOGLE_CLOUD_PROJECT, 'proj-x');
  assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined, 'service-account path must never be passed through');
  assert.equal(env.GEMINI_API_KEY, undefined, 'API keys must never be passed through');
  assert.equal(env.RANDOM_BAD, undefined, 'non-allowlisted env must not leak to the wrapper child');
});

test('buildVertexImageArgs: argv never carries credential flags or service-account paths', () => {
  const argv = vertex.buildVertexImageArgs({
    modelId: 'native.vertex.nano-banana-pro',
    task: 'text-to-image',
    prompt: 'a calm lake',
    outputPath: '/o.png',
    inputPaths: [{ role: 'primary', path: '/up/normal.png' }],
  });
  const joined = argv.join(' ');
  assert.ok(!argv.includes('--service-account'), 'adapter must never add a service-account flag');
  assert.ok(!argv.includes('--credentials'), 'adapter must never add a credentials flag');
  assert.ok(!argv.includes('--use-aistudio'), 'adapter must never opt into AI Studio auth');
  assert.ok(!/GOOGLE_APPLICATION_CREDENTIALS|\.json/i.test(joined), 'argv must not embed service-account paths or credential env names');
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
  // Minimal ctx.register that does NOT schedule (we only probe spawn args here).
  await vertex.runVertexImageProvider(
    { id: 'probe-' + Date.now() },
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', parameters: {}, inputs: [] },
    {
      register: (_child, meta) => { registerMeta = meta; },
      getAsset: async () => null,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
    },
    { spawn: spawnProbe, env: { PATH: '/bin' }, python: '/tmp/browser-controlled-python' }
  );
  assert.equal(captured.cmd, vertex.VERTEX_IMAGE_PYTHON, 'must spawn the fixed venv python');
  assert.equal(captured.argv[0], vertex.VERTEX_IMAGE_SCRIPT, 'must use the fixed wrapper script path');
  assert.equal(captured.opts.shell, false, 'must spawn with shell:false');
  assert.equal(captured.opts.detached, false, 'must not detach Vertex wrappers under the Next route');
  assert.equal(registerMeta.killGroup, false, 'non-detached Vertex wrappers must use child/PID cancellation');
  assert.equal(captured.opts.env.GOOGLE_APPLICATION_CREDENTIALS, undefined, 'env allowlist must drop service-account paths');
  assert.equal(captured.opts.env.PATH, '/bin', 'allowlisted operational env must pass through');
});

test('default image wrapper paths are repo-local', () => {
  const forbidden = ['/home/k8r1m', 'merlin'].join('/');
  const forbiddenVenv = ['merlin', '.venv'].join('/');
  const forbiddenBin = ['merlin', 'bin'].join('/');
  assert.ok(vertex.VERTEX_IMAGE_PYTHON.endsWith(path.join('.native-media', 'venv', 'bin', 'python3')));
  assert.ok(vertex.VERTEX_IMAGE_SCRIPT.endsWith(path.join('native-media-gateway', 'bin', 'genai-image')));
  assert.ok(!vertex.VERTEX_IMAGE_PYTHON.includes(forbidden));
  assert.ok(!vertex.VERTEX_IMAGE_PYTHON.includes(forbiddenVenv));
  assert.ok(!vertex.VERTEX_IMAGE_PYTHON.includes(forbiddenBin));
  assert.ok(!vertex.VERTEX_IMAGE_SCRIPT.includes(forbidden));
  assert.ok(!vertex.VERTEX_IMAGE_SCRIPT.includes(forbiddenVenv));
  assert.ok(!vertex.VERTEX_IMAGE_SCRIPT.includes(forbiddenBin));
});

// ------------------------------------------------------- MEDIA: stdout + output fallback

test('parseMediaStdout: extracts the MEDIA: output path', () => {
  assert.equal(vertex.parseMediaStdout('noise\nMEDIA:/abs/out.png\ntail'), '/abs/out.png');
  assert.equal(vertex.parseMediaStdout('no media line'), null);
  assert.equal(vertex.parseMediaStdout(''), null);
  assert.equal(vertex.parseMediaStdout(null), null);
});

// --------------------------------------------------- live runner integration (fake spawn)

test('runVertexImageProvider: T2I live runner writes verified PNG, scheduler settles completed, asset imported with same-origin url', async () => {
  const rid = 'c5-t2i-' + Date.now();
  const job = {
    id: rid,
    modelId: 'native.vertex.nano-banana-pro',
    task: 'text-to-image',
    prompt: 'a calm lake',
    parameters: { aspectRatio: '16:9' },
    inputs: [],
  };
  const settled = [];
  const ctx = {
    scheduler,
    tmpDir: path.join(TEST_ROOT, 'tmp'),
    constraints: gateway.CAPABILITY_CONSTRAINTS,
    getAsset: gateway.getAsset,
    register: (child, meta) =>
      scheduler.registerSubprocess(rid, {
        child,
        provider: 'vertex',
        outputPath: meta.outputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => {
          const out = await fsp.readFile(meta.outputPath);
          const asset = await gateway.uploadAsset(out);
          const imported = { status: 'completed', ...asset, outputs: [asset.url], completedAt: new Date().toISOString() };
          settled.push(imported);
        },
        onRelease: () => scheduler.releaseSlot('vertex', id),
        onDrain: () => {},
      }),
  };
  await vertex.runVertexImageProvider(job, { ...job }, ctx, { spawn: fakeSpawn({ writePng: true, delayMs: 10 }) });
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  const result = settled[0];
  assert.equal(result.status, 'completed');
  assert.ok(result.url && result.url.startsWith('/api/native-media/v1/assets/'), 'must return a same-origin asset URL');
  assert.ok(Array.isArray(result.outputs) && result.outputs.length > 0);
});

test('runVertexImageProvider: I2I resolves uploaded assets, builds --input-image + --reference-image, and imports output', async () => {
  const primary = await uploadAsset(PNG_1X1, 'image/png');
  const refA = await uploadAsset(JPEG_MIN, 'image/jpeg');
  const rid = 'c5-i2i-' + Date.now();
  let argvSeen;
  const ctx = {
    scheduler,
    tmpDir: path.join(TEST_ROOT, 'tmp'),
    constraints: gateway.CAPABILITY_CONSTRAINTS,
    getAsset: gateway.getAsset,
    register: (child, meta) =>
      scheduler.registerSubprocess(rid, {
        child,
        provider: 'vertex',
        outputPath: meta.outputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => {
          if (patch.status === 'completed') {
            const out = await fsp.readFile(meta.outputPath);
            const asset = await gateway.uploadAsset(out);
            return { status: 'completed', ...asset, outputs: [asset.url], completedAt: new Date().toISOString() };
          }
          return patch;
        },
        onRelease: () => scheduler.releaseSlot('vertex', id),
        onDrain: () => {},
      }),
  };
  const spawnProbe = (cmd, argv, opts) => {
    argvSeen = argv;
    const child = new FakeChild(argv, opts);
    const outIdx = argv.indexOf('--output');
    const outputPath = argv[outIdx + 1];
    setTimeout(() => {
      fsp.mkdir(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, PNG_1X1);
      child.stdout.emit('data', Buffer.from(`MEDIA:${outputPath}\n`));
      child.emit('exit', 0, null);
    }, 10);
    return child;
  };
  await vertex.runVertexImageProvider(
    { id: rid },
    {
      modelId: 'native.vertex.nano-banana-pro',
      task: 'image-to-image',
      prompt: 'put it on a beach',
      parameters: {},
      inputs: [
        { kind: 'asset', assetId: primary.assetId, role: 'input' },
        { kind: 'asset', assetId: refA.assetId, role: 'reference' },
      ],
    },
    ctx,
    { spawn: spawnProbe }
  );
  await waitFor(() => !scheduler.isTracked(rid), { timeoutMs: 2000 });
  assert.ok(argvSeen.includes('--input-image'), 'I2I must add --input-image');
  assert.equal(argvSeen[argvSeen.indexOf('--input-image') + 1], primary.path, 'primary must resolve to the uploaded asset path');
  const refIdxs = [];
  for (let i = 0; i < argvSeen.length; i++) if (argvSeen[i] === '--reference-image') refIdxs.push(i);
  assert.deepEqual(refIdxs.map((i) => argvSeen[i + 1]), [refA.path], 'references must resolve to uploaded asset paths in order');
});

test('runVertexImageProvider: non-zero exit without output settles as INTERRUPTED_PROCESS, never auto-resubmits', async () => {
  const rid = 'c5-fail-' + Date.now();
  const settled = [];
  const ctx = {
    scheduler,
    tmpDir: path.join(TEST_ROOT, 'tmp'),
    constraints: gateway.CAPABILITY_CONSTRAINTS,
    getAsset: gateway.getAsset,
    register: (child, meta) =>
      scheduler.registerSubprocess(rid, {
        child,
        provider: 'vertex',
        outputPath: meta.outputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('vertex', id),
        onDrain: () => {},
      }),
  };
  await vertex.runVertexImageProvider(
    { id: rid },
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', parameters: {}, inputs: [] },
    ctx,
    { spawn: fakeSpawn({ writePng: false, exitCode: 3, delayMs: 10 }) }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.notEqual(settled[0].status, 'completed', 'a failing wrapper must not synthesize a success URL');
  assert.ok(['INTERRUPTED_PROCESS', 'OUTCOME_UNKNOWN'].includes(settled[0].status), 'failed exit must settle as interrupted/unknown');
  assert.equal(scheduler.activeCount('vertex'), 0, 'slot must be released after failure');
  assert.equal(scheduler.isTracked(rid), false, 'failed job must not remain tracked');
});

// ------------------------------------------- gateway-level live gating (default = fake)

test('gateway.submitGeneration: live Vertex image runner is NOT invoked by default (fake provider used)', async () => {
  setLiveGate(false);
  const rid = 'c5-default-' + Date.now();
  let providerStarted = 0;
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    { onEvent: (e) => { if (e && e.type === 'subprocess_registered') providerStarted += 1; } }
  );
  assert.equal(providerStarted, 0, 'no provider subprocess must be registered without the live gate');
  assert.equal(job.status, 'completed', 'default must complete via the synchronous fake provider');
  assert.ok(job.url && job.url.startsWith('/api/native-media/v1/assets/'));
});

test('gateway.submitGeneration: rejects Nano Banana Pro i2i requests with >1 reference image', async () => {
  setLiveGate(false);
  const first = await uploadAsset(PNG_1X1, 'image/png');
  const second = await uploadAsset(JPEG_MIN, 'image/jpeg');
  const rid = 'c5-pro-refs-' + Date.now();
  await assert.rejects(
    () =>
      gateway.submitGeneration({
        modelId: 'native.vertex.nano-banana-pro',
        task: 'image-to-image',
        prompt: 'p',
        clientRequestId: rid,
        inputs: [
          { kind: 'asset', assetId: first.assetId, role: 'reference' },
          { kind: 'asset', assetId: second.assetId, role: 'reference' },
        ],
      }),
    /only accepts 1 ref image/i,
    'Nano Banana Pro with more than one reference image must be rejected before default/fake provider work'
  );
});

test('gateway.submitGeneration: accepts Nano Banana 2 i2i requests with 2 references in default/fake path', async () => {
  setLiveGate(false);
  const first = await uploadAsset(PNG_1X1, 'image/png');
  const second = await uploadAsset(JPEG_MIN, 'image/jpeg');
  let subprocessRegistered = 0;
  const rid = 'c5-nb2-refs-' + Date.now();
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.nano-banana-2',
      task: 'image-to-image',
      prompt: 'p',
      clientRequestId: rid,
      inputs: [
        { kind: 'asset', assetId: first.assetId, role: 'reference' },
        { kind: 'asset', assetId: second.assetId, role: 'reference' },
      ],
    },
    {
      onEvent: (e) => {
        if (e && e.type === 'subprocess_registered') subprocessRegistered += 1;
      },
    },
  );
  assert.equal(job.status, 'completed', 'default/fake provider must accept 2 refs for nano-banana-2');
  assert.equal(subprocessRegistered, 0, 'default path should not register a provider subprocess');
  assert.ok(job.url && job.url.startsWith('/api/native-media/v1/assets/'));
});

test('gateway.submitGeneration: liveVertex flag without env gate still falls back to fake (no paid call)', async () => {
  setLiveGate(false);
  const rid = 'c5-gateoff-' + Date.now();
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-2', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    { liveVertex: true, onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; } }
  );
  assert.equal(subprocessRegistered, 0, 'the env gate is mandatory; missing it must not spawn the live wrapper');
  assert.equal(job.status, 'completed');
});

test('gateway.submitGeneration: with live gate + liveVertex + injected fake spawn, live runner completes and imports a same-origin asset', async () => {
  setLiveGate(true);
  const rid = 'c5-live-' + Date.now();
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    {
      liveVertex: true,
      spawn: fakeSpawn({ writePng: true, delayMs: 15 }),
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 1, 'the live runner must register exactly one tracked subprocess');
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.ok(settled.url && settled.url.startsWith('/api/native-media/v1/assets/'), 'live runner must import via same-origin asset URL');
  assert.ok(Array.isArray(settled.outputs) && settled.outputs.length > 0);
  assert.equal(settled.url, settled.outputs[0]);
  assert.ok(typeof settled.pid === 'number' && settled.pid > 0, 'live job must persist the child PID for recovery');
  assert.ok(settled.outputPath && settled.expectedMime === 'image/png', 'output path + expected MIME must be persisted for C1b reconcile');
});

test('gateway.submitGeneration: provider fake:false still routes live Vertex image runner when live gate is on', async () => {
  setLiveGate(true);
  const rid = 'c5-live-real-intent-' + Date.now();
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    {
      liveVertex: true,
      provider: { fake: false },
      spawn: fakeSpawn({ writePng: true, delayMs: 15 }),
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 1, 'real-provider intent must not fall through to fake success');
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.ok(settled.outputPath, 'live runner must persist a verified provider output path');
});

test('gateway.submitGeneration: live runner accepts verified MEDIA stdout path before requested output fallback', async () => {
  setLiveGate(true);
  const rid = 'c5-media-' + Date.now();
  const mediaOnlySpawn = (cmd, argv, opts) => {
    const child = new FakeChild(argv, opts);
    const outIdx = argv.indexOf('--output');
    const requestedOutput = argv[outIdx + 1];
    const mediaOutput = path.join(path.dirname(requestedOutput), 'media-output.png');
    setTimeout(() => {
      fs.writeFileSync(mediaOutput, PNG_1X1);
      child.stdout.emit('data', Buffer.from(`MEDIA:${mediaOutput}\n`));
      child.emit('exit', 0, null);
    }, 15);
    return child;
  };
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    { liveVertex: true, spawn: mediaOnlySpawn }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.ok(settled.url && settled.url.startsWith('/api/native-media/v1/assets/'));
  assert.equal(path.basename(settled.outputPath), 'media-output.png', 'verified MEDIA path must be persisted as the output path');
});

test('gateway.submitGeneration: cancel kills the live Vertex image subprocess directly and settles cancelled', async () => {
  setLiveGate(true);
  const rid = 'c5-cancel-' + Date.now();
  let childSeen;
  const spawnProbe = (cmd, argv, opts) => {
    childSeen = fakeSpawn({ writePng: false, exitCode: 0, delayMs: 60000 })(cmd, argv, opts);
    return childSeen;
  };
  const job = await gateway.submitGeneration(
    { modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', clientRequestId: rid },
    {
      liveVertex: true,
      // Long-lived fake child: never writes output / never exits on its own, so
      // cancel must drive settle.
      spawn: spawnProbe,
    }
  );
  assert.equal(scheduler.isTracked(job.id), true, 'live job must be tracked before cancel');
  await sleep(20);
  const outcome = await gateway.cancelGeneration(job.id);
  assert.ok(outcome && outcome.cancelled, 'cancel must settle the live job as cancelled');
  assert.equal(childSeen.killed, true, 'cancel must kill the non-detached child directly');
  assert.equal(childSeen.killSignal, 'SIGTERM');
  assert.equal(scheduler.isTracked(job.id), false, 'cancelled live job must no longer be tracked');
  assert.notEqual(outcome.status, 'completed', 'cancel must not synthesize a success output');
});

test('gateway.submitGeneration: Veo still falls back to fake when the live Vertex gate is off', async () => {
  setLiveGate(false);
  const rid = 'c5-veo-' + Date.now();
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'p',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      clientRequestId: rid,
    },
    { liveVertex: true, spawn: fakeSpawn({ writePng: true, delayMs: 5 }), onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; } }
  );
  assert.equal(subprocessRegistered, 0, 'missing env gate must not spawn a live Veo subprocess');
  assert.equal(job.status, 'completed', 'Veo must still complete via the fake provider when the gate is off');
});

// ------------------------------------------------------------ credential / surface boundary

test('vertexImageProvider exports never expose credential paths or provider internals', () => {
  const exported = Object.keys(vertex).join(' ');
  assert.ok(!/credential|secret|token|key/i.test(exported), 'adapter exports must not surface credential-named fields');
});
