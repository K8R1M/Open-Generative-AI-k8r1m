// C0 contract test — native result normalization.
//
// Encodes the contract that the native facade/gateway must satisfy for
// successful native results: normalize to `url` and `outputs`, return only
// same-origin /api/native-media/v1/assets/* URLs, set `native: true`, echo the
// selected model id, and produce a `request_id` (job id). Existing Studio
// histories/renderers depend on `url` + `outputs`, so this normalization must
// not regress.
//
// Loads the real C2/nativeMedia normalizer and fails until C2 lands.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_RESULT_SHAPE,
  loadNative,
} = require('./fixtures/nativeContract');

function isSameOriginAssetUrl(value) {
  return (
    typeof value === 'string' &&
    value.startsWith(NATIVE_ASSET_URL_PREFIX) &&
    !value.includes('://') &&
    !value.startsWith('//')
  );
}

test('frozen normalized result shape documents the V1 contract', () => {
  const r = NATIVE_RESULT_SHAPE;
  assert.equal(r.status, 'completed');
  assert.equal(r.native, true);
  assert.equal(r.model, 'native.vertex.veo-3.1-fast');
  assert.ok(isSameOriginAssetUrl(r.url), 'url must be a same-origin asset URL');
  assert.ok(
    Array.isArray(r.outputs) && r.outputs.every(isSameOriginAssetUrl),
    'outputs must be same-origin asset URLs'
  );
  assert.equal(r.request_id, 'job-id');
});

test('native result normalizes to url and outputs at minimum (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const normalize =
    impl.normalizeNativeResult || impl.normalizeResult;
  assert.ok(typeof normalize === 'function', 'nativeMedia must export a result normalizer');

  const job = { id: 'job-123', modelId: 'native.vertex.veo-3.1-fast' };
  const raw = { status: 'completed', assetId: 'asset-abc' };
  const result = normalize(raw, { job });

  assert.ok(result.url, 'normalized result must expose url');
  assert.ok(Array.isArray(result.outputs) && result.outputs.length > 0, 'outputs must be a non-empty array');
  assert.equal(result.native, true, 'native flag must be true');
  assert.equal(result.model, 'native.vertex.veo-3.1-fast', 'model id must be echoed');
  assert.ok(result.request_id || result.requestId || result.id, 'must carry the job id');
  assert.ok(isSameOriginAssetUrl(result.url), 'url must be a same-origin asset URL');
  for (const o of result.outputs) {
    assert.ok(isSameOriginAssetUrl(o), `output ${o} must be a same-origin asset URL`);
  }
});

test('native result never returns raw filesystem paths (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const normalize = impl.normalizeNativeResult || impl.normalizeResult;
  const raw = { status: 'completed', filePath: '/var/lib/native-media/outputs/x.png' };
  const result = normalize(raw, { job: { id: 'j', modelId: 'native.codex.gpt-image-2' } });
  const serialized = JSON.stringify(result);
  assert.ok(
    !serialized.includes('/var/lib/') && !/^[A-Za-z]:[\\/]/.test(serialized),
    'normalized result must never expose raw filesystem paths'
  );
  assert.equal(result.url, undefined, 'normalizer must not synthesize a URL from job/request ids');
  assert.deepEqual(result.outputs, [], 'normalizer must wait for a real asset URL or explicit asset id');
});

test('native result prefers real raw url/outputs over synthetic asset ids (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const normalize = impl.normalizeNativeResult || impl.normalizeResult;
  const result = normalize(
    {
      status: 'completed',
      id: 'job-id-not-asset',
      assetId: 'asset-explicit',
      url: '/api/native-media/v1/assets/asset-real',
      outputs: ['/api/native-media/v1/assets/asset-real'],
    },
    { job: { id: 'job-should-not-be-asset', modelId: 'native.codex.gpt-image-2' } }
  );
  assert.equal(result.url, '/api/native-media/v1/assets/asset-real');
  assert.deepEqual(result.outputs, ['/api/native-media/v1/assets/asset-real']);
});

test('native failure does not synthesize a successful output url (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const normalize = impl.normalizeNativeResult || impl.normalizeResult;
  const failed = normalize(
    { status: 'failed', error: 'OUTPUT_MISSING' },
    { job: { id: 'j', modelId: 'native.vertex.veo-3.1-fast' } }
  );
  assert.notEqual(failed.status, 'completed');
  assert.ok(!failed.url || failed.url === undefined, 'failed result must not synthesize a url');
  assert.ok(!failed.outputs || (Array.isArray(failed.outputs) && failed.outputs.length === 0));
});
