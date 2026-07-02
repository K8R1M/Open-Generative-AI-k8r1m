"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Download, Pencil, Trash2 } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import LazyVideo from "./LazyVideo.jsx";
import { generateVideo, generateI2V, processV2V, uploadFile } from "../muapi.js";
import {
  t2vModels,
  i2vModels,
  v2vModels,
  getAspectRatiosForVideoModel,
  getDurationsForModel,
  getResolutionsForVideoModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getResolutionsForI2VModel,
  getEffectsForI2VModel,
  getDefaultEffectForI2VModel,
  getModesForModel,
  getMaxImagesForI2VModel,
} from "../models.js";
import {
  NATIVE_MODELS,
  NATIVE_ASSET_URL_PREFIX,
  NATIVE_VEO_REFERENCE_IMAGES_ENABLED,
  isNativeModelId,
  nativeModelById,
} from "../nativeModels.js";
import {
  copyPromptToClipboard,
  deleteNativeLibraryItem,
  downloadNativeLibraryLastFrame,
  generateNativeMedia,
  isSameOriginAssetUrl,
  listNativeLibrary,
  renameNativeLibraryItem,
  uploadNativeFile,
} from "../nativeMedia.js";
import { nativeGenerationRegistry } from "../generationRegistry.js";
import {
  historyKeys,
  nativeVideoCardResolution,
  normalizeVideoServerHistoryEntry as normalizeServerHistoryEntry,
  sameHistoryEntry,
} from "../studioHistory.js";

// ── tiny helpers ──────────────────────────────────────────────────────────────

const NATIVE_GROK_IMAGINE_VIDEO_ID = "native.grok.imagine-video";
const GENERATED_IMAGE_TO_VIDEO_STUDIO_KEY = "nativeGeneratedImageReference:video";

function nativeVideoModelToDescriptor(m) {
  const aspectRatios = m.supportsAspectRatio === false ? [] : (m.aspectRatios || ["16:9"]);
  const durations = m.durationsSeconds || [8];
  const resolutions = m.resolutions || ["720p"];
  const inputs = {
    prompt: { name: "prompt", type: "string" },
    duration: { enum: durations, default: durations[0] || 8 },
    resolution: { enum: resolutions, default: resolutions[0] || "720p" },
  };
  if (aspectRatios.length > 0) {
    inputs.aspect_ratio = { enum: aspectRatios, default: aspectRatios[0] || "16:9" };
  }
  const descriptor = {
    id: m.id,
    name: m.label,
    endpoint: m.id,
    native: true,
    imageField: "images_list",
    maxImages: 1 + (m.maxReferenceImages || 0),
    inputs,
  };
  if (m.supportsLastFrame !== false) descriptor.lastImageField = "last_image";
  return descriptor;
}

const NATIVE_T2V_DESCRIPTORS = NATIVE_MODELS.filter(
  (m) => m.kind === "video" && m.tasks?.includes("text-to-video"),
).map(nativeVideoModelToDescriptor);

const NATIVE_I2V_DESCRIPTORS = NATIVE_MODELS.filter(
  (m) => m.kind === "video" && m.tasks?.includes("image-to-video"),
).map(nativeVideoModelToDescriptor);

const mergedT2VModels = [...t2vModels, ...NATIVE_T2V_DESCRIPTORS];
const mergedI2VModels = [...i2vModels, ...NATIVE_I2V_DESCRIPTORS];
const nativeGrokI2VDescriptor = NATIVE_I2V_DESCRIPTORS.find((m) => m.id === NATIVE_GROK_IMAGINE_VIDEO_ID);
const t2vPickerModels = nativeGrokI2VDescriptor
  ? [...mergedT2VModels, nativeGrokI2VDescriptor]
  : mergedT2VModels;

function getAspectRatiosForT2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    const m = nativeModelById(modelId);
    return m?.supportsAspectRatio === false ? [] : (m?.aspectRatios || ["16:9"]);
  }
  return getAspectRatiosForVideoModel(modelId);
}

function getDurationsForT2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    return nativeModelById(modelId)?.durationsSeconds || [8];
  }
  return getDurationsForModel(modelId);
}

function getResolutionsForT2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    return nativeModelById(modelId)?.resolutions || ["720p"];
  }
  return getResolutionsForVideoModel(modelId);
}

function getAspectRatiosForI2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    const m = nativeModelById(modelId);
    return m?.supportsAspectRatio === false ? [] : (m?.aspectRatios || ["16:9"]);
  }
  return getAspectRatiosForI2VModel(modelId);
}

function getDurationsForI2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    return nativeModelById(modelId)?.durationsSeconds || [8];
  }
  return getDurationsForI2VModel(modelId);
}

function getResolutionsForI2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    return nativeModelById(modelId)?.resolutions || ["720p"];
  }
  return getResolutionsForI2VModel(modelId);
}

function getMaxImagesForI2VNative(modelId) {
  if (isNativeModelId(modelId)) {
    const m = nativeModelById(modelId);
    return 1 + (m?.maxReferenceImages || 0);
  }
  return getMaxImagesForI2VModel(modelId);
}

function modelSupportsImageToVideo(model) {
  return model?.kind === "video" && model.tasks?.includes("image-to-video");
}

function nativeVideoReferencesEnabled(model) {
  return model?.id === NATIVE_GROK_IMAGINE_VIDEO_ID || Number(model?.maxReferenceImages || 0) > 0;
}

function isNativeI2VOnlyModel(model) {
  return model?.kind === "video" && model.tasks?.includes("image-to-video") && !model.tasks?.includes("text-to-video");
}

function shouldUseNativeImageUpload(modelId) {
  const model = nativeModelById(modelId);
  return (
    model?.id === NATIVE_GROK_IMAGINE_VIDEO_ID ||
    (model?.kind === "video" && model.tasks?.includes("image-to-video"))
  );
}

function shouldUseNativeVideoUpload(modelId) {
  const model = nativeModelById(modelId);
  return model?.kind === "video" && model.provider === "omni" && Number(model.omniMaxVideos || 0) > 0;
}

function isVeoReferenceModel(model) {
  return model?.provider === "vertex" && model.referenceImagesEnabled && NATIVE_VEO_REFERENCE_IMAGES_ENABLED;
}

function getMaxImagesForVideoInputMode(modelId, mode = "frames") {
  const model = nativeModelById(modelId);
  if (isVeoReferenceModel(model)) return mode === "references" ? 3 : 1;
  return getMaxImagesForI2VNative(modelId);
}

function baseDisplayName(name) {
  return (name || "").trim().slice(0, 110);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initialNextDisplayName(base, history) {
  const pattern = new RegExp(`^${escapeRegExp(base)}(?:-(\\d{3}))?$`);
  let max = 0;
  for (const entry of Array.isArray(history) ? history : []) {
    const match = typeof entry?.displayName === "string" ? entry.displayName.match(pattern) : null;
    if (match) max = Math.max(max, match[1] ? Number(match[1]) : 0);
  }
  return Math.max(1, max + 1);
}

function nextDisplayNameForSubmit(rawName, nameSequence, history) {
  const base = baseDisplayName(rawName);
  if (!base) return { displayName: undefined, nextSequence: nameSequence };
  if (nameSequence?.base !== base) {
    return { displayName: base, nextSequence: { base, next: initialNextDisplayName(base, history) } };
  }
  return {
    displayName: `${base}-${String(Math.max(1, nameSequence.next || 1)).padStart(3, "0")}`,
    nextSequence: { base, next: Math.max(1, nameSequence.next || 1) + 1 },
  };
}

export function planReferenceHandoff({ urls, currentModelId, capabilitiesLookup = nativeModelById } = {}) {
  const cleanUrls = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(isSameOriginAssetUrl)));
  const warnings = [];
  if (cleanUrls.length === 0) return { warnings: ["no-usable-urls"] };

  const model = capabilitiesLookup(currentModelId);
  const capacity = getMaxImagesForVideoInputMode(currentModelId, "frames");
  const kept = Math.max(1, capacity);
  if (cleanUrls.length > kept) warnings.push(`kept:${kept}-of-${cleanUrls.length}`);

  return {
    modelId: currentModelId,
    modelName: model?.label || model?.name || currentModelId,
    imageMode: true,
    urls: cleanUrls.slice(0, kept),
    warnings,
  };
}

async function uploadVideoStudioImage(modelId, apiKey, file, onProgress) {
  if (shouldUseNativeImageUpload(modelId)) {
    return (await uploadNativeFile(file)).url;
  }
  return uploadFile(apiKey, file, onProgress);
}

function nativeVideoParams(model, selectedAr, selectedDuration, selectedResolution, selectedAudio) {
  const parameters = {
    aspectRatio: selectedAr,
    durationSeconds: Number(selectedDuration),
    resolution: selectedResolution,
    audio: selectedAudio,
  };
  if (model?.supportsAspectRatio === false) delete parameters.aspectRatio;
  if (model?.supportsAudioToggle === false) delete parameters.audio;
  if (Array.isArray(model?.resolutions) && model.resolutions.length === 0) delete parameters.resolution;
  return parameters;
}

function nativeInputFromUrl(url, role) {
  if (typeof url !== "string" || !url) return null;
  if (!url.startsWith(NATIVE_ASSET_URL_PREFIX)) {
    throw new Error("Native video inputs must be uploaded through native assets.");
  }
  const assetId = url.slice(NATIVE_ASSET_URL_PREFIX.length).split(/[?#]/)[0];
  return { kind: "asset", assetId, role };
}

function getQualitiesForModel(modelList, modelId) {
  const model = modelList.find((m) => m.id === modelId);
  return model?.inputs?.quality?.enum || [];
}

function videoDownloadName(entry, idx) {
  return `${entry?.displayName || entry?.downloadName || `video-${entry?.id || idx}`}.mp4`;
}

async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

function nativeVideoJobId(entry) {
  return entry?.jobId || entry?.request_id || (entry?.serverBacked ? entry?.id : null);
}

function canDownloadNativeLastFrame(entry) {
  return Boolean(entry?.native && entry?.serverBacked && nativeVideoJobId(entry) && (entry.status || "completed") === "completed");
}

function isFailedHistoryEntry(entry) {
  return String(entry?.status || "").toLowerCase() === "failed";
}

function mergeServerHistory(local, server) {
  const seen = new Set();
  const serverKeys = new Set();
  const out = [];
  for (const entry of server.map(normalizeServerHistoryEntry).filter(Boolean)) {
    historyKeys(entry).forEach((key) => seen.add(key));
    historyKeys(entry).forEach((key) => serverKeys.add(key));
    out.push(entry);
  }
  for (const entry of local || []) {
    if (entry?.serverBacked && entry?.native && !historyKeys(entry).some((key) => serverKeys.has(key))) continue;
    if (historyKeys(entry).some((key) => seen.has(key))) continue;
    historyKeys(entry).forEach((key) => seen.add(key));
    out.push(entry);
  }
  return out.slice(0, 50);
}

// ── SVG icons (kept inline to avoid extra deps) ───────────────────────────────

const CheckSvg = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#22d3ee"
    strokeWidth="4"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const VideoIconSvg = ({ className }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const VideoReadySvg = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="text-primary"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    <polyline points="7 10 10 13 15 8" stroke="#22d3ee" strokeWidth="2.5" />
  </svg>
);

// ── Dropdown components ───────────────────────────────────────────────────────

function DropdownItem({ label, selected, onClick }) {
  return (
    <div
      className="flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group"
      onClick={onClick}
    >
      <span className="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">
        {label}
      </span>
      {selected && <CheckSvg />}
    </div>
  );
}

function ModelDropdown({ imageMode, selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  const generationModels = imageMode ? mergedI2VModels : t2vPickerModels;

  const lf = search.toLowerCase();
  const filteredMain = generationModels.filter(
    (m) => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf),
  );
  const filteredV2V = v2vModels.filter(
    (m) => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf),
  );

  const getIconColor = (m, isV2V) => {
    if (isV2V) return "bg-orange-500/10 text-orange-400";
    if (m.id.includes("kling")) return "bg-blue-500/10 text-blue-400";
    if (m.id.includes("veo")) return "bg-purple-500/10 text-purple-400";
    if (m.id.includes("sora")) return "bg-rose-500/10 text-rose-400";
    return "bg-primary/10 text-primary";
  };

  const renderItem = (m, isV2V = false) => (
    <div
      key={m.id}
      className={`flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? "bg-white/5 border-white/5" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(m, isV2V);
        onClose();
      }}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`w-10 h-10 ${getIconColor(m, isV2V)} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase`}
        >
          {m.name.charAt(0)}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-white tracking-tight">
            {m.name}
          </span>
          {isV2V && (
            <span className="text-[9px] text-orange-400/70">
              {m.imageField ? "Upload a video and image" : "Upload a video to use"}
            </span>
          )}
        </div>
      </div>
      {selectedModel === m.id && <CheckSvg />}
    </div>
  );

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      <div className="px-2 pb-3 mb-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 outline-none"
          />
        </div>
      </div>
      <div className="text-xs font-bold text-secondary px-3 py-2 shrink-0">
        Video models
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2">
        {filteredMain.map((m) => renderItem(m, false))}
        {filteredV2V.length > 0 && (
          <>
            <div className="text-xs font-bold text-orange-400/70 px-3 py-2 mt-1 border-t border-white/5">
              Video Tools
            </div>
            {filteredV2V.map((m) => renderItem(m, true))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

function ControlBtn({ icon, label, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className="flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap"
    >
      {icon}
      <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
        {label}
      </span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-20 group-hover:opacity-100 transition-opacity"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

// ── Dropdown panel ─────────────────────────────────────────────────────────────
// Rendered inside a `relative` wrapper div; floats above the anchor button.

// ── Main component ────────────────────────────────────────────────────────────

export default function VideoStudio({
  apiKey,
  onGenerationComplete,
  historyItems,
  droppedFiles,
  onFilesHandled,
  referenceHandoffNonce,
}) {
  const PERSIST_KEY = "hg_video_studio_persistent";

  // ── mode state ──
  const [imageMode, setImageMode] = useState(false); // i2v
  const [v2vMode, setV2vMode] = useState(false);

  // ── model / params ──
  const defaultModel = t2vModels[0];
  const [selectedModel, setSelectedModel] = useState(defaultModel.id);
  const [selectedModelName, setSelectedModelName] = useState(defaultModel.name);
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || "16:9",
  );
  const [selectedDuration, setSelectedDuration] = useState(
    defaultModel.inputs?.duration?.default || 5,
  );
  const [selectedResolution, setSelectedResolution] = useState(
    defaultModel.inputs?.resolution?.default || "",
  );
  const [selectedQuality, setSelectedQuality] = useState(
    defaultModel.inputs?.quality?.default || "",
  );
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedEffect, setSelectedEffect] = useState("");
  const [selectedAudio, setSelectedAudio] = useState(true);

  // ── upload progress ──
  const [imageProgress, setImageProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  // ── control visibility ──
  const [showAr, setShowAr] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [showResolution, setShowResolution] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showEffect, setShowEffect] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  // ── uploads ──
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedEndImageUrl, setUploadedEndImageUrl] = useState(null);
  const [endImageUploading, setEndImageUploading] = useState(false);
  const [endImageProgress, setEndImageProgress] = useState(0);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadedVideoName, setUploadedVideoName] = useState(null);
  const [videoUploadError, setVideoUploadError] = useState("");
  const [veoInputMode, setVeoInputMode] = useState("frames");
  const [refTrimNotice, setRefTrimNotice] = useState("");

  // ── generation / canvas ──
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [canvasModel, setCanvasModel] = useState(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [lastGenerationId, setLastGenerationId] = useState(null);
  const [lastGenerationModel, setLastGenerationModel] = useState(null);

  // ── history ──
  const [localHistory, setLocalHistory] = useState([]);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [lastFrameStatus, setLastFrameStatus] = useState("");

  // ── dropdown ──
  const [openDropdown, setOpenDropdown] = useState(null); // 'model'|'ar'|'duration'|'resolution'|'quality'|'mode'|null

  // ── prompt ──
  const [prompt, setPrompt] = useState("");
  const [generationName, setGenerationName] = useState("");
  const [nameSequence, setNameSequence] = useState({ base: "", next: 1 });
  const [promptDisabled, setPromptDisabled] = useState(false);

  // ── refs ──
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const endImageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const resultVideoRef = useRef(null);
  const hasRestored = useRef(false);
  const selectedModelRef = useRef(defaultModel.id);
  const registryHydratedRef = useRef(false);
  const mountedRef = useRef(false);

  // ── derived data ──
  const history = historyItems ?? localHistory;
  const uploadedImageUrl = uploadedImageUrls[0] ?? null;
  const currentNativeModel = nativeModelById(selectedModel);
  const veoReferencesMode = imageMode && isVeoReferenceModel(currentNativeModel) && veoInputMode === "references";

  useEffect(() => {
    if (!veoReferencesMode) return;
    setSelectedDuration(8);
    setSelectedAr("16:9");
    setUploadedEndImageUrl(null);
    if (uploadedImageUrls.length > 3) {
      setRefTrimNotice(`Kept 3 of ${uploadedImageUrls.length} reference images — ${selectedModelName} accepts 3`);
      setUploadedImageUrls(uploadedImageUrls.slice(0, 3));
    }
  }, [selectedModelName, uploadedImageUrls, veoReferencesMode]);

  const getCurrentModels = useCallback(() => {
    if (v2vMode) return v2vModels;
    return imageMode ? mergedI2VModels : mergedT2VModels;
  }, [imageMode, v2vMode]);

  const getCurrentAspectRatios = useCallback(
    (id) =>
      imageMode
        ? getAspectRatiosForI2VNative(id)
        : getAspectRatiosForT2VNative(id),
    [imageMode],
  );

  const getCurrentDurations = useCallback(
    (id) =>
      imageMode ? getDurationsForI2VNative(id) : getDurationsForT2VNative(id),
    [imageMode],
  );

  const getCurrentResolutions = useCallback(
    (id) =>
      imageMode
        ? getResolutionsForI2VNative(id)
        : getResolutionsForT2VNative(id),
    [imageMode],
  );

  const getCurrentModel = useCallback(
    () => getCurrentModels().find((m) => m.id === selectedModel),
    [getCurrentModels, selectedModel],
  );

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const isMotionControlSelection = useCallback(
    (modelId, isV2v) => {
      if (!isV2v) return false;
      const m = v2vModels.find((x) => x.id === modelId);
      return !!m?.imageField;
    },
    [],
  );

  // ── update controls when model/mode changes ──────────────────────────────
  const applyControlsForModel = useCallback(
    (modelId, isImageMode, isV2vMode) => {
      if (isV2vMode) {
        setShowAr(false);
        setShowDuration(false);
        setShowResolution(false);
        setShowQuality(false);
        setShowMode(false);
        setShowEffect(false);
        setShowAudio(false);
        return;
      }

      const modelList = isImageMode ? mergedI2VModels : mergedT2VModels;
      const model = modelList.find((m) => m.id === modelId);

      const ars = isImageMode
        ? getAspectRatiosForI2VNative(modelId)
        : getAspectRatiosForT2VNative(modelId);
      if (ars.length > 0) {
        setSelectedAr(ars[0]);
        setShowAr(true);
      } else {
        setShowAr(false);
      }

      const durations = isImageMode
        ? getDurationsForI2VNative(modelId)
        : getDurationsForT2VNative(modelId);
      if (durations.length > 0) {
        setSelectedDuration(durations[0]);
        setShowDuration(true);
      } else {
        setShowDuration(false);
      }

      const resolutions = isImageMode
        ? getResolutionsForI2VNative(modelId)
        : getResolutionsForT2VNative(modelId);
      if (resolutions.length > 0) {
        setSelectedResolution(resolutions[0]);
        setShowResolution(true);
      } else {
        setSelectedResolution("");
        setShowResolution(false);
      }

      const qualities = getQualitiesForModel(modelList, modelId);
      if (qualities.length > 0) {
        setSelectedQuality(model?.inputs?.quality?.default || qualities[0]);
        setShowQuality(true);
      } else {
        setSelectedQuality("");
        setShowQuality(false);
      }

      const modes = getModesForModel(modelId);
      if (modes.length > 0) {
        setSelectedMode(model?.inputs?.mode?.default || modes[0]);
        setShowMode(true);
      } else {
        setSelectedMode("");
        setShowMode(false);
      }

      const effects = isImageMode ? getEffectsForI2VModel(modelId) : [];
      if (effects.length > 0) {
        setSelectedEffect(getDefaultEffectForI2VModel(modelId) || effects[0]);
        setShowEffect(true);
      } else {
        setSelectedEffect("");
        setShowEffect(false);
      }

      setSelectedAudio(true);
      setShowAudio(isNativeModelId(modelId) && nativeModelById(modelId)?.supportsAudioToggle !== false);
    },
    [],
  );

  const consumeGeneratedImageHandoff = useCallback(() => {
    const raw = sessionStorage.getItem(GENERATED_IMAGE_TO_VIDEO_STUDIO_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GENERATED_IMAGE_TO_VIDEO_STUDIO_KEY);
    try {
      const payload = JSON.parse(raw);
      if (payload?.source !== "generated-image") return { warnings: ["invalid-source"] };
      return { urls: payload.urls, handoffId: payload.handoffId || null };
    } catch (error) {
      return { error };
    }
  }, []);

  const reportHandoffFailure = useCallback((detail) => {
    console.error("Failed to consume VideoStudio generated image handoff:", detail);
    toast.error("Could not use that image in Video Studio.");
  }, []);

  // Pure: computes the merged URL list plus how many of the combined total
  // (incoming handoff + whatever was already uploaded) survive the current
  // model's capacity, so callers can warn on drops from EITHER source.
  const mergeHandoffUrls = useCallback((handoffUrls, existingUrls, modelId) => {
    const maxImages = Math.max(1, getMaxImagesForVideoInputMode(modelId, "frames"));
    const merged = [
      ...handoffUrls,
      ...(Array.isArray(existingUrls) ? existingUrls : []).filter((url) => !handoffUrls.includes(url)),
    ];
    return { urls: merged.slice(0, maxImages), kept: Math.min(merged.length, maxImages), total: merged.length };
  }, []);

  const applyReferenceHandoffPlan = useCallback(
    (plan) => {
      if (!plan?.modelId || !Array.isArray(plan.urls) || plan.urls.length === 0) {
        reportHandoffFailure(plan?.warnings || "no usable handoff urls");
        return;
      }
      const merge = mergeHandoffUrls(plan.urls, uploadedImageUrls, plan.modelId);
      setSelectedModel(plan.modelId);
      setSelectedModelName(plan.modelName);
      setImageMode(true);
      setV2vMode(false);
      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setPromptDisabled(false);
      setRefTrimNotice(
        merge.total > merge.kept
          ? `Kept ${merge.kept} of ${merge.total} reference images — ${plan.modelName} accepts ${merge.kept}`
          : "",
      );
      setUploadedImageUrls(merge.urls);
      applyControlsForModel(plan.modelId, true, false);
    },
    [applyControlsForModel, mergeHandoffUrls, reportHandoffFailure, uploadedImageUrls],
  );

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (hasRestored.current) {
      return () => {
        mountedRef.current = false;
      };
    }
    try {
      const restored = {
        imageMode: false,
        v2vMode: false,
        selectedModel: defaultModel.id,
        selectedModelName: defaultModel.name,
        selectedAr: defaultModel.inputs?.aspect_ratio?.default || "16:9",
        selectedDuration: defaultModel.inputs?.duration?.default || 5,
        selectedResolution: defaultModel.inputs?.resolution?.default || "",
        selectedQuality: defaultModel.inputs?.quality?.default || "",
        selectedMode: "",
        selectedEffect: "",
        selectedAudio: true,
        uploadedImageUrls: [],
        uploadedVideoUrl: null,
        uploadedVideoName: null,
        prompt: "",
        localHistory: [],
        generationName: "",
        nameSequence: { base: "", next: 1 },
        veoInputMode: "frames",
        refTrimNotice: "",
      };
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        restored.imageMode = data.imageMode !== undefined ? !!data.imageMode : restored.imageMode;
        restored.v2vMode = data.v2vMode !== undefined ? !!data.v2vMode : restored.v2vMode;
        restored.selectedModel = data.selectedModel || restored.selectedModel;
        restored.selectedModelName = data.selectedModelName || restored.selectedModelName;
        restored.selectedAr = data.selectedAr || restored.selectedAr;
        restored.selectedDuration = data.selectedDuration || restored.selectedDuration;
        restored.selectedResolution = data.selectedResolution || restored.selectedResolution;
        restored.selectedQuality = data.selectedQuality || restored.selectedQuality;
        restored.selectedMode = data.selectedMode || restored.selectedMode;
        restored.selectedEffect = data.selectedEffect || restored.selectedEffect;
        restored.uploadedImageUrls = Array.isArray(data.uploadedImageUrls)
          ? data.uploadedImageUrls
          : data.uploadedImageUrl
            ? [data.uploadedImageUrl]
            : [];
        restored.uploadedVideoUrl = data.uploadedVideoUrl || null;
        restored.uploadedVideoName = data.uploadedVideoName || null;
        restored.prompt = data.prompt || "";
        restored.localHistory = Array.isArray(data.localHistory) ? data.localHistory : [];
        restored.generationName = data.generationName || "";
        restored.nameSequence = data.nameSequence || restored.nameSequence;
        restored.veoInputMode = data.veoInputMode === "references" ? "references" : "frames";
        restored.refTrimNotice = typeof data.refTrimNotice === "string" ? data.refTrimNotice : "";
        restored.selectedAudio = data.selectedAudio !== undefined ? !!data.selectedAudio : restored.selectedAudio;
      }

      const handoff = consumeGeneratedImageHandoff();
      let handoffApplied = false;
      if (handoff?.error) {
        reportHandoffFailure(handoff.error);
      } else if (handoff?.urls || handoff?.warnings) {
        const plan = planReferenceHandoff({ urls: handoff.urls, currentModelId: restored.selectedModel });
        if (plan.modelId) {
          const merge = mergeHandoffUrls(plan.urls, restored.uploadedImageUrls, plan.modelId);
          restored.selectedModel = plan.modelId;
          restored.selectedModelName = plan.modelName;
          restored.imageMode = true;
          restored.v2vMode = false;
          restored.uploadedVideoUrl = null;
          restored.uploadedVideoName = null;
          restored.uploadedImageUrls = merge.urls;
          restored.refTrimNotice =
            merge.total > merge.kept
              ? `Kept ${merge.kept} of ${merge.total} reference images — ${plan.modelName} accepts ${merge.kept}`
              : "";
          handoffApplied = true;
        } else {
          reportHandoffFailure(plan.warnings);
        }
      }

      if (handoffApplied) {
        localStorage.setItem(PERSIST_KEY, JSON.stringify({
          ...restored,
          uploadedImageUrl: restored.uploadedImageUrls[0] ?? null,
        }));
      }

      setImageMode(restored.imageMode);
      setV2vMode(restored.v2vMode);
      setSelectedModel(restored.selectedModel);
      selectedModelRef.current = restored.selectedModel;
      setSelectedModelName(restored.selectedModelName);
      setSelectedAr(restored.selectedAr);
      setSelectedDuration(restored.selectedDuration);
      setSelectedResolution(restored.selectedResolution);
      setSelectedQuality(restored.selectedQuality);
      setSelectedMode(restored.selectedMode);
      setSelectedEffect(restored.selectedEffect);
      setUploadedImageUrls(restored.uploadedImageUrls);
      setUploadedVideoUrl(restored.uploadedVideoUrl);
      setUploadedVideoName(restored.uploadedVideoName);
      setPrompt(restored.prompt);
      setGenerationName(restored.generationName || "");
      setNameSequence(restored.nameSequence || { base: "", next: 1 });
      setVeoInputMode(restored.veoInputMode || "frames");
      setRefTrimNotice(restored.refTrimNotice || "");
      setLocalHistory(restored.localHistory);
      applyControlsForModel(restored.selectedModel, restored.imageMode, restored.v2vMode);
      setSelectedAudio(restored.selectedAudio);
      listNativeLibrary({ kind: "video", limit: 50 })
        .then((items) => {
          nativeGenerationRegistry.resumeAll();
          setLocalHistory((prev) => {
            const merged = mergeServerHistory(prev.length ? prev : restored.localHistory, items);
            const missed = nativeGenerationRegistry.consume("video");
            return [...missed, ...merged.filter((item) => !missed.some((entry) => sameHistoryEntry(item, entry)))].slice(0, 50);
          });
        })
        .catch((err) => console.warn("Failed to hydrate VideoStudio library:", err))
        .finally(() => {
          registryHydratedRef.current = true;
          const missed = nativeGenerationRegistry.consume("video");
          if (missed.length) {
            setLocalHistory((prev) => [...missed, ...prev.filter((item) => !missed.some((entry) => sameHistoryEntry(item, entry)))].slice(0, 50));
          }
        });
    } catch (err) {
      console.warn("Failed to load VideoStudio persistence:", err);
    } finally {
      hasRestored.current = true;
    }
    return () => {
      mountedRef.current = false;
    };
  }, [applyControlsForModel, consumeGeneratedImageHandoff, defaultModel.id, defaultModel.inputs?.aspect_ratio?.default, defaultModel.inputs?.duration?.default, defaultModel.inputs?.quality?.default, defaultModel.inputs?.resolution?.default, defaultModel.name, mergeHandoffUrls, reportHandoffFailure]);

  // ── Adjust height on load ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        const el = textareaRef.current;
        el.style.height = "auto";
        const maxH = window.innerWidth < 768 ? 150 : 250;
        el.style.height = Math.min(el.scrollHeight, maxH) + "px";
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          v2vMode,
          selectedModel,
          selectedModelName,
          selectedAr,
          selectedDuration,
          selectedResolution,
          selectedQuality,
          selectedMode,
          selectedEffect,
          selectedAudio,
          uploadedImageUrl,
          uploadedImageUrls,
          uploadedVideoUrl,
          uploadedVideoName,
          prompt,
          generationName,
          nameSequence,
          veoInputMode,
          refTrimNotice,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save VideoStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    v2vMode,
    selectedModel,
    selectedModelName,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    selectedAudio,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    uploadedVideoName,
    prompt,
    generationName,
    nameSequence,
    veoInputMode,
    refTrimNotice,
    localHistory,
  ]);

  // ── Derived UI values ────────────────────────────────────────────────────

  const processDroppedImage = async (file) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("Image exceeds 10MB limit.");
      return;
    }
    setImageUploading(true);
    setImageProgress(0);
    try {
      const url = await uploadVideoStudioImage(selectedModel, apiKey, file, (pct) => {
        setImageProgress(pct);
      });
      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setV2vMode(false);

      let targetModelId = selectedModel;
      if (!imageMode) {
        const nativeModel = isNativeModelId(selectedModel) ? nativeModelById(selectedModel) : null;
        if (nativeModel?.tasks?.includes("image-to-video")) {
          setImageMode(true);
          applyControlsForModel(selectedModel, true, false);
        } else {
          const currentT2V = t2vModels.find((m) => m.id === selectedModel);
          const sibling = currentT2V?.family
            ? i2vModels.find((m) => m.family === currentT2V.family)
            : null;
          const target = sibling || i2vModels[0];
          targetModelId = target.id;
          setImageMode(true);
          setSelectedModel(target.id);
          setSelectedModelName(target.name);
          applyControlsForModel(target.id, true, false);
        }
      }

      const maxImgs = getMaxImagesForVideoInputMode(targetModelId, veoInputMode);
      if (maxImgs > 2) {
        setRefTrimNotice("");
        setUploadedImageUrls((prev) => {
          return prev.includes(url) ? prev : [...prev, url].slice(0, maxImgs);
        });
      } else {
        setRefTrimNotice("");
        setUploadedImageUrls([url]);
      }
      setPromptDisabled(false);
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setImageUploading(false);
      setImageProgress(0);
    }
  };

  const processDroppedVideo = async (file) => {
    if (file.size > 50 * 1024 * 1024) {
      alert("Video exceeds 50MB limit.");
      return;
    }
    const nativeVideoUpload = shouldUseNativeVideoUpload(selectedModel);
    if (nativeVideoUpload && file.type !== "video/mp4") {
      setVideoUploadError("Native video input supports MP4 only");
      setTimeout(() => setVideoUploadError(""), 4000);
      return;
    }
    setVideoUploadError("");
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = nativeVideoUpload
        ? (await uploadNativeFile(file)).url
        : await uploadFile(apiKey, file, (pct) => {
            setVideoProgress(pct);
          });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);
      if (nativeVideoUpload) {
        setUploadedImageUrls([]);
        setUploadedEndImageUrl(null);
        setImageMode(false);
        setV2vMode(false);
        setPromptDisabled(false);
      } else {
        setUploadedImageUrls([]);
        if (imageMode) {
          setImageMode(false);
        }
        setV2vMode(true);
        const firstV2V = v2vModels[0];
        setSelectedModel(firstV2V.id);
        setSelectedModelName(firstV2V.name);
        applyControlsForModel(firstV2V.id, false, true);
        setPrompt("");
        setPromptDisabled(true);
      }
    } catch (err) {
      alert(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
    }
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      const videoFiles = droppedFiles.filter(f => f.type.startsWith('video/'));
      
      if (videoFiles.length > 0) {
        processDroppedVideo(videoFiles[0]);
      } else if (imageFiles.length > 0) {
        processDroppedImage(imageFiles[0]);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImage, processDroppedVideo]);

  // Initialise controls for default model on mount
  useEffect(() => {
    if (hasRestored.current) return;
    applyControlsForModel(defaultModel.id, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openDropdown]);

  // ── textarea auto-resize ──────────────────────────────────────────────────
  const handlePromptInput = (e) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const maxH = window.innerWidth < 768 ? 150 : 250;
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
  };

  useEffect(() => {
    if (!hasRestored.current) return;
    const handoff = consumeGeneratedImageHandoff();
    if (!handoff) return;
    if (handoff.error) {
      reportHandoffFailure(handoff.error);
      return;
    }
    const plan = planReferenceHandoff({ urls: handoff.urls, currentModelId: selectedModelRef.current });
    if (!plan.modelId) {
      reportHandoffFailure(plan.warnings);
      return;
    }
    applyReferenceHandoffPlan(plan);
  }, [applyReferenceHandoffPlan, consumeGeneratedImageHandoff, referenceHandoffNonce, reportHandoffFailure]);

  // ── image upload ─────────────────────────────────────────────────────────

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image exceeds 10MB limit.");
      return;
    }
    setImageUploading(true);
    setImageProgress(0);

    try {
      const url = await uploadVideoStudioImage(selectedModel, apiKey, file, (pct) => {
        setImageProgress(pct);
      });
      // Motion-control v2v: image is a second input, not a mode switch
      if (isMotionControlSelection(selectedModel, v2vMode)) {
        setPromptDisabled(false);
        setUploadedImageUrls([url]);
      } else {
        // Clear v2v if active
        setUploadedVideoUrl(null);
        setUploadedVideoName(null);
        setV2vMode(false);

        let targetModelId = selectedModel;
        if (!imageMode) {
          const nativeModel = isNativeModelId(selectedModel) ? nativeModelById(selectedModel) : null;
          if (nativeModel?.tasks?.includes("image-to-video")) {
            setImageMode(true);
            applyControlsForModel(selectedModel, true, false);
          } else {
            const currentT2V = t2vModels.find((m) => m.id === selectedModel);
            const sibling = currentT2V?.family
              ? i2vModels.find((m) => m.family === currentT2V.family)
              : null;
            const target = sibling || i2vModels[0];
            targetModelId = target.id;
            setImageMode(true);
            setSelectedModel(target.id);
            setSelectedModelName(target.name);
            applyControlsForModel(target.id, true, false);
          }
        }

        const maxImgs = getMaxImagesForVideoInputMode(targetModelId, veoInputMode);
        if (maxImgs > 2) {
          setRefTrimNotice("");
          setUploadedImageUrls((prev) => {
            return prev.includes(url) ? prev : [...prev, url].slice(0, maxImgs);
          });
        } else {
          setRefTrimNotice("");
          setUploadedImageUrls([url]);
        }
        setPromptDisabled(false);
      }
    } catch (err) {
      console.error("[VideoStudio] Image upload failed:", err);
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setImageUploading(false);
      setImageProgress(0);
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  };

  const clearImageUpload = () => {
    setUploadedImageUrls([]);
    setUploadedEndImageUrl(null);
    setRefTrimNotice("");
    // Motion-control v2v: keep model and video; just drop the image
    if (isMotionControlSelection(selectedModel, v2vMode)) return;
    setImageMode(false);
    const nativeModel = isNativeModelId(selectedModel) ? nativeModelById(selectedModel) : null;
    if (nativeModel?.tasks?.includes("text-to-video")) {
      applyControlsForModel(selectedModel, false, false);
    } else {
      const first = t2vModels[0];
      setSelectedModel(first.id);
      setSelectedModelName(first.name);
      applyControlsForModel(first.id, false, false);
    }
    setPromptDisabled(false);
  };

  const removeImageAtIndex = (idx) => {
    const nextUrls = uploadedImageUrls.filter((_, i) => i !== idx);
    setUploadedImageUrls(nextUrls);
    setRefTrimNotice("");
    if (nextUrls.length === 0) {
      // Reset to text-to-video if empty list
      if (isMotionControlSelection(selectedModel, v2vMode)) return;
      setImageMode(false);
      const nativeModel = isNativeModelId(selectedModel) ? nativeModelById(selectedModel) : null;
      if (nativeModel?.tasks?.includes("text-to-video")) {
        applyControlsForModel(selectedModel, false, false);
      } else {
        const first = t2vModels[0];
        setSelectedModel(first.id);
        setSelectedModelName(first.name);
        applyControlsForModel(first.id, false, false);
      }
      setPromptDisabled(false);
    }
  };

  // ── end-frame upload (FLF i2v models) ──────────────────────────────────────
  const handleEndImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image exceeds 10MB limit.");
      return;
    }
    setEndImageUploading(true);
    setEndImageProgress(0);
    try {
      const url = await uploadVideoStudioImage(selectedModel, apiKey, file, (pct) => {
        setEndImageProgress(pct);
      });
      setUploadedEndImageUrl(url);
    } catch (err) {
      alert(`End frame upload failed: ${err.message}`);
    } finally {
      setEndImageUploading(false);
      setEndImageProgress(0);
      if (endImageFileInputRef.current) endImageFileInputRef.current.value = "";
    }
  };

  const clearEndImage = () => setUploadedEndImageUrl(null);

  // ── video upload ─────────────────────────────────────────────────────────
  const handleVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Video exceeds 50MB limit.");
      return;
    }
    const nativeVideoUpload = shouldUseNativeVideoUpload(selectedModel);
    if (nativeVideoUpload && file.type !== "video/mp4") {
      setVideoUploadError("Native video input supports MP4 only");
      setTimeout(() => setVideoUploadError(""), 4000);
      return;
    }
    setVideoUploadError("");
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = nativeVideoUpload
        ? (await uploadNativeFile(file)).url
        : await uploadFile(apiKey, file, (pct) => {
            setVideoProgress(pct);
          });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);

      if (nativeVideoUpload) {
        setUploadedImageUrls([]);
        setUploadedEndImageUrl(null);
        setImageMode(false);
        setV2vMode(false);
        setPromptDisabled(false);
      } else if (isMotionControlSelection(selectedModel, v2vMode)) {
        // Already in motion-control mode — keep model and image, allow prompt
        setPromptDisabled(false);
      } else {
        // Default v2v flow (e.g. watermark remover) — auto-pick the first v2v model
        setUploadedImageUrls([]);
        if (imageMode) {
          setImageMode(false);
        }
        setV2vMode(true);
        const firstV2V = v2vModels[0];
        setSelectedModel(firstV2V.id);
        setSelectedModelName(firstV2V.name);
        applyControlsForModel(firstV2V.id, false, true);
        setPrompt("");
        setPromptDisabled(true);
      }
    } catch (err) {
      console.error("[VideoStudio] Video upload failed:", err);
      alert(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const clearVideoUpload = () => {
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = t2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  // ── model selection from dropdown ─────────────────────────────────────────
  const handleModelSelect = useCallback(
    (m, isV2V) => {
      setRefTrimNotice("");
      const trimImageRefs = (maxImages, label) => {
        const kept = Math.max(1, maxImages);
        if (uploadedImageUrls.length > kept) {
          setRefTrimNotice(`Kept ${kept} of ${uploadedImageUrls.length} reference images — ${label} accepts ${kept}`);
        }
        setUploadedImageUrls(uploadedImageUrls.slice(0, kept));
      };
      if (isV2V) {
        setV2vMode(true);
        setImageMode(false);
        const isMC = !!m.imageField;
        if (isMC) {
          trimImageRefs(m.maxImages || 1, m.name);
        }
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, false, true);
        if (isMC) {
          // Motion-control: prompt is editable, video+image are needed
          setPromptDisabled(false);
        } else {
          setPrompt("");
          setPromptDisabled(true);
        }
      } else {
        const nativeModel = nativeModelById(m.id);
        if (v2vMode) {
          setV2vMode(false);
          setUploadedVideoUrl(null);
          setUploadedVideoName(null);
          setPromptDisabled(false);
        }
        const forceImageMode = !imageMode && isNativeI2VOnlyModel(nativeModel);
        const targetSupportsImage = nativeModel?.tasks?.includes("image-to-video") || !!m.imageField;
        const nextImageMode = imageMode || forceImageMode || (uploadedImageUrls.length > 0 && targetSupportsImage);
        setSelectedModel(m.id);
        setSelectedModelName(nativeModel?.label || m.name);
        if (!isVeoReferenceModel(nativeModel)) setVeoInputMode("frames");
        setImageMode(nextImageMode && targetSupportsImage);
        applyControlsForModel(m.id, nextImageMode && targetSupportsImage, false);
        if (nextImageMode && targetSupportsImage) {
          trimImageRefs(getMaxImagesForVideoInputMode(m.id, veoInputMode), nativeModel?.label || m.name);
        }
      }
    },
    [v2vMode, imageMode, uploadedImageUrls, veoInputMode, applyControlsForModel],
  );

  // ── add to local history ──────────────────────────────────────────────────
  const addToLocalHistory = useCallback((entry) => {
    setLocalHistory((prev) => [entry, ...prev.filter((item) => !sameHistoryEntry(item, entry))].slice(0, 30));
    setActiveHistoryIdx(0);
  }, []);

  useEffect(() => {
    const insertMissed = () => {
      if (!registryHydratedRef.current) return;
      const missed = nativeGenerationRegistry.consume("video");
      missed.forEach(addToLocalHistory);
    };
    const unsubscribe = nativeGenerationRegistry.subscribe("video", insertMissed);
    return unsubscribe;
  }, [addToLocalHistory]);

  const deleteHistoryEntry = useCallback(async (entry) => {
    if (!confirm("Delete this generation from the interface and server? This cannot be undone.")) return;
    const jobId = nativeVideoJobId(entry);
    if (entry?.serverBacked && jobId) {
      try {
        await deleteNativeLibraryItem(jobId);
      } catch (err) {
        console.warn("Failed to delete VideoStudio library item:", err);
        alert("Failed to delete generation from server.");
        return;
      }
    }
    setLocalHistory((prev) => prev.filter((item) => item !== entry && !sameHistoryEntry(item, entry)));
  }, []);

  const renameHistoryEntry = useCallback(async (entry) => {
    const jobId = nativeVideoJobId(entry);
    if (!entry?.native || !jobId) return;
    const name = window.prompt("Rename generation", entry.displayName || "");
    if (name === null) return;
    const displayName = name.trim();
    if (!displayName) return;
    try {
      const updated = await renameNativeLibraryItem(jobId, displayName);
      setLocalHistory((prev) =>
        prev.map((item) =>
          item === entry || sameHistoryEntry(item, entry)
            ? { ...item, displayName: updated.displayName || displayName, downloadName: updated.downloadName || updated.displayName || displayName }
            : item,
        ),
      );
    } catch (err) {
      console.warn("Failed to rename VideoStudio library item:", err);
      alert("Failed to rename generation.");
    }
  }, []);

  const downloadLastFrameForEntry = useCallback(async (entry) => {
    const jobId = nativeVideoJobId(entry);
    if (!jobId) return;
    setLastFrameStatus("");
    try {
      await downloadNativeLibraryLastFrame(jobId);
    } catch (err) {
      console.warn("Failed to download VideoStudio last frame:", err);
      setLastFrameStatus("Failed to download last frame.");
    }
  }, []);

  // ── show result in canvas ─────────────────────────────────────────────────
  const showVideoInCanvas = useCallback((url, model) => {
    setCanvasUrl(url);
    setCanvasModel(model);
    setShowCanvas(true);
  }, []);

  // ── generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const currentModel = getCurrentModel();
    const isExtendMode = currentModel?.requiresRequestId;
    const trimmedPrompt = prompt.trim();

    if (v2vMode) {
      if (!uploadedVideoUrl) {
        alert("Please upload a video first.");
        return;
      }
      if (currentModel?.imageField && !uploadedImageUrl) {
        alert("Please upload a reference image for motion control.");
        return;
      }
      if (currentModel?.promptRequired && !trimmedPrompt) {
        alert("Please describe the motion you want.");
        return;
      }
    } else if (isExtendMode) {
      if (!lastGenerationId) {
        alert(
          "No Seedance 2.0 generation found to extend. Generate a video first.",
        );
        return;
      }
    } else if (imageMode) {
      const maxImgs = getMaxImagesForVideoInputMode(selectedModel, veoInputMode);
      if (maxImgs > 2) {
        if (uploadedImageUrls.length === 0) {
          alert("Please upload at least one reference image first.");
          return;
        }
      } else {
        if (!uploadedImageUrl) {
          alert("Please upload a start frame image first.");
          return;
        }
      }
    } else {
      if (!trimmedPrompt && !(uploadedVideoUrl && shouldUseNativeVideoUpload(selectedModel))) {
        alert("Please enter a prompt to generate a video.");
        return;
      }
    }

    if (imageMode && isNativeModelId(selectedModel)) {
      const model = nativeModelById(selectedModel);
      const referenceImagesEnabled = model?.referenceImagesEnabled || nativeVideoReferencesEnabled(model);
      const refCount = veoReferencesMode ? uploadedImageUrls.length : referenceImagesEnabled ? Math.max(0, uploadedImageUrls.length - 1) : 0;
      const requiredDuration = model?.provider === "vertex" ? model?.referenceDurationSeconds || 8 : model?.referenceDurationSeconds;
      if (!veoReferencesMode && uploadedEndImageUrl && model?.supportsLastFrame !== false && requiredDuration) {
        if (uploadedEndImageUrl && Number(selectedDuration) !== requiredDuration) {
          alert(`Veo last frame requires ${requiredDuration}s duration.`);
          return;
        }
      }
      if (refCount > 0 && requiredDuration && Number(selectedDuration) !== requiredDuration) {
        alert(`Veo reference images require ${requiredDuration}s duration.`);
        return;
      }
    }

    setGenerating(true);
    setGenerateError(null);

    let hadError = false;
    const { displayName: submitDisplayName, nextSequence } = nextDisplayNameForSubmit(generationName, nameSequence, history);

    try {
      let res;

      if (v2vMode) {
        // V2V: dedicated processV2V handles single-input tools (e.g. watermark
        // remover) and motion-control models (which take video + image + prompt)
        const v2vParams = {
          model: selectedModel,
          video_url: uploadedVideoUrl,
        };
        if (currentModel?.imageField && uploadedImageUrl) {
          v2vParams.image_url = uploadedImageUrl;
        }
        if (currentModel?.hasPrompt && trimmedPrompt) {
          v2vParams.prompt = trimmedPrompt;
        }
        res = await processV2V(apiKey, v2vParams);
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        setLastGenerationId(null);
        setLastGenerationModel(null);
        const entry = {
          id: genId,
          url: res.url,
          prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
          model: selectedModel,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
            type: "video",
          });
      } else if (uploadedVideoUrl && shouldUseNativeVideoUpload(selectedModel)) {
        const model = nativeModelById(selectedModel);
        const input = nativeInputFromUrl(uploadedVideoUrl, "input");
        res = await generateNativeMedia({
          modelId: selectedModel,
          task: "image-to-video",
          prompt: trimmedPrompt,
          parameters: nativeVideoParams(model, selectedAr, selectedDuration, selectedResolution, selectedAudio),
          inputs: input ? [input] : [],
          displayName: submitDisplayName,
          onSubmitted: (job) => nativeGenerationRegistry.track(job, {
            studio: "video",
            prompt: trimmedPrompt,
            displayName: submitDisplayName,
            model,
          }),
        });
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.request_id || res.id || Date.now().toString();
        setLastGenerationId(null);
        setLastGenerationModel(null);
        const entry = {
          id: genId,
          jobId: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: selectedModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          resolution: nativeVideoCardResolution(model, selectedResolution),
          displayName: res.displayName || submitDisplayName || undefined,
          downloadName: res.downloadName || res.displayName || submitDisplayName || undefined,
          timestamp: new Date().toISOString(),
          status: "completed",
          native: true,
          serverBacked: true,
        };
        addToLocalHistory(entry);
        if (mountedRef.current) nativeGenerationRegistry.settle(genId);
        if (submitDisplayName) setNameSequence(nextSequence);
        setRefTrimNotice("");
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
        return;
      } else if (imageMode) {
        const maxImgs = getMaxImagesForI2VNative(selectedModel);
        if (isNativeModelId(selectedModel)) {
          const model = nativeModelById(selectedModel);
          const referenceImagesEnabled = model?.referenceImagesEnabled || nativeVideoReferencesEnabled(model);
          const imageUrls = veoReferencesMode
            ? uploadedImageUrls.slice(0, 3)
            : referenceImagesEnabled
              ? uploadedImageUrls
              : uploadedImageUrls.slice(0, 1);
          const inputs = imageUrls
            .map((u, idx) => nativeInputFromUrl(u, veoReferencesMode ? "reference" : idx === 0 ? "first-frame" : "reference"))
            .filter(Boolean);
          if (!veoReferencesMode && model?.supportsLastFrame !== false) {
            const endFrame = nativeInputFromUrl(uploadedEndImageUrl, "last-frame");
            if (endFrame) inputs.push(endFrame);
          }
          res = await generateNativeMedia({
            modelId: selectedModel,
            task: "image-to-video",
            prompt: trimmedPrompt,
            parameters: nativeVideoParams(model, selectedAr, selectedDuration, selectedResolution, selectedAudio),
            inputs,
            displayName: submitDisplayName,
            onSubmitted: (job) => nativeGenerationRegistry.track(job, {
              studio: "video",
              prompt: trimmedPrompt,
              displayName: submitDisplayName,
              model,
            }),
          });
          if (!res?.url) throw new Error("No video URL returned by API");

          const genId = res.request_id || res.id || Date.now().toString();
          setLastGenerationId(null);
          setLastGenerationModel(null);
          const entry = {
            id: genId,
            jobId: genId,
            url: res.url,
            prompt: trimmedPrompt,
            model: selectedModel,
            aspect_ratio: selectedAr,
            duration: selectedDuration,
            resolution: nativeVideoCardResolution(model, selectedResolution),
            displayName: res.displayName || submitDisplayName || undefined,
            downloadName: res.downloadName || res.displayName || submitDisplayName || undefined,
            timestamp: new Date().toISOString(),
            status: "completed",
            native: true,
            serverBacked: true,
          };
          addToLocalHistory(entry);
          if (mountedRef.current) nativeGenerationRegistry.settle(genId);
          if (submitDisplayName) setNameSequence(nextSequence);
          setRefTrimNotice("");
          showVideoInCanvas(res.url, selectedModel);
          if (onGenerationComplete)
            onGenerationComplete({
              url: res.url,
              model: selectedModel,
              prompt: trimmedPrompt,
              type: "video",
            });
          return;
        }
        const i2vParams = { model: selectedModel };
        if (maxImgs > 2) {
          i2vParams.images_list = uploadedImageUrls;
        } else {
          i2vParams.image_url = uploadedImageUrl;
        }
        if (trimmedPrompt) i2vParams.prompt = trimmedPrompt;
        i2vParams.aspect_ratio = selectedAr;
        const i2vModel = i2vModels.find((m) => m.id === selectedModel);
        if (uploadedEndImageUrl && i2vModel?.lastImageField) {
          i2vParams.last_image = uploadedEndImageUrl;
        }
        const durations = getDurationsForI2VNative(selectedModel);
        if (durations.length > 0) i2vParams.duration = selectedDuration;
        const resolutions = getResolutionsForI2VNative(selectedModel);
        if (resolutions.length > 0) i2vParams.resolution = selectedResolution;
        if (selectedQuality) i2vParams.quality = selectedQuality;
        if (selectedMode) i2vParams.mode = selectedMode;
        if (showEffect && selectedEffect) i2vParams.name = selectedEffect;

        res = await generateI2V(apiKey, i2vParams);
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        if (selectedModel === "seedance-v2.0-i2v") {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: selectedModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      } else {
        // T2V (including extend mode)
        if (isNativeModelId(selectedModel)) {
          const model = nativeModelById(selectedModel);
          res = await generateNativeMedia({
            modelId: selectedModel,
            task: "text-to-video",
            prompt: trimmedPrompt,
            parameters: nativeVideoParams(model, selectedAr, selectedDuration, selectedResolution, selectedAudio),
            displayName: submitDisplayName,
            onSubmitted: (job) => nativeGenerationRegistry.track(job, {
              studio: "video",
              prompt: trimmedPrompt,
              displayName: submitDisplayName,
              model,
            }),
          });
          if (!res?.url) throw new Error("No video URL returned by API");

          const genId = res.request_id || res.id || Date.now().toString();
          setLastGenerationId(null);
          setLastGenerationModel(null);
          const entry = {
            id: genId,
            jobId: genId,
            url: res.url,
            prompt: trimmedPrompt,
            model: selectedModel,
            aspect_ratio: selectedAr,
            duration: selectedDuration,
            resolution: nativeVideoCardResolution(model, selectedResolution),
            displayName: res.displayName || submitDisplayName || undefined,
            downloadName: res.downloadName || res.displayName || submitDisplayName || undefined,
            timestamp: new Date().toISOString(),
            status: "completed",
            native: true,
            serverBacked: true,
          };
          addToLocalHistory(entry);
          if (mountedRef.current) nativeGenerationRegistry.settle(genId);
          if (submitDisplayName) setNameSequence(nextSequence);
          setRefTrimNotice("");
          showVideoInCanvas(res.url, selectedModel);
          if (onGenerationComplete)
            onGenerationComplete({
              url: res.url,
              model: selectedModel,
              prompt: trimmedPrompt,
              type: "video",
            });
          return;
        }
        const params = { model: selectedModel };
        if (trimmedPrompt) params.prompt = trimmedPrompt;

        if (isExtendMode) {
          params.request_id = lastGenerationId;
        } else {
          params.aspect_ratio = selectedAr;
        }

        const durations = getDurationsForT2VNative(selectedModel);
        if (durations.length > 0) params.duration = selectedDuration;
        const resolutions = getResolutionsForT2VNative(selectedModel);
        if (resolutions.length > 0) params.resolution = selectedResolution;
        if (selectedQuality) params.quality = selectedQuality;
        if (selectedMode) params.mode = selectedMode;

        res = await generateVideo(apiKey, params);
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        if (
          selectedModel === "seedance-v2.0-t2v" ||
          selectedModel === "seedance-v2.0-i2v"
        ) {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: selectedModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      }
    } catch (e) {
      hadError = true;
      console.error("[VideoStudio]", e);
      setGenerateError(e.message || "Generation failed");
      setTimeout(() => setGenerateError(null), 4000);
    } finally {
      setGenerating(false);
    }
  }, [
    apiKey,
    prompt,
    v2vMode,
    imageMode,
    selectedModel,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    selectedAudio,
    showEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    uploadedEndImageUrl,
    lastGenerationId,
    generationName,
    nameSequence,
    history,
    veoReferencesMode,
    getCurrentModel,
    addToLocalHistory,
    showVideoInCanvas,
    onGenerationComplete,
  ]);

  // ── reset to prompt bar ───────────────────────────────────────────────────
  const resetToPromptBar = useCallback(() => {
    setShowCanvas(false);
  }, []);

  const handleNewPrompt = useCallback(() => {
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = t2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [resetToPromptBar, applyControlsForModel]);

  const handleExtend = useCallback(() => {
    if (!lastGenerationId) return;
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    setSelectedModel("seedance-v2.0-extend");
    setSelectedModelName("Seedance 2.0 Extend");
    applyControlsForModel("seedance-v2.0-extend", false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [lastGenerationId, resetToPromptBar, applyControlsForModel]);

  // ── derived UI values ────────────────────────────────────────────────────
  const isSeedance2Canvas =
    canvasModel === "seedance-v2.0-t2v" || canvasModel === "seedance-v2.0-i2v";
  const currentModelObj = getCurrentModel();
  const isExtendMode = currentModelObj?.requiresRequestId;
  const selectedModelCanUseImageRefs = v2vMode
    ? !!currentModelObj?.imageField
    : imageMode && (currentNativeModel?.tasks?.includes("image-to-video") || !!currentModelObj?.imageField);
  const showImageReferenceStrip =
    uploadedImageUrls.length > 0 &&
    (getMaxImagesForVideoInputMode(selectedModel, veoInputMode) > 2 || !selectedModelCanUseImageRefs);
  const imageReferenceWarning =
    uploadedImageUrls.length > 0 && !selectedModelCanUseImageRefs
      ? `${selectedModelName} won't use reference images`
      : "";

  const promptPlaceholder = v2vMode
    ? currentModelObj?.imageField
      ? currentModelObj?.promptRequired
        ? "Describe the motion"
        : "Describe the motion (optional)"
      : "Video ready — click Generate to remove watermark"
    : imageMode
      ? "Describe the motion or effect (optional)"
      : isExtendMode
        ? "Optional: describe how to continue the video..."
        : "Describe the video you want to create";

  const toggleDropdown = (type) => (e) => {
    e.stopPropagation();
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden"
    >
      <Toaster position="bottom-right" reverseOrder={false} />
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {history.length > 0 ? (
          <div className="w-full pt-4 animate-fade-in-up">
            {lastFrameStatus && (
              <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {lastFrameStatus}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {history.map((entry, idx) => {
              const isSeedance2 = entry.model === "seedance-v2.0-t2v" || entry.model === "seedance-v2.0-i2v";
              const canDownloadLastFrame = canDownloadNativeLastFrame(entry);
              const isFailedEntry = isFailedHistoryEntry(entry);
              if (isFailedEntry) {
                return (
                  <div
                    key={entry.id || idx}
                    className="relative group rounded-lg overflow-hidden border border-red-400/30 bg-[#160909] shadow-xl transition-all duration-300 flex flex-col"
                  >
                    <div className="w-full aspect-video bg-red-950/30 px-4 py-5 flex flex-col justify-center gap-3">
                      <div className="inline-flex w-fit items-center rounded-full border border-red-300/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-200">
                        Generation failed
                      </div>
                      <div className="text-sm font-semibold text-white/90">
                        {entry.displayName || "Native video generation failed"}
                      </div>
                      <p className="line-clamp-3 text-xs leading-relaxed text-red-100/80">
                        {entry.error || entry.status || "Provider failed before returning playable media."}
                      </p>
                    </div>
                    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="Copy prompt"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyPromptToClipboard(entry.prompt);
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <Copy size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHistoryEntry(entry);
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 hover:text-white transition-all border border-white/10"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="p-3 flex flex-col gap-1 bg-[#0f0f0f] border-t border-white/5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-red-200">{entry.status || "failed"}</span>
                        <span className="text-white/30">{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : ""}</span>
                      </div>
                      {entry.prompt && (
                        <p className="text-xs text-white/45 truncate" title={entry.prompt}>
                          {entry.prompt}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={entry.id || idx}
                  className="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col"
                >
                  <LazyVideo
                    src={entry.url}
                    className="w-full aspect-video overflow-hidden bg-black/40 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setFullscreenUrl(entry.url)}
                  />
                  
                  {/* Overlay actions */}
                  <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="Fullscreen"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenUrl(entry.url);
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(entry.url, videoDownloadName(entry, idx));
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                    {canDownloadLastFrame && (
                      <button
                        type="button"
                        title="Download last frame"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadLastFrameForEntry(entry);
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <Download size={14} strokeWidth={2.5} />
                      </button>
                    )}
                    {entry.native && nativeVideoJobId(entry) && (
                      <button
                        type="button"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          renameHistoryEntry(entry);
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <Pencil size={14} strokeWidth={2.5} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Copy prompt"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyPromptToClipboard(entry.prompt);
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                    >
                      <Copy size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteHistoryEntry(entry);
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 hover:text-white transition-all border border-white/10"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                    {isSeedance2 && (
                      <button
                        type="button"
                        title="Extend this video using Seedance 2.0 Extend"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLastGenerationId(entry.id);
                          handleExtend();
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Prompt & Details */}
                  <div className="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2">
                    <p className="text-white/70 text-xs line-clamp-3 leading-relaxed" title={entry.prompt}>
                      {entry.prompt || "No prompt provided"}
                    </p>
                    <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
                      {entry.displayName && (
                        <span className="max-w-full truncate text-[10px] font-semibold text-white/60" title={entry.displayName}>
                          {entry.displayName}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap">
                        {entry.model?.replace("-", " ")}
                      </span>
                      <div className="flex gap-2">
                        {entry.resolution && (
                          <span className="text-[10px] text-white/40">{entry.resolution}</span>
                        )}
                        {entry.duration && (
                          <span className="text-[10px] text-white/40">{entry.duration}s</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]">
            <div className="mb-12 relative group">
              <div className="absolute inset-0 bg-primary/10 blur-[120px] rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-1000" />
              <div className="relative w-24 h-24 md:w-32 md:h-32 bg-white/[0.02] rounded-[2rem] flex items-center justify-center border border-white/[0.05] overflow-hidden backdrop-blur-sm">
                <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center border border-primary/10 relative z-10 transition-transform duration-500 group-hover:scale-110">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary opacity-80">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div className="absolute top-4 right-4 text-[10px] text-primary/40 animate-pulse">✨</div>
              </div>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-4 text-center px-4">
              <span className="text-white/40 font-medium">START CREATING WITH</span><br />
              <span className="text-white">VIDEO STUDIO</span>
            </h1>
            <p className="text-white/40 text-sm md:text-base font-medium tracking-wide text-center max-w-lg leading-relaxed">
              Animate images into stunning AI videos with motion effects
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <div className="absolute bottom-4 w-full max-w-[95%] lg:max-w-4xl z-40 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
        <div className="w-full bg-[#0a0a0a]/80 backdrop-blur-3xl rounded-md border border-white/10 p-4 flex flex-col gap-2 shadow-2xl">
          {imageMode && isVeoReferenceModel(currentNativeModel) && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <div className="inline-flex rounded-md border border-white/[0.06] bg-white/[0.03] p-1">
                {["frames", "references"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setVeoInputMode(mode)}
                    className={`rounded px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      veoInputMode === mode ? "bg-[#22d3ee] text-black" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {mode === "frames" ? "Frames" : "References"}
                  </button>
                ))}
              </div>
              {veoReferencesMode && (
                <span className="text-[10px] font-semibold text-white/40">
                  8s and 16:9 required for Veo references
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 px-1">
            {/* Image upload button / thumbnails */}
            {showImageReferenceStrip ? (
              <div className="flex items-center gap-2 flex-wrap">
                {uploadedImageUrls.map((url, idx) => (
                  <div key={idx} className="relative w-10 h-10 shrink-0 rounded-full border border-primary/60 bg-primary/5 overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImageAtIndex(idx)}
                      className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-black transition-opacity"
                      title="Remove image"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0.5 right-0.5 px-1 h-3.5 bg-black/60 rounded-full text-[8px] font-black text-primary leading-none flex items-center justify-center pointer-events-none">
                      {idx + 1}
                    </span>
                  </div>
                ))}
                {selectedModelCanUseImageRefs && uploadedImageUrls.length < getMaxImagesForVideoInputMode(selectedModel, veoInputMode) && (
                  <div className="relative">
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageFileChange}
                    />
                    <button
                      type="button"
                      title="Upload reference image"
                      onClick={() => imageFileInputRef.current?.click()}
                      className="w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center bg-white/5 border-white/[0.03] hover:bg-white/10 hover:border-primary/40 relative overflow-hidden group"
                    >
                      {imageUploading ? (
                        <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                          <svg className="w-8 h-8 -rotate-90">
                            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="transparent"
                              strokeDasharray={88}
                              strokeDashoffset={88 - (88 * imageProgress) / 100}
                              className="text-primary transition-all duration-300"
                            />
                          </svg>
                          <span className="absolute text-[9px] font-black text-primary leading-none">{imageProgress}%</span>
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-white/40 group-hover:text-primary transition-colors">+</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileChange}
                />
                <button
                  type="button"
                  title={
                    uploadedImageUrl
                      ? "Clear image"
                      : "Upload image for Image-to-Video"
                  }
                  onClick={() =>
                    uploadedImageUrl
                      ? clearImageUpload()
                      : imageFileInputRef.current?.click()
                  }
                  className={`w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden ${uploadedImageUrl ? "border-primary/60 bg-primary/5" : "bg-white/5 border-white/[0.03] hover:bg-white/10 hover:border-primary/40"} group`}
                >
                  {imageUploading ? (
                    <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                      <svg className="w-8 h-8 -rotate-90">
                        <circle
                          cx="16"
                          cy="16"
                          r="14"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="transparent"
                          className="text-white/10"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="14"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="transparent"
                          strokeDasharray={88}
                          strokeDashoffset={88 - (88 * imageProgress) / 100}
                          className="text-primary transition-all duration-300"
                        />
                      </svg>
                      <span className="absolute text-[9px] font-black text-primary leading-none">
                        {imageProgress}%
                      </span>
                    </div>
                  ) : null}

                  {uploadedImageUrl ? (
                    <img
                      src={uploadedImageUrl}
                      alt=""
                      className={`w-full h-full object-cover rounded-full ${imageUploading ? "opacity-40 blur-[2px]" : "opacity-100"}`}
                    />
                  ) : (
                    !imageUploading && (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-white/40 group-hover:text-primary transition-colors"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )
                  )}
                </button>
              </div>
            )}

            {(imageReferenceWarning || refTrimNotice) && (
              <div className="flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                <span>{refTrimNotice || imageReferenceWarning}</span>
                <button
                  type="button"
                  title={refTrimNotice ? "Dismiss warning" : "Remove all reference images"}
                  onClick={() => (refTrimNotice ? setRefTrimNotice("") : setUploadedImageUrls([]))}
                  className="rounded px-1 text-amber-100 transition-colors hover:bg-amber-400/20"
                >
                  ✕
                </button>
              </div>
            )}

            {/* End-frame upload button (FLF i2v models only) */}
            {imageMode && currentModelObj?.lastImageField && !veoReferencesMode && (
              <div className="relative">
                <input
                  ref={endImageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEndImageFileChange}
                />
                <button
                  type="button"
                  title={uploadedEndImageUrl ? "Clear end frame" : "Upload end frame (optional)"}
                  onClick={() =>
                    uploadedEndImageUrl
                      ? clearEndImage()
                      : endImageFileInputRef.current?.click()
                  }
                  className={`w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden ${uploadedEndImageUrl ? "border-primary/60 bg-primary/5" : "bg-white/5 border-white/[0.03] hover:bg-white/10 hover:border-primary/40"} group`}
                >
                  {endImageUploading ? (
                    <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                      <svg className="w-8 h-8 -rotate-90">
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                        <circle
                          cx="16"
                          cy="16"
                          r="14"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="transparent"
                          strokeDasharray={88}
                          strokeDashoffset={88 - (88 * endImageProgress) / 100}
                          className="text-primary transition-all duration-300"
                        />
                      </svg>
                      <span className="absolute text-[9px] font-black text-primary leading-none">
                        {endImageProgress}%
                      </span>
                    </div>
                  ) : null}

                  {uploadedEndImageUrl ? (
                    <img
                      src={uploadedEndImageUrl}
                      alt=""
                      className={`w-full h-full object-cover rounded-full ${endImageUploading ? "opacity-40 blur-[2px]" : "opacity-100"}`}
                    />
                  ) : (
                    !endImageUploading && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 group-hover:text-primary transition-colors">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )
                  )}
                  <span className="absolute top-0.5 left-0.5 px-1 h-3.5 bg-black/60 rounded-md text-[7px] font-black text-primary leading-none flex items-center justify-center pointer-events-none">
                    END
                  </span>
                </button>
              </div>
            )}

            {/* Video upload button */}
            <div className="relative">
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoFileChange}
              />
              <button
                type="button"
                title={
                  uploadedVideoUrl
                    ? `${uploadedVideoName} — click to clear`
                    : "Upload video to remove watermark"
                }
                onClick={() =>
                  uploadedVideoUrl
                    ? clearVideoUpload()
                    : videoFileInputRef.current?.click()
                }
                className={`w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden ${uploadedVideoUrl ? "border-primary/60 bg-white/5" : "bg-white/[0.03] border-white/[0.03] hover:bg-white/10 hover:border-primary/40"} group`}
              >
                {videoUploading ? (
                  <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                    <svg className="w-8 h-8 -rotate-90">
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="transparent"
                        className="text-white/10"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="transparent"
                        strokeDasharray={88}
                        strokeDashoffset={88 - (88 * videoProgress) / 100}
                        className="text-primary transition-all duration-300"
                      />
                    </svg>
                    <span className="absolute text-[9px] font-black text-primary leading-none">
                      {videoProgress}%
                    </span>
                  </div>
                ) : uploadedVideoUrl ? (
                  <video
                    src={uploadedVideoUrl}
                    className={`w-full h-full object-cover rounded-full ${videoUploading ? "opacity-40 blur-[2px]" : "opacity-100"}`}
                    muted
                  />
                ) : (
                  <VideoIconSvg className="text-white/40 group-hover:text-primary transition-colors" />
                )}
              </button>
            </div>

            {videoUploadError && (
              <div className="flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                <span>{videoUploadError}</span>
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => setVideoUploadError("")}
                  className="rounded px-1 text-amber-100 transition-colors hover:bg-amber-400/20"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Prompt textarea */}
            <div className="flex-1 flex flex-col gap-1">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptInput}
                placeholder={promptPlaceholder}
                disabled={promptDisabled}
                rows={1}
                className="w-full bg-transparent border-none text-white text-sm placeholder:text-white/10 focus:outline-none resize-none pt-1 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar disabled:opacity-40"
              />
            </div>
          </div>

          {/* Extend banner */}
          {isExtendMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 mx-3 bg-primary/5 border border-primary/10 rounded-lg text-[10px] text-primary/80 font-medium tracking-tight">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span>Extending previous Seedance 2.0 generation</span>
            </div>
          )}

          {/* Bottom row: controls + generate */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-white/[0.03] relative">
            <div className="flex items-center gap-2 relative flex-wrap pb-1 md:pb-0">
              {/* Model btn */}
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleDropdown("model")}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                >
                  <div className="w-4 h-4 bg-[#22d3ee] rounded flex items-center justify-center shadow-lg shadow-[#22d3ee]/10">
                    <span className="text-[9px] font-bold text-black uppercase">
                      V
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors">
                    {selectedModelName}
                  </span>
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-20 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {openDropdown === "model" && (
                  <div
                    ref={dropdownRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-[1.5rem] p-3 shadow-2xl border border-white/[0.05] w-[calc(100vw-3rem)] max-w-xs"
                  >
                    <ModelDropdown
                      imageMode={imageMode}
                      selectedModel={selectedModel}
                      onSelect={handleModelSelect}
                      onClose={() => setOpenDropdown(null)}
                    />
                  </div>
                )}
              </div>

              {/* Aspect ratio btn */}
              {showAr && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("ar")}
                    disabled={veoReferencesMode}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                    title={veoReferencesMode ? "16:9 required for Veo references" : "Aspect Ratio"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-40 text-white"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      />
                    </svg>
                    <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors">
                      {selectedAr}
                    </span>
                  </button>
                  {openDropdown === "ar" && (
                    <div
                      ref={dropdownRef}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-lg p-3 shadow-2xl border border-white/[0.05] max-h-80 overflow-y-auto custom-scrollbar min-w-[160px]"
                    >
                      <div className="text-xs font-bold text-white/20 border-b border-white/[0.03] mb-2">
                        Aspect Ratio
                      </div>
                      <div className="flex flex-col gap-1">
                        {getCurrentAspectRatios(selectedModel).map((r) => (
                          <div
                            key={r}
                            className={`flex items-center justify-between p-3 rounded transition-all group/opt ${veoReferencesMode ? "cursor-not-allowed opacity-50" : "hover:bg-white/5 cursor-pointer"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (veoReferencesMode) return;
                              setSelectedAr(r);
                              setOpenDropdown(null);
                            }}
                          >
                            <span className="text-[11px] font-semibold text-white/70 group-hover/opt:text-white transition-opacity">
                              {r}
                            </span>
                            {selectedAr === r && <CheckSvg />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Effect btn */}
              {showEffect && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("effect")}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-40 text-white"
                    >
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors max-w-[140px] truncate">
                      {selectedEffect || "Effect"}
                    </span>
                  </button>
                  {openDropdown === "effect" && (
                    <div
                      ref={dropdownRef}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-lg p-3 shadow-2xl border border-white/[0.05] max-h-80 overflow-y-auto custom-scrollbar min-w-[200px]"
                    >
                      <div className="text-xs font-bold text-white/20 border-b border-white/[0.03] mb-2">
                        Effect Type
                      </div>
                      <div className="flex flex-col gap-1">
                        {getEffectsForI2VModel(selectedModel).map((eff) => (
                          <div
                            key={eff}
                            className="flex items-center justify-between p-2 hover:bg-white/5 rounded cursor-pointer transition-all group/opt"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEffect(eff);
                              setOpenDropdown(null);
                            }}
                          >
                            <span className="text-[11px] font-semibold text-white/70 group-hover/opt:text-white">
                              {eff}
                            </span>
                            {selectedEffect === eff && <CheckSvg />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Duration btn */}
              {showDuration && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("duration")}
                    disabled={veoReferencesMode}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                    title={veoReferencesMode ? "8s required for Veo references" : "Duration"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-40 text-white"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="text-xs font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors">
                      {selectedDuration}s
                    </span>
                  </button>
                  {openDropdown === "duration" && (
                    <div
                      ref={dropdownRef}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-md p-3 shadow-2xl border border-white/10 min-w-[140px]"
                    >
                      <div className="text-xs font-bold text-white/20 border-b border-white/[0.03] mb-2">
                        Duration
                      </div>
                      <div className="flex flex-col gap-1">
                        {getCurrentDurations(selectedModel).map((d) => (
                          <div
                            key={d}
                            className={`flex items-center justify-between p-2 rounded-md transition-all group/opt ${veoReferencesMode ? "cursor-not-allowed opacity-50" : "hover:bg-white/5 cursor-pointer"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (veoReferencesMode) return;
                              setSelectedDuration(d);
                              setOpenDropdown(null);
                            }}
                          >
                            <span className="text-xs font-semibold text-white/70 group-hover/opt:text-white">
                              {d}s
                            </span>
                            {selectedDuration === d && <CheckSvg />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Resolution btn */}
              {showResolution && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("resolution")}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-40 text-white"
                    >
                      <path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors">
                      {selectedResolution || "720p"}
                    </span>
                  </button>
                  {openDropdown === "resolution" && (
                    <div
                      ref={dropdownRef}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#0a0a0a] rounded-md p-3 shadow-2xl border border-white/[0.05] min-w-[140px]"
                    >
                      <div className="text-xs font-bold text-white/20 border-b border-white/[0.03] mb-2">
                        Resolution
                      </div>
                      <div className="flex flex-col gap-1">
                        {getCurrentResolutions(selectedModel).map((r) => (
                          <div
                            key={r}
                            className="flex items-center justify-between p-3 hover:bg-white/5 rounded cursor-pointer transition-all group/opt"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedResolution(r);
                              setOpenDropdown(null);
                            }}
                          >
                            <span className="text-[11px] font-semibold text-white/70 group-hover/opt:text-white">
                              {r}
                            </span>
                            {selectedResolution === r && <CheckSvg />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {showAudio && (
                <button
                  type="button"
                  title={selectedAudio ? "Disable Veo audio" : "Enable Veo audio"}
                  onClick={() => setSelectedAudio((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all border border-white/[0.03] group whitespace-nowrap"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="opacity-40 text-white"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {selectedAudio ? (
                      <path d="M15 9.5a4 4 0 010 5M18 7a8 8 0 010 10" />
                    ) : (
                      <line x1="16" y1="9" x2="21" y2="14" />
                    )}
                  </svg>
                  <span className="text-[11px] font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors">
                    {selectedAudio ? "Audio on" : "Audio off"}
                  </span>
                </button>
              )}
            </div>

            <input
              type="text"
              value={generationName}
              onChange={(e) => setGenerationName(e.target.value)}
              maxLength={120}
              placeholder="Name (optional)"
              className="w-full sm:w-40 rounded-md border border-white/[0.03] bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/70 placeholder:text-white/20 outline-none transition-colors focus:border-[#22d3ee]/40 focus:bg-white/[0.06]"
            />

            {/* Generate button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#22d3ee] text-black px-4 py-2 rounded-md font-medium text-sm hover:bg-[#e5ff33] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 w-full sm:w-auto shadow-lg shadow-[#22d3ee]/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <span className="animate-spin inline-block text-black">
                    ◌
                  </span>{" "}
                  Generating...
                </>
              ) : generateError ? (
                `Error: ${generateError}`
              ) : (
                <>
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── FULLSCREEN VIDEO MODAL ── */}
      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <video 
            src={fullscreenUrl} 
            controls 
            autoPlay 
            loop 
            className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
