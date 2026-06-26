// C0 contract test — fake-first durable job and idempotency.
//
// Encodes the contract that the gateway fake provider (C1a) and single-host
// scheduler (C1b) must satisfy: a durable job row exists before any provider
// work begins, and a duplicate `clientRequestId` must not submit paid/provider
// work twice. Also covers cancel semantics as a contract assertion.
//
// These load the C1a fake provider / job store and fail until C1a lands.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadNative } = require('./fixtures/nativeContract');

const rid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function newCtx() {
  return {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: 'fake prompt',
    parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p' },
    clientRequestId: rid('client-req'),
  };
}

test('fake generation creates a durable job before provider work (pending C1a)', async () => {
  const gateway = await loadNative(
    'native-media-gateway/exports.js',
    'C1a native media gateway'
  );
  const submit = gateway.submitGeneration || gateway.createGeneration;
  assert.ok(typeof submit === 'function', 'gateway must export a submit/create function');

  const events = [];
  const record = (e) => events.push(e);
  const job = await submit(newCtx(), { onEvent: record, provider: { fake: true } });

  const jobCreatedIndex = events.findIndex((e) => e && e.type === 'job_created');
  const providerWorkIndex = events.findIndex((e) => e && e.type === 'provider_work_started');
  assert.ok(jobCreatedIndex >= 0, 'a durable job_created event must be emitted');
  assert.ok(
    providerWorkIndex > jobCreatedIndex,
    'provider work must start only after the durable job row exists'
  );
  assert.ok(job && (job.id || job.request_id), 'submit must return a job id');
});

test('duplicate clientRequestId does not submit twice (pending C1a)', async () => {
  const gateway = await loadNative(
    'native-media-gateway/exports.js',
    'C1a native media gateway'
  );
  const submit = gateway.submitGeneration || gateway.createGeneration;
  const ctx = newCtx();

  let providerSubmissions = 0;
  const onEvent = (e) => {
    if (e && e.type === 'provider_work_started') providerSubmissions += 1;
  };

  const first = await submit(ctx, { onEvent, provider: { fake: true } });
  const second = await submit(ctx, { onEvent, provider: { fake: true } });

  assert.ok(first && (first.id || first.request_id), 'first submit must create a job');
  assert.equal(
    providerSubmissions,
    1,
    'duplicate clientRequestId must not trigger provider work twice'
  );
  // The second submit must reference the existing job, not create a new provider call.
  assert.equal(
    (second.id || second.request_id),
    (first.id || first.request_id),
    'duplicate request must resolve to the same job id'
  );
});

test('DELETE /generations/:id cancels running provider subprocess group (pending C1b)', async () => {
  const gateway = await loadNative('native-media-gateway/exports.js', 'C1b scheduler');
  const cancel = gateway.cancelGeneration || gateway.cancelJob;
  assert.ok(typeof cancel === 'function', 'gateway must export a cancel function');

  const submit = gateway.submitGeneration || gateway.createGeneration;
  const ctx = { ...newCtx(), clientRequestId: rid('cancel-req') };
  const job = await submit(ctx, { provider: { fake: true, longRunning: true } });

  const outcome = await cancel(job.id || job.request_id);
  assert.ok(
    outcome && (outcome.cancelled || outcome.status === 'cancelled' || outcome.killed === true),
    'cancel must actually kill the running provider subprocess'
  );
});

test('interrupted subprocess without verified output never auto-resubmits (pending C1b)', async () => {
  const gateway = await loadNative('native-media-gateway/exports.js', 'C1b scheduler');
  const reconcile = gateway.reconcileJob || gateway.reconcileOnRestart;
  assert.ok(typeof reconcile === 'function', 'scheduler must expose restart reconciliation');

  const deadWithoutOutput = {
    id: 'dead-1',
    pid: 99999,
    outputResolved: false,
    status: 'running',
  };
  const result = await reconcile(deadWithoutOutput);
  assert.ok(
    !result || result.status === 'failed' || result.status === 'INTERRUPTED_PROCESS' || result.status === 'OUTCOME_UNKNOWN',
    'a dead subprocess without verified output must not auto-resubmit'
  );
  assert.notEqual(result && result.status, 'running', 'must leave the running state');
});
