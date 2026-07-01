# Task List: Native Grok Imagine Video Provider

Last updated: 2026-06-30

Use this file as the implementation checklist after the audit plan is accepted.

Status legend:

- `[x]` done during investigation/planning
- `[ ]` pending implementation/verification
- `[~]` in progress

## Investigation

- [x] Confirm repo status and current branch before planning.
- [x] Locate Graphify graph: `graphify-out/graph.json`.
- [x] Use Graphify to identify current native-media call graph.
- [x] Trace browser/native flow through Studio, Next proxy, gateway, scheduler, and providers.
- [x] Read current Vertex video provider adapter.
- [x] Read current Codex image provider adapter.
- [x] Read current gateway dispatch and scheduler.
- [x] Read current Video Studio native I2V logic.
- [x] Read current native model contract tests.
- [x] Check installed Grok Imagine video skill and wrapper.
- [x] Check Grok CLI help.
- [x] Check official xAI docs pages for Imagine/video/image-to-video/reference-to-video.
- [x] Write persistent graph/context file.
- [x] Write audit plan file.
- [x] Write task list file.

## Before Implementation

- [x] Review `docs/plans/grok-imagine-video-provider-context.md`.
- [x] Review `docs/plans/grok-imagine-video-provider-plan.md`.
- [x] Confirm no newer changes conflict with the plan:
  - `git status --short --branch`
  - `git diff --stat`
- [x] Create feature branch:
  - `git checkout -b feat/native-grok-imagine-video`
- [x] Refresh Graphify before implementation:
  - `graphify update . --force`
- [x] Main agent stays orchestration-only; code changes are owned by native `executor` subagents.
- [x] Review is owned by separate native `code-reviewer` subagents.
- [x] Default to no new shared adapter utilities in V1; extract only if the Grok implementation creates concrete duplication in touched code.

## Code Tasks

- [x] Add shared provider helper module if still justified:
  - `native-media-gateway/providerAdapterUtils.js`
  - Keep scope to path naming, env filtering, redaction, diagnostics, stream capture, and common asset-file validation.
  - Skip this file if Grok can stay clear by following existing provider patterns directly.

- [x] Add Grok provider adapter:
  - `native-media-gateway/grokVideoProvider.js`
  - Model ID recognizer.
  - `liveGrokEnabled()`.
  - `buildGrokVideoArgs()`.
  - `resolveInputAssets()`.
  - `validateGrokVideoInputs()`.
  - `runGrokVideoProvider()`.
  - Redacted diagnostics.
  - Explicitly reject text-to-video for V1.
  - Parse wrapper stdout JSON `output` when present; fall back to requested `grok-output.mp4`.
  - Enforce image counts before spawn: 1 image for `image-to-video`, 2-7 total images for `reference-to-video`, >7 rejected.
  - Map client roles to wrapper refs: first frame -> `start-composition`, later refs -> `reference-N`.
  - Verify cancellation does not leave a nested Grok process running.

- [x] Update scheduler provider caps:
  - `native-media-gateway/scheduler.js`
  - Add `grok: 1`.

- [x] Update gateway live gating:
  - `native-media-gateway/server.js`
  - Add `NATIVE_MEDIA_LIVE_GROK`.
  - Fake provider only when Vertex, Codex, and Grok live gates are all off.

- [x] Update gateway model catalog and dispatch:
  - `native-media-gateway/exports.js`
  - Add Grok model and constraints.
  - Add Grok live branch.
  - Persist `liveGrok`.
  - Propagate `liveGrok` through queued drain launch options.
  - Export `grokVideoProvider` for focused tests.
  - Add safe Grok public failure messages.

- [x] Update Studio native model catalog:
  - `packages/studio/src/nativeModels.js`
  - Add `native.grok.imagine-video`.
  - Add Grok duration/resolution/reference/concurrency constraints.
  - Add feature flags for unsupported controls.

- [x] Generalize native client validation:
  - `packages/studio/src/nativeMedia.js`
  - Replace Veo-only validation with model-generic validation.
  - Preserve Veo reference-image gating and 8s reference duration rule.
  - Allow Grok references at 6s/10s.
  - Add a regression so Grok validation errors do not say `Veo`.

- [x] Update Video Studio UI wiring:
  - `packages/studio/src/components/VideoStudio.jsx`
  - Update `nativeVideoModelToDescriptor()`.
  - Update `applyControlsForModel()`.
  - Update native I2V image slicing and parameter construction.
  - Hide unsupported Grok aspect/audio/end-frame controls.
  - Keep multiple reference images based on `maxReferenceImages`.
  - Make Veo-specific messages conditional on Veo/model constraints.

- [x] Preflight duplicate UI surfaces:
  - Grep `src/`, `components/`, and `packages/studio/src/` for `lastImageField`, native descriptors, and native model wiring.
  - Edit only files that actually participate in native Video Studio behavior.

- [x] Update native contract fixture:
  - `tests/fixtures/nativeContract.js`

- [x] Update README operations section:
  - `README.md`

- [x] Update this task list and context graph after code changes.

## Test Tasks

- [x] Add `tests/nativeGrokVideoProvider.test.js`.
- [x] Add `tests/providerAdapterUtils.test.js` if shared utilities are added.
- [x] Update `tests/nativeModelCatalog.test.js`.
- [x] Update `tests/nativeGatewayPayloads.test.js`.
- [x] Update `tests/nativeVideoStudioWiring.test.js`.
- [x] Update `tests/nativeRouteVersioning.test.js`.
- [x] Update `tests/nativeCredentialBoundary.test.js`.
- [x] Update `tests/nativeGatewayServer.test.js`.
- [x] Run targeted Grok provider tests:
  - `node --test tests/nativeGrokVideoProvider.test.js`
- [x] Run targeted catalog/client/UI/gateway tests:
  - `node --test tests/nativeModelCatalog.test.js tests/nativeGatewayPayloads.test.js tests/nativeVideoStudioWiring.test.js tests/nativeRouteVersioning.test.js tests/nativeCredentialBoundary.test.js tests/nativeGatewayServer.test.js`
- [x] Run existing provider regression tests:
  - `node --test tests/nativeVertexVideoProvider.test.js tests/nativeVertexImageProvider.test.js tests/nativeCodexImageProvider.test.js`
- [x] Run broad native test sweep:
  - `node --test tests/native*.test.js`
- [x] Run build if test sweep passes:
  - `npm run build`

## Manual Test Tasks On Port 19400

- [x] Start native gateway:
  - `NATIVE_MEDIA_LIVE_GROK=1 NATIVE_MEDIA_GATEWAY_PORT=19334 node native-media-gateway/server.js`
- Used `NATIVE_MEDIA_GATEWAY_PORT=19335` because an older gateway was already listening on `19334`.
- [x] Start Next app on port `19400`:
  - `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19334 npm run dev -- --port 19400`
- Used `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335`.
- [x] Open:
  - `http://127.0.0.1:19400/studio/video`
- [x] Single-image smoke:
  - Select Grok native video model.
  - Upload one small PNG/JPEG/WebP.
  - Choose `6s`.
  - Choose `480p`.
  - Generate a simple motion prompt.
  - Confirm video plays in canvas/history.
  - Confirm returned URL is `/api/native-media/v1/assets/<asset-id>`.
  - Confirm final asset saved as `.native-media/assets/<asset-id>/data.mp4`.
  - Confirm logs remain private under `.native-media/tmp/<job-id>/`.
  - User-facing confirmation on `19400`: Karim confirmed Grok Imagine generation worked with one uploaded reference image.

- [x] Reference-images smoke:
  - Upload two or three compatible images.
  - Choose `6s`.
  - Choose `480p`.
  - Generate a simple one-beat prompt.
  - Confirm adapter uses reference mode.
  - Confirm video imports and plays.
- [~] User multi-reference smoke:
  - Karim is testing multi-reference video generation from the UI.
  - Keep app available on `19400` for this test.

- [x] Error smoke:
  - Try unsupported file type or too many refs.
  - Confirm failure happens before provider spawn.
  - Confirm browser message is safe.
  - Confirm diagnostics are private/redacted.

- [x] Cancel smoke:
  - Start a live Grok job.
  - Cancel while running.
  - Confirm gateway marks job cancelled.
  - Confirm no orphan Grok process remains. If orphan found, implement signal-forwarding mitigation before signoff.
  - Check process table for lingering Grok/wrapper processes after cancellation.

## Graph And Documentation Upkeep

- [x] Refresh Graphify after implementation:
  - `graphify update . --force`
- [x] Update `docs/plans/grok-imagine-video-provider-context.md` graph if flow changed.
- [x] Update `docs/plans/grok-imagine-video-provider-plan.md` if implementation deviates from plan.
- [x] Update this task list statuses as tasks complete.

## Merge Readiness

- [x] All targeted tests pass.
- [x] Broad native tests pass.
- [x] Build passes or any build gap is documented with exact failure.
- [x] Manual single-image smoke passes on `19400`.
- [x] Manual reference-images smoke passes on `19400`.
- [x] Safe public errors confirmed.
- [x] No browser response leaks local paths, prompts, auth state, or credentials.
- [x] Cancel smoke confirms no orphan Grok/wrapper process remains.
- [x] Graphify graph refreshed.
- [x] Gateway/security/cancellation `code-reviewer` approves.
- [x] Studio/client/regression `code-reviewer` approves.
- [x] Plan/context/task docs updated.
- [x] Commit on feature branch with Lore-style commit message.
- [x] Document follow-up asset-library/delete/copy plan:
  - `docs/plans/native-media-asset-library-delete-copy-plan.md`
- [ ] Merge back after user testing on `19400`.
