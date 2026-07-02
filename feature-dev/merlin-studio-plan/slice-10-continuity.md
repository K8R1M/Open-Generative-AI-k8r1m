# Slice 10 — Continuity: Last Frame → Next Shot First Frame

Assignee: GPT 5.5 (flow), GLM 5.2 (chip/affordance polish).
Depends on: slices 01 (frame-from-job), 09. Branch: `slice/10-continuity`.

## Goal

The Higgsfield-style chaining move, one click: take a completed video variant's
last frame and make it the NEXT shot's first frame (creating the next shot if
needed). This is the single highest-value workflow action in the whole plan —
it must be boringly reliable.

## Flow

Action “Use last frame in next shot” appears on:
- completed VIDEO variants in ShotDetailPanel (hover action),
- generated ShotCards whose pinned/latest variant is a video.

Handler (`useShotGeneration.js` or sibling `useContinuity.js`):
1. `const {assetId, url} = await frameFromJob(variant.jobId)` (slice 01
   endpoint — extracts AND imports as a real PNG asset; server-side ffmpeg;
   fail → toast with `FRAME_EXTRACTION_FAILED` public message, abort).
2. Set on the SOURCE shot: `lastFrame = {kind:'derivedFrame', assetId, jobId:
   variant.jobId, mediaType:'image'}` (provenance of the chain).
3. Target shot = next shot in the scene's shotOrder; if none, create one via
   `projectsModel.newShot(sceneId)` + append (title `<source title> — cont.`).
   Prompt prefill source, in this exact priority: the source shot's pinned
   variant's `promptRaw` → else its latest completed variant's `promptRaw` →
   else `sourceShot.prompt`. Append `\n\nContinue seamlessly from the previous
   shot's final frame; maintain character, wardrobe, location and lighting.`
   Plain visible text the user can edit; no hidden prompt injection at
   generation time.
4. Set target `firstFrame` to the same AssetRef; copy source `referenceIds`
   to the target (continuity usually wants the same cast); status stays draft.
5. `save()` (flushed), select the target shot in the panel, board shows the
   chain: source card right-edge icon + target card left-edge icon (slice 08
   icons now light up; add a subtle connecting tint on hover — GLM polish).
6. Capability guard at GENERATION time, not at chain time: chaining onto a shot
   whose model lacks `imageInit` is allowed (metadata is model-independent);
   the composer already warns `first-frame-unsupported` when generating.

Media-library tab parity: its existing “Extract last frame → Library” (slice
06) stays as-is; this slice adds nothing there.

## Edge cases (all must be tested)

- Variant's job was deleted from the library → `frameFromJob` 404 → toast, no
  doc mutation.
- Source shot is the last shot of the last scene → new shot created in that
  scene.
- Re-running the action → NEW derived frame asset each time (frames are cheap;
  no dedupe in V1), target firstFrame overwritten after a confirm() if already
  set.
- Extraction on a ≤1-frame/corrupt video → server 500 mapped message, abort.

## Tests

- e2e `tests/e2e/continuity.spec.js` (fake video fixture): generate (fake) →
  action → assert new shot exists with firstFrame thumbnail rendered from a
  REAL served asset url (img loads 200), source lastFrame set, refs copied,
  prompt prefilled; reload → chain intact; delete the derived asset via library
  → both slots show missing state without crash.
- Unit: the doc mutations (chain helper in `projectsModel.js`:
  `chainLastFrame(doc, shotId, assetRef)` returning `{doc, targetShotId}`).

## Do not

- No automatic generation of the next shot.
- No video-trim/frame-picker UI (last frame only in V1; note frame-picker as
  Phase 2 candidate).
- No prompt-injection at request time beyond what's visible in the textarea.

## Acceptance criteria

- One click from a completed video variant to a ready-to-generate next shot,
  proven by e2e; chain visible on the board; provenance fields correct.
