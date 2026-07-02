# Merlin Studio Execution Log

Append-only. Newest entries go at the bottom.

## 2026-07-02 -- Orchestration start

- Scope: orchestration step 3 from `00-README.md`; Phase 1 slices 00, 01, 02 only.
- Stop condition: Gate A for Karim's manual testing on 19400; no slice 03, no `main`, no port 19300, no Phase 2.
- State files created: `task-list.md`, `execution-log.md`.
- Existing worktree state before slice execution: dirty working tree with plan files and prior feature changes already present; preserve all existing changes and do not revert user work.
- Subagent policy for this session: all coding and all code reviewing delegated to native subagents; leader owns orchestration, state files, integration, and Gate A stop.

## 2026-07-02 -- Slice execution dispatch

- Slice 00 executor subagent: `019f203b-e3d9-7423-bc08-4baec145778f` (`executor`), scoped to `slice-00-handoff-fix.md`.
- Slice 01 executor subagent: `019f203c-1683-71e1-aaec-737af1e1cf36` (`executor`), scoped to `slice-01-gateway-hygiene.md`.
- Constraint repeated to both: implement only their slice doc, do not touch `main`, 19300, slice 03, Phase 2, `task-list.md`, or `execution-log.md`.

## 2026-07-02 -- Slice 01 executor result

- Executor subagent: `019f203c-1683-71e1-aaec-737af1e1cf36`.
- Completed steps reported: 01.A, 01.B, 01.C, 01.D, and validation run.
- Files reported changed: `native-media-gateway/scheduler.js`, `native-media-gateway/exports.js`, `native-media-gateway/server.js`, new `native-media-gateway/projects.js`, new `native-media-gateway/frames.js`, `native-media-gateway/grokVideoProvider.js`, `app/api/native-media/[[...path]]/route.js`, `packages/studio/src/nativeMedia.js`, `tests/nativeStartupRecovery.test.js`, `tests/nativeGrokVideoProvider.test.js`, new `tests/nativeLibraryRename.test.js`, new `tests/nativeFrameFromJob.test.js`, refreshed `graphify-out/graph.json`.
- Verification reported passing: `node --test tests/nativeStartupRecovery.test.js`, `tests/nativeLibraryRename.test.js`, `tests/nativeFrameFromJob.test.js`, `tests/nativeGrokVideoProvider.test.js`, standing native gateway/library/model/scheduler tests, `tests/nativeRouteVersioning.test.js`, `npm run build:studio`, and `git diff --check`.
- Verification reported failing: `npx playwright test` because three slice-00 handoff repro specs still fail; treated as slice 00 pending, not slice 01 rejection by itself.
- Read-only live tombstone count reported: total jobs `119`; `assetDeleted === true && status !== "asset_deleted"` count `33`; clobbered `OUTCOME_UNKNOWN/NO_VERIFIED_OUTPUT` count `27`; no live repair performed.
- Review status: pending independent `code-reviewer` review.

## 2026-07-02 -- Slice 01 review round 1

- Reviewer subagent: `019f2043-5ac4-7502-9c08-e8242aa4b8e5` (`code-reviewer`).
- Verdict: CHANGES.
- Findings:
  - HIGH: `npx playwright test` failed slice-00 handoff repro specs; logged as slice 00 pending, not a slice 01 backend acceptance point.
  - HIGH: diff containment warning because current worktree includes out-of-scope UI/package/planning changes and `nativeMedia.js` non-status changes; requires executor/fixer to distinguish slice 01 changes from pre-existing or concurrent slice 00/02 work without reverting unrelated edits.
  - MEDIUM: `native-media-gateway/projects.js` `frameFromJob` must verify PNG signature before `saveDerivedFrameAsset`; non-empty bytes alone are not enough.
- Reviewer tests: passed `git diff --check`, `npm run build:studio`, slice 01 gateway tests, and most standing core tests; failed `tests/nativeMediaLibraryClient.test.js` at line 304 and Playwright handoff repro specs.
- Next action: send review findings to slice 01 executor for bounded changes; keep 01.V and 01.R unchecked until revalidation and approval.

## 2026-07-02 -- Slice 01 review-fix result

- Executor subagent: `019f203c-1683-71e1-aaec-737af1e1cf36`.
- Changed files reported: `native-media-gateway/projects.js`, `tests/nativeFrameFromJob.test.js`, refreshed `graphify-out/graph.json`.
- Fix: added PNG magic-byte validation before `saveDerivedFrameAsset`; invalid helper bytes now return `FRAME_EXTRACTION_FAILED`; test proves invalid bytes do not create a new asset.
- Tests reported passing: `node --test tests/nativeFrameFromJob.test.js`, `tests/nativeStartupRecovery.test.js`, `tests/nativeLibraryRename.test.js`, `tests/nativeGrokVideoProvider.test.js`, `npm run build:studio`, and scoped `git diff --check`.
- `tests/nativeMediaLibraryClient.test.js` remains failing at line 304; executor reports it is a source-string assertion against `VideoStudio.jsx`, outside slice 01 scope.
- Diff containment note: executor reports its `packages/studio/src/nativeMedia.js` slice-01 change is only `asset_deleted` in `TERMINAL_NATIVE_STATUSES`; other non-status diffs belong to the pre-existing dirty worktree or other slices and were not reverted.
- Review status: pending round 2 independent review.

## 2026-07-02 -- Slice 01 review round 2

- Reviewer subagent: `019f204f-ca37-7093-9376-1005ad8a092c` (`code-reviewer`).
- Verdict: APPROVE.
- Findings: no slice-01-owned blockers.
- Confirmed: `projects.js` validates PNG signature before `saveDerivedFrameAsset`; `tests/nativeFrameFromJob.test.js` regression verifies invalid bytes return `FRAME_EXTRACTION_FAILED` and do not create another asset directory.
- Reviewer tests passed: slice 01 tests, standing native gateway/library/model/scheduler tests, `tests/nativeRouteVersioning.test.js`, `npm run build:studio`, and `node --check` on slice 01 gateway modules.
- Known failure outside slice 01: `tests/nativeMediaLibraryClient.test.js` line 304 source-string assertion against `VideoStudio.jsx`; reviewer assessed it as concurrent UI/source-string issue, not slice 01 gateway hygiene.
- Residual risk noted: `native-media-gateway/bin/extract-last-frame.js` is slightly outside the literal slice 01 diff list but appears necessary because the base branch lacked the doc-described helper route.
- Slice 01 status: approved.

## 2026-07-02 -- Slice 00 executor result

- Executor subagent: `019f203b-e3d9-7423-bc08-4baec145778f`.
- Completed steps reported: 00.1 through 00.8.
- Files reported changed: `packages/studio/src/components/VideoStudio.jsx`, `components/StandaloneShell.js`, new `playwright.config.js`, new `tests/e2e/handoff-repro.spec.js`, new `tests/nativeVideoStudioHandoffPlan.test.js`, updates to `tests/nativeVideoStudioWiring.test.js`, `tests/nativeGeneratedReferenceHandoff.test.js`, `tests/nativeMediaLibraryClient.test.js`, `package.json`, `package-lock.json`, refreshed `graphify-out/graph.json`.
- Required pre-fix repro: `npx playwright test tests/e2e/handoff-repro.spec.js --reporter=line` failed before the fix, so executor proceeded.
- Verification reported passing after fix: `npx playwright test --reporter=line` (`4 passed`), `npx playwright test tests/e2e/handoff-repro.spec.js --repeat-each=3 --reporter=line` (`12 passed`), touched unit/regex tests, standing native gateway/library/catalog/media client/media server/scheduler/startup checks, `npm run build:studio`, `git diff --check`.
- Acceptance evidence reported: no `setUploadedImageUrl` / scalar state remains; e2e used `.native-media-test/e2e`; `.native-media`, `.native-media-test`, and `test-results` clean after run; port 19300 untouched.
- Review status: pending independent `code-reviewer` review.

## 2026-07-02 -- Slice 00 review round 1

- Reviewer subagent: `019f20f0-61bd-7771-8158-3bf0cb8fd237` (`code-reviewer`).
- Verdict: CHANGES.
- Findings:
  - MEDIUM: `VideoStudio.jsx` silently clears handoff refs when switching to a non-motion-control V2V model; must keep refs visible and warn per `02-target-architecture.md` §7.
  - LOW: `playwright.config.js` inherits `NATIVE_MEDIA_PROJECTS` and `NEXT_PUBLIC_STUDIO_PROJECTS`; harness must explicitly run with those flags unset.
- Reviewer tests passed: slice 00 unit/regex tests, Playwright handoff repro repeat, `npm run build:studio`, standing core native set; real `.native-media` fingerprint unchanged.
- Open risk noted: Playwright created untracked `test-results/`.
- Next action: send bounded fixes to slice 00 executor; keep 00.7 and 00.R unchecked until revalidation and approval.

## 2026-07-02 -- Slice 00 review-fix result

- Executor subagent: `019f203b-e3d9-7423-bc08-4baec145778f`.
- Changed files reported: `packages/studio/src/components/VideoStudio.jsx`, `playwright.config.js`, `tests/nativeVideoStudioWiring.test.js`, refreshed `graphify-out/graph.json`.
- Fixes: removed remaining `clearImageRefs()` path from incompatible/non-motion-control V2V model selection; updated Playwright webServer envs to omit `NATIVE_MEDIA_PROJECTS` and `NEXT_PUBLIC_STUDIO_PROJECTS`; updated regex test for the no-clear contract.
- Tests reported passing: slice 00 unit/regex plus `tests/nativeMediaLibraryClient.test.js` (`40/40`), Playwright handoff repro repeated 3x (`12/12`), `npm run build:studio`, `git diff --check`, grep showing no `clearImageRefs` matches, targeted no-clear script, and project-flag env check.
- Remaining issues reported: none from review pass; existing Browserslist warning unchanged.
- Review status: pending round 2 independent review.

## 2026-07-02 -- Slice 00 review round 2

- Reviewer subagent: `019f20f9-b5dc-7832-96ed-3fa7a51b20c5` (`code-reviewer`).
- Verdict: APPROVE.
- Findings: none.
- Confirmed: `clearImageRefs` removed from implementation; Playwright strips `NATIVE_MEDIA_PROJECTS` and `NEXT_PUBLIC_STUDIO_PROJECTS`; target §7/§9 conformance for derived `uploadedImageUrl`, delete-before-apply handoff consumption, mounted nonce path via `selectedModelRef`, warning strip, and isolated Playwright root/env setup.
- Reviewer tests passed: slice 00 unit/regex tests, Playwright handoff repro repeated 3x (`12/12`), and `npm run build:studio`.
- Residual risk noted: no `lsp_diagnostics` tool available; build used as diagnostic. Playwright left `test-results/.last-run.json`.
- Slice 00 status: approved.

## 2026-07-02 -- Slice 02 executor result

- Executor subagent: `019f20fe-1b0c-7833-b4ea-a218459eff11`.
- Completed steps reported: 02.1 through 02.6.
- Files reported changed: `packages/studio/src/nativeMedia.js`, `packages/studio/src/components/VideoStudio.jsx`, `packages/studio/src/components/ImageStudio.jsx`, new `tests/e2e/naming.spec.js`, refreshed `graphify-out/graph.json`.
- Implementation reported: `renameNativeLibraryItem(jobId, displayName)`, `displayName` wired into both studios' native generate calls, optional `Name (optional)` inputs, native-only Rename action with `Pencil` and `window.prompt('Rename generation', current)`, local history update after rename, display-name card line in both studios.
- Verification reported passing: `npm run build:studio`, `node --test tests/nativeMediaLibraryClient.test.js`, `tests/nativeLibraryRename.test.js`, standing native unit set from 99, `npx playwright test tests/e2e/naming.spec.js` (`3 passed`), full `npx playwright test` (`7 passed`), `graphify update /home/k8r1m/Open-Generative-AI --force`.
- Notes: no live provider generation; generate-with-name covered by request/card behavior, rename persistence by temp gateway store and reload; Playwright used `.native-media-test/e2e`; real `.native-media` not used.
- Review status: pending independent `code-reviewer` review.

## 2026-07-02 -- Slice 02 review

- Reviewer subagent: `019f2108-a3fa-7192-8f84-9cc7f2f4e496` (`code-reviewer`).
- Verdict: APPROVE.
- Findings: none.
- Diff containment: slice 02-owned changes contained to `ImageStudio.jsx`, `VideoStudio.jsx`, `nativeMedia.js`, new `tests/e2e/naming.spec.js`, and acceptable `graphify-out/graph.json` refresh.
- Confirmed: name inputs in both studios clear after successful submit; `displayName` sent through `generateNativeMedia`; native-only Rename uses `window.prompt("Rename generation", current)` with `Pencil`; local history updates; deleted/tombstoned jobs fail via backend 404/409; no fake provider success path; new fetches go through `nativeMedia.js`.
- Reviewer tests passed: `node --test tests/nativeMediaLibraryClient.test.js`, `node --test tests/nativeLibraryRename.test.js`, `npx playwright test tests/e2e/naming.spec.js --reporter=line` twice, full `npx playwright test --reporter=line`, `npm run build:studio`.
- Real `.native-media` non-log file changes after test start: `0`.
- Residual risks: no `lsp_diagnostics` tool exposed; build used as diagnostic. Test run left normal untracked harness artifacts `.native-media-test/` and `test-results/`.
- Slice 02 status: approved.

## 2026-07-02 -- Gate A reached

- Phase 1 slices 00, 01, and 02 are implemented and independently reviewed.
- Stop condition reached: Gate A for Karim's manual testing on 19400 per `99-verification-and-regression.md` §4.
- Not run: slice 03, main merge, rebrand, systemd hosting, port 19300, Phase 2.
- Next required action: Karim manually tests Gate A on 19400. Only after explicit sign-off should slice 03 begin.

## 2026-07-02 -- Gate A manual feedback captured

- Karim manually tested the feature worktree on `19400` and reported multiple findings.
- Verbatim feedback file created: `feature-dev/merlin-studio-plan/gate-a-karim-testing-feedback.md`.
- Orchestrator status file for Fable created: `feature-dev/merlin-studio-plan/gate-a-orchestrator-status-for-fable.md`.
- Gate status: reached but not signed off.
- Noted successful paths from Karim feedback: Nano Banana 2 image with multiple refs; name-at-generate produced correct card/download name for that generation; Image-to-Video handoff basic path; Omni native video generation; last-frame to next generation first-frame; native Codex image with refs; Image Studio reference handoff; Nano Banana Pro from reference; Veo 3.1 Fast generation; delete after refresh.
- Noted failing/problem paths from Karim feedback: name field clears after one generation; rename fails on image and video cards; Grok/Imagine 1.5 native generation returns 400 invalid native media request; video upload to Gemini Omni returns 403 credentials error; Veo model switch keeps only one of two refs; adding image from Image Studio can retarget Video Studio model back to Omni; Video Studio thumbnails/playback disappeared until hard refresh; running generation results should continue polling across tab changes.
- Operational miss recorded: dev app was initially not running/exposed on `19400` when Karim was told to test; later started and verified at `http://100.83.177.65:19400/studio`.
- Next required action: Fable review/investigation and a Karim-approved correction plan before any slice 03, main, 19300, or Phase 2 work.

## 2026-07-02 -- Fable Gate A investigation (root causes)

- Fable investigated all Gate A findings with subagents and verified the load-bearing claims against source. Full detail to be captured in the Gate A correction plan after discussion with Karim.
- DECISIVE ENVIRONMENT FINDING: both gateway processes (19334 pid 3330915 started 02:46; 19335 pid 3362896 started 03:11) predate the slice-01 gateway code, which reached disk at 06:02 (`server.js`, `exports.js`, `grokVideoProvider.js`, `scheduler.js`). Node does not hot-reload; Karim's entire manual test therefore hit a gateway with NO slice-01 code (no `PATCH /library/:id`, no Grok generated-asset support, no tombstone fix). The 19400 Next app (started 11:29, `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335`) had current proxy code. Consequence: rename failure is explained by the stale process, and every slice-01 behavior remains manually UNVERIFIED. Gateways must be restarted and Gate A retested.
- Rename ("failed to rename generation"): proxy exports PATCH correctly (`route.js:54-57`); gateway handler exists on disk (`server.js:338-343`, `exports.js:975-996`); e2e passed because Playwright boots a fresh gateway process per run. Stale-process issue only; no code fix.
- Name field clearing: implemented exactly per `slice-02-naming-ui.md:19` ("Input clears after successful submit"). Karim's expected sticky-name + auto-numbering (-001/-002) was never in the spec — spec gap, new work. Dead scaffolding from an abandoned earlier auto-naming pass remains (`nextImageDisplayName` ImageStudio.jsx:172-174, `nextVideoDisplayName` VideoStudio.jsx:220, unused `nameCounter` state); the two mystery `image-studio-0001/0002` names (jobs created 07-01 21:53/23:01) were produced by that abandoned wiring, not by any backfill. 8 of 128 jobs have `displayName`; older cards correctly show nothing per spec.
- Grok/Imagine 1.5 instant 400: gateway `validateGenerationRequest` (`exports.js:231`) requires a non-empty prompt for ALL tasks, while the i2v UI labels the motion prompt "(optional)" (VideoStudio.jsx ~1848) and the client never enforces it. Additionally the stale gateway lacked Grok generated-asset support. Fix direction: make prompt optional server-side for image-to-video; retest after restart.
- Omni video upload 403: video uploads go exclusively through legacy MuAPI `uploadFile` (`muapi.js:204-252`) with `apiKey=null` in keyless native mode -> MuAPI's hosted API returns the 403. No native video upload path exists client-side even though the gateway supports Omni video inputs (`omniMaxVideos: 3`). Client fix: native-model video uploads must route through `POST /uploads` like images do.
- Veo keeps 1 of 2 refs: `handleModelSelect` silently trims to capacity (`trimImageRefs`, VideoStudio.jsx:1283-1328); warning only fires for zero-capability models, not capacity shrink — violates `02-target-architecture.md` §7.3 "trims (never clears) AND warns". Veo capacity is 1 because `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES` is off.
- Handoff retargets model to Omni: `planReferenceHandoff` (VideoStudio.jsx:171) retargets whenever the current model's capacity is `<= 1`, regardless of handoff size — Veo (capacity 1) always bounces to Omni even for a single image. Fix: retarget only when handoff size exceeds capacity (or keep+trim+warn per §7.3).
- Video thumbnails vanish until hard refresh: tab switching unmounts studios (`StandaloneShell.js:409-410`); VideoStudio eagerly mounts a real `<video>` per history card (up to 50) with no unmount cleanup; repeated remount cycles exhaust Chromium's video decoder pool so new `<video>` elements silently fail. Images use `<img>` — unaffected. Fix: poster/lazy-mount videos + explicit cleanup.
- Cross-tab polling: poll loop lives inside the mounted studio (`nativeMedia.js:447-470` via `handleGenerate`); unmount orphans results (React no-ops setState); hydration is one-shot at mount. No shared job registry exists. Fix: lift pending-job tracking/polling above the tab switch (StandaloneShell-level).
- Stale-material sweep: `feature-dev/fable-portal-planning-brief.md` and both research folders moved to `feature-dev/_archive/2026-07-02/`; `feature-dev/README.md` rewritten as a pointer to this plan.
- Google Flow research for Stage B captured in `research-google-flow/flow-features.md` (+ `flow-vs-higgsfield.md` when complete).
- Next: Fable discusses findings + clarifying questions with Karim, then writes the Gate A correction/amendment plan.

## 2026-07-02 -- Gate A correction plan written (Fable)

- Karim decisions recorded: sticky name + auto-suffix (`name`, `name-001`, `name-002`...); never auto-retarget model on handoff, trim + warn instead; enable Veo reference images (both flags); FULL correction scope including cross-tab polling registry and video card rework before slice 03.
- Additional verified research folded in: Veo 3.1 references (3 max, asset-type only, 8s + 16:9 only, MUTUALLY EXCLUSIVE with first/last frame — hence the two-mode Veo UI in slice C2.3); two disconnected veo-ref env flags (client + gateway); upload MIME client/server mismatch; no upload size cap; Omni video inputs classified by MIME with role cosmetic; Omni Interactions API (`previous_interaction_id` chaining) researched and parked as a Phase 2 slice input (`research-google-flow/omni-interactions-api.md`).
- Correction plan created: `gate-a-correction-plan.md` — slices C0 (runtime hygiene/restart/fingerprint), C1 (gateway contract: real validation messages, prompt-optional i2v, veo capability truth + exclusivity, upload hardening), C2 (GLM: sticky naming, no-retarget + trim-warn chip, Veo two-mode UI, native mp4 upload for Omni, LazyVideo cards), C3 (cross-tab generation registry), Gate A2 12-step retest script.
- `task-list.md` updated with C0-C3 + Gate A2 checkboxes; PLAN STATUS updated in `00-README.md`.
- Orchestration handoff: GPT 5.5 executes C0 → C1 → C2 (GLM) → C3, then Gate A2 retest by Karim, then slice 03 with its §2.2 systemd env amendment.

## 2026-07-02 -- Session handoff preparation

- Karim reported GLM quota is exhausted, so GLM cannot be used as a coding agent right now.
- Agent routing constraint until quota returns: default coding implementation should use native GPT-5.5 medium subagents; code review should use native GPT-5.5 high subagents.
- Fable has read the current state and rewritten the plan; Karim intends to paste Fable's new prompt/plan into the next session after context clear.
- No code fixes were made in this step. Purpose: preserve state and create a session handoff so the next session can follow Fable's new plan.

## 2026-07-02 -- Gate A correction C0 runtime hygiene

- Scope: executed `gate-a-correction-plan.md` slice C0 only. Not touched: slice 03, `main`, port 19300, or destructive `.native-media` cleanup.
- Runtime restart: old 19335 gateway pid `3362896` from `/home/k8r1m/Open-Generative-AI` was stopped; 19334 main-worktree gateway pid `3330915` was left untouched. New 19335 gateway pid `4150198` launched from this worktree with `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media` and `NATIVE_MEDIA_VEO_REFERENCE_IMAGES=true`.
- App pinning: created gitignored `.env.local` with `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335` and `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES=true`; restarted 19400 dev app. Process env check on pids `4146311`/`4146314` showed both vars exported.
- Code changes: `native-media-gateway/server.js` now exposes health `startedAt`, `pid`, `sourceFingerprint`, and `port`; new `native-media-gateway/bin/check-fresh.sh`; new `tests/nativeHealthFingerprint.test.js`; §4 pre-flight rule added to `99-verification-and-regression.md`.
- Live verification: `curl http://127.0.0.1:19335/api/native-media/v1/health` returned pid `4150198`, port `19335`, and source fingerprint `1782984031443.4355`; `native-media-gateway/bin/check-fresh.sh 19335` returned fresh.
- Stale-code baseline retest: 19400 proxy `PATCH /library/job-cc0b33cf-f648-4440-aafb-975fa819c763` returned 200 and the original display name `Skydiver-03` was restored immediately; Grok I2V submit with generated asset `asset-8315251a-2f11-44de-a613-f5d258cfe228` and typed prompt returned 201/running, then job `job-e65a9f9e-a002-4a39-80ef-1505d525edbd` was cancelled.
- Tests passed: `node --test tests/nativeHealthFingerprint.test.js`; `node --test tests/nativeGatewayServer.test.js`; `bash -n native-media-gateway/bin/check-fresh.sh`; executor also reported `npm run build:studio` passed.
- Review: code-reviewer `019f2222-f9e7-77d3-9dc8-b9ca73fb1040` first returned CHANGES because refreshed `graphify-out/graph.json` indexed ignored runtime media; graph diff was removed by restoring the prior tracked graph file. Round 2 verdict APPROVE; remaining changes none.
- Slice C0 status: approved. Next action: execute C1 gateway contract fixes.

## 2026-07-02 -- Gate A correction C1 gateway contract fixes

- Executor subagent: `019f2229-94df-7a03-895e-c3495c8fc5d9` (`executor`, GPT-5.5 medium per routing constraint).
- Completed steps reported: C1.1 through C1.5.
- Files reported changed: `native-media-gateway/exports.js`, `native-media-gateway/vertexVideoProvider.js`, `native-media-gateway/grokVideoProvider.js`, `native-media-gateway/omniVideoProvider.js`, `native-media-gateway/bin/genai-video`, `native-media-gateway/bin/genai-omni`, `packages/studio/src/nativeMedia.js`, new `tests/nativeValidationMessages.test.js`, and touched provider tests for updated contracts.
- Implementation summary: validation errors now pass through as real 400 response bodies; prompt is optional only for input-driven video paths and empty prompts are omitted from provider args/parts; `/capabilities` reports `veoMaxReferenceImages` from `NATIVE_MEDIA_VEO_REFERENCE_IMAGES`; Veo refs reject frame mixes and non-16:9 AR; upload validation rejects empty and >250MB payloads; client upload MIME allowlist narrowed to png/jpeg/jpg/webp/mp4.
- Executor tests passed: `node --test tests/nativeValidationMessages.test.js`; `node --test tests/nativeVertexVideoProvider.test.js tests/nativeGrokVideoProvider.test.js tests/nativeOmniVideoProvider.test.js`; `node --test tests/nativeStartupRecovery.test.js tests/nativeLibraryRename.test.js tests/nativeFrameFromJob.test.js tests/nativeRouteVersioning.test.js`; `node --test tests/nativeGatewayServer.test.js tests/nativeGatewayLibrary.test.js tests/nativeMediaLibraryClient.test.js tests/nativeGatewayPayloads.test.js tests/nativeModelCatalog.test.js`; `npm run build:studio`; scoped `git diff --check`.
- Reviewer subagent: `019f2231-0c7a-7a50-9121-a0c9ca4f3795` (`code-reviewer`, GPT-5.5 high).
- Review verdict: APPROVE. No C1 findings.
- Reviewer verification passed: `tests/nativeValidationMessages.test.js` (`4/4`), provider tests (`44/44`), standing native gateway/client set (`69/69`), `npm run build:studio`, `git diff --check`, `node --check` on touched JS gateway files, and `python3 -m py_compile` on both wrapper bins. Tests used `.native-media-test`; existing real `.native-media` changes were pre-existing.
- Slice C1 status: approved. Next action: restart live 19335 with C1 code, then execute C2 studio UX fixes.

## 2026-07-02 -- Gate A correction C2 studio UX fixes

- Executor: Sonnet in the right-hand team pane, taking over the C2 slice after the initial GPT worker was stopped at Karim's request. Sonnet was instructed to follow `gate-a-correction-plan.md` exactly, keep or replace the partial GPT diff at its own judgement, and not update state files.
- Completed steps reported: C2.1 through C2.6.
- Files reported changed: `packages/studio/src/components/ImageStudio.jsx`, `packages/studio/src/components/VideoStudio.jsx`, `packages/studio/src/components/LazyVideo.jsx`, `tests/nativeVideoStudioWiring.test.js`, `tests/nativeImageStudioReferenceState.test.js`, `tests/nativeVideoStudioHandoffPlan.test.js`, `tests/e2e/naming.spec.js`, `tests/e2e/handoff-model-stability.spec.js`, `tests/e2e/veo-reference-mode.spec.js`, `tests/e2e/native-video-upload.spec.js`, `tests/e2e/video-cards-survive-tabs.spec.js`, and `tests/fixtures/tiny-real.webm`.
- Implementation summary: sticky generation naming with `-001`/`-002` style suffixes and reload persistence; handoff no longer retargets models and emits a persistent kept-count warning when refs are trimmed; Veo exposes mutually exclusive Frames/References modes with reference constraints; native Omni mp4 upload uses the native upload route with inline validation instead of MuAPI; video cards use `LazyVideo` with IntersectionObserver and teardown so history survives tab churn.
- Executor verification reported: all touched `node --test` suites pass individually, `npm run build:studio` passes, full Playwright suite passes, C2-focused Playwright tests pass twice for flake check, and real `.native-media` was not touched.
- Reviewer subagent: `019f229b-243f-7911-b134-20cd7bd5c2d7` (`code-reviewer`, GPT-5.5 high).
- Review verdict: APPROVE. Findings: none.
- Reviewer verification passed: `node --test tests/nativeVideoStudioHandoffPlan.test.js tests/nativeVideoStudioWiring.test.js tests/nativeImageStudioReferenceState.test.js tests/nativeMediaLibraryClient.test.js` (`43/43`), focused C2 Playwright command (`12/12`), repeated focused C2 Playwright command (`12/12`), `npm run build:studio`, `git diff --check`, and pattern scans for dead naming code, retarget warnings, fake/fallback upload paths, teardown, and forbidden scope.
- Residual risk noted: no `lsp_diagnostics` tool exposed; build/Babel plus targeted tests were used as diagnostics.
- Slice C2 status: approved. Next action: execute C3 cross-tab generation registry, then stop at Gate A2 for Karim retest.

## 2026-07-02 -- Gate A correction C3 cross-tab generation registry

- Executor subagent: `019f22a1-dbae-7ae1-8102-3289dbaa7e3c` (`executor`, GPT-5.5 medium).
- Completed steps reported: C3.1 through C3.5.
- Files reported changed: `packages/studio/src/generationRegistry.js`, `packages/studio/src/studioHistory.js`, `packages/studio/src/nativeMedia.js`, `packages/studio/src/components/ImageStudio.jsx`, `packages/studio/src/components/VideoStudio.jsx`, `tests/nativeGenerationRegistry.test.js`, `tests/e2e/cross-tab-generation.spec.js`, `tests/nativeMediaLibraryClient.test.js`, and `tests/nativeVideoStudioWiring.test.js`. `graphify-out/graph.json` churn was restored/removed after review.
- Implementation summary: localStorage-backed singleton registry tracks pending native jobs across tab unmounts/reloads, polls via `pollNativeGeneration`, queues undelivered results, exposes `track`, `settle`, `subscribe`, `consume`, `pendingFor`, and `resumeAll`; `generateNativeMedia` now has additive `onSubmitted(job)`; both studios track/settle/consume/subscribe; ImageStudio now prunes stale native server-backed local entries like VideoStudio.
- Initial executor verification reported: `tests/nativeGenerationRegistry.test.js` (`7/7`), relevant native units (`38/38`), C3 e2e twice (`2/2` each), native sweep (`105/105`), handoff e2e (`6/6`), `npm run build:studio`, `git diff --check`, and `.native-media` non-log guard `0`.
- Review round 1 subagent: `019f22cc-5fd6-7e30-8191-85571250b579` (`code-reviewer`, GPT-5.5 high). Verdict: CHANGES. Finding: failed registry video jobs rendered as normal playable/downloadable cards. Fix: VideoStudio now renders failed entries as explicit failed cards before `LazyVideo`, hides fullscreen/download/last-frame controls, and wiring tests cover the branch.
- Review round 2 subagent: `019f22d4-2791-7612-b999-e4ec944ab2dc` (`code-reviewer`, GPT-5.5 high). Verdict: CHANGES. Finding: C3 e2e used fixed timing and could flake if the job completed before ImageStudio mounted. Fix: e2e now uses test-controlled completion after the target mount/reload proof; executor reran the C3 e2e three times (`2/2` each).
- Review round 3 subagent: `019f22dc-0e9e-7e02-9778-2c051a823cd4` (`code-reviewer`, GPT-5.5 high). Verdict: CHANGES. Finding: `setRefTrimNotice` side effects inside `setUploadedImageUrls` updater callbacks. Fix: moved notice writes outside updater callbacks; updated wiring test to assert the pure helper/deps.
- Final reviewer subagent: `019f22e2-424d-7da2-9146-f3fa1d97614f` (`code-reviewer`, GPT-5.5 high). Verdict: APPROVE.
- Final validation passed: `node --test tests/nativeVideoStudioWiring.test.js tests/nativeGenerationRegistry.test.js tests/nativeMediaLibraryClient.test.js` (`34/34`), `npm run build:studio`, `git diff --check`, and `npx playwright test tests/e2e/cross-tab-generation.spec.js --reporter=line` twice (`2/2` each). Final reviewer also reported C3 e2e twice, build, diff check, no graphify churn, and clean `git status --short -- graphify-out .native-media`.
- Slice C3 status: approved. Next action: Gate A2 pre-flight, then Karim retest per `gate-a-correction-plan.md` §7. Do not start slice 03, main merge, or 19300 work before Gate A2 sign-off.

## 2026-07-02 -- Gate A2 pre-flight ready

- Stop point reached: C0, C1, C2, and C3 are implemented and independently reviewed. Slice 03, `main`, and port `19300` remain untouched.
- Live gateway check: `native-media-gateway/bin/check-fresh.sh 19335` returned `fresh: port=19335 sourceFingerprint=1782984855825.375`.
- Live app: restarted only the feature app on `19400` with `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335` and `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES=true`. Verified `/proc` env for the Next dev process contains both vars.
- Reachability: `curl -I http://127.0.0.1:19400/studio` returned `HTTP/1.1 200 OK`.
- Proxy capability check through `19400`: `/api/native-media/v1/capabilities` returned `native: true`, `modelCount: 7`, `constraints.veoMaxReferenceImages: 3`, and `constraints.omniMaxVideos: 3`.
- Validation evidence from C3 final state: targeted registry/studio/client units `34/34`, `npm run build:studio`, `git diff --check`, and C3 Playwright e2e twice `2/2` each.
- Gate A2 status at that moment: pre-flight complete. Superseded by the Gate A2 sign-off and local main merge entries below.

## 2026-07-02 -- Gate A2 sign-off

- Karim manually retested the Gate A2 checklist on `19400` and reported that all requested test items worked.
- Non-blocking later note 1: while removing image refs from Video Studio with native Grok Imagine selected, Karim observed the selected model had changed to Seedance Lite. Desired later behavior: ref removal never changes the selected model. Recorded in `90-future-work-outline.md`.
- Non-blocking later note 2: repeated Image Studio -> Video Studio reference handoffs currently insert the newest image before earlier refs. Desired later behavior: append each new handoff ref as the next slot, preserving order. Recorded in `90-future-work-outline.md`.
- Gate A2 status: signed off. Karim approved merging the working feature state back to `main`; the two notes are explicitly not blockers.

## 2026-07-02 -- Local main merge and Phase 2 branch alignment

- Commit `ac4cc2b` (`Ship approved Gate A2 native studio fixes`) was created from the Gate A2-approved feature state.
- Local `main` in `/home/k8r1m/Open-Generative-AI-main-19300` was fast-forwarded to `ac4cc2b`. It is now ahead of `origin/main` by 3 commits. No push was performed.
- Port `19300` runtime/systemd was not restarted or reconfigured in this step.
- The continuing feature branch in `/home/k8r1m/Open-Generative-AI` is now `feature/merlin-studio-v1`, matching the Phase 2 branch name in this plan.
- Slice 03 status: 03.B local main merge is complete; 03.A rebrand, 03.C systemd hosting on 19300, and 03.D Phase 2 runtime policy remain.

## 2026-07-02 -- Slice 03 logo source received; fresh-session handoff requested

- Karim saved the candidate Merlin Studio logo at `/home/k8r1m/Open-Generative-AI-main-19300/public/merlin-studio-logo-v1.jpg`.
- File inspection: JPEG, progressive, `1983x793`, about `2.5:1` wide logo ratio. The original file was not modified and no resized copies were created.
- Karim explicitly wants no more substantive work in the current high-context session. Next session should continue from the live state files and preserve handoff, then wire the logo/rebrand minimally on `main`, verify/build, and only then configure systemd hosting on `19300`.
- Current branch alignment remains: `/home/k8r1m/Open-Generative-AI` is `feature/merlin-studio-v1`; `/home/k8r1m/Open-Generative-AI-main-19300` is `main` and contains the untracked logo source.

## 2026-07-02 -- Slice 03 minimal logo/rebrand on main

- Scope: continued Slice 03 only in `/home/k8r1m/Open-Generative-AI-main-19300` on `main`; no Phase 2 feature work started.
- Rebrand changes: header logo now uses `/merlin-studio-logo-v1.jpg`; user-visible metadata/titles/fallback labels now say `Merlin Studio`; Vadoo promo banner state and markup were removed.
- Internal identifiers intentionally unchanged: package names, repo URLs, README provenance, and `packages/studio/package.json` description.
- Checks passed: `npm run build:studio`; `npx playwright test tests/e2e/rebrand-smoke.spec.js --reporter=line` (`1 passed`); `npm run build:packages && npm run build`.
- Playwright setup note: `@playwright/test` was declared in `package.json`/`package-lock.json` but missing from `node_modules`; `npm install` restored declared packages before the focused smoke.
- Remaining Slice 03 work: configure systemd hosting on `19300`, verify app/library health, then update state files again.

## 2026-07-02 -- Slice 03 systemd hosting on 19300

- Created user units: `/home/k8r1m/.config/systemd/user/studio-gateway.service` and `/home/k8r1m/.config/systemd/user/studio-portal.service`.
- Disabled/stopped old dev services: `open-generative-ai.service` and `open-generative-ai-native-worker.service`.
- Enabled/started new services: `studio-gateway.service` runs `native-media-gateway/server.js` on `19334`; `studio-portal.service` runs production `next start --hostname 127.0.0.1 --port 19300`.
- Preserved runtime env: shared `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media`, `NATIVE_MEDIA_LIVE_VERTEX=1`, `NATIVE_MEDIA_LIVE_CODEX=1`, `NATIVE_MEDIA_VEO_REFERENCE_IMAGES=true`, `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, and `NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS=1` on the gateway.
- Verification passed: `systemctl --user status studio-gateway.service studio-portal.service`; gateway health returned `ok: true`, pid `451137` then `451634` after restart, port `19334`, fresh `sourceFingerprint=1783009194661.3186`; `curl -I http://127.0.0.1:19300/studio` returned `HTTP/1.1 200 OK`; `curl -I http://127.0.0.1:19300/merlin-studio-logo-v1.jpg` returned `200 OK` and `Content-Type: image/jpeg`; library proxy returned 5 real items; `systemctl --user restart studio-gateway.service studio-portal.service` survived and both services returned `active`.
- Journal check: latest `journalctl --user -u studio-gateway.service -u studio-portal.service -n 50` showed clean startup/restart logs and native media reconciliation with `unchanged: 146`.
- Linger check: `loginctl show-user "$USER" -p Linger` returned `Linger=yes`.
- Phase 2 policy: `/home/k8r1m/Open-Generative-AI` remains on `feature/merlin-studio-v1`; no Phase 2 feature work was started. From here, `main`, `19300`, and the two `studio-*` services are frozen until Fable Phase 2 review/approval or a future approved Gate D redeploy.

## 2026-07-02 -- Slice 03 production Omni runtime hotfix

- Karim reported that Omni native video generation with a video reference errored on `19300` after the systemd cutover.
- Root cause found by local inspection + subagents: production `studio-gateway.service` initially preserved Vertex/Codex live flags but omitted `NATIVE_MEDIA_LIVE_OMNI=1`; a stale orphan dev gateway was also still listening on `19335`.
- Runtime fix applied: added `Environment=NATIVE_MEDIA_LIVE_OMNI=1` to `/home/k8r1m/.config/systemd/user/studio-gateway.service`, ran `systemctl --user daemon-reload`, restarted `studio-gateway.service` and `studio-portal.service`, and killed orphan pid `4188445` on `19335`.
- Verification passed: `studio-gateway.service`/`studio-portal.service` active; `native-media-gateway/bin/check-fresh.sh 19334` fresh; gateway env includes shared `NATIVE_MEDIA_ROOT`, Google project/ADC, `NATIVE_MEDIA_LIVE_VERTEX=1`, `NATIVE_MEDIA_LIVE_CODEX=1`, and `NATIVE_MEDIA_LIVE_OMNI=1`; `19335` no longer listens; `curl -I http://127.0.0.1:19300/studio` returned `HTTP/1.1 200 OK`.

## 2026-07-02 -- Slice 03 recovery: 19300 portal rebuild + logo mark fix

- Scope: executed `slice-03-recovery-plan.md` Tasks 1-3 in `/home/k8r1m/Open-Generative-AI-main-19300` on `main`. No Phase 2 feature work.
- Root cause confirmed: `.next` existed but held no production build, so `next start` was crash-looping `studio-portal.service`. Gateway (`19334`) was already healthy (all live provider flags present) and needed no change.
- Task 1 - portal restore: ran `npm run build:packages && npm run build`, then `systemctl --user restart studio-portal.service`. Verified: `systemctl --user status studio-gateway.service studio-portal.service` both `active (running)`; `curl -fsSI http://127.0.0.1:19300/studio` returned `HTTP/1.1 200 OK`; `native-media-gateway/bin/check-fresh.sh 19334` returned `fresh: port=19334 sourceFingerprint=1783009194661.3186`; `ss -ltnp` showed `127.0.0.1:19300` and `127.0.0.1:19334` listening, no `19335`, plus the pre-existing Tailscale-IP `19300` forwarder left untouched.
- Task 2 - logo fix: root cause was the padded source JPG, not just CSS (`public/merlin-studio-logo-v1.jpg` is `1983x793` but the trimmed mark bbox is only `1595x200` at offset `(206,299)`, ~25% of image height). Sampled background as near-black (`rgb(2,2,2)`). Created `public/merlin-studio-logo-v1-cropped.jpg` via `sharp().trim({threshold:25}).extend({top:12,bottom:12,left:12,right:12,background:{r:2,g:2,b:2}})`, producing `1619x224` (~7.2:1). Original `merlin-studio-logo-v1.jpg` left untouched. Updated `components/StandaloneShell.js:317-321` to use the cropped asset with `h-7 sm:h-8 w-auto max-w-[220px] sm:max-w-[280px] object-contain`. Rebuilt (`npm run build`) and restarted `studio-portal.service` to serve the change.
- Visual verification: Playwright screenshots of `http://127.0.0.1:19300/studio` header at `1440x900` and `390x844` were captured and inspected (not just claimed). Logo mark is clearly legible, not clipped, at both widths. Screenshots saved to `/tmp/claude-1002/-home-k8r1m-Open-Generative-AI/a1fba23d-87b8-4bac-adf4-b474a7fb31e6/scratchpad/`: `logo-desktop-1440.png`, `logo-desktop-1440-header.png`, `logo-mobile-390.png`, `logo-mobile-390-header.png`.
- Task 3 - focused checks: `node --test tests/nativeOmniVideoProvider.test.js tests/nativeValidationMessages.test.js` passed `11/11` (note: these suites use Node's native test runner, not Jest — `npx jest` on them fails with "must contain at least one test"; `node --test` is correct). Spot-checked live provider capabilities via `GET http://127.0.0.1:19334/capabilities`: Vertex (`nano-banana-2`, `nano-banana-pro`, `veo-3.1`, `veo-3.1-fast`), Omni (`gemini-omni-flash-preview`), Codex (`gpt-image-2`), and Grok (`imagine-video`) all registered with live provider keys — matches the plan's "no env fix needed" baseline.
- Commit: `bc444f7` ("Restore 19300 prod build and fix logo mark visibility") on `main` in this worktree, containing only `components/StandaloneShell.js` and the new `public/merlin-studio-logo-v1-cropped.jpg`. The `.next` rebuild artifact was not committed (gitignored build output). Untracked `.native-media` / `.native-media-test` in this worktree were left alone, not staged.
- Slice 03 recovery status: complete. `main`/`19300` frozen again per existing Phase 2 policy; no Phase 2 feature work started.

## 2026-07-03 -- Slice 03 closed and ready for GitHub push

- Runtime check before push: `studio-gateway.service` and `studio-portal.service` are active; `curl -fsSI http://127.0.0.1:19300/studio` returns `HTTP/1.1 200 OK`; `native-media-gateway/bin/check-fresh.sh 19334` returns fresh; `19335` is not listening.
- Verified production gateway env includes all live native provider gates: `NATIVE_MEDIA_LIVE_VERTEX=1`, `NATIVE_MEDIA_LIVE_CODEX=1`, `NATIVE_MEDIA_LIVE_GROK=1`, and `NATIVE_MEDIA_LIVE_OMNI=1`, with shared `NATIVE_MEDIA_ROOT=/home/k8r1m/Open-Generative-AI/.native-media` and Google ADC/project env.
- `/home/k8r1m/Open-Generative-AI` branch `feature/merlin-studio-v1` was fast-forwarded to the fixed `main` baseline commit `c1c5bd7`; no Phase 2 feature work was started.
- State: Phase 1/Slice 03 is over. Next required step is Fable Phase 2 review before any slices 04-11 implementation.
