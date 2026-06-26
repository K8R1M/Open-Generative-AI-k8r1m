// C0 contract test — native gateway request payloads.
//
// Encodes the contract that C2 (nativeMedia.js facade) and the gateway must
// satisfy for native generation requests: prompt text is preserved verbatim,
// Veo duration is submitted structurally as durationSeconds (never injected
// into prompt text), resolution/aspect/audio are structural fields, and
// reference/first-frame/last-frame inputs preserve order and roles.
//
// These load the real C2/nativeMedia request builder and fail until C2 lands.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NATIVE_REQUEST_ENVELOPE,
  NATIVE_CAPABILITY_CONSTRAINTS,
  loadNative,
} = require('./fixtures/nativeContract');

const SAMPLE_PROMPT = 'Prompt text unchanged';

function buildRequest(impl, opts) {
  const fn = impl.buildNativeRequest || impl.buildNativeGenerationRequest;
  assert.ok(typeof fn === 'function', 'nativeMedia must export a request builder');
  return fn(opts);
}

test('native image T2I request preserves prompt text verbatim (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const req = buildRequest(impl, {
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: SAMPLE_PROMPT,
    parameters: { aspectRatio: '1:1' },
    clientRequestId: 'req-1',
  });
  assert.equal(req.prompt, SAMPLE_PROMPT, 'prompt text must be preserved unchanged');
  assert.equal(req.modelId, 'native.vertex.nano-banana-2');
  assert.equal(req.task, 'text-to-image');
  assert.ok(req.clientRequestId, 'clientRequestId must be present');
});

test('native video T2V request carries duration as durationSeconds (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const req = buildRequest(impl, {
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt: SAMPLE_PROMPT,
    parameters: { durationSeconds: 6, aspectRatio: '16:9', resolution: '1080p', audio: true },
    clientRequestId: 'req-2',
  });
  assert.equal(req.prompt, SAMPLE_PROMPT);
  const dur =
    (req.parameters && req.parameters.durationSeconds) ??
    (req.parameters && req.parameters.duration);
  assert.equal(dur, 6, 'duration must be the structural durationSeconds field');
  assert.ok(!/6\s*sec/.test(req.prompt), 'duration must not be embedded in prompt text');
  assert.equal(req.parameters.resolution, '1080p', 'resolution must be structural');
  assert.equal(req.parameters.audio, true, 'audio toggle must be structural');
});

test('native I2V request maps first/last frame without default reference roles (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const req = buildRequest(impl, {
    modelId: 'native.vertex.veo-3.1',
    task: 'image-to-video',
    prompt: SAMPLE_PROMPT,
    parameters: { durationSeconds: 8, aspectRatio: '16:9', resolution: '1080p' },
    inputs: [
      { kind: 'asset', assetId: 'asset-start', role: 'first-frame' },
      { kind: 'asset', assetId: 'asset-end', role: 'last-frame' },
    ],
    clientRequestId: 'req-3',
  });
  assert.equal(req.prompt, SAMPLE_PROMPT);
  const inputs = req.inputs || [];
  assert.equal(inputs.length, 2, 'start/end inputs must be preserved');
  assert.deepEqual(inputs.map((i) => i.role), ['first-frame', 'last-frame']);
});

test('Veo reference inputs are preview-gated off by default (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const refs = ['r1'].map((assetId) => ({
    kind: 'asset',
    assetId,
    role: 'reference',
  }));
  assert.throws(
    () =>
      buildRequest(impl, {
        modelId: 'native.vertex.veo-3.1',
        task: 'image-to-video',
        prompt: SAMPLE_PROMPT,
        parameters: { durationSeconds: 8 },
        inputs: refs,
      }),
    /reference images are disabled/i,
    'Veo reference images must be rejected unless the preview flag is enabled'
  );
  const models = await loadNative('packages/studio/src/nativeModels.js', 'C2 native model registry');
  assert.equal(
    models.nativeModelById('native.vertex.veo-3.1').maxReferenceImages,
    0,
    'default V1 capability set must not expose Veo reference image slots'
  );
});

test('native builder rejects browser-controlled URLs as inputs (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  assert.throws(
    () =>
      buildRequest(impl, {
        modelId: 'native.vertex.veo-3.1-fast',
        task: 'image-to-video',
        prompt: SAMPLE_PROMPT,
        parameters: { durationSeconds: 4 },
        inputs: [{ kind: 'asset', assetId: 'https://example.invalid/ref.png', role: 'first-frame' }],
      }),
    /uploaded native assets/i
  );
});

test('unsupported Veo duration is rejected structurally (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  assert.throws(
    () =>
      buildRequest(impl, {
        modelId: 'native.vertex.veo-3.1-fast',
        task: 'text-to-video',
        prompt: SAMPLE_PROMPT,
        parameters: { durationSeconds: 11 },
      }),
    /duration/i,
    'duration outside 4/6/8 must be rejected before any provider call'
  );
});

test('canonical envelope shape matches the frozen V1 contract', () => {
  const env = NATIVE_REQUEST_ENVELOPE;
  assert.equal(env.modelId, 'native.vertex.veo-3.1-fast');
  assert.equal(env.task, 'image-to-video');
  assert.equal(env.prompt, SAMPLE_PROMPT);
  assert.equal(env.parameters.durationSeconds, 6);
  assert.ok(env.inputs.every((i) => i.kind === 'asset'), 'inputs are asset references');
  assert.equal(typeof env.clientRequestId, 'string');
});
