'use strict';

// C1b — single-host durable job scheduler for the Native Media Gateway.
//
// Responsibilities (V1 scope, no multi-host leasing/heartbeat):
//   - per-provider concurrency caps (Codex 1, Vertex conservative)
//   - subprocess tracking: child PID, optional process-group id (pgid), requested output
//     path, and expected MIME for output verification
//   - cancel: DELETE /generations/:id kills the running provider subprocess
//   - timeout: kill the subprocess after a bounded guard time
//   - restart reconciliation: settle non-terminal jobs on startup without ever
//     auto-resubmitting paid/provider work; verified output can complete, dead
//     subprocess without verified output becomes INTERRUPTED_PROCESS /
//     OUTCOME_UNKNOWN, success-but-missing-file becomes asset unavailable
//
// This module owns in-memory bookkeeping only. Persistence of the job store is
// delegated back to the gateway via callbacks supplied at register time, so the
// JSON/SQLite choice for the durable store stays in exports.js.

const { spawn } = require('node:child_process');

const PROVIDER_CONCURRENCY = { codex: 1, grok: 1, omni: 1, vertex: 2 };
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MIN_TIMEOUT_MS = 1000;

const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'INTERRUPTED_PROCESS',
  'OUTCOME_UNKNOWN',
  'ASSET_UNAVAILABLE',
]);

const slots = new Map(); // provider -> Set<jobId>
const tracked = new Map(); // jobId -> Tracking

function Tracking(init) {
  return {
    jobId: init.jobId,
    provider: init.provider,
    pid: init.pid,
    pgid: init.pgid,
    outputPath: init.outputPath,
    resolveOutputPath: init.resolveOutputPath,
    settlePatch: init.settlePatch,
    expectedMime: init.expectedMime,
    child: init.child,
    killGroup: init.killGroup !== false,
    timeout: null,
    exitHeard: false,
    settled: false,
    cancelRequested: false,
    onSettle: init.onSettle,
    onRelease: init.onRelease,
    onDrain: init.onDrain,
  };
}

function activeCount(provider) {
  return (slots.get(provider) || new Set()).size;
}

function acquireSlot(provider, jobId) {
  const cap = PROVIDER_CONCURRENCY[provider];
  if (typeof cap !== 'number') return true;
  let set = slots.get(provider);
  if (!set) {
    set = new Set();
    slots.set(provider, set);
  }
  if (set.size >= cap && !set.has(jobId)) return false;
  set.add(jobId);
  return true;
}

function releaseSlot(provider, jobId) {
  const set = slots.get(provider);
  if (!set) return;
  set.delete(jobId);
  if (set.size === 0) slots.delete(provider);
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function killProcessGroup(pgid, signal = 'SIGTERM') {
  if (!pgid || typeof pgid !== 'number') return false;
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    throw err;
  }
}

function killTracked(t, signal = 'SIGTERM') {
  if (!t) return false;
  if (t.killGroup) return killProcessGroup(t.pgid, signal);
  if (t.child && typeof t.child.kill === 'function') {
    try {
      return !!t.child.kill(signal);
    } catch {
      // Fall through to PID kill for child-like test doubles or already-gone children.
    }
  }
  if (!t.pid || typeof t.pid !== 'number') return false;
  try {
    process.kill(t.pid, signal);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    throw err;
  }
}

function isTracked(jobId) {
  return tracked.has(jobId);
}

function getSubprocess(jobId) {
  const t = tracked.get(jobId);
  if (!t) return null;
  return {
    jobId: t.jobId,
    provider: t.provider,
    pid: t.pid,
    pgid: t.pgid,
    outputPath: t.outputPath,
    expectedMime: t.expectedMime,
    cancelRequested: t.cancelRequested,
  };
}

function isCurrent(t) {
  return tracked.get(t.jobId) === t;
}

function retireTracking(t) {
  if (!t) return;
  if (t.timeout) {
    clearTimeout(t.timeout);
    t.timeout = null;
  }
  t.exitHeard = true;
  t.settled = true;
  t.cancelRequested = true;
}

function registerSubprocess(jobId, opts) {
  const child = opts.child;
  if (!child || typeof child.pid !== 'number') throw new Error('registerSubprocess requires a spawned child');
  const provider = opts.provider || 'vertex';
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  const t = Tracking({
    jobId,
    provider,
    pid: child.pid,
    pgid: opts.pgid != null ? opts.pgid : child.pid,
    outputPath: opts.outputPath || null,
    resolveOutputPath: typeof opts.resolveOutputPath === 'function' ? opts.resolveOutputPath : null,
    settlePatch: typeof opts.settlePatch === 'function' ? opts.settlePatch : null,
    expectedMime: opts.expectedMime || null,
    child,
    killGroup: opts.killGroup,
    onSettle: opts.onSettle || (async () => {}),
    onRelease: opts.onRelease || (() => {}),
    onDrain: opts.onDrain || (() => {}),
  });
  tracked.set(jobId, t);

  child.on('exit', (code, signal) => {
    handleExit(t, code, signal).catch(() => { /* settle errors already warned */ });
  });
  child.on('error', (err) => {
    t.exitHeard = true;
    settle(t, { status: 'OUTCOME_UNKNOWN', error: 'SUBPROCESS_ERROR', detail: String(err && err.message || err) });
  });

  t.timeout = setTimeout(() => {
    if (t.settled || !isCurrent(t)) return;
    t.cancelRequested = false;
    const killed = killTracked(t, 'SIGTERM');
    setTimeout(() => {
      if (!t.settled && isCurrent(t)) killTracked(t, 'SIGKILL');
    }, 2000);
    if (!t.exitHeard && !killed) {
      t.exitHeard = true;
      settle(t, { status: 'INTERRUPTED_PROCESS', error: 'TIMEOUT', killed: true });
    }
    // If the signal succeeded, the exit handler will run and settle with
    // INTERRUPTED_PROCESS (timeout path) / OUTCOME_UNKNOWN if no output.
  }, timeoutMs);
  if (typeof t.timeout.unref === 'function') t.timeout.unref();

  return t;
}

async function handleExit(t, code, signal) {
  if (t.exitHeard || t.settled || !isCurrent(t)) return;
  t.exitHeard = true;
  if (t.settled) return;
  if (t.timeout) {
    clearTimeout(t.timeout);
    t.timeout = null;
  }
  if (t.cancelRequested) {
    await settle(t, { status: 'cancelled', cancelled: true, killed: true, exitCode: code, exitSignal: signal });
    return;
  }
  // Not cancelled: verify output if an output path was requested.
  const verifiedPath = await findVerifiedOutputPath(t);
  if (verifiedPath) {
    await settle(t, { status: 'completed', exitCode: code, exitSignal: signal, outputVerified: true, outputPath: verifiedPath });
  } else if (code === 0 && !signal) {
    await settle(t, { status: 'OUTCOME_UNKNOWN', error: 'NO_OUTPUT', exitCode: code });
  } else {
    await settle(t, { status: 'INTERRUPTED_PROCESS', error: 'NONZERO_EXIT', exitCode: code, exitSignal: signal });
  }
}

async function findVerifiedOutputPath(t) {
  let resolved;
  if (typeof t.resolveOutputPath === 'function') {
    try {
      resolved = t.resolveOutputPath();
    } catch {
      resolved = null;
    }
  }
  if (resolved && resolved !== t.outputPath && await verifyOutput(resolved, t.expectedMime)) return resolved;
  if (t.outputPath && await verifyOutput(t.outputPath, t.expectedMime)) return t.outputPath;
  return null;
}

async function verifyOutput(outputPath, expectedMime) {
  if (!outputPath) return false;
  try {
    const fs = require('node:fs/promises');
    const stat = await fs.stat(outputPath);
    if (!stat.isFile() || stat.size === 0) return false;
    const handle = await fs.open(outputPath, 'r');
    const buf = Buffer.alloc(16);
    await handle.read(buf, 0, 16, 0);
    await handle.close();
    const sniff = sniffMime(buf);
    if (!sniff) return false;
    if (expectedMime && sniff !== expectedMime) return false;
    return true;
  } catch {
    return false;
  }
}

function sniffMime(bytes) {
  const b = Buffer.from(bytes || []);
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.slice(4, 8).toString() === 'ftyp') return 'video/mp4';
  return null;
}

async function settle(t, patch) {
  if (t.settled || !isCurrent(t)) return;
  t.settled = true;
  if (typeof t.settlePatch === 'function') {
    try {
      const extra = t.settlePatch(patch);
      if (extra && typeof extra === 'object') patch = { ...patch, ...extra };
    } catch {
      /* diagnostics must never block terminal settlement */
    }
  }
  if (t.timeout) {
    clearTimeout(t.timeout);
    t.timeout = null;
  }
  tracked.delete(t.jobId);
  try {
    await t.onSettle(t.jobId, patch);
  } catch (err) {
    // Persistence failures must not strand the slot or block queued jobs.
    try { process.emitWarning(`native scheduler settle failed: ${err && err.message}`); } catch { /* ignore */ }
  } finally {
    t.onRelease(t.provider, t.jobId);
    t.onDrain(t.provider);
  }
}

// Used by cancel to settle cancelled synchronously and short-circuit the child
// exit handler (which would otherwise be a no-op once `settled` is true).
async function forceSettleCancelled(jobId, extra) {
  const t = tracked.get(jobId);
  if (!t) return false;
  if (t.timeout) {
    clearTimeout(t.timeout);
    t.timeout = null;
  }
  return settle(t, { status: 'cancelled', cancelled: true, killed: true, ...(extra || {}) });
}

function cancelSubprocess(jobId, signal = 'SIGTERM') {
  const t = tracked.get(jobId);
  if (!t) return { tracked: false, killed: false };
  t.cancelRequested = true;
  if (t.timeout) {
    clearTimeout(t.timeout);
    t.timeout = null;
  }
  const killed = killTracked(t, signal);
  // Fallback: kill the child directly if the first signal missed it.
  setTimeout(() => {
    if (!t.exitHeard && !t.settled && isCurrent(t) && t.child && typeof t.child.kill === 'function') {
      try { t.child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }, 1000);
  return { tracked: true, killed: !!killed, pid: t.pid, pgid: t.pgid };
}

// Restart reconciliation for a single job. Decides a terminal state without
// ever resubmitting provider work. The caller supplies a verifier for the
// declared output path. Returns the settled job patch (or null to leave state).
async function reconcileJobState(job, opts) {
  if (!job) return null;
  if (job.status === 'queued') {
    return { status: 'OUTCOME_UNKNOWN', error: 'STARTUP_QUEUED_NOT_RESUBMITTED', reconciledAt: new Date().toISOString() };
  }
  if (TERMINAL_STATUSES.has(job.status)) {
    // If a completed job's asset file is gone, mark it unavailable so the
    // browser never gets a false success URL.
    if (job.status === 'completed' && job.outputPath) {
      const filesOk = await verifyOutput(job.outputPath, job.expectedMime);
      if (!filesOk) return { status: 'ASSET_UNAVAILABLE', error: 'OUTPUT_FILE_MISSING', reconciledAt: new Date().toISOString() };
    }
    return null;
  }
  const isAlive = opts && typeof opts.isAlive === 'function' ? opts.isAlive : isPidAlive;
  const verify = opts && typeof opts.verifyOutput === 'function' ? opts.verifyOutput : verifyOutput;
  const trackedInfo = tracked.has(job.id) ? getSubprocess(job.id) : null;
  const alive = trackedInfo
    ? isAlive(trackedInfo.pgid)
    : isAlive(job.pid);
  const outputVerified = job.outputPath ? await verify(job.outputPath, job.expectedMime) : false;
  if (outputVerified) {
    return { status: 'completed', outputVerified: true, reconciledAt: new Date().toISOString() };
  }
  if (alive) {
    // Reattach: leave it running, do not resubmit.
    return null;
  }
  // Dead subprocess, no verified output.
  if (job.pid != null || trackedInfo) {
    return { status: 'INTERRUPTED_PROCESS', error: 'DEAD_SUBPROCESS', reconciledAt: new Date().toISOString() };
  }
  return { status: 'OUTCOME_UNKNOWN', error: 'NO_VERIFIED_OUTPUT', reconciledAt: new Date().toISOString() };
}

async function disposeAll() {
  for (const [jobId, t] of [...tracked.entries()]) {
    retireTracking(t);
    killProcessGroup(t.pgid, 'SIGKILL');
    try { if (t.child && typeof t.child.kill === 'function') t.child.kill('SIGKILL'); } catch { /* ignore */ }
  }
  tracked.clear();
  slots.clear();
}

function reset() {
  for (const t of tracked.values()) retireTracking(t);
  tracked.clear();
  slots.clear();
}

module.exports = {
  PROVIDER_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  TERMINAL_STATUSES,
  activeCount,
  acquireSlot,
  releaseSlot,
  isPidAlive,
  isTracked,
  getSubprocess,
  registerSubprocess,
  cancelSubprocess,
  forceSettleCancelled,
  killProcessGroup,
  reconcileJobState,
  verifyOutput,
  sniffMime,
  disposeAll,
  reset,
};
