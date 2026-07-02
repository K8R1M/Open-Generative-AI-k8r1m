# Omni V1 Implementation State

Updated: 2026-07-02
Branch: `feature/omni-v1-adjacent-controls`
Current stop condition: Karim is live-testing `19400`; the Video Studio generated-image-to-reference handoff still fails after the attempted fix. Do not code more on this bug until Fable planning/diagnosis is done.

## Guardrails

- Real Omni provider branch was merged to local `main` as merge commit `d17eefe`.
- Continue remaining adjacent phases only on `feature/omni-v1-adjacent-controls`.
- `19300` main has been repaired and isolated in `/home/k8r1m/Open-Generative-AI-main-19300`; do not point it back at the active feature branch.
- Do not update or restart `19300` as part of adjacent-controls work unless Karim reports another `19300` failure.
- No user-facing fake/dummy successful Omni generation. Failed Omni jobs must fail visibly and must not create completed gallery cards.
- Preserve Grok video, Nano Banana 2/Pro image, native Codex image, prompt copy, delete, history hydration, and existing `.native-media` assets.
- Keep generated Omni media from the `19400` test window visible after merge; do not backfill unrelated old media.
- Preserve the verified real-provider behavior from `feature/omni-v1-native-media`; no fake Omni success paths.

## Current Source Of Truth

- `main` / `19300` should remain isolated in `/home/k8r1m/Open-Generative-AI-main-19300`.
- Feature branch / `19400` is `/home/k8r1m/Open-Generative-AI` on `feature/omni-v1-adjacent-controls`.
- Automated checks for the attempted Video Studio reference fix passed, but Karim's live `19400` test still failed.
- Therefore generated-image-to-Video-Studio reference action is unresolved and not merge-ready.
- Do not merge the current feature branch into `main` just for Fable to inspect it. Fable should inspect both worktrees and use `feature-dev/fable-portal-planning-brief.md` as the planning handoff.

## Active Lanes

- Leader: branch/state integration, orchestration, validation, and `19400` hosting.
- Completed Omni provider lane: real Omni path merged to local `main`.
- New adjacent-controls lanes pending discovery/implementation:
  - Batch delete generated assets: read-only subagent `Bernoulli` tracing generated card actions and delete surfaces.
  - Last-frame download for generated videos: read-only subagent `Pauli` tracing gateway route/helper and VideoStudio action surfaces.
  - Generated-image reference actions and per-studio naming metadata: read-only subagent `Peirce` tracing studio input handoff, native request metadata, hydration, and filenames.
- Discovery results:
  - Batch delete can be implemented frontend-only first by adding per-studio selection state and a visible batch toolbar, then looping the existing `deleteNativeLibraryItem(jobId)` helper for server-backed cards. No gateway batch endpoint is required for V1.
  - Last-frame download needs `POST /api/native-media/v1/library/:jobId/last-frame` in `native-media-gateway/server.js`, trusted job/asset resolution in `exports.js`, a deterministic helper under `native-media-gateway/bin/`, and route/client/UI tests.
  - Generated-image references need a one-time `sessionStorage` handoff consumed by ImageStudio/VideoStudio and shell studio switching through `components/StandaloneShell.js`.
  - Naming metadata should use a top-level `displayName` request field, persist it on native jobs, expose it through library hydration, and keep per-studio prefix/counter state in the existing studio persistence stores.
- Phase 2 batch delete completed by executor `Russell`:
  - `packages/studio/src/components/ImageStudio.jsx`: generated-card selection state, accessible per-card checkbox, batch delete toolbar, partial-failure status, successful-selection cleanup.
  - `packages/studio/src/components/VideoStudio.jsx`: same batch-select/delete behavior for generated video cards.
  - `tests/nativeImageStudioReferenceState.test.js` and `tests/nativeVideoStudioWiring.test.js`: focused wiring coverage.
  - Verification reported by executor:
    - `node --test tests/nativeVideoStudioWiring.test.js tests/nativeImageStudioReferenceState.test.js`
    - Result: 21 pass, 0 fail.
    - `npm run build:studio`
    - Result: pass.
    - `git diff --check` on edited files passed.
    - `graphify update . --force` refreshed graph output.
- Phase 3 backend last-frame route/helper completed by executor `Rawls`:
  - `native-media-gateway/exports.js`: trusted completed video job/asset resolver.
  - `native-media-gateway/server.js`: `POST /api/native-media/v1/library/:jobId/last-frame`, safe attachment streaming, temp cleanup, redacted failures.
  - `native-media-gateway/bin/extract-last-frame.js`: deterministic `ffprobe`/`ffmpeg` helper with fixed argv and `shell:false`.
  - `tests/fixtures/nativeContract.js`: frozen V1 route entry.
  - `tests/nativeMediaLibraryServer.test.js`: success, invalid state, path escape, and redacted error coverage.
  - `tests/nativeRouteVersioning.test.js`: helper argv contract coverage.
  - Verification reported by executor:
    - `node --test tests/nativeMediaLibraryServer.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeRouteVersioning.test.js`
    - Result: 25 pass, 0 fail.
    - `node --check native-media-gateway/server.js native-media-gateway/exports.js native-media-gateway/bin/extract-last-frame.js tests/nativeMediaLibraryServer.test.js tests/nativeRouteVersioning.test.js tests/fixtures/nativeContract.js`
    - Result: pass.
    - Real local helper smoke extracted a non-empty PNG from a generated MP4.
    - `git diff --check` passed.
    - `graphify update . --force` refreshed graph output.
  - Known runtime dependency: `ffprobe` and `ffmpeg` must be available on `PATH`.
- Phase 3 UI/client last-frame wiring completed by executor `Hume`:
  - `packages/studio/src/nativeMedia.js`: added `downloadNativeLibraryLastFrame(jobId)` client helper.
  - `packages/studio/src/components/VideoStudio.jsx`: added completed native/server-backed card action for last-frame download; preserves batch-delete checkbox/action layout.
  - `tests/nativeMediaLibraryClient.test.js`: client helper download coverage.
  - `tests/nativeVideoStudioWiring.test.js`: VideoStudio action/gating coverage.
  - Verification reported by executor:
    - `node --test tests/nativeMediaLibraryClient.test.js tests/nativeVideoStudioWiring.test.js`
    - Result: 19 pass, 0 fail.
    - `node --check packages/studio/src/nativeMedia.js`
    - Result: pass.
    - `npm run build:studio`
    - Result: pass.
    - `git diff --check` on edited files passed.
    - `graphify update . --force` refreshed graph output.
- Phase 3 backend review by `Kant`:
  - Request changes: route timeout currently kills the Node helper, but helper-spawned `ffprobe`/`ffmpeg` may continue if they hang.
  - Required fix: helper must own and kill active media subprocesses on timeout/SIGTERM, preferably with helper-local timeout/abort handling and regression coverage.
  - Other reviewed areas were acceptable: job id shape, generated-asset realpath checks, symlink escape rejection, redacted public errors, fixed argv, and `shell:false`.
- Phase 4 generated-image references completed by executor `Gibbs`:
  - `components/StandaloneShell.js`: one-time generated-image reference handoff callback, sessionStorage payload write, and studio switching.
  - `packages/studio/src/components/ImageStudio.jsx`: native same-origin generated image card actions for Image Studio and Video Studio; Image Studio consumes handoff once and appends refs.
  - `packages/studio/src/components/VideoStudio.jsx`: Video Studio consumes handoff once and appends native image inputs.
  - `tests/nativeGeneratedReferenceHandoff.test.js`: shell handoff/routing coverage.
  - `tests/nativeImageStudioReferenceState.test.js` and `tests/nativeVideoStudioWiring.test.js`: focused handoff/append/gating assertions.
  - Verification reported by executor:
    - `node --test tests/nativeGeneratedReferenceHandoff.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeVideoStudioWiring.test.js`
    - Result: 26 pass, 0 fail.
    - `npm run build:studio`
    - Result: pass.
    - `git diff --check` on edited files passed.
- Emergency `19300` main runtime failure is complete:
  - Debugger subagent `Poincare` confirmed the duplicate export and stale workspace-link causes.
  - `19300` now serves clean `main` from `/home/k8r1m/Open-Generative-AI-main-19300`.
  - `/studio`, native health, and native capabilities return 200.
- Active Phase 5 lane:
  - Executor `Carson`: completed per-studio naming prefixes/counters with durable display/download metadata.
  - Reviewer `Harvey`: completed read-only review of Phase 2-4 WIP, duplicate-export guard, fake-success/privacy/media-root risks; no blocking findings.
  - Leader: completed final verification and `19400` hosting.
- Phase 5 naming metadata completed:
  - `packages/studio/src/components/ImageStudio.jsx`: `image-studio-0001` style counter naming, durable counter persistence, display names on cards, display/download name hydration, generated image downloads use the display/download name.
  - `packages/studio/src/components/VideoStudio.jsx`: `video-studio-0001` style counter naming, durable counter persistence, display names on cards, normal video downloads use display/download metadata.
  - `packages/studio/src/nativeMedia.js`: native request/result display metadata passthrough.
  - `native-media-gateway/exports.js`: validates and persists safe `displayName` / `downloadName` fields on native jobs.
  - `native-media-gateway/server.js`: last-frame downloads use persisted video display metadata for attachment names.
  - Tests cover separate image/video prefixes, hydration, native request/result metadata, and last-frame filename metadata.
- Latest Karim `19400` test feedback:
  - Bulk delete appears to work.
  - Adding generated images back into Image Studio as prompt/reference inputs appears to work.
  - Adding a generated image to Video Studio as a prompt/reference worked once.
  - After changing the Video Studio model, the image disappeared from the reference input.
  - Retrying from Image Studio to add the generated image to Video Studio then stopped working, including later attempts.
  - Desired behavior is persistent references across video/image model changes where possible, and visible degradation only when the selected model cannot accept that reference type/count.
  - Karim did not see a rename box/control; current Phase 5 naming is automatic display/download metadata, not an obvious editable rename UI.
- Current active lane:
  - No further coding on the Video Studio handoff bug until Fable planning/diagnosis.
  - The attempted root-cause fix is present in the feature branch and was restarted on `19400`, but Karim reported the live behavior still does not work.
  - Naming/rename UI is deferred and out of scope unless Karim/Fable explicitly plan it.
- Halley root cause:
  - `VideoStudio.jsx` has split image state: `uploadedImageUrl` for single image and `uploadedImageUrls` for multi-image list.
  - Handoff updates can be dropped because new URLs are appended after old hidden refs and then sliced from the front.
  - Model changes do not normalize the two states, and non-image V2V can clear only one state.
  - Session handoff is removed before successful application, leaving no retry after a no-op.
- Required fix now assigned to Parfit:
  - new handoff URLs win over old refs;
  - keep `uploadedImageUrl` synced to the first `uploadedImageUrls` entry;
  - preserve/trim refs on compatible model changes;
  - clear both states when the selected model/mode cannot use image refs;
  - remove sessionStorage handoff only after it applies.
- Descartes review findings:
  - Dropped image uploads can desync `uploadedImageUrl` from `uploadedImageUrls[0]`; fix should set scalar from the same computed `uploadedImageUrls` source-of-truth array.
  - Video upload/drop paths can clear only `uploadedImageUrl` while leaving stale `uploadedImageUrls`; fix should clear both when entering ordinary V2V/video input.
- Runtime facts checked after port confusion:
  - `19300` process cwd is `/home/k8r1m/Open-Generative-AI-main-19300`; branch `main`.
  - `19400` process cwd is `/home/k8r1m/Open-Generative-AI`; branch `feature/omni-v1-adjacent-controls`.
  - Exact served client bundle strings confirm generated-image reference code is absent from `19300` and present on `19400`.

## Evidence So Far

- Local branch created: `feature/omni-v1-native-media`.
- Official Google docs rechecked for `gemini-omni-flash-preview`; model ID remains current preview Omni surface.
- Existing gateway behavior traced: image providers fail closed when live gates are off; video fake fallback must be closed for Omni.
- Existing wrapper contract traced from `/home/k8r1m/merlin/bin/genai-omni` and skill reference; runtime will use repo-local wrapper, not call the skill.
- UI executor reported passing:
  - `node --test tests/nativeVideoStudioWiring.test.js`
  - `node --test tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js`
- Backend executor reported passing:
  - `node --test tests/nativeOmniVideoProvider.test.js`
  - `node --test tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeGrokVideoProvider.test.js tests/nativeVertexVideoProvider.test.js tests/nativeSchedulerRecovery.test.js`
  - `node --test tests/nativeGatewayPayloads.test.js tests/nativeUploadAssets.test.js tests/nativeCredentialBoundary.test.js`
  - syntax checks for changed JS/Python and scoped `git diff --check`

## Next

- Code-reviewer subagent found one prompt-projection issue; fixed by stripping `prompt`, `parameters`, and `inputs` from public Omni job projections only.
- Post-fix verification passed.
- Keep gateway session and Next session running for Karim's `19400` Omni test.
- Stop before later Omni V1 phases until Karim tests Omni on `19400`.

## Leader Verification

- `node --test tests/nativeOmniVideoProvider.test.js tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeGrokVideoProvider.test.js tests/nativeVertexVideoProvider.test.js tests/nativeVertexImageProvider.test.js tests/nativeCodexImageProvider.test.js tests/nativeGatewayPayloads.test.js tests/nativeUploadAssets.test.js tests/nativeCredentialBoundary.test.js tests/nativeSchedulerRecovery.test.js tests/nativeRouteVersioning.test.js`
  - Result: 193 pass, 0 fail.
- `node --check` on changed gateway JS, `python3 -m py_compile native-media-gateway/bin/genai-omni`
  - Result: pass.
- `npm run build:studio`
  - Result: pass.
- `git diff --check`
  - Result: pass.
- Code-reviewer:
  - Initial result: request changes for Omni prompt exposure in public projection.
  - Fix result: leader patched and reran focused/full verification above.

## Runtime For Karim

- Gateway: `http://127.0.0.1:19335`
  - Session id: `15295`
  - Env includes shared root `/home/k8r1m/Open-Generative-AI/.native-media`
  - Env includes `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`
  - Env includes `NATIVE_MEDIA_LIVE_VERTEX=1`, `NATIVE_MEDIA_LIVE_CODEX=1`, `NATIVE_MEDIA_LIVE_GROK=1`, `NATIVE_MEDIA_LIVE_OMNI=1`
- Next app: `http://127.0.0.1:19400`
  - Session id: `13826`
  - Env includes `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335`
- Runtime smoke:
  - `GET http://127.0.0.1:19400/api/native-media/v1/health` returned ok.
  - `GET http://127.0.0.1:19400/api/native-media/v1/capabilities` returned 7 models including `native.vertex.gemini-omni-flash-preview` with provider `omni` and provider concurrency `omni: 1`.

## Merge / Media Preservation Note

- Karim confirmed the first real Omni generation on `19400` worked.
- Before merging code back to `main`, preserve visibility of the real Omni videos generated during this `19400` test window.
- These generated videos are not git-tracked code changes; they live in the shared `NATIVE_MEDIA_ROOT` state:
  - `/home/k8r1m/Open-Generative-AI/.native-media/jobs.json`
  - `/home/k8r1m/Open-Generative-AI/.native-media/assets/*`
- Main must continue using this same media root, or the specific new Omni job/asset records generated during this test window must be copied forward by job id.
- Do not backfill unrelated old media as part of this merge. Preserve the first confirmed Omni video and the next 2-3 Omni test videos Karim generates after the resolution-card UI fix.
- Current small follow-up fix: Omni generated video cards display `480p` next to `6s`, but the output is `720p`; fix the UI display metadata without touching provider execution.
- Follow-up UI fix completed by executor subagent:
  - Omni cards use `720p` display metadata instead of stale selector state.
  - Hidden resolution state is cleared when the selected native video model has no resolution choices.
  - No backend/provider behavior changed.
- Follow-up UI verification:
  - `node --test tests/nativeVideoStudioWiring.test.js tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js`
    - Result: 23 pass, 0 fail.
  - `npm run build:studio`
    - Result: pass.
- `19400` was restarted after the UI fix and capability smoke still returns 7 models with Omni provider `omni`, cap `1`.

## Omni Test Media To Preserve

- Confirmed generated Omni videos from the `19400` test window:
  - Job: `job-2f59f7dd-999f-435d-a150-758f1efa00cd`
  - Asset: `asset-5cfbf113-a64c-4435-9599-611e4989dd42`
  - Status: `completed`
  - Created: `2026-07-01T19:25:43.933Z`
  - Completed: `2026-07-01T19:26:32.339Z`
  - Job: `job-d904b46e-1079-4c1e-b388-7b620a30cfa3`
  - Asset: `asset-7671ad2c-4d24-4a52-b86d-d0a55fe74e27`
  - Status: `completed`
  - Created: `2026-07-01T20:32:16.653Z`
  - Completed: `2026-07-01T20:33:05.173Z`
  - Job: `job-fc2bce1e-582d-49f2-b36f-818cff0e222d`
  - Asset: `asset-d790f779-84ce-4496-b612-e963e2ddd4ac`
  - Status: `completed`
  - Created: `2026-07-01T20:35:50.301Z`
  - Completed: `2026-07-01T20:36:47.115Z`
  - Job: `job-da61f686-6967-444f-bf7a-7906ca88990a`
  - Asset: `asset-2025af7d-17cd-4f72-bff2-b492110ea2a7`
  - Status: `completed`
  - Created: `2026-07-01T20:41:05.321Z`
  - Completed: `2026-07-01T20:41:48.656Z`
- Failed `19400` Omni test-window jobs to preserve as visible failures, not gallery media:
  - `job-fa2e4b45-05ec-481d-8482-a434f60a76eb`: `OMNI_OUTPUT_MISSING`
  - `job-9b55a593-1203-4740-a6ab-1608edb9e4af`: `OMNI_OUTPUT_MISSING`
- Preserve the completed job/assets above after merge; keep failed jobs as visible failed history only if the main runtime reads the same `.native-media` root.

## New Issue While Testing

- Karim refreshed `19400` and the newly generated Omni cards showed `No prompt provided` where the prompt should be.
- Karim does not want prompts lost when merging to main.
- Read-only investigation result from the previous subagent:
  - Prompt data is still stored privately in `.native-media/jobs.json`.
  - Refresh hydration loses prompts because Omni public job/library projections strip `prompt`.
  - `packages/studio/src/components/VideoStudio.jsx:normalizeServerHistoryEntry()` uses `item.prompt || ""`, so stripped public prompts render as `No prompt provided`.
  - This bug is currently feature-branch-local but would affect `main` if merged as-is.
- Approved fix: restore `prompt` in public Omni responses; keep `parameters`, `inputs`, private diagnostics, raw provider dumps, and local secret paths redacted.
- Prompt-hydration fix completed by executor subagent:
  - `native-media-gateway/server.js` now redacts Omni `parameters` and `inputs`, but no longer strips `prompt` from public job/library responses.
  - `tests/nativeOmniVideoProvider.test.js` now asserts public Omni prompts are returned while private fields remain hidden.
  - `node --test tests/nativeOmniVideoProvider.test.js` passed in the subagent lane.
- Task list for this issue is in `/home/k8r1m/Open-Generative-AI/feature-dev/omni-v1/task-list.md`.

## Latest Omni Failure To Investigate

- Karim ran two successful Omni generations, then job `job-fa2e4b45-05ec-481d-8482-a434f60a76eb` failed in the UI with:
  - `Native generation job job-fa2e4b45-05ec-481d-8482-a434f60a76eb ended with failed: Omni finished without returning a verified MP4.`
  - Source line in UI: `packages/studio/src/nativeMedia.js:389`, `terminalNativeError()`.
- A later prompt-edited retry appears to have worked.
- Read-only subagent result:
  - Persisted status: `failed`.
  - Persisted error: `OMNI_OUTPUT_MISSING`.
  - Safe message: `Omni finished without returning a verified MP4.`
  - No verified MP4 asset/output was produced.
  - Nearby Omni jobs `job-fc2bce1e-582d-49f2-b36f-818cff0e222d` and `job-da61f686-6967-444f-bf7a-7906ca88990a` completed with verified assets, so the live provider pipeline is generally working.
  - There was another nearby `OMNI_OUTPUT_MISSING` job, which suggests prompt/content/provider-output sensitivity rather than a broken scheduler/auth/model path.
  - No additional merge-blocking provider-code fix is indicated from this job; current behavior is the desired visible failure with no completed gallery card.

## Immediate Next Steps

1. Let Karim finish/continue live `19400` testing.
2. Give Fable the planning brief and this state file.
3. Fable should decide whether to:
   - fix generated-image-to-Video-Studio handoff in the current feature branch;
   - temporarily disable/remove the broken Video Studio action before merging working adjacent features;
   - or split working features from broken WIP into a cleaner merge branch.
4. Preserve `.native-media` assets and verified generated Omni media during any merge/restart.

## Orchestration Note

- Added to `AGENTS.md`: when orchestrating subagents, close each subagent promptly after its final output has been captured and summarized. Do not leave completed agents open across subsequent orchestration steps.

## Video Studio Reference Attempt Status

- Root cause was split image-reference state in Video Studio:
  - `uploadedImageUrls` is the real multi-reference list.
  - `uploadedImageUrl` is the single visible/start-frame mirror and must equal `uploadedImageUrls[0] || null`.
- Attempted fix was implemented to keep that invariant across restore, generated-image handoff, image drop/upload, ordinary video input, V2V/non-V2V model switches, and trim/clear paths.
- Important attempted correction: compatible native image-capable model switches preserve/trim existing refs and set `imageMode(true)`, so controls, visible refs, and generation path should agree.
- Automated verification after the attempted correction:
  - `node --test tests/nativeVideoStudioWiring.test.js tests/nativeGeneratedReferenceHandoff.test.js`: 15 pass, 0 fail.
  - JSX parse via Babel for `VideoStudio.jsx`: pass.
  - `git diff --check -- packages/studio/src/components/VideoStudio.jsx tests/nativeVideoStudioWiring.test.js`: pass.
  - `npm run build:studio`: pass.
  - Broader focused regression with dot reporter: 84 pass, 0 fail.
- Runtime after fix:
  - Restarted only the feature Next dev server on `http://127.0.0.1:19400`.
  - Left `19300` main and the `19335` native gateway untouched.
  - Smoke passed: `/studio` 200, `/api/native-media/v1/health` 200, `/api/native-media/v1/capabilities` 200.
- Live result:
  - Karim reported the generated image still does not appear in Video Studio after clicking the action.
  - Treat automated/source tests as insufficient.
  - Required next diagnosis must trace the full live path: generated card click action, same-origin guard, sessionStorage payload write, shell tab switch, handoff nonce, Video Studio mount/effect consumption, visible input rendering, and repeat attempts after model changes.

## 19300 Main Runtime Repair

- Karim reported `19300` failed with `Runtime TypeError: Cannot read properties of undefined (reading 'call')` from `.next/server/app/studio/[[...slug]]/page.js`.
- A debugger subagent was assigned and the leader repaired runtime isolation.
- Root cause:
  - `19300` had been serving from the active repo worktree, so switching to `feature/omni-v1-adjacent-controls` exposed uncommitted adjacent WIP to the main runtime.
  - The clean `main` service worktree initially had stale workspace links pointing back into the active feature worktree, causing `design-agent` / `workflow-builder` module resolution failures.
  - `packages/studio/src/index.js` duplicated `isNativeModelId` through two star exports; this was narrowed to explicit `nativeModelRegistry` exports.
- Runtime fix:
  - `open-generative-ai.service` now uses `WorkingDirectory=/home/k8r1m/Open-Generative-AI-main-19300`.
  - `open-generative-ai-native-worker.service` now uses the same clean worktree and `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media`.
  - The clean worktree has local workspace package links for `studio`, `design-agent`, `workflow-builder`, and `ai-agent`.
  - `.next` was regenerated in the clean worktree.
- Verification:
  - `GET http://127.0.0.1:19300/studio` returns 200.
  - `GET http://127.0.0.1:19300/api/native-media/v1/health` returns 200.
  - `GET http://127.0.0.1:19300/api/native-media/v1/capabilities` returns 200.
  - Native worker reports shared root `/home/k8r1m/Open-Generative-AI/.native-media`.
- State note:
  - The clean service worktree has a local `package-lock.json` diff from `npm install --ignore-scripts`; do not merge that artifact into adjacent feature work unless intentionally reviewed.
  - The active feature branch also received the same narrowed `nativeModelRegistry` export to prevent the duplicate-export issue from reappearing when adjacent work resumes.

## Latest Verification

- Phase 5 executor verification:
  - `node --test tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js tests/nativeVideoStudioWiring.test.js tests/nativeImageStudioReferenceState.test.js`
  - Result: 41 pass, 0 fail.
  - Syntax checks on changed gateway/studio/test files passed.
- Review subagent verification:
  - `node --test tests/nativeGeneratedReferenceHandoff.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeVideoStudioWiring.test.js tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js tests/nativeRouteVersioning.test.js`
  - Result: 47 pass, 0 fail.
  - No blocking findings.
- Leader combined focused suite:
  - `node --test tests/nativeGeneratedReferenceHandoff.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeVideoStudioWiring.test.js tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeRouteVersioning.test.js tests/nativeOmniVideoProvider.test.js tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js`
  - Result: 82 pass, 0 fail.
- Leader broad native/studio regression:
  - `node --test tests/nativeOmniVideoProvider.test.js tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeGrokVideoProvider.test.js tests/nativeVertexVideoProvider.test.js tests/nativeVertexImageProvider.test.js tests/nativeCodexImageProvider.test.js tests/nativeGatewayPayloads.test.js tests/nativeUploadAssets.test.js tests/nativeCredentialBoundary.test.js tests/nativeSchedulerRecovery.test.js tests/nativeRouteVersioning.test.js tests/nativeMediaLibraryClient.test.js tests/nativeMediaLibraryServer.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeGeneratedReferenceHandoff.test.js`
  - Result: 229 pass, 0 fail.
- Build and static checks:
  - `git diff --check`: pass.
  - `node --check native-media-gateway/server.js && node --check native-media-gateway/exports.js && node --check native-media-gateway/bin/extract-last-frame.js && node --check packages/studio/src/nativeMedia.js && node --check packages/studio/src/index.js`: pass.
  - `npm run build:studio`: pass after repairing incomplete `node_modules`; package metadata remained unchanged.
  - `npm run lint`: not runnable because `next lint` prompts for interactive ESLint configuration.
- Runtime `19400`:
  - Feature gateway restarted on `http://127.0.0.1:19335`; live gates and shared `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media` preserved.
  - Feature Next preview restarted on `http://127.0.0.1:19400`; it proxies native media to `http://127.0.0.1:19335`.
  - First native-media route compile took 38.7s after restart; subsequent smoke passed.
  - `GET http://127.0.0.1:19400/studio`: 200, no module/runtime/build error markers.
  - `GET http://127.0.0.1:19400/api/native-media/v1/health`: 200.
  - `GET http://127.0.0.1:19400/api/native-media/v1/capabilities`: 200 with Omni provider present.
- Adjacent-controls combined focused suite after Phase 2 and Phase 3:
  - `node --test tests/nativeMediaLibraryClient.test.js tests/nativeVideoStudioWiring.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeMediaLibraryServer.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeRouteVersioning.test.js`
  - Result: 55 pass, 0 fail.
- Post-merge verification on `main` before creating the new branch:
  - Merge commit: `d17eefe` (`Merge real Omni provider after 19400 validation`).
  - Focused regression: `node --test tests/nativeOmniVideoProvider.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeModelCatalog.test.js tests/nativeRouteVersioning.test.js`
  - Result: 34 pass, 0 fail.
  - `npm run build:studio`
  - Result: pass.
- Broad native regression:
  - `node --test tests/nativeOmniVideoProvider.test.js tests/nativeModelCatalog.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeGatewayLibrary.test.js tests/nativeGatewayServer.test.js tests/nativeGrokVideoProvider.test.js tests/nativeVertexVideoProvider.test.js tests/nativeVertexImageProvider.test.js tests/nativeCodexImageProvider.test.js tests/nativeGatewayPayloads.test.js tests/nativeUploadAssets.test.js tests/nativeCredentialBoundary.test.js tests/nativeSchedulerRecovery.test.js tests/nativeRouteVersioning.test.js`
  - Result: 194 pass, 0 fail.
- Focused regression:
  - `node --test tests/nativeOmniVideoProvider.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeModelCatalog.test.js tests/nativeRouteVersioning.test.js`
  - Result: 34 pass, 0 fail.
- Studio build:
  - `npm run build:studio`
  - Result: pass.
- Syntax/cleanliness:
  - `git diff --check`
  - `node --check native-media-gateway/server.js`
  - `node --check native-media-gateway/exports.js`
  - `node --check native-media-gateway/omniVideoProvider.js`
  - `node --check native-media-gateway/scheduler.js`
  - `python3 -m py_compile native-media-gateway/bin/genai-omni`
  - Result: pass.
- Runtime restart:
  - Gateway restarted on `http://127.0.0.1:19335` with the prior process environment preserved and shared root `/home/k8r1m/Open-Generative-AI/.native-media`.
  - Next app remains on `http://127.0.0.1:19400`.
- Runtime smoke through `19400`:
  - health OK.
  - capabilities status 200.
  - Omni model provider `omni`.
  - provider concurrency `omni: 1`.
  - Public completed Omni job `job-2f59f7dd-999f-435d-a150-758f1efa00cd` has a prompt field.
  - Public completed Omni job still hides `parameters`, `inputs`, `detail`, and `omniDiagnostics`.
