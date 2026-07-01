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
  assert.equal(NATIVE_MODEL_IDS.length, 7);
});

test('native IDs use the native.* namespace and do not collide with existing IDs', () => {
  const existing = existingModelIds();
  assert.ok(existing.size > 0, 'existing model IDs must be discoverable for the collision check');
  for (const id of NATIVE_MODEL_IDS) {
    assert.match(id, /^native\.(vertex|codex|grok)\./, `native id ${id} must be namespaced`);
    assert.ok(!existing.has(id), `native id ${id} must not collide with an existing model id`);
  }
});

test('V1 catalog does not expose Lyria or 4K sizes', () => {
  for (const id of NATIVE_MODEL_IDS) {
    assert.ok(!/lyria/i.test(id), `Lyria is out of V1 scope: ${id}`);
  }
  for (const size of NATIVE_CAPABILITY_CONSTRAINTS.nanoBanana2ImageSizes) {
    assert.notEqual(size, '2K', 'Nano Banana 2 2K is not supported in the native V1 UI');
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
  assert.deepEqual(c.omniAspectRatios, ['16:9', '9:16']);
  assert.deepEqual(c.omniDurationsSeconds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(c.omniMaxReferenceImages, 10);
  assert.equal(c.nanoBananaMaxReferences, 10);
  assert.equal(c.nanoBananaInputMaxBytes, 7 * 1024 * 1024);
  assert.deepEqual(c.nanoBanana2ImageSizes, ['1K', '512']);
  assert.deepEqual(c.codexAspectRatios, ['auto', '1:1', '16:9', '9:16', '4:3', '3:4']);
  assert.deepEqual(c.codexImageSizes, ['1K', '2K', '4K']);
  assert.equal(c.codexDefaultAspectRatio, 'auto');
  assert.equal(c.codexDefaultImageSize, '1K');
  assert.equal(c.codexConcurrency, 1);
  assert.deepEqual([...c.grokDurationsSeconds].sort((a, b) => a - b), [6, 10]);
  assert.deepEqual(c.grokResolutions.sort(), ['480p', '720p']);
  assert.equal(c.grokMaxReferenceImages, 6);
  assert.equal(c.grokSupportsAspectRatio, false);
  assert.equal(c.grokSupportsAudioToggle, false);
  assert.equal(c.grokSupportsLastFrame, false);
});

test('C2 native overlay exposes Omni as a selectable native video model', async () => {
  const overlay = await loadNative(
    'packages/studio/src/nativeModels.js',
    'C2 native model overlay'
  );
  const omni = overlay.nativeModelById('native.vertex.gemini-omni-flash-preview');

  assert.equal(omni.label, 'Gemini Omni Flash Preview (Server · Vertex AI)');
  assert.equal(omni.provider, 'omni');
  assert.equal(omni.kind, 'video');
  assert.deepEqual(omni.tasks, ['text-to-video', 'image-to-video']);
  assert.deepEqual(omni.aspectRatios, ['16:9', '9:16']);
  assert.deepEqual(omni.durationsSeconds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(omni.maxReferenceImages, 10);
  assert.equal(omni.supportsAudioToggle, false);
  assert.equal(omni.supportsLastFrame, false);
});

test('C2 native overlay exposes image-control defaults for Nano Banana 2 and Codex GPT Image 2', async () => {
  const overlay = await loadNative(
    'packages/studio/src/nativeModels.js',
    'C2 native model overlay'
  );
  const byId = overlay.nativeModelById || ((id) => (overlay.NATIVE_MODELS || []).find((m) => m.id === id));

  const nano2 = byId('native.vertex.nano-banana-2');
  assert.deepEqual(nano2.imageSizes, ['1K', '512']);
  assert.equal(nano2.imageSizes[0], '1K');
  assert.ok(!nano2.imageSizes.includes('2K'), 'stale Nano Banana 2 2K option must not reach the UI');

  const codex = byId('native.codex.gpt-image-2');
  assert.deepEqual(codex.aspectRatios, ['auto', '1:1', '16:9', '9:16', '4:3', '3:4']);
  assert.deepEqual(codex.imageSizes, ['1K', '2K', '4K']);
  assert.equal(codex.defaultAspectRatio, 'auto');
  assert.equal(codex.defaultImageSize, '1K');
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
