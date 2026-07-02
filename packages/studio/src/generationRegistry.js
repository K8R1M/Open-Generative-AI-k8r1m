import { pollNativeGeneration } from "./nativeMedia.js";
import {
  normalizeImageServerHistoryEntry,
  normalizeVideoServerHistoryEntry,
} from "./studioHistory.js";

const STORAGE_KEY = "native_generation_registry_v1";
const pending = new Map();
const undelivered = new Map();
const subscribers = new Map([
  ["image", new Set()],
  ["video", new Set()],
]);
const activePolls = new Set();

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function persist() {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pending: [...pending.entries()],
        undelivered: [...undelivered.entries()],
      }),
    );
  } catch (err) {
    console.warn("Failed to persist native generation registry:", err);
  }
}

function rehydrate() {
  if (!storageAvailable()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const [jobId, job] of Array.isArray(data?.pending) ? data.pending : []) {
      if (jobId && job?.studio) pending.set(jobId, job);
    }
    for (const [jobId, item] of Array.isArray(data?.undelivered) ? data.undelivered : []) {
      if (jobId && item?.studio && item?.entry) undelivered.set(jobId, item);
    }
  } catch (err) {
    console.warn("Failed to load native generation registry:", err);
  }
}

function notify(studio) {
  for (const cb of subscribers.get(studio) || []) {
    try {
      cb();
    } catch (err) {
      console.warn("Native generation registry subscriber failed:", err);
    }
  }
}

function normalizeEntry(studio, item) {
  return studio === "video"
    ? normalizeVideoServerHistoryEntry(item)
    : normalizeImageServerHistoryEntry(item);
}

function failedVideoEntry(job, err) {
  return {
    id: job.jobId,
    jobId: job.jobId,
    url: "",
    prompt: job.prompt || "",
    model: job.modelId,
    displayName: job.displayName || undefined,
    downloadName: job.displayName || undefined,
    timestamp: Date.now(),
    status: "failed",
    native: true,
    serverBacked: true,
    error: err?.message || String(err || "Native generation failed"),
  };
}

function dropMissingJob(err) {
  return /Native generation poll failed:\s*404/i.test(String(err?.message || err));
}

function startPoll(job, force = false) {
  if (!job?.jobId || (!force && activePolls.has(job.jobId))) return;
  activePolls.add(job.jobId);
  pollNativeGeneration(
    job.jobId,
    { job: { id: job.jobId, modelId: job.modelId, displayName: job.displayName } },
    {
      pollIntervalMs: job.pollIntervalMs,
      pollTimeoutMs: job.pollTimeoutMs,
    },
  )
    .then((result) => {
      if (!pending.has(job.jobId)) return;
      const entry = normalizeEntry(job.studio, {
        ...result,
        id: job.jobId,
        jobId: job.jobId,
        modelId: job.modelId,
        prompt: job.prompt || "",
        displayName: result.displayName || job.displayName,
        downloadName: result.downloadName || result.displayName || job.displayName,
        createdAt: job.createdAt,
        status: result.status || "completed",
      });
      pending.delete(job.jobId);
      if (entry) undelivered.set(job.jobId, { studio: job.studio, entry });
      persist();
      notify(job.studio);
    })
    .catch((err) => {
      if (!pending.has(job.jobId)) return;
      pending.delete(job.jobId);
      if (dropMissingJob(err)) {
        persist();
        return;
      }
      if (job.studio === "video") {
        undelivered.set(job.jobId, { studio: "video", entry: failedVideoEntry(job, err) });
        notify("video");
      }
      persist();
    })
    .finally(() => activePolls.delete(job.jobId));
}

export function track(job, meta = {}) {
  const jobId = job?.id || job?.request_id || job?.requestId;
  if (!jobId || pending.has(jobId) || undelivered.has(jobId)) return;
  const pendingJob = {
    jobId,
    studio: meta.studio,
    modelId: job.modelId || meta.modelId || meta.model?.id,
    prompt: meta.prompt || "",
    displayName: meta.displayName || undefined,
    createdAt: Date.now(),
    pollIntervalMs: job.pollIntervalMs,
    pollTimeoutMs: job.pollTimeoutMs,
  };
  if (!pendingJob.studio || !pendingJob.modelId) return;
  pending.set(jobId, pendingJob);
  persist();
  startPoll(pendingJob);
}

export function settle(jobId) {
  if (!jobId) return;
  pending.delete(jobId);
  undelivered.delete(jobId);
  persist();
}

export function subscribe(studio, cb) {
  if (!subscribers.has(studio)) subscribers.set(studio, new Set());
  subscribers.get(studio).add(cb);
  return () => subscribers.get(studio)?.delete(cb);
}

export function consume(studio) {
  const items = [];
  for (const [jobId, item] of [...undelivered.entries()]) {
    if (item?.studio !== studio) continue;
    items.push(item.entry);
    undelivered.delete(jobId);
  }
  if (items.length) persist();
  return items;
}

export function pendingFor(studio) {
  return [...pending.values()].filter((job) => job.studio === studio);
}

export function resumeAll() {
  for (const job of pending.values()) startPoll(job, true);
}

rehydrate();
resumeAll();

export const nativeGenerationRegistry = {
  track,
  settle,
  subscribe,
  consume,
  pendingFor,
  resumeAll,
};
