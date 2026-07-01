# Omni V1 Implementation Plan

Status: amended after GLM/Grok adversarial audits; exact Gemini General run returned no usable audit output and was cancelled.
Branch: `feature/omni-v1-native-media`.
Test port: `19400`.
Production target after merge: systemd app on `19300`.

## Goal

Add Gemini Omni as a native video provider through the existing native media gateway, then add only the low-complexity adjacent controls Karim chose for this first branch.

The branch must preserve existing working native media behavior: Grok video, Nano Banana 2/Pro image, native Codex image, prompt copy, delete, history hydration, and existing `.native-media` assets.

## Locked Scope

1. Gemini Omni native video provider.
2. Minimal Omni UI/input handling for its real supported modalities.
3. Multi-select generated assets for batch delete only.
4. Server-backed last-frame download for generated videos.
5. Use a generated image as a reference/input in Image Studio or Video Studio.
6. Per-studio output naming prefix/counters with durable display/download metadata.

## Explicitly Deferred

- Projects, References, Characters, collection pages, and bulk add-to-project/reference.
- Sidebar/library redesign, Uploads tab, and prompt templates.
- Generated-video-as-reference direct actions.
- Auto-importing extracted last frames into uploads or prompt inputs.
- Renaming native asset files on disk.
- Temperature/topP/system-instruction UI for Omni.

## Product Decisions

- Omni V1 supports uploaded image refs and uploaded MP4 refs where the provider accepts them.
- Generated videos are not directly addable as prompt refs in this branch; Karim will download/re-upload for now.
- Generated images can be sent to Image Studio and Video Studio as prompt/reference inputs.
- Last-frame V1 is download-only: click on a generated video, extract the final frame server-side, and trigger a browser download.
- Naming controls do not live in the prompt box. Put the per-studio naming input in the existing empty right-side screen area.
- Naming is per studio, not per provider. Image Studio shares one image naming prefix/counter; Video Studio shares one video naming prefix/counter.
- Naming pattern is base plus counter, e.g. `raizan-box-001.mp4`.
- Server asset filenames may remain `data.png`/`data.mp4`; store assigned display/download names in durable metadata.
- Batch delete is limited to deleting selected generated assets. No bulk add-to-project/reference in this branch.

## Omni Evidence

Current working external script surface:

- `/home/k8r1m/merlin/bin/genai-omni`
- `/home/k8r1m/.codex/skills/generate-media/sub-skills/generate-omni/SKILL.md`

Observed from Karim's completed tests and wrapper metadata:

- 30 successful runs, 8 failed runs, 2 stale outputs in the local test evidence.
- Successful runs included up to 7 image inputs and 1 video input.
- Wrapper supports up to 10 image refs and 3 video refs.
- Wrapper accepts durations up to 10 seconds and aspect ratios `16:9` / `9:16`.
- Wrapper prints `MEDIA:<path>` and `METADATA:<path>`, matching the gateway-friendly pattern used by other repo-local scripts.

Official-doc facts verified during planning:

- Model: `gemini-omni-flash-preview`.
- Status: preview.
- Release date: 2026-06-30.
- Discontinuation date listed by docs: 2027-06-30.
- Location: `global`.
- Inputs: prompt plus image/video inputs; documented limits include 10 images, 3 videos, and 10 second video input max.
- Output: MP4 video, 720p, aspect ratios `16:9` and `9:16`.
- Sampling defaults: temperature `1.0`, topP `0.95`.
- System instructions and chat are not supported.

Re-verify these facts immediately before implementation if Google changes the preview docs.

## Existing App Pattern To Reuse

The app runtime should not call a Codex skill. It should use repo-local scripts through the existing native media gateway.

Existing pattern:

- App submits jobs through `/api/native-media/v1/generations`.
- Gateway selects a provider and spawns fixed wrapper scripts.
- Vertex image provider maps native image IDs to `native-media-gateway/bin/genai-image`.
- Vertex video provider maps native video IDs to `native-media-gateway/bin/genai-video`.
- Wrappers use Google GenAI SDK with Vertex auth and trusted ADC.
- Wrappers write job-local media and print `MEDIA:<path>`.
- Gateway scheduler imports output into `.native-media/assets`, stores job metadata, hydrates history, and serves same-origin asset URLs.

Key files to trace before editing:

- `native-media-gateway/exports.js`
- `native-media-gateway/server.js`
- `native-media-gateway/vertexImageProvider.js`
- `native-media-gateway/vertexVideoProvider.js`
- `native-media-gateway/bin/genai-image`
- `native-media-gateway/bin/genai-video`
- `packages/studio/src/nativeModels.js`
- `packages/studio/src/nativeMedia.js`
- `packages/studio/src/components/ImageStudio.jsx`
- `packages/studio/src/components/VideoStudio.jsx`
- `components/StandaloneShell.js`

## Implementation Plan

### Phase 0: Fresh Trace And Guardrails

1. Refresh Graphify: `graphify update . --force`.
2. Use `graphify query` for the native generation flow and gallery action flow.
3. Narrow-read the files listed above with `rg`, `sed`, and `nl`.
4. Confirm the current branch/worktree and keep unrelated dirty files untouched.
5. Verify current environment still preserves `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, shared `NATIVE_MEDIA_ROOT`, and the Omni live gate chosen in Phase 1.
6. Confirm current `gemini-omni-flash-preview` behavior against the repo-local wrapper and current official docs before any code change.
7. Trace both studios' right-side layout and name the exact container where the naming input will mount.

Stop if the trace shows the active `/studio` route is not using `packages/studio`.

### Phase 1: Gemini Omni Provider First

1. Copy/adapt the proven Omni wrapper contract into `native-media-gateway/bin/genai-omni`.
2. Use a sibling Omni provider path, not the Veo provider: `native-media-gateway/omniVideoProvider.js` with `isOmniVideoModel()` and `liveOmniEnabled()`.
3. Use provider key `omni` for scheduler/dispatch ownership while keeping the model id namespaced as `native.vertex.gemini-omni-flash-preview` for user-facing catalog consistency.
4. Add `NATIVE_MEDIA_LIVE_OMNI=1` as the live gate, parallel to `NATIVE_MEDIA_LIVE_VERTEX`, `NATIVE_MEDIA_LIVE_CODEX`, and `NATIVE_MEDIA_LIVE_GROK`.
5. Extend `native-media-gateway/server.js:generationOptions()` with `liveOmni`, include it in `real`, and prevent video jobs from silently falling back to fake output when the selected native provider is unavailable.
6. Add an Omni dispatch branch in `native-media-gateway/exports.js` runJob, gated on `options.liveOmni === true`, `omniVideoProvider.liveOmniEnabled()`, and `omniVideoProvider.isOmniVideoModel(clean.modelId)`.
7. Add an `omni` cap to `native-media-gateway/scheduler.js:PROVIDER_CONCURRENCY`; use cap `1` unless provider docs/testing justify `2`.
8. Register `native.vertex.gemini-omni-flash-preview` in:
   - `native-media-gateway/exports.js`
   - `packages/studio/src/nativeModels.js`
9. Update `tests/nativeModelCatalog.test.js` for the new model count/namespace and add assertions that the Omni model resolves as a native video model with the expected tasks.
10. Map prompt, image refs, uploaded MP4 refs, duration, and aspect ratio to the wrapper's actual argv/API contract.
11. Reuse the shared scheduler/import/library flow so output hydration, deletion, and downloads remain native-media behavior.
12. Fail visibly if the provider call fails. Never create a gallery card for fake or missing provider output.
13. Document `NATIVE_MEDIA_LIVE_OMNI=1` in the native media README/runtime notes and preserve it in systemd/test-port launch configuration.

Validation before proceeding:

- Unit/provider test for Omni request mapping and `MEDIA:` parsing.
- Gateway test that Omni jobs are registered and imported like other native video jobs.
- Gateway test that Omni without `NATIVE_MEDIA_LIVE_OMNI=1` fails visibly instead of minting fake video.
- One real smoke generation on test port `19400` if credentials are available.

### Phase 2: Batch Delete

1. Add selection state in the active gallery components for generated image and video cards.
2. Add a compact checkbox/select affordance at the top-left of each selectable generated asset.
3. Add a bulk delete command visible only while there is a selection.
4. Confirm once before deletion.
5. Loop selected native `jobId`s through the existing `deleteNativeLibraryItem(jobId)` helper.
6. Filter successful deletions from local history and leave failed items visible with an error.

Do not add bulk add-to-reference/project in this phase.

Validation:

- Existing single delete still works.
- Batch delete removes selected server assets and UI cards.
- Partial failure does not remove failed cards.

### Phase 3: Last-Frame Download

1. Add a deterministic repo-local helper script that takes a source video path and output image path.
2. Use `ffprobe`/`ffmpeg` to extract the true final frame at source quality.
3. Add gateway route:

```text
POST /api/native-media/v1/library/:jobId/last-frame
```

4. Add the explicit `handleNativeRequest` branch for `resource === 'library' && id && parts[2] === 'last-frame'`; the current route table only has `GET library`, `GET generations/:id`, `GET assets/:id`, and `DELETE library/:id`.
5. Resolve `jobId` server-side through a read-only gateway function, reject missing/deleted/non-video/non-completed jobs, and derive the video path only from trusted job metadata.
6. Reuse the existing safe asset-root path guard pattern where available; otherwise add one narrow helper that resolves under `.native-media/assets` and rejects traversal/symlinks.
7. Run the helper with fixed argv and `shell:false`.
8. Stream the PNG with `Content-Disposition: attachment`, using the metadata display/download basename when present.
9. Add a video-card action gated to completed native video entries.
10. Trigger browser download from the blob/response and keep the card unchanged on failure.

Validation:

- Rejects missing, deleted, non-video, local-only, traversal, and invalid job cases.
- Helper has a small runnable self-check or focused test fixture.
- Browser download is named from metadata when present.

### Phase 4: Generated Image To Studio Reference

1. Add image-card actions:
   - Add to Image Studio reference.
   - Add to Video Studio reference.
2. Support same-origin native generated image assets only in V1.
3. Use a minimal `sessionStorage` handoff key per target studio, e.g. `{ urls: [...], source: 'generated-image' }`.
4. Add a small `StandaloneShell` callback prop for studio switching; source card actions write the handoff then ask the shell to switch to Image Studio or Video Studio.
5. Image Studio consumes the handoff once on mount and appends the asset URL to existing image/reference inputs.
6. Video Studio consumes the handoff once on mount and appends the asset URL to existing image inputs.
7. Remove the handoff key after successful consumption so reloads or React double-mounts do not duplicate refs.
8. Do not include generated video references in this branch.

Validation:

- Existing prompt/input state is appended to, not replaced.
- Remote legacy image URLs still require manual download/upload.
- Navigation between studios consumes the handoff once and does not duplicate refs on reload.
- Existing persisted `uploadedImageUrls` hydration is preserved when the handoff appends.

### Phase 5: Per-Studio Naming Metadata

1. Add per-studio naming field in the empty right-side screen area, not inside the prompt box.
2. Persist:
   - active prefix/base per studio,
   - counters by prefix/base per studio,
   - computed display/download basename per generated job.
3. Keep Image Studio and Video Studio counters separate.
4. When submitting a native generation, compute the next basename and send it as optional request metadata.
5. Use request field `displayName` outside `parameters`; do not hide it inside the prompt or rely on ad hoc parameter keys.
6. Pass `displayName` through `packages/studio/src/nativeMedia.js:buildNativeRequest()` and gateway validation with a conservative filename-safe character policy.
7. Store the basename on the native job record after Phase 0 confirms `jobs.json` is the right owner; if not, use one narrow sidecar metadata file under the same job/store ownership boundary.
8. Return `displayName` through `listLibrary` / `getGeneration` hydration and use it in gallery entries.
9. Use metadata basename for normal downloads, last-frame downloads, and future display surfaces.
10. Do not rename files under `.native-media/assets`.

Validation:

- `raizan-box` can produce `raizan-box-001`, `raizan-box-002`, etc.
- Switching to another prefix starts or continues its own counter.
- Returning to an old prefix continues from the last used counter.
- Image and video studios do not share counters.
- Existing historical items without metadata still download with current fallback filenames.
- Reasonable user prefixes do not trip the credential boundary scanner.

## Test Plan

Run focused tests first, then build:

```bash
node --test tests/nativeVertexImageProvider.test.js
node --test tests/nativeVertexVideoProvider.test.js
node --test tests/nativeGrokVideoProvider.test.js
node --test tests/nativeCodexImageProvider.test.js
node --test tests/nativeModelCatalog.test.js
node --test tests/nativeMediaLibraryClient.test.js
node --test tests/nativeMediaLibraryServer.test.js
node --test tests/nativeGatewayLibrary.test.js
node --test tests/nativeGatewayPayloads.test.js
node --test tests/nativeUploadAssets.test.js
node --test tests/nativeVideoStudioWiring.test.js
node --test tests/nativeRouteVersioning.test.js
node --test tests/nativeImageStudioReferenceState.test.js
node --test tests/nativeCredentialBoundary.test.js
node --test tests/nativeStoreRoot.test.js
node --test tests/nativeSchedulerRecovery.test.js
npm run build:studio
```

Add focused tests as needed:

- `tests/nativeOmniVideoProvider.test.js`
- `tests/nativeLastFrameExtraction.test.js`
- `tests/nativeGeneratedReferenceHandoff.test.js`
- `tests/nativeNamingMetadata.test.js`

Manual smoke on `19400`:

1. Existing Grok video generation still works.
2. Existing Nano Banana 2/Pro image generation still works.
3. Existing native Codex image generation still works.
4. Existing prompt copy works.
5. Existing single delete works.
6. Existing history hydration works.
7. Existing `.native-media` assets remain readable.
8. Gemini Omni text-to-video works.
9. Gemini Omni image/video input path works where docs and credentials support it.
10. Batch delete works for multiple image/video generated assets.
11. Last-frame download produces a valid PNG.
12. Generated image can be sent to Image Studio and Video Studio as a reference.
13. Per-studio naming appears in download filenames and survives hydration.

## Rollback And Recovery

- Keep this work on `feature/omni-v1-native-media` until user testing passes on `19400`.
- Do not run clean commands that remove ignored `.native-media`.
- If Omni fails because preview API behavior changed, set `NATIVE_MEDIA_LIVE_OMNI=0` and/or disable only the Omni model registration while preserving adjacent providers. Do not let Omni fall back to fake output.
- If naming metadata migration fails, keep reading old jobs without metadata and fall back to current filename generation.
- If batch delete partially fails, report failures and leave failed cards visible.
- If last-frame extraction fails, do not mutate or delete the source video.

## Audit Instructions

Before implementation, run adversarial Multica audits against this plan with:

- GLM 5.2 OpenCode.
- Gemini 3.5 Flash General.
- Grok 4.3 General.

Auditors should look for missing requirements, contradictions, omissions, inaccurate provider assumptions, bad ownership boundaries, duplicate paths, unclear UI state flow, security/path risks, and regression risk to existing native media paths.

After audits return, verify each material finding against code/docs/evidence before amending this plan. Do not accept audit claims at face value.
