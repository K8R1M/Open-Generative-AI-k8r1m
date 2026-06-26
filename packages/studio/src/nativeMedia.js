import {
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_MODEL_IDS,
  nativeModelById,
  isNativeModelId,
  isSameOriginAssetUrl,
  assetUrl,
  NATIVE_VEO_REFERENCE_IMAGES_ENABLED,
} from './nativeModels.js';

const NATIVE_GENERATIONS_ENDPOINT = '/api/native-media/v1/generations';
const NATIVE_UPLOADS_ENDPOINT = '/api/native-media/v1/uploads';
const NATIVE_POLL_INTERVAL_MS = 2000;
const NATIVE_POLL_TIMEOUT_MS = 440000;

const PENDING_NATIVE_STATUSES = new Set(['created', 'queued', 'running']);
const TERMINAL_NATIVE_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted_process',
  'outcome_unknown',
  'asset_unavailable',
]);

const STRUCTURAL_PARAMETER_KEYS = [
  'aspectRatio',
  'aspect_ratio',
  'durationSeconds',
  'duration',
  'resolution',
  'audio',
  'imageSize',
  'image_size',
  'quality',
  'seed',
  'mode',
  'effect',
];

const ALLOWED_UPLOAD_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const ALLOWED_INPUT_ROLES = new Set([
  'first-frame',
  'last-frame',
  'reference',
  'input',
  'start-frame',
  'end-frame',
]);

function generateId(prefix) {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

function isBrowserFetchAvailable() {
  return typeof window !== 'undefined' && typeof window.fetch === 'function';
}

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') return {};
  const out = {};
  for (const key of STRUCTURAL_PARAMETER_KEYS) {
    if (parameters[key] !== undefined && parameters[key] !== null) {
      out[key] = parameters[key];
    }
  }
  return out;
}

function sanitizeInputs(inputs) {
  if (!Array.isArray(inputs)) return [];
  return inputs
    .map((i) => {
      if (!i || typeof i !== 'object') return null;
      const role = i.role && ALLOWED_INPUT_ROLES.has(i.role) ? i.role : i.role || 'input';
      const assetId = i.assetId || i.asset_id || i.id;
      if (!assetId && !role) return null;
      if (i.url || i.kind === 'url') {
        throw new Error('Native inputs must use uploaded native assets.');
      }
      if (typeof assetId !== 'string' || assetId.includes('://') || assetId.startsWith('//') || assetId.includes('/') || assetId.includes('..')) {
        throw new Error('Native inputs must use uploaded native assets.');
      }
      return {
        kind: i.kind || 'asset',
        assetId,
        role,
      };
    })
    .filter(Boolean);
}

function validateVeoConstraints(modelId, parameters, inputs) {
  const model = nativeModelById(modelId);
  if (!model || model.kind !== 'video') return;
  const dur = parameters?.durationSeconds ?? parameters?.duration;
  if (dur !== undefined && dur !== null) {
    const n = Number(dur);
    if (!model.durationsSeconds.includes(n)) {
      throw new Error(
        `Unsupported Veo duration: ${dur}. Allowed durations: ${model.durationsSeconds.join(', ')} seconds.`
      );
    }
  }
  if (Array.isArray(inputs)) {
    const refs = inputs.filter((i) => i && i.role === 'reference');
    if (refs.length > 0 && !NATIVE_VEO_REFERENCE_IMAGES_ENABLED) {
      throw new Error('Veo reference images are disabled for this native capability set.');
    }
    if (refs.length > model.maxReferenceImages) {
      throw new Error(
        `Veo reference images exceed maximum of ${model.maxReferenceImages} (got ${refs.length}).`
      );
    }
    if (refs.length > 0 && Number(dur) !== model.referenceDurationSeconds) {
      throw new Error(
        `Veo reference images require durationSeconds=${model.referenceDurationSeconds} (got ${dur}).`
      );
    }
  }
}

export function buildNativeRequest(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('buildNativeRequest requires an options object');
  }
  const modelId = opts.modelId;
  if (!modelId || !isNativeModelId(modelId)) {
    throw new Error(`Unknown native model id: ${modelId || '(missing)'}`);
  }
  const task = opts.task;
  const prompt = opts.prompt === undefined ? '' : String(opts.prompt);
  const parameters = sanitizeParameters(opts.parameters);
  const inputs = sanitizeInputs(opts.inputs);
  validateVeoConstraints(modelId, parameters, inputs);
  return {
    modelId,
    task,
    prompt,
    parameters,
    inputs,
    clientRequestId: opts.clientRequestId || generateId('req'),
  };
}

export const buildNativeGenerationRequest = buildNativeRequest;

export function buildNativeHeaders(_opts = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export const nativeRequestHeaders = buildNativeHeaders;

export function normalizeNativeResult(raw = {}, ctx = {}) {
  const job = ctx && ctx.job ? ctx.job : {};
  const rawStatus = String(raw.status || '').toLowerCase();
  const completed =
    rawStatus === 'completed' ||
    rawStatus === 'succeeded' ||
    rawStatus === 'success';

  const base = {
    native: true,
    model: raw.model || job.modelId,
    request_id: raw.request_id || raw.requestId || raw.id || job.id,
  };

  if (!completed) {
    return {
      ...base,
      status: rawStatus || 'failed',
      error: raw.error || raw.message || undefined,
      message: raw.message || undefined,
      url: undefined,
      outputs: [],
    };
  }

  const candidateOutputs = Array.isArray(raw.outputs)
    ? raw.outputs.filter((u) => typeof u === 'string' && isSameOriginAssetUrl(u))
    : [];

  if (raw.url && isSameOriginAssetUrl(raw.url)) {
    return {
      ...base,
      status: 'completed',
      url: raw.url,
      outputs: candidateOutputs.length > 0 ? candidateOutputs : [raw.url],
    };
  }

  if (candidateOutputs.length > 0) {
    return {
      ...base,
      status: 'completed',
      url: candidateOutputs[0],
      outputs: candidateOutputs,
    };
  }

  const assetId = raw.assetId || raw.asset_id || job.assetId || job.asset_id;
  if (assetId) {
    const url = assetUrl(assetId);
    return {
      ...base,
      status: 'completed',
      url,
      outputs: [url],
    };
  }

  return {
    ...base,
    status: 'completed',
    url: undefined,
    outputs: [],
  };
}

export const normalizeResult = normalizeNativeResult;

export async function uploadNativeFile(file, _opts = {}) {
  if (!file) throw new Error('uploadNativeFile requires a file');
  const mime = String(file.mime || file.type || '').toLowerCase();
  if (!mime || !ALLOWED_UPLOAD_MIME.has(mime)) {
    throw new Error(`Unsupported MIME type for native upload: ${mime || 'unknown'}`);
  }

  const assetId = generateId('asset');
  const url = assetUrl(assetId);

  if (isBrowserFetchAvailable()) {
    const body = new FormData();
    let blob;
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      blob = file;
    } else if (file.bytes) {
      blob = new Blob([file.bytes], { type: mime });
    } else if (file.arrayBuffer) {
      blob = new Blob([await file.arrayBuffer()], { type: mime });
    } else {
      blob = new Blob([file], { type: mime });
    }
    body.append('file', blob, file.name || 'upload');
    body.append('assetId', assetId);
    const res = await fetch(NATIVE_UPLOADS_ENDPOINT, { method: 'POST', body });
    if (!res.ok) {
      throw new Error(`Native upload failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json().catch(() => ({}));
    return {
      url: (data.url && isSameOriginAssetUrl(data.url) ? data.url : url),
      assetId: data.assetId || data.id || assetId,
    };
  }

  return { url, assetId };
}

export const uploadToNative = uploadNativeFile;

async function fetchNativeJob(jobId) {
  const res = await fetch(`${NATIVE_GENERATIONS_ENDPOINT}/${encodeURIComponent(jobId)}`, {
    headers: buildNativeHeaders(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Native generation poll failed: ${res.status} ${res.statusText} ${detail.slice(0, 120)}`);
  }
  return res.json().catch(() => ({}));
}

function terminalNativeError(result, status) {
  const reason = result.message || result.error || status || 'unknown';
  return new Error(`Native generation ended with ${status}: ${reason}`);
}

function assertCompletedNativeResult(result) {
  if (result.status === 'completed' && result.url && isSameOriginAssetUrl(result.url)) {
    return result;
  }
  throw new Error('Native generation ended with ASSET_UNAVAILABLE: completed job returned no same-origin asset URL');
}

async function pollNativeGeneration(jobId, ctx, opts = {}) {
  const intervalMs = Number.isFinite(Number(opts.pollIntervalMs))
    ? Math.max(0, Number(opts.pollIntervalMs))
    : NATIVE_POLL_INTERVAL_MS;
  const timeoutMs = Number.isFinite(Number(opts.pollTimeoutMs))
    ? Math.max(0, Number(opts.pollTimeoutMs))
    : NATIVE_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    if (intervalMs > 0) await sleep(Math.min(intervalMs, remainingMs));
    if (Date.now() >= deadline) break;
    const data = await fetchNativeJob(jobId);
    const result = normalizeNativeResult(data, ctx);
    const status = normalizeStatus(result.status);
    if (status === 'completed') return assertCompletedNativeResult(result);
    if (TERMINAL_NATIVE_STATUSES.has(status)) throw terminalNativeError(result, status);
    if (!PENDING_NATIVE_STATUSES.has(status)) throw terminalNativeError(result, status || 'unknown');
  }

  throw new Error(`Native generation timed out after ${timeoutMs}ms`);
}

export async function generateNativeMedia(opts = {}) {
  const req = buildNativeRequest(opts);

  if (isBrowserFetchAvailable()) {
    const res = await fetch(NATIVE_GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: buildNativeHeaders(),
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Native generation failed: ${res.status} ${res.statusText} ${detail.slice(0, 120)}`);
    }
    const data = await res.json().catch(() => ({}));
    const job = { id: data.request_id || data.id || req.clientRequestId, modelId: req.modelId };
    const result = normalizeNativeResult(data, { job });
    const status = normalizeStatus(result.status);
    if (PENDING_NATIVE_STATUSES.has(status)) {
      const jobId = data.id || data.request_id || data.requestId || result.request_id;
      if (!jobId) throw new Error('Native generation is pending but returned no job id to poll');
      return pollNativeGeneration(jobId, { job }, opts);
    }
    if (status === 'completed') return assertCompletedNativeResult(result);
    if (TERMINAL_NATIVE_STATUSES.has(status)) throw terminalNativeError(result, status);
    return result;
  }

  const fakeJob = { id: req.clientRequestId, modelId: req.modelId };
  return normalizeNativeResult(
    { status: 'completed', assetId: generateId('asset') },
    { job: fakeJob }
  );
}

export const generate = generateNativeMedia;

export {
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_MODEL_IDS,
  isNativeModelId,
  isSameOriginAssetUrl,
  assetUrl,
};
