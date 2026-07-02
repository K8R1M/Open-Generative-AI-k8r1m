# Omni V1 Task List

## Current Stop

- Omni provider branch has been merged to local `main`.
- Current branch: `feature/omni-v1-adjacent-controls`.
- Active status: Karim is testing `19400`; do not merge because the Video Studio generated-image reference handoff still fails in live manual testing after the attempted fix.
- Emergency `19300` main runtime failure is fixed and verified.
- `19300` now serves from clean worktree `/home/k8r1m/Open-Generative-AI-main-19300`.
- Shared media root remains `/home/k8r1m/Open-Generative-AI/.native-media`.
- Keep `19400` available for testing.

## Completed

- Added real-provider Omni path with `NATIVE_MEDIA_LIVE_OMNI=1`.
- Hosted feature branch on `19400`.
- Fixed Omni card resolution display from stale `480p` to `720p`.
- Recorded confirmed generated Omni media to preserve:
  - Job: `job-2f59f7dd-999f-435d-a150-758f1efa00cd`
  - Asset: `asset-5cfbf113-a64c-4435-9599-611e4989dd42`
- Read-only prompt-loss investigation result:
  - Private `.native-media/jobs.json` still stores prompts.
  - The prompt disappears on refresh because Omni public job/library projections strip `prompt`.
  - This is feature-branch-local now, but would affect `main` if merged without a fix.
- Prompt-hydration fix result:
  - Public Omni job/library responses now include `prompt`.
  - Public Omni responses still hide `parameters`, `inputs`, private diagnostics, raw provider details, and local paths.
  - Focused tests passed: `node --test tests/nativeOmniVideoProvider.test.js tests/nativeClientPolling.test.js tests/nativeVideoStudioWiring.test.js tests/nativeModelCatalog.test.js tests/nativeRouteVersioning.test.js` (34/34).
  - Studio build passed: `npm run build:studio`.
  - Gateway restarted on `19335`; `19400` health/capability smoke passed.
  - Public prompt smoke for job `job-2f59f7dd-999f-435d-a150-758f1efa00cd`: `hasPromptField=true`, `privateFieldsHidden=true`.
- Merged real Omni provider branch to local `main` with merge commit `d17eefe`.
- Created next branch from merged `main`: `feature/omni-v1-adjacent-controls`.

## Completed Issues

- After refreshing `19400`, newly generated Omni cards show `No prompt provided` where the prompt should appear.
- Karim does not want prompts lost in main.
- Approved narrow fix: restore `prompt` in public Omni job/library responses while keeping `parameters`, `inputs`, diagnostics, raw provider dumps, and secret paths private.
- Karim ran two successful Omni generations, then job `job-fa2e4b45-05ec-481d-8482-a434f60a76eb` failed with:
  - UI error: `Omni finished without returning a verified MP4.`
  - Expected persisted category: `OMNI_OUTPUT_MISSING`
  - A later edited-prompt retry appears to have worked.
- Failure investigation must be read-only and handled by a subagent. Do not print prompts, credentials, local secret paths, or raw provider dumps.
- Read-only subagent result for `job-fa2e4b45-05ec-481d-8482-a434f60a76eb`:
  - Persisted status: `failed`
  - Persisted error: `OMNI_OUTPUT_MISSING`
  - Safe message: `Omni finished without returning a verified MP4.`
  - No verified asset/output was produced.
  - Nearby Omni jobs completed with verified assets, so the pipeline is generally working.
  - No additional merge-blocking provider-code fix is indicated from this job; it is already the desired visible-failure behavior.
- Emergency `19300` main repair:
  - Root cause was service/worktree contamination plus stale workspace package links while `19300` was expected to represent `main`.
  - `19300` now runs from `/home/k8r1m/Open-Generative-AI-main-19300`, not the active feature branch worktree.
  - `open-generative-ai-native-worker.service` uses the same clean worktree and shared `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media`.
  - The duplicate `studio` star export from `nativeModelRegistry` was narrowed to explicit exports to avoid Next/webpack ambiguity.
  - Verified `/studio`, native health, and native capabilities all return 200 on `19300`.

## Current Tasks

1. Preserve confirmed working behavior: bulk delete works; adding generated image to Image Studio as reference works.
2. Preserve existing Omni, Grok, Nano Banana, Codex, prompt copy, delete, history hydration, and `.native-media` behavior.
3. Treat generated-image-to-Video-Studio handoff as unresolved despite the attempted code fix and passing source tests.
4. Hand off to Fable planning before further implementation.
5. Naming/rename UI is deferred; do not touch it unless Fable/Karim explicitly plans it.

## Active 19400 Test Feedback

- Bulk delete seems to work.
- Adding a generated image to Image Studio as a prompt/reference works.
- Adding a generated image to Video Studio as a prompt/reference worked once.
- After changing the Video Studio model, the image disappeared from the reference input.
- Going back to Image Studio and trying to add the image to Video Studio again did not work; subsequent attempts also did not work.
- After the attempted root-cause code fix and controlled `19400` restart, Karim tested again and reported it still did not work.
- Manual/live result overrides automated checks: generated-image-to-Video-Studio handoff is NOT accepted.
- Desired behavior:
  - Generated-image-to-Video-Studio handoff should always work.
  - Existing prompt references should survive changing video or image models where possible.
  - If a model cannot accept the current reference type/count, degrade visibly instead of silently losing it.
- Naming feedback is recorded but deferred:
  - Karim did not see a rename box/control.
  - Current Phase 5 naming is implemented as automatic display/download metadata, not an obvious editable rename UI.
  - No naming/rename UI work should happen in the current reference-fix pass.
- Runtime facts checked after port confusion:
  - `19300` currently runs from `/home/k8r1m/Open-Generative-AI-main-19300` on branch `main`.
  - `19400` currently runs from `/home/k8r1m/Open-Generative-AI` on branch `feature/omni-v1-adjacent-controls`.
  - Served bundle on `19300` does not contain generated-image reference feature strings.
  - Served bundle on `19400` does contain generated-image reference feature strings.
- Review findings now being fixed:
  - Dropped image uploads can desync `uploadedImageUrl` from `uploadedImageUrls[0]`.
  - Video upload/drop paths can clear only scalar image state while leaving stale multi-ref state.
- `Ampere` follow-up fix:
  - Dropped image upload now derives scalar `uploadedImageUrl` from the same computed `uploadedImageUrls` array.
  - Ordinary dropped/selected video inputs now clear both `uploadedImageUrl` and `uploadedImageUrls`.
  - Focused leader verification passed: `node --test tests/nativeVideoStudioWiring.test.js tests/nativeGeneratedReferenceHandoff.test.js` = 15 pass, 0 fail.
  - JSX parse check passed: `./node_modules/.bin/babel packages/studio/src/components/VideoStudio.jsx --presets @babel/preset-env,@babel/preset-react --out-file /tmp/VideoStudio.jsx.parse-check.js`.
- `Meitner` final review found the remaining stale hidden-list case:
  - Clearing image refs only under `if (imageMode)` is insufficient when old/persisted hidden state has `imageMode === false` but `uploadedImageUrls` still populated.
  - Required fix: ordinary non-motion-control video upload/drop must clear `uploadedImageUrl` and `uploadedImageUrls` unconditionally before default V2V entry; motion-control remains the preserving path.
- `Sagan` fixed the unconditional-clear issue:
  - Ordinary dropped-video and selected-video paths now clear both image ref states before default V2V entry.
  - Focused leader verification passed: `node --test tests/nativeVideoStudioWiring.test.js tests/nativeGeneratedReferenceHandoff.test.js` = 15 pass, 0 fail.
  - JSX parse check passed, and `git diff --check` passed for the touched files.
  - Broader focused regression passed: 84 pass, 0 fail.
  - `npm run build:studio` passed.
- `Mill` final review found one compatible-switch edge case:
  - If refs exist while `imageMode === false` after motion-control preservation, switching to a native model that supports `image-to-video` but is not I2V-only can still clear refs.
  - Required fix: include existing refs plus target image capability in `nextImageMode`, then trim/preserve refs for compatible native image-capable targets.
- Leader root-cause pass after final patch:
  - Root invariant: `uploadedImageUrls` is the source of truth and `uploadedImageUrl` mirrors `uploadedImageUrls[0]`.
  - Handoff prepends incoming same-origin refs, trims to model capacity, and removes sessionStorage only after successful apply.
  - Ordinary video input clears both image ref states before default V2V.
  - Compatible image-capable model switches now both preserve/trim refs and set `imageMode(true)`, so UI/generation state cannot disagree.
  - Focused verification passed: `node --test tests/nativeVideoStudioWiring.test.js tests/nativeGeneratedReferenceHandoff.test.js` = 15 pass, 0 fail.
  - JSX parse passed: `./node_modules/.bin/babel packages/studio/src/components/VideoStudio.jsx --presets @babel/preset-env,@babel/preset-react --out-file /tmp/VideoStudio.jsx.parse-check.js`.
  - `git diff --check -- packages/studio/src/components/VideoStudio.jsx tests/nativeVideoStudioWiring.test.js` passed.
  - `npm run build:studio` passed.
  - Broader focused regression passed with dot reporter: 84 dots / 84 passing tests.
- Live retest result after the attempted fix:
  - Still failed for Karim on `19400`.
  - Do not mark this issue complete.
  - Fable should plan a proper end-to-end diagnosis before more coding, including the shell action, sessionStorage payload, tab switch, Video Studio consumption, visible input rendering, and repeat attempts after model changes.

## Omni V1 Plan Status

Done / merged to local `main`:

- Real Gemini Omni provider path.
- `NATIVE_MEDIA_LIVE_OMNI=1` real-provider gate.
- Fail-closed behavior: no fake successful Omni generation in user-facing runtime.
- Safe Omni error categories/messages.
- Prompt hydration after refresh.
- Omni card `720p` display fix.
- Completed Omni test media preserved in shared `.native-media`.

Done on `feature/omni-v1-adjacent-controls`:

- Batch delete for generated image/video cards.
- Last-frame download for completed native video cards.
- Generated-image-to-Image-Studio reference action.
- Automatic image/video display/download naming metadata.

Not done / not accepted:

- Generated-image-to-Video-Studio reference action still fails in live `19400` testing.
- Visible naming/prefix input was not built; naming is automatic metadata only.
- Editable rename UI was not built.

Merge status:

- Do not merge `feature/omni-v1-adjacent-controls` to `main` until the Video Studio handoff is fixed and verified, or intentionally disabled/removed from the branch UI.
- Fable should inspect both the clean main worktree and feature worktree instead of requiring a merge first.

## Latest Verification

- Review subagent `Harvey`:
  - No blocking findings.
  - Focused review suite: 47 pass, 0 fail.
- Phase 5 executor `Carson`:
  - Implemented `image-studio-0001` / `video-studio-0001` display/download metadata.
  - Focused Phase 5 suite: 41 pass, 0 fail.
- Leader verification:
  - Combined focused suite: 82 pass, 0 fail.
  - Broad native/studio regression: 229 pass, 0 fail.
  - `git diff --check`: pass.
  - Syntax checks for changed gateway/studio JS: pass.
  - `npm run build:studio`: pass after repairing incomplete `node_modules`; no package metadata changed.
  - `npm run lint`: not runnable because `next lint` prompts to configure ESLint interactively.
- Runtime:
  - Feature gateway restarted on `http://127.0.0.1:19335` with live gates preserved and shared media root.
  - Feature Next preview restarted on `http://127.0.0.1:19400`.
  - `GET /studio`: 200.
  - `GET /api/native-media/v1/health`: 200.
  - `GET /api/native-media/v1/capabilities`: 200 with Omni provider present.
