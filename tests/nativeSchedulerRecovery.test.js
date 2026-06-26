// C1b contract test — single-host scheduler: idempotency under concurrency,
// per-provider concurrency caps, subprocess PID/process-group + output path
// tracking, cancel kills the running process group, timeout kills the group,
// and restart reconciliation settles non-terminal jobs without ever
// auto-resubmitting paid/provider work.
//
// Uses the gateway fake/subprocess runner only. No live Vertex or Codex calls.

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `scheduler-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl56QAAAAASUVORK5CYII=',
  'base64'
);

function t2iVideo(modelId = 'native.vertex.veo-3.1-fast') {
  return {
    modelId,
    task: 'text-to-video',
    prompt: 'scheduler fake',
    parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
  };
}
function t2iCodex() {
  return { modelId: 'native.codex.gpt-image-2', task: 'text-to-image', prompt: 'codex fake' };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const rid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = Math.floor(Math.random() * 1e6) + 1000;
    this.kill = () => {};
  }
}

async function writeJobs(jobs) {
  await fsp.mkdir(TEST_ROOT, { recursive: true });
  await fsp.writeFile(path.join(TEST_ROOT, 'jobs.json'), JSON.stringify(jobs, null, 2));
  await fsp.writeFile(path.join(TEST_ROOT, 'idempotency.json'), '{}');
}

async function pollStatus(id, predicate, { timeoutMs = 4000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await gateway.getGeneration(id);
    if (job && predicate(job)) return job;
    await sleep(intervalMs);
  }
  throw new Error(`pollStatus timed out for job ${id}`);
}

test.afterEach(async () => {
  scheduler.disposeAll();
  scheduler.reset();
});

test.after(async () => {
  await scheduler.disposeAll();
  scheduler.reset();
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

test('duplicate clientRequestId never starts a second provider subprocess (idempotent)', async () => {
  const ctx = { ...t2iCodex(), clientRequestId: rid('idem') };
  let providerSubmissions = 0;
  const onEvent = (e) => {
    if (e && e.type === 'provider_work_started') providerSubmissions += 1;
  };
  const first = await gateway.submitGeneration(ctx, {
    onEvent,
    provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 },
  });
  const second = await gateway.submitGeneration(ctx, {
    onEvent,
    provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 },
  });
  assert.equal(
    scheduler.isTracked(first.id),
    true,
    'first submit must register a running provider subprocess'
  );
  assert.equal(providerSubmissions, 1, 'duplicate clientRequestId must not start provider work twice');
  assert.equal(second.id, first.id, 'duplicate must resolve to the same job id');
});

test('concurrent duplicate clientRequestId reserves before real runProvider starts', async () => {
  const ctx = { ...t2iVideo(), clientRequestId: rid('real-idem') };
  let providerSubmissions = 0;
  const runProvider = async (_job, _clean, api) => {
    providerSubmissions += 1;
    api.register(new FakeChild(), {
      outputPath: path.join(TEST_ROOT, 'tmp', `real-${providerSubmissions}.mp4`),
      expectedMime: 'video/mp4',
      timeoutMs: 5000,
    });
  };
  const [first, second] = await Promise.all([
    gateway.submitGeneration(ctx, { provider: { fake: false }, runProvider, onEvent: () => {} }),
    gateway.submitGeneration(ctx, { provider: { fake: false }, runProvider, onEvent: () => {} }),
  ]);
  const third = await gateway.submitGeneration(
    { ...ctx, inputs: [{ kind: 'url', url: 'https://example.invalid/later.png', role: 'first-frame' }] },
    { provider: { fake: false }, runProvider }
  );
  assert.equal(providerSubmissions, 1, 'concurrent duplicate must not start a second real provider');
  assert.equal(second.id, first.id, 'duplicate must return the existing durable job');
  assert.equal(third.id, first.id, 'existing idempotency key must return the job before validating changed inputs');
  assert.ok(typeof first.pid === 'number' && first.outputPath && first.expectedMime === 'video/mp4');
});

test('per-provider concurrency cap holds the second Codex job in queued (Codex=1)', async () => {
  const events = [];
  const a = await gateway.submitGeneration(
    { ...t2iCodex(), clientRequestId: rid('idem') },
    { onEvent: (e) => events.push(e), provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 } }
  );
  const b = await gateway.submitGeneration(
    { ...t2iCodex(), clientRequestId: rid('idem') },
    { onEvent: (e) => events.push(e), provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 } }
  );
  assert.equal(a.status, 'running', 'first codex job must be running');
  assert.equal(b.status, 'queued', 'second codex job must be queued under the cap');
  assert.equal(scheduler.activeCount('codex'), 1, 'only one codex subprocess may run at once');
  assert.ok(events.some((e) => e.type === 'job_queued' && e.jobId === b.id), 'queue event must fire');
});

test('running job stores child PID, process-group id, and requested output path', async () => {
  const job = await gateway.submitGeneration(
    { ...t2iVideo(), clientRequestId: rid('track') },
    { provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 } }
  );
  assert.equal(job.status, 'running');
  assert.ok(typeof job.pid === 'number' && job.pid > 0, 'child PID must be stored');
  assert.ok(typeof job.pgid === 'number' && job.pgid > 0, 'process-group id must be stored');
  assert.ok(job.outputPath, 'requested output path must be stored');
  const info = scheduler.getSubprocess(job.id);
  assert.ok(info && info.pid === job.pid, 'scheduler must track the registered subprocess');
  assert.ok(info.expectedMime === 'video/mp4', 'expected output MIME must be recorded on the tracking');
});

test('gateway rejects non-uploaded input assets before durable job creation', async () => {
  await assert.rejects(
    () =>
      gateway.submitGeneration(
        {
          ...t2iVideo(),
          inputs: [{ kind: 'url', url: 'https://example.invalid/ref.png', role: 'first-frame' }],
          clientRequestId: rid('bad-url'),
        },
        { provider: { fake: true } }
      ),
    /uploaded asset|asset reference/i
  );
  await assert.rejects(
    () =>
      gateway.submitGeneration(
        {
          ...t2iVideo(),
          inputs: [{ kind: 'asset', assetId: 'asset-does-not-exist', role: 'first-frame' }],
          clientRequestId: rid('missing-asset'),
        },
        { provider: { fake: true } }
      ),
    /asset not found/i
  );
});

test('DELETE /generations/:id cancels and kills the running provider process group', async () => {
  const job = await gateway.submitGeneration(
    { ...t2iVideo(), clientRequestId: rid('track') },
    { provider: { fake: true, longRunning: true, timeoutMs: 5000, subprocessTtlMs: 5000 } }
  );
  const pgid = job.pgid;
  await pollStatus(job.id, () => scheduler.isPidAlive(pgid), { timeoutMs: 1500 });
  assert.equal(scheduler.isPidAlive(pgid), true, 'subprocess must be alive before cancel');
  const outcome = await gateway.cancelGeneration(job.id);
  assert.ok(outcome && outcome.cancelled && outcome.killed, 'cancel must mark the job cancelled and killed');
  assert.equal(scheduler.isTracked(job.id), false, 'cancelled job must no longer be tracked');
  await sleep(150);
  assert.equal(scheduler.isPidAlive(pgid), false, 'the provider process group must actually be dead after cancel');
});

test('timeout kills the process group and marks INTERRUPTED_PROCESS, never auto-resubmit', async () => {
  const job = await gateway.submitGeneration(
    { ...t2iVideo(), clientRequestId: rid('track') },
    { provider: { fake: true, longRunning: true, timeoutMs: 400, subprocessTtlMs: 5000, outputAfterMs: 0 } }
  );
  const settled = await pollStatus(job.id, (j) => j.status === 'INTERRUPTED_PROCESS' || j.status === 'failed');
  assert.equal(settled.status, 'INTERRUPTED_PROCESS', 'timeout must kill the group and mark INTERRUPTED_PROCESS');
  assert.equal(scheduler.isTracked(job.id), false, 'timed-out job must not remain tracked');
});

test('restart reconcile: dead subprocess without verified output never auto-resubmits', async () => {
  const dead = {
    id: 'recon-dead-' + Date.now(),
    status: 'running',
    pid: 999999,
    pgid: 999999,
    outputPath: '/nonexistent/path/output.mp4',
    expectedMime: 'video/mp4',
    modelId: 'native.vertex.veo-3.1',
  };
  const trackedBefore = scheduler.activeCount('vertex');
  const result = await gateway.reconcileJob(dead);
  assert.ok(
    result && (result.status === 'INTERRUPTED_PROCESS' || result.status === 'OUTCOME_UNKNOWN'),
    'dead subprocess without verified output must fail, not stay running'
  );
  assert.notEqual(result.status, 'running');
  assert.equal(scheduler.activeCount('vertex'), trackedBefore, 'reconcile must never spawn new provider work');
});

test('restart reconcile: existing verified output completes only when path and manifest match', async () => {
  const tmpDir = path.join(TEST_ROOT, 'tmp', 'recon-test-' + Date.now());
  await fsp.mkdir(tmpDir, { recursive: true });
  const outputFile = path.join(tmpDir, 'output.png');
  await fsp.writeFile(outputFile, PNG_1X1);
  const job = {
    id: 'recon-output-' + Date.now(),
    status: 'running',
    outputPath: outputFile,
    expectedMime: 'image/png',
    modelId: 'native.vertex.nano-banana-2',
  };
  const result = await gateway.reconcileJob(job);
  assert.equal(result.status, 'completed', 'verified matching output must reconcile to completed');
  assert.ok(result.url && result.url.startsWith('/api/native-media/v1/assets/'), 'completed job must get a same-origin asset url');
  assert.ok(Array.isArray(result.outputs) && result.outputs.length > 0);
  // A claimed manifest mismatch must NOT complete.
  const mismatch = await gateway.reconcileJob({
    id: 'recon-mismatch-' + Date.now(),
    status: 'running',
    outputPath: outputFile,
    expectedMime: 'video/mp4', // wrong mime for a PNG file
    modelId: 'native.vertex.veo-3.1',
  });
  assert.notEqual(mismatch.status, 'completed', 'manifest mismatch must not reconcile to completed');
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('restart reconcile: still-alive subprocess is reattached (left running), not resubmitted', async () => {
  const alive = scheduler.reconcileJobState(
    { id: 'recon-alive', status: 'running', pid: 4242, pgid: 4242, modelId: 'native.vertex.veo-3.1' },
    { isAlive: () => true, verifyOutput: async () => false }
  );
  const result = await alive;
  assert.equal(result, null, 'a still-alive subprocess must be reattached, not resubmitted or failed');
});

test('restart reconcile: completed job with missing output file is marked asset unavailable', async () => {
  const result = await gateway.reconcileJob({
    id: 'recon-gone-' + Date.now(),
    status: 'completed',
    url: '/api/native-media/v1/assets/old',
    outputPath: '/nonexistent/gone.png',
    expectedMime: 'image/png',
    modelId: 'native.vertex.nano-banana-2',
  });
  assert.equal(result.status, 'ASSET_UNAVAILABLE', 'missing output for a completed job must not yield a false success URL');
});

test('restart reconcile settles queued jobs without draining provider work at startup', async () => {
  const id = 'queued-restart-' + Date.now();
  await writeJobs({
    [id]: {
      id,
      request_id: id,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      provider: 'vertex',
      providerConfig: { fake: true },
      modelId: 'native.vertex.veo-3.1-fast',
      task: 'text-to-video',
      prompt: 'queued drain',
      parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
      inputs: [],
      native: true,
    },
  });
  const counts = await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(id);
  assert.equal(counts.unknown, 1, 'queued job must be terminalized during startup reconciliation');
  assert.equal(settled.status, 'OUTCOME_UNKNOWN', 'startup must not drain queued jobs into provider work');
  assert.equal(settled.error, 'STARTUP_QUEUED_NOT_RESUBMITTED');
  assert.equal(scheduler.isTracked(id), false, 'startup reconcile must not spawn provider work');
});

test('disposeAll/reset retire late child exits without mutating later scheduler state', async () => {
  let settled = 0;
  let released = 0;
  let drained = 0;
  const callbacks = {
    onSettle: async () => { settled += 1; },
    onRelease: () => { released += 1; },
    onDrain: () => { drained += 1; },
  };

  const disposed = new FakeChild();
  scheduler.registerSubprocess('late-dispose-' + Date.now(), {
    child: disposed,
    provider: 'vertex',
    timeoutMs: 5000,
    ...callbacks,
  });
  await scheduler.disposeAll();
  disposed.emit('exit', 0, null);

  const reset = new FakeChild();
  scheduler.registerSubprocess('late-reset-' + Date.now(), {
    child: reset,
    provider: 'vertex',
    timeoutMs: 5000,
    ...callbacks,
  });
  scheduler.reset();
  reset.emit('exit', 0, null);

  await sleep(20);
  assert.equal(settled, 0, 'retired subprocess exits must not settle old jobs');
  assert.equal(released, 0, 'retired subprocess exits must not release new scheduler slots');
  assert.equal(drained, 0, 'retired subprocess exits must not drain later queues');
  assert.equal(scheduler.activeCount('vertex'), 0);
});
