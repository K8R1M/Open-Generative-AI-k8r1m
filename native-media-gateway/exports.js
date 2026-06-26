'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const scheduler = require('./scheduler.js');
const vertexImageProvider = require('./vertexImageProvider.js');
const vertexVideoProvider = require('./vertexVideoProvider.js');
const codexImageProvider = require('./codexImageProvider.js');

function storeRoot() {
  return process.env.NATIVE_MEDIA_ROOT
    ? path.resolve(process.env.NATIVE_MEDIA_ROOT)
    : path.resolve(process.cwd(), '.native-media');
}
const ROOT = storeRoot();
const JOBS_FILE = path.join(ROOT, 'jobs.json');
const IDEMPOTENCY_FILE = path.join(ROOT, 'idempotency.json');
const ASSETS_DIR = path.join(ROOT, 'assets');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const TMP_DIR = path.join(ROOT, 'tmp');
const QUARANTINE_DIR = path.join(ROOT, 'quarantine');
const ASSET_URL_PREFIX = '/api/native-media/v1/assets/';

const MODELS = [
  { id: 'native.vertex.nano-banana-2', label: 'Nano Banana 2 (Server · Vertex AI)', provider: 'vertex', tasks: ['text-to-image', 'image-to-image'] },
  { id: 'native.vertex.nano-banana-pro', label: 'Nano Banana Pro (Server · Vertex AI)', provider: 'vertex', tasks: ['text-to-image', 'image-to-image'] },
  { id: 'native.vertex.veo-3.1', label: 'Veo 3.1 (Server · Vertex AI)', provider: 'vertex', tasks: ['text-to-video', 'image-to-video'] },
  { id: 'native.vertex.veo-3.1-fast', label: 'Veo 3.1 Fast (Server · Vertex AI)', provider: 'vertex', tasks: ['text-to-video', 'image-to-video'] },
  { id: 'native.codex.gpt-image-2', label: 'GPT Image 2 (Server · Codex)', provider: 'codex', tasks: ['text-to-image', 'image-to-image'] },
];

const CAPABILITY_CONSTRAINTS = {
  nanoBananaAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  nanoBanana2ImageSizes: ['512', '1K', '2K'],
  nanoBananaProImageSizes: ['1K', '2K'],
  nanoBananaMaxReferences: 10,
  nanoBananaInputMaxBytes: 7 * 1024 * 1024,
  veoAspectRatios: ['16:9', '9:16'],
  veoDurationsSeconds: [4, 6, 8],
  veoResolutions: ['720p', '1080p'],
  veoI2vInputMaxBytes: 20 * 1024 * 1024,
  veoMaxReferenceImages: 3,
  veoReferenceDurationSeconds: 8,
  codexConcurrency: 1,
  // V1 single-host scheduler caps per provider.
  providerConcurrency: scheduler.PROVIDER_CONCURRENCY,
};

const CREDENTIAL_FIELDS = new Set([
  'apiKey',
  'api_key',
  'x-api-key',
  'googleApplicationCredentials',
  'serviceAccountJson',
  'accessToken',
  'access_token',
  'idToken',
  'codexAuth',
  'authorization',
  'cookie',
]);

const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=';
const MP4_HEX = '00000018667479706d703432000000006d70343269736f6d000000086d646174';
const PNG_1X1 = Buffer.from(PNG_1X1_B64, 'base64');
const MP4_STUB = Buffer.from(MP4_HEX, 'hex');

const idempotencyLocks = new Map();
const queuedLaunchOptions = new Map();
const ALLOWED_INPUT_ROLES = new Set(['first-frame', 'last-frame', 'input', 'start-frame', 'end-frame', 'reference']);

// --- Fake subprocess script (kept here so the gateway ships no extra file) ---
const FAKE_SUBPROCESS_SCRIPT = `
const fs=require('node:fs');
const out=process.env.NMG_FAKE_OUTPUT||'';
const mime=process.env.NMG_FAKE_MIME||'image/png';
const after=Number(process.env.NMG_FAKE_OUTPUT_AFTER_MS||0);
const ttl=Number(process.env.NMG_FAKE_TTL_MS||120000);
const pngB64=process.env.NMG_FAKE_PNG_B64||'';
const mp4Hex=process.env.NMG_FAKE_MP4_HEX||'';
let written=false, exited=false;
function writeOut(){if(!out||written)return;try{const buf=mime==='video/mp4'?Buffer.from(mp4Hex,'hex'):Buffer.from(pngB64,'base64');fs.writeFileSync(out,buf);written=true;}catch(e){}}
function finish(c){if(exited)return;exited=true;process.exit(c);}
if(after>0){setTimeout(()=>{writeOut();finish(0);},after);}else{setTimeout(()=>finish(0),ttl);}
process.on('SIGTERM',()=>finish(143));
process.on('SIGINT',()=>finish(130));
process.on('SIGHUP',()=>finish(129));
`;

async function ensureStore() {
  await fsp.mkdir(ROOT, { recursive: true });
  await Promise.all([ASSETS_DIR, UPLOADS_DIR, TMP_DIR, QUARANTINE_DIR].map((dir) => fsp.mkdir(dir, { recursive: true })));
  for (const file of [JOBS_FILE, IDEMPOTENCY_FILE]) {
    try {
      await fsp.access(file);
    } catch {
      await fsp.writeFile(file, '{}');
    }
  }
}

function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

async function writeJsonAtomic(file, value) {
  await ensureStore();
  const tmp = path.join(TMP_DIR, `${path.basename(file)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
  await fsp.rename(tmp, file);
}

function emit(onEvent, event) {
  if (typeof onEvent === 'function') onEvent(event);
}

function isEnabled() {
  return process.env.NATIVE_MEDIA_ENABLED !== 'false';
}

function providerFor(modelId) {
  const model = MODELS.find((m) => m.id === modelId);
  return model ? model.provider : null;
}

function isVeoModel(modelId) {
  return typeof modelId === 'string' && modelId.startsWith('native.vertex.veo-');
}

function veoReferenceImagesEnabled() {
  return process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES === 'true';
}

function assetUrl(assetId) {
  return `${ASSET_URL_PREFIX}${assetId}`;
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/mp4') return 'mp4';
  return null;
}

function sniffMime(bytes, fallback = '') {
  const b = Buffer.from(bytes || []);
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.slice(4, 8).toString() === 'ftyp') return 'video/mp4';
  return fallback;
}

function validateCredentialFree(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (CREDENTIAL_FIELDS.has(key)) {
      throw new Error(`client-supplied provider credential field is forbidden: ${[...trail, key].join('.')}`);
    }
    if (typeof nested === 'string' && /private_key|BEGIN PRIVATE KEY|GOOGLE_APPLICATION_CREDENTIALS|service_account/i.test(nested)) {
      throw new Error(`client-supplied provider credential value is forbidden: ${[...trail, key].join('.')}`);
    }
    validateCredentialFree(nested, [...trail, key]);
  }
}

function validateGenerationRequest(request) {
  validateCredentialFree(request);
  if (!request || typeof request !== 'object') throw new Error('generation request must be an object');
  if (!MODELS.some((m) => m.id === request.modelId)) throw new Error(`unsupported native model: ${request.modelId}`);
  if (!request.prompt || typeof request.prompt !== 'string') throw new Error('prompt is required');
  const model = MODELS.find((m) => m.id === request.modelId);
  if (!model.tasks.includes(request.task)) throw new Error(`unsupported native task for model: ${request.task}`);
  const inputs = Array.isArray(request.inputs) ? request.inputs : [];
  if (model.id === 'native.vertex.nano-banana-pro') {
    const referenceCount = inputs.reduce((count, input) => count + (input && input.role === 'reference' ? 1 : 0), 0);
    if (referenceCount > 1) {
      throw new Error(`Nano Banana Pro only accepts 1 ref image (reference image limit; got ${referenceCount})`);
    }
  }
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw new Error('native input must be an asset reference');
    if ((input.kind || 'asset') !== 'asset' || input.url) throw new Error('native inputs must use uploaded asset references');
    if (!ALLOWED_INPUT_ROLES.has(input.role || 'input')) throw new Error(`unsupported native input role: ${input.role}`);
    if (isVeoModel(request.modelId) && input.role === 'reference' && !veoReferenceImagesEnabled()) {
      throw new Error('Veo reference images are disabled for this native capability set');
    }
    const assetId = input.assetId || input.asset_id || input.id;
    if (!assetId || typeof assetId !== 'string') throw new Error('native input assetId is required');
    if (/[/\\]/.test(assetId) || assetId.includes('..') || assetId.includes('://') || assetId.startsWith('//')) {
      throw new Error('native input assetId is invalid');
    }
  }
  return { ...request, inputs, parameters: request.parameters || {} };
}

async function validateInputAssets(clean) {
  for (const input of clean.inputs || []) {
    const assetId = input.assetId || input.asset_id || input.id;
    const asset = await getAsset(assetId);
    if (!asset) throw new Error(`native input asset not found: ${assetId}`);
  }
}

function validateUpload(bytes, declaredMime) {
  const mime = sniffMime(bytes, declaredMime);
  const ext = extensionForMime(mime);
  if (!ext) throw new Error(`unsupported upload MIME type: ${declaredMime || 'unknown'}`);
  return { mime, ext };
}

async function saveAsset(bytes, { mime, ext, root = ASSETS_DIR } = {}) {
  await ensureStore();
  const assetId = `asset-${crypto.randomUUID()}`;
  const finalExt = ext || extensionForMime(mime) || 'bin';
  const dir = path.join(root, assetId);
  const tmp = path.join(TMP_DIR, assetId);
  await fsp.mkdir(tmp, { recursive: true });
  const tmpFile = path.join(tmp, `data.${finalExt}`);
  await fsp.writeFile(tmpFile, bytes);
  await fsp.mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `data.${finalExt}`);
  await fsp.rename(tmpFile, finalPath);
  await fsp.rm(tmp, { recursive: true, force: true });
  const meta = { id: assetId, assetId, mime, path: finalPath, url: assetUrl(assetId), createdAt: new Date().toISOString() };
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { assetId, id: assetId, url: meta.url, mime };
}

async function uploadAsset(file) {
  const bytes = Buffer.from(file && (file.bytes || file.buffer || file.data || []));
  const { mime, ext } = validateUpload(bytes, file && (file.mime || file.type));
  return saveAsset(bytes, { mime, ext, root: UPLOADS_DIR });
}

// Import a verified subprocess output file into the native asset store and
// return the same-origin url/outputs descriptor. Falls back to null when the
// output is missing/invalid so callers never synthesize a false success URL.
async function importOutputToAsset(job, expectedMime) {
  if (!job || !job.outputPath) return null;
  let bytes;
  try {
    bytes = await fsp.readFile(job.outputPath);
  } catch {
    return null;
  }
  const mime = sniffMime(bytes, expectedMime);
  if (!mime || (expectedMime && mime !== expectedMime)) return null;
  const asset = await saveAsset(bytes, { mime, ext: extensionForMime(mime) });
  return { assetId: asset.assetId, url: asset.url, outputs: [asset.url], native: true, model: job.modelId };
}

function spawnFakeSubprocess(job, request, providerOpts) {
  const isVideo = /video$/.test(request.task);
  const expectedMime = isVideo ? 'video/mp4' : 'image/png';
  const ext = extensionForMime(expectedMime);
  const jobTmpDir = path.join(TMP_DIR, job.id);
  const outputPath = path.join(jobTmpDir, `output.${ext}`);
  // The after-ms controls when the fake subprocess writes its deterministic
  // output and exits. 0 means stay alive until killed/timeout (cancel test).
  const outputAfterMs = Number(providerOpts.outputAfterMs || 0);
  const ttlMs = Number(providerOpts.subprocessTtlMs || 20000);
  const env = {
    ...process.env,
    NMG_FAKE_OUTPUT: outputPath,
    NMG_FAKE_MIME: expectedMime,
    NMG_FAKE_OUTPUT_AFTER_MS: String(outputAfterMs),
    NMG_FAKE_TTL_MS: String(ttlMs),
    NMG_FAKE_PNG_B64: PNG_1X1_B64,
    NMG_FAKE_MP4_HEX: MP4_HEX,
  };
  const child = require('node:child_process').spawn(process.execPath, ['-e', FAKE_SUBPROCESS_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  return { child, outputPath, expectedMime };
}

// Persist a terminal patch onto a job and emit a terminal event.
async function persistJobPatch(jobId, patch, onEvent) {
  await ensureStore();
  const jobs = readJsonSync(JOBS_FILE);
  const prev = jobs[jobId] || {};
  const next = { ...prev, ...patch, id: prev.id || jobId, request_id: prev.request_id || jobId, updatedAt: new Date().toISOString() };
  jobs[jobId] = next;
  await writeJsonAtomic(JOBS_FILE, jobs);
  if (onEvent) emit(onEvent, { type: 'job_terminal', jobId, status: next.status });
  return next;
}

async function releaseAndDrain(provider, jobId) {
  scheduler.releaseSlot(provider, jobId);
  await drainQueued(provider);
}

// Walk queued jobs for a provider and launch any that now fit under the cap.
async function drainQueued(provider) {
  if (!provider) return;
  await ensureStore();
  const jobs = readJsonSync(JOBS_FILE);
  const queued = Object.values(jobs).filter((j) => j && j.id && j.status === 'queued' && j.provider === provider);
  queued.sort((a, b) => (a.queuedAt || '').localeCompare(b.queuedAt || ''));
  for (const job of queued) {
    if (!scheduler.acquireSlot(provider, job.id)) break;
    const clean = {
      modelId: job.modelId,
      task: job.task,
      prompt: job.prompt,
      parameters: job.parameters || {},
      inputs: job.inputs || [],
      clientRequestId: job.clientRequestId || null,
    };
    try {
      const launchOptions = queuedLaunchOptions.get(job.id) || {};
      queuedLaunchOptions.delete(job.id);
      await launchProviderWork(job, clean, {
        ...launchOptions,
        provider: job.providerConfig || { fake: true },
        liveVertex: job.liveVertex === true || launchOptions.liveVertex === true,
        liveCodex: job.liveCodex === true || launchOptions.liveCodex === true,
      });
    } catch (err) {
      await persistJobPatch(job.id, { status: 'failed', error: 'DRAIN_LAUNCH_FAILED', detail: String(err && err.message) });
      scheduler.releaseSlot(provider, job.id);
    }
  }
}

async function launchProviderWork(job, clean, options) {
  const onEvent = options.onEvent;
  const provider = providerFor(clean.modelId) || job.provider || 'vertex';
  await validateInputAssets(clean);
  emit(onEvent, { type: 'provider_work_started', jobId: job.id, provider });
  const startedAt = new Date().toISOString();
  const runningPatch = { status: 'running', startedAt };
  let runningJob = { ...job, ...runningPatch };
  await persistJobPatch(job.id, runningPatch);
  const providerOpts = options.provider || {};
  let registrationPatch = null;
  let registrationPersist = null;

  function registerProviderSubprocess(child, meta = {}) {
    const pgid = meta.pgid != null ? meta.pgid : child.pid;
    const tracking = scheduler.registerSubprocess(job.id, {
      child,
      provider,
      pgid,
      killGroup: meta.killGroup,
      outputPath: meta.outputPath,
      resolveOutputPath: meta.resolveOutputPath,
      settlePatch: meta.settlePatch,
      expectedMime: meta.expectedMime,
      timeoutMs: meta.timeoutMs,
      onSettle: (id, patch) => onSubprocessSettle(id, patch, onEvent),
      onRelease: (p, jid) => releaseAndDrain(p, jid),
      onDrain: (p) => drainQueued(p),
    });
    registrationPatch = {
      pid: child.pid,
      pgid,
      outputPath: meta.outputPath || null,
      expectedMime: meta.expectedMime || null,
      subprocessProvider: provider,
    };
    registrationPersist = persistJobPatch(job.id, registrationPatch);
    emit(onEvent, { type: 'subprocess_registered', jobId: job.id, pid: child.pid, pgid });
    return tracking;
  }

  async function failBeforeRegistration(err) {
    if (!registrationPatch && !scheduler.isTracked(job.id)) {
      await persistJobPatch(job.id, { status: 'failed', error: 'PROVIDER_LAUNCH_FAILED', detail: String(err && err.message) }, onEvent);
      scheduler.releaseSlot(provider, job.id);
      await drainQueued(provider);
    }
    throw err;
  }

  // C5 live Vertex image runner: opt-in only. Both the explicit caller flag
  // (options.liveVertex) AND the env gate NATIVE_MEDIA_LIVE_VERTEX=1 must be
  // set. The Next route forwards the flag only when that env gate is enabled.
  // Live runners reuse the C1b subprocess recovery hooks.
  if (
    options.liveVertex === true &&
    vertexImageProvider.liveVertexEnabled() &&
    vertexImageProvider.isVertexImageModel(clean.modelId)
  ) {
    let live;
    try {
      live = await vertexImageProvider.runVertexImageProvider(runningJob, clean, {
        scheduler,
        register: registerProviderSubprocess,
        getAsset,
        tmpDir: TMP_DIR,
      }, { spawn: options.spawn, timeoutMs: options.timeoutMs });
    } catch (err) {
      await failBeforeRegistration(err);
    }
    if (registrationPersist) await registrationPersist;
    runningJob = {
      ...runningJob,
      ...registrationPatch,
      pid: live.child.pid,
      pgid: registrationPatch ? registrationPatch.pgid : live.child.pid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
    };
    await persistJobPatch(job.id, {
      pid: live.child.pid,
      pgid: runningJob.pgid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
      subprocessProvider: provider,
    });
    return runningJob;
  }
  if (
    options.liveVertex === true &&
    vertexVideoProvider.liveVertexEnabled() &&
    vertexVideoProvider.isVertexVideoModel(clean.modelId)
  ) {
    let live;
    try {
      live = await vertexVideoProvider.runVertexVideoProvider(runningJob, clean, {
        scheduler,
        register: registerProviderSubprocess,
        getAsset,
        tmpDir: TMP_DIR,
      }, { spawn: options.spawn, timeoutMs: options.timeoutMs });
    } catch (err) {
      await failBeforeRegistration(err);
    }
    if (registrationPersist) await registrationPersist;
    runningJob = {
      ...runningJob,
      ...registrationPatch,
      pid: live.child.pid,
      pgid: registrationPatch ? registrationPatch.pgid : live.child.pid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
    };
    await persistJobPatch(job.id, {
      pid: live.child.pid,
      pgid: runningJob.pgid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
      subprocessProvider: provider,
    });
    return runningJob;
  }

  // C7 live Codex GPT Image runner: opt-in only. Both the explicit caller flag
  // (options.liveCodex) AND the env gate NATIVE_MEDIA_LIVE_CODEX=1 must be set.
  // The Next route forwards the flag only when that env gate is enabled.
  // Output is detected by scanning the clean CODEX_HOME
  // generated_images folder before/after the run and copying the newest new PNG
  // into a job-local path the scheduler verifies + the gateway imports — same
  // settle hooks as C5/C6. No new PNG => OUTPUT_MISSING; >1 new PNG => newest
  // chosen + safe ambiguity count (no Codex-home paths reach the browser).
  // codexHome/generatedImagesDir are server/test injection points only.
  if (
    options.liveCodex === true &&
    codexImageProvider.liveCodexEnabled() &&
    codexImageProvider.isCodexImageModel(clean.modelId)
  ) {
    const codexResolveMetaRef = { current: null };
    function registerCodexSubprocess(child, meta = {}) {
      const pgid = meta.pgid != null ? meta.pgid : child.pid;
      const tracking = scheduler.registerSubprocess(job.id, {
        child,
        provider,
        pgid,
        outputPath: meta.outputPath,
        resolveOutputPath: meta.resolveOutputPath,
        expectedMime: meta.expectedMime,
        timeoutMs: meta.timeoutMs,
        onSettle: async (id, patch) => {
          // Merge C7 resolve metadata into the SAME terminal patch before the
          // first persist. Reading codexResolveMetaRef here is safe because the
          // scheduler runs resolveOutputPath() (which populates resolveMeta)
          // synchronously inside findVerifiedOutputPath() BEFORE it calls
          // settle()/onSettle. Resolving the metadata here — instead of a second
          // persistJobPatch after onSubprocessSettle has already persisted the
          // terminal state — means clients never observe a terminal job
          // without the ambiguity metadata, and a missing-output job is
          // persisted as OUTPUT_MISSING on the first terminal patch.
          const rm = codexResolveMetaRef.current;
          let merged = patch;
          if (rm) {
            if (rm.missing) {
              // Rewrite the scheduler's no-output terminal shape to the final
              // OUTPUT_MISSING error on the first terminal persist. resolveMeta
              // is only marked missing when no new PNG was produced, which only
              // happens when the scheduler settles with a non-completed status
              // (OUTCOME_UNKNOWN/INTERRUPTED_PROCESS), so this never overwrites
              // a genuine completion.
              merged = { ...merged, error: 'OUTPUT_MISSING' };
            }
            if (rm.ambiguityDetected && merged && merged.status === 'completed') {
              merged = { ...merged, codexOutputAmbiguity: { newPngCount: rm.newPngCount } };
            }
            if (rm.codexDiagnostics) {
              merged = { ...merged, codexDiagnostics: rm.codexDiagnostics };
            }
          }
          await onSubprocessSettle(id, merged, onEvent);
        },
        onRelease: (p, jid) => releaseAndDrain(p, jid),
        onDrain: (p) => drainQueued(p),
      });
      registrationPatch = {
        pid: child.pid,
        pgid,
        outputPath: meta.outputPath || null,
        expectedMime: meta.expectedMime || null,
        subprocessProvider: provider,
      };
      registrationPersist = persistJobPatch(job.id, registrationPatch);
      emit(onEvent, { type: 'subprocess_registered', jobId: job.id, pid: child.pid, pgid });
      return tracking;
    }
    let live;
    try {
      live = await codexImageProvider.runCodexImageProvider(runningJob, clean, {
        scheduler,
        register: registerCodexSubprocess,
        getAsset,
        tmpDir: TMP_DIR,
      }, {
        spawn: options.spawn,
        timeoutMs: options.timeoutMs,
        codexHome: options.codexHome,
        generatedImagesDir: options.generatedImagesDir,
      });
      codexResolveMetaRef.current = live.resolveMeta;
    } catch (err) {
      await failBeforeRegistration(err);
    }
    if (registrationPersist) await registrationPersist;
    runningJob = {
      ...runningJob,
      ...registrationPatch,
      pid: live.child.pid,
      pgid: registrationPatch ? registrationPatch.pgid : live.child.pid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
    };
    await persistJobPatch(job.id, {
      pid: live.child.pid,
      pgid: runningJob.pgid,
      outputPath: live.outputPath,
      expectedMime: live.expectedMime,
      subprocessProvider: provider,
    });
    return runningJob;
  }

  if (providerOpts.fake === false && typeof options.runProvider === 'function') {
    // Real provider adapter path (C5/C6/C7). The adapter spawns the provider
    // subprocess and registers it with the scheduler using the same hooks.
    try {
      await options.runProvider(runningJob, clean, {
        scheduler,
        register: registerProviderSubprocess,
        getAsset,
        tmpDir: TMP_DIR,
        spawn: options.spawn,
        outputPath: null,
      });
    } catch (err) {
      await failBeforeRegistration(err);
    }
    if (registrationPersist) await registrationPersist;
    return registrationPatch ? { ...runningJob, ...registrationPatch } : runningJob;
  }
  if (providerOpts.fake === false) {
    const detail = 'real provider requested but no real provider runner is available';
    await persistJobPatch(job.id, { status: 'failed', error: 'REAL_PROVIDER_UNAVAILABLE', detail }, onEvent);
    scheduler.releaseSlot(provider, job.id);
    await drainQueued(provider);
    throw new Error(detail);
  }
  // Fake provider.
  if (providerOpts.longRunning) {
    const { child, outputPath, expectedMime } = spawnFakeSubprocess(runningJob, clean, providerOpts);
    const timeoutMs = Number(providerOpts.timeoutMs || 25000);
    scheduler.registerSubprocess(job.id, {
      child,
      provider,
      outputPath,
      expectedMime,
      timeoutMs,
      onSettle: (id, patch) => onSubprocessSettle(id, patch, onEvent),
      onRelease: (p, jid) => releaseAndDrain(p, jid),
      onDrain: (p) => drainQueued(p),
    });
    runningJob = {
      ...runningJob,
      pid: child.pid,
      pgid: child.pid,
      outputPath,
      expectedMime,
      subprocessProvider: provider,
    };
    await persistJobPatch(job.id, { pid: child.pid, pgid: child.pid, outputPath, expectedMime, subprocessProvider: provider });
    emit(onEvent, { type: 'subprocess_registered', jobId: job.id, pid: child.pid, pgid: child.pid });
    return runningJob;
  }
  // Synchronous fake completion (default for non-long-running).
  const isVideo = /video$/.test(clean.task);
  const asset = await saveAsset(isVideo ? MP4_STUB : PNG_1X1, {
    mime: isVideo ? 'video/mp4' : 'image/png',
    ext: isVideo ? 'mp4' : 'png',
  });
  const completedAt = new Date().toISOString();
  const completed = {
    ...runningJob,
    status: 'completed',
    assetId: asset.assetId,
    url: asset.url,
    outputs: [asset.url],
    completedAt,
    native: true,
    model: clean.modelId,
    outputVerified: true,
  };
  await persistJobPatch(job.id, {
    status: 'completed',
    assetId: asset.assetId,
    url: asset.url,
    outputs: [asset.url],
    completedAt,
    native: true,
    model: clean.modelId,
    outputVerified: true,
  });
  scheduler.releaseSlot(provider, job.id);
  await drainQueued(provider);
  return completed;
}

// Subprocess settle callback: import verified output into the asset store,
// persist the terminal patch, release the slot, and drain queued jobs.
async function onSubprocessSettle(jobId, patch, onEvent) {
  if (patch && patch.status === 'completed') {
    const jobs = readJsonSync(JOBS_FILE);
    const job = jobs[jobId] || {};
    if (!job.url || !job.assetId) {
      const settledJob = { ...job, outputPath: patch.outputPath || job.outputPath, expectedMime: patch.expectedMime || job.expectedMime };
      const imported = await importOutputToAsset(settledJob, settledJob.expectedMime);
      if (imported) {
        patch = { ...patch, ...imported, completedAt: new Date().toISOString() };
      } else {
        patch = { status: 'OUTCOME_UNKNOWN', error: 'OUTPUT_IMPORT_FAILED' };
      }
    }
  }
  await persistJobPatch(jobId, patch, onEvent);
}

async function submitGeneration(request, options = {}) {
  await ensureStore();
  const idempotencyKey = request && typeof request === 'object' ? request.clientRequestId || null : null;
  if (!idempotencyKey) return submitGenerationUnlocked(request, options);
  const prev = idempotencyLocks.get(idempotencyKey) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => submitGenerationUnlocked(request, options));
  idempotencyLocks.set(idempotencyKey, next);
  try {
    return await next;
  } finally {
    if (idempotencyLocks.get(idempotencyKey) === next) idempotencyLocks.delete(idempotencyKey);
  }
}

async function submitGenerationUnlocked(clean, options = {}) {
  await ensureStore();
  const jobs = readJsonSync(JOBS_FILE);
  const idempotency = readJsonSync(IDEMPOTENCY_FILE);
  const idempotencyKey = clean && clean.clientRequestId || null;

  if (idempotencyKey && idempotency[idempotencyKey] && jobs[idempotency[idempotencyKey]]) {
    return jobs[idempotency[idempotencyKey]];
  }
  clean = validateGenerationRequest(clean);
  await validateInputAssets(clean);

  const id = `job-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const provider = providerFor(clean.modelId) || 'vertex';
  let job = {
    id,
    request_id: id,
    status: 'created',
    modelId: clean.modelId,
    model: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    parameters: clean.parameters,
    inputs: clean.inputs,
    clientRequestId: idempotencyKey,
    createdAt: now,
    native: true,
    provider,
    providerConfig: options.provider || { fake: true },
    liveVertex: options.liveVertex === true,
    liveCodex: options.liveCodex === true,
  };

  jobs[id] = job;
  if (idempotencyKey) idempotency[idempotencyKey] = id;
  await writeJsonAtomic(JOBS_FILE, jobs);
  await writeJsonAtomic(IDEMPOTENCY_FILE, idempotency);
  emit(options.onEvent, { type: 'job_created', jobId: id });

  const acquired = scheduler.acquireSlot(provider, id);
  if (!acquired) {
    job = { ...job, status: 'queued', queuedAt: new Date().toISOString() };
    queuedLaunchOptions.set(id, options);
    await persistJobPatch(id, { status: 'queued', queuedAt: job.queuedAt });
    emit(options.onEvent, { type: 'job_queued', jobId: id, provider });
    return job;
  }

  return launchProviderWork(job, clean, options);
}

async function getGeneration(id) {
  await ensureStore();
  return readJsonSync(JOBS_FILE)[id] || null;
}

async function cancelGeneration(id) {
  await ensureStore();
  const jobs = readJsonSync(JOBS_FILE);
  const job = jobs[id];
  if (!job) return null;
  const provider = job.provider || providerFor(job.modelId) || 'vertex';
  const result = scheduler.cancelSubprocess(id, 'SIGTERM');
  if (result.tracked) {
    // Force-settle cancelled now so the caller sees the terminal state; the
    // child exit handler will be a no-op because the tracking is already
    // marked settled.
    await scheduler.forceSettleCancelled(id, { cancelRequested: true });
  }
  const patch = {
    status: 'cancelled',
    cancelled: true,
    killed: result.tracked ? !!result.killed : true,
    cancelledAt: new Date().toISOString(),
  };
  const next = await persistJobPatch(id, patch);
  return next;
}

// Restart reconciliation for a single job (no auto-resubmit). Verified output
// for a previously-assetless job is imported into the asset store so the browser
// receives a real same-origin URL; a completed job whose output file has gone
// missing is marked ASSET_UNAVAILABLE rather than returning a false success URL.
async function reconcileJob(job) {
  if (!job) return null;
  let patch = await scheduler.reconcileJobState(job, {
    isAlive: (pid) => scheduler.isPidAlive(pid),
    verifyOutput: scheduler.verifyOutput,
  });
  if (job.status === 'running' && scheduler.isPidAlive(job.pgid || job.pid)) {
    scheduler.acquireSlot(job.provider || providerFor(job.modelId) || 'vertex', job.id);
  }
  if (!patch) return job;
  if (patch.status === 'completed' && job.outputPath && !job.url) {
    const imported = await importOutputToAsset(job, job.expectedMime);
    if (imported) {
      patch = { ...patch, ...imported, completedAt: new Date().toISOString() };
    } else {
      patch = { status: 'OUTCOME_UNKNOWN', error: 'OUTPUT_IMPORT_FAILED' };
    }
  }
  const next = await persistJobPatch(job.id, patch);
  return next;
}

// Startup sweep over the job store: settle every non-terminal job without ever
// resubmitting provider work. Returns counts for observability.
//
// Legacy/malformed records are settled by store key, not by `job.id`, because a
// record missing its `id` field (or its `status` field) would otherwise be
// written back to a junk `"undefined"` key and left non-terminal forever. The
// store key is the durable identity for such records; reconciliation backfills
// `id`/`request_id` from the key when persisting.
async function reconcileOnRestart() {
  await ensureStore();
  const jobs = readJsonSync(JOBS_FILE);
  const counts = { running: 0, queued: 0, completed: 0, interrupted: 0, unknown: 0, assetUnavailable: 0, unchanged: 0 };
  for (const [key, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    // Backfill the durable identity so persistJobPatch targets the real key.
    const normalized = job.id ? job : { ...job, id: key };
    const before = normalized.status;
    const next = await reconcileJob(normalized);
    if (next === normalized || next.status === before) {
      counts.unchanged += 1;
      continue;
    }
    if (next.status === 'completed') counts.completed += 1;
    else if (next.status === 'INTERRUPTED_PROCESS') counts.interrupted += 1;
    else if (next.status === 'OUTCOME_UNKNOWN') counts.unknown += 1;
    else if (next.status === 'ASSET_UNAVAILABLE') counts.assetUnavailable += 1;
    else if (next.status === 'running') counts.running += 1;
    else if (next.status === 'queued') counts.queued += 1;
  }
  return counts;
}

function getNativeCapabilities() {
  if (!isEnabled()) return { models: [], constraints: CAPABILITY_CONSTRAINTS, native: true };
  return { models: MODELS, constraints: CAPABILITY_CONSTRAINTS, native: true };
}

async function getAsset(assetId) {
  await ensureStore();
  for (const root of [ASSETS_DIR, UPLOADS_DIR]) {
    const dir = path.join(root, path.basename(assetId || ''));
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
      const file = meta.path;
      if (!file || !path.resolve(file).startsWith(ROOT)) return null;
      const stats = await fsp.stat(file);
      if (!stats.isFile()) return null;
      return { ...meta, size: stats.size };
    } catch {
      // Try the next store.
    }
  }
  return null;
}

const PROVIDER_CONCURRENCY = scheduler.PROVIDER_CONCURRENCY;

module.exports = {
  ASSET_URL_PREFIX,
  MODELS,
  CAPABILITY_CONSTRAINTS,
  PROVIDER_CONCURRENCY,
  vertexImageProvider,
  vertexVideoProvider,
  codexImageProvider,
  assetUrl,
  cancelGeneration,
  cancelJob: cancelGeneration,
  createGeneration: submitGeneration,
  getAsset,
  getGeneration,
  getNativeCapabilities,
  providerFor,
  reconcileJob,
  reconcileOnRestart,
  scheduler,
  submitGeneration,
  uploadAsset,
  validateGenerationRequest,
  validateRequest: validateGenerationRequest,
  validateUpload,
};
