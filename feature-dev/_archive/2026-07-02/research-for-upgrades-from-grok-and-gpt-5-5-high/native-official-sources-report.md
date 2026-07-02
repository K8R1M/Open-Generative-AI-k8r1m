# Native Research Report: Higgsfield Official Sources

Date: 2026-07-02
Research lane: GPT-5.5 native researcher
Scope: Public official Higgsfield sources only; no login, paywall bypass, or private scraping.

## Direct Answer

Higgsfield's public official material supports the requested PRD shape.

- Phase 1, scene/shot board: Popcorn is the clearest fit. It supports text plus image references, creates up to 8 scenes per sequence, keeps characters/objects/environments consistent, lets the last image seed the next sequence, and can export the storyboard to Sora 2.
- Phase 1, references for characters/locations/props: Cinema Studio exposes Elements as reusable project assets for characters, locations, and props, referenced with `@tags`. Soul Cast adds a more explicit character-bible layer: genre, era, archetype, physique, outfit, imperfections, plus auto-generated backstory and a character sheet.
- Phase 1, last-frame-to-next-shot: Higgsfield's long-video and start/end-frame pages confirm frame-chaining workflows. Long Video Generator says scenes extend without jump cuts and uses first/last-frame transitions; Veo 3.1 and Kling start/end-frame posts confirm first/last-frame generation modes.
- Phase 2, per-shot camera controls: Cinema Studio and Long Video Generator expose per-shot camera control, including lens, framing, and motion. Cinema Studio marketing says the AI Director handles shot breakdown and prompt population.
- Phase 2, variant compare: The AI Video page says users can switch between models and compare outputs side by side.
- Canvas/MCP relevance: Canvas is a node-based editor for prompts/images/video models with live collaboration; MCP is the bridge to drive Higgsfield from external AI workflows. Useful later, but not required for the core storyboard UX.

## Official Source Evidence

- https://higgsfield.ai/storyboard-generator
  - Popcorn is positioned as a planning/storyboard tool before generation.
  - Supports up to 8 scenes, optional image reference, consistent outputs, and using the last image to continue the story.
- https://higgsfield.ai/cinematic-video-generator
  - Cinema Studio includes AI Director, Elements, and `@tags` for reusable characters, locations, and props.
- https://higgsfield.ai/soul-cast-intro
  - Soul Cast supports configurable AI actors, auto-generated backstory, character sheet, and cross-scene consistency.
- https://higgsfield.ai/ai-video
  - Multi-model workspace and side-by-side comparison.
- https://higgsfield.ai/ai-long-video-generator
  - Storyboard mode, per-shot camera control, first/last-frame transitions, up to 12 refs per scene, 15 seconds per shot.
- https://higgsfield.ai/veo3.1
  - Start/end-frame mode, two-frame support, multi-image reference mode.
- https://higgsfield.ai/canvas-intro
  - Node-based pipeline and live collaboration.
- https://higgsfield.ai/mcp
  - External agent/workflow connector.

## Version Note

Research used currently live public pages and official blog posts retrieved on 2026-07-02.

Useful dated official items found:

- Cinema Studio 2.5 blog: 2026-03-18.
- MCP guide: 2026-06-11.
- Soul ID guide: 2026-06-29.

Higgsfield updates product naming and packaging quickly, so public copy should be treated as a near-current snapshot, not a stable API contract.

## Inferred Backend Concepts

- Scene/shot graph: Popcorn, Canvas, and Long Video Generator imply internal sequence records with scene nodes, shot nodes, and transitions.
- Reusable asset registry: Elements plus `@tags` imply asset IDs/aliases resolving to project entities for characters, locations, and props.
- Identity layer: Soul ID / Soul Cast look like separate identity systems, one trained from photo sets and one parameterized from character attributes, likely both feeding a continuity layer.
- Model router: Multi-model workspace and side-by-side compare imply normalized prompts/refs across multiple vendor models.
- Transition planner: First/last-frame features imply an anchor-frame continuity layer for connected shot sequences.
- Character-bible generator: Soul Cast's auto backstory and motivation/fear/flaw/strength fields read like a structured character record, not just a prompt string.

## Account-Gated Unknowns

- Exact in-app behavior of `@tags`, asset sharing, versioning, and project permissions.
- Whether Character Bible exists as a first-class object or generated metadata.
- True plan limits, credit costs, and free-vs-paid feature boundaries.
- Whether all model-comparison and storyboard features are available in the same tier.
- Exact editor UX details for Popcorn, Cinema Studio, and Canvas.
- Internal schema, persistence, and export formats.

## Browser Automation Or Firecrawl

Browser automation would materially help if a valid account is available and the goal is to verify real UI flows, gated behavior, or editor interactions for the PRD.

Firecrawl would help only a little for bulk extraction of public pages/blogs. It likely will not add much beyond already extracted public sources.

Do not use either to bypass auth, paywalls, or terms.

## Reusable Takeaway

For the PRD, model the product as:

- Popcorn/Storyboard for scene planning.
- Elements plus Soul Cast/Soul ID for continuity.
- Long Video / Veo / Kling for shot-level transitions and camera control.
- AI Video for model A/B comparison.
