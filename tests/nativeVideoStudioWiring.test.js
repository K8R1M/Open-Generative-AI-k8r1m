const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/components/VideoStudio.jsx'),
  'utf8'
);
const nativeModelsSource = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/nativeModels.js'),
  'utf8'
);
const lazyVideoSource = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/components/LazyVideo.jsx'),
  'utf8'
);
const studioHistorySource = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/studioHistory.js'),
  'utf8'
);

test('VideoStudio appends native video models to T2V and I2V lists', () => {
  assert.match(source, /NATIVE_T2V_DESCRIPTORS/);
  assert.match(source, /NATIVE_I2V_DESCRIPTORS/);
  assert.match(source, /mergedT2VModels = \[\.\.\.t2vModels, \.\.\.NATIVE_T2V_DESCRIPTORS\]/);
  assert.match(source, /mergedI2VModels = \[\.\.\.i2vModels, \.\.\.NATIVE_I2V_DESCRIPTORS\]/);
});

test('VideoStudio exposes Omni and keeps failed native jobs out of generated history', () => {
  assert.match(nativeModelsSource, /native\.vertex\.gemini-omni-flash-preview/);
  assert.match(nativeModelsSource, /Gemini Omni Flash Preview \(Server · Vertex AI\)/);
  assert.match(nativeModelsSource, /native\.vertex\.gemini-omni-flash-preview[\s\S]{0,320}text-to-video/);
  assert.match(nativeModelsSource, /native\.vertex\.gemini-omni-flash-preview[\s\S]{0,340}image-to-video/);
  assert.match(source, /setGenerateError\(e\.message \|\| "Generation failed"\)/);
  assert.doesNotMatch(source, /setGenerateError\(e\.message\?\.slice/);
  assert.match(source, /model\.resolutions\.length === 0\) delete parameters\.resolution/);
  assert.match(source, /if \(!res\?\.url\) throw new Error\("No video URL returned by API"\);[\s\S]{0,800}addToLocalHistory\(entry\)/);
});

test('VideoStudio shows Omni card resolution from model output instead of stale selector state', () => {
  assert.match(studioHistorySource, /const OMNI_VIDEO_DISPLAY_RESOLUTION = "720p"/);
  assert.match(studioHistorySource, /function nativeVideoCardResolution\(modelOrId, selectedResolution\)/);
  assert.match(studioHistorySource, /model\?\.provider === "omni"[\s\S]{0,120}model\.resolutions\.length === 0/);
  assert.match(studioHistorySource, /resolution: nativeVideoCardResolution\(item\.modelId \|\| item\.model, item\.resolution \|\| params\.resolution\)/);
  assert.match(source, /setSelectedResolution\(""\);[\s\S]{0,80}setShowResolution\(false\)/);
  assert.match(source, /resolution: nativeVideoCardResolution\(model, selectedResolution\)/);
});

test('VideoStudio wires Grok as I2V-only and hides unsupported controls', () => {
  assert.match(nativeModelsSource, /native\.grok\.imagine-video/);
  assert.match(nativeModelsSource, /Grok Imagine 1\.5 \(server-native\)/);
  assert.match(nativeModelsSource, /tasks:\s*\[\s*['"]image-to-video['"]\s*\]/);
  assert.match(source, /supportsAspectRatio/);
  assert.match(source, /supportsAudioToggle/);
  assert.match(source, /supportsLastFrame/);
  assert.match(source, /maxReferenceImages/);
  assert.doesNotMatch(nativeModelsSource, /native\.grok\.imagine-video[\s\S]{0,240}text-to-video/);
});

test('VideoStudio native Veo requests use structured video parameters', () => {
  assert.match(source, /task: "text-to-video"/);
  assert.match(source, /task: "image-to-video"/);
  assert.match(source, /durationSeconds: Number\(selectedDuration\)/);
  assert.match(source, /resolution: selectedResolution/);
  assert.match(source, /audio: selectedAudio/);
});

test('VideoStudio native I2V maps start, end, and references structurally', () => {
  assert.match(source, /Native video inputs must be uploaded through native assets/);
  assert.match(source, /veoReferencesMode[\s\S]{0,120}uploadedImageUrls\.slice\(0, 3\)/);
  assert.match(source, /nativeInputFromUrl\(u, veoReferencesMode \? "reference" : idx === 0 \? "first-frame" : "reference"\)/);
  assert.match(source, /nativeInputFromUrl\(uploadedEndImageUrl, "last-frame"\)/);
  assert.match(source, /veoReferencesMode \? uploadedImageUrls\.length : referenceImagesEnabled \? Math\.max\(0, uploadedImageUrls\.length - 1\) : 0/);
  assert.match(source, /referenceDurationSeconds \|\| 8/);
});

test('VideoStudio wires Veo references mode and native Omni video uploads', () => {
  assert.match(source, /const \[veoInputMode, setVeoInputMode\] = useState\("frames"\)/);
  assert.match(source, /setSelectedDuration\(8\)/);
  assert.match(source, /setSelectedAr\("16:9"\)/);
  assert.match(source, /setUploadedEndImageUrl\(null\)/);
  assert.match(source, /shouldUseNativeVideoUpload\(modelId\)/);
  assert.match(source, /model\.provider === "omni" && Number\(model\.omniMaxVideos \|\| 0\) > 0/);
  assert.match(source, /Native video input supports MP4 only/);
  assert.match(source, /\(await uploadNativeFile\(file\)\)\.url/);
  assert.match(source, /nativeInputFromUrl\(uploadedVideoUrl, "input"\)/);
});

test('VideoStudio exposes native Grok I2V before upload without hijacking legacy Grok models', () => {
  assert.match(source, /const nativeGrokI2VDescriptor = NATIVE_I2V_DESCRIPTORS\.find\(\(m\) => m\.id === NATIVE_GROK_IMAGINE_VIDEO_ID\)/);
  assert.match(source, /const t2vPickerModels = nativeGrokI2VDescriptor/);
  assert.match(source, /const generationModels = imageMode \? mergedI2VModels : t2vPickerModels/);
  assert.match(source, /function isNativeI2VOnlyModel\(model\)/);
  assert.match(source, /!model\.tasks\?\.includes\("text-to-video"\)/);
  assert.match(source, /const forceImageMode = !imageMode && isNativeI2VOnlyModel\(nativeModel\)/);
  assert.match(source, /const targetSupportsImage = nativeModel\?\.tasks\?\.includes\("image-to-video"\)/);
  assert.match(source, /const nextImageMode = imageMode \|\| forceImageMode \|\| \(uploadedImageUrls\.length > 0 && targetSupportsImage\)/);
  assert.match(source, /applyControlsForModel\(m\.id, nextImageMode && targetSupportsImage, false\)/);
  assert.match(source, /function shouldUseNativeImageUpload\(modelId\)/);
  assert.match(source, /const model = nativeModelById\(modelId\)/);
  assert.match(source, /return \(await uploadNativeFile\(file\)\)\.url/);
  assert.match(source, /return uploadFile\(apiKey, file, onProgress\)/);
  assert.doesNotMatch(source, /normalizeGrokVideoModelId/);
  assert.doesNotMatch(source, /LEGACY_GROK_VIDEO_IDS/);
  assert.doesNotMatch(source, /grok-imagine-text-to-video/);
  assert.doesNotMatch(source, /grok-imagine-image-to-video/);
});

test('VideoStudio blocks Veo last-frame submissions unless duration is 8s', () => {
  assert.match(source, /uploadedEndImageUrl && Number\(selectedDuration\) !== requiredDuration/);
  assert.match(source, /Veo last frame requires \$\{requiredDuration\}s duration/);
});

test('VideoStudio hover preview ignores browser play aborts', () => {
  assert.match(source, /<LazyVideo/);
  assert.match(lazyVideoSource, /onMouseOver=\{\(e\) => e\.currentTarget\.play\(\)\.catch\(\(\) => \{\}\)\}/);
});

test('VideoStudio wires last-frame download for completed native server-backed cards only', () => {
  assert.match(source, /downloadNativeLibraryLastFrame/);
  assert.match(source, /function nativeVideoJobId\(entry\)/);
  assert.match(source, /function canDownloadNativeLastFrame\(entry\)/);
  assert.match(source, /entry\?\.native && entry\?\.serverBacked && nativeVideoJobId\(entry\)/);
  assert.match(source, /\(entry\.status \|\| "completed"\) === "completed"/);
  assert.match(source, /title="Download last frame"/);
  assert.match(source, /downloadLastFrameForEntry\(entry\)/);
  assert.match(source, /setLastFrameStatus\("Failed to download last frame\."\)/);
});

test('VideoStudio renders consumed failed registry videos as non-playable failed cards', () => {
  assert.match(source, /nativeGenerationRegistry\.consume\("video"\)/);
  assert.match(source, /function isFailedHistoryEntry\(entry\)/);
  assert.match(source, /const isFailedEntry = isFailedHistoryEntry\(entry\)/);
  const branchStart = source.indexOf('if (isFailedEntry) {');
  const branchEnd = source.indexOf('                  <LazyVideo', branchStart);
  assert.ok(branchStart > -1, 'failed history branch must exist before media rendering');
  assert.ok(branchEnd > branchStart, 'failed history branch must precede LazyVideo rendering');
  const failedBranch = source.slice(branchStart, branchEnd);
  assert.match(failedBranch, /Generation failed/);
  assert.match(failedBranch, /entry\.error \|\| entry\.status/);
  assert.match(failedBranch, /copyPromptToClipboard\(entry\.prompt\)/);
  assert.match(failedBranch, /deleteHistoryEntry\(entry\)/);
  assert.doesNotMatch(failedBranch, /setFullscreenUrl/);
  assert.doesNotMatch(failedBranch, /downloadFile/);
  assert.doesNotMatch(failedBranch, /downloadLastFrameForEntry/);
});

test('VideoStudio consumes generated image handoff once and appends native inputs', () => {
  assert.match(source, /const GENERATED_IMAGE_TO_VIDEO_STUDIO_KEY = "nativeGeneratedImageReference:video"/);
  assert.match(source, /isSameOriginAssetUrl/);
  assert.match(source, /export function planReferenceHandoff/);
  assert.match(source, /const cleanUrls = Array\.from\(new Set\(\(Array\.isArray\(urls\) \? urls : \[\]\)\.filter\(isSameOriginAssetUrl\)\)\)/);
  assert.doesNotMatch(source, /retargeted:/);
  assert.match(source, /const consumeGeneratedImageHandoff = useCallback\(\(\) => \{[\s\S]{0,220}sessionStorage\.removeItem\(GENERATED_IMAGE_TO_VIDEO_STUDIO_KEY\)/);
  assert.match(source, /const handoff = consumeGeneratedImageHandoff\(\);[\s\S]{0,260}planReferenceHandoff\(\{ urls: handoff\.urls, currentModelId: restored\.selectedModel \}\)/);
  assert.match(source, /selectedModelRef\.current/);
  assert.match(source, /const merge = mergeHandoffUrls\(plan\.urls, uploadedImageUrls, plan\.modelId\)/);
  assert.match(source, /setUploadedImageUrls\(merge\.urls\)/);
  assert.match(source, /payload\?\.source !== "generated-image"/);
  assert.match(source, /if \(cleanUrls\.length === 0\) return \{ warnings: \["no-usable-urls"\] \}/);
  assert.doesNotMatch(source, /setPrompt\(payload/);
  assert.doesNotMatch(source, /appendGeneratedImageInputs/);
});

test('VideoStudio warns when the handoff merge drops previously-held reference images', () => {
  assert.match(source, /const mergeHandoffUrls = useCallback\(\(handoffUrls, existingUrls, modelId\) => \{[\s\S]{0,80}const maxImages = Math\.max\(1, getMaxImagesForVideoInputMode\(modelId, "frames"\)\);/);
  assert.match(source, /return \{ urls: merged\.slice\(0, maxImages\), kept: Math\.min\(merged\.length, maxImages\), total: merged\.length \}/);
  assert.match(source, /merge\.total > merge\.kept[\s\S]{0,120}Kept \$\{merge\.kept\} of \$\{merge\.total\} reference images/);
});

test('VideoStudio persists refTrimNotice so a genuine tab-switch remount does not silently drop the warning chip', () => {
  assert.match(source, /refTrimNotice: "",\n      \};\n      const stored = localStorage\.getItem\(PERSIST_KEY\);/);
  assert.match(source, /restored\.refTrimNotice = typeof data\.refTrimNotice === "string" \? data\.refTrimNotice : ""/);
  assert.match(source, /restored\.refTrimNotice =\s*\n\s*merge\.total > merge\.kept/);
  assert.match(source, /setRefTrimNotice\(restored\.refTrimNotice \|\| ""\)/);
  assert.match(source, /const state = \{[\s\S]{0,600}refTrimNotice,\n\s*localHistory,/);
});

test('VideoStudio keeps image URL list as source of truth across restore and model changes', () => {
  assert.doesNotMatch(source, /const \[uploadedImageUrl, setUploadedImageUrl\]/);
  assert.doesNotMatch(source, /setUploadedImageUrl\(/);
  assert.match(source, /const uploadedImageUrl = uploadedImageUrls\[0\] \?\? null/);
  assert.match(source, /restored\.uploadedImageUrls = Array\.isArray\(data\.uploadedImageUrls\)[\s\S]{0,140}: data\.uploadedImageUrl/);
  assert.match(source, /return prev\.includes\(url\) \? prev : \[\.\.\.prev, url\]\.slice\(0, maxImgs\)/);
  assert.match(source, /const trimImageRefs = \(maxImages, label\) => \{[\s\S]{0,180}uploadedImageUrls\.length > kept[\s\S]{0,220}setUploadedImageUrls\(uploadedImageUrls\.slice\(0, kept\)\)/);
  assert.doesNotMatch(source, /\bclearImageRefs\b/);
  assert.match(source, /if \(isMC\) \{[\s\S]{0,80}trimImageRefs\(m\.maxImages \|\| 1, m\.name\)/);
  assert.match(source, /const targetSupportsImage = nativeModel\?\.tasks\?\.includes\("image-to-video"\) \|\| !!m\.imageField/);
  assert.match(source, /const nextImageMode = imageMode \|\| forceImageMode \|\| \(uploadedImageUrls\.length > 0 && targetSupportsImage\)/);
  assert.match(source, /setImageMode\(nextImageMode && targetSupportsImage\)/);
  assert.match(source, /\[v2vMode, imageMode, uploadedImageUrls, veoInputMode, applyControlsForModel\]/);
  assert.match(source, /if \(nextImageMode && targetSupportsImage\) \{[\s\S]{0,100}trimImageRefs\(getMaxImagesForVideoInputMode\(m\.id, veoInputMode\)/);
  assert.match(source, /const imageReferenceWarning =[\s\S]{0,180}won't use reference images/);
  assert.match(source, /setRefTrimNotice\(`Kept \$\{kept\} of \$\{uploadedImageUrls\.length\} reference images/);
});

test('VideoStudio clears all image refs before ordinary video input enters default v2v', () => {
  assert.match(source, /const processDroppedVideo = async \(file\) => \{[\s\S]{0,900}setUploadedVideoName\(file\.name\);[\s\S]{0,40}if \(nativeVideoUpload\) \{[\s\S]{0,400}\} else \{[\s\S]{0,40}setUploadedImageUrls\(\[\]\);[\s\S]{0,80}if \(imageMode\) \{[\s\S]{0,60}setImageMode\(false\);[\s\S]{0,80}setV2vMode\(true\)/);
  assert.doesNotMatch(source, /const processDroppedVideo = async \(file\) => \{[\s\S]{0,600}if \(imageMode\) \{[\s\S]{0,80}setUploadedImageUrl\(null\);[\s\S]{0,80}setUploadedImageUrls\(\[\]\)/);
  assert.match(source, /if \(isMotionControlSelection\(selectedModel, v2vMode\)\) \{[\s\S]{0,120}setPromptDisabled\(false\);[\s\S]{0,80}\} else \{[\s\S]{0,160}setUploadedImageUrls\(\[\]\);[\s\S]{0,80}if \(imageMode\) \{[\s\S]{0,60}setImageMode\(false\);[\s\S]{0,80}setV2vMode\(true\)/);
});

test('VideoStudio native video upload skips legacy v2v routing and clears frame refs', () => {
  assert.match(source, /const processDroppedVideo = async \(file\) => \{[\s\S]{0,900}if \(nativeVideoUpload\) \{[\s\S]{0,20}setUploadedImageUrls\(\[\]\);[\s\S]{0,20}setUploadedEndImageUrl\(null\);[\s\S]{0,20}setImageMode\(false\);[\s\S]{0,20}setV2vMode\(false\);[\s\S]{0,20}setPromptDisabled\(false\);/);
  assert.match(source, /setVideoUploadError\("Native video input supports MP4 only"\)/);
  assert.doesNotMatch(source, /alert\("Native video input supports MP4 only"\)/);
});
