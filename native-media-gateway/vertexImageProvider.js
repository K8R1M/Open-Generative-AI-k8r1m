'use strict';

// C5 — Vertex image provider adapter for the Native Media Gateway (V1).
//
// It is NOT a raw Vertex/GCS transport. It spawns the wrapper with `shell:false`,
// fixed executable paths, and a narrow environment allowlist. Service-account
// ADC may pass only when the worker explicitly opts in with
// `NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS=1`.
// registers the resulting subprocess with the C1b single-host scheduler so
// cancel/timeout/restart reconciliation reuse the same hooks as the fake runner.
//
// The live runner is present but never invoked by default: callers must opt in
// explicitly (`options.liveVertex === true`) AND set the env gate
// `NATIVE_MEDIA_LIVE_VERTEX=1`. The Next route forwards live intent only when
// that env gate is enabled.
//
// No service-account JSON, GCS bucket, or Google auth header is read, logged, or
// surfaced here. The wrapper loads managed credentials from its own .env or from
// the gated worker env; browser/client input can never supply credentials.

const path = require('node:path');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

// Fixed executable paths — never overridden by browser-supplied input.
const REPO_ROOT = path.resolve(__dirname, '..');
const VERTEX_IMAGE_PYTHON = path.join(REPO_ROOT, '.native-media', 'venv', 'bin', 'python3');
const VERTEX_IMAGE_SCRIPT = path.join(__dirname, 'bin', 'genai-image');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// Native model id -> genai-image --model alias (wrapper contract).
const MODEL_ALIAS = {
  'native.vertex.nano-banana-2': 'nano-banana-2',
  'native.vertex.nano-banana-pro': 'nano-banana-pro',
};
const NANO_BANANA_PRO_MODEL_ID = 'native.vertex.nano-banana-pro';

const VERTEX_IMAGE_MODELS = new Set(Object.keys(MODEL_ALIAS));

// Frozen V1 capability constraints for the Vertex image path. Mirrored from the
// shared contract (tests/fixtures/nativeContract.js + gateway exports) so this
// adapter stays decoupled from the gateway module and never reads credentials.
const CONSTRAINTS = {
  supportedInputMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
  inputMaxBytes: 7 * 1024 * 1024,
  maxReferences: 10,
  aspectRatios: new Set([
    '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
  ]),
  nanoBanana2ImageSizes: new Set(['512', '1K', '2K']),
  nanoBananaProImageSizes: new Set(['1K', '2K']),
};

const PRIMARY_ROLES = new Set(['input', 'image', 'first-frame', 'start-frame']);
const REFERENCE_ROLES = new Set(['reference']);
const ALLOWED_ROLES = new Set([...PRIMARY_ROLES, ...REFERENCE_ROLES]);

// Environment variables passed through to the wrapper subprocess. Operational
// values are always allowlisted. Service-account ADC is allowed only from a
// trusted worker env that sets NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS.
const ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'GOOGLE_CLOUD_PROJECT',
]);

const GATED_GOOGLE_ADC_ENV = 'GOOGLE_APPLICATION_CREDENTIALS';
const GATED_GOOGLE_ADC_ALLOW_ENV = 'NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS';

// Names that must NEVER be passed through. GOOGLE_APPLICATION_CREDENTIALS is
// handled separately by the explicit gated path above.
const ENV_DENYLIST = new Set([
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_SECONDARY',
  'GOOGLE-api-key',
  'x-api-key',
  'authorization',
  'cookie',
  'codexAuth',
]);

function isVertexImageModel(modelId) {
  return modelId && VERTEX_IMAGE_MODELS.has(modelId);
}

function liveVertexEnabled() {
  return process.env.NATIVE_MEDIA_LIVE_VERTEX === '1';
}

// Build a minimal, credential-free environment for the wrapper subprocess.
// Starts from an empty object and copies only allowlisted, non-denied keys.
function buildEnv(baseEnv) {
  const env = {};
  const src = baseEnv && typeof baseEnv === 'object' ? baseEnv : process.env;
  for (const key of ENV_ALLOWLIST) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    if (ENV_DENYLIST.has(key)) continue;
    env[key] = String(value);
  }
  if (
    src[GATED_GOOGLE_ADC_ALLOW_ENV] === '1' &&
    typeof src[GATED_GOOGLE_ADC_ENV] === 'string' &&
    src[GATED_GOOGLE_ADC_ENV]
  ) {
    env[GATED_GOOGLE_ADC_ALLOW_ENV] = '1';
    env[GATED_GOOGLE_ADC_ENV] = src[GATED_GOOGLE_ADC_ENV];
  }
  return env;
}

// Parse a `MEDIA:/absolute/output.png` line from wrapper stdout. Returns the
// path or null. The wrapper always writes the requested --output path AND
// prints `MEDIA:<path>`, so either signal confirms success.
function parseMediaStdout(stdout) {
  if (!stdout || typeof stdout !== 'string') return null;
  const match = stdout.match(/MEDIA:(.+)/);
  return match ? match[1].trim() : null;
}

function redactProviderText(text, { prompt, outputPath } = {}) {
  let out = String(text || '');
  if (prompt) out = out.split(String(prompt)).join('<prompt>');
  if (outputPath) out = out.split(String(outputPath)).join('<output>');
  out = out.split(REPO_ROOT).join('<repo>');
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (creds) out = out.split(String(creds)).join('<google-credentials>');
  return out.slice(-4096);
}

// Resolve the role of an input into either 'primary' or 'reference'. Unknown
// roles are rejected upstream by validateVertexImageInputs.
function classifyRole(role) {
  if (PRIMARY_ROLES.has(role)) return 'primary';
  if (REFERENCE_ROLES.has(role)) return 'reference';
  return null;
}

// Build the genai-image argv from a clean, validated request. Pure function:
// no spawn, no fs, no I/O — fully unit-testable.
//
// `inputPaths` is the ordered list of resolved local file paths classified by
// role: `[{ role: 'primary'|'reference', path, mime }]`. The first primary
// becomes `--input-image`; references become repeated `--reference-image`.
function buildVertexImageArgs(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('buildVertexImageArgs requires an options object');
  const alias = MODEL_ALIAS[opts.modelId];
  if (!alias) throw new Error(`unsupported Vertex image model: ${opts.modelId}`);
  if (typeof opts.prompt !== 'string') throw new Error('prompt is required');
  if (!opts.outputPath || typeof opts.outputPath !== 'string') throw new Error('outputPath is required');
  if (opts.task !== 'text-to-image' && opts.task !== 'image-to-image') {
    throw new Error(`unsupported Vertex image task: ${opts.task}`);
  }

  const argv = [VERTEX_IMAGE_SCRIPT];
  argv.push('--prompt', opts.prompt);
  argv.push('--model', alias);
  argv.push('--output', opts.outputPath);

  const parameters = opts.parameters || {};
  if (parameters.aspectRatio != null) {
    argv.push('--aspect-ratio', String(parameters.aspectRatio));
  }
  if (parameters.imageSize != null) {
    argv.push('--image-size', String(parameters.imageSize));
  }

  const inputPaths = Array.isArray(opts.inputPaths) ? opts.inputPaths : [];
  let primaryUsed = false;
  for (const entry of inputPaths) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.role === 'primary') {
      if (primaryUsed) throw new Error('Nano Banana supports at most one primary input image');
      argv.push('--input-image', entry.path);
      primaryUsed = true;
    } else if (entry.role === 'reference') {
      argv.push('--reference-image', entry.path);
    }
  }

  return argv;
}

// Validate the declared inputs *and* their resolved local files before any
// provider subprocess is spawned. Rejects unsupported MIME, oversized inputs,
// too many references, non-asset inputs (SSRF guard), and malformed roles.
//
// `resolvedFiles` mirrors the shape returned by resolveInputAssets:
//   [{ role: 'primary'|'reference', path, mime, size }]
async function validateVertexImageInputs(opts) {
  const constraints = opts.constraints || CONSTRAINTS;
  const maxReferenceImages = opts.modelId === NANO_BANANA_PRO_MODEL_ID ? 1 : constraints.maxReferences;
  const inputs = Array.isArray(opts.inputs) ? opts.inputs : [];
  const resolved = Array.isArray(opts.resolvedFiles) ? opts.resolvedFiles : [];

  if (resolved.length !== inputs.length) {
    throw new Error('input resolution mismatch: every input must resolve to a local asset');
  }

  let primaryCount = 0;
  let referenceCount = 0;
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if (input.kind !== 'asset') {
      throw new Error('Vertex image inputs must be native asset references (external URLs are forbidden)');
    }
    if (!input.assetId) throw new Error('Vertex image input is missing an assetId');
    const role = input.role;
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error(`unsupported Vertex image input role: ${role}`);
    }
    if (PRIMARY_ROLES.has(role)) primaryCount += 1;
    else if (REFERENCE_ROLES.has(role)) referenceCount += 1;
  }

  if (primaryCount > 1) {
    throw new Error('Nano Banana supports at most one primary input image');
  }
  if (referenceCount > maxReferenceImages) {
    if (opts.modelId === NANO_BANANA_PRO_MODEL_ID) {
      throw new Error(`Nano Banana Pro only accepts 1 ref image (reference image limit; got ${referenceCount})`);
    }
    throw new Error(`Nano Banana reference images exceed maximum of ${constraints.maxReferences} (got ${referenceCount})`);
  }

  for (const file of resolved) {
    if (!file || !file.path) throw new Error('resolved input is missing a local path');
    const mime = file.mime;
    if (!constraints.supportedInputMime.has(mime)) {
      throw new Error(`unsupported Vertex image input MIME type: ${mime || 'unknown'}`);
    }
    if (typeof file.size === 'number' && file.size > constraints.inputMaxBytes) {
      throw new Error(`Vertex image input exceeds max bytes (${constraints.inputMaxBytes}): ${file.path}`);
    }
  }

  // image-to-image requires at least one image input (primary or reference).
  if (opts.task === 'image-to-image' && primaryCount === 0 && referenceCount === 0) {
    throw new Error('image-to-image requires at least one input image');
  }

  return true;
}

// Resolve native asset inputs to local file paths server-side. Only same-origin
// native asset references are accepted — this is the SSRF boundary: client URLs,
// external hosts, file:// URIs, and non-asset kinds are rejected before any
// provider call. `getAsset` is supplied by the gateway (same object serving
// `/api/native-media/v1/assets/:assetId`).
async function resolveInputAssets(inputs, getAsset, opts = {}) {
  const out = [];
  const list = Array.isArray(inputs) ? inputs : [];
  for (const input of list) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if (input.kind !== 'asset') {
      throw new Error('Vertex image inputs must be native asset references (external URLs are forbidden)');
    }
    const assetId = input.assetId;
    if (!assetId || typeof assetId !== 'string') throw new Error('Vertex image input is missing an assetId');
    // Reject obvious path traversal / non-opaque IDs before lookup.
    if (/[/\\]/.test(assetId) || assetId.includes('..')) {
      throw new Error('invalid native asset id');
    }
    const asset = await getAsset(assetId);
    if (!asset || !asset.path) {
      throw new Error(`native input asset not found: ${assetId}`);
    }
    const role = classifyRole(input.role);
    if (!role) throw new Error(`unsupported Vertex image input role: ${input.role}`);
    let size;
    try {
      size = (await fsp.stat(asset.path)).size;
    } catch {
      size = undefined;
    }
    out.push({ role, path: asset.path, mime: asset.mime, size, assetId });
  }
  return out;
}

// The live runner. Resolves inputs, validates, builds argv, spawns the wrapper
// with shell:false + env allowlist, and registers the child with the C1b
// scheduler via ctx.register. On child exit the scheduler verifies the output
// file (PNG magic bytes match) and the gateway's onSubprocessSettle imports it
// into the native asset store — identical to the fake long-running path.
async function runVertexImageProvider(job, clean, ctx, opts = {}) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('runVertexImageProvider requires ctx.register (scheduler hook)');
  const getAsset = ctx.getAsset;
  if (typeof getAsset !== 'function') throw new Error('runVertexImageProvider requires ctx.getAsset (native asset resolver)');
  const tmpDir = ctx.tmpDir || path.join(process.cwd(), '.native-media', 'tmp');

  const resolved = await resolveInputAssets(clean.inputs, getAsset, opts);
  await validateVertexImageInputs({
    modelId: clean.modelId,
    inputs: clean.inputs,
    resolvedFiles: resolved,
    constraints: CONSTRAINTS,
    task: clean.task,
  });

  const jobDir = path.join(tmpDir, job.id);
  await fsp.mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, 'output.png');

  const argv = buildVertexImageArgs({
    modelId: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    parameters: clean.parameters,
    inputPaths: resolved,
    outputPath,
  });

  const env = buildEnv(opts.env || process.env);
  const spawnFn = opts.spawn || spawn;

  const child = spawnFn(VERTEX_IMAGE_PYTHON, argv, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: false,
  });
  if (!child || typeof child.pid !== 'number') {
    throw new Error('genai-image wrapper failed to spawn a tracked subprocess');
  }

  // Capture stdout so callers/tests can assert the MEDIA: signal; the scheduler
  // independently verifies the requested output file, so stdout is secondary.
  let stdout = '';
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // Bound captured stdout so a runaway wrapper can't fill memory.
      if (stdout.length > 64 * 1024) stdout = stdout.slice(-64 * 1024);
    });
  }
  let stderr = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });
  }

  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || ctx.timeoutMs || DEFAULT_TIMEOUT_MS));
  ctx.register(child, {
    outputPath,
    expectedMime: 'image/png',
    timeoutMs,
    killGroup: false,
    // Prefer wrapper MEDIA stdout when present; fall back to requested --output.
    resolveOutputPath: () => parseMediaStdout(stdout) || outputPath,
    settlePatch: (patch) => {
      if (!stderr || patch.status === 'completed') return null;
      return { detail: redactProviderText(stderr, { prompt: clean.prompt, outputPath }) };
    },
  });

  return { child, outputPath, expectedMime: 'image/png', argv, env };
}

module.exports = {
  VERTEX_IMAGE_PYTHON,
  VERTEX_IMAGE_SCRIPT,
  MODEL_ALIAS,
  VERTEX_IMAGE_MODELS,
  CONSTRAINTS,
  ENV_ALLOWLIST,
  ENV_DENYLIST,
  DEFAULT_TIMEOUT_MS,
  isVertexImageModel,
  liveVertexEnabled,
  buildEnv,
  parseMediaStdout,
  redactProviderText,
  buildVertexImageArgs,
  validateVertexImageInputs,
  resolveInputAssets,
  runVertexImageProvider,
};
