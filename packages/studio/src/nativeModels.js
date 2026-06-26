export const NATIVE_ASSET_URL_PREFIX = '/api/native-media/v1/assets/';
export const NATIVE_VEO_REFERENCE_IMAGES_ENABLED =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES === 'true';

export const NATIVE_MODEL_IDS = [
  'native.vertex.nano-banana-2',
  'native.vertex.nano-banana-pro',
  'native.vertex.veo-3.1',
  'native.vertex.veo-3.1-fast',
  'native.codex.gpt-image-2',
];

export const NATIVE_MODELS = [
  {
    id: 'native.vertex.nano-banana-2',
    label: 'Nano Banana 2 (Server · Vertex AI)',
    provider: 'vertex',
    kind: 'image',
    tasks: ['text-to-image', 'image-to-image'],
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    imageSizes: ['512', '1K', '2K'],
    maxReferences: 10,
  },
  {
    id: 'native.vertex.nano-banana-pro',
    label: 'Nano Banana Pro (Server · Vertex AI)',
    provider: 'vertex',
    kind: 'image',
    tasks: ['text-to-image', 'image-to-image'],
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    imageSizes: ['1K', '2K'],
    maxReferences: 1,
  },
  {
    id: 'native.vertex.veo-3.1',
    label: 'Veo 3.1 (Server · Vertex AI)',
    provider: 'vertex',
    kind: 'video',
    tasks: ['text-to-video', 'image-to-video'],
    aspectRatios: ['16:9', '9:16'],
    durationsSeconds: [4, 6, 8],
    resolutions: ['720p', '1080p'],
    maxReferenceImages: NATIVE_VEO_REFERENCE_IMAGES_ENABLED ? 3 : 0,
    referenceImagesEnabled: NATIVE_VEO_REFERENCE_IMAGES_ENABLED,
    referenceDurationSeconds: 8,
  },
  {
    id: 'native.vertex.veo-3.1-fast',
    label: 'Veo 3.1 Fast (Server · Vertex AI)',
    provider: 'vertex',
    kind: 'video',
    tasks: ['text-to-video', 'image-to-video'],
    aspectRatios: ['16:9', '9:16'],
    durationsSeconds: [4, 6, 8],
    resolutions: ['720p', '1080p'],
    maxReferenceImages: NATIVE_VEO_REFERENCE_IMAGES_ENABLED ? 3 : 0,
    referenceImagesEnabled: NATIVE_VEO_REFERENCE_IMAGES_ENABLED,
    referenceDurationSeconds: 8,
  },
  {
    id: 'native.codex.gpt-image-2',
    label: 'GPT Image 2 (Server · Codex)',
    provider: 'codex',
    kind: 'image',
    tasks: ['text-to-image', 'image-to-image'],
    maxReferences: 10,
  },
];

export const NATIVE_CAPABILITY_CONSTRAINTS = {
  nanoBananaAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  nanoBanana2ImageSizes: ['512', '1K', '2K'],
  nanoBananaProImageSizes: ['1K', '2K'],
  nanoBananaMaxReferences: 10,
  nanoBananaInputMaxBytes: 7 * 1024 * 1024,
  veoAspectRatios: ['16:9', '9:16'],
  veoDurationsSeconds: [4, 6, 8],
  veoResolutions: ['720p', '1080p'],
  veoI2vInputMaxBytes: 20 * 1024 * 1024,
  veoMaxReferenceImages: NATIVE_VEO_REFERENCE_IMAGES_ENABLED ? 3 : 0,
  veoReferenceDurationSeconds: 8,
  codexConcurrency: 1,
};

const NATIVE_MODEL_INDEX = new Map(NATIVE_MODELS.map((m) => [m.id, m]));

export function nativeModelById(id) {
  return NATIVE_MODEL_INDEX.get(id) || null;
}

export function isNativeModelId(id) {
  return typeof id === 'string' && NATIVE_MODEL_INDEX.has(id);
}

export function assetUrl(assetId) {
  return `${NATIVE_ASSET_URL_PREFIX}${assetId}`;
}

export function isSameOriginAssetUrl(value) {
  return (
    typeof value === 'string' &&
    value.startsWith(NATIVE_ASSET_URL_PREFIX) &&
    !value.includes('://') &&
    !value.startsWith('//')
  );
}

export function mergeNativeModels({ existingIds = [], existingModels = [] } = {}) {
  const seen = new Set();
  const merged = [];
  const idsIn = existingIds.length > 0 ? existingIds : existingModels.map((m) => m && m.id).filter(Boolean);
  for (const id of idsIn) {
    if (id && !seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  for (const id of NATIVE_MODEL_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

export function mergeNativeModelLists(existingModels = []) {
  const seen = new Set();
  const merged = [];
  for (const m of existingModels) {
    if (m && m.id && !seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  for (const m of NATIVE_MODELS) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  return merged;
}
