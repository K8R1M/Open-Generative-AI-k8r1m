# Plan: Native Grok Imagine Video Provider

Last updated: 2026-06-30

This plan is approved for implementation on branch `feat/native-grok-imagine-video`. The main agent only orchestrates/integrates; implementation is delegated to native `executor` agents and the merge gate is separate native `code-reviewer` approval.

## Goal

Add a new native server-side video provider using the local Grok Imagine CLI wrapper. Users should be able to select the Grok native video model in the Video Studio, upload one image or multiple reference images, enter a prompt, choose `6` or `10` seconds, choose `480p` or `720p`, and receive the generated MP4 back through the same native media asset flow used by Vertex Veo and Codex.

## Non-Goals

- Do not add a direct browser-to-xAI API path.
- Do not pass Grok/xAI credentials, cookies, local auth paths, or CLI config through browser requests.
- Do not replace the existing Vertex Veo or Codex providers.
- Do not implement text-to-video for Grok in this first pass; the installed wrapper supports image-to-video and reference-to-video for this feature request.
- Do not claim REST API parity for reference-to-video on `grok-imagine-video-1.5`; the local CLI wrapper is the actual provider surface.
- Do not expose official REST-only controls that the wrapper cannot accept, such as arbitrary 1-15 second duration, 1080p, aspect ratio, URL/base64/file_id inputs, edit-video, or extend-video.

## Acceptance Criteria

- Catalog exposes one new native video model: `native.grok.imagine-video`.
- Video Studio shows Grok under image-to-video, not text-to-video.
- Grok model allows:
  - one uploaded image for image-to-video
  - two to seven uploaded images for reference-images-to-video
  - duration `6` or `10`
  - resolution `480p` or `720p`
- Grok model does not show unsupported controls:
  - no strict Veo end-frame upload
  - no audio toggle if the model cannot honor it
  - no aspect-ratio selector if the wrapper cannot accept it
- Gateway accepts only same-origin uploaded asset IDs for Grok inputs.
- Gateway rejects unsupported Grok inputs before spawning the CLI:
  - wrong task
  - missing image input
  - unsupported duration/resolution
  - unsupported MIME/extension
  - too many references
  - external URLs or path traversal asset IDs
- Gateway starts live Grok jobs only when `NATIVE_MEDIA_LIVE_GROK=1`.
- Fake provider behavior remains available when no live provider gates are enabled.
- Scheduler imports a verified MP4 into `.native-media/assets/<asset-id>/data.mp4`.
- Browser receives only same-origin `/api/native-media/v1/assets/<asset-id>` URLs.
- Private diagnostics are saved server-side and redacted before any public message.
- Existing native Vertex and Codex tests still pass.
- A live smoke can run on app port `19400` with a cheap `480p`, `6s` job after implementation.
- Merge remains blocked until targeted tests, broad native tests, build, `19400` smoke, cancel smoke with no orphan Grok/wrapper process, no browser/local-path/secret leak checks, Graphify refresh, and code-reviewer approval all pass.

Implementation note from 2026-06-30: an older gateway was already listening on `19334` without Grok capabilities, so manual smoke used the required app port `19400` pointed at this branch's gateway on `19335`. Cancel smoke found and fixed the expected nested-process risk by adding SIGTERM/SIGINT forwarding to `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`.

## Implementation Orchestration

- Branch: `feat/native-grok-imagine-video`
- Test app port: `19400`
- Main agent role: orchestrate, integrate subagent patches, run verification, update durable docs.
- Implementation agents: native `executor` role, fixed role settings `gpt-5.5` medium.
- Review agents: native `code-reviewer` role, fixed role settings `gpt-5.5` high.
- Initial implementation split:
  - Gateway/provider/scheduler executor.
  - Studio/native-client executor.
  - Tests/docs executor.
- Review split:
  - Gateway/security/cancellation reviewer.
  - Studio/client/regression reviewer.
- Any `REQUEST_CHANGES` review blocks merge.

## Verified Audit Amendments

These items were checked against the local code and the Grok wrapper after the Grok 4.3 audit. They are now part of the plan:

- The Grok wrapper prints JSON on success, not Vertex-style `MEDIA:` output. Parse JSON `output` when present; otherwise use the requested `grok-output.mp4` path after scheduler MP4 verification.
- Video Studio currently exposes Veo-like native video controls by default. Grok implementation must update the native descriptor builder, control visibility, image slicing, and native parameter construction.
- Client validation is currently Veo-named. It must become model-generic, and Grok validation errors must not say `Veo`.
- `NATIVE_MEDIA_LIVE_GROK` must flow through server options, queued drain, job private state, provider dispatch, and scheduler provider caps.
- Gateway/adapter validation must enforce image counts before spawn: one image for wrapper `image-to-video`, two to seven total images for wrapper `reference-to-video`, more than seven rejected.
- Before UI edits, grep duplicate video-control surfaces under `src/`, `components/`, and `packages/studio/src/`; edit only surfaces that actually affect native Video Studio behavior.

## Proposed Architecture

### 1. Provider Catalog

Update both client and gateway catalogs:

- `packages/studio/src/nativeModels.js`
- `native-media-gateway/exports.js`
- `tests/fixtures/nativeContract.js`

Add:

```js
{
  id: 'native.grok.imagine-video',
  label: 'Grok Imagine Video (Server - Grok CLI)',
  provider: 'grok',
  kind: 'video',
  tasks: ['image-to-video'],
  durationsSeconds: [6, 10],
  resolutions: ['480p', '720p'],
  maxReferenceImages: 6,
  supportsAspectRatio: false,
  supportsAudioToggle: false,
  supportsLastFrame: false,
}
```

Rationale:

- `maxReferenceImages: 6` gives a total of seven images in the existing UI model: one first/primary image plus six additional references.
- Reference-to-video is represented as multi-image `image-to-video` because the current native request envelope already supports ordered image inputs and roles.
- The model is not added to T2V because the installed wrapper contract is image/reference driven.
- The catalog ID intentionally avoids `1.5`: official xAI docs use `grok-imagine-video-1.5` for image-to-video, but say that model does not support reference-to-video; the wrapper is the local surface that supports both single-image and reference-image workflows.
- If the UI copy must mention 1.5, do it as explanatory copy/metadata, not as a promise that reference mode is REST `grok-imagine-video-1.5`.

### Official Docs Boundary

Docs verified on 2026-06-30:

- xAI Image-to-Video uses `grok-imagine-video-1.5` and accepts source image URL/base64/file_id through REST/SDK.
- xAI Reference-to-Video uses `grok-imagine-video`, allows up to seven reference images, caps reference duration at ten seconds, and says `grok-imagine-video-1.5` does not support that mode.
- xAI Video Generation docs describe a broader REST range of 1-15 seconds and 480p/720p/1080p, but 1080p is noted as only supported by `grok-imagine-video-1.5` image-to-video.
- The local wrapper narrows the feature to local image files, duration `6` or `10`, and resolution `480p` or `720p`. The implementation must enforce wrapper limits because the server will call the wrapper, not the REST API directly.

### 2. Shared Provider Seams

Default to no new shared utility module in V1. The required seam is the provider adapter boundary, not a new abstraction.

Use existing adapter patterns first. Extract a tiny shared helper only if the Grok implementation creates concrete duplication in code touched by this feature. If extracted, keep it limited to path naming, env filtering, redaction, diagnostics writing, or native asset-file resolution.

Possible file, only if justified:

```text
native-media-gateway/providerAdapterUtils.js
```

Suggested helpers:

- `ensureJobDir(tmpDir, jobId)`
- `providerOutputPaths(jobDir, providerName, ext)`
- `buildAllowlistedEnv(baseEnv, { allowlist, denylist, fixed })`
- `captureChildOutput(child, { limitBytes })`
- `redactProviderText(text, context)`
- `writeProviderDiagnostics(jobDir, providerName, data)`
- `resolveNativeAssetInputs(inputs, getAsset, roleClassifier, providerLabel)`
- `validateResolvedInputFiles(resolved, constraints, providerLabel)`

Keep generation-method logic provider-specific:

- Veo keeps Vertex model aliases, aspect ratio, audio, start/last/reference roles, reference duration, and Vertex SDK errors.
- Grok keeps wrapper modes, `--image`/`--ref`, role labels, duration/resolution, local CLI errors, and wrapper log interpretation.
- Codex keeps generated image snapshot/scan logic.

Implementation sequence if this helper is still justified:

1. Add shared helpers with tests that prove redaction, path naming, env filtering, and asset resolution behavior.
2. Use helpers in the new Grok adapter.
3. Optionally migrate only the safest duplicate pieces from `vertexVideoProvider.js` after tests lock behavior. Do not refactor all providers just to make the diff look abstract.

### 3. Grok Provider Adapter

Add:

```text
native-media-gateway/grokVideoProvider.js
```

Responsibilities:

- Recognize `native.grok.imagine-video`.
- Gate live runs with `NATIVE_MEDIA_LIVE_GROK=1`.
- Resolve native uploaded asset IDs to local file paths.
- Validate model/task/prompt/inputs/duration/resolution/MIME/size.
- Reject any task other than `image-to-video` before spawn.
- Decide wrapper mode:
  - one image -> `image-to-video`
  - two to seven total images -> `reference-to-video`
  - more than seven total images -> reject before spawn
- Build wrapper argv with `shell:false`.
- Spawn `python3 /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`.
- Pass `--output .native-media/tmp/<job-id>/grok-output.mp4`.
- Register the child with scheduler using `expectedMime: 'video/mp4'`.
- Capture bounded stdout/stderr.
- Parse wrapper stdout as JSON when possible and use its `output` field as an optional resolved output path; if JSON is missing or unparsable, fall back to the requested `grok-output.mp4`.
- Persist private diagnostics on failure.
- Return safe metadata to `exports.js` for job persistence.

Recommended argv shape:

```text
python3
  /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py
  --mode image-to-video
  --image /abs/uploaded/data.png
  --prompt <prompt>
  --output /repo/.native-media/tmp/<job-id>/grok-output.mp4
  --duration 6
  --resolution 480p
  --overwrite
```

```text
python3
  /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py
  --mode reference-to-video
  --ref start-composition=/abs/uploaded/start.png
  --ref reference-1=/abs/uploaded/ref1.png
  --prompt <prompt>
  --output /repo/.native-media/tmp/<job-id>/grok-output.mp4
  --duration 10
  --resolution 720p
  --overwrite
```

Default role mapping for V1:

```text
one first-frame image
  -> --mode image-to-video --image <asset-path>

first-frame plus one or more reference images
  -> --mode reference-to-video
  -> first image: --ref start-composition=<asset-path>
  -> remaining: --ref reference-1=<asset-path>, reference-2=<asset-path>, ...
```

Reasoning:

- The current UI does not capture semantic role labels for refs.
- The wrapper benefits from roles, so deterministic generic roles are better than unlabelled paths.
- A later UX improvement can add role selection without changing the gateway contract.

### 4. Gateway Dispatch And Capabilities

Update:

- `native-media-gateway/scheduler.js`
  - Add provider cap `grok: 1`.

- `native-media-gateway/server.js`
  - Add `liveGrok = process.env.NATIVE_MEDIA_LIVE_GROK === '1'`.
  - Fake provider remains active only when none of Vertex/Codex/Grok live gates are on.

- `native-media-gateway/exports.js`
  - Import `grokVideoProvider`.
  - Add Grok model to `MODELS`.
  - Add Grok constraints to `CAPABILITY_CONSTRAINTS`.
  - Persist `liveGrok` in job private state inside `submitGenerationUnlocked()`.
  - Include `liveGrok` in queued-drain launch options.
  - Add a live Grok dispatch branch beside Vertex/Codex.
  - Keep provider-specific implementation in `grokVideoProvider.js`.
  - Export the Grok provider for focused tests.

### 5. Client Request Validation

Update:

- `packages/studio/src/nativeMedia.js`

Replace the Veo-only client-side validation with model-generic native video validation, for example `validateNativeVideoConstraints()`:

- If `model.durationsSeconds` exists, validate selected duration against it.
- If `model.resolutions` exists, validate selected resolution against it.
- Count `reference` roles and validate against `model.maxReferenceImages`.
- If `model.referenceImagesEnabled === false`, reject references.
- If `model.referenceDurationSeconds` exists and refs are present, enforce it. This keeps Veo behavior.
- If a last-frame role is present and `model.supportsLastFrame === false`, reject it.
- Error strings should be generic or model-aware. Grok validation errors must not say `Veo`.

This keeps Veo's stricter behavior while allowing Grok reference images at `6` or `10` seconds.

### 6. Video Studio UI

Update:

- `packages/studio/src/components/VideoStudio.jsx`

Changes:

- `nativeVideoModelToDescriptor()` should honor model feature flags:
  - `supportsLastFrame === false` means do not set `lastImageField`.
  - `supportsAspectRatio === false` means descriptor aspect ratio inputs should be omitted or empty, the aspect selector should be hidden, and no aspect ratio should be sent.
  - `supportsAudioToggle === false` means hide the audio toggle or do not include `audio` in native parameters.
- Replace `referenceImagesEnabled` UI gating with a generic helper:
  - `nativeReferenceImagesEnabled(model)` returns true when `maxReferenceImages > 0` unless explicitly disabled.
- Keep Veo-specific duration lock only when the model declares `referenceDurationSeconds`.
- For Grok, allow multiple image chips and no end-frame chip.
- For native Grok generation, pass:
  - first image role `first-frame`
  - later image roles `reference`
  - no last-frame input
  - `durationSeconds`
  - `resolution`
  - prompt
- Before editing, grep duplicate surfaces under `src/`, `components/`, and `packages/studio/src/` for `lastImageField`, native video descriptors, and native model wiring. Edit only surfaces that affect the running native Video Studio.

### 7. Error Handling And Observability

Keep public and private error surfaces separate.

Private server-side diagnostics:

- Job output and logs:
  - `.native-media/tmp/<job-id>/grok-output.mp4`
  - `.native-media/tmp/<job-id>/grok-output.prompt.txt`
  - `.native-media/tmp/<job-id>/grok-output.streaming.jsonl`
  - `.native-media/tmp/<job-id>/grok-output.debug.log`
  - `.native-media/tmp/<job-id>/grok-diagnostics.json`
- Diagnostic JSON should include:
  - provider: `grok`
  - model ID
  - task
  - mode: `image-to-video` or `reference-to-video`
  - duration/resolution
  - input count and MIME/size/role summary
  - wrapper exit code/signal if available
  - stdout/stderr/log tails after redaction
  - output path existence and byte size
  - warning codes from wrapper output if parsed

Public browser messages:

- Expose only safe classifications in `publicFailureMessage(job)`:
  - `GROK_AUTH_UNAVAILABLE`: Grok CLI is not logged in or not available.
  - `GROK_QUOTA_OR_RATE_LIMIT`: Grok quota or rate limit reached.
  - `GROK_POLICY_FILTERED`: Grok refused or filtered the request.
  - `GROK_TIMEOUT`: generation timed out without a valid MP4.
  - `OUTPUT_MISSING`: wrapper finished but no valid MP4 was found.
  - `PROVIDER_LAUNCH_FAILED`: local wrapper could not start.

Classification should be based on sanitized wrapper stderr/stdout/debug-log text and wrapper exit behavior. Do not pass raw Grok logs to the browser.

Wrapper-specific success warning handling:

- If wrapper exits nonzero but valid MP4 exists, scheduler should still complete because output verification is authoritative.
- Persist a private/safe warning such as `post_generation_agent_limit` or `nonzero_exit_after_valid_output` when available.
- Wrapper stdout success is JSON with fields such as `ok`, `output`, `warnings`, and log paths. Do not expect a `MEDIA:` line from the Grok wrapper.

Cancel/timeout caveat:

- The wrapper starts the Grok CLI in a new session. The gateway can kill the wrapper process, but the nested Grok process may need signal-forwarding to guarantee cancellation.
- Before enabling live production use, test cancellation. If nested Grok remains running, either:
  - add signal handling to the installed wrapper, or
  - introduce a repo-local wrapper that forwards SIGTERM/SIGINT to the nested Grok process group.
- Do not leave known orphan-process behavior undocumented.
- Manual cancel smoke must include a process-table check for lingering Grok or wrapper processes after cancellation.

### 8. Tests

Add:

- `tests/nativeGrokVideoProvider.test.js`
  - model recognizer and live gate
  - env allowlist/denylist
  - argv for single image mode
  - argv for reference mode
  - rejects unsupported task/model/duration/resolution/MIME/input count/path traversal
  - rejects text-to-video in V1 before spawn
  - uses fixed wrapper path and `shell:false`
  - scheduler registration uses `expectedMime: video/mp4`
  - output path is job-local and deterministic
  - wrapper JSON `output` path is used when present; fixed requested output path is fallback
  - no-output/nonzero failures keep private redacted diagnostics and public-safe errors
  - cancel kills the tracked Grok wrapper process and does not falsely complete
  - failure diagnostics are redacted

- `tests/providerAdapterUtils.test.js` if shared utilities are added
  - path naming
  - env filtering
  - redaction
  - asset resolution behavior

Update:

- `tests/fixtures/nativeContract.js`
  - add Grok model ID/descriptor/constraints.

- `tests/nativeModelCatalog.test.js`
  - expected count becomes 6.
  - namespace regex includes `grok`.
  - constraints include Grok durations/resolutions/reference count/concurrency.

- `tests/nativeGatewayPayloads.test.js`
  - Grok request builder accepts duration `6`/`10`, resolution `480p`/`720p`, and reference inputs without Veo's 8s requirement.
  - Veo reference gating still behaves as before.

- `tests/nativeVideoStudioWiring.test.js`
  - native I2V keeps multiple images when `maxReferenceImages > 0`.
  - Veo last-frame duration validation remains Veo-specific.
  - Grok does not expose end-frame field/audio/aspect unsupported controls.
  - Grok validation and UI strings do not say `Veo`.

- `tests/nativeRouteVersioning.test.js`
  - add `NATIVE_MEDIA_LIVE_GROK` gate assertion.

- `tests/nativeCredentialBoundary.test.js`
  - add Grok/XAI credential names to denylist expectations, including `XAI_API_KEY` and `GROK_API_KEY`.

- `tests/nativeGatewayServer.test.js`
  - public job hides Grok diagnostics/local paths.
  - safe public message mapping works.

Optional update:

- `tests/nativeSchedulerRecovery.test.js` if Grok-specific provider cap or restart metadata changes require coverage. The generic scheduler should otherwise remain unchanged except provider cap.

### 9. Docs

Update:

- `README.md` Native Media Worker Operations section:
  - mention Grok CLI provider
  - mention `NATIVE_MEDIA_LIVE_GROK=1`
  - mention local Grok CLI login requirement
  - mention Grok outputs/logs are private and imported into native assets
  - mention quota/rate-limit behavior should not auto-retry

Keep these planning files updated through implementation:

- `docs/plans/grok-imagine-video-provider-context.md`
- `docs/plans/grok-imagine-video-provider-plan.md`
- `docs/plans/grok-imagine-video-provider-task-list.md`

### 10. Branch And Local Test Run

When implementation is approved:

```bash
git checkout -b feat/native-grok-imagine-video
```

Targeted test examples:

```bash
node --test tests/nativeGrokVideoProvider.test.js
node --test tests/nativeModelCatalog.test.js tests/nativeGatewayPayloads.test.js tests/nativeVideoStudioWiring.test.js
node --test tests/nativeRouteVersioning.test.js tests/nativeGatewayServer.test.js
node --test tests/nativeVertexVideoProvider.test.js tests/nativeCodexImageProvider.test.js
```

Run broader native tests if targeted tests pass:

```bash
node --test tests/native*.test.js
```

Start gateway and app for manual testing:

```bash
NATIVE_MEDIA_LIVE_GROK=1 NATIVE_MEDIA_GATEWAY_PORT=19334 node native-media-gateway/server.js
```

```bash
NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19334 npm run dev -- --port 19400
```

Manual smoke:

- Open `http://127.0.0.1:19400/studio/video`.
- Select Grok native video model.
- Upload one small PNG/JPEG/WebP.
- Use `6s`, `480p`.
- Prompt a simple one-beat motion.
- Confirm returned video URL is `/api/native-media/v1/assets/<asset-id>`.
- Confirm `.native-media/assets/<asset-id>/data.mp4` exists.
- Confirm private logs remain under `.native-media/tmp/<job-id>/`.
- Confirm no local paths or credentials appear in browser response.

Reference smoke after single-image smoke:

- Upload two to three compatible reference images.
- Use `6s`, `480p`.
- Confirm adapter chooses wrapper `reference-to-video`.
- Confirm output imports and plays in the UI.

After code changes:

```bash
graphify update . --force
```

Then update the graph/context file if edges changed.

## Risks And Mitigations

- Risk: Official REST docs and local CLI wrapper do not have identical model/mode semantics.
  - Mitigation: label provider as local Grok CLI wrapper; implement only wrapper-supported behavior.

- Risk: UI currently has Veo-specific reference-image logic.
  - Mitigation: make validation model-generic and keep Veo's stricter constraints declarative.

- Risk: Grok CLI cancellation may orphan nested process.
  - Mitigation: test cancellation before live signoff; add signal forwarding if needed.

- Risk: Grok quota is limited and unpublished.
  - Mitigation: no automatic paid retries; use fake/unit tests for CI; live smoke uses `480p`/`6s`.

- Risk: Provider logs may include prompts, paths, auth state, or user content.
  - Mitigation: bounded capture, redaction, private diagnostics, safe public error mapping only.

- Risk: Shared utility refactor could destabilize existing providers.
  - Mitigation: add helpers narrowly, test first, use them for Grok, and only migrate existing Veo/Codex code where the diff is clearly safer than duplication.
