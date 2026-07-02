# Current Architecture — Factual Map

Verified against branch `feature/omni-v1-adjacent-controls` on 2026-07-02.
Executors: trust this document; do not re-explore the whole repo. Verify only the
specific lines you are about to edit.

## Topology

```
Browser (ImageStudio.jsx / VideoStudio.jsx, tab shell = components/StandaloneShell.js)
  │ fetch, same-origin
  ▼
packages/studio/src/nativeMedia.js            ← client library
  │ /api/native-media/v1/*
  ▼
app/api/native-media/[[...path]]/route.js     ← Next.js catch-all reverse proxy
  │ strips cookie/authorization/x-api-key both ways; pure byte passthrough
  ▼
native-media-gateway/server.js                ← plain node:http, 127.0.0.1:19334
  ▼
native-media-gateway/exports.js               ← job store, validation, import, library
  ▼
provider adapters: omniVideoProvider.js, vertexVideoProvider.js,
  vertexImageProvider.js, grokVideoProvider.js, codexImageProvider.js
  ▼ spawn subprocess (allowlisted env, shell:false)
native-media-gateway/bin/genai-{image,video,omni} (python venv), codex CLI, grok script
```

Durable state: `.native-media/` (shared across worktrees via `NATIVE_MEDIA_ROOT`):
`jobs.json` (all jobs, single file, atomic tmp+rename writes serialized by a promise
queue), `idempotency.json`, `assets/<asset-uuid>/{data.<ext>,meta.json}`,
`uploads/<asset-uuid>/…`, `tmp/<jobId>/…`, `logs/`, `venv/`.

Run surfaces: app is `next dev --port 19400` (feature) / `19300` (main worktree).
Gateway is a separate `node native-media-gateway/server.js` process. **The app dir
uses the Next App Router, so React StrictMode double-invokes effects and state
updaters in dev — the live 19400 environment Karim tests on runs in dev mode.**

## Gateway HTTP API (all under `/api/native-media/v1/` from the browser)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/ready` | liveness/readiness |
| GET | `/capabilities` | `{models: MODELS, constraints: CAPABILITY_CONSTRAINTS, native:true}` |
| GET | `/library?kind=image\|video\|all&limit=&cursor=` | completed jobs, newest first, `{items, nextCursor}` |
| GET | `/generations/:id` | poll one job (`publicJob` shape) |
| GET | `/assets/:id` | stream media bytes, Range-aware |
| POST | `/uploads` | multipart upload → 201 `{assetId, id, url, mime}` |
| POST | `/generations` | create job → 201 publicJob |
| POST | `/library/:id/last-frame` | ffmpeg last-frame → PNG attachment stream (download only, NOT saved as asset) |
| DELETE | `/generations/:id` | cancel running job |
| DELETE | `/library/:id` | soft-delete: tombstones job (`status:'asset_deleted'`), rm -rf asset dir → 204 |

Generation request contract (`validateGenerationRequest` in exports.js):
```
{ modelId, task: 'text-to-image'|'image-to-image'|'text-to-video'|'image-to-video',
  prompt (required), parameters {aspectRatio,durationSeconds,resolution,audio,
  imageSize,quality,seed,mode,effect,temperature,topP},
  inputs: [{kind:'asset', assetId, role:'first-frame'|'last-frame'|'input'|'start-frame'|'end-frame'|'reference'}],
  clientRequestId? (idempotency), displayName? (sanitized) }
```
`publicJob` strips private fields (`outputPath,pid,pgid,detail,*Diagnostics`,
and for omni also `parameters`/`inputs`).

Job statuses: `created → queued → running →` terminal:
`completed | failed | cancelled | INTERRUPTED_PROCESS | OUTCOME_UNKNOWN |
ASSET_UNAVAILABLE | asset_deleted` (casing is inconsistent server-side; the client
lowercases via `normalizeStatus()` before comparing).

Scheduler (`scheduler.js`): per-provider concurrency `{codex:1, grok:1, omni:1,
vertex:2}`; queued jobs' launch options are held in-memory only (lost on restart —
restart settles queued jobs as `OUTCOME_UNKNOWN/STARTUP_QUEUED_NOT_RESUBMITTED`,
never auto-resubmits paid work). Subprocess exit → verify output by magic-byte
sniff + mime match → import into `assets/` (`importOutputToAsset`) → `completed`;
otherwise fail-closed with safe public error codes.

**KNOWN PRE-EXISTING BUG (fix in slice 01):** `TERMINAL_STATUSES` in
`scheduler.js` omits `'asset_deleted'`. On gateway restart, `reconcileJobState`
treats tombstoned jobs as non-terminal and flips them to
`OUTCOME_UNKNOWN/NO_VERIFIED_OUTPUT`, clobbering delete semantics. Confirmed in
live `jobs.json` data.

Fail-closed gating: image tasks and Omni have NO fake path — they run live
(`NATIVE_MEDIA_LIVE_VERTEX/CODEX/GROK/OMNI=1`) or 503 `REAL_PROVIDER_UNAVAILABLE`.
Vertex/grok video may run "fake" (stub bytes) when live flags are off — test use only.
Credential hygiene: `validateCredentialFree()` rejects credential-shaped request
fields; subprocess env is allowlist-built; `GOOGLE_APPLICATION_CREDENTIALS`
forwarded only when `NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS=1`.

No auth anywhere in the native path (loopback-only trust model). No projects,
collections, tags, or folders exist in the data model. Naming today = optional
`displayName`/`downloadName` on the job (sanitized via `cleanDisplayName`, max 120
chars) — write-once at creation, no rename endpoint.

## Frontend

`components/StandaloneShell.js` (459 lines): tab bar (`image`,`video`,`audio`,…),
conditional-renders one studio at a time (tab switch = unmount/remount). Handoff
mechanism `handleGeneratedImageReference(targetStudio, urls)` at lines 108-119:
writes `sessionStorage['nativeGeneratedImageReference:video'|':image']` =
`{urls, source:'generated-image'}`, bumps `referenceHandoffNonce` state (passed as
prop to both studios), switches tab + `router.push`. Branding: logo SVG + word
“OpenGenerativeAI” at lines 341-348.

`packages/studio/src/nativeModels.js` (191 lines): `NATIVE_MODEL_IDS` (7 models),
`NATIVE_MODELS[]` catalog with per-model fields:
`{id, label, provider, kind, tasks[], aspectRatios, imageSizes?, maxReferences?
(image), durationsSeconds?, resolutions?, maxReferenceImages?,
referenceImagesEnabled?, referenceDurationSeconds?, supportsAspectRatio?,
supportsAudioToggle?, supportsLastFrame?}`. Veo refs gated by build-time
`NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES==='true'` (server twin:
`NATIVE_MEDIA_VEO_REFERENCE_IMAGES`). `isSameOriginAssetUrl(v)` = starts with
`/api/native-media/v1/assets/`, no `://`, no leading `//`.
`NATIVE_CAPABILITY_CONSTRAINTS` here manually mirrors `CAPABILITY_CONSTRAINTS`
in `exports.js`; `tests/fixtures/nativeContract.js` pins the shared contract.

Capability snapshot (source of truth for slice 04):

| Model | kind | refs | lastFrame input | audio | notes |
|---|---|---|---|---|---|
| native.vertex.nano-banana-2 | image | 10 | – | – | sizes 1K/512 |
| native.vertex.nano-banana-pro | image | 1 | – | – | sizes 1K/2K |
| native.vertex.veo-3.1 / -fast | video | 3 (flag-gated, else 0) | yes | yes | refs/last-frame force 8s |
| native.vertex.gemini-omni-flash-preview | video | 10 | no | no | 1-10s, no resolution control |
| native.codex.gpt-image-2 | image | 10 | – | – | 1K/2K/4K |
| native.grok.imagine-video | video | 6 | no | no | i2v only, no aspect control |

`packages/studio/src/nativeMedia.js` (505 lines): `generateNativeMedia` (build →
POST → poll 2s / 440s timeout → assert same-origin URL), `uploadNativeFile`,
`listNativeLibrary({kind,limit})`, `deleteNativeLibraryItem`,
`downloadNativeLibraryLastFrame`, `buildNativeRequest`, `normalizeNativeResult`.
Inputs must be native asset refs — URL inputs are rejected client-side and
server-side.

`packages/studio/src/components/VideoStudio.jsx` (2631 lines) — relevant state:
- `uploadedImageUrl` (scalar “first frame” mirror) + `uploadedImageUrls` (list) —
  DUAL state, frequently set together, including **inside functional updaters**
  (impure: `setUploadedImageUrl` is called inside `setUploadedImageUrls(prev=>…)`
  at ~974-978 and ~1194-1198 — a StrictMode/concurrent-rendering hazard).
- Persistence: localStorage `PERSIST_KEY` save-effect (500ms debounce, ~767-815)
  and load-effect (~703-751) restoring model/modes/refs/prompt/history;
  `hasRestored` ref set true after load.
- Handoff consumption effect (~985-996): reads sessionStorage key, calls
  `appendGeneratedImageInputs(payload.urls)` (~951-983) which same-origin-filters
  urls, retargets model if current one isn't multi-ref i2v (decision made against
  the **render-closure** `selectedModel`), sets `imageMode`, prepends refs.
  Removes the sessionStorage key only when append returns true.
- Model switch `handleModelSelect` (~1191-1250): trims or clears refs depending
  on `nextImageMode` and target capability.
- Ref visibility UI (~1968+): multi-thumbnail strip only when
  `imageMode && getMaxImagesForI2VNative(selectedModel) > 2`; otherwise a single
  circle button driven by scalar `uploadedImageUrl`.
- `getMaxImagesForI2VNative(modelId)` = `1 + (maxReferenceImages||0)` for native.

`packages/studio/src/components/ImageStudio.jsx` (2092 lines): history card
actions at ~1726-1751 call `onGeneratedImageReference('image'|'video',
generatedImageReferenceUrls(entry))`; `generatedImageReferenceUrls(entry)`
returns `[entry.url]` only for native, same-origin entries. ImageStudio's own
consumption effect (~1291-1300) works and is in the “keep” list.

## Tests

`tests/*.test.js` run with `node --test` individually (no npm script; run
`node --test tests/<file>` per file). Gateway/provider/client tests are real unit
tests with fixtures. The UI-level tests (`nativeVideoStudioWiring.test.js`,
`nativeGeneratedReferenceHandoff.test.js`, `nativeImageStudioReferenceState.test.js`)
are **regex-over-source** assertions — they verify code text exists, not behaviour.
This is why the handoff bug shipped while tests were green.
`npm run build:studio` is the reliable build check.

## Branding surface (for slice 03 rebrand)

`components/StandaloneShell.js:341-348` (logo + wordmark),
`components/ApiKeyModal.js:42`, `app/layout.js:10-11`,
`app/studio/[[...slug]]/page.js:4`, `app/workflow/[id]/page.js:4`,
`app/workflow/[id]/[tab]/page.js:4`, `app/agents/layout.js:7`,
`app/agents/[agent_id]/page.js:14`, `app/agents/[agent_id]/[conversation_id]/page.js:13`,
`packages/studio/src/components/McpCliStudio.jsx:76`, `electron/main.js:34`,
`index.html:7,9`, `package.json:40,93` (`productName`, deb maintainer).
Public assets: `public/banner.png`, `public/vite.svg`, `public/assets/`.
