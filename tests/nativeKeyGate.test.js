// C0 contract test — key gate behaviour.
//
// Encodes the contract that C2 (nativeModelRegistry.js capabilities +
// components/StandaloneShell.js) must satisfy: native models render and work
// without a MuAPI key, legacy MuAPI models without a key still trigger the
// existing key modal, and the shell renders studios when either a MuAPI key
// exists OR native capabilities report at least one usable model.
//
// Loads the real C2 registry and fails until C2 lands.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { NATIVE_MODEL_IDS, loadNative } = require('./fixtures/nativeContract');

test('native capabilities list at least one usable model without a MuAPI key (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  const caps = await registry.getNativeCapabilities({ apiKey: undefined, enabled: true });
  const capableIds = (caps.models || []).map((m) => m.id || m.modelId);
  for (const id of NATIVE_MODEL_IDS) {
    assert.ok(
      capableIds.includes(id),
      `capabilities without a key must still list ${id}`
    );
  }
});

test('native generation does not require a MuAPI key (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const generate = impl.generateNativeMedia || impl.generate;
  assert.ok(typeof generate === 'function', 'nativeMedia must export a generate function');
  await assert.doesNotReject(
    () =>
      generate({
        modelId: 'native.vertex.nano-banana-2',
        task: 'text-to-image',
        prompt: 'x',
        apiKey: undefined,
      }),
    /api\s*key|apiKey/i,
    'native generation must not reject on missing MuAPI key'
  );
});

test('legacy MuAPI model without a key still routes to the existing key-gated path (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  const isNative = registry.isNativeModelId || registry.isNative;
  assert.ok(typeof isNative === 'function', 'registry must export isNativeModelId');
  const legacyId = 'nano-banana'; // existing MuAPI id from the generated catalog
  assert.equal(isNative(legacyId), false, 'legacy MuAPI id must not be native');
});

test('shell renders studios when native capabilities are usable without a key (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  const usable = registry.hasUsableNativeCapabilities
    ? await registry.hasUsableNativeCapabilities({ apiKey: undefined, enabled: true })
    : ((await registry.getNativeCapabilities({ apiKey: undefined, enabled: true })).models || []).length > 0;
  assert.ok(usable, 'without a MuAPI key, usable native models must keep the shell rendered');
});

test('settings modal does not assume apiKey is a string', () => {
  const source = fs.readFileSync('components/StandaloneShell.js', 'utf8');
  assert.match(source, /apiKey\s*\?\s*`\$\{apiKey\.slice\(0,\s*8\)\}/);
  assert.match(source, /No API key saved/);
});

test('keyless native mode only bypasses the API key modal for native-wired tabs', () => {
  const source = fs.readFileSync('components/StandaloneShell.js', 'utf8');
  assert.match(source, /KEYLESS_NATIVE_TABS\s*=\s*new Set\(\[['"]image['"],\s*['"]video['"]\]\)/);
  assert.match(source, /if \(!apiKey && !KEYLESS_NATIVE_TABS\.has\(activeTab\)\)/);
});
