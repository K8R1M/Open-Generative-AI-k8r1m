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
  assert.match(source, /const OMNI_VIDEO_DISPLAY_RESOLUTION = "720p"/);
  assert.match(source, /function nativeVideoCardResolution\(modelOrId, selectedResolution\)/);
  assert.match(source, /model\?\.provider === "omni"[\s\S]{0,120}model\.resolutions\.length === 0/);
  assert.match(source, /resolution: nativeVideoCardResolution\(item\.modelId \|\| item\.model, item\.resolution \|\| params\.resolution\)/);
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
  assert.match(source, /referenceImagesEnabled \? uploadedImageUrls : uploadedImageUrls\.slice\(0, 1\)/);
  assert.match(source, /nativeInputFromUrl\(u, idx === 0 \? "first-frame" : "reference"\)/);
  assert.match(source, /nativeInputFromUrl\(uploadedEndImageUrl, "last-frame"\)/);
  assert.match(source, /referenceImagesEnabled \? Math\.max\(0, uploadedImageUrls\.length - 1\) : 0/);
  assert.match(source, /referenceDurationSeconds \|\| 8/);
});

test('VideoStudio exposes native Grok I2V before upload without hijacking legacy Grok models', () => {
  assert.match(source, /const nativeGrokI2VDescriptor = NATIVE_I2V_DESCRIPTORS\.find\(\(m\) => m\.id === NATIVE_GROK_IMAGINE_VIDEO_ID\)/);
  assert.match(source, /const t2vPickerModels = nativeGrokI2VDescriptor/);
  assert.match(source, /const generationModels = imageMode \? mergedI2VModels : t2vPickerModels/);
  assert.match(source, /function isNativeI2VOnlyModel\(model\)/);
  assert.match(source, /!model\.tasks\?\.includes\("text-to-video"\)/);
  assert.match(source, /const forceImageMode = !imageMode && isNativeI2VOnlyModel\(nativeModel\)/);
  assert.match(source, /applyControlsForModel\(m\.id, imageMode \|\| forceImageMode, false\)/);
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
  assert.match(source, /onMouseOver=\{\(e\) => e\.currentTarget\.play\(\)\.catch\(\(\) => \{\}\)\}/);
});
