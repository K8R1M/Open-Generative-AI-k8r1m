# Omni V1 Research Log

Use this file for durable tracing notes before writing the actual plan.

## Questions To Answer

- How do existing Nano Banana and Veo 3.1 Vertex paths call reusable scripts or helpers?
- How hard is Omni V1 if it follows that path?
- How hard is generated-asset multi-select with batch delete only?
- How hard is last-frame download using the existing plan?
- How hard is generated-image-to-reference for Image Studio and Video Studio?
- How hard is per-studio naming with prefix-specific `v001` counters?

## Findings

### Existing Vertex/Nano Banana/Veo Pattern

- Runtime does not call a Codex skill. The app submits native-media jobs through `/api/native-media/v1/generations`; the gateway chooses the provider and spawns fixed repo-local wrapper scripts.
- Native model IDs are registered in both:
  - `native-media-gateway/exports.js`
  - `packages/studio/src/nativeModels.js`
- Vertex image models route through `native-media-gateway/vertexImageProvider.js`, which maps native IDs to `native-media-gateway/bin/genai-image`.
- Vertex video models route through `native-media-gateway/vertexVideoProvider.js`, which maps native IDs to `native-media-gateway/bin/genai-video`.
- The wrappers use Google GenAI SDK with Vertex auth, normalize trusted ADC, write a job-local output file, and print `MEDIA:<path>`.
- The gateway registers the subprocess with the shared scheduler, verifies the output MIME, imports it into `.native-media/assets`, and exposes same-origin asset URLs.
- The useful "skill" role for Omni is documentation/reusable operator knowledge. App runtime should reuse scripts/helpers directly, not call a skill.

Key files:

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

### Gemini Omni V1

- Do not inspect `/home/k8r1m/merlin/Projects/omni tests/` until Karim says the running tests are finished.
- Likely app shape: add a native Omni model to the existing native media catalogue and route it through the same gateway/scheduler/media-library path.
- Working script surface found:
  - Skill doc: `/home/k8r1m/.codex/skills/generate-media/sub-skills/generate-omni/SKILL.md`
  - Wrapper: `/home/k8r1m/merlin/bin/genai-omni`
- The wrapper already matches the useful native-media shape: Vertex ADC, fixed model `gemini-omni-flash-preview`, MP4 output, metadata/debug JSON, `MEDIA:<path>`, and `METADATA:<path>`.
- Current wrapper contract:
  - API: `client.models.generate_content`, not `generate_videos`.
  - Output model: `gemini-omni-flash-preview`.
  - Location default: `global`.
  - Inputs: prompt, up to 10 image references, up to 3 video references.
  - Duration: 1-10 seconds.
  - Aspect ratios: `16:9`, `9:16`.
  - Audio files are blocked; generated audio in output may be promptable.
  - Prompt is sent exactly as written.
- Preferred lazy implementation after tests finish:
  - Copy/adapt the working wrapper contract into the repo-local native media gateway path so systemd does not depend on Merlin test paths.
  - Add a narrow `omniVideoProvider.js` if Omni needs separate validation/input mapping from Veo.
  - Do not widen Veo-specific `vertexVideoProvider.js` unless Omni truly shares the same validation and script flags.
- Must verify actual Omni model/API name, supported modalities, input MIME/types, parameter names, and Vertex project availability from Karim's tests and official docs before planning.
- Expected risk: medium until Omni API details are known; low/medium if it reuses the same GenAI/Vertex output pattern as Veo.

### Multi-Select Batch Delete

- Current single delete is already server-backed in `packages/studio`:
  - `packages/studio/src/nativeMedia.js` has `deleteNativeLibraryItem(jobId)`.
  - `ImageStudio.jsx` and `VideoStudio.jsx` already derive `jobId`, confirm, delete, and filter local history.
  - `native-media-gateway/server.js` routes `DELETE /api/native-media/v1/library/:jobId`.
  - `native-media-gateway/exports.js` tombstones the job and removes the generated asset directory.
- Minimal path: frontend selection state plus one bulk-delete handler that loops selected `jobId`s through the existing delete helper, then filters local history.
- Keep V1 to bulk delete only. Do not add bulk add-to-project/reference in this branch.
- Active `/studio` uses `components/StandaloneShell.js`, which imports studios from the `studio` package. Therefore `packages/studio` is the relevant first-branch path.
- Risk: easy/medium. The backend is already done; the work is shared frontend selection state and UI polish in the active studio package.

Useful tests:

- `node --test tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js tests/nativeGatewayLibrary.test.js`
- `npm run build:studio`

### Last-Frame Download

- Existing plan still broadly fits: `docs/plans/native-video-last-frame-download-plan.md`.
- `ffmpeg` and `ffprobe` are present on this host.
- V1 decision: click a generated-video card button, run deterministic server extraction, and auto-download the resulting image to the laptop.
- Do not auto-import the extracted frame into Uploads or prompt inputs in V1. That belongs with the later Uploads sidebar/library phase.
- Add a deterministic repo-local helper script first. It should take a video path and output path, extract the true final frame at source quality, and fail visibly. The gateway endpoint should call this helper with fixed argv and `shell:false`.
- The smaller API path is a gateway-side streamed PNG attachment, not minting a new native asset.
- Add a route under the existing native gateway/proxy path, resolve `jobId`, reject missing/deleted/non-video jobs, resolve the generated asset, call the helper script, and stream the PNG as an attachment.
- UI button belongs in `VideoStudio.jsx` video card actions and should be gated to completed video entries.
- Risk: medium because it needs a new endpoint, route contract update, and tests.

Useful tests:

- `node --test tests/nativeVideoStudioWiring.test.js`
- `node --test tests/nativeRouteVersioning.test.js`
- `node --test tests/nativeGatewayLibrary.test.js`
- `node --test tests/nativeMediaLibraryServer.test.js`
- Add a focused last-frame endpoint test.

### Generated Image To Studio Reference

- Backend/native request shape already supports this. `packages/studio/src/nativeMedia.js` accepts same-origin native asset URLs and roles such as `input`, `first-frame`, and `reference`.
- V1 includes generated image -> Image Studio reference and generated image -> Video Studio reference.
- The missing piece is UI/state handoff from a generated image card into the target studio's existing input state:
  - Image Studio: append to `uploadedImageUrls`.
  - Video Studio: append to `uploadedImageUrls` for image-to-video/reference image input.
- The smallest cross-studio path is a `sessionStorage` handoff payload consumed on target studio mount, matching existing shell handoff patterns.
- Do not include generated video references in this branch.
- Risk: easy inside one studio, medium for cross-studio because `StandaloneShell` currently mounts studios without this handoff prop.

Useful tests:

- `node --test tests/nativeUploadAssets.test.js tests/nativeMediaLibraryClient.test.js tests/nativeGatewayPayloads.test.js`
- `node --test tests/nativeVertexImageProvider.test.js tests/nativeVertexVideoProvider.test.js`
- `npm run build:studio`

### Per-Studio Naming

- Current download filenames are synthesized in UI from entry IDs:
  - Image Studio: `muapi-${entry.id || idx}.jpg`
  - Video Studio: `video-${entry.id || idx}.mp4`
- Server storage is job/asset based and has no filename metadata layer today.
- Per-studio prefixes fit the current state shape because Image Studio and Video Studio each have their own persisted browser state blob.
- V1 decision: the actual file on disk may stay as `data.png`/`data.mp4`, but the user-assigned name must be saved as durable metadata so future downloads, References, Projects, and library views can display the intended name.
- Minimal durable path to investigate in planning:
  - Add per-studio `activePrefix` and `countersByPrefix` in existing studio state.
  - When submitting a native generation, compute a display/download basename such as `PREFIX-v001`.
  - Persist that basename on the native job record, not by renaming the asset file.
  - Library hydration should carry that name back to the UI and download buttons should use it.
- Avoid a separate database in V1 if `jobs.json` can carry this metadata cleanly. Add a separate metadata JSON only if job records are the wrong ownership boundary.
- Risk: medium because this touches generation request metadata, native job persistence, library hydration, and download UI.

Useful tests:

- `node --test tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js`
- Manual smoke: generate or hydrate one image and one video, change prefixes, verify each studio continues its own counter.

### First-Branch Ease Ranking

1. Omni provider: required first; difficulty depends on final Omni script/API details.
2. Batch delete: easiest adjacent UI if implemented in `packages/studio` only.
3. Generated image to Image Studio and Video Studio reference: medium because cross-studio handoff is included.
4. Last-frame download: medium; useful and feasible, but needs a gateway endpoint.
5. Naming metadata: medium; include only the minimal durable download/display name path, not asset renaming.

### Deferred For Later Branches

- Projects, References, Characters, and collection pages.
- Bulk add to project/reference.
- Sidebar/library redesign.
- Prompt templates and uploads tab.
- Generated video references.
- Auto-importing extracted last frames into Uploads or prompt inputs.
- Asset file renaming on disk.
