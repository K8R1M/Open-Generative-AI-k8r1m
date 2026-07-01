# Omni V1 Implementation State

Updated: 2026-07-02
Branch: `feature/omni-v1-native-media`
Current stop condition: fix prompt hydration, investigate the one `OMNI_OUTPUT_MISSING` failure, re-verify on `19400`, then merge to `main` only after checks are clean and Karim's generated media remains visible.

## Guardrails

- Do not merge to `main` until the prompt hydration fix and failed-job investigation are complete and verified.
- Do not update or restart the `19300` systemd app.
- Do not update `19300` as part of this work.
- No user-facing fake/dummy successful Omni generation. Failed Omni jobs must fail visibly and must not create completed gallery cards.
- Preserve Grok video, Nano Banana 2/Pro image, native Codex image, prompt copy, delete, history hydration, and existing `.native-media` assets.
- Keep generated Omni media from the `19400` test window visible after merge; do not backfill unrelated old media.

## Active Lanes

- Leader: branch/state integration, validation, and `19400` hosting.
- Executor backend lane: completed Omni provider, gateway live gate, scheduler/provider cap, safe error persistence, backend tests.
- Executor UI lane: completed Omni model catalog, Video Studio failed-job display, no failed gallery completion, UI tests.
- Explore subagent lane: read-only investigation of failed job `job-fa2e4b45-05ec-481d-8482-a434f60a76eb`; do not expose prompts, secrets, local credential paths, or raw provider dumps.
- Executor subagent lane: narrow prompt-hydration fix only; public Omni responses may include `prompt`, but must continue to hide `parameters`, `inputs`, private diagnostics, raw provider dumps, and secret paths.

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

1. Identify the new successful Omni test-window jobs/assets to preserve during merge.
2. Review diff and prepare a scoped commit that excludes unrelated pre-existing dirty files unless intentionally needed.
3. Merge to `main` after clean verification, without updating `19300`.
4. Create a new branch for remaining approved feature phases.

## Latest Verification

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
