# Grok 4.3 Audit Report: Native Grok Imagine Video Provider Plan

**Date of audit:** 2026-06-30  
**Repo:** `/home/k8r1m/Open-Generative-AI` (main, clean working tree at start)  
**Audit scope:** Read context/plan/task-list first, then inspected listed code, official xAI docs via fetch, wrapper skill+script, gateway/server/exports/scheduler/providers, client nativeModels/nativeMedia/VideoStudio, tests/fixtures, README, package structure. No code edits performed. All claims cross-verified against actual file contents and fetched docs where possible.

## Verdict
**REQUEST_CHANGES**

The plan correctly identifies the high-level architecture (reuse native media flow, separate adapter, credential-free boundaries, wrapper limits over REST claims). However, multiple inaccuracies, hardcoded Veo assumptions in live code, missing UI/control wiring, validation generalization gaps, dispatch/observability incompleteness, test contract breakage, role/argv mapping details, output parsing mismatch (no MEDIA: in wrapper), cancellation/orphan risk documentation, and incomplete file coverage (e.g., only packages/ paths listed) mean a direct implementation following the plan verbatim would produce broken behavior, incorrect error messages, exposed controls, and failing tests on first build/smoke.

## Findings

- **Severity: Blocker**  
  **Evidence:** `packages/studio/src/components/VideoStudio.jsx:30` (nativeVideoModelToDescriptor always does `lastImageField: "last_image"`, `aspectRatios: m.aspectRatios || ["16:9"]`, etc.; `applyControlsForModel` + `setShowAudio(isNativeModelId(modelId))` at ~579; handleGenerate native I2V path ~1133 uses `model?.referenceImagesEnabled` for slicing + always includes endFrame via nativeInputFromUrl if present; parameters always include `aspectRatio`/`audio`; `getMaxImagesForI2VNative` only uses maxReferenceImages but generation path does not).  
  **Problem:** Proposed catalog flags (`supportsLastFrame: false`, `supportsAspectRatio: false`, `supportsAudioToggle: false`, `referenceImagesEnabled` replacement) have zero consumption in current UI. Grok model would still render end-frame picker, AR selector, audio toggle, and pass unsupported params. Native I2V path uses Veo-specific `referenceImagesEnabled` gate.  
  **Recommended plan amendment:** Explicitly add a task to update `nativeVideoModelToDescriptor`, `applyControlsForModel`, `get*For*Native` helpers, and native I2V generation path to respect new/ existing model flags (e.g. only set `lastImageField` when `supportsLastFrame !== false`; conditional show* and param inclusion). Do not rely on catalog shape alone.

- **Severity: Blocker**  
  **Evidence:** `packages/studio/src/nativeMedia.js:120` (`validateVeoConstraints` called unconditionally inside `buildNativeRequest` for any video model); error strings: "Unsupported Veo duration", "Veo reference images..."; `nativeModels.js:40` (Veo entries set `referenceImagesEnabled` / `referenceDurationSeconds: 8` conditionally); `VideoStudio.jsx:1134` and 1543 use `referenceImagesEnabled`.  
  **Problem:** Grok (and future non-Veo native video) will trigger Veo-named errors and Veo-specific duration/reference rules. Gateway `exports.js:133` (`isVeoModel` + `veoReferenceImagesEnabled()`) and `server.js:41` (publicFailureMessage only for Vertex/rai_media_filtered) are also Veo-tied.  
  **Recommended plan amendment:** Rename/generalize `validateVeoConstraints` to `validateNativeVideoConstraints` (or model-driven); make error messages model-aware or generic ("Unsupported duration for model..."); extend publicFailureMessage and client validation to dispatch by provider or model prefix. Add explicit test that non-Veo native video does not produce "Veo" strings.

- **Severity: Blocker**  
  **Evidence:** `native-media-gateway/exports.js:340` (launchProviderWork has only vertexImage + vertexVideo + codexImage branches + fake; no Grok); `server.js:69` (generationOptions only returns liveVertex/liveCodex; fake = !(liveVertex || liveCodex)); `scheduler.js:20` (PROVIDER_CONCURRENCY = { codex: 1, vertex: 2 }); `exports.js:700` (job records liveVertex/liveCodex only).  
  **Problem:** Adding the model to catalogs without wiring `NATIVE_MEDIA_LIVE_GROK`, provider dispatch branch, concurrency cap `grok:1`, and live* flag propagation will either (a) always fake, or (b) hit "REAL_PROVIDER_UNAVAILABLE" or unhandled provider path.  
  **Recommended plan amendment:** List the exact diff sites for server.js generationOptions + submit path, exports.js launch + submit + job shape + drainQueued, scheduler.js cap + PROVIDER_CONCURRENCY export usage. Include a liveGrok flag parallel to the others.

- **Severity: Major**  
  **Evidence:** `tests/nativeModelCatalog.test.js:29` (`assert.equal(NATIVE_MODEL_IDS.length, 5)`); `tests/fixtures/nativeContract.js:39` (hard list of 5); `nativeModels.js:4` and `exports.js:29` (MODELS + NATIVE_MODELS lists); `nativeGatewayPayloads.test.js`, `nativeVideoStudioWiring.test.js:30` etc. contain Veo-specific assertions.  
  **Problem:** Adding one model makes count 6; many contract and wiring tests will fail immediately. nativeVideoStudioWiring greps for current Veo I2V mapping strings.  
  **Recommended plan amendment:** Plan already lists updates, but add "update all count assertions + fixture lists + any source greps before claiming 'targeted tests pass'".

- **Severity: Major**  
  **Evidence:** Wrapper (`/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py:340`): on success prints JSON `{ok, output, ...}` (not "MEDIA:"); stdout of grok itself goes to .streaming.jsonl; final python print goes to the python process stdout. Vertex `bin/genai-video:219` does emit `MEDIA:${output_path}`. Plan section 8 and provider spec say "MEDIA: stdout path is preferred when present; fixed requested output path is fallback".  
  **Problem:** Adapter code following vertex pattern will not find MEDIA: line; must parse the final JSON result or always trust --output after verify. Wrapper sidecars use `.prompt.txt` etc (plan matches).  
  **Recommended plan amendment:** Specify exact stdout/JSON parsing logic for grokVideoProvider (read final JSON from captured output or trust --output after ffprobe-style verify in scheduler); update "Prefer MEDIA..." language to "Handle wrapper-specific success markers (JSON output field or MEDIA: fallback)".

- **Severity: Major**  
  **Evidence:** `native-media-gateway/exports.js:180` (validateGenerationRequest has model.tasks check + isVeoModel reference gate + Nano-Pro special case); client `nativeMedia.js:160` calls validate for all; no Grok model in MODELS yet; plan catalog puts Grok only under `tasks: ['image-to-video']`.  
  **Problem:** Reference-to-video will arrive as task=image-to-video + multiple reference roles. Plan folds correctly, but gateway/client validation must not reject multi-ref for Grok (current reference checks are Veo-gated in places). Also, role names from client are "first-frame"/"reference" (VideoStudio.jsx:1141); wrapper argv needs `--ref start-composition=...` or similar (plan says adapter maps).  
  **Recommended plan amendment:** Add explicit mapping table in adapter spec: client "first-frame" -> wrapper "start-composition" or "image", "reference" -> "reference-N". Assert in new provider test that only image-to-video task is accepted for the model (ref is multi-input variant of same task).

- **Severity: Major**  
  **Evidence:** `packages/studio/src/components/VideoStudio.jsx:51` (NATIVE_T2V_DESCRIPTORS / I2V_DESCRIPTORS filter on tasks); plan says "Video Studio shows Grok under image-to-video, not text-to-video"; Grok catalog entry will have only image-to-video task.  
  **Problem:** Correct for I2V list. But descriptor builder and applyControlsForModel / get*Native helpers still execute for any native video model that leaks into T2V path; no early guard that Grok model never appears in T2V descriptors. If tasks check is the only filter, OK, but generation path must also reject text-to-video for it (plan lists in test).  
  **Recommended plan amendment:** Add explicit guard in client generation + gateway validate: if modelId === 'native.grok.imagine-video' && task !== 'image-to-video' then reject before any spawn.

- **Severity: Major**  
  **Evidence:** `native-media-gateway/server.js:41` (publicFailureMessage only knows Vertex/rai_media_filtered + reauth); `exports.js` has no grok classification; plan lists GROK_AUTH_UNAVAILABLE, GROK_QUOTA..., GROK_POLICY_FILTERED, GROK_TIMEOUT, OUTPUT_MISSING, PROVIDER_LAUNCH_FAILED. Wrapper failure paths produce specific strings in logs (ffprobe fail, timeout 124, nonzero, "max_turns_reached").  
  **Problem:** Grok errors will fall through to generic or leak raw detail. Classification must be added to both publicJob path and adapter diagnostics.  
  **Recommended plan amendment:** Extend publicFailureMessage (or add classifyGrokFailure) in server.js + exports; wire from job.detail / grok-diagnostics; tests must cover safe messages only.

- **Severity: Major**  
  **Evidence:** Plan cancellation note ("wrapper starts the Grok CLI in a new session. The gateway can kill the wrapper... but the nested Grok process may need signal-forwarding"); py `run:260` does `start_new_session=True` + killpg on its own timeout; gateway `scheduler.js:310` (cancelSubprocess sends SIGTERM, fallback SIGKILL after 1s, forceSettle); `killProcessGroup` uses -pgid.  
  **Problem:** Plan flags the risk but implementation order must test cancel before live sign-off. No current code guarantees inner grok is reaped when only the python wrapper receives the signal. Wrapper itself only kills group on its timeout path.  
  **Recommended plan amendment:** Add "Pre-merge manual cancel smoke must verify `ps` shows no lingering grok/grok-imagine processes; if orphans observed, wrapper must be updated (or a thin repo-local shim added) to forward signals to child before production use. Document in README."

- **Severity: Major**  
  **Evidence:** `docs/plans/...-plan.md` and context only reference `packages/studio/src/...` + gateway files; `package.json` workspaces include packages/studio; `components/StandaloneShell.js` and `src/components/VideoStudio.js` exist (the latter has lastImageField logic but no native* yet). No native* strings in src/ tree per search, but UI logic duplication risk exists for electron/vite builds.  
  **Problem:** Plan is incomplete on "update all call sites". If vite/electron or legacy src/ copy any control logic, Grok flags will not apply there.  
  **Recommended plan amendment:** Add step: "Audit and update any duplicate VideoStudio / control logic under src/ and components/ if they reference native video descriptors or last-frame handling."

- **Severity: Major**  
  **Evidence:** Plan step 2 proposes `providerAdapterUtils.js` (narrow: ensureJobDir, outputPaths, buildAllowlistedEnv, capture, redact, writeDiagnostics, resolve/validate inputs). Current adapters duplicate a lot (env allow/deny lists in vertexVideo + codex, redaction, resolveInputAssets, verify). No such file exists. Task list says "Decide whether to add... or keep minimal Grok-only first."  
  **Problem:** Plan leaves the decision open but many listed tests assume shared utils ("tests/providerAdapterUtils.test.js if added"). Duplication will grow; future maintenance suffers.  
  **Recommended plan amendment:** Make the decision explicit before coding: either (a) add the narrow utils module with tests first and migrate safe pieces from vertex/codex, or (b) implement grokVideoProvider self-contained and update plan to "no shared utils in V1; duplication accepted".

- **Severity: Minor**  
  **Evidence:** Plan recommends `maxReferenceImages: 6` (total 7 images). Official ref-to-video docs + imagine page state "up to seven reference images", "one or more"; wrapper accepts >=2 with no hard upper limit in py (roles must match [A-Za-z0-9_.-]+). Context says "max reference inputs are seven".  
  **Problem:** 6 additional + 1 = 7 is defensible, but document why 6 (not 7 additional) and add adapter enforcement (reject >7 total or >6 refs). Wrapper will accept more; gateway must gate.  
  **Recommended plan amendment:** Add to adapter validation + test: enforce `<= model.maxReferenceImages + 1` total images (or explicit 7).

- **Severity: Minor**  
  **Evidence:** `nativeModels.js:71` (NATIVE_CAPABILITY_CONSTRAINTS has veo* + codex* + nano*); gateway exports duplicates similar; plan adds Grok durations/resolutions/reference count/concurrency to catalog. No top-level `grok*` constraints yet.  
  **Problem:** Fixtures and capability endpoint will be inconsistent until both sides updated symmetrically.  
  **Recommended plan amendment:** Update CAPABILITY_CONSTRAINTS in gateway + client + fixture + tests (e.g. grokDurationsSeconds: [6,10], grokResolutions, grokMaxReferenceImages:6, grokConcurrency:1).

- **Severity: Minor**  
  **Evidence:** Context/plan claim "Official video-generation docs allow 1-15 second duration and 480p/720p/1080p generally, but note 1080p is only for grok-imagine-video-1.5 image-to-video." Fetched docs confirm: generation page has table + note "1080p is only supported on `grok-imagine-video-1.5` for image-to-video"; ref-to-video examples use grok-imagine-video + 720p/10s; I2V examples use grok-imagine-video-1.5. Wrapper hardcodes 6/10 + 480/720.  
  **Problem:** Plan is accurate here. However, wrapper docs/skill still brand as "1.5" for reference flows even though REST 1.5 does not support reference mode.  
  **Recommended plan amendment:** Strengthen "Do not claim REST API parity" language; catalog label already says "(Server - Grok CLI)" which is correct.

- **Severity: Minor**  
  **Evidence:** `scheduler.js:20`, `exports.js:48` (providerConcurrency), vertex provider registers with expectedMime and resolve hooks; codex has special resolveMeta dance because it scans dir instead of fixed --output. Plan says Grok uses fixed `--output .native-media/tmp/<job>/grok-output.mp4`.  
  **Problem:** Grok wrapper can also "maybe_copy_reported_mp4" from stream log and may write to different location in some error paths. Adapter + settle must handle like vertex (prefer MEDIA/JSON output if present, else declared path) and still let scheduler verify magic bytes.  
  **Recommended plan amendment:** Explicitly list "grok adapter must return outputPath + optional resolveOutputPath that checks wrapper JSON result for 'output' field".

- **Severity: Note**  
  **Evidence:** Plan "File Naming" section matches context and wrapper sidecar convention. Import path in gateway uses sniff + saveAsset. Scheduler reconcile verifies output. No local paths leak in publicJob (PRIVATE_JOB_FIELDS).  
  **Problem:** None in design. Implementation must ensure grok-diagnostics.json and all tmp/ artifacts stay private (add to PRIVATE_JOB_FIELDS or filter). Wrapper prompt.txt will contain the full prompt + image paths (temp copies). Redact in diagnostics writing.

- **Severity: Note**  
  **Evidence:** `exports.js:860` exports vertex/codex providers; plan says add grokVideoProvider to exports too.  
  **Problem:** Minor; for test injection and observability. Add the require/export.

- **Severity: Note**  
  **Evidence:** README Native Media section only documents Vertex/Codex + NATIVE_MEDIA_ALLOW_... + Veo filter messages. Plan lists update for Grok CLI + NATIVE_MEDIA_LIVE_GROK + "Grok outputs/logs are private".  
  **Problem:** Must also mention local Grok login requirement and that quota is unpublished/CLI-driven (no auto-retry).

## Plan Amendments Worth Considering

- Exact target file: `packages/studio/src/nativeMedia.js`  
  Exact proposed wording/change: Rename `validateVeoConstraints` → `validateNativeVideoConstraints`; make duration/reference error strings include model id or generic "for this model"; keep Veo-specific 8s rule only when `model.referenceDurationSeconds` is declared.  
  Why: Prevents "Veo" text and wrong rules leaking to Grok and future providers.

- Exact target file: `packages/studio/src/components/VideoStudio.jsx` (nativeVideoModelToDescriptor + applyControlsForModel + handleGenerate native paths)  
  Exact: Condition `lastImageField` on `m.supportsLastFrame !== false`; drive showAr/showAudio/showResolution from model fields or explicit supports* when present; for native video I2V use `maxReferenceImages > 0` (or a `nativeReferenceImagesEnabled(model)`) instead of `referenceImagesEnabled`; never send aspect/audio for models that declare the supports flag false.  
  Why: Current code will show and send unsupported controls for Grok.

- Exact target file: `native-media-gateway/server.js` + `exports.js`  
  Exact: Add `liveGrok = process.env.NATIVE_MEDIA_LIVE_GROK === '1'`; update generationOptions, submitGenerationUnlocked job shape (liveGrok), launchProviderWork dispatch, publicFailureMessage (add GROK_* cases), PRIVATE_JOB_FIELDS (add grok-specific if any).  
  Why: Otherwise Grok model is dead on arrival or always fakes.

- Exact target file: `native-media-gateway/grokVideoProvider.js` (new)  
  Exact: Add explicit handling: after spawn, read the final printed JSON (if any) for "output" field as resolved path; always fall back to declared grok-output.mp4; after scheduler verify, surface warnings from wrapper JSON ("post_generation_agent_limit" etc.) into private job state but never into public message unless mapped.  
  Why: Wrapper contract is JSON + sidecars, not MEDIA: line.

- Exact target file: `tests/nativeVideoStudioWiring.test.js` + `nativeGatewayPayloads.test.js` + `nativeModelCatalog.test.js`  
  Exact: Add assertions that for a Grok model descriptor: no lastImageField (or supportsLastFrame false), durations only [6,10], no referenceDurationSeconds or reference 8s lock, multiple images allowed at 6s/10s, etc. Update length asserts after adding the model.  
  Why: Locks the intended behavior and catches regressions when Veo-specific code changes.

- Exact target file: `README.md` (Native Media Worker Operations) + plan task list  
  Exact: Add Grok paragraph parallel to Vertex/Codex; mention `NATIVE_MEDIA_LIVE_GROK=1`, "requires local `grok login`", "private diagnostics under .native-media/tmp", "no auto-retry on quota/policy".  
  Why: Ops runbook must be accurate for the new provider.

## Claims I Could Not Verify

- Claim: Local wrapper "verifies output with ffprobe" and "treats a valid MP4 as authoritative even if Grok returns nonzero".  
  Why not verified: Verified by reading the script (valid_probe + wait_for_valid_output + warnings for nonzero but valid mp4 + success return 0). Could not execute end-to-end (no live Grok quota + would require real auth + paid call). Dry-run path exists.  
  What would verify it: `python3 ... --dry-run` + unit tests on the py functions; or controlled live smoke with fake grok binary.

- Claim: "Grok CLI/quota path should be serialized" (hence grok:1 cap).  
  Why not verified: Plan rationale (unpublished quota ~10-20/day per skill doc). No public rate limit doc found for the local CLI path (REST has 1 rps for the 1.5 model). Local behavior is CLI-driven.  
  What would verify it: Observation of concurrent runs or xAI status.

- Claim: Nested Grok process (inside the python-launched `grok` CLI) will be terminated by SIGTERM to the python wrapper's process group.  
  Why not verified: py uses `start_new_session=True`; gateway scheduler killProcessGroup sends to -pgid. Wrapper only does killpg on its timeout path. No test run of gateway cancel against a real grok child.  
  What would verify it: Manual cancel smoke + `ps aux | grep -E 'grok|python'` observation (as plan itself requires).

- Claim: All current native tests (vertex/codex) will continue to pass after adding Grok adapter.  
  Why not verified: Code inspection shows no shared mutation of global state that Grok would break, but full `node --test tests/native*.test.js` after changes is required. Contract tests hard-fail on count today.

- Claim: "No browser credentials, no path traversal, no leaked local paths/logs/prompts/auth state."  
  Why not verified: Proxy strips headers; gateway validateCredentialFree + sanitizeInputs reject /../ and urls; adapters must redact and never return tmp paths. Wrapper keeps prompts in private sidecars. Actual redaction in new grok adapter + publicJob not yet implemented. Source review supports the intent.

## Checks Performed

- Local files inspected:  
  - All three plan docs.  
  - packages/studio/src/{nativeModels.js, nativeMedia.js, nativeModelRegistry.js, components/VideoStudio.jsx} (multiple sections).  
  - native-media-gateway/{server.js, exports.js, scheduler.js, vertexVideoProvider.js, codexImageProvider.js, bin/genai-video}.  
  - tests/{fixtures/nativeContract.js, nativeModelCatalog.test.js, nativeVideoStudioWiring.test.js, nativeGatewayPayloads.test.js, nativeGatewayServer.test.js, nativeCredentialBoundary.test.js, nativeVertexVideoProvider.test.js, ...}.  
  - components/StandaloneShell.js, app/api/native-media/[[...path]]/route.js, package.json, README.md (native section).  
  - /home/k8r1m/.codex/skills/grok-imagine-video/{SKILL.md, scripts/grok_imagine_video.py} (full).  
  - Directory listings for native-media-gateway, tests, packages/studio/src.  
  - Grep across workspace for native.* / grok / Veo reference / last-frame / validateVeo etc.

- Official docs inspected (via web_fetch):  
  - https://docs.x.ai/developers/model-capabilities/video/generation (confirms model "grok-imagine-video", durations 1-15s, resolutions incl. note on 1080p only for 1.5 I2V, reference-to-video mode using reference_images + grok-imagine-video, image-to-video via image field).  
  - https://docs.x.ai/developers/model-capabilities/video/image-to-video (uses grok-imagine-video-1.5 in examples).  
  - https://docs.x.ai/developers/model-capabilities/video/reference-to-video (uses "grok-imagine-video"; explicit warning "grok-imagine-video-1.5 does not support this mode"; up to reference images).  
  - https://docs.x.ai/developers/model-capabilities/imagine (I2V example uses grok-imagine-video-1.5; ref-to-video section confirms "Requires grok-imagine-video").  
  - https://docs.x.ai/developers/models/grok-imagine-video-1.5-preview (modalities: image→video only; rate limit 1 rps).  
  - https://docs.x.ai/llms.txt (CLI flags, headless, --cwd, --output-format streaming-json, --no-auto-update etc. align with wrapper usage).

- Commands run:  
  - Multiple read_file, grep, list_dir, web_fetch.  
  - One run_terminal_command to inspect studio package index and confirm "studio" workspace resolution (no modification).  
  - git status (via initial info + implied clean).

All verification was read-only or fetch-only. No production files were edited.

## Summary Recommendation

Do not approve for implementation until the REQUEST_CHANGES items (especially UI flag consumption, validation generalization, live dispatch wiring, output parsing contract match, test contract updates, and explicit cancellation test gate) are turned into concrete checklist items with owners. The core idea (native.grok.imagine-video via the installed CLI wrapper, behind NATIVE_MEDIA_LIVE_GROK, same asset flow) is sound and the boundary research in the context file is accurate.

Write the report as requested. This file is the output.