# Gate A Correction Plan

Author: Fable, 2026-07-02, after full root-cause investigation of Karim's Gate A
feedback (`gate-a-karim-testing-feedback.md`). Approved scope: **full fix**
including cross-tab polling and video card rework, per Karim's decisions
(sticky naming + auto-suffix; keep-model + trim + warn; Veo reference images ON;
full scope before shipping 19300).

**Executors: GPT 5.5 High (orchestrator, slices C0/C1/C3), GLM 5.2 (slice C2).**
Same global rules as `00-README.md` — implement, do not redesign. All work on the
current feature branch, tested on 19400/19335. Slice 03 remains blocked until
Gate A2 (retest, §7) is signed off by Karim.

Order: **C0 → C1 → C2 → C3 → Gate A2 → slice 03.** C1 may start while C0's
restart checklist is being verified. C2 and C3 both touch the studios: C2 merges
first, C3 rebases on it. One branch per slice (`slice/c1-gateway-contract` etc.),
review protocol `99-verification-and-regression.md` §3 applies to every slice.

---

## 1. Verified root causes (do NOT re-investigate; anchors are current as of this doc)

| Karim finding | Root cause | Fix lives in |
|---|---|---|
| Rename fails everywhere | Gateway process on 19335 booted 03:11, slice-01 code hit disk 06:02; live process has no `PATCH /library/:id`. Code on disk is correct. | C0 (restart only) |
| Grok/Imagine 1.5 instant 400 | Same stale process: old in-memory `isUploadedNativeAssetPath` (HEAD `grokVideoProvider.js:89-93`) rejects generated assets; error text matches `safeError`'s regex → generic 400. On-disk fix (`isAllowedNativeAssetPath`, `grokVideoProvider.js:89-94`) already correct. | C0 (restart), C1.4 (better error messages) |
| Name field clears | Implemented per `slice-02-naming-ui.md:19` ("Input clears after successful submit") — spec gap, not a coding bug. `ImageStudio.jsx:1654-1656`, `VideoStudio.jsx:1761-1763`. | C2.1 |
| Only 2 old cards show names | Correct behaviour: 120 of 128 jobs predate `displayName`. The two `image-studio-000N` names came from an abandoned auto-naming attempt whose dead code remains (`nextImageDisplayName` `ImageStudio.jsx:172-174`, `nextVideoDisplayName` `VideoStudio.jsx:220-222`, unused `nameCounter` state). | C2.1 (cleanup) |
| Veo switch keeps 1 of 2 refs, silently | `handleModelSelect` → `trimImageRefs` (`VideoStudio.jsx:1283-1328`) trims to capacity with no warning; warning only fires for zero-capability (`VideoStudio.jsx:1831-1840`). Violates `02-target-architecture.md` §7.3 "trims (never clears) **and warns**". | C2.2 |
| Handoff flips model to Omni | `planReferenceHandoff` (`VideoStudio.jsx:165-184`) retargets whenever current model capacity ≤ 1 regardless of handoff size — Veo (capacity 1) always bounces to Omni. | C2.2 |
| Video upload to Omni → MuAPI 403 | Video uploads route unconditionally through legacy MuAPI `uploadFile` (`muapi.js:204-252`) with `apiKey=null` in keyless native mode. No native video upload path exists client-side; gateway fully supports mp4 uploads and Omni video inputs. | C2.4 |
| Video thumbnails vanish until hard refresh | Tab switch unmounts studios (`StandaloneShell.js:409-410`); VideoStudio eagerly mounts an eager-decoding `<video>` per card (`VideoStudio.jsx:1918-1931`, up to 50) with no teardown → Chromium decoder-pool exhaustion; new `<video>` elements then silently fail. `<img>`-based ImageStudio immune. | C2.5 |
| Generations lost on tab switch | Poll loop is a plain promise chain inside the mounted studio (`nativeMedia.js:447-470` via `handleGenerate`); unmount orphans it (React no-ops setState); hydration is one one-shot `listNativeLibrary` at mount (`VideoStudio.jsx:876-878`). No shared registry exists. | C3 |

Additional verified facts used below:

- **Proxy fallback footgun:** `app/api/native-media/[[...path]]/route.js:17` falls
  back to `http://127.0.0.1:19334` — a gateway in the SEPARATE
  `Open-Generative-AI-main-19300` worktree that shares `NATIVE_MEDIA_ROOT` but has
  none of the new code (structurally drops `displayName`). If
  `NATIVE_MEDIA_GATEWAY_URL` is ever unset on an app restart, names silently stop
  persisting and rename 404s forever. Fixed in C0.2.
- **Veo 3.1 official capabilities (Vertex path, which our `bin/genai-video` uses):**
  up to **3 reference images**, `reference_type:"asset"` only (no style refs on 3.1),
  SDK fields `types.VideoGenerationReferenceImage(image=…, reference_type="asset")`
  inside `GenerateVideosConfig(reference_images=[…])`. References require
  **8s duration and 16:9** and are **mutually exclusive with first-frame (`image`)
  and last-frame (`config.last_frame`)**. First+last-frame interpolation is the
  separate Veo 3.1 mode. 3.1 and 3.1-fast have identical feature surface.
  **Two independent flags gate refs today:** client
  `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES` (`nativeModels.js:2-3`) and gateway
  `NATIVE_MEDIA_VEO_REFERENCE_IMAGES` (`exports.js:180-182`, enforced at `:248-250`);
  `CAPABILITY_CONSTRAINTS.veoMaxReferenceImages` is hardcoded 3 (`exports.js:48`)
  regardless of the flag. The full provider chain (client roles →
  `vertexVideoProvider.js:118-174` `--reference-image` → `bin/genai-video:129-133`)
  is already real and correct.
- **Uploads:** gateway sniffs magic bytes and accepts ONLY png/jpeg/webp/mp4
  (`exports.js:192-207, 269-274`); client allowlist is broader
  (`nativeMedia.js:43-53` includes gif/avif/webm/quicktime → guaranteed 400s).
  No upload-time size cap exists (`saveAsset` never checks length).
- **displayName rules:** `cleanDisplayName` (`exports.js:98-104`) whitelists
  `[A-Za-z0-9._-]`, strips one trailing extension, silently truncates to 120.
  Rename path (`renameLibraryJob`, `exports.js:975-996`) REJECTS >120 before
  cleaning; submit path silently truncates. 409 on non-completed/deleted jobs
  (this is correct; keep).
- **Omni video inputs:** role strings are cosmetic for Omni — inputs are
  classified by sniffed MIME (`omniVideoProvider.js:155-195`, `buildOmniVideoArgs:246`);
  constraints `omniMaxVideos:3`, `omniInputMaxBytes:250MB`, mp4 only.
- **History/registry shapes:** see §6 (C3) — all persisted-state shapes are
  reproduced there so no re-reading of studios is needed to build the registry.

---

## 2. Slice C0 — Runtime hygiene (GPT 5.5) — do this FIRST

Goal: no human can ever again test stale code without knowing it.

1. **Restart the dev gateway now.** Kill pid of the gateway whose cwd is
   `/home/k8r1m/Open-Generative-AI` (listening on 19335; verify with
   `ss -ltnp` + `/proc/<pid>/cwd` — do NOT kill the 19334 one, it serves 19300).
   Relaunch from this worktree with the SAME env it had plus the new vars from
   step 3: `NATIVE_MEDIA_GATEWAY_PORT=19335`,
   `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media`, live-provider
   flags as before, plus `NATIVE_MEDIA_VEO_REFERENCE_IMAGES=true`. Use
   `nohup`/`setsid` so it survives the session; note the new pid in the
   execution log.
2. **Pin the proxy target.** Create `.env.local` in the repo root (verify it is
   gitignored; if not, add `.env.local` to `.gitignore`) containing:
   `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335` and
   `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES=true`. Restart the `next dev` process
   on 19400 so both take effect. (Prod/19300 worktree gets NO `.env.local`; its
   19334 default stays correct. Slice 03 amendment: the systemd units defined in
   `slice-03-merge-and-rebrand.md` must set `NATIVE_MEDIA_GATEWAY_URL` explicitly
   for the portal service and both Veo flags for portal+gateway.)
3. **Boot fingerprint in `/health`.** In `native-media-gateway/server.js`: at
   module load compute `SOURCE_FINGERPRINT = max mtimeMs of native-media-gateway/*.js`
   (sync `fs.readdirSync`/`statSync`, top-level, once). Extend the existing
   health/root response (find the current health handler; if none exists, add
   `GET /api/native-media/v1/health`) to return
   `{ ok: true, startedAt: <ISO at boot>, pid: process.pid, sourceFingerprint: <number>, port: <configured port> }`.
   Also `console.log` these at boot.
4. **Staleness guard script** `native-media-gateway/bin/check-fresh.sh` (bash):
   curls the health endpoint (arg: port, default 19335), compares
   `sourceFingerprint` to the current max mtime of `native-media-gateway/*.js`;
   exits non-zero with a loud message if the live process is older than the code.
5. **Tests:** node:test `tests/nativeHealthFingerprint.test.js` — boot the
   gateway in-process (same pattern as existing gateway tests), GET health,
   assert `sourceFingerprint > 0` and `startedAt` parses. `npm run build:studio`
   green.
6. **Pre-flight rule (add to `99-verification-and-regression.md` §4 top):** before
   ANY manual gate testing, run `check-fresh.sh 19335` and verify the 19400 app
   process env contains `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335`. Record
   both in the execution log.

Acceptance: rename works in the browser on 19400 (this alone proves the restart
took), `check-fresh.sh` passes, Grok i2v with a generated-asset ref and a typed
prompt no longer 400s (this is the stale-code retest — do it before C1 changes
anything, so we know the baseline is clean).

## 3. Slice C1 — Gateway contract fixes (GPT 5.5)

All in `native-media-gateway/` + client allowlist alignment noted. Small,
surgical, each with a unit test.

1. **Real validation error messages.** Today `safeError` (`server.js:37-50`)
   masks every validation failure as `Invalid native media request.` — this cost
   us a day. Change: in `exports.js`, add
   `validationError(message)` → returns the same `nativeHttpError(400, { error: 'BAD_REQUEST', message })`
   mechanism `renameLibraryJob` already uses (`exports.js:968-973`), which
   `safeError` passes through untouched. Convert every user-actionable throw in
   `validateGenerationRequest`, `validateUpload`, and the veo/grok/omni input
   validators to `validationError('<the real message>')`. Messages must not leak
   paths, env values, or provider internals — human-readable contract statements
   only ("Veo reference images cannot be combined with a first or last frame",
   "unsupported upload MIME type: image/gif — allowed: png, jpeg, webp, mp4").
   Internal/unexpected errors keep the generic mask. Client change (tiny, include
   here): `generateNativeMedia`'s error already includes response text
   (`nativeMedia.js:483`) — no change needed; verify the message surfaces.
2. **Prompt optional for image-driven video tasks.** In `validateGenerationRequest`
   (`exports.js:227-259`): replace the unconditional `prompt is required` with —
   prompt required for text-only generation; for `task === 'image-to-video'` (and
   video-input Omni generations) allow missing/empty prompt and normalize to `''`
   when at least one input is present. Then in each provider arg-builder
   (`vertexVideoProvider.js` `buildVertexVideoArgs`, `grokVideoProvider.js`,
   `omniVideoProvider.js`/`bin/genai-omni`, `bin/genai-video`): omit the prompt
   argument/part entirely when empty rather than passing `''`. If a live provider
   rejects a promptless call, that failure surfaces honestly per global rule 1 —
   do not inject placeholder prompt text. UI keeps its "(optional)" label.
3. **Veo capability truth + exclusivity enforcement.**
   a. `/capabilities` must reflect reality: `veoMaxReferenceImages` = 3 when
      `veoReferenceImagesEnabled()` else 0 (replace the hardcoded 3 at
      `exports.js:48` with a getter evaluated per request, keeping the constant
      shape of the response).
   b. In veo input validation (`vertexVideoProvider.js:176-229` and/or
      `validateGenerationRequest`): reject `reference` inputs combined with any
      start-frame or last-frame input (`validationError` with the message in
      step 1); reject `reference` inputs with aspect ratio ≠ `16:9` (duration=8s
      is already enforced at `:207-212`; keep).
4. **Upload hardening.**
   a. Server: add a hard size cap in `validateUpload` (`exports.js:269-274`):
      reject `bytes.length > 250*1024*1024` ("upload exceeds 250MB limit") and
      empty files.
   b. Client alignment: shrink `ALLOWED_UPLOAD_MIME` (`nativeMedia.js:43-53`) to
      exactly `image/png, image/jpeg, image/jpg, image/webp, video/mp4` so the
      client can never offer what the server will 400. (gif/avif/webm/quicktime
      support, if ever wanted, is server-side sniffing work — out of scope.)
5. **Tests (node:test, follow existing gateway test patterns):**
   `tests/nativeValidationMessages.test.js` — asserts (a) empty-prompt i2v with
   an input is accepted and job is created; (b) empty-prompt t2v is rejected with
   the real message; (c) veo reference+first-frame combo → 400 with the
   exclusivity message; (d) veo reference at 9:16 → 400; (e) oversized/empty
   upload rejected; (f) capabilities `veoMaxReferenceImages` flips with the env
   flag. Existing suites (`nativeGrokVideoProvider`, `nativeStartupRecovery`,
   `nativeLibraryRename`, `nativeFrameFromJob`, route versioning) stay green.
   `npm run build:studio` green.

## 4. Slice C2 — Studio UX fixes (GLM 5.2)

All in `packages/studio/src/` (+ e2e). Follow existing component idioms exactly.
C1 must be merged first (C2.3 depends on capability truth; C2.4 on upload cap).

1. **Sticky name + auto-suffix (both studios).**
   a. DELETE the `if (!hadError) setGenerationName("")` lines
      (`ImageStudio.jsx:1654-1656`, `VideoStudio.jsx:1761-1763`). The name field
      keeps its value until the user edits/clears it (it is already persisted in
      both PERSIST_KEY payloads — no persistence change needed).
   b. DELETE dead code: `nextImageDisplayName` (`ImageStudio.jsx:172-174`),
      `nextVideoDisplayName` (`VideoStudio.jsx:220-222`), and all `nameCounter`
      state/persistence/restore references in both studios (Task-3a lists:
      `VideoStudio.jsx:571,800-801,825,873,920-922`; `ImageStudio.jsx:1055` +
      its persist/restore lines).
   c. New suffix logic, per studio, exact semantics:
      - State: `nameSequence` `{ base: string, next: number }`, persisted in the
        studio's PERSIST_KEY payload like other fields.
      - At submit time with non-empty `trimmedGenerationName`:
        * `base` = `trimmedGenerationName` truncated to **110 chars** (leaves room
          for `-NNN` under the gateway's silent 120 cap).
        * If `nameSequence.base !== base` (new/changed name): send `displayName: base`
          (no suffix — first use is the bare name), then set
          `nameSequence = { base, next: initialNext(base) }` where
          `initialNext(base)` scans the CURRENT in-memory merged history
          (`localHistory` after server merge) for entries whose `displayName`
          matches `^${base}(-(\d{3}))?$` and returns (max suffix found or 0) + 1,
          minimum 1. (In-memory scan only — no extra fetch; collisions with items
          older than the merged window are acceptable, names are not unique keys.)
        * Else (same base as last submit): send
          `displayName: `${base}-${String(nameSequence.next).padStart(3,'0')}``
          and increment `next`. So the sequence Karim sees is:
          `skydivers`, `skydivers-001`, `skydivers-002`, … until he changes the field.
      - Only successful submits advance the sequence (wire the increment where
        the history entry is added, not before the request).
      - Empty name field ⇒ no `displayName`, sequence untouched (current behaviour).
   d. e2e: extend `tests/e2e/naming.spec.js`: generate twice with the same name
      (fake provider path the harness already uses) → cards read `name` and
      `name-001`; edit the field → next card is the new bare name; reload
      mid-sequence → next generation continues the sequence (persistence).
2. **Reference handling: never retarget, trim + warn (VideoStudio).**
   a. `planReferenceHandoff` (`VideoStudio.jsx:165-184`): remove the retarget
      branch entirely. New contract: keep `currentModelId` always. Compute
      `capacity = getMaxImagesForI2VNative(currentModelId)`; return
      `urls: cleanUrls.slice(0, Math.max(1, capacity))` and push warning
      `` `kept:${kept}-of-${cleanUrls.length}` `` when it drops any, plus the
      existing `no-usable-urls` case. If the current model cannot use images at
      all, still apply the urls (per §7.3 refs stay visible) — the existing
      zero-capability warning strip covers messaging. Keep the function pure;
      update `tests/nativeVideoStudioHandoffPlan.test.js` to the new contract
      (no `retargeted:` warnings anymore — delete those cases).
   b. `handleModelSelect` (`VideoStudio.jsx:1283-1328`): before `trimImageRefs`,
      capture `prev.length`; when the new capacity drops refs, set a new state
      `refTrimNotice` = `"Kept N of M reference images — <ModelLabel> accepts N"`.
      Render `refTrimNotice` in the SAME warning-strip component slice 00 added
      (amber chip above the prompt box), dismiss on next model change, ref
      change, or successful submit. Never a transient toast.
   c. e2e `tests/e2e/handoff-model-stability.spec.js`: select Veo 3.1 Fast, hand
      off 1 image from Image Studio → model stays Veo, image applied; hand off 2
      → model stays Veo, 1 kept, warning chip visible with "Kept 1 of 2".
3. **Veo two-mode input UI (refs are exclusive with frames — see §1 facts).**
   Shown only for veo 3.1 / 3.1-fast when `NATIVE_VEO_REFERENCE_IMAGES_ENABLED`:
   a. A two-option segmented toggle above the image drop area:
      **"Frames"** (default) and **"References"**. Persist choice as
      `veoInputMode` in PERSIST_KEY.
      - Frames mode: exactly today's behaviour — 1 start image (role
        `first-frame`) + optional end image (role `last-frame`), durations 4/6/8s.
      - References mode: up to 3 images, ALL sent with role `reference`, no
        first/last-frame input allowed; on entering this mode force and lock
        duration=8s and AR=16:9 (disable those selectors with a hint
        "required for Veo references"); the end-image UI is hidden.
   b. Request building (`VideoStudio.jsx:1566-1574`): branch on `veoInputMode`
      for veo models; non-veo models unchanged. Client-side guard mirrors C1.3b
      (never construct ref+frame mixes).
   c. Switching between modes keeps the uploaded images in place (they're just
      urls) and re-labels roles at submit; if References mode holds >3, trim +
      the C2.2b warning chip.
   d. Unit: extend `tests/nativeVideoStudioWiring.test.js` regex guards for the
      role branching; e2e: `tests/e2e/veo-reference-mode.spec.js` asserting the
      toggle appears for veo only, locks duration/AR in References mode, and the
      submitted request body (intercept the POST) carries roles
      `reference`×N / no `first-frame`.
4. **Native video upload for Omni (VideoStudio).**
   a. Add `shouldUseNativeVideoUpload(modelId)`: true when the selected model is
      native and its gateway capability set accepts video inputs (today: the
      Omni video model — derive from capabilities/`nativeModels.js` metadata, do
      not hardcode the id string in more than one place).
   b. In `processDroppedVideo` (~`VideoStudio.jsx:1006`) and
      `handleVideoFileChange` (~`:1228`): when `shouldUseNativeVideoUpload`,
      route through `uploadNativeFile(file)` (mp4 only — non-mp4 shows
      "Native video input supports MP4 only" inline error, no MuAPI fallback)
      and store the returned same-origin `url` in the existing
      `uploadedVideoUrl` state. Legacy MuAPI `uploadFile(apiKey, …)` remains
      only for actual MuAPI V2V models.
   c. Request building: when generating with Omni and `uploadedVideoUrl` is a
      native asset url, include it via `nativeInputFromUrl(url, 'input')`
      (role string is cosmetic for Omni — classified by MIME server-side).
      Respect `omniMaxVideos:3` client-side if the UI ever holds multiple.
   d. e2e `tests/e2e/native-video-upload.spec.js`: drop an mp4 fixture with the
      Omni model selected → POST goes to `/api/native-media/v1/uploads` (assert
      via request interception), no request to any MuAPI host, and the
      generation request carries the asset input.
5. **Video card rendering rework (fixes decoder exhaustion).**
   a. New `LazyVideo` component in `packages/studio/src/components/` used by
      VideoStudio history cards (replacing the eager `<video>` at
      `VideoStudio.jsx:1918-1931`):
      - Wrapper div holds the card layout. A single shared `IntersectionObserver`
        (module-level, `rootMargin: '200px'`) tracks visibility.
      - Not-yet-visible (or scrolled far away): render a dark placeholder div
        (same aspect class) — NO `<video>` element in the DOM.
      - Visible: render `<video preload="metadata" src={url} muted playsInline loop>`
        with the existing hover-to-play handlers and click-to-fullscreen.
      - Unmount/going-far-offscreen cleanup (React effect cleanup): `pause()`,
        `removeAttribute('src')`, `load()` — deterministic decoder release.
    b. Keep all card actions/labels untouched (global rule 5 — additive only).
    c. e2e `tests/e2e/video-cards-survive-tabs.spec.js`: seed ≥12 fake completed
       video jobs in the harness store, switch Image↔Video tabs 10 times, assert
       visible cards still render playable `<video>` elements with non-empty
       `videoWidth` after the churn (this is the regression proxy for the
       decoder-pool bug).
6. `npm run build:studio` green; full Playwright suite green; regression
   checklist per 99 §2.

## 5. Slice C3 — Cross-tab generation registry (GPT 5.5)

Design is fixed; implement as specified. C2 merged first.

**New module `packages/studio/src/generationRegistry.js`** — a module-level
singleton (module state survives tab switches because studios unmount but the
page/module does not; localStorage backs page reloads). No React context.

State:
- `pending`: `Map<jobId, PendingJob>` where `PendingJob =
  { jobId, studio: 'image'|'video', modelId, prompt, displayName?, createdAt }`.
- `undelivered`: `Map<jobId, { studio, entry }>` — completed/failed results not
  yet consumed by a mounted studio. `entry` is a ready-to-insert history entry
  (shapes below).
- Both persisted to localStorage key `native_generation_registry_v1` as
  `{ pending: [...], undelivered: [...] }` on every mutation (write-through; the
  payload is small). On module load, rehydrate and call `resumeAll()`.

API (exact):
- `track(job, meta)` — called by each studio immediately after
  `generateNativeMedia`'s initial POST resolves to a pending job. `job` is the
  submit response (`{ id/request_id, modelId }`), `meta` = `{ studio, prompt,
  displayName, model }`. Adds to `pending`, starts `pollNativeGeneration(jobId)`
  (import from `nativeMedia.js`) in the registry's own promise chain. On resolve:
  build the history entry (VideoStudio entry shape:
  `{ id: jobId, jobId, url, prompt, model, duration?, resolution?, displayName?,
  downloadName?, timestamp: Date.now(), status: 'completed', native: true,
  serverBacked: true }`; ImageStudio shape: same minus duration/resolution/status
  — reuse each studio's existing `normalizeServerHistoryEntry` by exporting it,
  do NOT duplicate the mapping), move jobId from `pending` to `undelivered`,
  then `notify(studio)`. On terminal failure: same flow with
  `status: 'failed'` and the error message in `entry.error` (video studio
  already renders failed entries; image studio drops non-completed — keep that
  behaviour by only queueing failures for the video studio).
- `subscribe(studio, cb)` → unsubscribe fn. `notify(studio)` calls the mounted
  subscriber (if any); if none is mounted the result simply waits in
  `undelivered`.
- `consume(studio)` → returns and removes all `undelivered` entries for that
  studio (called by the studio on mount AND from its subscription callback).
- `pendingFor(studio)` → array of PendingJobs (for optional "generating…" chips
  on remount; rendering them is optional polish, not required).
- `resumeAll()` — for every rehydrated `pending` job, re-start
  `pollNativeGeneration(jobId)`. Jobs that finished while the page was closed
  resolve immediately from the GET; jobs whose GET 404s are dropped from
  `pending` silently.
- Dedupe rule: `track` is idempotent per jobId; `consume`rs insert via the
  studio's existing `addToLocalHistory`/`addToHistory`, whose merge with
  `mergeServerHistory` already dedupes by `historyKeys` (`jobId/request_id/id/url`).

**Studio integration (both studios, symmetric):**
1. In `handleGenerate`, right after the submit response is known to be pending
   (inside `generateNativeMedia` we don't have a hook — so: call
   `registry.track` from the studio using the `job` object that
   `generateNativeMedia` already exposes on its thrown/returned values; if the
   current shape doesn't expose the pending job pre-poll, add an
   `onSubmitted(job)` callback option to `generateNativeMedia`
   (`nativeMedia.js:472-504`) invoked with `{ id, modelId }` before polling
   starts — additive, default no-op). The studio's own inline `await` continues
   unchanged for in-tab UX.
2. On successful in-tab completion the studio adds history as today; then calls
   `registry.settle(jobId)` (remove from pending/undelivered — add this small
   method) so nothing double-delivers.
3. On mount (after the existing persistence restore + `listNativeLibrary`
   merge): `const missed = registry.consume(kind); missed.forEach(addToLocalHistory)`.
   Then `registry.subscribe(kind, () => { registry.consume(kind).forEach(addToLocalHistory) })`,
   unsubscribing in the effect cleanup.
4. **ImageStudio parity fix:** add the stale-prune line VideoStudio's
   `mergeServerHistory` has (`VideoStudio.jsx:297`) to ImageStudio's version
   (`ImageStudio.jsx:229-242`) — drop `serverBacked && native` local entries whose
   keys no longer exist server-side.
5. **Do not** move the poll interval/timeout constants; registry uses the same
   `pollNativeGeneration`.

**Tests:**
- Unit `tests/nativeGenerationRegistry.test.js` (node:test with a mocked
  `pollNativeGeneration`): track→resolve→undelivered→consume; idempotent track;
  settle removes; localStorage round-trip (mock localStorage); resumeAll
  re-polls; failed jobs queue only for video.
- e2e `tests/e2e/cross-tab-generation.spec.js` (harness fake provider with a
  deliberate delay): start a video generation, switch to Image tab BEFORE it
  completes, wait past completion, switch back → the card is present WITHOUT
  reload; and: start a generation, reload the page mid-flight → after
  completion the card appears (registry resume path).
- Full suite + build green; regression checklist per 99 §2.

## 6. Explicitly out of scope for Gate A correction (Phase 2 inputs — do not touch now)

- **Omni Interactions API conversational editing** (edit-a-generation via
  `previous_interaction_id`, no re-upload). Research complete:
  `research-google-flow/omni-interactions-api.md`. Fable will spec this as a new
  Phase 2 slice at the already-scheduled Phase 2 review, including persisting
  `interactionId` on omni job records. NOTE for that review: our
  `bin/genai-omni` currently uses `generate_content`; chaining requires the
  Interactions API surface (`client.interactions.create`, `store=true`,
  AI-Studio-key auth only, no Vertex path yet).
- **Google Flow / Higgsfield UX patterns** for storyboarding/references:
  `research-google-flow/flow-features.md` (+ `flow-vs-higgsfield.md`). Folded
  into the slice 04-11 revision at the same review.
- Server-generated video poster thumbnails (would reuse `frames.js`) — C2.5's
  client-side fix is sufficient for now.
- generate-media / Codex skill updates for Veo references and Omni editing —
  separate plan after this app work, per Karim.

## 7. Gate A2 — retest protocol (Karim, on 19400)

Pre-flight (orchestrator): `check-fresh.sh 19335` passes; app env verified;
full Playwright + node suites green; execution log updated.

Karim's script — every original finding, in his order:
1. Generate an image (NB2, multiple refs) WITH a name → card + download named.
2. Generate again, same name untouched → card named `<name>-001`; a third → `-002`.
3. Rename any image card and any video card → both succeed, persist after reload.
4. Old cards: still show no name (expected; rename any you want kept).
5. Handoff image → Video Studio; select Grok/Imagine 1.5; typed prompt →
   generates (no 400). Also try EMPTY prompt → generates or fails with a
   READABLE message (no "Invalid native media request").
6. With Veo 3.1 Fast selected, add 1 image from Image Studio → model STAYS Veo.
   Add 2 → warning chip "Kept 1 of 2", model stays.
7. Veo References mode: toggle to References, add 2-3 refs → duration/AR lock
   to 8s/16:9 → generate → works (16:9 output guided by refs).
8. Veo Frames mode: first + last frame generation still works.
9. Upload an mp4 to Omni → uploads natively (no 403), generation consumes it.
10. Start a video generation, immediately switch to Image tab, wait for
    completion, switch back → result card present without refresh. Repeat with
    a page reload mid-generation.
11. Tab-switch churn (10+ switches with a full video history) → thumbnails and
    playback keep working, no hard refresh needed.
12. Regression preserve list per `99-verification-and-regression.md` §2 (Omni,
    Grok, NB2/Pro, Codex, Veo, prompt copy, delete + batch delete, hydration,
    last-frame download, existing assets).

Sign-off recorded in execution log → slice 03 unblocks (with its §2.2 env
amendment).

---

Executors: log every deviation in `execution-log.md`. If reality contradicts an
anchor in this doc (line drift), adapt mechanically and note it — do not
redesign. When blocked, stop and surface to Karim.
