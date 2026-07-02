'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const GROK_VIDEO_PYTHON = 'python3';
const GROK_VIDEO_SCRIPT = '/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py';
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

const MODEL_ALIAS = {
  'native.grok.imagine-video': 'grok-imagine-video',
};
const GROK_VIDEO_MODELS = new Set(Object.keys(MODEL_ALIAS));

const CONSTRAINTS = {
  supportedInputMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
  supportedExtensions: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  durationsSeconds: new Set([6, 10]),
  resolutions: new Set(['480p', '720p']),
  maxImages: 7,
};

const IMAGE_ROLES = new Set(['first-frame', 'start-frame', 'input', 'image', 'reference']);

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
  'GROK_IMAGINE_CLI',
]);

const ENV_DENYLIST = new Set([
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_SECONDARY',
  'GOOGLE-api-key',
  'x-api-key',
  'authorization',
  'cookie',
  'codexAuth',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'XAI_API_KEY',
  'GROK_API_KEY',
]);

function isGrokVideoModel(modelId) {
  return modelId && GROK_VIDEO_MODELS.has(modelId);
}

function liveGrokEnabled() {
  return process.env.NATIVE_MEDIA_LIVE_GROK === '1';
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
  return env;
}

function getDuration(parameters) {
  return Number(parameters.durationSeconds ?? parameters.duration);
}

function validationError(message) {
  const error = new Error(message);
  error.nativeMediaStatus = 400;
  error.nativeMediaBody = { error: 'BAD_REQUEST', message };
  return error;
}

function validateAssetPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (!CONSTRAINTS.supportedExtensions.has(ext)) {
    throw new Error(`unsupported Grok video input extension: ${ext || 'unknown'}`);
  }
}

function isAllowedNativeAssetPath(filePath, assetId) {
  const resolved = path.resolve(String(filePath || ''));
  const assetDir = path.dirname(resolved);
  const parent = path.basename(path.dirname(assetDir));
  return path.basename(assetDir) === assetId && (parent === 'uploads' || parent === 'assets');
}

function validateGrokVideoInputs(opts) {
  const constraints = opts.constraints || CONSTRAINTS;
  const inputs = Array.isArray(opts.inputs) ? opts.inputs : [];
  const resolved = Array.isArray(opts.resolvedFiles) ? opts.resolvedFiles : [];

  if (opts.task !== 'image-to-video') throw validationError(`unsupported Grok video task: ${opts.task}`);
  if (resolved.length !== inputs.length) throw validationError('input resolution mismatch: every input must resolve to a local asset');
  if (resolved.length < 1) throw validationError('Grok image-to-video requires at least one uploaded image');
  if (resolved.length > constraints.maxImages) throw validationError(`Grok reference images exceed maximum of ${constraints.maxImages} total images`);

  const parameters = opts.parameters || {};
  const duration = getDuration(parameters);
  if (!constraints.durationsSeconds.has(duration)) throw validationError(`unsupported Grok duration: ${parameters.durationSeconds ?? parameters.duration}`);
  const resolution = parameters.resolution;
  if (!constraints.resolutions.has(String(resolution))) throw validationError(`unsupported Grok resolution: ${resolution}`);

  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw validationError('invalid input entry');
    if ((input.kind || 'asset') !== 'asset' || input.url) {
      throw validationError('Grok video inputs must be native uploaded or generated asset references');
    }
    const assetId = input.assetId || input.asset_id || input.id;
    if (!assetId) throw validationError('Grok video input is missing an assetId');
    if (!IMAGE_ROLES.has(input.role || 'input')) throw validationError(`unsupported Grok video input role: ${input.role}`);
  }

  for (const file of resolved) {
    if (!file || !file.path) throw validationError('resolved input is missing a local path');
    if (!constraints.supportedInputMime.has(file.mime)) {
      throw validationError(`unsupported Grok video input MIME type: ${file.mime || 'unknown'}`);
    }
    validateAssetPath(file.path);
  }

  return true;
}

async function resolveInputAssets(inputs, getAsset) {
  const out = [];
  const list = Array.isArray(inputs) ? inputs : [];
  for (const input of list) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if ((input.kind || 'asset') !== 'asset' || input.url) {
      throw new Error('Grok video inputs must be native uploaded or generated asset references');
    }
    const assetId = input.assetId || input.asset_id || input.id;
    if (!assetId || typeof assetId !== 'string') throw new Error('Grok video input is missing an assetId');
    if (/[/\\]/.test(assetId) || assetId.includes('..') || assetId.includes('://') || assetId.startsWith('//')) {
      throw new Error('invalid native asset id');
    }
    const asset = await getAsset(assetId);
    if (!asset || !asset.path) throw new Error(`native input asset not found: ${assetId}`);
    if (!isAllowedNativeAssetPath(asset.path, assetId)) throw new Error('Grok video inputs must be native uploaded or generated assets');
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

function buildGrokVideoArgs(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('buildGrokVideoArgs requires an options object');
  if (!MODEL_ALIAS[opts.modelId]) throw new Error(`unsupported Grok video model: ${opts.modelId}`);
  if (typeof opts.prompt !== 'string') throw validationError('prompt is required');
  if (!opts.outputPath || typeof opts.outputPath !== 'string') throw new Error('outputPath is required');

  const inputPaths = Array.isArray(opts.inputPaths) ? opts.inputPaths : [];
  validateGrokVideoInputs({
    inputs: inputPaths.map((entry) => ({ kind: 'asset', assetId: entry.assetId, role: entry.role || 'input' })),
    resolvedFiles: inputPaths,
    task: opts.task,
    parameters: opts.parameters,
  });

  const parameters = opts.parameters || {};
  const duration = getDuration(parameters);
  const resolution = String(parameters.resolution);
  const mode = inputPaths.length === 1 ? 'image-to-video' : 'reference-to-video';
  const argv = [
    GROK_VIDEO_SCRIPT,
    '--mode', mode,
    '--output', opts.outputPath,
    '--duration', String(duration),
    '--resolution', resolution,
    '--overwrite',
  ];
  if (opts.prompt.trim()) argv.splice(3, 0, '--prompt', opts.prompt);

  if (mode === 'image-to-video') {
    argv.push('--image', inputPaths[0].path);
  } else {
    argv.push('--ref', `start-composition=${inputPaths[0].path}`);
    for (let i = 1; i < inputPaths.length; i += 1) {
      argv.push('--ref', `reference-${i}=${inputPaths[i].path}`);
    }
  }
  return argv;
}

function redactProviderText(text, context = {}) {
  let out = String(text || '');
  const replacements = [
    [context.prompt, '<prompt>'],
    [context.jobDir, '<job-dir>'],
    [context.outputPath, '<output>'],
    [GROK_VIDEO_SCRIPT, '<grok-wrapper>'],
    [process.cwd(), '<repo>'],
    [process.env.HOME, '<home>'],
    [process.env.GROK_IMAGINE_CLI, '<grok-cli>'],
  ];
  for (const file of context.inputs || []) {
    if (file && file.path) replacements.push([file.path, '<input>']);
  }
  for (const [from, to] of replacements) {
    if (from) out = out.split(String(from)).join(to);
  }
  out = out.replace(/[A-Za-z0-9_+-]{20,}\.[A-Za-z0-9_.+-]{20,}\.[A-Za-z0-9_.+-]{20,}/g, '<token>');
  out = out.replace(/(api[_-]?key|token|authorization|cookie)\s*[:=]\s*\S+/gi, '$1=<redacted>');
  return out.slice(-4096);
}

function parseGrokStdoutOutput(stdout, jobDir) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.lastIndexOf('{');
    if (start >= 0) {
      try {
        parsed = JSON.parse(text.slice(start));
      } catch {
        parsed = null;
      }
    }
  }
  const output = parsed && typeof parsed.output === 'string' ? parsed.output : null;
  if (!output) return null;
  const resolved = path.resolve(output);
  const root = path.resolve(jobDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function summarizeArgv(argv) {
  return argv.map((arg, idx) => {
    if (idx > 0 && argv[idx - 1] === '--prompt') return '<prompt>';
    if (idx > 0 && argv[idx - 1] === '--output') return '<output>';
    if (idx > 0 && argv[idx - 1] === '--image') return '<input>';
    if (idx > 0 && argv[idx - 1] === '--ref') return arg.replace(/=.*/, '=<input>');
    if (arg === GROK_VIDEO_SCRIPT) return '<grok-wrapper>';
    return arg;
  });
}

async function runGrokVideoProvider(job, clean, ctx, opts = {}) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('runGrokVideoProvider requires ctx.register (scheduler hook)');
  const getAsset = ctx.getAsset;
  if (typeof getAsset !== 'function') throw new Error('runGrokVideoProvider requires ctx.getAsset (native asset resolver)');
  const tmpDir = ctx.tmpDir || path.join(process.cwd(), '.native-media', 'tmp');

  const resolved = await resolveInputAssets(clean.inputs, getAsset);
  validateGrokVideoInputs({
    inputs: clean.inputs,
    resolvedFiles: resolved,
    constraints: CONSTRAINTS,
    task: clean.task,
    parameters: clean.parameters,
  });

  const jobDir = path.join(tmpDir, job.id);
  await fsp.mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, 'grok-output.mp4');

  const argv = buildGrokVideoArgs({
    modelId: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    parameters: clean.parameters,
    inputPaths: resolved,
    outputPath,
  });

  const env = buildEnv(opts.env || process.env);
  const spawnFn = opts.spawn || spawn;
  const child = spawnFn(GROK_VIDEO_PYTHON, argv, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: false,
  });
  if (!child || typeof child.pid !== 'number') {
    throw new Error('grok_imagine_video wrapper failed to spawn a tracked subprocess');
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

  const writeDiagnostics = (reason) => {
    const diagnosticsPath = path.join(jobDir, 'grok-diagnostics.json');
    const diag = {
      reason,
      stdoutTail: redactProviderText(stdout, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved }),
      stderrTail: redactProviderText(stderr, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved }),
      inputs: resolved.map((file) => ({ mime: file.mime, size: file.size, role: file.role })),
      promptLength: clean.prompt ? clean.prompt.length : 0,
      argv: summarizeArgv(argv),
    };
    try {
      fs.writeFileSync(diagnosticsPath, JSON.stringify(diag, null, 2), 'utf8');
      return { path: diagnosticsPath, reason, hasStdout: stdout.length > 0, hasStderr: stderr.length > 0 };
    } catch {
      return { reason, hasStdout: stdout.length > 0, hasStderr: stderr.length > 0 };
    }
  };

  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || ctx.timeoutMs || DEFAULT_TIMEOUT_MS));
  ctx.register(child, {
    outputPath,
    expectedMime: 'video/mp4',
    timeoutMs,
    resolveOutputPath: () => parseGrokStdoutOutput(stdout, jobDir) || outputPath,
    settlePatch: (patch) => {
      if (patch.status === 'completed') return null;
      const diagnostics = writeDiagnostics(patch.error || 'grok-provider-failed');
      return {
        detail: redactProviderText(`${stderr}\n${stdout}`, { prompt: clean.prompt, jobDir, outputPath, inputs: resolved }),
        grokDiagnostics: diagnostics,
      };
    },
  });

  return { child, outputPath, expectedMime: 'video/mp4', argv, env };
}

module.exports = {
  GROK_VIDEO_PYTHON,
  GROK_VIDEO_SCRIPT,
  MODEL_ALIAS,
  GROK_VIDEO_MODELS,
  CONSTRAINTS,
  ENV_ALLOWLIST,
  ENV_DENYLIST,
  DEFAULT_TIMEOUT_MS,
  isGrokVideoModel,
  liveGrokEnabled,
  buildEnv,
  validateGrokVideoInputs,
  resolveInputAssets,
  buildGrokVideoArgs,
  redactProviderText,
  parseGrokStdoutOutput,
  runGrokVideoProvider,
};
