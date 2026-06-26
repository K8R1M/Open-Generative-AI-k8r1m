'use strict';

// C7 — Codex GPT Image provider adapter for the Native Media Gateway (V1).
//
// This adapter wraps the verified clean Codex CLI route (see
// stages/02-mapping/output/codex-gpt-image-provider-contract-2026-06-25.md):
//
//   CODEX_HOME=/home/k8r1m/.codex-image-provider-home \
//   codex exec --ephemeral --skip-git-repo-check \
//     -C /home/k8r1m/codex-image-provider-work \
//     [--image /abs/ref.png ...] \
//     --output-last-message /job/dir/last-message.txt \
//     '<prompt>'
//
// Unlike the Vertex wrappers, Codex does NOT write to a fixed --output path.
// The native Codex image tool writes generated PNGs into
// <CODEX_HOME>/generated_images/<session>/<hash>.png. The adapter snapshots
// that folder before the run, scans it after the child exits, copies the single
// newest new PNG into a job-local path, and hands that path to the C1b scheduler
// for magic-byte verification + asset import (same settle hooks as C5/C6).
//
// If no new PNG is found the job fails OUTPUT_MISSING (never a false success
// URL). If more than one new PNG is found the newest is chosen and a safe
// ambiguity count is surfaced (no Codex-home paths ever reach the browser).
//
// The live runner is present but never invoked by default: callers must opt in
// explicitly (`options.liveCodex === true`) AND set the env gate
// `NATIVE_MEDIA_LIVE_CODEX=1`. The Next route forwards live intent only when
// that env gate is enabled.
//
// No Codex auth, CODEX_HOME path, or generated_images path is read, logged, or
// surfaced to the browser. Tests inject a fake filesystem + fake spawn via
// server-side opts; the browser cannot reach those injection points.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Fixed executable paths — never overridden by browser-supplied input.
const CODEX_BINARY = '/home/k8r1m/.local/bin/codex';
const CODEX_HOME = '/home/k8r1m/.codex-image-provider-home';
const CODEX_WORKDIR = '/home/k8r1m/codex-image-provider-work';
const GENERATED_IMAGES_DIR = path.join(CODEX_HOME, 'generated_images');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// Native model id -> Codex alias. The alias is reserved for capability routing;
// `codex exec` does not take a --model flag for the native image tool, so the
// alias is not placed on the argv. It exists so the gateway can recognize the
// model and so future model variants can map cleanly.
const MODEL_ALIAS = {
  'native.codex.gpt-image-2': 'gpt-image-2',
};
const CODEX_IMAGE_MODELS = new Set(Object.keys(MODEL_ALIAS));

// Frozen V1 capability constraints for the Codex image path. Mirrors the shared
// contract shape used by the Vertex image adapter so the gateway stays
// decoupled and never reads credentials here.
const CONSTRAINTS = {
  supportedInputMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
  inputMaxBytes: 7 * 1024 * 1024,
  maxReferences: 10,
};

const PRIMARY_ROLES = new Set(['input', 'image', 'first-frame', 'start-frame']);
const REFERENCE_ROLES = new Set(['reference']);
const ALLOWED_ROLES = new Set([...PRIMARY_ROLES, ...REFERENCE_ROLES]);

// Environment variables passed through to the Codex subprocess. CODEX_HOME is
// added separately (fixed clean home) and is the only Codex-specific variable.
// Codex auth lives inside CODEX_HOME (auth.json symlink), so no auth token or
// credential path is ever placed on the child env by this adapter.
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
]);

// Names that must NEVER be passed through even if they appear in the allowlist.
// Includes Codex/OpenAI credential names so a polluted parent env can't leak.
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
]);

function isCodexImageModel(modelId) {
  return modelId && CODEX_IMAGE_MODELS.has(modelId);
}

function liveCodexEnabled() {
  return process.env.NATIVE_MEDIA_LIVE_CODEX === '1';
}

// Build a minimal, credential-free environment for the Codex subprocess and pin
// CODEX_HOME to the clean isolated home. `opts.codexHome` is a server/test
// injection point only — the browser never reaches it.
function buildEnv(baseEnv, opts = {}) {
  const env = {};
  const src = baseEnv && typeof baseEnv === 'object' ? baseEnv : process.env;
  for (const key of ENV_ALLOWLIST) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    if (ENV_DENYLIST.has(key)) continue;
    env[key] = String(value);
  }
  env.CODEX_HOME = opts.codexHome || CODEX_HOME;
  return env;
}

function classifyRole(role) {
  if (PRIMARY_ROLES.has(role)) return 'primary';
  if (REFERENCE_ROLES.has(role)) return 'reference';
  return null;
}

// Build the `codex exec` argv from a clean, validated request. Pure function:
// no spawn, no fs, no I/O — fully unit-testable.
//
// Every resolved input image becomes a repeated `--image /absolute/path` flag
// (Codex does not distinguish primary vs reference at the CLI level; the role
// classification is still validated upstream). The prompt is the final
// positional argument and is preserved verbatim.
function buildCodexArgs(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('buildCodexArgs requires an options object');
  const alias = MODEL_ALIAS[opts.modelId];
  if (!alias) throw new Error(`unsupported Codex image model: ${opts.modelId}`);
  if (typeof opts.prompt !== 'string') throw new Error('prompt is required');
  if (!opts.lastMessagePath || typeof opts.lastMessagePath !== 'string') throw new Error('lastMessagePath is required');
  if (opts.task !== 'text-to-image' && opts.task !== 'image-to-image') {
    throw new Error(`unsupported Codex image task: ${opts.task}`);
  }

  const argv = ['exec', '--ephemeral', '--skip-git-repo-check'];
  argv.push('-C', CODEX_WORKDIR);
  argv.push('--output-last-message', opts.lastMessagePath);

  const inputPaths = Array.isArray(opts.inputPaths) ? opts.inputPaths : [];
  for (const entry of inputPaths) {
    if (!entry || typeof entry !== 'object' || !entry.path) continue;
    argv.push('--image', entry.path);
  }

  // `--image <FILE>...` is variadic; `--` keeps the prompt from being parsed
  // as another image path.
  argv.push('--');
  // Prompt is the final positional argument, preserved verbatim.
  argv.push(opts.prompt);
  return argv;
}

// Validate declared inputs + resolved local files before any provider subprocess
// is spawned. Rejects unsupported MIME, oversized inputs, too many references,
// non-asset inputs (SSRF guard), and malformed roles.
async function validateCodexImageInputs(opts) {
  const constraints = opts.constraints || CONSTRAINTS;
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
      throw new Error('Codex image inputs must be native asset references (external URLs are forbidden)');
    }
    if (!input.assetId) throw new Error('Codex image input is missing an assetId');
    const role = input.role;
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error(`unsupported Codex image input role: ${role}`);
    }
    if (PRIMARY_ROLES.has(role)) primaryCount += 1;
    else if (REFERENCE_ROLES.has(role)) referenceCount += 1;
  }

  if (primaryCount > 1) {
    throw new Error('Codex GPT Image supports at most one primary input image');
  }
  if (referenceCount > constraints.maxReferences) {
    throw new Error(`Codex reference images exceed maximum of ${constraints.maxReferences} (got ${referenceCount})`);
  }

  for (const file of resolved) {
    if (!file || !file.path) throw new Error('resolved input is missing a local path');
    const mime = file.mime;
    if (!constraints.supportedInputMime.has(mime)) {
      throw new Error(`unsupported Codex image input MIME type: ${mime || 'unknown'}`);
    }
    if (typeof file.size === 'number' && file.size > constraints.inputMaxBytes) {
      throw new Error(`Codex image input exceeds max bytes (${constraints.inputMaxBytes}): ${file.path}`);
    }
  }

  // image-to-image requires at least one image input (primary or reference).
  if (opts.task === 'image-to-image' && primaryCount === 0 && referenceCount === 0) {
    throw new Error('image-to-image requires at least one input image');
  }

  return true;
}

// Resolve native asset inputs to local file paths server-side. Same SSRF
// boundary as the Vertex adapters: client URLs, external hosts, file:// URIs,
// and non-asset kinds are rejected before any provider call.
async function resolveInputAssets(inputs, getAsset) {
  const out = [];
  const list = Array.isArray(inputs) ? inputs : [];
  for (const input of list) {
    if (!input || typeof input !== 'object') throw new Error('invalid input entry');
    if (input.kind !== 'asset') {
      throw new Error('Codex image inputs must be native asset references (external URLs are forbidden)');
    }
    const assetId = input.assetId;
    if (!assetId || typeof assetId !== 'string') throw new Error('Codex image input is missing an assetId');
    if (/[/\\]/.test(assetId) || assetId.includes('..')) {
      throw new Error('invalid native asset id');
    }
    const asset = await getAsset(assetId);
    if (!asset || !asset.path) {
      throw new Error(`native input asset not found: ${assetId}`);
    }
    const role = classifyRole(input.role);
    if (!role) throw new Error(`unsupported Codex image input role: ${input.role}`);
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

// --- generated_images snapshot + scan (sync, operates on an injected dir) ---
//
// These are sync because the scheduler calls `resolveOutputPath()` sync inside
// `findVerifiedOutputPath()`. The snapshot is taken before spawn; the scan runs
// inside the resolve callback after the child exits. PNGs are small, so sync
// copy is safe. Tests inject a temp dir; production uses GENERATED_IMAGES_DIR.

function walkPngsSync(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkPngsSync(full, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.png')) {
      try {
        const st = fs.statSync(full);
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* ignore unreadable */
      }
    }
  }
  return out;
}

// Snapshot existing PNGs in a generated_images dir as path -> mtimeMs. Files
// present at snapshot time are excluded from the post-run "new" set.
function snapshotGeneratedImagesSync(dir) {
  const map = new Map();
  for (const ent of walkPngsSync(dir)) {
    map.set(ent.path, ent.mtimeMs);
  }
  return map;
}

// Scan a generated_images dir and return PNGs that are new or modified relative
// to the snapshot, newest-first. Pure (no mutation), operates on the injected
// dir, never touches the real CODEX_HOME unless that dir is passed in.
function scanNewPngsSync(snapshot, dir) {
  const prev = snapshot instanceof Map ? snapshot : new Map();
  const fresh = walkPngsSync(dir).filter((ent) => {
    const prevMtime = prev.get(ent.path);
    if (prevMtime === undefined) return true; // new file
    return ent.mtimeMs > prevMtime; // modified after snapshot
  });
  fresh.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return fresh;
}

function pickNewestPng(newPngs) {
  if (!Array.isArray(newPngs) || newPngs.length === 0) return null;
  return newPngs[0];
}

// The live runner. Resolves inputs, validates, snapshots generated_images,
// builds argv, spawns `codex exec` with shell:false + env allowlist + clean
// CODEX_HOME, and registers the child with the C1b scheduler via ctx.register.
//
// The registered `resolveOutputPath` callback scans generated_images after the
// child exits, copies the single newest new PNG into a job-local path, and
// returns it for scheduler magic-byte verification + gateway asset import —
// identical settle flow to C5/C6. The returned `resolveMeta` object records the
// new-PNG count, ambiguity flag, and missing flag so the gateway can persist
// safe metadata (ambiguity count) and rewrite a no-output failure to
// OUTPUT_MISSING.
async function runCodexImageProvider(job, clean, ctx, opts = {}) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('runCodexImageProvider requires ctx.register (scheduler hook)');
  const getAsset = ctx.getAsset;
  if (typeof getAsset !== 'function') throw new Error('runCodexImageProvider requires ctx.getAsset (native asset resolver)');
  const tmpDir = ctx.tmpDir || path.join(process.cwd(), '.native-media', 'tmp');

  const resolved = await resolveInputAssets(clean.inputs, getAsset);
  await validateCodexImageInputs({
    inputs: clean.inputs,
    resolvedFiles: resolved,
    constraints: CONSTRAINTS,
    task: clean.task,
  });

  const jobDir = path.join(tmpDir, job.id);
  await fsp.mkdir(jobDir, { recursive: true });
  const copyTargetPath = path.join(jobDir, 'codex-output.png');
  const lastMessagePath = path.join(jobDir, 'last-message.txt');

  // Server/test injection points only — the gateway forwards these from
  // server-side opts; the Next route never sets them, so the browser cannot
  // redirect CODEX_HOME or the scan dir. Defaults point at the real clean home.
  const generatedImagesDir = opts.generatedImagesDir || GENERATED_IMAGES_DIR;
  const codexHome = opts.codexHome || CODEX_HOME;

  const snapshot = snapshotGeneratedImagesSync(generatedImagesDir);

  const argv = buildCodexArgs({
    modelId: clean.modelId,
    task: clean.task,
    prompt: clean.prompt,
    inputPaths: resolved,
    lastMessagePath,
  });

  const env = buildEnv(opts.env || process.env, { codexHome });
  const spawnFn = opts.spawn || spawn;

  const child = spawnFn(CODEX_BINARY, argv, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: false,
  });
  if (!child || typeof child.pid !== 'number') {
    throw new Error('codex exec failed to spawn a tracked subprocess');
  }

  // Capture stdout + stderr (bounded) so the last-message file and any
  // diagnostics stay server-side. Both pipes must be drained or Codex stderr
  // can fill the OS pipe buffer and block the child until timeout. The
  // scheduler independently verifies the copied PNG, so neither stream is ever
  // used as the success signal; the captured strings are intentionally never
  // logged or surfaced (stderr may carry diagnostics/path fragments).
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

  const resolveMeta = {
    newPngCount: 0,
    chosenMtimeMs: 0,
    ambiguityDetected: false,
    missing: false,
  };

  const writeDiagnostics = (reason, freshCount) => {
    let lastMessageTail = null;
    const hasLastMessage = fs.existsSync(lastMessagePath);
    if (hasLastMessage) {
      try {
        const lastMsg = fs.readFileSync(lastMessagePath, 'utf8');
        lastMessageTail = lastMsg.slice(-4096);
      } catch {}
    }

    const redact = (text) => {
      if (!text || typeof text !== 'string') return text;
      let res = text;
      if (lastMessagePath) {
        res = res.split(lastMessagePath).join('<last-message>');
      }
      if (copyTargetPath) {
        res = res.split(copyTargetPath).join('<output>');
      }
      for (const f of resolved) {
        if (f && f.path) {
          res = res.split(f.path).join('<input>');
        }
      }
      if (jobDir) {
        res = res.split(jobDir).join('<job-dir>');
      }
      if (generatedImagesDir) {
        res = res.split(generatedImagesDir).join('<generated-images>');
      }
      if (codexHome) {
        res = res.split(codexHome).join('<codex-home>');
      }
      if (clean.prompt && typeof clean.prompt === 'string' && clean.prompt.trim() !== '') {
        res = res.split(clean.prompt).join('<prompt>');
      }
      return res;
    };

    const argvSummary = argv.map((arg, idx) => {
      if (idx === argv.length - 1) return '<prompt>';
      if (idx > 0 && argv[idx - 1] === '-C') return '<path>';
      if (idx > 0 && argv[idx - 1] === '--output-last-message') return '<path>';
      if (idx > 0 && argv[idx - 1] === '--image') return '<path>';
      return arg;
    });

    const inputSummary = resolved.map(f => ({
      mime: f.mime,
      size: f.size,
      role: f.role
    }));

    const diagData = {
      reason,
      stdoutTail: redact(stdout.slice(-4096)),
      stderrTail: redact(stderr.slice(-4096)),
      lastMessageExists: hasLastMessage,
      lastMessageTail: redact(lastMessageTail),
      newPngCount: freshCount,
      ambiguityDetected: freshCount > 1,
      inputs: inputSummary,
      promptLength: clean.prompt ? clean.prompt.length : 0,
      argv: argvSummary
    };

    const diagPath = path.join(jobDir, 'codex-diagnostics.json');
    try {
      fs.writeFileSync(diagPath, JSON.stringify(diagData, null, 2), 'utf8');
      resolveMeta.codexDiagnostics = {
        path: diagPath,
        reason,
        hasStderr: stderr.length > 0,
        hasStdout: stdout.length > 0,
        hasLastMessage
      };
    } catch (err) {
      console.error('[runCodexImageProvider] failed to write diagnostics file', err);
    }
  };

  // Called sync by the scheduler after the child exits. Scans generated_images
  // for new PNGs, copies the newest into the job-local target, and returns that
  // target for verification. Returns null when no new PNG exists so the
  // scheduler safely fails the job (gateway then rewrites to OUTPUT_MISSING).
  const resolveOutputPath = () => {
    const fresh = scanNewPngsSync(snapshot, generatedImagesDir);
    resolveMeta.newPngCount = fresh.length;
    if (fresh.length === 0) {
      resolveMeta.missing = true;
      writeDiagnostics('no-new-png', 0);
      return null;
    }
    const newest = pickNewestPng(fresh);
    if (fresh.length > 1) resolveMeta.ambiguityDetected = true;
    try {
      fs.mkdirSync(path.dirname(copyTargetPath), { recursive: true });
      fs.copyFileSync(newest.path, copyTargetPath);
      resolveMeta.chosenMtimeMs = newest.mtimeMs;
    } catch {
      writeDiagnostics('copy-failed', fresh.length);
      return null;
    }
    return copyTargetPath;
  };

  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || ctx.timeoutMs || DEFAULT_TIMEOUT_MS));
  ctx.register(child, {
    outputPath: copyTargetPath,
    expectedMime: 'image/png',
    timeoutMs,
    resolveOutputPath,
  });

  return { child, outputPath: copyTargetPath, expectedMime: 'image/png', argv, env, resolveMeta };
}

module.exports = {
  CODEX_BINARY,
  CODEX_HOME,
  CODEX_WORKDIR,
  GENERATED_IMAGES_DIR,
  MODEL_ALIAS,
  CODEX_IMAGE_MODELS,
  CONSTRAINTS,
  ENV_ALLOWLIST,
  ENV_DENYLIST,
  DEFAULT_TIMEOUT_MS,
  isCodexImageModel,
  liveCodexEnabled,
  buildEnv,
  classifyRole,
  buildCodexArgs,
  validateCodexImageInputs,
  resolveInputAssets,
  snapshotGeneratedImagesSync,
  scanNewPngsSync,
  pickNewestPng,
  walkPngsSync,
  runCodexImageProvider,
};
