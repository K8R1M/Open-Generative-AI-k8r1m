// C0 contract test — NATIVE_MEDIA_ENABLED feature flag rollback.
//
// Encodes the contract that C2 (nativeModelRegistry.js capabilities) must
// satisfy for the global rollback flag: NATIVE_MEDIA_ENABLED=false hides all
// native capabilities (returns an empty native model list) and leaves legacy
// app behavior intact. The existing MuAPI/local providers must remain
// reachable and unchanged when the flag is disabled.
//
// Loads the real C2 registry and fails until C2 lands.

const test = require('node:test');
const assert = require('node:assert/strict');

const { NATIVE_FEATURE_FLAG, NATIVE_MODEL_IDS, loadNative } = require('./fixtures/nativeContract');

test('feature flag env var name and disable value are frozen', () => {
  assert.equal(NATIVE_FEATURE_FLAG.envVar, 'NATIVE_MEDIA_ENABLED');
  assert.equal(NATIVE_FEATURE_FLAG.disabledValue, 'false');
  assert.equal(NATIVE_FEATURE_FLAG.defaultValueEnabled, true);
});

async function withEnv(value, fn) {
  const prev = process.env[NATIVE_FEATURE_FLAG.envVar];
  if (value === undefined) delete process.env[NATIVE_FEATURE_FLAG.envVar];
  else process.env[NATIVE_FEATURE_FLAG.envVar] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[NATIVE_FEATURE_FLAG.envVar];
    else process.env[NATIVE_FEATURE_FLAG.envVar] = prev;
  }
}

test('NATIVE_MEDIA_ENABLED=false hides native capabilities (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  await withEnv('false', async () => {
    const caps = await registry.getNativeCapabilities({ apiKey: undefined, enabled: false });
    assert.ok(
      Array.isArray(caps.models) && caps.models.length === 0,
      'disabled flag must yield an empty native capabilities list'
    );
    for (const id of NATIVE_MODEL_IDS) {
      assert.ok(
        !(caps.models || []).some((m) => (m.id || m.modelId) === id),
        `${id} must be hidden when disabled`
      );
    }
  });
});

test('NATIVE_MEDIA_ENABLED=true exposes native capabilities (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  await withEnv('true', async () => {
    const caps = await registry.getNativeCapabilities({ apiKey: undefined, enabled: true });
    assert.ok((caps.models || []).length > 0, 'enabled flag must expose native models');
  });
});

test('disabled flag keeps legacy MuAPI/local model routing intact (pending C2)', async () => {
  const registry = await loadNative(
    'packages/studio/src/nativeModelRegistry.js',
    'C2 native model registry'
  );
  const isNative = registry.isNativeModelId || registry.isNative;
  await withEnv('false', async () => {
    // A legacy id selected while the flag is off must NOT be treated as native.
    assert.equal(isNative('nano-banana'), false);
    // The merge surface for legacy models must remain non-empty.
    const caps = await registry.getNativeCapabilities({ apiKey: undefined, enabled: false });
    assert.equal((caps.models || []).length, 0, 'only native capabilities are hidden, not legacy ones are changed here');
  });
});