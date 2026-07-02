import { nativeModelById } from "./nativeModels.js";

const OMNI_VIDEO_DISPLAY_RESOLUTION = "720p";

export function nativeVideoCardResolution(modelOrId, selectedResolution) {
  const model = typeof modelOrId === "string" ? nativeModelById(modelOrId) : modelOrId;
  if (model?.provider === "omni" && Array.isArray(model.resolutions) && model.resolutions.length === 0) {
    return OMNI_VIDEO_DISPLAY_RESOLUTION;
  }
  return selectedResolution;
}

export function normalizeImageServerHistoryEntry(item) {
  const url = item?.url || item?.outputs?.[0];
  if (!url) return null;
  return {
    id: item.jobId || item.id,
    jobId: item.jobId || item.id,
    url,
    prompt: item.prompt || "",
    model: item.modelId || item.model,
    aspect_ratio: item.aspectRatio || item.aspect_ratio,
    displayName: item.displayName || item.downloadName || item.filename ? item.displayName || undefined : undefined,
    downloadName: item.downloadName || item.displayName || item.filename,
    timestamp: item.createdAt || item.completedAt || new Date().toISOString(),
    native: true,
    serverBacked: true,
  };
}

export function normalizeVideoServerHistoryEntry(item) {
  const url = item?.url || item?.outputs?.[0];
  if (!url) return null;
  const params = item.parameters || {};
  return {
    id: item.jobId || item.id,
    jobId: item.jobId || item.id,
    url,
    prompt: item.prompt || "",
    model: item.modelId || item.model,
    aspect_ratio: item.aspectRatio || item.aspect_ratio || params.aspectRatio || params.aspect_ratio,
    duration: item.duration || item.durationSeconds || params.duration || params.durationSeconds,
    resolution: nativeVideoCardResolution(item.modelId || item.model, item.resolution || params.resolution),
    displayName: item.displayName || item.downloadName || item.filename ? item.displayName || undefined : undefined,
    downloadName: item.downloadName || item.displayName || item.filename,
    timestamp: item.createdAt || item.completedAt || new Date().toISOString(),
    status: item.status || "completed",
    native: true,
    serverBacked: true,
  };
}

export function historyKeys(entry) {
  return [entry?.jobId, entry?.request_id, entry?.id, entry?.url].filter(Boolean);
}

export function sameHistoryEntry(a, b) {
  return historyKeys(a).some((key) => historyKeys(b).includes(key));
}
