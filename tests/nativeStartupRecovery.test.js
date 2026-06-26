// I0 regression — startup reconciliation must settle stale non-terminal native
// media jobs left behind by a pre-registration crash or a legacy/malformed job
// store. The incident report found 21 `running`, 1 `created`, and 1
// missing-status/legacy record stuck non-terminal in the local store because
// reconcileOnRestart() was never wired at startup.
//
// This file asserts the three failure shapes from the brief all reach a
// terminal status after reconcileOnRestart():
//   1. a `running` job with no pid (pre-registration crash before subprocess
//      registration completed),
//   2. a `created` job that never acquired a slot,
//   3. a missing-status / malformed legacy record (object with no `status`).
//
// No live Vertex/Codex/MuAPI calls. Fake/gated paths only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TEST_ROOT = path.join(process.cwd(), '.native-media-test', `startup-reconcile-${process.pid}`);
process.env.NATIVE_MEDIA_ROOT = TEST_ROOT;

const gateway = require('../native-media-gateway/exports.js');
const scheduler = gateway.scheduler;

async function writeJobs(jobs) {
  await fsp.mkdir(TEST_ROOT, { recursive: true });
  await fsp.writeFile(path.join(TEST_ROOT, 'jobs.json'), JSON.stringify(jobs, null, 2));
  await fsp.writeFile(path.join(TEST_ROOT, 'idempotency.json'), '{}');
}

function isTerminal(status) {
  return scheduler.TERMINAL_STATUSES.has(status);
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

test('startup reconciliation: a running job with no pid does not remain non-terminal', async () => {
  const id = 'startup-running-no-pid-' + Date.now();
  await writeJobs({
    [id]: {
      id,
      request_id: id,
      status: 'running',
      // No pid/pgid: pre-registration crash left `running` with no subprocess.
      startedAt: new Date().toISOString(),
      modelId: 'native.vertex.veo-3.1',
      provider: 'vertex',
      native: true,
    },
  });
  const counts = await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(id);
  assert.ok(settled, 'job must still be present in the store');
  assert.ok(
    isTerminal(settled.status),
    `running-no-pid job must reach a terminal status after startup, got ${settled.status}`
  );
  assert.notEqual(settled.status, 'running', 'must not remain running');
  assert.notEqual(settled.status, 'queued', 'must not be silently requeued');
  // Reconciliation must never have spawned new provider work for this job.
  assert.equal(scheduler.isTracked(id), false, 'reconcile must not spawn a new subprocess');
});

test('startup reconciliation: a created job does not remain indefinitely non-terminal', async () => {
  const id = 'startup-created-' + Date.now();
  await writeJobs({
    [id]: {
      id,
      request_id: id,
      status: 'created',
      createdAt: new Date().toISOString(),
      modelId: 'native.codex.gpt-image-2',
      provider: 'codex',
      native: true,
    },
  });
  await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(id);
  assert.ok(settled, 'job must still be present in the store');
  assert.ok(
    isTerminal(settled.status),
    `created job must reach a terminal status after startup, got ${settled.status}`
  );
  assert.notEqual(settled.status, 'created', 'must not remain created');
  assert.equal(scheduler.isTracked(id), false, 'reconcile must not spawn a new subprocess');
});

test('startup reconciliation: a queued live provider job is terminalized, not launched', async () => {
  const id = 'startup-queued-live-' + Date.now();
  await writeJobs({
    [id]: {
      id,
      request_id: id,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      modelId: 'native.codex.gpt-image-2',
      task: 'text-to-image',
      prompt: 'queued live must not launch',
      provider: 'codex',
      providerConfig: { fake: false },
      liveCodex: true,
      native: true,
    },
  });
  const counts = await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(id);
  assert.equal(counts.unknown, 1, 'queued startup job must be settled as unknown');
  assert.equal(settled.status, 'OUTCOME_UNKNOWN');
  assert.equal(settled.error, 'STARTUP_QUEUED_NOT_RESUBMITTED');
  assert.equal(scheduler.isTracked(id), false, 'queued live startup job must not spawn provider work');
  assert.equal(scheduler.activeCount('codex'), 0, 'queued live startup job must not take a scheduler slot');
});

test('startup reconciliation: a queued record with no id is settled by store key', async () => {
  const key = 'startup-queued-no-id-' + Date.now();
  await writeJobs({
    [key]: {
      // malformed queued record: no id field.
      request_id: key,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'queued malformed must not launch under undefined',
      provider: 'vertex',
      providerConfig: { fake: false },
      liveVertex: true,
      native: true,
    },
  });
  await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(key);
  const undefinedJob = await gateway.getGeneration('undefined');
  assert.equal(settled.id, key, 'reconcile must backfill id from the durable store key');
  assert.equal(settled.status, 'OUTCOME_UNKNOWN');
  assert.equal(settled.error, 'STARTUP_QUEUED_NOT_RESUBMITTED');
  assert.equal(undefinedJob, null, 'malformed queued startup record must not write an undefined job');
  assert.equal(scheduler.isTracked(undefined), false, 'malformed queued startup record must not spawn provider work');
});

test('startup reconciliation: a missing-status legacy record is settled by store key', async () => {
  const key = 'startup-legacy-no-status-' + Date.now();
  await writeJobs({
    [key]: {
      // Note: no `status` field, no `id` field — a malformed legacy record.
      request_id: key,
      modelId: 'native.vertex.nano-banana-2',
      provider: 'vertex',
      native: true,
      createdAt: new Date().toISOString(),
    },
  });
  await gateway.reconcileOnRestart();
  const settled = await gateway.getGeneration(key);
  assert.ok(settled, 'legacy record must still be addressable by its store key');
  assert.ok(
    isTerminal(settled.status),
    `missing-status legacy record must reach a terminal status, got ${settled.status}`
  );
  assert.equal(settled.id, key, 'reconcile must backfill id from the durable store key');
  assert.equal(settled.request_id, key, 'request_id must be preserved/backfilled');
});

test('startup reconciliation: combines all three stale shapes in one sweep without resubmitting', async () => {
  const runningNoPid = 'startup-combo-running-' + Date.now();
  const created = 'startup-combo-created-' + Date.now();
  const legacy = 'startup-combo-legacy-' + Date.now();
  await writeJobs({
    [runningNoPid]: {
      id: runningNoPid,
      request_id: runningNoPid,
      status: 'running',
      modelId: 'native.vertex.veo-3.1',
      provider: 'vertex',
      native: true,
    },
    [created]: {
      id: created,
      request_id: created,
      status: 'created',
      modelId: 'native.codex.gpt-image-2',
      provider: 'codex',
      native: true,
    },
    [legacy]: {
      // malformed: no status, no id.
      request_id: legacy,
      modelId: 'native.vertex.nano-banana-2',
      provider: 'vertex',
      native: true,
    },
  });

  const trackedBefore = new Set(scheduler.TERMINAL_STATUSES);
  void trackedBefore;
  await gateway.reconcileOnRestart();

  const r = await gateway.getGeneration(runningNoPid);
  const c = await gateway.getGeneration(created);
  const l = await gateway.getGeneration(legacy);
  assert.ok(isTerminal(r.status), `running-no-pid must be terminal, got ${r.status}`);
  assert.ok(isTerminal(c.status), `created must be terminal, got ${c.status}`);
  assert.ok(isTerminal(l.status), `legacy must be terminal, got ${l.status}`);
  // No new subprocesses may have been spawned for the stale jobs.
  assert.equal(scheduler.isTracked(runningNoPid), false);
  assert.equal(scheduler.isTracked(created), false);
  assert.equal(scheduler.isTracked(legacy), false);
});

test('startup reconciliation: idempotent — running it twice never resubmits and keeps terminal jobs terminal', async () => {
  const id = 'startup-idempotent-' + Date.now();
  await writeJobs({
    [id]: {
      id,
      request_id: id,
      status: 'running',
      modelId: 'native.vertex.veo-3.1',
      provider: 'vertex',
      native: true,
    },
  });
  const first = await gateway.reconcileOnRestart();
  const afterFirst = await gateway.getGeneration(id);
  assert.ok(isTerminal(afterFirst.status));
  const second = await gateway.reconcileOnRestart();
  const afterSecond = await gateway.getGeneration(id);
  assert.equal(afterSecond.status, afterFirst.status, 'second sweep must not mutate a now-terminal job');
  assert.equal(scheduler.isTracked(id), false);
  assert.ok(first.unknown >= 1, 'first sweep should have settled the unknown job');
  assert.ok(second.unchanged >= 1, 'second sweep should see the terminal job as unchanged');
});
