# Gate A Orchestrator Status For Fable

Date: 2026-07-02.

## Current State

- `00-README.md` still records plan status as `FINAL -- PHASE 1 APPROVED`.
- Orchestration step 3 was executed for Phase 1 slices 00, 01, and 02 only.
- `task-list.md` and `execution-log.md` were created and maintained.
- Slice 03 was not run.
- `main`, port `19300`, rebrand/systemd hosting, and Phase 2 were not touched.
- The feature worktree dev app is currently served for manual testing at `http://100.83.177.65:19400/studio`.
- The dev gateway used for the feature worktree is `127.0.0.1:19335`.

## What Was Implemented

- Slice 00: Image-to-video handoff fix plus Playwright harness.
  - Browser handoff repro was created, failed before the fix, then passed after implementation.
  - `uploadedImageUrl` scalar state was removed from `VideoStudio.jsx`.
  - Handoff consumption was made deterministic with delete-before-apply behavior.
  - Model switching was changed to preserve visible refs instead of silently clearing them.
  - Playwright harness was added for `/studio` tests with isolated `.native-media-test/e2e`.
- Slice 01: Gateway hygiene.
  - `asset_deleted` is terminal during restart reconciliation.
  - `PATCH /library/:id` rename endpoint was added.
  - `POST /projects/frame-from-job` was added behind `NATIVE_MEDIA_PROJECTS=1`.
  - Grok generated/derived native asset input support was added.
  - PNG validation was added for frame-to-asset after review.
- Slice 02: Naming / rename UI.
  - Optional `Name (optional)` field was added in Image Studio and Video Studio.
  - `displayName` is sent through native generation requests.
  - Native generated cards show display names.
  - Native generated cards have a Rename action using `window.prompt`.
  - `renameNativeLibraryItem()` was added to `nativeMedia.js`.

## Review And Test Evidence Captured

- Each slice was implemented by executor subagents and reviewed by independent `code-reviewer` subagents.
- Slice 00 had one CHANGES round, then APPROVE.
- Slice 01 had one CHANGES round, then APPROVE.
- Slice 02 was APPROVE on first review.
- Reported passing checks included:
  - `npm run build:studio`
  - Slice 00 Playwright handoff repro repeated 3x: `12/12`
  - Slice 02 naming e2e run twice
  - Full Playwright suite at the time: `7 passed`
  - Relevant native node tests
  - Real `.native-media` non-log changes after reviewer test start: `0`

## Manual Gate A Feedback Summary

Karim manually tested Gate A on `19400`. Full verbatim feedback is in:

- `gate-a-karim-testing-feedback.md`

Observed themes from the feedback:

- Name-at-generation partially works, including download filename, but the entered name clears after one generation. Karim expected it to persist and auto-number subsequent generations until changed or removed.
- Rename fails for image and video cards with "failed to rename generation".
- Only two prior generated images display names on cards; older cards have no visible name text, while their existing old filenames remain acceptable.
- Image-to-video handoff works in basic cases.
- Grok/Imagine 1.5 native video generation from the handed-off image failed with `400 Bad Request {"error":"BAD_REQUEST","message":"Invalid native media request."}`.
- Omni video generation worked with the reference image.
- Last-frame download/use-as-first-frame worked.
- Uploading the generated video to Gemini Omni failed with `403 - Not authorized: missing or invalid credentials`.
- Image generation with Codex and Nano Banana Pro reference flows worked.
- Sending two images to Video Studio worked, but switching from Omni to Veo 3.1 Fast left only one image in the input box.
- Sending another image from Image Studio to Video Studio changed the Video Studio model back to Omni even when Karim had selected Veo 3.1 Fast.
- Veo 3.1 Fast generation worked, but video thumbnails/playback temporarily disappeared in Video Studio until hard refresh.
- Delete appeared to work after refreshes.
- Karim wants generation polling/results to continue correctly if he changes tabs while a generation is running, and for completed results to appear in the right studio when he returns.

## Important Runtime Miss

After Gate A was first reported ready, the dev app was not actually running on `19400`. Karim reported the URL was inaccessible. The dev app was then started on `127.0.0.1:19400`, exposed via Tailscale TCP at `100.83.177.65:19400`, and verified with HTTP `200` on `/studio`.

## Current Gate State

- Gate A has been reached but is not signed off.
- Karim's manual feedback contains regressions and unmet expectations that need Fable review before continuing.
- Slice 03 remains blocked.
- The likely next planning unit is a Gate A correction plan before any merge/rebrand/systemd work.
