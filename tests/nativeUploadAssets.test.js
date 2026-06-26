// C0 contract test — native upload / reference asset handling.
//
// Encodes the contract that C2 (nativeMedia.js native upload helper) and the
// gateway upload endpoint (C1a) must satisfy: native uploads route to
// /api/native-media/v1/uploads, return browser-renderable same-origin asset
// URLs, do not require a MuAPI key, reject unsupported MIME before provider
// work, and never expose raw filesystem paths to the browser.
//
// Loads the real C2 upload helper and fails until C2/C1a land.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_ROUTES,
  loadNative,
} = require('./fixtures/nativeContract');

const UPLOAD_ROUTE = 'POST /api/native-media/v1/uploads';

test('upload route exists in the frozen V1 route contract', () => {
  assert.ok(NATIVE_ROUTES.includes(UPLOAD_ROUTE));
});

test('native upload returns a same-origin /assets/* URL without a MuAPI key (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const upload = impl.uploadNativeFile || impl.uploadToNative;
  assert.ok(typeof upload === 'function', 'nativeMedia must export an upload helper');

  const fakeFile = { name: 'ref.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
  const result = await upload(fakeFile, { apiKey: undefined });

  assert.ok(result && result.url, 'upload must return a url');
  assert.ok(
    result.url.startsWith(NATIVE_ASSET_URL_PREFIX),
    `upload url must be a same-origin asset URL, got ${result.url}`
  );
  assert.ok(!result.url.includes('://'), 'never expose external/absolute URLs');
  assert.ok(result.assetId || result.id, 'upload must return an opaque asset id');
});

test('native upload helper does not require a MuAPI key (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const upload = impl.uploadNativeFile || impl.uploadToNative;
  // Calling without any apiKey option must not throw a missing-key error.
  const fakeFile = { name: 'a.png', mime: 'image/png', bytes: Buffer.alloc(4) };
  await assert.doesNotReject(() => upload(fakeFile), /api\s*key|apiKey/i);
});

test('native upload rejects unsupported MIME before any provider work (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const upload = impl.uploadNativeFile || impl.uploadToNative;
  const evil = { name: 'malware.exe', mime: 'application/x-msdownload', bytes: Buffer.from('MZ') };
  await assert.rejects(() => upload(evil), /mime|type|unsupported/i, 'unsupported MIME must be rejected');
});

test('native upload never exposes raw filesystem paths (pending C2)', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'C2 native facade');
  const upload = impl.uploadNativeFile || impl.uploadToNative;
  const fakeFile = { name: 'ref.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
  const result = await upload(fakeFile);
  const serialized = JSON.stringify(result);
  assert.ok(
    !serialized.includes('/var/lib/') &&
      !/\.(native-media)[\\/]/.test(serialized) &&
      !/^[A-Za-z]:[\\/]/.test(serialized),
    'upload result must never expose raw storage paths'
  );
});