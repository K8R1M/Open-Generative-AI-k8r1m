# Native Prior-Art Report: Storyboard, References, And Workflow Tools

Date: 2026-07-02
Research lane: GPT-5.5 native dependency/prior-art scan
Scope: Learn from open-source/proven tools; avoid importing code unless license and stack fit are clean.

## Best Prior Art

```text
+---------------------+-------------------------+-------------+----------------------+-------------+
| Area                | Best references         | License     | Stack fit            | Maturity    |
+---------------------+-------------------------+-------------+----------------------+-------------+
| Workflow nodes      | xyflow / React Flow     | MIT         | Excellent: React/TS  | Very strong |
| Gen workflow model  | ComfyUI                 | GPL-3.0     | JSON ideas only      | Very strong |
| Boards/gallery      | InvokeAI                | Apache-2.0  | Good: TS web app     | Strong      |
| Storyboard UX       | Storyboarder            | unclear/MIT | Pattern only         | Stale       |
| Shot/asset tracking | Kitsu + Zou             | AGPL-3.0    | Schema ideas only    | Active      |
| Prompt variants     | ChainForge, promptfoo   | MIT         | Good: TS/JS patterns | Mixed       |
| Script parsing      | fountain-js, afterwrite | MIT         | Good: local parser   | Small/stale |
| Media library       | Immich, PhotoPrism      | AGPL/other  | Pattern only         | Strong      |
+---------------------+-------------------------+-------------+----------------------+-------------+
```

## Use Or Learn From

### xyflow / React Flow

Sources:

- https://github.com/xyflow/xyflow
- https://api.npmjs.org/downloads/point/last-week/@xyflow%2Freact

Best direct fit for React/Next workflow nodes. MIT, active, roughly 37k GitHub stars, and heavy npm usage for `@xyflow/react`.

Use for:

- Generation workflow nodes.
- Storyboard relation graphs.
- Variant comparison canvases.

### ComfyUI

Sources:

- https://github.com/Comfy-Org/ComfyUI
- https://docs.comfy.org/development/core-concepts/workflow

Strongest workflow JSON prior art. ComfyUI stores/share workflows as compact JSON and embeds workflow metadata in generated images.

Learn:

- Graph serialization.
- Node registry.
- Queue/run separation.

Avoid copying GPL code.

### InvokeAI

Sources:

- https://github.com/invoke-ai/InvokeAI
- https://invoke.ai/features/gallery/
- https://invoke.ai/releases/

Best AI media workspace pattern. Apache-2.0, active, with boards/gallery, canvas, workflows, and DB-backed studio state.

Learn:

- Boards.
- Generated-media review.
- Reference image flow.
- Canvas/workflow integration.

### Kitsu + Zou

Sources:

- https://github.com/cgwire/kitsu
- https://github.com/cgwire/zou
- https://zou.cg-wire.com/

Best production schema prior art:

- Projects.
- Shots.
- Assets.
- Tasks.
- Previews.
- Comments.
- Review states.
- CSV import/export.

AGPL: learn schema/UX, do not embed.

### ChainForge

Sources:

- https://github.com/ianarawjo/ChainForge
- https://chainforge.ai/docs/

Best visual prompt comparison UX:

- Prompt permutations.
- Model/settings comparison.
- Side-by-side outputs.
- Scoring plots.

MIT, but npm package is nearly unused; learn UX, not dependency.

### promptfoo

Sources:

- https://github.com/promptfoo/promptfoo
- https://www.promptfoo.dev/docs/intro/

Use for prompt-template regression/evals, not storyboard UI. MIT, active, roughly 362k npm downloads/week.

### Fountain / Afterwriting

Sources:

- https://github.com/ifrost/afterwriting-labs
- https://github.com/jonnygreenwald/fountain-js
- https://github.com/piersdeseilligny/betterfountain

Useful for Fountain parsing/export and script-scene breakdown.

Prefer a small parser plus our own JSON scene model.

## Avoid

### Storyboarder as dependency

Sources:

- https://github.com/wonderunit/storyboarder
- https://github.com/wonderunit/storyboarder/issues/2509

Great storyboard/shot-generator UX, but desktop app is stale, latest release is old, license status is messy, and it appears no longer maintained.

Learn only:

- Board sequence.
- Panel metadata.
- Animatic export.
- Generated reference-layer ideas.

### Flowise as product substrate

Sources:

- https://github.com/FlowiseAI/Flowise
- https://github.com/FlowiseAI/Flowise/security/advisories/GHSA-3gcm-f6qx-ff7p

Useful node/prompt concepts, but heavier than needed and has a serious RCE history around unsafe CustomMCP config parsing.

Takeaway: never eval workflow config.

### Immich / PhotoPrism wholesale

Sources:

- https://github.com/immich-app/immich
- https://docs.immich.app/features/searching
- https://github.com/photoprism/photoprism

Excellent media-library ideas, but AGPL/heavy server stacks.

Learn:

- Thumbnails.
- Dedupe.
- Metadata search.
- Albums/tags.

## Recommended PRD Direction

Use:

- `xyflow` for node UIs only if/when graph UIs are actually needed.
- Local JSON as the interchange format.
- SQLite for persistent project state if sidecar JSON becomes too limiting.

Model the product around simple entities:

- Project.
- ScriptScene.
- Shot.
- Board.
- Character.
- ReferenceAsset.
- PromptTemplate.
- GenerationRun.
- Variant.

Skipped:

- Adopting GPL/AGPL apps.
- Full node runtimes.

Add those only if the PRD explicitly chooses copyleft or external-process integration.
