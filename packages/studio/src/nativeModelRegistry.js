import {
  NATIVE_MODELS,
  NATIVE_MODEL_IDS,
  isNativeModelId as overlayIsNativeModelId,
} from './nativeModels.js';

export const NATIVE_FEATURE_FLAG = {
  envVar: 'NATIVE_MEDIA_ENABLED',
  disabledValue: 'false',
  defaultValueEnabled: true,
};

export { NATIVE_MODEL_IDS };

function envNativeEnabled() {
  const v =
    typeof process !== 'undefined' && process.env
      ? process.env[NATIVE_FEATURE_FLAG.envVar]
      : undefined;
  if (v === undefined || v === null || v === '') return NATIVE_FEATURE_FLAG.defaultValueEnabled;
  return String(v).toLowerCase() !== NATIVE_FEATURE_FLAG.disabledValue;
}

function effectiveEnabled(explicit) {
  const enabled = explicit === undefined ? true : Boolean(explicit);
  return enabled && envNativeEnabled();
}

export function isNativeModelId(id) {
  return overlayIsNativeModelId(id);
}

export async function getNativeCapabilities(opts = {}) {
  if (!effectiveEnabled(opts.enabled)) {
    return { models: [], enabled: false };
  }
  return {
    models: NATIVE_MODELS.map((m) => ({ ...m })),
    enabled: true,
  };
}

export async function hasUsableNativeCapabilities(opts = {}) {
  const caps = await getNativeCapabilities(opts);
  return (caps.models || []).length > 0;
}
