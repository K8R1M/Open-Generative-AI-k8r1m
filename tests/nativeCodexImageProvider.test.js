// C7 contract test — Codex GPT Image provider adapter around the verified
// clean Codex CLI route. Uses a fake subprocess + injected filesystem only.
// No live Codex generation is ever performed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `codex-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;
const TEST_CODEX_HOME = path.join(TEST_ROOT, 'codex-home');
const TEST_GENERATED_IMAGES_DIR = path.join(TEST_CODEX_HOME, 'generated_images');

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;
const codex = require('../native-media-gateway/codexImageProvider.js');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);
const JPEG_MIN = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const ORIG_LIVE_GATE = process.env.NATIVE_MEDIA_LIVE_CODEX;
const ORIG_LIVE_VERTEX_GATE = process.env.NATIVE_MEDIA_LIVE_VERTEX;

function setLiveGate(on) {
  if (on) process.env.NATIVE_MEDIA_LIVE_CODEX = '1';
  else delete process.env.NATIVE_MEDIA_LIVE_CODEX;
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
    this.killed = false;
    this.argv = argv;
    this.opts = opts;
    this.kill = () => {
      this.killed = true;
    };
  }
}

// Fake `codex exec` spawn: after `delayMs`, writes `newPngCount` PNGs into the
// injected CODEX_HOME/generated_images/<session>/ folder (read from opts.env),
// then emits 'exit'. Lets tests exercise the full live-runner scan + copy +
// scheduler settle + gateway asset import with zero live Codex calls.
function fakeCodexSpawn({
  writePng = true,
  pngBytes = PNG_1X1,
  newPngCount = 1,
  exitCode = 0,
  delayMs = 20,
  sessionDir = 'fake-session',
  stdoutText = null,
  stderrText = null,
  lastMessageText = null,
} = {}) {
  return (cmd, argv, opts) => {
    const child = new FakeChild(argv, opts);
    const codexHome = opts && opts.env && opts.env.CODEX_HOME;
    const timer = setTimeout(() => {
      try {
        const resolvedStdout = typeof stdoutText === 'function' ? stdoutText(argv) : stdoutText;
        const resolvedStderr = typeof stderrText === 'function' ? stderrText(argv) : stderrText;
        const resolvedLastMsg = typeof lastMessageText === 'function' ? lastMessageText(argv) : lastMessageText;

        if (resolvedStdout && child.stdout) {
          child.stdout.emit('data', Buffer.from(resolvedStdout));
        }
        if (resolvedStderr && child.stderr) {
          child.stderr.emit('data', Buffer.from(resolvedStderr));
        }
        if (resolvedLastMsg) {
          const idx = argv.indexOf('--output-last-message');
          const lastMessagePath = idx !== -1 ? argv[idx + 1] : null;
          if (lastMessagePath) {
            fs.mkdirSync(path.dirname(lastMessagePath), { recursive: true });
            fs.writeFileSync(lastMessagePath, resolvedLastMsg, 'utf8');
          }
        }
        if (writePng && codexHome && newPngCount > 0) {
          const dir = path.join(codexHome, 'generated_images', sessionDir);
          fs.mkdirSync(dir, { recursive: true });
          const stamp = Date.now();
          for (let i = 0; i < newPngCount; i++) {
            fs.writeFileSync(path.join(dir, `img-${stamp}-${i}.png`), pngBytes);
          }
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

test.before(async () => {
  await fsp.mkdir(TEST_GENERATED_IMAGES_DIR, { recursive: true });
});

test.afterEach(async () => {
  scheduler.disposeAll();
  scheduler.reset();
  if (ORIG_LIVE_GATE === undefined) delete process.env.NATIVE_MEDIA_LIVE_CODEX;
  else process.env.NATIVE_MEDIA_LIVE_CODEX = ORIG_LIVE_GATE;
  if (ORIG_LIVE_VERTEX_GATE === undefined) delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
  else process.env.NATIVE_MEDIA_LIVE_VERTEX = ORIG_LIVE_VERTEX_GATE;
  // Clear fake generated images between tests so snapshot diffs stay clean.
  await fsp.rm(TEST_GENERATED_IMAGES_DIR, { recursive: true, force: true });
  await fsp.mkdir(TEST_GENERATED_IMAGES_DIR, { recursive: true });
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  // Give any in-flight async settles a moment to finish writing before teardown.
  await sleep(50);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fsp.rm(TEST_ROOT, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err && err.code === 'ENOTEMPTY') {
        await sleep(50);
        continue;
      }
      throw err;
    }
  }
});

// ---------------------------------------------------------------- command build

test('buildCodexArgs: prompt-only T2I maps to exec + ephemeral + workdir + prompt', () => {
  const argv = codex.buildCodexArgs({
    modelId: 'native.codex.gpt-image-2',
    task: 'text-to-image',
    prompt: 'a red cube on a blue plane',
    lastMessagePath: '/job/last.txt',
  });
  assert.equal(argv[0], 'exec');
  assert.ok(argv.includes('--ephemeral'));
  assert.ok(argv.includes('--skip-git-repo-check'));
  assert.equal(argv[argv.indexOf('-C') + 1], codex.CODEX_WORKDIR);
  assert.equal(argv[argv.indexOf('--output-last-message') + 1], '/job/last.txt');
  assert.equal(argv[argv.length - 1], 'a red cube on a blue plane');
  assert.ok(!argv.includes('--image'), 'prompt-only must not pass --image');
});

test('buildCodexArgs: I2I maps every input to repeated --image flags preserving order', () => {
  const argv = codex.buildCodexArgs({
    modelId: 'native.codex.gpt-image-2',
    task: 'image-to-image',
    prompt: 'restyle',
    lastMessagePath: '/job/last.txt',
    inputPaths: [
      { role: 'primary', path: '/abs/primary.png' },
      { role: 'reference', path: '/abs/ref-a.png' },
      { role: 'reference', path: '/abs/ref-b.png' },
    ],
  });
  const imageIdxs = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--image') imageIdxs.push(i);
  assert.deepEqual(imageIdxs.map((i) => argv[i + 1]), ['/abs/primary.png', '/abs/ref-a.png', '/abs/ref-b.png']);
  assert.equal(argv[argv.length - 2], '--', 'prompt separator is required after variadic --image flags');
  assert.equal(argv[argv.length - 1], 'restyle');
});

test('buildCodexArgs: preserves prompt text verbatim', () => {
  const argv = codex.buildCodexArgs({
    modelId: 'native.codex.gpt-image-2',
    task: 'text-to-image',
    prompt: 'exact text 123 !@#',
    lastMessagePath: '/j/last.txt',
  });
  assert.equal(argv[argv.length - 1], 'exact text 123 !@#');
});

test('buildCodexArgs: rejects unsupported model, task, missing prompt, missing lastMessagePath', () => {
  assert.throws(
    () => codex.buildCodexArgs({ modelId: 'native.vertex.nano-banana-pro', task: 'text-to-image', prompt: 'p', lastMessagePath: '/l.txt' }),
    /unsupported Codex image model/
  );
  assert.throws(
    () => codex.buildCodexArgs({ modelId: 'native.codex.gpt-image-2', task: 'text-to-video', prompt: 'p', lastMessagePath: '/l.txt' }),
    /unsupported Codex image task/
  );
  assert.throws(
    () => codex.buildCodexArgs({ modelId: 'native.codex.gpt-image-2', task: 'text-to-image', lastMessagePath: '/l.txt' }),
    /prompt is required/
  );
  assert.throws(
    () => codex.buildCodexArgs({ modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'p' }),
    /lastMessagePath is required/
  );
});

// --------------------------------------------------------------- input validation

test('validateCodexImageInputs: rejects non-asset, bad MIME, oversize, too many references', async () => {
  await assert.rejects(
    () => codex.validateCodexImageInputs({
      task: 'image-to-image',
      inputs: [{ kind: 'url', url: 'http://internal/ref.png', role: 'input' }],
      resolvedFiles: [],
    }),
    /asset references|external URLs|resolution mismatch/
  );
  await assert.rejects(
    () => codex.validateCodexImageInputs({
      task: 'image-to-image',
      inputs: [{ kind: 'asset', assetId: 'a', role: 'input' }],
      resolvedFiles: [{ role: 'primary', path: '/a.mp4', mime: 'video/mp4', size: 100 }],
    }),
    /unsupported Codex image input MIME type/
  );
  await assert.rejects(
    () => codex.validateCodexImageInputs({
      task: 'image-to-image',
      inputs: [{ kind: 'asset', assetId: 'big', role: 'input' }],
      resolvedFiles: [{ role: 'primary', path: '/big.png', mime: 'image/png', size: codex.CONSTRAINTS.inputMaxBytes + 1 }],
    }),
    /exceeds max bytes/
  );
  const refs = Array.from({ length: codex.CONSTRAINTS.maxReferences + 1 }, (_, i) => ({ kind: 'asset', assetId: `r${i}`, role: 'reference' }));
  await assert.rejects(
    () => codex.validateCodexImageInputs({
      task: 'image-to-image',
      inputs: refs,
      resolvedFiles: refs.map((r) => ({ role: 'reference', path: `/${r.assetId}.png`, mime: 'image/png', size: 100 })),
    }),
    /exceed maximum of/
  );
});

test('validateCodexImageInputs: image-to-image requires at least one input', async () => {
  await assert.rejects(
    () => codex.validateCodexImageInputs({
      task: 'image-to-image',
      inputs: [],
      resolvedFiles: [],
    }),
    /requires at least one input image/
  );
  await assert.equal(
    await codex.validateCodexImageInputs({
      task: 'text-to-image',
      inputs: [],
      resolvedFiles: [],
    }),
    true
  );
});

test('resolveInputAssets: rejects path traversal and missing assets', async () => {
  const getAsset = async () => ({ path: '/x', mime: 'image/png' });
  await assert.rejects(
    () => codex.resolveInputAssets([{ kind: 'asset', assetId: '../escape', role: 'input' }], getAsset),
    /invalid native asset id/
  );
  await assert.rejects(
    () => codex.resolveInputAssets([{ kind: 'asset', assetId: 'ghost', role: 'input' }], async () => null),
    /not found/
  );
  await assert.rejects(
    () => codex.resolveInputAssets([{ kind: 'url', url: 'http://x', role: 'input' }], getAsset),
    /external URLs are forbidden/
  );
});

// --------------------------------------------------------------- env + credential guard

test('buildEnv: allowlist only, pins CODEX_HOME, never carries credentials', () => {
  const env = codex.buildEnv({
    PATH: '/usr/bin',
    HOME: '/h',
    USER: 'u',
    GOOGLE_APPLICATION_CREDENTIALS: '/secret/sa.json',
    GEMINI_API_KEY: 'secret',
    OPENAI_API_KEY: 'sk-secret',
    CODEX_API_KEY: 'sk-secret',
    RANDOM_BAD: 'nope',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/h');
  assert.equal(env.CODEX_HOME, codex.CODEX_HOME);
  assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_API_KEY, undefined);
  assert.equal(env.RANDOM_BAD, undefined);
});

test('buildEnv: opts.codexHome injects a test/home without touching real paths', () => {
  const env = codex.buildEnv({ PATH: '/bin' }, { codexHome: '/tmp/fake-codex-home' });
  assert.equal(env.CODEX_HOME, '/tmp/fake-codex-home');
});

test('buildCodexArgs and env never carry credentials, codex home, or service-account paths', () => {
  const argv = codex.buildCodexArgs({
    modelId: 'native.codex.gpt-image-2',
    task: 'text-to-image',
    prompt: 'p',
    lastMessagePath: '/j/last.txt',
  });
  const joined = argv.join(' ');
  assert.ok(!argv.includes('--service-account'));
  assert.ok(!argv.includes('--credentials'));
  assert.ok(!argv.includes('--model'));
  assert.ok(!/GOOGLE_APPLICATION_CREDENTIALS|OPENAI_API_KEY|CODEX_API_KEY|\.json/i.test(joined));
  assert.ok(!joined.includes(codex.CODEX_HOME), 'argv must not embed the CODEX_HOME path');
});

// --------------------------------------------------------------- snapshot + scan helpers

test('snapshotGeneratedImagesSync + scanNewPngsSync: snapshot excludes pre-existing, scan finds only new PNGs', () => {
  const dir = path.join(TEST_ROOT, 'scan-fixture');
  fs.mkdirSync(path.join(dir, 'old-session'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'old-session', 'old.png'), PNG_1X1);
  const snapshot = codex.snapshotGeneratedImagesSync(dir);
  assert.equal(snapshot.size, 1);

  fs.mkdirSync(path.join(dir, 'new-session'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'new-session', 'new.png'), PNG_1X1);
  const fresh = codex.scanNewPngsSync(snapshot, dir);
  assert.equal(fresh.length, 1);
  assert.ok(fresh[0].path.endsWith('new.png'));
  assert.equal(codex.pickNewestPng(fresh).path, fresh[0].path);
  assert.equal(codex.pickNewestPng([]), null);
});

test('scanNewPngsSync: returns empty for a missing dir and does not throw', () => {
  const fresh = codex.scanNewPngsSync(new Map(), path.join(TEST_ROOT, 'does-not-exist'));
  assert.deepEqual(fresh, []);
});

test('scanNewPngsSync: sorts newest-first across nested session folders', () => {
  const dir = path.join(TEST_ROOT, 'sort-fixture');
  fs.mkdirSync(path.join(dir, 'a'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'b'), { recursive: true });
  const older = path.join(dir, 'a', 'old.png');
  const newer = path.join(dir, 'b', 'new.png');
  fs.writeFileSync(older, PNG_1X1);
  // Backdate older, then write newer so mtimes differ reliably.
  const past = new Date(Date.now() - 10000);
  fs.utimesSync(older, past, past);
  fs.writeFileSync(newer, PNG_1X1);
  const fresh = codex.scanNewPngsSync(new Map(), dir);
  assert.equal(fresh.length, 2);
  assert.ok(fresh[0].path.endsWith('new.png'));
  assert.ok(fresh[1].path.endsWith('old.png'));
});

// --------------------------------------------------------------- direct live runner

test('runCodexImageProvider: uses fixed codex binary + shell:false + clean CODEX_HOME env', async () => {
  let captured;
  const spawnProbe = (cmd, argv, opts) => {
    captured = { cmd, argv, opts };
    const child = new FakeChild(argv, opts);
    setTimeout(() => child.emit('exit', 0, null), 5);
    return child;
  };
  await codex.runCodexImageProvider(
    { id: 'probe-' + Date.now() },
    { modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'p', inputs: [] },
    {
      register: () => {},
      getAsset: async () => null,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
    },
    { spawn: spawnProbe, env: { PATH: '/bin' }, codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
  );
  assert.equal(captured.cmd, codex.CODEX_BINARY);
  assert.equal(captured.opts.shell, false);
  assert.equal(captured.opts.detached, true);
  assert.equal(captured.opts.env.CODEX_HOME, TEST_CODEX_HOME);
  assert.equal(captured.opts.env.PATH, '/bin');
  assert.equal(captured.opts.env.OPENAI_API_KEY, undefined);
});

test('runCodexImageProvider: T2I scans injected filesystem and scheduler verifies copied PNG', async () => {
  const rid = 'c7-t2i-' + Date.now();
  const settled = [];
  await codex.runCodexImageProvider(
    { id: rid },
    { modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'a cube', inputs: [] },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'codex',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('codex', id),
        onDrain: () => {},
      }),
    },
    { spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }), codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'completed');
  assert.equal(settled[0].outputVerified, true);
  assert.ok(settled[0].outputPath && settled[0].outputPath.endsWith('codex-output.png'));
  assert.ok(fs.existsSync(settled[0].outputPath), 'newest PNG must be copied into the job-local target');
});

test('runCodexImageProvider: I2I resolves assets and passes repeated --image flags', async () => {
  const primary = await uploadAsset(PNG_1X1, 'image/png');
  const ref = await uploadAsset(JPEG_MIN, 'image/jpeg');
  const rid = 'c7-i2v-' + Date.now();
  let argvSeen;
  const settled = [];
  const spawnProbe = (cmd, argv, opts) => {
    argvSeen = argv;
    return fakeCodexSpawn({ writePng: true, delayMs: 15 })(cmd, argv, opts);
  };
  await codex.runCodexImageProvider(
    { id: rid },
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'image-to-image',
      prompt: 'restyled',
      inputs: [
        { kind: 'asset', assetId: primary.assetId, role: 'input' },
        { kind: 'asset', assetId: ref.assetId, role: 'reference' },
      ],
    },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'codex',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('codex', id),
        onDrain: () => {},
      }),
    },
    { spawn: spawnProbe, codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'completed');
  const imageIdxs = [];
  for (let i = 0; i < argvSeen.length; i++) if (argvSeen[i] === '--image') imageIdxs.push(i);
  assert.deepEqual(imageIdxs.map((i) => argvSeen[i + 1]), [primary.path, ref.path]);
  assert.equal(argvSeen[argvSeen.length - 2], '--', 'prompt separator is required after variadic --image flags');
  assert.equal(argvSeen[argvSeen.length - 1], 'restyled');
});

test('runCodexImageProvider: no new PNG => resolveOutputPath returns null and missing flag is set', async () => {
  const rid = 'c7-missing-' + Date.now();
  const settled = [];
  let resolveMetaRef = null;
  await codex.runCodexImageProvider(
    { id: rid },
    { modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'p', inputs: [] },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => {
        resolveMetaRef = meta;
        return scheduler.registerSubprocess(rid, {
          child,
          provider: 'codex',
          outputPath: meta.outputPath,
          resolveOutputPath: meta.resolveOutputPath,
          expectedMime: meta.expectedMime,
          timeoutMs: meta.timeoutMs,
          onSettle: async (id, patch) => settled.push(patch),
          onRelease: () => scheduler.releaseSlot('codex', id),
          onDrain: () => {},
        });
      },
    },
    { spawn: fakeCodexSpawn({ writePng: false, exitCode: 0, delayMs: 15 }), codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  // resolveOutputPath is called inside the scheduler; invoke it directly here to
  // confirm the missing flag + null return without a real generated image.
  const result = resolveMetaRef.resolveOutputPath();
  assert.equal(result, null);
});

test('runCodexImageProvider: multiple new PNGs => ambiguity detected, newest chosen', async () => {
  const rid = 'c7-ambiguity-' + Date.now();
  const settled = [];
  let returnedMeta = null;
  returnedMeta = await codex.runCodexImageProvider(
    { id: rid },
    { modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'p', inputs: [] },
    {
      scheduler,
      tmpDir: path.join(TEST_ROOT, 'tmp'),
      getAsset: gateway.getAsset,
      register: (child, meta) => scheduler.registerSubprocess(rid, {
        child,
        provider: 'codex',
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => settled.push(patch),
        onRelease: () => scheduler.releaseSlot('codex', id),
        onDrain: () => {},
      }),
    },
    { spawn: fakeCodexSpawn({ writePng: true, newPngCount: 3, delayMs: 15 }), codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
  );
  await waitFor(() => settled.length > 0, { timeoutMs: 2000 });
  assert.equal(settled[0].status, 'completed');
  assert.equal(returnedMeta.resolveMeta.newPngCount, 3);
  assert.equal(returnedMeta.resolveMeta.ambiguityDetected, true);
  assert.equal(returnedMeta.resolveMeta.missing, false);
});

test('runCodexImageProvider: rejects when codex home/generated_images paths are the real production defaults', () => {
  // Sanity: the live runner uses fixed CODEX_BINARY/CODEX_WORKDIR regardless of
  // browser input. argv never contains a browser-supplied executable.
  const argv = codex.buildCodexArgs({
    modelId: 'native.codex.gpt-image-2',
    task: 'text-to-image',
    prompt: 'p',
    lastMessagePath: '/j/last.txt',
  });
  assert.equal(argv[0], 'exec');
  assert.ok(!argv.includes(codex.CODEX_BINARY), 'binary path is the spawn cmd, not an argv element');
});

// --------------------------------------------------------------- gateway integration

test('gateway.submitGeneration: live Codex runner is not invoked by default', async () => {
  setLiveGate(false);
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-default-' + Date.now(),
    },
    {
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 0);
  assert.equal(job.status, 'completed');
  assert.ok(job.url && job.url.startsWith('/api/native-media/v1/assets/'));
});

test('gateway.submitGeneration: live gate + liveCodex routes Codex through tracked PNG subprocess', async () => {
  setLiveGate(true);
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'a green robot',
      clientRequestId: 'c7-live-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 1);
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.expectedMime, 'image/png');
  assert.ok(settled.url && settled.url.startsWith('/api/native-media/v1/assets/'));
  assert.ok(Array.isArray(settled.outputs) && settled.outputs[0] === settled.url);
  assert.ok(typeof settled.pid === 'number' && settled.outputPath);
});

test('gateway.submitGeneration: provider fake:false still routes live Codex runner when live gate is on', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'image-to-image',
      prompt: 'p',
      inputs: [{ kind: 'asset', assetId: (await uploadAsset(PNG_1X1, 'image/png')).assetId, role: 'input' }],
      clientRequestId: 'c7-real-intent-' + Date.now(),
    },
    {
      liveCodex: true,
      provider: { fake: false },
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.expectedMime, 'image/png');
});

test('gateway.submitGeneration: live gate off + liveCodex true does NOT invoke live runner', async () => {
  setLiveGate(false);
  let subprocessRegistered = 0;
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-gate-off-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(subprocessRegistered, 0);
  assert.equal(job.status, 'completed');
});

test('gateway.submitGeneration: no new PNG => OUTPUT_MISSING and no asset url', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-missing-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: false, exitCode: 0, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  const settled = await pollStatus(job.id, (j) => j.status !== 'running' && j.status !== 'created');
  assert.notEqual(settled.status, 'completed');
  assert.equal(settled.error, 'OUTPUT_MISSING');
  assert.ok(!settled.url, 'OUTPUT_MISSING must never surface a success URL');
});

test('gateway.submitGeneration: multiple new PNGs => completed with safe ambiguity metadata', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-ambiguity-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, newPngCount: 2, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.ok(settled.codexOutputAmbiguity, 'ambiguity must be recorded in safe metadata');
  assert.equal(settled.codexOutputAmbiguity.newPngCount, 2);
  // Safe metadata must never include Codex-home or generated_images paths.
  const metaJson = JSON.stringify(settled.codexOutputAmbiguity);
  assert.ok(!/\/home\/|codex-image-provider-home|generated_images/i.test(metaJson), 'ambiguity metadata must not expose internal paths');
});

test('gateway.submitGeneration: codex model is subject to concurrency cap 1', async () => {
  setLiveGate(true);
  // Occupy the single codex slot manually.
  assert.equal(scheduler.acquireSlot('codex', 'manual-codex-blocker'), true);
  const queued = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'queued',
      clientRequestId: 'c7-queued-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  assert.equal(queued.status, 'queued');
  // Manual release does not trigger drain; submit a synchronous fake codex job
  // whose completion releases the slot and drains the queued live job.
  scheduler.releaseSlot('codex', 'manual-codex-blocker');
  await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'trigger',
      clientRequestId: 'c7-trigger-' + Date.now(),
    },
    {}
  );
  const settled = await pollStatus(queued.id, (j) => j.status === 'completed' && !!j.url);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.expectedMime, 'image/png');
  assert.equal(scheduler.activeCount('codex'), 0);
});

test('gateway.submitGeneration: queued live Codex job drains with live intent after a pre-registration failure', async () => {
  setLiveGate(true);
  assert.equal(scheduler.acquireSlot('codex', 'manual-codex-blocker-a'), true);
  let subprocessRegistered = 0;
  const queued = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'queued live',
      clientRequestId: 'c7-queued-live-drain-' + Date.now(),
    },
    {
      liveCodex: true,
      provider: { fake: false },
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
      onEvent: (e) => { if (e && e.type === 'subprocess_registered') subprocessRegistered += 1; },
    }
  );
  assert.equal(queued.status, 'queued');

  // Free the slot first (manual release does not drain), then submit an invalid
  // live codex job. It acquires the slot, fails validation before registration,
  // releases the slot, and drains the queued live job through the live runner.
  scheduler.releaseSlot('codex', 'manual-codex-blocker-a');
  await assert.rejects(
    () => gateway.submitGeneration(
      {
        modelId: 'native.codex.gpt-image-2',
        task: 'image-to-image',
        prompt: 'invalid live',
        inputs: [],
        clientRequestId: 'c7-invalid-before-drain-' + Date.now(),
      },
      { liveCodex: true, spawn: fakeCodexSpawn({ writePng: true }), codexHome: TEST_CODEX_HOME, generatedImagesDir: TEST_GENERATED_IMAGES_DIR }
    ),
    /requires at least one input image/
  );

  const drained = await pollStatus(queued.id, (j) => j.status !== 'queued' && j.status !== 'running');
  assert.equal(drained.status, 'completed');
  assert.equal(drained.expectedMime, 'image/png');
  assert.ok(drained.outputPath, 'queued live job must not fake-complete without provider output');
  assert.notEqual(drained.error, 'REAL_PROVIDER_UNAVAILABLE');
  assert.equal(subprocessRegistered, 1, 'queued live job must relaunch through the live runner');
  assert.equal(scheduler.activeCount('codex'), 0);
});

test('gateway.submitGeneration: cancel kills the live Codex subprocess group', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-cancel-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: false, exitCode: 0, delayMs: 60000 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  assert.equal(scheduler.isTracked(job.id), true);
  const outcome = await gateway.cancelGeneration(job.id);
  assert.ok(outcome && outcome.cancelled);
  assert.equal(scheduler.isTracked(job.id), false);
  assert.notEqual(outcome.status, 'completed');
});

test('gateway.submitGeneration: Codex job publicJob shape never exposes codex home/auth/output paths', async () => {
  setLiveGate(true);
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-public-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url);
  // Public-facing fields (url/outputs/ambiguity) must never expose Codex-home or
  // generated_images paths. The internal record carries pid/outputPath which the
  // Next route's publicJob() strips before returning to the browser.
  const publicJson = JSON.stringify({
    url: settled.url,
    outputs: settled.outputs,
    codexOutputAmbiguity: settled.codexOutputAmbiguity,
  });
  assert.ok(!publicJson.includes(codex.CODEX_HOME), 'public fields must not expose CODEX_HOME');
  assert.ok(!/generated_images|auth\.json|last-message/i.test(publicJson), 'public fields must not expose internal Codex paths');
});

// --------------------------------------------------------------- no-race terminal metadata (C7 review fix)

// Regression for the C7 race: the ambiguity metadata and the terminal
// completed status must land in the SAME first persisted terminal patch, with
// no observable completed-without-ambiguity intermediate state.
test('gateway.submitGeneration: ambiguity metadata is in the first terminal completed patch (no race)', async () => {
  setLiveGate(true);
  // Capture a snapshot of the persisted job at every job_terminal emit. Because
  // persistJobPatch writes atomically BEFORE emitting, each snapshot reflects
  // the exact on-disk state produced by that persist.
  const terminalSnapshots = [];
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-race-ambiguity-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: true, newPngCount: 2, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
      onEvent: async (e) => {
        if (e && e.type === 'job_terminal') {
          const j = await gateway.getGeneration(e.jobId);
          terminalSnapshots.push({ status: e.status, jobStatus: j && j.status, hasAmbiguity: !!(j && j.codexOutputAmbiguity), newPngCount: j && j.codexOutputAmbiguity && j.codexOutputAmbiguity.newPngCount });
        }
      },
    }
  );
  await pollStatus(job.id, (j) => j.status === 'completed' && !!j.url && !!j.codexOutputAmbiguity);
  const completedSnaps = terminalSnapshots.filter((s) => s.jobStatus === 'completed');
  assert.equal(completedSnaps.length, 1, 'completed must be persisted exactly once (no second metadata patch)');
  assert.equal(completedSnaps[0].hasAmbiguity, true, 'the first completed persist must already carry ambiguity metadata');
  assert.equal(completedSnaps[0].newPngCount, 2);
});

// Regression for the C7 race: a no-output outcome must be persisted as
// OUTPUT_MISSING on the FIRST terminal patch, with no observable intermediate
// terminal state carrying the scheduler's raw NO_OUTPUT/NONZERO_EXIT error.
test('gateway.submitGeneration: missing output is OUTPUT_MISSING on the first terminal patch (no race)', async () => {
  setLiveGate(true);
  const terminalSnapshots = [];
  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'p',
      clientRequestId: 'c7-race-missing-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeCodexSpawn({ writePng: false, exitCode: 0, delayMs: 15 }),
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
      onEvent: async (e) => {
        if (e && e.type === 'job_terminal') {
          const j = await gateway.getGeneration(e.jobId);
          terminalSnapshots.push({ jobStatus: j && j.status, error: j && j.error });
        }
      },
    }
  );
  await pollStatus(job.id, (j) => j.status !== 'running' && j.status !== 'created' && j.status !== 'queued');
  // The first terminal (non-running/created/queued) snapshot must already be
  // OUTPUT_MISSING — there must be no terminal snapshot with NO_OUTPUT.
  const terminalSnaps = terminalSnapshots.filter((s) => s.jobStatus && s.jobStatus !== 'running' && s.jobStatus !== 'created' && s.jobStatus !== 'queued');
  assert.ok(terminalSnaps.length >= 1, 'at least one terminal snapshot must be captured');
  assert.equal(terminalSnaps[0].error, 'OUTPUT_MISSING', 'first terminal persist must already be OUTPUT_MISSING');
  assert.equal(terminalSnaps.filter((s) => s.error === 'NO_OUTPUT').length, 0, 'no intermediate NO_OUTPUT terminal state must be observable');
  assert.equal(terminalSnaps.filter((s) => s.error === 'OUTPUT_MISSING').length, 1, 'OUTPUT_MISSING persisted exactly once');
});

// --------------------------------------------------------------- export safety

test('codexImageProvider exports never expose credential paths or provider internals', () => {
  const exported = Object.keys(codex).join(' ');
  assert.ok(!/credential|secret|token|apiKey|password/i.test(exported));
});

test('codexImageProvider: isCodexImageModel and liveCodexEnabled gates', () => {
  assert.equal(codex.isCodexImageModel('native.codex.gpt-image-2'), true);
  assert.equal(codex.isCodexImageModel('native.vertex.nano-banana-pro'), false);
  assert.ok(!codex.isCodexImageModel(null), 'null model id must be falsy');
  setLiveGate(false);
  assert.equal(codex.liveCodexEnabled(), false);
  setLiveGate(true);
  assert.equal(codex.liveCodexEnabled(), true);
});

// Regression test for no-output Codex diagnostics and redaction (Requirement 3)
test('gateway.submitGeneration: no-output Codex diagnostics redaction regression test', async () => {
  setLiveGate(true);
  const prompt = 'SuperSecretPrompt_12345';
  const inputAsset = await uploadAsset(PNG_1X1, 'image/png');

  const fakeSpawn = fakeCodexSpawn({
    writePng: false, // creates no PNG
    exitCode: 0,
    delayMs: 15,
    stdoutText: (argv) => {
      const imageIdx = argv.indexOf('--image');
      const rawInputPath = imageIdx !== -1 ? argv[imageIdx + 1] : '/fallback/input.png';
      return `stdout log: codexHome=${TEST_CODEX_HOME} generatedImagesDir=${TEST_GENERATED_IMAGES_DIR} prompt=${prompt} input=${rawInputPath}`;
    },
    stderrText: (argv) => {
      const msgIdx = argv.indexOf('--output-last-message');
      const lastMessagePath = msgIdx !== -1 ? argv[msgIdx + 1] : '/fallback/last-message.txt';
      const jobDir = path.dirname(lastMessagePath);
      const copyTargetPath = path.join(jobDir, 'codex-output.png');
      return `stderr log: jobDir=${jobDir} lastMessagePath=${lastMessagePath} copyTargetPath=${copyTargetPath} prompt=${prompt}`;
    },
    lastMessageText: (argv) => {
      return `last message: codexHome=${TEST_CODEX_HOME} prompt=${prompt}`;
    }
  });

  const job = await gateway.submitGeneration(
    {
      modelId: 'native.codex.gpt-image-2',
      task: 'image-to-image',
      prompt,
      inputs: [{ kind: 'asset', assetId: inputAsset.assetId, role: 'input' }],
      clientRequestId: 'c7-diagnostics-regression-' + Date.now(),
    },
    {
      liveCodex: true,
      spawn: fakeSpawn,
      codexHome: TEST_CODEX_HOME,
      generatedImagesDir: TEST_GENERATED_IMAGES_DIR,
    }
  );

  const settled = await pollStatus(job.id, (j) => j.status !== 'running' && j.status !== 'created' && j.status !== 'queued');
  assert.notEqual(settled.status, 'completed');
  assert.equal(settled.error, 'OUTPUT_MISSING');

  // Verify internal job has codexDiagnostics
  assert.ok(settled.codexDiagnostics, 'internal job must have codexDiagnostics');
  assert.ok(settled.codexDiagnostics.path, 'codexDiagnostics must have path');
  assert.equal(settled.codexDiagnostics.reason, 'no-new-png');
  assert.equal(settled.codexDiagnostics.hasStderr, true);
  assert.equal(settled.codexDiagnostics.hasStdout, true);
  assert.equal(settled.codexDiagnostics.hasLastMessage, true);

  // Read diagnostics JSON from disk and verify redactions
  const diagPath = settled.codexDiagnostics.path;
  assert.ok(fs.existsSync(diagPath), 'diagnostics JSON file must exist on disk');
  const diagJson = JSON.parse(fs.readFileSync(diagPath, 'utf8'));

  // Ensure useful redacted tails exist
  assert.ok(diagJson.stdoutTail, 'diagnostics must include stdoutTail');
  assert.ok(diagJson.stderrTail, 'diagnostics must include stderrTail');
  assert.ok(diagJson.lastMessageTail, 'diagnostics must include lastMessageTail');

  // Verify stable placeholders are present
  assert.ok(diagJson.stdoutTail.includes('<codex-home>'), 'stdoutTail must replace codexHome');
  assert.ok(diagJson.stdoutTail.includes('<generated-images>'), 'stdoutTail must replace generatedImagesDir');
  assert.ok(diagJson.stdoutTail.includes('<prompt>'), 'stdoutTail must replace prompt');
  assert.ok(diagJson.stdoutTail.includes('<input>'), 'stdoutTail must replace input path');

  assert.ok(diagJson.stderrTail.includes('<job-dir>'), 'stderrTail must replace jobDir');
  assert.ok(diagJson.stderrTail.includes('<last-message>'), 'stderrTail must replace lastMessagePath');
  assert.ok(diagJson.stderrTail.includes('<output>'), 'stderrTail must replace copyTargetPath');
  assert.ok(diagJson.stderrTail.includes('<prompt>'), 'stderrTail must replace prompt');

  assert.ok(diagJson.lastMessageTail.includes('<codex-home>'), 'lastMessageTail must replace codexHome');
  assert.ok(diagJson.lastMessageTail.includes('<prompt>'), 'lastMessageTail must replace prompt');

  // Ensure raw sensitive strings do NOT exist anywhere in the diagnostics JSON
  const diagStr = JSON.stringify(diagJson);
  assert.equal(diagStr.includes(TEST_CODEX_HOME), false, 'raw TEST_CODEX_HOME must be redacted');
  assert.equal(diagStr.includes(TEST_GENERATED_IMAGES_DIR), false, 'raw TEST_GENERATED_IMAGES_DIR must be redacted');
  assert.equal(diagStr.includes(prompt), false, 'raw prompt must be redacted');
  assert.equal(diagStr.includes(inputAsset.path), false, 'raw input path must be redacted');

  const rawLastMessagePath = diagPath.replace('codex-diagnostics.json', 'last-message.txt');
  const rawCopyTargetPath = diagPath.replace('codex-diagnostics.json', 'codex-output.png');
  const rawJobDir = path.dirname(diagPath);

  assert.equal(diagStr.includes(rawLastMessagePath), false, 'raw lastMessagePath must be redacted');
  assert.equal(diagStr.includes(rawCopyTargetPath), false, 'raw copyTargetPath must be redacted');
  assert.equal(diagStr.includes(rawJobDir), false, 'raw jobDir must be redacted');

  // Verify native-media-gateway/server.js publicJob() strips codexDiagnostics
  const server = require('../native-media-gateway/server.js');
  const pub = server.publicJob(settled);
  assert.equal(pub.codexDiagnostics, undefined, 'publicJob must strip codexDiagnostics');
  assert.equal(pub.outputPath, undefined, 'publicJob must strip outputPath');
  assert.equal(pub.pid, undefined, 'publicJob must strip pid');
});
