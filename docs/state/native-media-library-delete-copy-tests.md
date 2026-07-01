# Native Media Library/Delete/Copy State

Updated: 2026-07-01 13:05 IST
Branch: `feat/native-grok-imagine-video`

## Current State

- Native media library/list/delete/copy is implemented.
- Studio hydrates image and video history from the server library and preserves prompts for copy.
- Library delete is jobId-only, tombstones the job, and removes the generated asset directory. Uploads are preserved.
- Historical prompts are returned by the library response; private provider fields remain redacted.
- Fake image completions are blocked in the user-facing gateway path, and ImageStudio rejects completed native image responses that lack a same-origin asset URL.
- Vertex/Nano Banana ADC forwarding is fixed so trusted gateway `GOOGLE_APPLICATION_CREDENTIALS` reaches the Vertex worker. Failure detail redacts child-env credential paths.
- Native media root drift is fixed: unset `NATIVE_MEDIA_ROOT` now defaults to repo-local `.native-media`, not `process.cwd()/.native-media`. Explicit `NATIVE_MEDIA_ROOT` still wins.
- Root `AGENTS.md` records the project rules: do not break existing native media paths, never return fake provider success to users, preserve Vertex ADC env, and use one shared `NATIVE_MEDIA_ROOT` across clones/worktrees/forks or merge stores explicitly.

## Runtime

- App is currently running on `19400`.
- Gateway is currently running on `19335`.
- Gateway was started with `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media`, live Grok/Vertex/Codex gates, and ADC forwarding.
- Karim is still testing. Do not restart or modify behavior until he says testing is complete.

## Verification

- `node --test tests/nativeGatewayServer.test.js tests/nativeGatewayLibrary.test.js tests/nativeRouteVersioning.test.js tests/nativeMediaLibraryServer.test.js tests/nativeMediaLibraryClient.test.js tests/nativeClientPolling.test.js tests/nativeResultNormalization.test.js` passed: `39/39`.
- `node --test tests/nativeVertexImageProvider.test.js tests/nativeVertexVideoProvider.test.js tests/nativeCredentialBoundary.test.js` passed: `75/75`.
- `node --test tests/nativeStoreRoot.test.js tests/nativeGatewayLibrary.test.js tests/nativeMediaLibraryServer.test.js` passed: `12/12`.
- Full native sweep `node --test $(rg --files tests | rg 'native.*\.test\.js$')` passed `229/230`.

## Known Open Issue

- `tests/nativeSchedulerRecovery.test.js:101` fails:
  - `concurrent duplicate clientRequestId reserves before real runProvider starts`
  - Current error: `native inputs must use uploaded asset references`
  - Meaning: current validation happens before duplicate idempotency lookup for a changed duplicate request. This is not the Nano Banana auth path, but it is a real scheduler/idempotency regression signal.
  - Do not patch until Karim is done testing unless he explicitly asks.

## Merge / Next Branch Rules

- Same-worktree merge to `main`: normal git merge should preserve `.native-media` because it is ignored; do not run `git clean -xdf` or delete `.native-media`.
- Separate clones/worktrees/forks: point every gateway at the same `NATIVE_MEDIA_ROOT`, or merge `.native-media/jobs.json`, `.native-media/assets`, and `.native-media/uploads` into the canonical store before switching back. Git will not merge ignored media stores.
- Deleted library items are intentionally absent because server delete tombstones the job and removes the generated asset directory.

## Likely Next Steps

1. Wait for Karim to finish testing on `19400`.
2. If he reports more regressions, investigate read-only first and use GPT-5.5 medium executor subagents for coding; reviewers stay GPT-5.5 high.
3. If testing passes, run/repair the scheduler idempotency test before final merge eligibility.
4. Before merging to `main`, back up `.native-media` and branch commits, then merge in this same worktree or keep `NATIVE_MEDIA_ROOT` pointed at the canonical store.
