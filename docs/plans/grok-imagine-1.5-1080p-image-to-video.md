# Planning: 1080p Videos with Grok Imagine 1.5 (Image-to-Video Only)

**Audience:** Codex (planning / implementation agent)  
**Date:** 2026-06-30  
**Context:** Extending the native Grok Imagine video provider (`native.grok.imagine-video`) and the local CLI wrapper to support 1080p output using the Imagine 1.5 capability, **restricted to image-to-video** (single start-frame image).  
**Status:** Pre-implementation planning. No code changes have been made for 1080p support. This document is the source of truth for Codex.

## Objective

Enable users to generate 1080p videos via the local Grok Imagine 1.5 path when using **image-to-video** (one uploaded start-frame image + prompt).

- Target: Full HD (1080p) output MP4.
- Scope: **Image-to-video only** (single image as start frame).
- Non-scope for this effort: Reference-to-video (multi-image), text-to-video, 1080p on non-1.5 paths.

Once implemented, this will flow through the same native media gateway used by Vertex Veo and Codex providers:
- `packages/studio/src/nativeModels.js`
- `native-media-gateway/grokVideoProvider.js` (to be created)
- Existing upload → generate → poll → asset import path.

## Official xAI Facts (Verified from Docs)

- Model: `grok-imagine-video-1.5` (aliases: `grok-imagine-video-1.5-preview`)
- 1080p support is **explicitly limited**:
  > "1080p is only supported on `grok-imagine-video-1.5` for image-to-video generation."
- Resolution options in the API: 480p (default), 720p, 1080p.
- Image-to-video requires a source image (URL, base64, or file_id in the public API). In our local path we always use local uploaded files.
- Reference-to-video uses the base `grok-imagine-video` model and does **not** support the 1.5 model (per docs). Therefore 1080p is not available for reference-to-video.

**Local reality in our skill:**
- The installed wrapper + skill at `/home/k8r1m/.codex/skills/grok-imagine-video/` brands the entire `/imagine-video` workflow as "Grok Imagine 1.5".
- It supports:
  - `--mode image-to-video` + 1 `--image` (treated as start frame)
  - `--mode reference-to-video` + multiple `--ref role=...`
- The local Grok CLI triggers this via natural language prompts containing `/imagine-video ...`.
- No explicit `--model grok-imagine-video-1.5` flag is currently passed (the wrapper builds a prompt and runs `grok --prompt-file ...`).

## Current Blockers (Local Wrapper)

The wrapper strictly prevents 1080p today:

```python
# scripts/grok_imagine_video.py
VALID_RESOLUTIONS = {"480p", "720p"}

# ...
if args.resolution not in VALID_RESOLUTIONS:
    fail(f"--resolution must be one of {sorted(VALID_RESOLUTIONS)}")

parser.add_argument("--resolution", default="480p", choices=sorted(VALID_RESOLUTIONS))
```

Resolution is **not** a structured flag to the Grok CLI. It is injected as plain text inside the generated prompt:

```python
# image-to-video case
f"/imagine-video Start frame: {image_path}\n\n{base} {duration}. {args.resolution}. Save the final video to {output}."
```

Same pattern for reference mode.

**To get 1080p we must:**
1. Allow the string `"1080p"` in the wrapper **only** for image-to-video.
2. Let the backend decide (when it sees 1080p + a single start frame, it should route to the 1.5 I2V path).

## Exact Path to 1080p (Image-to-Video + Imagine 1.5)

### 1. Update the Local Wrapper (Minimal & Safe)

File: `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`

Changes:
- Keep `VALID_RESOLUTIONS = {"480p", "720p", "1080p"}` (or compute dynamically).
- **Enforce restriction in validation**:
  ```python
  if args.resolution == "1080p" and args.mode != "image-to-video":
      fail("1080p is only supported for image-to-video (single start frame) with Grok Imagine 1.5")
  ```
- Update argparse (remove `choices` or make it accept the value; do validation in `run()` instead for flexibility).
- No other changes to prompt building or execution — "1080p." will simply appear in the prompt text.
- Update default? Keep 480p or 720p as default.
- Update `--help` description and any internal docs.
- Update `SKILL.md` and `references/*.md`:
  - Resolution: `480p`, `720p`, or `1080p` (1080p only for image-to-video).
  - Add note about longer generation time and quota cost.
- Update timeouts in operations reference (1080p I2V will be slower).

Example dry-run prompt after change (image-to-video):
```
/imagine-video Start frame: /tmp/.../01-start-frame.png

A person walks into frame... 6 seconds. 1080p. Save the final video to ...
```

### 2. Native Provider Adapter (grokVideoProvider.js)

When we implement `native-media-gateway/grokVideoProvider.js` (per the existing audit plan):

- Accept `resolution: "1080p"` from the request parameters.
- **Gate it**:
  - Only when `task === "image-to-video"`
  - Only when exactly one input image (start/first-frame role)
  - Reject early with clear message if used with reference-to-video or T2V.
- Build argv for the wrapper:
  ```js
  python3 /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py \
    --mode image-to-video \
    --image /abs/path/to/uploaded/start.png \
    --prompt "..." \
    --output .native-media/tmp/<job-id>/grok-output.mp4 \
    --duration 6 \
    --resolution 1080p \
    --overwrite
  ```
- Use the same `shell: false`, bounded output capture, redaction, scheduler registration with `expectedMime: 'video/mp4'`.
- On the job record, persist the requested resolution for observability.
- Diagnostics should record the resolution chosen.

Add a helper (or extend existing validation):
```js
function is1080pSupported(modelId, task, inputCount) {
  return modelId === 'native.grok.imagine-video' &&
         task === 'image-to-video' &&
         inputCount === 1;
}
```

### 3. Model Catalog Updates (Client + Gateway)

**packages/studio/src/nativeModels.js**
- For the Grok entry (when added):
  ```js
  {
    id: 'native.grok.imagine-video',
    label: 'Grok Imagine Video (Server - Grok CLI)',
    provider: 'grok',
    kind: 'video',
    tasks: ['image-to-video'],           // T2V not in V1
    durationsSeconds: [6, 10],
    resolutions: ['480p', '720p', '1080p'],  // 1080p I2V only
    maxReferenceImages: 0,               // or 6 if we later enable ref, but document 1080p limitation
    supportsAspectRatio: false,
    supportsAudioToggle: false,
    supportsLastFrame: false,
    // Optional future field
    highResI2VOnly: true,                // 1080p requires image-to-video
  }
  ```

**native-media-gateway/exports.js** (MODELS + CAPABILITY_CONSTRAINTS)
- Add the model.
- Add:
  ```js
  grokResolutions: ['480p', '720p', '1080p'],
  grok1080pRequiresImageToVideo: true,
  ```
- In `validateGenerationRequest`, extend the resolution check for grok model.

**packages/studio/src/nativeMedia.js**
- Generalize validation so Grok 1080p is allowed only for I2V with exactly one input.
- Update error messages (no longer Veo-only).

### 4. VideoStudio.jsx (UI)

- In `nativeVideoModelToDescriptor` and helpers (`getResolutionsForI2VNative`, etc.), the Grok model will surface 1080p when present in the catalog.
- When Grok + image-to-video is selected, allow 1080p.
- If someone selects Grok + reference images (when/if enabled), hide or disable 1080p (client-side + server validation).
- Update `applyControlsForModel` if needed for resolution visibility.

### 5. Gateway + Scheduler Behavior

- No special changes to scheduler (it only cares about magic bytes + MIME).
- Longer jobs: consider bumping the per-job timeout when resolution === "1080p" (e.g. default 30min → 45min or make configurable).
- In `publicFailureMessage` / diagnostics, surface resolution.
- Fake provider in tests should support 1080p stub if needed.

### 6. Tests Required

- `tests/nativeGrokVideoProvider.test.js` (new):
  - Accepts 1080p for image-to-video + 1 input.
  - Rejects 1080p for reference-to-video or when no input image.
  - Correct argv contains `--resolution 1080p`.
  - Wrapper path and `shell:false` unchanged.
- Update existing catalog, payload, wiring, and gateway tests to assert the new resolution is present for the Grok model.
- Add a test that the wrapper Python layer rejects 1080p on reference-to-video mode.
- Manual smoke on port 19400 with 1080p + small image + I2V.

### 7. Documentation & README

- Update `README.md` Native Media section:
  - "Grok Imagine Video (local CLI) supports 1080p for image-to-video using Imagine 1.5."
  - "1080p requires a single start-frame image. Reference-to-video is limited to 720p."
- Update `SKILL.md` in the skill repo (or note it here).
- Add example in the planning context file.

## Recommended Implementation Order (for Codex)

1. **Wrapper first** (safe, isolated change):
   - Add 1080p to VALID_RESOLUTIONS.
   - Add strict guard: 1080p only allowed with `--mode image-to-video`.
   - Update help text, SKILL.md, references.
   - Test locally with `--dry-run` and (if quota allows) a real 6s 1080p I2V smoke.
   - Verify ffprobe reports 1080 height on success.

2. **Catalog + validation** (client + gateway):
   - Add 1080p to Grok model resolutions.
   - Add server-side enforcement in validate paths.

3. **grokVideoProvider.js** (as part of the main native provider work):
   - Wire resolution through to the script.
   - Add the I2V + 1080p guard before spawning.

4. **UI + client facade**:
   - Make sure VideoStudio surfaces the option correctly and only for valid combinations.

5. **Tests + manual verification** on `NATIVE_MEDIA_LIVE_GROK=1` + port 19400.

6. **Update all planning docs** (context, main plan, task list, this file).

## Example Usage After Implementation

**Direct wrapper (for testing):**
```bash
python3 /home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py \
  --mode image-to-video \
  --image /abs/path/start.png \
  --prompt "Slow cinematic push-in on the subject, gentle head turn toward camera, soft volumetric lighting." \
  --output /tmp/test-1080p.mp4 \
  --duration 6 \
  --resolution 1080p \
  --overwrite
```

**Via native studio (future):**
- Select "Grok Imagine Video (Server - Grok CLI)"
- Switch to image mode
- Upload one start frame
- Choose resolution = 1080p
- Duration 6 or 10
- Generate

The returned asset will be a 1080p MP4 served from `/api/native-media/v1/assets/...`

## Risks & Mitigations

- **Backend may still return 720p** even with "1080p." in the prompt (local CLI routing is opaque).
  - Mitigation: After first successful 1080p run, capture ffprobe output and document actual achieved resolution.
- **Much longer generation + higher quota burn.**
  - Mitigation: Warn in UI. Use longer timeouts only for 1080p. Prefer 480p/720p for iteration.
- **1080p only works for single-image I2V** (per both docs and our enforcement).
  - Mitigation: Hard validation + clear error messages.
- **Wrapper change affects all users of the skill.**
  - Mitigation: Add the guard immediately. Update docs.

## Open Questions for Codex

- Should we allow 1080p in the native model catalog even before the wrapper change, or gate the catalog entry?
- Do we want a separate catalog ID (e.g. `native.grok.imagine-video-1.5-1080p`) or just add the resolution value?
- After the first real 1080p run, record the actual output resolution + ffprobe metadata in this doc or learnings.md.

---

**Next step for Codex:** Start with the wrapper change (step 1 above). It is the smallest isolated change that unlocks the capability. Everything else is wiring + validation on top of the existing native media architecture.

This document should be kept in sync with `docs/plans/grok-imagine-video-provider-plan.md` and the task list.