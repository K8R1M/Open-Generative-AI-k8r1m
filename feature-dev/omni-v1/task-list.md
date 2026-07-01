# Omni V1 Task List

## Current Stop

- Active work is now allowed only for the narrow prompt-hydration fix and read-only failure investigation Karim requested.
- Do not merge to `main` until the prompt fix is verified on `19400` and the failed-job investigation has a clear result.
- Do not update or restart `19300`.
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

## Active Issues

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

## Next Tasks

1. Identify new successful Omni test-window jobs/assets to preserve during the merge.
2. Review diff and prepare a scoped commit that excludes unrelated pre-existing dirty files unless intentionally needed.
3. Merge back to `main` after verification is clean; preserve only the new Omni test media generated in this test window.
4. Create a new branch for the remaining planned feature phases after the merge.
