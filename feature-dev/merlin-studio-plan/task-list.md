# Merlin Studio Task List

Source: `00-README.md` status `FINAL -- PHASE 1 APPROVED`.
Scope for this orchestration window: Phase 1 slices 00, 01, 02 only; stop at Gate A.

## Bookkeeping

- [x] Create `task-list.md` from slice docs.
- [x] Create append-only `execution-log.md`.
- [x] Keep `task-list.md` current after each completed step.
- [x] Keep `execution-log.md` current after every deviation, review verdict, blocker, and gate state.
- [x] Agent availability note: GLM quota is exhausted; until quota returns, default coding agents are native GPT-5.5 medium and code-review agents are native GPT-5.5 high.
- [x] Session handoff requested before context clear.

## Phase 1 -- Stabilise & Ship

### Slice 00 -- Image->Video Handoff Fix + Browser Test Harness

- [x] 00.1 Reproduce in the browser first with failing `tests/e2e/handoff-repro.spec.js` scenarios a-c and log failures.
- [x] 00.2 Add Playwright harness, config, scripts, and temp `NATIVE_MEDIA_ROOT` fixture safety.
- [x] 00.3 Fix D2: delete `uploadedImageUrl` state and derive it from `uploadedImageUrls`.
- [x] 00.4 Fix D1 + D3: single mount-time handoff/persistence writer, pure `planReferenceHandoff`, delete-before-apply failures.
- [x] 00.5 Fix D4: model switches preserve refs and hide nothing silently.
- [x] 00.6 Add warning chip UI for refs selected on a model that cannot consume them.
- [x] 00.7 Finish required unit/e2e/regex/build tests green.
- [x] 00.8 Manual gate note: Karim tests on 19400; do not touch 19300.
- [x] 00.R Apply review protocol in `99-verification-and-regression.md` §3.

### Slice 01 -- Gateway Hygiene

- [x] 01.A Fix `asset_deleted` reconciliation bug and add/read-only live clobber count to log.
- [x] 01.B Add ungated `PATCH /library/:id` rename endpoint and tests.
- [x] 01.C Add gated `POST /projects/frame-from-job` endpoint with `frames.js`, helper export, `projects.js`, and tests.
- [x] 01.D Fix Grok adapter to accept generated/derived assets and extend tests.
- [x] 01.V Run required slice validation and regression checklist.
- [x] 01.R Apply review protocol in `99-verification-and-regression.md` §3.

### Slice 02 -- Naming / Rename UI on Generated Cards

- [x] 02.1 Add client rename function and wire `displayName` into both studios' generate calls.
- [x] 02.2 Add name input in VideoStudio bottom bar, then ImageStudio.
- [x] 02.3 Add rename overlay button and handler in VideoStudio, then ImageStudio.
- [x] 02.4 Show `displayName` on cards in both studios.
- [x] 02.5 Add required naming e2e test.
- [x] 02.6 Run `npm run build:studio` and regression checklist.
- [x] 02.R Apply review protocol in `99-verification-and-regression.md` §3.

### Gate A -- Stop for Karim

- [x] Gate A: slices 00-02 implemented and independently reviewed.
- [x] Gate A: stop for Karim's manual script in `99-verification-and-regression.md` §4.
- [x] Gate A: do not run slice 03 without Karim sign-off.
- [x] Gate A: Karim manual testing feedback captured in `gate-a-karim-testing-feedback.md`.
- [x] Gate A: orchestrator status for Fable captured in `gate-a-orchestrator-status-for-fable.md`.
- [x] Gate A: Fable review of manual feedback and implementation (root causes in `execution-log.md` 2026-07-02 Fable entry).
- [x] Gate A: correction plan approved by Karim (scope decisions given to Fable; plan: `gate-a-correction-plan.md`).
- [x] Gate A: manual sign-off granted by Karim (now happens at Gate A2 below).

### Gate A Correction (per `gate-a-correction-plan.md`)

#### Slice C0 -- Runtime hygiene (GPT 5.5, FIRST)

- [x] C0.1 Restart the 19335 dev gateway from this worktree with `NATIVE_MEDIA_VEO_REFERENCE_IMAGES=true`.
- [x] C0.2 Create gitignored `.env.local` pinning `NATIVE_MEDIA_GATEWAY_URL` + `NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES`; restart 19400 app.
- [x] C0.3 Add boot `sourceFingerprint`/`startedAt` to gateway health endpoint.
- [x] C0.4 Add `native-media-gateway/bin/check-fresh.sh` staleness guard.
- [x] C0.5 Add `tests/nativeHealthFingerprint.test.js`; build green.
- [x] C0.6 Add pre-flight rule to `99-verification-and-regression.md` §4; verify rename + grok-with-prompt now work (stale-code baseline retest).
- [x] C0.R Review protocol per 99 §3.

#### Slice C1 -- Gateway contract fixes (GPT 5.5)

- [x] C1.1 Real validation error messages via `validationError` pass-through.
- [x] C1.2 Prompt optional for image/video-input generation tasks; providers omit empty prompt.
- [x] C1.3 Veo capability truth (`veoMaxReferenceImages` reflects flag) + refs⊕frames exclusivity + refs 16:9 enforcement.
- [x] C1.4 Upload hardening: 250MB/empty cap server-side; client MIME allowlist narrowed to png/jpeg/webp/mp4.
- [x] C1.5 `tests/nativeValidationMessages.test.js` + standing suites + build green.
- [x] C1.R Review protocol per 99 §3.

#### Slice C2 -- Studio UX fixes (GLM 5.2, after C1)

- [x] C2.1 Sticky name + `-NNN` auto-suffix (`nameSequence`), delete clear-on-submit + dead naming code; naming e2e extended.
- [x] C2.2 Never retarget on handoff; trim + persistent warning chip on capacity drop; handoff plan test updated; model-stability e2e.
- [x] C2.3 Veo two-mode UI (Frames vs References, refs lock 8s/16:9); wiring tests + veo-reference-mode e2e.
- [x] C2.4 Native mp4 video upload path for Omni (no MuAPI); native-video-upload e2e.
- [x] C2.5 `LazyVideo` history cards (IntersectionObserver + teardown); video-cards-survive-tabs e2e.
- [x] C2.6 Build + full Playwright + regression checklist green.
- [x] C2.R Review protocol per 99 §3.

#### Slice C3 -- Cross-tab generation registry (GPT 5.5, after C2)

- [x] C3.1 `generationRegistry.js` module (track/settle/subscribe/consume/resumeAll, localStorage-backed).
- [x] C3.2 `onSubmitted` hook in `generateNativeMedia`; studio integration both studios.
- [x] C3.3 ImageStudio `mergeServerHistory` stale-prune parity fix.
- [x] C3.4 `tests/nativeGenerationRegistry.test.js` + cross-tab-generation e2e.
- [x] C3.5 Build + full suites + regression checklist green.
- [x] C3.R Review protocol per 99 §3.

#### Gate A2 -- Karim retest (blocks slice 03)

- [x] Gate A2: pre-flight (check-fresh, app env, suites green).
- [x] Gate A2: Karim runs the 12-step script in `gate-a-correction-plan.md` §7.
- [x] Gate A2: sign-off recorded; slice 03 unblocked (with §2.2 systemd env amendment).

### Slice 03 -- Phase 1 Ship (Gate A2 Signed Off; Partially Complete)

- [x] 03.A Rebrand to Merlin Studio on the feature branch.
  - [x] 03.A.logo Source logo received: `/home/k8r1m/Open-Generative-AI-main-19300/public/merlin-studio-logo-v1.jpg` (`1983x793`, original untouched).
  - [x] 03.A.logo Wire the logo into the app header/sidebar with minimal rebrand, then build/check.
- [x] 03.B Merge gate to main (local `main` fast-forwarded to `ac4cc2b`; not pushed).
- [x] 03.C Configure systemd hosting on 19300.
- [x] 03.D Open Phase 2 branch/runtime policy.
- [x] 03.R Recovery complete: 19300 production build restored, all native live provider flags verified, logo mark visibility fixed, and `main` ready to push.

## Phase 2 -- Merlin Studio Features (Not In Scope This Window)

### Slice 04 -- Capability Flags

- [ ] 04.1 Add normalized `capabilities` block to each native model.
- [ ] 04.2 Add `getModelCapabilities()` accessor and zero default.
- [ ] 04.3 Convert existing helpers into thin wrappers where safe.
- [ ] 04.4 Add `tests/nativeCapabilityContract.test.js`.
- [ ] 04.5 Update `tests/fixtures/nativeContract.js` if needed.

### Slice 05 -- Projects Sidecar Store + Gateway API

- [ ] 05.1 Implement `native-media-gateway/projects.js` module layout.
- [ ] 05.2 Enforce storage invariants, queued atomic writes, and index rebuild.
- [ ] 05.3 Implement `validateProjectDocument(doc)`.
- [ ] 05.4 Implement AssetRef resolution and variant status refresh on read.
- [ ] 05.5 Wire routes and safe errors; add PUT proxy export if needed.
- [ ] 05.6 Add `projectsClient.js` and `projectsModel.js`.
- [ ] 05.7 Add required projects store, resolution, and model tests.

### Slice 06 -- Media Library Tab

- [ ] 06.1 Add backend `GET /uploads` route and test.
- [ ] 06.2 Add `MediaLibrary.jsx` and gated Library tab wiring.
- [ ] 06.3 Add merged generated/upload data and card actions.
- [ ] 06.4 Add drag/drop upload handling.
- [ ] 06.5 Add required media library e2e test.

### Slice 07 -- References Library + @tag Prompt Composer

- [ ] 07.1 Implement pure `promptComposer.js` with listed rules.
- [ ] 07.2 Add prompt composer unit tests.
- [ ] 07.3 Build Projects tab v0 and References UI.
- [ ] 07.4 Add shared `useServerMedia()` hook and allowed MediaLibrary refactor.
- [ ] 07.5 Add "Add to Reference..." card actions.
- [ ] 07.6 Add required unit and e2e tests.

### Slice 08 -- Storyboard Board

- [ ] 08.1 Replace Projects v0 shell with board layout.
- [ ] 08.2 Build `ShotBoard.jsx`, `ShotCard.jsx`, and `ShotDetailPanel.jsx`.
- [ ] 08.3 Extend `projectsModel.js` helpers for board operations.
- [ ] 08.4 Add unit and e2e storyboard tests.

### Slice 09 -- Shot Generation

- [ ] 09.1 Guard model selection and model capability.
- [ ] 09.2 Compose prompt using `composePrompt`.
- [ ] 09.3 Surface warnings before submit.
- [ ] 09.4 Create optimistic variant.
- [ ] 09.5 Call existing `generateNativeMedia`.
- [ ] 09.6 Persist submit response status/jobId.
- [ ] 09.7 Refresh existing variants from project read path.

### Slice 10 -- Continuity

- [ ] 10.1 Call `frameFromJob(variant.jobId)`.
- [ ] 10.2 Set source shot `lastFrame`.
- [ ] 10.3 Find or create target next shot.
- [ ] 10.4 Set target `firstFrame` and copy references.
- [ ] 10.5 Save and select target shot.
- [ ] 10.6 Enforce capability guard at generation time.

### Slice 11 -- Prompt Templates

- [ ] 11.1 Implement gated prompt-template gateway CRUD and hand parser.
- [ ] 11.2 Add template list/editor UI in Projects tab.
- [ ] 11.3 Add prompt insertion in `ShotDetailPanel`.
- [ ] 11.4 Add client functions in `projectsClient.js`.
- [ ] 11.5 Add gateway unit and e2e tests.

## Later Gates

- [ ] Gate B: post-slice 06 manual checkpoint on 19400 only.
- [ ] Gate C: post-slice 09 manual checkpoint on 19400 only.
- [ ] Gate D: post-slice 11 Fable final review, then one Phase 2 merge/redeploy.
