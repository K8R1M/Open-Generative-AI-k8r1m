# Google Flow — Feature & UX Inventory

Research date: 2026-07-02. Sources: Google's official Flow help center, Google blog announcements (including the Feb 2026 and I/O 2026 updates), and third-party guides/reviews. Flow has evolved substantially since its May 2025 launch (Veo 3 era) through the Veo 3.1 update, the Feb 2026 Whisk/ImageFX merge, and the mid-2026 Gemini Omni rollout — version differences are called out inline where found.

---

## 0. What Flow is, at a glance

Google Flow (`labs.google/flow`, formerly built on VideoFX) is Google's dedicated AI filmmaking product, positioned as "the evolution of VideoFX into a dedicated filmmaking product." It is **not** a standalone model — it's a unified creative workspace that wraps Google's generative models (Imagen for images, Veo 2/3/3.1 for video, Gemini/Gemini Omni for reasoning, prompt understanding, and conversational editing).

Access is subscription-gated via **Google AI Pro** and **Google AI Ultra** plans (no meaningful free tier for video; image generation became free as of the Feb 2026 update). Pricing/credits are a frequent source of user complaints (see §8).

Three broad interface areas recur across docs and reviews:
1. **Generate** — single-clip generation from a text prompt (or frames, or ingredients).
2. **Scenebuilder** — the multi-shot timeline/storyboard production environment.
3. **Library / Project** — saved clips, images, characters, ingredients, and settings, organized into projects and collections.

A **Flow Agent** (Gemini-powered) sits across all three, available as a conversational side panel.

---

## 1. Core workflow: idea → images → clips → assembled scene

Flow supports three parallel entry points into generation, all converging on the same clip format (Veo native output = short clips, historically 8 seconds per generation):

- **Text-to-Video**: user writes a detailed prompt ("subject, action, environment, lighting, style"); can request multiple variations from one prompt simultaneously.
- **Frames-to-Video**: user drags a **start frame** and **end frame** image into designated slots and describes the motion/action that should happen between them ("create transitions, animate images, or generate a video that starts and ends with specific images").
- **Ingredients-to-Video**: user supplies up to **3 reference images** (characters/objects/style) per prompt; Flow composes a new scene using those references as anchors (see §2).

High-level project flow:
1. Sign in with a Google account; select an existing **project** or create a new one (projects are the top-level organizational container, akin to a "film" or campaign folder).
2. In the prompt box, optionally enable **Agent mode** for conversational brainstorming/planning (outline storyboards, build mood boards) before generating anything.
3. Click the model name to open **Video settings**: aspect ratio, output quantity (batch variations), model choice (Veo 2 vs Veo 3 vs Veo 3.1 vs Omni Flash), generation length.
4. Click **Generate**. Multiple variations render into the project's asset grid.
5. Iterate: extend a clip, edit it conversationally (drag it into the prompt box + describe the change), or pull a still frame out as a new ingredient.
6. Assemble selected clips into **Scenebuilder** (the storyboard/timeline), reorder, trim, and preview the whole sequence.
7. Download the finished scene (video file or GIF), share via a generated link, or publish straight to YouTube (title, description, visibility, tags, category settable in-app).

Since the **Feb 2026 update**, Whisk and ImageFX were folded directly into Flow ("Nano Banana" image generation is now core to the experience), so image ideation, editing, and animation all happen in one workspace rather than requiring a separate image tool before importing into Flow. Early Whisk/ImageFX users could opt in (from March 2026) to migrate their existing projects/assets into Flow's library.

---

## 2. Ingredients system (character/location/object references)

**Definition**: "An ingredient is a consistent visual element — a character, an object, or a stylistic reference — that you can create from a text-to-image prompt (via Imagen) or by uploading an image."

**Creation paths**:
- Generate via text-to-image prompt inside Flow (Imagen-backed).
- Upload an existing image (photo, illustration, product shot). Best practice cited: use a **plain or segmented background** for subject/product references so the model isolates the subject cleanly.
- Extract a frame from an existing generated video (pause playback → save frame → use as an ingredient) — this is how continuity gets bootstrapped from earlier generations.

**Storage/reuse**:
- Ingredients are saved as first-class assets in the project library, filterable by media type (the asset filter list explicitly includes "Characters" and "Scenes" alongside Images/Videos/Uploads).
- A dedicated **Characters** construct bundles both **visual and audio references** (Omni Flash-era voice cloning: "maintain a specific character's voice across multiple video clips" from a single-speaker audio sample, or a custom-built voice) so a character's look *and* voice travel together across shots.
- Ingredients can be added to a new prompt via drag-and-drop or an explicit **Add** button in the prompt box; **up to 3 ingredients per prompt** in the original Ingredients-to-Video flow (Veo 2 launch constraint — later Veo 3.1 update improved multi-reference identity consistency, described below).
- The text prompt is used to describe *how the ingredients should interact* — the images anchor appearance, the text drives action/relationship/composition. Google's own tip: don't let the text prompt contradict the visual references.

**Veo 3.1 "Ingredients to Video" improvements** (per Google's Veo 3.1 blog post):
- Better **identity consistency** — characters keep their look even as the *setting* changes, enabling a character to recur across many different scenes/environments rather than only near-identical repeats of one shot.
- Native **9:16** output support (vertical/social formats) for ingredient-driven generations.
- Higher-fidelity upscaling to 1080p/4K tied to subscription tier.
- Full audio (dialogue/SFX/ambient) generated in the same pass as video, not bolted on afterward.

**Known friction** (from troubleshooting content): ingredient fidelity can degrade with busy/cluttered reference backgrounds, and users report inconsistent adherence when combining 3 unrelated ingredients in one prompt vs. 1–2.

---

## 3. Scenebuilder / storyboarding

Scenebuilder is described consistently as **"your in-Flow storyboard, where you assemble individual clips into a complete narrative."**

**Core mechanics**:
- **Arrange**: drag generated clips onto a timeline/sequence; **reorder** clips by dragging.
- **Trim**: each clip has start/end **trim handles** to cut in/out points without leaving the tool.
- **Preview**: scrub/play the assembled sequence as a whole before export.
- **Extend**: select a clip → click **Extend** → describe how the action should continue → Flow analyzes the clip's **final frames** and generates new frames that stitch on seamlessly, "letting your shot breathe without a full regeneration" (e.g., a man walking left-to-right continues walking rather than the whole clip being re-rolled). This is effectively **last-frame chaining** — the model conditions the next generation on the tail frames of the prior clip, which is how Flow achieves continuity between chained segments without a literal "video length" parameter beyond the ~8s native Veo unit.
- **Jump To**: transitions a character/object into a **completely new setting** while preserving its appearance from the previous shot — i.e., a scene-break tool (as opposed to Extend's continuous-motion tool). Under the hood it "leverages Gemini to understand the end of the previous clip and generate the next one seamlessly." Tip from Google: keep character names identical across prompts and tick "Jump To" to maximize consistency across the cut.
- **Looping**: Scenebuilder can automatically align a clip's first and last frames for seamless GIF-style looping output.
- **Versioning**: a **History panel** preserves every prior generation/iteration plus the prompt that produced it, so users can revert or branch from an earlier version rather than losing work on a re-roll.

**Version/rollout caveat**: At the original 2025 launch, Google explicitly noted Jump To and Extend worked **only with Veo 2**, with Veo 3 support "in the works" — i.e., Scenebuilder's advanced continuity tools lagged behind the newest base model at first. This gap has since closed as Veo 3.1/Omni rolled out, but it's a concrete example of how a small number of "structural" workflow features (extend/continuity) trailed raw model upgrades by months.

**Editing via Gemini Omni Flash** (separate from Scenebuilder, an "Edit & Refine" capability): upload a video up to 60s / 1GB (.mov/.mp4/.avi/.wmv), auto-trimmed to 30s max, select up to a **10-second segment**, describe changes in natural language ("change the lighting to a cinematic sunset"), and refine through **up to 3 conversational turns** while the model retains context of prior edits in that session.

**Download/export**: final scenes export as video files or GIFs; share via a generated link (optionally including the input/prompt used); or publish directly to YouTube with metadata fields inline.

**User complaint** (Chase Jarvis review, a 20-year video pro): despite strong individual pieces, the *Scenebuilder/timeline stitching interface itself* is "confusing and unintuitive" and "isn't quite ready for prime time yet" — the friction is specifically in the assembly/editing metaphor, not the underlying generation quality.

---

## 4. Frames-to-video / camera controls

**Frames-to-video**: drag a start frame and (optionally) an end frame into the interface; Flow interpolates/generates the motion between them. Positioned as the tool for "setting the scene" — locking down first and last composition, then letting Veo fill the motion.

**Camera controls — two-tier system**:

1. **Easy Mode (UI controls)**: a camera icon inside the Frames-to-Video interface exposes one-click preset movements — **Dolly In, Dolly Out, Pan Left, Pan Right, Tilt Up, Tilt Down** — without writing any prompt text. One source describes this as scaling up to "13 granular camera sliders" for zoom/pan/dolly/roll directly on the timeline, with a **copy-bar** to paste the same camera values across multiple clips for motion-matched consistency (unclear if this is a Flow-native feature or a third-party extrapolation — flagged as lower-confidence).
2. **Pro Mode (prompt-based)**: camera behavior specified in text using a cinematography vocabulary that stacks with the UI controls (both can be used together). Selectable/promptable dimensions include:
   - **Shot type**: wide, medium, close-up, extreme close-up, POV.
   - **Camera angle**: low angle, high angle, eye level, bird's eye, worm's eye.
   - **Movement**: pan, tilt, dolly (physical camera move — distinct from zoom, a lens-only effect), tracking/steadicam, crane, aerial/drone, handheld/shaky-cam, vertigo/dolly-zoom.
   - **Optics**: shallow depth of field, focal length (e.g., 85mm portrait vs 35mm wide), rack focus (focus pull between fore/background).
   - Google's own recommended prompt skeleton: **[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]**.

A separate **Camera Adjustment** feature lets users tweak camera position/orbit/dolly on an *already-generated* clip rather than only at generation time.

---

## 5. Asset/library management

- **Projects** are the top-level container (create / rename via "Edit project" / delete). Everything else nests under a project.
- **Asset grid** (redesigned Feb 2026): search bar + **Filters**, with a left-hand media-type selector: **All Media, Images, Videos, Characters, Scenes, Uploads**. Toggleable view modes (grid/browse vs. detail focus).
- **Collections**: folder-like grouping of assets; collections can be **nested inside collections**. Drag-and-drop to add; explicit "Move out of collection" action to remove.
- **Characters**: a distinct asset type bundling consistent visual + voice references (create/edit/delete), described as staying "strictly consistent" across generations.
- **Agent-assisted organization**: with Agent mode toggled on in the prompt box, users can ask in natural language to "rename specific files," "group selected media into a new collection," or "archive unused assets" — i.e., library housekeeping is itself a conversational/agentic action, not just manual drag-and-drop.
- **Flow TV**: an in-product discovery/inspiration feed of other creators' outputs, organized into themed channels (e.g., "Fantasy Shorts," "Sci-Fi Proof-of-Concepts," "Brand Spots"), where each entry exposes the **prompt and settings** that produced it and can be **forked directly into your own workspace** — effectively a public template gallery baked into the tool rather than a separate marketplace.
- Scale claim (Feb 2026 blog): "users have created over 1.5 billion images and videos" — indicates the library/search UX has to hold up at real scale, which is presumably why the asset grid got a dedicated redesign pass.

---

## 6. Prompting UX

- **Prompt box** is the universal input across Generate, Scenebuilder edits, and Agent chat — same widget, different context.
- **Gemini-assisted prompt expansion**: users are explicitly encouraged to "use Gemini to help" flesh out a terse idea into a full prompt covering subject/action, composition, camera motion, location, lighting, alternate styles, and audio/dialogue — i.e., prompt expansion is a first-class, promoted workflow step, not a hidden power-user trick.
- **Style presets**: quick style toggles cited in reviews include "Cinematic," "Film Noir," "Action Figure" — one-click style transforms rather than users writing style language from scratch every time. Style is described as answering "does this look like a Hollywood production, an animation, a 90s documentary, or a hand-drawn crayon sketch?"
- **Reusable prompt blocks**: prompts can be structured so a single element (e.g., a character or object name) is swapped without rewriting the full prompt — supports rapid variation testing (same scene, different subject).
- **Per-shot vs. global consistency**: Google's own tip for multi-clip consistency is to **explicitly tell Gemini to repeat all essential details** in every per-shot prompt rather than relying on implicit memory — i.e., Flow does not (at least didn't at launch) automatically propagate a "global style/character sheet" into every new prompt; the user (or the Agent, if asked) has to carry that context forward manually or via Ingredients/Characters.
- **Agent as planning layer**: before any generation, the Agent can be used purely conversationally to outline a storyboard or mood board — separating "what's the plan" from "generate the shot," which keeps the prompt box from being overloaded with planning language.
- **Audio prompting**: audio (ambient sound, effects, dialogue, music style like "cinematic strings" or "80s synthwave beat") can be specified inline in the same prompt as visuals — Veo 3+ generates video and audio together in one pass rather than as a separate step.

---

## 7. Templates/presets and how Flow stays simple

Flow's simplicity strategy, inferred from docs + comparative reviews, rests on a few deliberate choices:

- **Single-vendor, curated model stack** instead of a multi-model marketplace: Flow only exposes Google's own Imagen/Veo/Gemini family, chosen and versioned by Google, vs. competitors like **Higgsfield** which surface 15+ third-party engines under one subscription. Fewer model choices = fewer decisions per generation.
- **Progressive disclosure on camera control**: a one-click "Easy Mode" preset (Dolly In/Out, Pan L/R, Tilt U/D) sits directly in front of the full cinematography vocabulary (shot type, angle, movement, optics) — casual users never have to learn the Pro-mode prompt grammar; power users can layer prompt text on top of the same UI controls.
- **Templates via forkable public examples (Flow TV)** rather than a dropdown template library — inspiration and starting points are sourced from real community outputs with visible prompts, which doubles as implicit prompting education.
- **Style presets as single-word toggles** (Cinematic, Film Noir, Action Figure) instead of long style-prompt authoring.
- **Agent does the "hard" structuring work conversationally** — brainstorming, storyboard planning, renaming/organizing assets — so the manual UI doesn't need dense menus for those tasks; users just ask.
- **One editing metaphor reused everywhere**: dragging media into the same prompt box for edits, generation, and organization, rather than separate specialized panels per action.
- Explicitly contrasted against After Effects–class tools: Flow is "a very simplified web app vs. something like After Effects" — the tradeoff being power/precision for approachability, which reviewers flag as *not yet sufficient* for high-end professional finishing (see §8).
- Higgsfield, by contrast, has **no built-in scene/video editor at all** — it's positioned purely as a generation layer with character consistency and camera control, leaving assembly to external tools. Flow's bet is the opposite: bundle a (currently rough) built-in editor/Scenebuilder so users never have to leave the product, at the cost of that editor being less mature than dedicated NLE tools.

---

## 8. Known limitations / user complaints (what NOT to copy)

**Pricing & credits — the single biggest complaint theme**:
- Credit system layered on top of subscription tiers is widely called "confusing" — the sticker price of a plan doesn't reveal what you can actually do with it.
- Steep tier cliff: jumping to unlimited-style access (AI Ultra) has been characterized as up to a **1,150% price increase** over lower tiers.
- Credits **do not roll over** month to month — unused credit expires at the billing cycle boundary, which reviewers call punitive for bursty/irregular creative work.
- Video costs credits *much* faster than images — one estimate: a single Veo 3 clip with audio costs ~50 credits, so a 100-credit/month allotment yields only ~2 full video generations, which is very easy to blow through with any regular use.
- Net effect: users report hitting the credit ceiling quickly if generating daily, which pushes them toward expensive upgrades or third-party "cheaper Veo access" resellers.

**Scenebuilder / editing UX**:
- Described by an experienced video professional as **"confusing and unintuitive"** despite two decades of NLE experience — the assembly/timeline metaphor doesn't yet match user mental models from traditional editors.
- Called generally **"finicky"** — implies inconsistent/unpredictable behavior rather than a clean, learnable interaction model.
- Jump To / Extend historically **lagged base-model releases** (Veo 2–only at launch, Veo 3 support arriving later) — a structural lesson: don't ship "headline" continuity features tied to only the model version at general-availability time; plan for the workflow layer to trail the model layer and communicate that gap clearly.

**Generation quality / reliability**:
- **Prompt adherence problems** — reviewers describe having to "wrestle with the AI" to get specific direction followed, especially for nuanced staging/blocking.
- **Audio quality** deemed unsuitable for professional use — "won't replace sound designers"; treat generated audio as scratch/placeholder, not final mix.
- Not considered **production-ready for high-end client work** — best positioned (by its own reviewers) for storyboarding, pitch visualization, B-roll, and concept mockups rather than final-delivery assets.

**Access/availability**:
- Subscription-only with **no meaningful free video tier**; image generation only became free in the Feb 2026 update.
- **Staged/regional rollout** — availability and feature parity vary by geography even though nominally "100+ countries."
- No stable/public API surface for programmatic access — it's a consumer web/app product, not an integration point.

**Ingredients-specific friction**:
- Fidelity/consistency degrades with cluttered reference backgrounds or when combining multiple unrelated ingredients (3-ingredient cap at launch existed partly because adherence drops with more simultaneous references).

---

## Adoptable patterns for a personal creative studio portal

Concrete, design-ready ideas for our own studio (references Merlin Studio's existing slice plan: projects-store, media-library-tab, references-and-tags, storyboard-board, shot-generation, continuity, prompt-templates):

1. **Ingredient = first-class typed asset, not a tag.** Model "Character," "Location," "Object/Prop," and "Style" as distinct entity types in the media library (not just free-text tags), each with: a display thumbnail, an optional bundled voice/audio reference, a text description, and a list of source images. This maps directly onto Flow's Characters/Ingredients split and lets the UI show type-specific icons/filters (mirrors slice-07 references-and-tags).

2. **Drag-to-insert ingredient chips in the prompt box.** Let a user drag a Character/Location card from the library straight into the prompt textarea, rendering as an inline chip (not raw text) that expands to the right reference-image payload at generation time — avoids users re-typing descriptions and re-uploading images per shot.

3. **Cap and surface the reference limit in the UI, don't hide it.** Flow caps ingredients per prompt (3 at launch) because adherence drops past that — show a visible counter/limit in our prompt builder ("2/3 references") with a tooltip explaining *why*, rather than silently truncating or letting quality degrade unexplained.

4. **Last-frame-chaining "Extend" as a first-class Scenebuilder action**, distinct from "Jump To."** Implement two explicit continuity primitives: (a) **Extend** — condition the next generation on the literal last N frames of the selected clip for continuous motion; (b) **Cut/Jump** — condition only on character/ingredient identity, allowing a full setting change. Exposing these as two separate buttons (not one ambiguous "continue" action) avoids the "confusing Scenebuilder" complaint — make the mental model explicit in the UI copy itself (maps to slice-10 continuity).

5. **Auto-carry "essential details" across shots instead of relying on user memory.** Flow's own advice is "explicitly tell Gemini to repeat all essential details" per shot — that's a manual workaround for a missing feature. We should build the fix: a per-scene "style/character sheet" object that's automatically injected into every shot's prompt context unless explicitly overridden, so continuity doesn't depend on the user re-typing description text every time (this is a concrete improvement opportunity beyond Flow, informs slice-11 prompt-templates).

6. **Two-tier camera control: preset row + advanced prompt fields, always stacked.** Ship a compact preset strip (Dolly In/Out, Pan L/R, Tilt U/D, Static) as one-click buttons that write into a structured (non-hidden) camera field, plus an "advanced" expandable section for shot type / angle / movement / optics / focal length — and always show the resulting prompt text so power users can hand-edit it. Never let UI-only controls be a black box that can't be inspected or copy-pasted.

7. **History panel as branch-not-just-undo.** Every regeneration should be preserved with its exact prompt + settings, and any history entry should be one click away from "restore as current" or "duplicate as new variant" — not just a linear undo stack. This directly supports iterative shot exploration without punishing experimentation.

8. **Frame extraction as a bridge action.** Let users pause any generated video, grab a frame, and one-click "save as ingredient" or "use as start/end frame for next generation" — this is how Flow bootstraps continuity from prior output and is cheap to implement if frames are already server-side extractable (relevant to our native-media-gateway frame extraction work already in progress — `native-media-gateway/frames.js`, `bin/extract-last-frame.js`).

9. **Collections as nested folders, with an agent shortcut to auto-file.** Support arbitrary-depth nested collections (project → scene → shot-variant groupings), and add a lightweight "auto-organize" action (even a simple LLM classify-and-move pass, not a full agent) so libraries don't degrade into an unsorted grid once generation volume climbs into the hundreds.

10. **A visible, non-punitive usage/quota indicator tied to the actual expensive operation (video gen), not an abstracted "credit."** Given this is a personal tool (not a paid SaaS), skip Flow's credit-obfuscation entirely — show real cost/quota (e.g., "$X spent this month," "N Veo/Gemini calls remaining today") in plain units tied to the underlying provider cost, since that's the single most-hated aspect of Flow's UX.

11. **Style presets as named, user-editable, reusable objects** — not just a fixed built-in list (Cinematic/Film Noir/Action Figure). Let users save any prompt-suffix as a named "look" they can reapply project-wide, and let a project have a single "default style" that new shots inherit unless overridden — this both replicates Flow's one-click style toggle *and* fixes its lack of a persistent global style default (ties to slice-11 prompt-templates).

12. **Forkable examples as onboarding, scoped to your own past work first.** Rather than building a public gallery (Flow TV), start smaller: a "recent successful prompts" rail surfaced per project/ingredient, so the user's own best past generations become the templates — cheaper to build than a curated public feed and immediately useful for a single-user tool.

13. **Explicit distinction between "scratch/placeholder audio" and "final" in the UI**, if/when we add audio generation — Flow's generated audio is explicitly not professional-grade; label it as such (e.g., a small "draft audio" badge) so expectations are set correctly rather than users being surprised at final-quality gaps.

14. **Trim handles + sequence reorder + inline preview as the Scenebuilder MVP**, but invest specifically in making the *stitching/assembly* interaction obvious (this is Flow's most-cited UX failure) — e.g., a strictly linear horizontal timeline with clear drag targets and a persistent "insert extend/cut here" affordance between clips, rather than a dense multi-track editor metaphor that intimidates non-editors.

15. **Keep the model surface small and Google/Vertex-native**, mirroring Flow's single-vendor simplicity bet rather than Higgsfield's multi-engine marketplace — fewer model/engine choices per generation reduces decision fatigue for a personal tool, and matches this repo's existing Vertex/Gemini-centric provider setup.

---

## Sources

- [Google Flow — About](https://labs.google/flow/about)
- [Introducing Flow: Google's AI filmmaking tool designed for Veo](https://blog.google/technology/ai/google-flow-veo-ai-filmmaking-tool/)
- [5 tips for using Flow, Google's AI filmmaking tool](https://blog.google/innovation-and-ai/products/flow-video-tips/)
- [Create videos in Google Flow — Help Center](https://support.google.com/flow/answer/16353334?hl=en)
- [Edit videos & build scenes in Flow — Help Center](https://support.google.com/flow/answer/16935718?hl=en&ref_topic=16908930)
- [Manage your Flow projects, assets & collections — Help Center](https://support.google.com/flow/answer/16935308?hl=en)
- [Use the Google Flow Agent — Help Center](https://support.google.com/labs/answer/17093911?hl=en)
- [Veo 3.1 Ingredients to Video: More consistency, creativity and control](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)
- [Bringing new Veo 3.1 updates into Flow to edit AI video](https://blog.google/innovation-and-ai/products/veo-updates-flow/)
- [Flow gets new ways to refine and edit videos with AI](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-refine-videos/)
- [Flow updates: New changes to Google AI video editing tool (Feb 2026)](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-updates-february-2026/)
- [New agents, mobile apps and Gemini Omni for Google Flow and Google Flow Music](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-updates/)
- [Introducing Gemini Omni](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni/)
- [Google Flow + Veo Guide 2026: What Google's AI Filmmaking Stack Actually Includes](https://aividpipeline.com/blog/google-flow-veo-3-1-guide-2026)
- [What is Google Flow? My honest review of their AI video editor — Chase Jarvis](https://chasejarvis.com/blog/what-is-google-flow-my-honest-review-of-their-ai-video-editor/)
- [Flow Scenebuilder Extend Shots guide — digiwebinsight](https://digiwebinsight.com/flow-scenebuilder-extend-shots/)
- [Flow Camera Controls Explained — digiwebinsight](https://digiwebinsight.com/flow-camera-controls-explained/)
- [Google Flow: The Next Leap in AI Filmmaking With VO3 — flowdevs.io](https://www.flowdevs.io/blog/post/google-flow-vo3-ai-filmmaking)
- [Google Flow Pricing Explained: Credits, Tiers, and What You Actually Get — MindStudio](https://www.mindstudio.ai/blog/google-flow-pricing-credits-tiers-explained)
- [Google Flow Review: I Tested Its AI Video Features, Credit Costs, and Real Limits — GoEnhance](https://www.goenhance.ai/blog/google-flow-review)
- [Flow by Google vs. Higgsfield AI Comparison — SourceForge](https://sourceforge.net/software/compare/Google-Flow-vs-Higgsfield/)
- [Higgsfield Camera Controls](https://higgsfield.ai/camera-controls)
- [Scene builder jump to feature — Gemini Apps Community thread](https://support.google.com/gemini/thread/346299493/scene-builder-jump-to-feature-not-adding-sound-to-extended-scenes?hl=en)
- [How to Use Google Flow for AI Video Editing: Omni Flash Tutorial — MindStudio](https://www.mindstudio.ai/blog/how-to-use-google-flow-gemini-omni-video-editing)
