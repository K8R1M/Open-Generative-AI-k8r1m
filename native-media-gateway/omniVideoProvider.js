'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const OMNI_VIDEO_PYTHON = path.join(REPO_ROOT, '.native-media', 'venv', 'bin', 'python3');
const OMNI_VIDEO_SCRIPT = path.join(__dirname, 'bin', 'genai-omni');
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

const MODEL_ID = 'native.vertex.gemini-omni-flash-preview';
const MODEL_ALIAS = { [MODEL_ID]: 'gemini-omni-flash-preview' };
const OMNI_VIDEO_MODELS = new Set(Object.keys(MODEL_ALIAS));

const CONSTRAINTS = {
  supportedImageMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
  supportedVideoMime: new Set(['video/mp4']),
  imageMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 250 * 1024 * 1024,
  maxImages: 10,
  maxVideos: 3,
  maxDurationSeconds: 10,
  aspectRatios: new Set(['16:9', '9:16']),
};

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
  'GOOGLE_CLOUD_LOCATION',
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
  'grokAuth',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'XAI_API_KEY',
  'GROK_API_KEY',
]);

const SAFE_MESSAGES = {
  OMNI_AUTH_UNAVAILABLE: 'Omni generation needs valid Google Vertex credentials on the native worker.',
  OMNI_MODEL_UNAVAILABLE: 'Omni generation is not available for this Vertex project or location.',
  OMNI_UNSUPPORTED_INPUT: 'Omni could not use this input. Try supported image or MP4 references and a 1-10 second duration.',
  OMNI_POLICY_BLOCKED: 'Omni blocked the generation under provider safety rules. Try a different prompt or reference.',
  OMNI_QUOTA_OR_RATE_LIMIT: 'Omni generation is currently rate limited or out of quota. Try again later.',
  OMNI_PROVIDER_TIMEOUT: 'Omni generation timed out before a verified MP4 was available.',
  OMNI_OUTPUT_MISSING: 'Omni finished without returning a verified MP4.',
  OMNI_PROVIDER_FAILED: 'Omni generation failed before completion.',
  REAL_PROVIDER_UNAVAILABLE: 'Omni is not enabled on this native media worker.',
};

function omniError(code, detail) {
  const err = new Error(SAFE_MESSAGES[code] || SAFE_MESSAGES.OMNI_PROVIDER_FAILED);
  err.nativeMediaError = code;
  err.publicMessage = SAFE_MESSAGES[code] || SAFE_MESSAGES.OMNI_PROVIDER_FAILED;
  err.detail = detail || err.message;
  return err;
}

function isOmniVideoModel(modelId) {
  return modelId && OMNI_VIDEO_MODELS.has(modelId);
}

function liveOmniEnabled() {
  return process.env.NATIVE_MEDIA_LIVE_OMNI === '1';
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
  if (typeof src[GATED_GOOGLE_ADC_ENV] === 'string' && src[GATED_GOOGLE_ADC_ENV]) {
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

function redactProviderText(text, context = {}) {
  let out = String(text || '');
  const replacements = [
    [context.prompt, '<prompt>'],
    [context.jobDir, '<job-dir>'],
    [context.outputPath, '<output>'],
    [OMNI_VIDEO_SCRIPT, '<omni-wrapper>'],
    [REPO_ROOT, '<repo>'],
    [process.env.HOME, '<home>'],
    [process.env.GOOGLE_APPLICATION_CREDENTIALS, '<google-credentials>'],
    [context.credentialPath, '<google-credentials>'],
  ];
  for (const file of context.inputs || []) {
    if (file && file.path) replacements.push([file.path, '<input>']);
  }
  for (const [from, to] of replacements) {
    if (from) out = out.split(String(from)).join(to);
  }
  out = out.replace(/(api[_-]?key|token|authorization|cookie|private[_-]?key|credential)\s*[:=]\s*\S+/gi, '$1=<redacted>');
  return out.slice(-4096);
}

function classifyOmniFailure(patch = {}, detail = '') {
  const text = `${patch.error || ''}\n${detail || ''}`;
  if (/TIMEOUT/i.test(text)) return 'OMNI_PROVIDER_TIMEOUT';
  if (/NO_OUTPUT|OUTPUT_MISSING|no inline video|no downloadable|no video/i.test(text)) return 'OMNI_OUTPUT_MISSING';
  if (/GOOGLE_CLOUD_PROJECT|application default credentials|credential|reauthentication|unauthenticated|permission denied|forbidden|auth/i.test(text)) return 'OMNI_AUTH_UNAVAILABLE';
  if (/model.*(not found|unavailable|unsupported)|404|not enabled|not available/i.test(text)) return 'OMNI_MODEL_UNAVAILABLE';
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit|429/i.test(text)) return 'OMNI_QUOTA_OR_RATE_LIMIT';
  if (/safety|policy|blocked|prohibited|usage guidelines|filtered/i.test(text)) return 'OMNI_POLICY_BLOCKED';
  if (/INVALID_ARGUMENT|unsupported|duration|aspect|audio|mime|input/i.test(text)) return 'OMNI_UNSUPPORTED_INPUT';
  return 'OMNI_PROVIDER_FAILED';
}

function getDuration(parameters = {}) {
  return Number(parameters.durationSeconds ?? parameters.duration ?? 6);
}

function getAspectRatio(parameters = {}) {
  return String(parameters.aspectRatio ?? parameters.aspect_ratio ?? '16:9');
}

function validateOmniVideoInputs(opts) {
  const constraints = opts.constraints || CONSTRAINTS;
  const inputs = Array.isArray(opts.inputs) ? opts.inputs : [];
  const resolved = Array.isArray(opts.resolvedFiles) ? opts.resolvedFiles : [];
  if (opts.task !== 'text-to-video' && opts.task !== 'image-to-video') {
    throw omniError('OMNI_UNSUPPORTED_INPUT', `unsupported Omni task: ${opts.task}`);
  }
  if (resolved.length !== inputs.length) throw omniError('OMNI_UNSUPPORTED_INPUT', 'input resolution mismatch');

  const duration = getDuration(opts.parameters || {});
  if (!Number.isInteger(duration) || duration < 1 || duration > constraints.maxDurationSeconds) {
    throw omniError('OMNI_UNSUPPORTED_INPUT', `unsupported Omni duration: ${duration}`);
  }
  const aspect = getAspectRatio(opts.parameters || {});
  if (!constraints.aspectRatios.has(aspect)) throw omniError('OMNI_UNSUPPORTED_INPUT', `unsupported Omni aspect ratio: ${aspect}`);

  let images = 0;
  let videos = 0;
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw omniError('OMNI_UNSUPPORTED_INPUT', 'invalid input entry');
    if ((input.kind || 'asset') !== 'asset' || input.url) throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni inputs must be uploaded native asset references');
    const assetId = input.assetId || input.asset_id || input.id;
    if (!assetId) throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni input is missing an assetId');
  }
  for (const file of resolved) {
    if (!file || !file.path) throw omniError('OMNI_UNSUPPORTED_INPUT', 'resolved input is missing a local path');
    if (constraints.supportedImageMime.has(file.mime)) {
      images += 1;
      if (typeof file.size === 'number' && file.size > constraints.imageMaxBytes) throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni image input exceeds max bytes');
    } else if (constraints.supportedVideoMime.has(file.mime)) {
      videos += 1;
      if (typeof file.size === 'number' && file.size > constraints.videoMaxBytes) throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni video input exceeds max bytes');
    } else {
      throw omniError('OMNI_UNSUPPORTED_INPUT', `unsupported Omni input MIME type: ${file.mime || 'unknown'}`);
    }
  }
  if (images > constraints.maxImages) throw omniError('OMNI_UNSUPPORTED_INPUT', `Omni input images exceed maximum of ${constraints.maxImages}`);
  if (videos > constraints.maxVideos) throw omniError('OMNI_UNSUPPORTED_INPUT', `Omni input videos exceed maximum of ${constraints.maxVideos}`);
  if (opts.task === 'image-to-video' && images + videos < 1) throw omniError('OMNI_UNSUPPORTED_INPUT', 'image-to-video requires at least one input asset');
  return true;
}

async function resolveInputAssets(inputs, getAsset) {
  const out = [];
  const list = Array.isArray(inputs) ? inputs : [];
  for (const input of list) {
    if (!input || typeof input !== 'object') throw omniError('OMNI_UNSUPPORTED_INPUT', 'invalid input entry');
    if ((input.kind || 'asset') !== 'asset' || input.url) throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni inputs must be uploaded native asset references');
    const assetId = input.assetId || input.asset_id || input.id;
    if (!assetId || typeof assetId !== 'string') throw omniError('OMNI_UNSUPPORTED_INPUT', 'Omni input is missing an assetId');
    if (/[/\\]/.test(assetId) || assetId.includes('..') || assetId.includes('://') || assetId.startsWith('//')) {
      throw omniError('OMNI_UNSUPPORTED_INPUT', 'invalid native asset id');
    }
    const asset = await getAsset(assetId);
    if (!asset || !asset.path) throw omniError('OMNI_UNSUPPORTED_INPUT', `native input asset not found: ${assetId}`);
    let size;
    try {
      size = (await fsp.stat(asset.path)).size;
    } catch {
      size = undefined;
    }
    out.push({ path: asset.path, mime: asset.mime, size, assetId, role: input.role || 'input' });
  }
  return out;
}

function buildOmniVideoArgs(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('buildOmniVideoArgs requires an options object');
  if (!MODEL_ALIAS[opts.modelId]) throw new Error(`unsupported Omni video model: ${opts.modelId}`);
  if (typeof opts.prompt !== 'string') throw new Error('prompt is required');
  if (!opts.outputPath || typeof opts.outputPath !== 'string') throw new Error('outputPath is required');

  const inputPaths = Array.isArray(opts.inputPaths) ? opts.inputPaths : [];
  validateOmniVideoInputs({
    inputs: inputPaths.map((entry) => ({ kind: 'asset', assetId: entry.assetId, role: entry.role || 'input' })),
    resolvedFiles: inputPaths,
    task: opts.task,
    parameters: opts.parameters,
  });

  const parameters = opts.parameters || {};
  const argv = [
    OMNI_VIDEO_SCRIPT,
    '--prompt', opts.prompt,
    '--duration', String(getDuration(parameters)),
    '--aspect-ratio', getAspectRatio(parameters),
    '--output', opts.outputPath,
  ];
  if (parameters.temperature != null) argv.push('--temperature', String(parameters.temperature));
  if (parameters.topP != null) argv.push('--top-p', String(parameters.topP));
  for (const file of inputPaths) {
    argv.push(CONSTRAINTS.supportedVideoMime.has(file.mime) ? '--input-video' : '--input-image', file.path);
  }
  return argv;
}

function summarizeArgv(argv) {
  return argv.map((arg, idx) => {
    if (idx > 0 && argv[idx - 1] === '--prompt') return '<prompt>';
    if (idx > 0 && argv[idx - 1] === '--output') return '<output>';
    if (idx > 0 && (argv[idx - 1] === '--input-image' || argv[idx - 1] === '--input-video')) return '<input>';
    if (arg === OMNI_VIDEO_SCRIPT) return '<omni-wrapper>';
    return arg;
  });
}

async function runOmniVideoProvider(job, clean, ctx, opts = {}) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('runOmniVideoProvider requires ctx.register (scheduler hook)');
  const getAsset = ctx.getAsset;
  if (typeof getAsset !== 'function') throw new Error('runOmniVideoProvider requires ctx.getAsset (native asset resolver)');
  const tmpDir = ctx.tmpDir || path.join(process.cwd(), '.native-media', 'tmp');

  const resolved = await resolveInputAssets(clean.inputs, getAsset);
  validateOmniVideoInputs({
    inputs: clean.inputs,
    resolvedFiles: resolved,
    constraints: CONSTRAINTS,
    task: clean.task,
    parameters: clean.parameters,
  });

  const jobDir = path.join(tmpDir, job.id);
  await fsp.mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, 'omni-output.mp4');

  const argv = buildOmniVideoArgs({
    modelId: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    parameters: clean.parameters,
    inputPaths: resolved,
    outputPath,
  });

  const env = buildEnv(opts.env || process.env);
  const spawnFn = opts.spawn || spawn;
  const child = spawnFn(OMNI_VIDEO_PYTHON, argv, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: false,
  });
  if (!child || typeof child.pid !== 'number') throw omniError('REAL_PROVIDER_UNAVAILABLE', 'genai-omni wrapper failed to spawn a tracked subprocess');

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

  const writeDiagnostics = (code, detail) => {
    const diagnosticsPath = path.join(jobDir, 'omni-diagnostics.json');
    const diag = {
      reason: code,
      stdoutTail: redactProviderText(stdout, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved, credentialPath: env.GOOGLE_APPLICATION_CREDENTIALS }),
      stderrTail: redactProviderText(stderr, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved, credentialPath: env.GOOGLE_APPLICATION_CREDENTIALS }),
      inputs: resolved.map((file) => ({ mime: file.mime, size: file.size, role: file.role })),
      promptLength: clean.prompt ? clean.prompt.length : 0,
      argv: summarizeArgv(argv),
    };
    try {
      fs.writeFileSync(diagnosticsPath, JSON.stringify(diag, null, 2), 'utf8');
      return { path: diagnosticsPath, reason: code, hasStdout: stdout.length > 0, hasStderr: stderr.length > 0 };
    } catch {
      return { reason: code, hasStdout: stdout.length > 0, hasStderr: stderr.length > 0 };
    }
  };

  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || ctx.timeoutMs || DEFAULT_TIMEOUT_MS));
  ctx.register(child, {
    outputPath,
    expectedMime: 'video/mp4',
    timeoutMs,
    killGroup: false,
    resolveOutputPath: () => parseMediaStdout(stdout) || outputPath,
    settlePatch: (patch) => {
      if (patch.status === 'completed') return null;
      const detail = redactProviderText(`${stderr}\n${stdout}`, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved, credentialPath: env.GOOGLE_APPLICATION_CREDENTIALS });
      const code = classifyOmniFailure(patch, detail);
      return {
        status: 'failed',
        error: code,
        message: SAFE_MESSAGES[code],
        detail,
        omniDiagnostics: writeDiagnostics(code, detail),
      };
    },
  });

  return { child, outputPath, expectedMime: 'video/mp4', argv, env };
}

module.exports = {
  OMNI_VIDEO_PYTHON,
  OMNI_VIDEO_SCRIPT,
  MODEL_ID,
  MODEL_ALIAS,
  OMNI_VIDEO_MODELS,
  CONSTRAINTS,
  ENV_ALLOWLIST,
  ENV_DENYLIST,
  SAFE_MESSAGES,
  DEFAULT_TIMEOUT_MS,
  isOmniVideoModel,
  liveOmniEnabled,
  buildEnv,
  parseMediaStdout,
  redactProviderText,
  classifyOmniFailure,
  buildOmniVideoArgs,
  validateOmniVideoInputs,
  resolveInputAssets,
  runOmniVideoProvider,
};
