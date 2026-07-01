# Native Media Regression Fix Plan

Branch: `feat/native-grok-imagine-video`
Created: 2026-07-01
Status: amended after GLM 5.2 OpenCode Multica audit, ready for implementation lanes

## User-Reported Regressions To Preserve

Do not drop any of these from the next implementation pass:

1. Image Studio native image generation fails on `19400` for Nano Banana 2 with a reference image.
   - Browser console error:
     - `Native generation failed: 500 Internal Server Error {"error":"NATIVE_MEDIA_ERROR","message":"Native media request failed."}`
     - thrown at `packages/studio/src/nativeMedia.js:407` inside `generateNativeMedia`.
2. Image Studio native image generation also fails with the same `500 Internal Server Error` for Nano Banana Pro.
3. Image Studio native Codex GPT Image 2 also fails with the same `500 Internal Server Error`.
   - Karim noted Codex failure could still be quota-related and should be tested before finalizing that specific root cause.
4. After the server refresh, historical generation prompts are not appearing on generation cards.
   - Cards say `No prompt provided`.
   - Karim states prompts were definitely always provided.
   - Copy prompt cannot work for those cards because the prompt is missing in the UI.
   - Earlier halfway-through testing had prompt copy working.
5. The newly generated Grok Imagine video with 2 reference images succeeded and its prompt is visible.
   - However, the copy prompt button still does not copy that prompt.
6. The missing-prompt issue appears to affect historical image generation library cards.
   - Karim cannot currently verify new native image prompt persistence because native image generation fails.
   - New native image generations must also retain prompts and be copyable after the generation completes and after refresh.
7. On the Video Studio page, multiple historically generated videos render blank/missing thumbnails.
   - Clicking the empty video area shows a browser media error like `No video with supported format and MIME type found`.
   - Those cards still show provider/duration metadata, but the video and prompt are missing.
8. After fixes, the app must be hosted again on `19400` for Karim to test.

## Current Evidence

- Gateway logs during the failed native image attempts show:
  - `real provider requested but no real provider runner is available`
  - stack at `native-media-gateway/exports.js:667`, called from `server.js:237`.
- `server.js:generationOptions()` currently sets `provider.fake` globally to `false` whenever any live provider gate is enabled:
  - `provider: { fake: !(liveVertex || liveCodex || liveGrok) }`
  - This means starting the gateway with `NATIVE_MEDIA_LIVE_GROK=1` can accidentally force real provider mode for Vertex/Codex image jobs even when their own live gates are off.
- `.native-media/jobs.json` completed jobs still contain top-level prompts.
  - Local count check found completed jobs by task all had prompts:
    - `image-to-image`: 18/18
    - `text-to-video`: 10/10
    - `image-to-video`: 13/13
- The proxied library response on `19400` strips `prompt`.
  - `native-media-gateway/server.js` includes `prompt` in `PRIVATE_JOB_FIELDS`.
  - This contradicts the library plan, which requires safe public `prompt` so cards can display and copy it.
- `packages/studio/src/components/ImageStudio.jsx` and `VideoStudio.jsx` both map `prompt: item.prompt || ""`, so server stripping causes `No prompt provided`.
- Video asset requests mostly return `206`, but at least one proxied asset request returned `500` with `failed to pipe response` / `UND_ERR_SOCKET`.
- GLM 5.2 OpenCode audit verified another likely structural playback root cause: the fake/default MP4 stub in `native-media-gateway/exports.js` currently has `ftyp` plus empty `mdat` bytes but no `moov` atom, so browser playback can fail with `No video with supported format and MIME type found` even when MIME/range handling is correct.
- The implementation pass must verify whether each failed historical card is:
  - a fake-stub MP4 with no playable `moov` atom,
  - a bad MIME/meta MP4 asset,
  - a browser range-stream proxy failure,
  - or a stale localStorage entry with a dead URL that the server library no longer returns.

## Fix Plan

### 1. Provider Selection Regression

Fix native generation startup so enabling live Grok does not force Vertex/Codex image jobs into unavailable real-provider mode.

Target files:

- `native-media-gateway/server.js`
- `native-media-gateway/exports.js`
- existing provider tests under `tests/native*Provider*.test.js` and gateway tests

Expected behavior:

- `NATIVE_MEDIA_LIVE_GROK=1` should route Grok video jobs to live Grok.
- The same gateway process should still run Nano Banana 2/Pro through the fake/default path unless `NATIVE_MEDIA_LIVE_VERTEX=1` is also enabled.
- The same gateway process should still run native Codex image through the fake/default path unless `NATIVE_MEDIA_LIVE_CODEX=1` is also enabled.
- If a specific model requests a real provider while its runner is not configured, return a clear public message instead of generic `NATIVE_MEDIA_ERROR`.
- Do not make Codex exact size claims until a live Codex image size smoke verifies dimensions; keep prompt augmentation only.

Likely minimal implementation:

- Replace global `provider.fake = !(liveVertex || liveCodex || liveGrok)` with provider/model-specific fake decision inside the gateway:
  - Grok model + `liveGrok` -> real
  - Vertex image/video model + `liveVertex` -> real
  - Codex image model + `liveCodex` -> real
  - otherwise fake/default
- Keep existing explicit test injection behavior intact.

### 2. Prompt Visibility And Copy Regression

Prompts are safe public library metadata and must be present in server library responses.

Target files:

- `native-media-gateway/server.js`
- `native-media-gateway/exports.js`
- `packages/studio/src/nativeMedia.js`
- `packages/studio/src/components/ImageStudio.jsx`
- `packages/studio/src/components/VideoStudio.jsx`
- `tests/nativeMediaLibraryServer.test.js`
- `tests/nativeMediaLibraryClient.test.js`
- `tests/nativeGatewayLibrary.test.js`

Expected behavior:

- Historical native image and video cards show their stored prompt after refresh.
- Copy prompt works for historical native image cards.
- Copy prompt works for historical native video cards.
- Copy prompt works for newly generated native image/video cards before and after refresh.
- Empty prompt fallback text is allowed only when the server job truly has no prompt.
- Copy button should not silently fail on the Tailscale/IP dev URL.

Likely minimal implementation:

- Remove `prompt` from the generic private field list for library responses, or create route-specific public serializers:
  - generation status responses can stay conservative if needed,
  - library responses must include `prompt`.
- If removing `prompt` from the generic private list, explicitly accept that prompt also becomes visible in generation status/cancel responses. Prefer route-specific serializers if the diff stays small.
- Add a tiny shared copy helper or a visible toast/alert fallback only if the current silent copy path cannot be validated.
- Keep clipboard fallback via temporary textarea.
- Flip the existing gateway library regression that currently asserts prompt absence; the library contract now requires prompt presence while still redacting provider internals.

### 3. Historical Video Card Playback Regression

Verify and fix why some historical Video Studio cards are visible but not playable.

Target files:

- `native-media-gateway/exports.js`
- `native-media-gateway/server.js`
- `packages/studio/src/components/VideoStudio.jsx`
- `tests/nativeMediaLibraryServer.test.js`
- `tests/nativeMediaLibraryClient.test.js`

Expected behavior:

- Video Studio library includes only playable video assets.
- Deleted/tombstoned/missing assets do not render as playable cards.
- Historical video cards use same-origin MP4/WebM URLs with correct `Content-Type`.
- Browser range requests for MP4 return `206` with valid range headers.
- If an old job has missing/dead media, it should be omitted or shown as unavailable, not as a blank playable video card.
- Provider/duration metadata should not be enough to render a playable card when the media asset is missing or wrong MIME.
- Stale localStorage video entries whose URLs are no longer returned by the server library should be pruned or marked local-only/unavailable so they do not render as broken native cards.
- Fake/default video assets should either use a minimal browser-playable MP4 fixture with `moov` metadata, or be excluded/marked unavailable instead of rendered as playable history.

Investigation checks for coding agents:

- Query `/api/native-media/v1/library?kind=video&limit=50` and inspect only structural fields:
  - job id,
  - asset id,
  - URL,
  - asset MIME,
  - prompt presence,
  - deleted/tombstone flags.
- For each blank card, verify whether `meta.json` MIME is video and whether the file exists.
- For each blank card, verify whether the asset is a fake/default MP4 stub missing a `moov` atom.
- Reproduce a range request against a known blank card and confirm response status/headers.

### 4. Tests And Manual Smoke

Required automated tests:

- Gateway provider-selection test:
  - with only `liveGrok=true`, Nano Banana and Codex image requests do not throw `REAL_PROVIDER_UNAVAILABLE`.
  - with only `liveGrok=true`, Grok video still uses live Grok path.
  - exercise `handleNativeRequest` / `POST /api/native-media/v1/generations` with `process.env.NATIVE_MEDIA_LIVE_GROK='1'`, because direct `submitGeneration` calls can bypass `server.js:generationOptions()`.
- Server library test:
  - prompt is present for library items.
  - private fields remain redacted.
  - image/video kind filtering is MIME-based.
  - missing/tombstoned video assets are omitted.
  - gateway library tests no longer assert `prompt === undefined`; they assert the stored prompt is returned.
- Client tests:
  - ImageStudio and VideoStudio server-history mapping preserves prompt.
  - copy prompt invokes clipboard or textarea fallback with the exact prompt.
  - VideoStudio does not render non-video/missing server assets as playable cards.
  - VideoStudio prunes or clearly marks stale localStorage video entries whose URLs are absent from the server library.
- Fake video fixture tests:
  - either the fake MP4 fixture includes playable `moov` metadata, or fake-stub videos are not rendered as playable cards.
- Asset streaming tests:
  - video asset range request returns `206`, `Content-Range`, `Accept-Ranges`, and correct video MIME.

Manual smoke on `19400` after implementation:

1. Restart/host the branch app on `19400`.
2. Confirm historical image prompts display and copy.
3. Confirm historical video prompts display and copy.
4. Confirm a historical blank-video card is either playable or omitted/unavailable with no broken player.
5. Generate Nano Banana 2 with one reference image.
6. Generate Nano Banana Pro with one reference image.
7. Generate native Codex GPT Image 2 if quota/auth allows; if it fails, record whether failure is quota/auth/provider output rather than the old generic unavailable-runner error.
8. Generate Grok Imagine video with two reference images and verify prompt copy works.

## Execution Plan

1. Audit this plan with Multica GLM 5.2 OpenCode and amend only verified findings.
2. Use GPT-5.5 medium coding subagents only for implementation:
   - Gateway/provider lane: provider-specific fake/live selection, public serializers, library/asset tests.
   - Studio/client lane: prompt/copy mapping and video card filtering behavior.
   - Test lane: regression tests and smoke checklist updates.
3. Use GPT-5.5 high code-review subagents after implementation:
   - Gateway/security/provider review.
   - Studio/client regression review.
4. Refresh Graphify after meaningful code changes.
5. Host again on `19400` for Karim after tests and review approval.

## Stop Conditions

- Do not merge to `main` in this phase.
- Do not claim Codex size correctness without live dimension smoke.
- Do not leave the app unhosted after implementation unless the server cannot start.
- Do not omit any user-reported regression from the smoke checklist.
