const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/components/ImageStudio.jsx'),
  'utf8'
);

test('ImageStudio uses selectedEntriesRef to avoid stale closures', () => {
  assert.match(source, /const selectedEntriesRef = useRef\(\[\]\);/);
  assert.match(source, /selectedEntriesRef\.current = selectedEntries;/);
});

test('ImageStudio has a single commitSelection helper', () => {
  assert.match(source, /const commitSelection = useCallback\(/);
  assert.match(source, /setSelectedEntries\(entries\);/);
  assert.match(source, /selectedEntriesRef\.current = entries;/);
  assert.match(source, /onClear\?\.(\);|\(\);)/);
  assert.match(source, /fireOnSelect\(entries\);/);
});

test('ImageStudio commits selection cohesively after Promise.all() uploads', () => {
  // Verifies we do not commit within the per-file map, but do a single post-Promise.all commit
  assert.match(source, /const uploadedUrls = await Promise\.all\(/);
  assert.match(source, /const baseSelection = selectedEntriesRef\.current;/);
  assert.match(source, /if \(maxImages === 1\) {[\s\S]*?commitSelection\(\[newEntry\], { closePanel: true }\);/);
  assert.match(source, /commitSelection\(\[\.\.\.baseSelection, \.\.\.added\]\);/);
});

test('ImageStudio handleCellClick immediately commits toggles', () => {
  assert.match(source, /commitSelection\(newSelected, { closePanel: true }\);/);
  assert.match(source, /commitSelection\(next\);/);
});

test('ImageStudio handleRemoveFromHistory commits remaining selection', () => {
  assert.match(source, /commitSelection\(next\);/);
});

test('ImageStudio clears child selection when parent initialUrls is empty', () => {
  assert.match(source, /else if \(initialUrls && initialUrls\.length === 0 && selectedEntries\.length > 0\) {[\s\S]*?setSelectedEntries\(\[\]\);\s*selectedEntriesRef\.current = \[\];/);
});

test('ImageStudio maxImages shrink path notifies parent for non-empty trimmed selection', () => {
  assert.match(source, /setSelectedEntries\(trimmed\);\s*selectedEntriesRef\.current = trimmed;\s*if \(trimmed\.length === 0\) \{[\s\S]*?onClear\?\.[\s\S]*?\} else \{[\s\S]*?fireOnSelect\(trimmed\);/);
});

test('ImageStudio native image slot math is primary + maxReferences', () => {
  assert.match(source, /function getNativeImageModelMaxSlotCount\(model\) {/);
  assert.match(source, /return 1 \+ maxReferences;/);
  assert.match(source, /maxImages: getNativeImageModelMaxSlotCount\(m\)/);
  assert.match(source, /setMaxImages\(getNativeImageModelMaxSlotCount\(m\)\)/);
});

test('ImageStudio full multi-select path does not upload one extra file via || 1', () => {
  assert.doesNotMatch(source, /files\.slice\(0,\s*maxImages\s*-\s*currentSelection\.length\s*\|\|\s*1\)/);
  assert.match(source, /const spaceLeft = Math\.max\(0, maxImages - currentSelection\.length\);/);
  assert.match(source, /toUpload = files\.slice\(0, spaceLeft\);/);
});

test('ImageStudio UploadButton enforces native uploads before any legacy uploader fallback', () => {
  assert.match(source, /function UploadButton\(\{ apiKey, maxImages, onSelect, onClear, initialUrls = \[\], uploader, nativeUpload = false \}\)/);
  assert.match(source, /nativeUpload\s*\?\s*async \(file\) => \(await uploadNativeFile\(file\)\)\.url\s*:\s*uploader \|\| \(\(file, onProgress\) => defaultUploader\(apiKey, file, onProgress\)\)/);
  assert.match(source, /<UploadButton[\s\S]*nativeUpload=\{isNativeModelId\(selectedModelId\)\}/);
});
