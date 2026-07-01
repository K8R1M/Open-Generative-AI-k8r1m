# Grok Imagine Native Video Provider - Context And Flow

Last updated: 2026-06-30

This is the compact-resume context file for adding a server-native Grok Imagine video provider to this fork. Read this first, then read:

- `docs/plans/grok-imagine-video-provider-plan.md`
- `docs/plans/grok-imagine-video-provider-task-list.md`

Implementation is approved for a cleared-context session. The main agent only orchestrates and integrates; native `executor` subagents do the implementation work, and separate native `code-reviewer` subagents are the review gate.

## Objective

Add a native server-side video provider for Grok Imagine via the local terminal wrapper, similar to the current native Vertex and Codex providers:

- Existing native image/video providers: Vertex Nano Banana, Vertex Veo 3.1, Codex GPT Image 2.
- New target provider: Grok Imagine video via local Grok CLI wrapper.
- Required user-facing behavior: choose duration, choose 480p/720p, use prompt, support image-to-video and reference-images-to-video, and return the MP4 to the interface through the existing native asset URL flow.
- Future execution request: use a new branch, test app on port `19400`, then merge only after working.

## Current Working State

- Repo: `/home/k8r1m/Open-Generative-AI`
- Implementation branch: `feat/native-grok-imagine-video`
- Test app port: `19400`
- Current branch at investigation time: `main`
- Working tree at investigation time: clean before plan docs were added
- Graphify graph found at: `graphify-out/graph.json`
- Graphify refresh before implementation: `graphify update . --force` on 2026-06-30, rebuilt `7293` nodes and `7708` edges.
- Graphify refresh after implementation: `graphify update . --force` on 2026-06-30, rebuilt `7477` nodes and `7893` edges.
- Live smoke used app port `19400` with this branch's gateway on `19335` because an older already-running gateway occupied `19334` and did not expose Grok capabilities.
- Live single-image smoke completed job `job-99b8946d-a08d-410c-988a-b204e17f8cee`; returned `/api/native-media/v1/assets/asset-245fb901-3ee6-4e8d-8ddb-48653f320b55`, `video/mp4`, 194676 bytes.
- Live reference-image smoke completed job `job-d8112fce-51e1-427b-b3d8-175e16d2bc31`; returned `/api/native-media/v1/assets/asset-88826ae6-5e17-4feb-9d9c-f2dbb20cb473`, `video/mp4`, 412730 bytes.
- User-facing Video Studio test on `19400` succeeded with `Grok Imagine 1.5 (server-native)` using one uploaded reference image. Karim is next testing a multi-reference video flow.
- Cancel smoke initially found an orphan nested Grok process; `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py` now forwards SIGTERM/SIGINT to the nested Grok process group. Retest job `job-3ae614b0-cf9a-4975-8f20-660b8a253ef2` cancelled with zero lingering wrapper/Grok processes.
- Follow-up asset persistence/delete/copy plan: `docs/plans/native-media-asset-library-delete-copy-plan.md`. It records that `.native-media` must be preserved across merge, native server jobs should hydrate the UI, and DELETE must be jobId-only with server-derived asset paths.
- Graphify facts checked:
  - `generateNativeMedia()` is in `packages/studio/src/nativeMedia.js`.
  - `launchProviderWork()` is in `native-media-gateway/exports.js`.
  - `runVertexVideoProvider()` is in `native-media-gateway/vertexVideoProvider.js`.
  - `runCodexImageProvider()` is in `native-media-gateway/codexImageProvider.js`.

After meaningful code changes, refresh the graph with:

```bash
graphify update . --force
```

Then update this file if the provider flow changes.

## Whole App / Provider Flow Graph

```text
Browser /studio/image or /studio/video
  |
  | keyless native access if native capabilities exist
  v
components/StandaloneShell.js
  |
  v
packages/studio/src/components/ImageStudio.jsx
packages/studio/src/components/VideoStudio.jsx
  |
  | native model catalog and client facade
  v
packages/studio/src/nativeModels.js
packages/studio/src/nativeMedia.js
  |
  | POST /api/native-media/v1/uploads
  | POST /api/native-media/v1/generations
  | GET  /api/native-media/v1/generations/:id
  v
app/api/native-media/[[...path]]/route.js
  |
  | strips cookie / authorization / x-api-key, then loopback proxy
  v
native-media-gateway/server.js
  |
  | generationOptions(): live provider gates or fake provider
  v
native-media-gateway/exports.js
  |
  | validateGenerationRequest()
  | validateInputAssets()
  | submitGenerationUnlocked()
  | launchProviderWork()
  v
native-media-gateway/scheduler.js
  |
  | provider slot cap, subprocess tracking, cancel, timeout,
  | restart reconciliation, output magic-byte verification
  v
Provider adapter
  |
  +-- vertexImageProvider.js -> bin/genai-image -> Vertex AI ADC -> output.png
  |
  +-- vertexVideoProvider.js -> bin/genai-video -> Vertex AI ADC -> output.mp4
  |
  +-- codexImageProvider.js  -> codex exec -> generated_images scan -> output.png
  |
  `-- grokVideoProvider.js -> grok_imagine_video.py -> Grok CLI -> output.mp4
                                                                  |
                                                                  v
                                         .native-media/tmp/<job-id>/grok-output.mp4
                                         .native-media/tmp/<job-id>/grok-output.prompt.txt
                                         .native-media/tmp/<job-id>/grok-output.streaming.jsonl
                                         .native-media/tmp/<job-id>/grok-output.debug.log
  |
  | on subprocess settle
  v
native-media-gateway/exports.js importOutputToAsset()
  |
  v
.native-media/assets/<asset-id>/data.mp4
.native-media/assets/<asset-id>/meta.json
  |
  v
GET /api/native-media/v1/assets/<asset-id>
  |
  v
VideoStudio history card + canvas playback
```

## Current Native Provider Dispatch

```text
native.vertex.nano-banana-2 / nano-banana-pro
  provider: vertex
  kind: image
  adapter: native-media-gateway/vertexImageProvider.js
  wrapper: native-media-gateway/bin/genai-image
  auth: Vertex AI ADC from trusted worker env

native.vertex.veo-3.1 / veo-3.1-fast
  provider: vertex
  kind: video
  adapter: native-media-gateway/vertexVideoProvider.js
  wrapper: native-media-gateway/bin/genai-video
  auth: Vertex AI ADC from trusted worker env

native.codex.gpt-image-2
  provider: codex
  kind: image
  adapter: native-media-gateway/codexImageProvider.js
  wrapper: /home/k8r1m/.local/bin/codex exec
  auth: fixed clean CODEX_HOME, not browser input

planned native.grok.imagine-video
  provider: grok
  kind: video
  adapter: native-media-gateway/grokVideoProvider.js
  wrapper: /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py
  auth: local Grok CLI auth, not browser input
```

Public job responses now strip `prompt` in addition to private diagnostics and local paths.

## Key Local Code References

- `components/StandaloneShell.js`
  - Imports `hasUsableNativeCapabilities` and enables keyless native `image` and `video` tabs.
  - Native media can work without a MuAPI key when native capabilities exist.

- `packages/studio/src/nativeModels.js`
  - Current `NATIVE_MODEL_IDS`: Vertex Nano Banana, Vertex Veo, Codex GPT Image.
  - Current video model fields: `kind`, `tasks`, `aspectRatios`, `durationsSeconds`, `resolutions`, `maxReferenceImages`, `referenceImagesEnabled`, `referenceDurationSeconds`.

- `packages/studio/src/nativeMedia.js`
  - Upload endpoint: `/api/native-media/v1/uploads`.
  - Generation endpoint: `/api/native-media/v1/generations`.
  - Poll timeout: `440000ms`.
  - Input sanitation rejects URL inputs and only allows uploaded native assets.
  - Current video validation is named and messaged around Veo; it must become model-generic for Grok.

- `packages/studio/src/components/VideoStudio.jsx`
  - Native descriptors are generated from `NATIVE_MODELS`.
  - Current native I2V logic uses `referenceImagesEnabled` to decide whether to keep extra images.
  - Current validation has Veo-specific duration and last-frame messages.
  - Current descriptor always sets `lastImageField`, which would wrongly show an end-frame upload for Grok unless made model-specific.

- `app/api/native-media/[[...path]]/route.js`
  - Proxies to `NATIVE_MEDIA_GATEWAY_URL` or `http://127.0.0.1:19334`.
  - Strips hop-by-hop and credential headers, including `cookie`, `authorization`, and `x-api-key`.

- `native-media-gateway/server.js`
  - Default loopback gateway port is `19334`.
  - `generationOptions()` currently has `NATIVE_MEDIA_LIVE_VERTEX` and `NATIVE_MEDIA_LIVE_CODEX`; add `NATIVE_MEDIA_LIVE_GROK`.
  - `publicJob()` hides private job fields and surfaces safe public messages.

- `native-media-gateway/exports.js`
  - Owns canonical gateway `MODELS`, credential-free request validation, upload save, job creation, provider dispatch, and output import.
  - `importOutputToAsset()` imports verified provider files into `.native-media/assets/<asset-id>/data.<ext>` and returns same-origin URLs.
  - `launchProviderWork()` currently dispatches Vertex image, Vertex video, Codex image, then fake provider.

- `native-media-gateway/scheduler.js`
  - Current provider caps: `{ codex: 1, vertex: 2 }`.
  - Add `grok: 1` because the Grok CLI/quota path should be serialized.
  - Scheduler verifies output by magic bytes and imports through gateway.
  - It tracks subprocesses, handles cancel, timeout, and restart reconciliation.

- `native-media-gateway/vertexVideoProvider.js`
  - Best existing pattern for video provider adapter:
    - resolve uploaded asset IDs to local files
    - validate model/task/duration/resolution/roles/MIME/bytes
    - write job-local `output.mp4`
    - spawn wrapper with `shell:false`
    - register with scheduler
    - provide `expectedMime: video/mp4`
    - redact provider text before persistence

- `native-media-gateway/codexImageProvider.js`
  - Best existing pattern for local CLI provider:
    - fixed binary and fixed clean home
    - no browser-controlled auth/path injection
    - env allowlist/denylist
    - private diagnostics, no raw paths to browser

## Official And Local Grok Findings

Official xAI docs checked:

- Imagine overview: https://docs.x.ai/developers/model-capabilities/imagine
- Video generation overview: https://docs.x.ai/developers/model-capabilities/video/generation
- Image-to-video: https://docs.x.ai/developers/model-capabilities/video/image-to-video
- Reference-to-video: https://docs.x.ai/developers/model-capabilities/video/reference-to-video
- xAI `llms.txt`: https://docs.x.ai/llms.txt

Local Grok wrapper checked:

- Skill: `/home/k8r1m/.codex/skills/grok-imagine-video/SKILL.md`
- Wrapper: `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`
- Grok CLI: `/home/k8r1m/.local/bin/grok`

Confirmed local wrapper interface:

```bash
python3 /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py \
  --mode image-to-video \
  --image /abs/path/start.png \
  --prompt "..." \
  --output /abs/path/output.mp4 \
  --duration 6 \
  --resolution 480p \
  --overwrite
```

```bash
python3 /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py \
  --mode reference-to-video \
  --ref start-composition=/abs/path/start.png \
  --ref reference-1=/abs/path/ref.png \
  --prompt "..." \
  --output /abs/path/output.mp4 \
  --duration 10 \
  --resolution 720p \
  --overwrite
```

Wrapper constraints:

- Modes: `image-to-video` or `reference-to-video`.
- `image-to-video` requires exactly one `--image`.
- `reference-to-video` requires at least two `--ref role=/abs/path` entries.
- Duration choices: `6` or `10`.
- Resolution choices: `480p` or `720p`.
- Output must be absolute `.mp4`.
- Input extensions supported by wrapper: `.png`, `.jpg`, `.jpeg`, `.webp`.
- It creates a temp directory under `/tmp` to avoid running Grok from a large repo.
- It writes:
  - `<output>.prompt.txt`
  - `<output>.streaming.jsonl`
  - `<output>.debug.log`
- It verifies output with `ffprobe`.
- It treats a valid MP4 as authoritative even if Grok returns nonzero or times out after creating the file.
- On success, the wrapper prints JSON containing fields such as `ok`, `output`, `warnings`, and log paths. It does not use the Vertex `MEDIA:` stdout marker.

Important doc/wrapper mismatch:

- Official image-to-video docs show `grok-imagine-video-1.5`.
- Official general video/reference-to-video docs show `grok-imagine-video`.
- Official reference-to-video docs indicate:
  - reference inputs use one mode per request, separate from image-to-video
  - max reference inputs are seven images
  - reference-image duration is capped at ten seconds
  - `grok-imagine-video-1.5` does not support reference-to-video in the REST API
- Official video-generation docs allow 1-15 second duration and 480p/720p/1080p generally, but note 1080p is only for `grok-imagine-video-1.5` image-to-video.
- The local wrapper and skill describe "Grok Imagine 1.5" for both image-to-video and reference-images-to-video through the Grok CLI `/imagine-video` workflow.
- The repo feature should be described as "Grok Imagine Video via local Grok CLI wrapper" and should not claim REST API parity for `grok-imagine-video-1.5` reference mode.
- The first implementation should follow local wrapper limits (`6` or `10`, `480p` or `720p`, local files only), even where official REST supports broader values.

## Planned Grok Model Contract

Recommended catalog ID:

```text
native.grok.imagine-video
```

Recommended label:

```text
Grok Imagine Video (Server - Grok CLI)
```

Reason for not hard-coding `1.5` into the catalog ID:

- The local wrapper is the actual integration surface.
- Official xAI docs split `grok-imagine-video-1.5` image-to-video from `grok-imagine-video` reference-to-video.
- A single UI option needs to support both single-image and reference-images workflows without falsely claiming REST `1.5` reference support.
- If product naming must mention 1.5, prefer explanatory UI copy or metadata, not a REST-model-equivalent ID.

Recommended tasks:

```text
image-to-video only
```

Reference-images-to-video should be represented inside the same `image-to-video` task by passing multiple image inputs:

- 1 input image -> wrapper `--mode image-to-video --image <path>`.
- 2-7 total input images -> wrapper `--mode reference-to-video --ref role=<path> ...`.

Recommended constraints:

- `durationsSeconds: [6, 10]`
- `resolutions: ["480p", "720p"]`
- `maxReferenceImages: 6` so UI max images is `1 + 6 = 7` total images.
- `supportsAspectRatio: false` because the local wrapper has no aspect-ratio flag; image shape/reference set drives composition.
- `supportsAudioToggle: false` because the local wrapper has no audio flag.
- `supportsLastFrame: false` because wrapper reference endpoint accepts end-composition guidance, not the same strict Veo last-frame control.

## File Naming And Save Locations

Use deterministic job-local names, then import into the existing asset store:

```text
.native-media/uploads/<asset-id>/data.<ext>
  Uploaded browser images; already handled by gateway.

.native-media/tmp/<job-id>/grok-output.mp4
  Provider working output path passed to wrapper --output.

.native-media/tmp/<job-id>/grok-output.prompt.txt
.native-media/tmp/<job-id>/grok-output.streaming.jsonl
.native-media/tmp/<job-id>/grok-output.debug.log
  Wrapper artifacts; private server-side diagnostics.

.native-media/tmp/<job-id>/grok-diagnostics.json
  Optional adapter-written redacted summary for failures.

.native-media/assets/<asset-id>/data.mp4
.native-media/assets/<asset-id>/meta.json
  Final imported asset after scheduler verification.

/api/native-media/v1/assets/<asset-id>
  Browser-facing same-origin URL.
```

Never expose local filesystem paths, prompt text, auth paths, raw stdout/stderr, or raw debug logs to the browser.

## Architecture Decision Notes

Use existing native media flow instead of creating a separate Grok route:

- It preserves keyless native tab behavior.
- It preserves credential stripping at the Next proxy.
- It preserves job polling/cancel/timeout/restart semantics.
- It preserves same-origin asset URLs and history/canvas behavior.
- It avoids browser access to Grok credentials or filesystem paths.

Add a provider adapter rather than putting Grok-specific logic in `exports.js`:

- `exports.js` should only route to the provider adapter and persist public/private job state.
- `grokVideoProvider.js` should own Grok modes, argv building, input constraints, and error classification.

Default to the existing provider adapter pattern. Add shared provider utilities only if the Grok implementation creates concrete duplication in code touched by this feature:

- asset resolution and role classification pattern
- job workspace/path naming
- env allowlist/denylist builder
- bounded stdout/stderr capture
- redaction and diagnostics writing

Do not over-abstract provider-specific generation behavior:

- Veo owns Vertex model aliases, aspect ratio, audio toggle, last-frame, reference duration requirements, and Vertex errors.
- Grok owns wrapper modes, role-labeled refs, duration/resolution limits, CLI/ffprobe behavior, and Grok log/error patterns.

## Cleared Session Startup Instructions

If a later session starts fresh:

1. Read `AGENTS.md` if present, otherwise use the prompt-provided AGENTS instructions.
2. Read the latest `codex-handoffs/*-codex-preserve.json`.
3. Read `docs/plans/README.md`.
4. Read this file.
5. Read `docs/plans/grok-imagine-video-provider-plan.md`.
6. Read `docs/plans/grok-imagine-video-provider-task-list.md`.
7. Confirm branch and tree with `git status --short --branch`.
8. Work on `feat/native-grok-imagine-video`.
9. Use Graphify for orientation before code work and refresh it again after meaningful code changes with `graphify update . --force`.
10. Merge is blocked until tests, `19400` smoke, cancel smoke, no-leak checks, Graphify refresh, and separate `code-reviewer` approval pass.
