// C0 contract test — native model catalog overlay.
//
// Encodes the contract that C2 (packages/studio/src/nativeModels.js +
// nativeModelRegistry.js) must satisfy: native aliases are additive, do not
// collide with or remove any existing MuAPI/local model ID, expose the
// capability constraints from the V1 plan, and do not surface Lyria.
//
// The additive/non-removal assertions load the real C2 overlay and therefore
// fail until C2 lands. The non-collision baseline against the existing catalog
// passes now and documents the contract.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NATIVE_MODEL_IDS,
  NATIVE_MODEL_DESCRIPTORS,
  NATIVE_CAPABILITY_CONSTRAINTS,
  existingModelIds,
  loadNative,
} = require('./fixtures/nativeContract');

test('native model ID set matches the frozen V1 contract', () => {
  assert.deepEqual(
    [...NATIVE_MODEL_IDS].sort(),
    NATIVE_MODEL_DESCRIPTORS.map((d) => d.id).sort()
  );
  assert.equal(NATIVE_MODEL_IDS.length, 5);
});

test('native IDs use the native.* namespace and do not collide with existing IDs', () => {
  const existing = existingModelIds();
  assert.ok(existing.size > 0, 'existing model IDs must be discoverable for the collision check');
  for (const id of NATIVE_MODEL_IDS) {
    assert.match(id, /^native\.(vertex|codex)\./, `native id ${id} must be namespaced`);
    assert.ok(!existing.has(id), `native id ${id} must not collide with an existing model id`);
  }
});

test('V1 catalog does not expose Lyria or 4K sizes', () => {
  for (const id of NATIVE_MODEL_IDS) {
    assert.ok(!/lyria/i.test(id), `Lyria is out of V1 scope: ${id}`);
  }
  for (const size of NATIVE_CAPABILITY_CONSTRAINTS.nanoBanana2ImageSizes) {
    assert.notEqual(size, '4K', '4K is preview-gated and hidden in V1');
  }
  for (const size of NATIVE_CAPABILITY_CONSTRAINTS.nanoBananaProImageSizes) {
    assert.notEqual(size, '4K', '4K is preview-gated and hidden in V1');
  }
});

test('capability constraints are internally consistent with the V1 plan', () => {
  const c = NATIVE_CAPABILITY_CONSTRAINTS;
  assert.deepEqual(c.veoDurationsSeconds.sort(), [4, 6, 8]);
  assert.deepEqual(c.veoResolutions.sort(), ['1080p', '720p']);
  assert.equal(c.veoMaxReferenceImages, 3);
  assert.equal(c.veoReferenceDurationSeconds, 8);
  assert.equal(c.nanoBananaMaxReferences, 10);
  assert.equal(c.nanoBananaInputMaxBytes, 7 * 1024 * 1024);
  assert.equal(c.codexConcurrency, 1);
});

test('C2 native overlay is additive and preserves every existing ID (pending C2)', async () => {
  const overlay = await loadNative(
    'packages/studio/src/nativeModels.js',
    'C2 native model overlay'
  );
  assert.ok(overlay, 'nativeModels module must export the native overlay');

  const existing = existingModelIds();
  assert.ok(existing.size > 0);

  const overlayIds = new Set(
    (overlay.NATIVE_MODELS || overlay.nativeModels || []).map((m) => m && m.id)
  );

  for (const id of NATIVE_MODEL_IDS) {
    assert.ok(overlayIds.has(id), `overlay must include ${id}`);
  }
  // Additive rule: every pre-existing ID must remain present after merge.
  const merged = overlay.mergeNativeModels
    ? overlay.mergeNativeModels({ existingIds: [...existing] })
    : null;
  if (merged) {
    for (const id of existing) {
      assert.ok(merged.includes(id), `merge must preserve existing id ${id}`);
    }
  }
});