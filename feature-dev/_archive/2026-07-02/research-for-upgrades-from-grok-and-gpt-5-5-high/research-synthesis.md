# Research Synthesis: Storyboard References V1

Date: 2026-07-02
Folder: `feature-dev/storyboard-references-v1`

## Read Order

1. `gpt-5.5-pro-research-prompt.md` - prompt for GPT-5.5 Pro web research.
2. `grok-4.3-research-report.md` - Multica Grok 4.3 public-web research report.
3. `native-official-sources-report.md` - official Higgsfield source scan.
4. `native-ux-report.md` - UX/product shape recommendation.
5. `native-prior-art-report.md` - open-source/prior-art scan.
6. `native-repo-fit-report.md` - current Open Generative AI codebase fit.

## Consensus

Build a small Production Board layer over existing native media plumbing.

Do not build a full NLE, Soul ID training platform, real-time collaboration surface, community feed, or new provider layer for this PRD.

## Phase 1 Candidate Scope

- Scene/shot board.
- References collections for Characters, Locations, Props.
- Character Bible metadata over reference collections.
- Generated asset actions to save image/video references to a project/shot/reference collection.
- Last-frame-to-next-shot workflow using existing gateway extraction and native media asset IDs.
- Metadata-only links to existing `.native-media` assets/jobs/uploads.

## Phase 2 Candidate Scope

- Per-shot camera controls by reusing Cinema Studio prompt-control logic.
- Model variant compare for a selected shot.
- Script/outline to editable scene/shot stubs.
- `@tag` autocomplete for reusable references in prompts.

## Backend Direction

Use additive project/board state that wraps existing native media IDs.

Preferred early shape:

- Project.
- Scene.
- Shot.
- ReferenceCollection.
- ReferenceAsset.
- CharacterBible.
- Variant.
- GenerationJobLink.

Avoid duplicate media files. References should point to existing native media assets/jobs.

Storage can start as sidecar project JSON for reversibility, then move to SQLite if search, concurrency, or migrations demand it.

## UX Direction

Layout:

- Left rail: Projects / Script / Assets / History.
- Center: board of scenes and shots.
- Right inspector: selected shot details, references, prompt, camera, generation controls.

High-value actions:

- Add shot.
- Duplicate shot.
- Reorder shot.
- Add generated asset to reference collection.
- Use generated asset as shot first frame.
- Extract last frame.
- Use last frame as next shot first frame.
- Generate variants.
- Promote variant to selected shot.

## Follow-Up Research Worth Doing

Browser/login research is worth doing if Karim wants exact Higgsfield UI screenshots and account-gated behavior before writing the final PRD.

Capture only through normal account access:

- Popcorn canvas after first generation.
- Cinema Studio Elements panel.
- `@tag` prompt input behavior.
- Soul/Soul Cast creation flow.
- Shot detail view and frame chaining buttons.
- Variant/model compare UI.

Firecrawl is lower priority; public pages already gave enough PRD direction.

## PRD Guardrails

- Preserve Grok video, Gemini Omni, Veo, Nano Banana, GPT Image, prompt copy, delete, history hydration, and existing `.native-media` assets.
- No fake successful generation.
- No destructive changes to native media storage.
- No GPL/AGPL code imports without explicit license decision.
- No custom node/workflow runtime in V1.
- Keep the branch separate from `main` until verified.
