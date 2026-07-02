# GPT 5.5 Adversarial Audit — 2026-07-02
## Summary
Overall verdict: the plan is strong enough to execute after targeted corrections, but not safe to mark final as written.
I found 6 findings: 1 BLOCKER, 4 MAJOR, 1 MINOR.
The BLOCKER is a schema/lifecycle contradiction: slice 09 must save a variant before a provider job exists, while the target schema makes `variant.jobId` non-null.
The MAJOR findings are mostly literal-execution traps: helper/export gaps for `frame-from-job`, route flag ambiguity, Grok asset compatibility, and a bad field name in continuity.
The current architecture document is mostly accurate; I spot-checked more than 10 claims against source and listed the ones that held under "Verified sound".
The required full Next production build currently passes (`npm run build` completed successfully), so slice 03 is not blocked by today's production build.
No code was changed; only this audit report and its containing `audit/` directory were created.

## Findings
### F-01 [BLOCKER] Variant drafts cannot be saved before `jobId` exists
- Doc: `02-target-architecture.md` §4; `slice-09-shot-generation.md` §Generation flow; `slice-05-projects-store.md` §Validation
- Claim under attack: Variant schema has `jobId: "job-..."`, while slice 09 says to create and save a variant before calling `generateNativeMedia`, then fill `variant.jobId` only after the submit response.
- Evidence: `feature-dev/merlin-studio-plan/02-target-architecture.md:99-108` defines `variants` with `jobId: "job-..."`; `feature-dev/merlin-studio-plan/02-target-architecture.md:149` locks status enums/shape as written; `feature-dev/merlin-studio-plan/slice-09-shot-generation.md:23-37` says create/save the variant first, then write `variant.jobId` on submit response; `feature-dev/merlin-studio-plan/slice-05-projects-store.md:140-145` routes validation errors through schema validation. A literal validator for the target schema will reject the first save in slice 09 because no native job exists yet.
- Proposed change: Make `Variant.jobId` nullable until submit: `jobId: null | "job-..."`; allow `jobId:null` only for `status:"created"` before submit. Add this case to slice 05 validation tests and slice 09 lifecycle tests.

### F-02 [MAJOR] `frame-from-job` is specified around private helpers that are not exportable as written
- Doc: `slice-01-gateway-hygiene.md` §C; `02-target-architecture.md` §5
- Claim under attack: New `native-media-gateway/projects.js` can reuse `resolveLibraryVideoAsset`, `runLastFrameHelper`, and `saveAsset` to import a last frame as a real asset.
- Evidence: `feature-dev/merlin-studio-plan/slice-01-gateway-hygiene.md:221-229` instructs `projects.js` to reuse `resolveLibraryVideoAsset`, `runLastFrameHelper`, and `saveAsset`; `native-media-gateway/server.js:246-270` defines `runLastFrameHelper` locally inside `server.js`, not in an exported helper module; `native-media-gateway/exports.js:277-292` defines `saveAsset` privately and `native-media-gateway/exports.js:1092-1123` does not export it; `native-media-gateway/exports.js:955-966` defines `resolveLibraryVideoAsset` and exports it at `native-media-gateway/exports.js:1115`. An executor following the doc must either duplicate helper logic, create a circular dependency on `server.js`, or widen exports beyond what the doc explicitly says.
- Proposed change: In slice 01, explicitly move/export the last-frame extraction/import primitives. Minimal: move `runLastFrameHelper` into `native-media-gateway/projects.js` or a tiny `native-media-gateway/frames.js`, export a narrow `saveDerivedFrameAsset(bytes, {derivedFrom})` from `exports.js` instead of exposing raw `saveAsset`.

### F-03 [MAJOR] Feature-flag wording can accidentally gate Phase 1 rename or uploads listing
- Doc: `02-target-architecture.md` §3 and §5; `slice-01-gateway-hygiene.md` §B; `slice-06-media-library-tab.md` §Backend part
- Claim under attack: "All routes 404 unless `NATIVE_MEDIA_PROJECTS=1`" under API additions is safe.
- Evidence: `feature-dev/merlin-studio-plan/02-target-architecture.md:51-56` says the gateway flag gates `/projects` and `/prompt-templates`; `feature-dev/merlin-studio-plan/02-target-architecture.md:153-165` then says all routes in the additions table 404 unless `NATIVE_MEDIA_PROJECTS=1`, but that table also includes `PATCH /library/:id` and `GET /uploads`; slice 01 implements `PATCH /library/:id` for Phase 1 naming (`feature-dev/merlin-studio-plan/slice-01-gateway-hygiene.md:189-211`), before the Projects UI is shipped; slice 06 expects `GET /uploads` for the Library tab (`feature-dev/merlin-studio-plan/slice-06-media-library-tab.md:203-218`). The current proxy only exports GET/POST/DELETE (`app/api/native-media/[[...path]]/route.js:54-56`), so method additions must be deliberate, and accidental project-flag gating would make rename fail whenever projects are off.
- Proposed change: Rewrite §5 gating sentence to: "`/projects/*`, `/projects/frame-from-job`, and `/prompt-templates/*` are gated by `NATIVE_MEDIA_PROJECTS=1`; `PATCH /library/:id` is ungated; `GET /uploads` is ungated unless the final decision explicitly says otherwise." Also state that the Next proxy must export `PATCH` in slice 01 and `PUT` in slice 05.

### F-04 [MAJOR] Project/continuity flows can feed generated assets to Grok, but the live Grok adapter rejects non-upload assets
- Doc: `02-target-architecture.md` §4, §6, §8; `slice-06-media-library-tab.md` §Frontend; `slice-09-shot-generation.md` §Generation flow; `slice-10-continuity.md` §Flow
- Claim under attack: AssetRefs over existing generated/uploaded/derived media can be used by reference-aware generation across native models, reusing the existing generation pipeline.
- Evidence: `feature-dev/merlin-studio-plan/02-target-architecture.md:123-129` allows `AssetRef.kind` values `generated`, `upload`, and `derivedFrame`; `feature-dev/merlin-studio-plan/02-target-architecture.md:180-191` gives models a single `imageInit/referenceImages` capability shape; `feature-dev/merlin-studio-plan/slice-09-shot-generation.md:27-34` sends composed `inputs` through `generateNativeMedia`; `feature-dev/merlin-studio-plan/slice-10-continuity.md:116-125` creates a `derivedFrame` and then uses it as the next shot's `firstFrame`. But the live Grok adapter rejects any input asset whose file path is not under `uploads/`: `native-media-gateway/grokVideoProvider.js:89-93` defines that check and `native-media-gateway/grokVideoProvider.js:145-147` throws for generated assets. Generated/derived assets are saved under `assets/` by `native-media-gateway/exports.js:277-292`, not `uploads/`. Fake provider tests would not catch this live-path break.
- Proposed change: Decide and document one path before Phase 2: either make Grok accept generated/derived native assets from `assets/` with the same MIME/path safety checks, or add an explicit Grok capability/warning that only uploaded assets are accepted and have the composer block generated/derived Grok first-frame/reference inputs.

### F-05 [MAJOR] Continuity step references `source shot.promptRaw`, but shots do not have `promptRaw`
- Doc: `slice-10-continuity.md` §Flow; `02-target-architecture.md` §4
- Claim under attack: Creating a continuation shot can prefill from the source shot's `promptRaw`.
- Evidence: `feature-dev/merlin-studio-plan/slice-10-continuity.md:118-123` says the new shot prompt is prefixed with `source shot's promptRaw`; the Shot schema has `prompt` and `negativePrompt` only at `feature-dev/merlin-studio-plan/02-target-architecture.md:79-89`; `promptRaw` exists on Variant, not Shot, at `feature-dev/merlin-studio-plan/02-target-architecture.md:99-104`. A literal implementation reads `undefined` or invents fallback behavior.
- Proposed change: Replace the wording with a deterministic source: "prefill from the source shot's `prompt`" or "from the pinned/latest variant's `promptRaw`, falling back to `sourceShot.prompt`." The latter preserves provenance if a generated variant was manually refined.

### F-06 [MINOR] `GET /uploads` is scheduled in two places
- Doc: `02-target-architecture.md` §5; `slice-05-projects-store.md` §Routes; `slice-06-media-library-tab.md` §Backend part
- Claim under attack: Slice dependencies are unambiguous for the uploads listing route.
- Evidence: `feature-dev/merlin-studio-plan/02-target-architecture.md:165` lists `GET /uploads` as an API addition; slice 05 says to wire "per the table in `02-target-architecture.md` §5" (`feature-dev/merlin-studio-plan/slice-05-projects-store.md:140-147`), which includes `GET /uploads`; slice 06 then says `/uploads` GET is "specified in §5 but scheduled HERE" and should be implemented in slice 06 (`feature-dev/merlin-studio-plan/slice-06-media-library-tab.md:203-218`). This is not fatal, but two executors can reasonably implement or review the same route in different slices.
- Proposed change: Add one sentence to slice 05: "Do not implement `GET /uploads`; it is intentionally deferred to slice 06." Or move it fully into slice 05 and remove the backend part from slice 06.

## Verified sound
- Branch precondition checked: `git branch --show-current` returned `feature/omni-v1-adjacent-controls`, matching `adversarial-audit-prompt.md`.
- Current architecture topology is accurate for the native proxy: `app/api/native-media/[[...path]]/route.js:1-14` strips cookie/authorization/x-api-key-like hop headers and `app/api/native-media/[[...path]]/route.js:36-51` byte-proxies to the gateway.
- Gateway default host/port match the doc: `native-media-gateway/server.js:11-12` sets `127.0.0.1` and `19334`; `native-media-gateway/server.js:371-378` starts and logs the server/root.
- Gateway route list in `01-current-architecture.md` is accurate for existing methods: health/capabilities/library/generations/assets/uploads/last-frame/delete are in `native-media-gateway/server.js:317-360`.
- Generation request shape is accurate: `native-media-gateway/exports.js:228-260` validates model/task/prompt/parameters/inputs/clientRequestId/displayName, and `native-media-gateway/exports.js:96` allows the documented input roles.
- `publicJob` strips private fields and Omni parameters/inputs as claimed: `native-media-gateway/server.js:13-24` defines private fields and `native-media-gateway/server.js:85-94` filters them.
- Scheduler concurrency matches the plan: `native-media-gateway/scheduler.js:22` has `{ codex:1, grok:1, omni:1, vertex:2 }`.
- The tombstone bug is real: `native-media-gateway/scheduler.js:26-33` omits `asset_deleted`; `native-media-gateway/exports.js:937-953` writes `status:'asset_deleted'`; restart reconciliation treats non-terminal statuses through `native-media-gateway/scheduler.js:335-367`.
- Fail-closed gating is accurate for image tasks and Omni: `native-media-gateway/server.js:96-118` throws `REAL_PROVIDER_UNAVAILABLE` when image/Omni live flags are off, while fake mode is allowed for non-image non-Omni requests.
- Credential boundary is present: request-body credential fields are rejected in `native-media-gateway/exports.js:64-85` and `native-media-gateway/exports.js:210-225`; Vertex/Omni subprocess ADC forwarding is gated in `native-media-gateway/vertexVideoProvider.js:51-88` and `native-media-gateway/omniVideoProvider.js:45-104`.
- Native model count and snapshot are mostly accurate: `packages/studio/src/nativeModels.js:5-13` lists 7 model IDs; model fields for Nano Banana, Veo, Omni, Codex, and Grok are at `packages/studio/src/nativeModels.js:15-108`.
- Client/gateway capability drift risk is real: client constraints are in `packages/studio/src/nativeModels.js:110-131`; gateway constraints are in `native-media-gateway/exports.js:38-62`; tests pin a separate fixture at `tests/fixtures/nativeContract.js:96-124`.
- VideoStudio D1-D4 are real: persistence load writes restored state at `packages/studio/src/components/VideoStudio.jsx:702-751`; handoff consumption separately reads sessionStorage at `packages/studio/src/components/VideoStudio.jsx:951-996`; scalar/list state is written inside functional updaters at `packages/studio/src/components/VideoStudio.jsx:974-978` and `packages/studio/src/components/VideoStudio.jsx:1193-1198`; the ref UI is gated by model capability at `packages/studio/src/components/VideoStudio.jsx:1967-2048`.
- StandaloneShell handoff mechanics match the doc: tab list starts at `components/StandaloneShell.js:15-28`; the handoff writes `sessionStorage` and bumps `referenceHandoffNonce` at `components/StandaloneShell.js:108-119`; ImageStudio/VideoStudio are conditionally rendered at `components/StandaloneShell.js:405-407`, so tab switch unmount/remount behavior is plausible.
- Branding surface for slice 03 is accurate for the shell: Vadoo banner state/block are at `components/StandaloneShell.js:75-78` and `components/StandaloneShell.js:313-335`; wordmark is at `components/StandaloneShell.js:340-348`.
- Existing package scripts match the docs: `package.json:14-23` includes `build`, `start`, `build:studio`, and no test/e2e script yet; `npm ls @playwright/test --depth=0` returned empty, so slice 00 must add it.
- Required production build check passed: `npm run build` completed successfully with "Compiled successfully", generated 9 static pages, and listed the app routes without error.

## Not checked
- I did not read `feature-dev/_archive/` or research folders, per audit prompt.
- I did not run live provider generations; findings about Grok live behavior are source-verified, not live-executed.
- I did not run Playwright because `@playwright/test` and config are not installed yet; slice 00 is responsible for adding them.
- I did not run the full unit suite; this audit focused on plan/source consistency plus the required `npm run build`.
- I did not inspect current long-running 19300/19400 processes or systemd environment; slice 03 includes that capture step.

## Fable adjudication (2026-07-02)

All six findings ACCEPTED. F-02 and F-04 independently re-verified against
source (`server.js:246`, `exports.js:277/1092-1123`,
`grokVideoProvider.js:89-93,145-147`) before acceptance. Plan amendments:

- F-01 → `02-target-architecture.md` §4: `Variant.jobId` nullable only while
  `status:'created'`; `slice-05` validation rule + test case; `slice-09` step 4.
- F-02 → `slice-01` §C rewritten: `runLastFrameHelper` moves to new
  `native-media-gateway/frames.js`; narrow `saveDerivedFrameAsset()` exported
  from `exports.js`; raw `saveAsset` stays private.
- F-03 → `02-target-architecture.md` §5 gating clarified (only `/projects*` +
  `/prompt-templates*` gated; `PATCH /library/:id` and `GET /uploads` ungated);
  proxy method exports (PATCH slice 01, PUT slice 05) stated explicitly;
  `slice-01` §B header marked UNGATED.
- F-04 → new `slice-01` §D: Grok adapter accepts `assets/` alongside `uploads/`
  (rename to `isAllowedNativeAssetPath`, everything else byte-identical);
  tests specified; live Grok spot-check added to Gate A script (`99` §4).
  Rationale: blocking generated refs would cripple the core generated-image →
  Grok-video and continuity workflows; the uploads-only check is an over-tight
  path guard, not a provider requirement.
- F-05 → `slice-10` step 3: prefill priority pinned variant `promptRaw` →
  latest completed variant `promptRaw` → `shot.prompt`.
- F-06 → `slice-05` routes section now explicitly defers `GET /uploads` to
  slice 06.

PLAN STATUS advanced to `FINAL — PHASE 1 APPROVED`.
