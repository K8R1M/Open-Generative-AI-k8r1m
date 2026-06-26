// Test-only contract fixture for Native Media V1 (C0).
//
// This file is NOT production implementation. It encodes the shared
// gateway/registry/facade contract that slices C1a/C1b/C2 must satisfy,
// so contract tests can assert against a single canonical source of truth
// and fail clearly when the real implementation is not yet present.
//
// Keeping the contract here lets C0 tests document the frozen shapes
// (native model IDs, request envelope, normalized result, capability
// constraints, credential denylist, feature-flag expectations) without
// shipping any production source.

'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..', '..');

const NATIVE_ASSET_URL_PREFIX = '/api/native-media/v1/assets/';

const NATIVE_ROUTES = [
  'GET /api/native-media/v1/health',
  'GET /api/native-media/v1/ready',
  'GET /api/native-media/v1/capabilities',
  'POST /api/native-media/v1/uploads',
  'POST /api/native-media/v1/generations',
  'GET /api/native-media/v1/generations/:id',
  'DELETE /api/native-media/v1/generations/:id',
  'GET /api/native-media/v1/assets/:assetId',
];

const NATIVE_MODEL_IDS = [
  'native.vertex.nano-banana-2',
  'native.vertex.nano-banana-pro',
  'native.vertex.veo-3.1',
  'native.vertex.veo-3.1-fast',
  'native.codex.gpt-image-2',
];

const NATIVE_MODEL_DESCRIPTORS = [
  {
    id: 'native.vertex.nano-banana-2',
    label: 'Nano Banana 2 (Server · Vertex AI)',
    provider: 'vertex',
    tasks: ['text-to-image', 'image-to-image'],
  },
  {
    id: 'native.vertex.nano-banana-pro',
    label: 'Nano Banana Pro (Server · Vertex AI)',
    provider: 'vertex',
    tasks: ['text-to-image', 'image-to-image'],
  },
  {
    id: 'native.vertex.veo-3.1',
    label: 'Veo 3.1 (Server · Vertex AI)',
    provider: 'vertex',
    tasks: ['text-to-video', 'image-to-video'],
  },
  {
    id: 'native.vertex.veo-3.1-fast',
    label: 'Veo 3.1 Fast (Server · Vertex AI)',
    provider: 'vertex',
    tasks: ['text-to-video', 'image-to-video'],
  },
  {
    id: 'native.codex.gpt-image-2',
    label: 'GPT Image 2 (Server · Codex)',
    provider: 'codex',
    tasks: ['text-to-image', 'image-to-image'],
  },
];

const NATIVE_CAPABILITY_CONSTRAINTS = {
  nanoBananaAspectRatios: [
    '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
  ],
  nanoBanana2ImageSizes: ['512', '1K', '2K'],
  nanoBananaProImageSizes: ['1K', '2K'],
  nanoBananaMaxReferences: 10,
  nanoBananaInputMaxBytes: 7 * 1024 * 1024,
  veoAspectRatios: ['16:9', '9:16'],
  veoDurationsSeconds: [4, 6, 8],
  veoResolutions: ['720p', '1080p'],
  veoI2vInputMaxBytes: 20 * 1024 * 1024,
  veoMaxReferenceImages: 3,
  veoReferenceDurationSeconds: 8,
  codexConcurrency: 1,
};

const NATIVE_REQUEST_ENVELOPE = {
  modelId: 'native.vertex.veo-3.1-fast',
  task: 'image-to-video',
  prompt: 'Prompt text unchanged',
  parameters: {
    durationSeconds: 6,
    aspectRatio: '16:9',
    resolution: '1080p',
    audio: true,
  },
  inputs: [
    { kind: 'asset', assetId: 'asset-start', role: 'first-frame' },
    { kind: 'asset', assetId: 'asset-end', role: 'last-frame' },
  ],
  clientRequestId: 'uuid',
};

const NATIVE_RESULT_SHAPE = {
  status: 'completed',
  request_id: 'job-id',
  url: '/api/native-media/v1/assets/asset-id',
  outputs: ['/api/native-media/v1/assets/asset-id'],
  native: true,
  model: 'native.vertex.veo-3.1-fast',
};

// Headers / fields that must NEVER appear on native requests or responses.
// Native models must work without a MuAPI key and must not leak Google or
// Codex auth material to the browser.
const NATIVE_CREDENTIAL_DENYLIST = {
  headers: [
    'x-api-key',
    'authorization',
    'cookie',
    'google_application_credentials',
    'x-goog-api-key',
    'x-codex-auth',
  ],
  bodyFields: [
    'apiKey',
    'api_key',
    'x_api-key',
    'googleApplicationCredentials',
    'serviceAccountJson',
    'accessToken',
    'access_token',
    'idToken',
    'codexAuth',
  ],
  substrings: [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'private_key',
    'client_email',
    'BEGIN PRIVATE KEY',
    'service_account',
  ],
};

const NATIVE_FEATURE_FLAG = {
  envVar: 'NATIVE_MEDIA_ENABLED',
  disabledValue: 'false',
  defaultValueEnabled: true,
};

function existingModelIds() {
  const ids = new Set();
  try {
    const dump = require(path.join(repoRoot, 'models_dump.json'));
    for (const m of dump.t2i || []) {
      if (m && m.id) ids.add(m.id);
    }
  } catch {
    // models_dump.json is optional for the contract; absence is not a hard failure.
  }
  try {
    const catalog = require(path.join(repoRoot, 'electron', 'lib', 'modelCatalog.js'))
      .LOCAL_MODEL_CATALOG;
    for (const m of catalog || []) {
      if (m && m.id) ids.add(m.id);
    }
  } catch {
    // electron local catalog is optional for the contract.
  }
  return ids;
}

// Attempt to load an implementation module that a later slice (C1a/C1b/C2) is
// expected to provide. When it is not yet present, fail the calling test with
// a clear "pending implementation" message so the contract gate signals work
// remaining without an opaque module-not-found crash. When present, return the
// module namespace (ESM) or `module.exports` (CJS) normalized.
async function loadNative(rel, label) {
  const target = path.join(repoRoot, rel);
  try {
    const mod = await import(pathToFileURL(target).href);
    return mod.default && Object.keys(mod).length === 1 ? mod.default : mod;
  } catch (err) {
    const missing =
      err && (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND');
    if (missing) {
      assert.fail(
        `${label} not yet implemented (expected ${rel}); this C0 contract test fails until the owning slice lands.`
      );
    }
    throw err;
  }
}

module.exports = {
  repoRoot,
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_ROUTES,
  NATIVE_MODEL_IDS,
  NATIVE_MODEL_DESCRIPTORS,
  NATIVE_CAPABILITY_CONSTRAINTS,
  NATIVE_REQUEST_ENVELOPE,
  NATIVE_RESULT_SHAPE,
  NATIVE_CREDENTIAL_DENYLIST,
  NATIVE_FEATURE_FLAG,
  existingModelIds,
  loadNative,
};