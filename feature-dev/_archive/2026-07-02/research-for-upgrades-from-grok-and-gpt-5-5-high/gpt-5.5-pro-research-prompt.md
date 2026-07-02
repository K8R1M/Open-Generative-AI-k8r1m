# GPT-5.5 Pro Research Prompt: Higgsfield-Style Storyboard, References, And AI Video Workflow

You are GPT-5.5 Pro in the ChatGPT web interface. Do deep product, UX, technical, and prior-art research for a PRD/spec that will be handed to an implementation planner later. Do not write implementation code. The target codebase is `Open-Generative-AI`, an open-source AI image/video studio with existing Image Studio, Video Studio, Cinema Studio, Workflow Studio, native media library/history, Gemini Omni, Veo, Grok Imagine, Nano Banana, GPT Image, uploads, generated-asset actions, and native asset metadata.

## Goal

Research how to adapt the best proven parts of Higgsfield-style AI video production into Open Generative AI in two phases:

Phase 1:
- PopCorn-style storyboard -> scene/shot board.
- Elements / @tags -> reusable References: Characters, Locations, Props.
- Character consistency -> Character Bible + reference asset collections, without building full identity-training infrastructure yet.
- First/last-frame workflow -> use generated/extracted last frame as the next shot's first frame.

Phase 2:
- Cinema Studio controls -> per-shot camera settings using existing camera/lens/focal/aperture prompt logic.
- Multi-model workspace -> shot variant comparison across existing model catalog.
- Script-to-long-video -> script/outline to editable scene/shot draft helper.

## Required Research Questions

1. How does Higgsfield actually present these workflows in UI/UX?
   - PopCorn/storyboard generator.
   - Cinema Studio.
   - Elements / @tags for characters, locations, props.
   - Soul ID / Soul Cast / character consistency.
   - AI Long Video Generator.
   - Canvas, MCP/CLI, Collab only where they affect production workflow.
   - First-frame, last-frame, scene extension, multi-shot continuity, shot variants, model comparison.

2. What can be observed from public pages, docs, blog posts, videos, screenshots, Reddit/X posts, creator tutorials, and search results?
   - Separate confirmed facts from inference.
   - Include URLs and quote only short excerpts.
   - Mark anything account-gated or uncertain.

3. If an account is needed, explain exactly what we can learn after login and whether it is worth it.
   - Do not recommend bypassing auth, paywalls, or terms.
   - If browser automation or Firecrawl would help, propose a legal/low-risk collection plan.
   - List specific pages/screens to capture and what questions each would answer.

4. What prior art should we learn from or reuse?
   - Open-source storyboard, shot-list, media library, prompt-template, character/reference, ComfyUI, node-workflow, AI-video, and production-planning tools.
   - GitHub repositories with working implementations or data models we could adapt.
   - Proven UI patterns from creative tools: shot boards, asset bins, reference boards, compare grids, script breakdown, timelines.
   - Include license, maturity, stack fit, and whether to reuse code, copy ideas only, or avoid.

5. What should the backend model look like for Open Generative AI?
   - Minimal metadata-only approach first: no duplicate media files where possible.
   - Proposed entities: Project, Scene, Shot, ReferenceCollection, ReferenceAsset, CharacterBible, Location, Prop, PromptTemplate, Variant, GenerationJobLink.
   - How to link existing `.native-media` jobs/assets/uploads without breaking current history/delete/download behavior.
   - Storage recommendation for V1: JSON sidecars vs existing native job records vs SQLite.
   - Migration and rollback concerns.

6. What should the frontend UX be?
   - Sidebar/library layout.
   - Scene/shot board layout.
   - Asset actions on generated cards.
   - Add to References/Project modal.
   - Character/Location/Prop pages.
   - Shot detail panel.
   - Generate variants and compare.
   - Use last frame as next first frame.
   - Script-to-board flow.
   - Empty states and failure states.

7. What is the smallest two-phase scope that captures the value without overbuilding?
   - Phase 1 must be enough to storyboard with consistent reusable references.
   - Phase 2 should add per-shot camera controls, variant compare, and script-to-board.
   - Explicitly list what to skip: full Soul ID training, realtime collaboration, community feed, video calls, full timeline editor, new model providers unless already available.

## Open Generative AI Context To Assume

Current likely file surfaces:
- `packages/studio/src/components/ImageStudio.jsx`
- `packages/studio/src/components/VideoStudio.jsx`
- `packages/studio/src/components/CinemaStudio.jsx`
- `packages/studio/src/components/WorkflowStudio.jsx`
- `packages/studio/src/nativeMedia.js`
- `packages/studio/src/nativeModels.js`
- `native-media-gateway/server.js`
- `native-media-gateway/exports.js`
- `.native-media/jobs.json`, `.native-media/assets`, `.native-media/uploads`
- `feature-dev/next-feature-inbox.md`

Existing constraints:
- Do not break native media paths: Grok video, Gemini Omni, Veo, Nano Banana, GPT Image, prompt copy, delete, history hydration, existing `.native-media` assets.
- Avoid duplicate file copies; prefer metadata/tag/collection records pointing to original assets.
- Keep V1 small and reversible.
- Generated images and videos already have native job/asset history and actions.
- Gemini Omni supports multi-reference video inputs in this fork.

## Output Format

Return a research report with:

1. Executive summary.
2. Evidence table with source URL, claim, confidence, and relevance.
3. Higgsfield UX map: screens, controls, objects, workflows, inferred backend concepts.
4. Prior-art scan: repos/tools, license, stack, maturity, what to reuse.
5. Recommended Open Generative AI product model.
6. Recommended backend/data model.
7. Recommended frontend UX.
8. Two-phase PRD outline.
9. Spec acceptance criteria.
10. Test/verification checklist.
11. Risks, unknowns, and login/browser/Firecrawl follow-up plan.
12. Explicit "do not build yet" list.

Be concrete. Prefer small, proven, copyable patterns over speculative platform features. Mark all unsupported guesses clearly.
