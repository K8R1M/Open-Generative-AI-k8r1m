// C0 contract test — credential / header boundary.
//
// Encodes the contract that native calls carry no MuAPI `x-api-key`, no
// cookies, no Google credentials, and no Codex auth; and that the gateway
// rejects any client-supplied provider credential fields. No browser request
// or bundle may leak service-account material, access tokens, or Codex auth.
//
// Loads the real C2 facade (request/header builder) and fails until C2 lands.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { NATIVE_CREDENTIAL_DENYLIST, loadNative } = require('./fixtures/nativeContract');

test('credential denylist covers MuAPI, Google, and Codex surfaces', () => {
  const h = NATIVE_CREDENTIAL_DENYLIST.headers;
  for (const required of ['x-api-key', 'cookie', 'authorization']) {
    assert.ok(h.includes(required), `denylist must include ${required}`);
  }
  assert.ok(
    NATIVE_CREDENTIAL_DENYLIST.substrings.includes('GOOGLE_APPLICATION_CREDENTIALS'),
    'denylist must guard the Google ADC env var'
  );
  assert.ok(
    NATIVE_CREDENTIAL_DENYLIST.substrings.includes('private_key'),
    'denylist must guard service-account private key material'
  );
});

function serializedContainsDenylistedLowerCased(serialized) {
  const lower = String(serialized).toLowerCase();
  for (const h of NATIVE_CREDENTIAL_DENYLIST.headers) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  for (const f of NATIVE_CREDENTIAL_DENYLIST.bodyFields) {
    if (lower.includes(f.toLowerCase())) return f;
  }
  for (const s of NATIVE_CREDENTIAL_DENYLIST.substrings) {
    if (lower.includes(s.toLowerCase())) return s;
  }
  return null;
}

test('native request headers omit x-api-key, cookies, and Google/Codex auth (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const buildHeaders = impl.buildNativeHeaders || impl.nativeRequestHeaders;
  assert.ok(typeof buildHeaders === 'function', 'nativeMedia must export a header builder');

  const headers = buildHeaders({ apiKey: 'should-not-be-used', cookie: 'session=abc' });
  const hit = serializedContainsDenylistedLowerCased(JSON.stringify(headers));
  assert.equal(hit, null, `native headers must not carry denylisted credential material (found ${hit})`);
});

test('native request body omits credentials and preserves only user intent (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const fn = impl.buildNativeRequest || impl.buildNativeGenerationRequest;
  const req = fn({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'preset prompt',
    apiKey: 'leak-attempt', // must be stripped, not forwarded
    googleApplicationCredentials: '/etc/evil.json',
  });
  const hit = serializedContainsDenylistedLowerCased(JSON.stringify(req));
  assert.equal(hit, null, `native request body must not carry denylisted credentials (found ${hit})`);
  assert.equal(req.prompt, 'preset prompt', 'prompt intent must survive credential stripping');
});

test('gateway rejects client-supplied provider credential fields (pending C1a)', async () => {
  const gateway = await loadNative(
    'native-media-gateway/exports.js',
    'C1a native media gateway'
  );
  const validate = gateway.validateGenerationRequest || gateway.validateRequest;
  assert.ok(typeof validate === 'function', 'gateway must export a request validator');
  assert.throws(
    () =>
      validate({
        modelId: 'native.vertex.nano-banana-2',
        task: 'text-to-image',
        prompt: 'x',
        googleApplicationCredentials: '/etc/evil.json',
        serviceAccountJson: '{"private_key":"BEGIN PRIVATE KEY"}',
      }),
    /credential|forbidden|not allowed/i,
    'gateway must reject client-supplied credential fields'
  );
});

test('native response never leaks service-account or token material (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const normalize = impl.normalizeNativeResult || impl.normalizeResult;
  const result = normalize(
    { status: 'completed', assetId: 'a' },
    { job: { id: 'j', modelId: 'native.codex.gpt-image-2' } }
  );
  const hit = serializedContainsDenylistedLowerCased(JSON.stringify(result));
  assert.equal(hit, null, `normalized native result must not leak credentials (found ${hit})`);
});

test('native worker boundary does not echo raw internal error messages', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'native-media-gateway/server.js'), 'utf8');
  assert.match(source, /safeError/);
  assert.doesNotMatch(source, /json\(\{\s*error:\s*error\.message\s*\}/);
  for (const field of ['outputPath', 'detail', 'pid', 'pgid', 'subprocessProvider', 'providerConfig']) {
    assert.match(source, new RegExp(`['"]${field}['"]`));
  }
});
