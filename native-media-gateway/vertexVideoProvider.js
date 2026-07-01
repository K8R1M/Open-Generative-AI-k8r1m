'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const VERTEX_VIDEO_PYTHON = path.join(REPO_ROOT, '.native-media', 'venv', 'bin', 'python3');
const VERTEX_VIDEO_SCRIPT = path.join(__dirname, 'bin', 'genai-video');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

const MODEL_ALIAS = {
  'native.vertex.veo-3.1': 'veo-3.1',
  'native.vertex.veo-3.1-fast': 'veo-3.1-fast',
};

const VERTEX_VIDEO_MODELS = new Set(Object.keys(MODEL_ALIAS));

const CONSTRAINTS = {
  supportedInputMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
  inputMaxBytes: 20 * 1024 * 1024,
  maxReferences: 3,
  referenceDurationSeconds: 8,
  durationsSeconds: new Set([4, 6, 8]),
  aspectRatios: new Set(['16:9', '9:16']),
  resolutions: new Set(['720p', '1080p']),
};

const START_ROLES = new Set(['first-frame', 'start-frame', 'input', 'image']);
const LAST_ROLES = new Set(['last-frame', 'end-frame']);
const REFERENCE_ROLES = new Set(['reference']);
const ALLOWED_ROLES = new Set([...START_ROLES, ...LAST_ROLES, ...REFERENCE_ROLES]);

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

const ENV_DENYLIST = new Set([
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_SECONDARY',
  'GOOGLE-api-key',
  'x-api-key',
  'authorization',
  'cookie',
  'codexAuth',
]);

function isVertexVideoModel(modelId) {
  return modelId && VERTEX_VIDEO_MODELS.has(modelId);
}

function liveVertexEnabled() {
  return process.env.NATIVE_MEDIA_LIVE_VERTEX === '1';
}

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
    typeof src[GATED_GOOGLE_ADC_ENV] === 'string' &&
    src[GATED_GOOGLE_ADC_ENV]
  ) {
    env[GATED_GOOGLE_ADC_ALLOW_ENV] = '1';
    env[GATED_GOOGLE_ADC_ENV] = src[GATED_GOOGLE_ADC_ENV];
  }
  return env;
}

function parseMediaStdout(stdout) {
  if (!stdout || typeof stdout !== 'string') return null;
  const match = stdout.match(/MEDIA:(.+)/);
  return match ? match[1].trim() : null;
}

function redactProviderText(text, { prompt, credentialPath } = {}) {
  let out = String(text || '');
  if (prompt) out = out.split(String(prompt)).join('<prompt>');
  out = out.split(REPO_ROOT).join('<repo>');
  for (const creds of [process.env.GOOGLE_APPLICATION_CREDENTIALS, credentialPath]) {
    if (creds) out = out.split(String(creds)).join('<google-credentials>');
  }
  return out.slice(-4096);
}

function classifyRole(role) {
  if (START_ROLES.has(role)) return 'start';
  if (LAST_ROLES.has(role)) return 'last';
  if (REFERENCE_ROLES.has(role)) return 'reference';
  return null;
}

function getDuration(parameters) {
  return Number(parameters.durationSeconds ?? parameters.duration);
}

function buildVertexVideoArgs(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('buildVertexVideoArgs requires an options object');
  const alias = MODEL_ALIAS[opts.modelId];
  if (!alias) throw new Error(`unsupported Vertex video model: ${opts.modelId}`);
  if (typeof opts.prompt !== 'string') throw new Error('prompt is required');
  if (!opts.outputPath || typeof opts.outputPath !== 'string') throw new Error('outputPath is required');
  if (opts.task !== 'text-to-video' && opts.task !== 'image-to-video') {
    throw new Error(`unsupported Vertex video task: ${opts.task}`);
  }

  const parameters = opts.parameters || {};
  const duration = getDuration(parameters);
  if (!CONSTRAINTS.durationsSeconds.has(duration)) throw new Error(`unsupported Veo duration: ${parameters.durationSeconds ?? parameters.duration}`);
  const aspect = parameters.aspectRatio ?? parameters.aspect_ratio;
  if (aspect != null && !CONSTRAINTS.aspectRatios.has(String(aspect))) throw new Error(`unsupported Veo aspect ratio: ${aspect}`);
  const resolution = parameters.resolution;
  if (resolution != null && !CONSTRAINTS.resolutions.has(String(resolution))) throw new Error(`unsupported Veo resolution: ${resolution}`);

  const argv = [VERTEX_VIDEO_SCRIPT];
  argv.push('--prompt', opts.prompt);
  argv.push('--model', alias);
  argv.push('--duration', String(duration));
  if (aspect != null) argv.push('--aspect-ratio', String(aspect));
  if (resolution != null) argv.push('--resolution', String(resolution));
  if (parameters.audio === false) argv.push('--no-audio');
  argv.push('--output', opts.outputPath);

  const inputPaths = Array.isArray(opts.inputPaths) ? opts.inputPaths : [];
  let startUsed = false;
  let lastUsed = false;
  let referenceCount = 0;
  for (const entry of inputPaths) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.role === 'start') {
      if (startUsed) throw new Error('Veo supports at most one start frame');
      argv.push('--input-image', entry.path);
      startUsed = true;
    } else if (entry.role === 'last') {
      if (lastUsed) throw new Error('Veo supports at most one last frame');
      argv.push('--last-frame', entry.path);
      lastUsed = true;
    } else if (entry.role === 'reference') {
      referenceCount += 1;
      argv.push('--reference-image', entry.path);
    }
  }
  if (lastUsed && !startUsed) throw new Error('Veo last frame requires a start frame');
  if (lastUsed && duration !== CONSTRAINTS.referenceDurationSeconds) {
    throw new Error(`Veo last frame requires ${CONSTRAINTS.referenceDurationSeconds}s duration`);
  }
  if (referenceCount > CONSTRAINTS.maxReferences) throw new Error(`Veo reference images exceed maximum of ${CONSTRAINTS.maxReferences}`);
  if (referenceCount > 0 && duration !== CONSTRAINTS.referenceDurationSeconds) {
    throw new Error(`Veo reference images require ${CONSTRAINTS.referenceDurationSeconds}s duration`);
  }

  return argv;
}

async function validateVertexVideoInputs(opts) {
  const constraints = opts.constraints || CONSTRAINTS;
  const inputs = Array.isArray(opts.inputs) ? opts.inputs : [];
  const resolved = Array.isArray(opts.resolvedFiles) ? opts.resolvedFiles : [];

  if (resolved.length !== inputs.length) {
    throw new Error('input resolution mismatch: every input must resolve to a local asset');
  }

  let startCount = 0;
  let lastCount = 0;
  let referenceCount = 0;
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if (input.kind !== 'asset') {
      throw new Error('Vertex video inputs must be native asset references (external URLs are forbidden)');
    }
    if (!input.assetId) throw new Error('Vertex video input is missing an assetId');
    if (!ALLOWED_ROLES.has(input.role)) throw new Error(`unsupported Vertex video input role: ${input.role}`);
    if (START_ROLES.has(input.role)) startCount += 1;
    else if (LAST_ROLES.has(input.role)) lastCount += 1;
    else if (REFERENCE_ROLES.has(input.role)) referenceCount += 1;
  }

  if (startCount > 1) throw new Error('Veo supports at most one start frame');
  if (lastCount > 1) throw new Error('Veo supports at most one last frame');
  if (lastCount > 0 && startCount === 0) throw new Error('Veo last frame requires a start frame');
  const duration = getDuration(opts.parameters || {});
  if (lastCount > 0 && duration !== constraints.referenceDurationSeconds) {
    throw new Error(`Veo last frame requires ${constraints.referenceDurationSeconds}s duration`);
  }
  if (referenceCount > constraints.maxReferences) {
    throw new Error(`Veo reference images exceed maximum of ${constraints.maxReferences} (got ${referenceCount})`);
  }
  if (referenceCount > 0 && duration !== constraints.referenceDurationSeconds) {
    throw new Error(`Veo reference images require ${constraints.referenceDurationSeconds}s duration`);
  }
  if (opts.task === 'image-to-video' && startCount === 0 && referenceCount === 0) {
    throw new Error('image-to-video requires at least one input image');
  }

  for (const file of resolved) {
    if (!file || !file.path) throw new Error('resolved input is missing a local path');
    const mime = file.mime;
    if (!constraints.supportedInputMime.has(mime)) {
      throw new Error(`unsupported Vertex video input MIME type: ${mime || 'unknown'}`);
    }
    if (typeof file.size === 'number' && file.size > constraints.inputMaxBytes) {
      throw new Error(`Vertex video input exceeds max bytes (${constraints.inputMaxBytes}): ${file.path}`);
    }
  }

  return true;
}

async function resolveInputAssets(inputs, getAsset) {
  const out = [];
  const list = Array.isArray(inputs) ? inputs : [];
  for (const input of list) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if (input.kind !== 'asset') {
      throw new Error('Vertex video inputs must be native asset references (external URLs are forbidden)');
    }
    const assetId = input.assetId;
    if (!assetId || typeof assetId !== 'string') throw new Error('Vertex video input is missing an assetId');
    if (/[/\\]/.test(assetId) || assetId.includes('..')) throw new Error('invalid native asset id');
    const asset = await getAsset(assetId);
    if (!asset || !asset.path) throw new Error(`native input asset not found: ${assetId}`);
    const role = classifyRole(input.role);
    if (!role) throw new Error(`unsupported Vertex video input role: ${input.role}`);
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

async function runVertexVideoProvider(job, clean, ctx, opts = {}) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('runVertexVideoProvider requires ctx.register (scheduler hook)');
  const getAsset = ctx.getAsset;
  if (typeof getAsset !== 'function') throw new Error('runVertexVideoProvider requires ctx.getAsset (native asset resolver)');
  const tmpDir = ctx.tmpDir || path.join(process.cwd(), '.native-media', 'tmp');

  const resolved = await resolveInputAssets(clean.inputs, getAsset);
  await validateVertexVideoInputs({
    inputs: clean.inputs,
    resolvedFiles: resolved,
    constraints: CONSTRAINTS,
    task: clean.task,
    parameters: clean.parameters,
  });

  const jobDir = path.join(tmpDir, job.id);
  await fsp.mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, 'output.mp4');

  const argv = buildVertexVideoArgs({
    modelId: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    parameters: clean.parameters,
    inputPaths: resolved,
    outputPath,
  });

  const env = buildEnv(opts.env || process.env);
  const spawnFn = opts.spawn || spawn;
  const child = spawnFn(VERTEX_VIDEO_PYTHON, argv, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: false,
  });
  if (!child || typeof child.pid !== 'number') {
    throw new Error('genai-video wrapper failed to spawn a tracked subprocess');
  }

  let stdout = '';
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
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
    expectedMime: 'video/mp4',
    timeoutMs,
    killGroup: false,
    resolveOutputPath: () => parseMediaStdout(stdout) || outputPath,
    settlePatch: (patch) => {
      if (!stderr || patch.status === 'completed') return null;
      return { detail: redactProviderText(stderr, { prompt: clean.prompt, credentialPath: env.GOOGLE_APPLICATION_CREDENTIALS }) };
    },
  });

  return { child, outputPath, expectedMime: 'video/mp4', argv, env };
}

module.exports = {
  VERTEX_VIDEO_PYTHON,
  VERTEX_VIDEO_SCRIPT,
  MODEL_ALIAS,
  VERTEX_VIDEO_MODELS,
  CONSTRAINTS,
  ENV_ALLOWLIST,
  ENV_DENYLIST,
  DEFAULT_TIMEOUT_MS,
  isVertexVideoModel,
  liveVertexEnabled,
  buildEnv,
  parseMediaStdout,
  redactProviderText,
  buildVertexVideoArgs,
  validateVertexVideoInputs,
  resolveInputAssets,
  runVertexVideoProvider,
};
