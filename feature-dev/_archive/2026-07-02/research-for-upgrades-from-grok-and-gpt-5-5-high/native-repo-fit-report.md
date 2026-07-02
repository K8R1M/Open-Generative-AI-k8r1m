# Native Repo-Fit Report: Open Generative AI Surfaces

Date: 2026-07-02
Research lane: GPT-5.5 native repo explorer
Scope: Read-only repo mapping in `/home/k8r1m/Open-Generative-AI`.

## Outcome

Current Phase 1/2 PRD coverage is partially present in generation plumbing. Scene/shot board, structured references, Character Bible, and script-to-board are not first-class domain state yet.

## Relevant Files

### Current continuity and card actions

- `packages/studio/src/components/VideoStudio.jsx:248-254`
  - Uses stored `generatedImageId`, download/job state, and handoff/continuity inputs.
- `packages/studio/src/components/VideoStudio.jsx:948-983`
  - Pulls prior generated image context into I2V flow.
- `packages/studio/src/components/VideoStudio.jsx:1311-1317`
  - Last-frame download action on generated media.
- `packages/studio/src/components/VideoStudio.jsx:1764-1883`
  - Card action menu includes continuity/extend/last-frame workflow.
- `packages/studio/src/components/ImageStudio.jsx:1257-1300`
  - Receives generated-image handoff payload path.
- `packages/studio/src/components/ImageStudio.jsx:1733-1745`
  - Generate-reference action path and handoff behavior.
- `components/StandaloneShell.js:108-119`
  - Router/handoff bootstrap via `sessionStorage` for generated media transitions.
- `packages/studio/src/components/VideoStudio.jsx:948-995`
  - Cross-studio continue flow for image-to-video continuity.

### Native model and media plumbing

- `packages/studio/src/nativeModels.js:1-131`
  - Canonical client-side native model catalog and per-model constraints used by studios.
- `packages/studio/src/nativeMedia.js:54-61, 106-127, 129-173, 360-386`
  - Native payload shaping, validation, request building, and signed download wiring.
- `native-media-gateway/exports.js:14-37, 98-106, 260-310, 955-965, 937-953`
  - File/job persistence layer, path validation, media ID safety checks, and list/delete semantics.
- `native-media-gateway/server.js:312-350`
  - Native API endpoints, including last-frame-related route wiring.
- `native-media-gateway/bin/extract-last-frame.js:1-103`
  - FFmpeg-based last-frame extraction helper, timeout behavior, and temp-file cleanup.

### Cinema controls

- `packages/studio/src/components/CinemaStudio.jsx:17-38, 77-105, 449-664`
  - Existing Cinema control UI/logic, but not wired as per-shot board controls.
- `packages/studio/src/index.js:3-18`
  - Studio export surface for consumers.

### Planning context

- `feature-dev/omni-v1/implementation-state.md:1-170`
  - Current implementation truth source for comparing new PRD deltas.
- `feature-dev/storyboard-references-v1/gpt-5.5-pro-research-prompt.md:9-18, 54-69, 73-90`
  - Target scope and phase requirements.

## Relationships

### Prompt / asset continuity flow

`components/StandaloneShell.js` seeds `sessionStorage` handoff.

`VideoStudio` / `ImageStudio` consume via nonce and handoff state.

Generation calls go through `nativeMedia.js`.

`native-media-gateway/exports.js` and `native-media-gateway/server.js` persist and serve assets.

### Last-frame continuity flow

`VideoStudio` exposes card action for last frame.

Gateway route calls `extract-last-frame.js`.

Extracted frame becomes downloadable and can be used as a reference input in later I2V generation.

### Model constraints ownership flow

Studio UI model dropdown/rendering uses `nativeModels.js`.

Server execution constraints also appear in gateway exports.

PRD must call out source-of-truth drift risk across client/server model capability lists.

### Cinema controls flow

`CinemaStudio.jsx` has cinema-style rendering/control logic.

There is no existing linkage from shot-level board rows into VideoStudio/ImageStudio.

Phase 2 needs a shared shot-state schema and UI adapter, not a rewrite of Cinema Studio.

## PRD Mapping

### Phase 1

Required:

- Scene/shot board.
- References for characters, locations, and props.
- Character Bible.
- Last-frame-to-next-shot.

Reuse:

- Generated reference + handoff pattern for shot reuse and visual continuity.
- Last-frame extraction/continuity toolchain.
- Native media IDs/jobs/assets as the durable media layer.

Missing:

- Explicit scene/shot board entity model.
- First-class references collection for characters, locations, and props.
- Character Bible metadata schema.
- Script-to-board ingestion pipeline.

Best reuse approach:

- Add a board-layer state model on top of existing media entities.
- Do not rewrite native gateway primitives.

### Phase 2

Required:

- Per-shot Cinema controls.
- Model variant compare.
- Script-to-board.

Reuse:

- Cinema control logic/components in `CinemaStudio.jsx`.
- Native model list/constraints in `nativeModels.js` and gateway.

Missing:

- Per-shot control state.
- Model-variant compare view and persistence tied to shot/scene records.
- Script parsing/breakdown to board records.

## Native Media Ownership Boundaries

- UI/state ownership: studio components.
- Generation request and validation: `nativeMedia.js` plus backend `exports.js`.
- Process/tooling constraints: `extract-last-frame.js`.
- Route orchestration: `server.js`.
- Existing media/job IDs and metadata are owned by gateway exports endpoints and reused by studio UI through generation history cards.

## Regression Risks

- Model list drift: `nativeModels.js` vs gateway constraints can cause unreachable options or invalid requests.
- `sessionStorage` handoff fragility: ephemeral/nonce-based handoffs could collide with persistent board state unless cleaned up carefully.
- Job/path validation coupling: new board references/variant metadata must respect strict native media IDs exactly.
- Async media cleanup race: automated last-frame extraction across many shots could increase subprocess/resource pressure.
- UI state explosion: adding scene/shot/reference fields directly into VideoStudio card objects can break backward compatibility with older cards/history renderers.

## Recommended Next Steps

1. Add a board-layer schema under studio state: shots, refs, bible refs, script mapping.
2. Store pointers to existing media/job IDs instead of replacing native media structures.
3. Add adapter functions that map shot rows to Cinema control props.
4. Add per-shot variant compare as UI/selection state that feeds existing model/job request fields.
5. Preserve existing card JSON shape; add fields only in additive sidecar/project state.
