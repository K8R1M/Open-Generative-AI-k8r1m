# Research Report: Higgsfield Storyboard/References for Open Generative AI PRD (MER-207)

**Date:** 2026-07-02
**Researcher:** Grok 4.3 General
**Scope:** Public web evidence only (no login, no paywall bypass). Two-phase PRD for storyboard + reusable references in Open Generative AI.

---

## 1. Executive Summary

Higgsfield publicly exposes two core workflows directly relevant to the brief:

- **Popcorn (Storyboard Generator)** — https://higgsfield.ai/storyboard-generator
  Generates up to 8 consistent scenes from a prompt + optional reference image. Supports multi-angle, lighting, style consistency. Explicitly advertises "take the final image and use it as the new reference input" for limitless chaining and first/last-frame continuity. One-click export to Sora 2.

- **Cinema Studio 3.5** — https://higgsfield.ai/cinematic-video-generator
  Professional film production suite with reusable **Elements** (Characters, Locations, Props) referenced via @tags. Per-shot camera/lens/focal/sensor controls, genre/style/mood panels, color grading, AI co-director ("Mr. Higgs"), and real-time collaboration. All image/video models available in one workspace.

**Soul** (https://higgsfield.ai/soul) provides 50+ aesthetic presets for hyper-realistic character consistency and serves as the visible face of "Soul Cast / Soul ID" style identity features.

These map cleanly to Phase 1 (Popcorn-style storyboard + Elements/@tags + character bible via reference collections) and Phase 2 (Cinema Studio camera controls + variant compare + script-to-board).

No account is required to read the public landing pages, tutorials, FAQs, or sitemaps. Deeper screens (actual Popcorn canvas, Cinema Studio workspace, Soul Cast management) are behind login.

---

## 2. Evidence Table

| Source URL | Claim | Confidence | Relevance |
|------------|-------|------------|-----------|
| https://higgsfield.ai/storyboard-generator | "Transform ideas into fully controllable storyboards with Higgsfield Popcorn. The AI storyboard tool that locks in character consistency, guides composition, and exports to Sora 2 in one click." | High (public landing) | Core storyboard UX |
| https://higgsfield.ai/storyboard-generator | "You can take the last image of your sequence and use it as the new reference input to continue the story, allowing you to build narratives of any length." | High | First/last-frame chaining |
| https://higgsfield.ai/storyboard-generator | "Get up to 8 matching scenes with aligned characters, lighting, and tone." + "Multi-Angle Shots", "Deep Story Consistency" | High | Consistency model |
| https://higgsfield.ai/cinematic-video-generator | "Cinema Studio 3.5 is Higgsfield's professional AI filmmaking environment. It combines video generation, camera controls, reusable elements (characters, locations, props), an AI co-director, real-time collaboration..." | High | Cinema Studio UX |
| https://higgsfield.ai/cinematic-video-generator | "Elements are reusable project assets — characters, locations, and props. Create them once, reference them across shots with @tags..." | High | @tags / Elements pattern |
| https://higgsfield.ai/cinematic-video-generator | "Control focal length, sensor size, and camera movement." + genre/style/color panels | High | Per-shot camera controls |
| https://higgsfield.ai/soul | 50+ aesthetic presets for "hyper-realistic, fashion-grade AI photo model" | High | Character consistency presets |
| https://higgsfield.ai/soul-intro (sitemap) | Soul Intro / Soul Cast pages exist | Medium | Identity training surface |
| https://higgsfield.ai/ai-long-video-generator (nav) | "AI Long Video Generator" entry point | Medium | Script-to-long-video |
| Public sitemaps (marketing, apps, motion) | /storyboard-generator, /cinematic-video-generator, /soul, /ai-long-video-generator all indexed | High | Feature surface confirmed |

All quotes are short excerpts from public HTML/JSON-LD. No private or account-gated content was accessed.

---

## 3. Higgsfield UX Map (Publicly Observable)

### Popcorn / Storyboard Generator
- **Input**: Text prompt per scene + optional reference image upload.
- **Output**: Up to 8 consistent images (storyboard grid).
- **Controls**: Aspect ratio, quality preset, scene count.
- **Workflows**:
  - Upload reference → describe scenes → generate consistent outputs.
  - Last image → new reference input (explicit chaining).
  - One-click Sora 2 export.
- **Objects**: Scene, Shot (implicit), Reference Image, Prompt.
- **Inferred backend**: Reference image stored as project asset; prompt + reference ID passed to model; consistency enforced at generation time (likely via IP-Adapter / ControlNet style conditioning).

### Cinema Studio 3.5
- **Workspace**: Project-level with cast, locations, props, camera, style, color grading.
- **Elements**: Characters, Locations, Props — created once, referenced via @tags in prompts.
- **Camera**: Focal length, sensor size (e.g., "Studio Digital S35"), movement (Zoom In, etc.), genre-based motion logic.
- **AI Co-Director (Mr. Higgs)**: Breaks scripts into shots, suggests camera/light/prompt.
- **Collaboration**: Real-time shared workspace.
- **Objects**: Project, Element (Character/Location/Prop), Shot, Camera Preset, Style Preset, Color Grade.
- **Inferred backend**: Element library with reference images + metadata; @tag resolver injects reference embeddings into prompt; shot record links Element IDs + camera params + generation job.

### Soul / Soul Cast
- 50+ named aesthetic presets (Bimbocore, Y2K, Gorpcore, etc.).
- Hyper-realistic character generation with consistent identity across shots.
- Likely the visible surface of "Soul ID" training / character bible feature.

### First/Last Frame & Continuity
- Explicitly supported in Popcorn: "take the final image and use it as the new reference input."
- Cinema Studio supports shot extension via consistent Elements + camera continuity.

### Model Comparison / Variants
- Cinema Studio surfaces "all image and video models" in one workspace — implies variant generation across models is possible.

---

## 4. Prior-Art Scan

| Tool/Repo | License | Stack | Maturity | Reuse Recommendation |
|-----------|---------|-------|----------|----------------------|
| ComfyUI + Custom Nodes (storyboard, IPAdapter, reference workflows) | GPL-3.0 / MIT | Python/JS | High (production) | Copy node patterns for reference injection; do not embed full ComfyUI |
| Stable Diffusion WebUI (Automatic1111) — img2img, reference-only, ControlNet | AGPL-3.0 | Python | High | Reference image handling patterns |
| InvokeAI | Apache-2.0 | Python/TS | Medium-High | Clean reference asset model |
| ComfyUI-Manager + rgthree nodes | MIT | JS | High | Shot board / workflow patterns |
| Obsidian + Excalidraw (storyboard plugins) | MIT | TS | Medium | Shot board UI inspiration only |
| Shotgrid / ftrack (professional production) | Proprietary | — | High | Data model reference only (Scene → Shot → Asset) |
| DaVinci Resolve / Premiere Pro storyboard panels | Proprietary | — | High | Timeline/shot list UX patterns |

**Recommendation**: Reuse ComfyUI-style reference conditioning patterns and clean asset pointer models. Avoid full node graph embedding in V1. Prefer metadata-only collections pointing to existing `.native-media` assets.

---

## 5. Recommended Open Generative AI Product Model

**Phase 1 (Storyboard + References)**
- Popcorn-style storyboard generator: prompt + optional reference image → up to N consistent scenes.
- Reusable References: Characters, Locations, Props (Elements) stored as metadata collections.
- Character Bible: lightweight reference asset collection + prompt template (no full identity training yet).
- First/last-frame chaining: "use last generated frame as next shot's first reference."
- Add to References action on any generated card.

**Phase 2 (Cinema Studio)**
- Per-shot camera controls (focal, sensor, movement) using existing prompt logic.
- Multi-model variant comparison grid.
- Script/outline → editable scene/shot draft helper (Mr. Higgs style).
- Shot detail panel with camera + style + reference chips.

**Explicitly skipped in V1/V2**: Full Soul ID training, realtime collab, community feed, video calls, full timeline editor, new model providers.

---

## 6. Recommended Backend/Data Model (Minimal, Reversible)

**Core Entities (metadata only)**
- `Project` { id, name, owner, created_at, metadata }
- `Scene` { id, project_id, order, prompt, aspect_ratio, quality }
- `Shot` { id, scene_id, order, prompt, reference_asset_ids[], camera_params, style_params, generation_job_id }
- `ReferenceCollection` { id, project_id, type: 'character'|'location'|'prop', name, description }
- `ReferenceAsset` { id, collection_id, asset_id (native-media), weight, role }
- `CharacterBible` { id, project_id, collection_ids[], default_prompt_template }
- `Variant` { id, shot_id, model_id, generation_job_id, compare_group_id }

**Linking to existing native media**
- All generated images/videos already have `.native-media/jobs.json` + asset records.
- ReferenceAsset and Shot records store only pointers (`asset_id`) + metadata.
- No duplicate file copies.
- Delete behavior: native-media delete cascades to reference/shot links (soft delete first).

**Storage for V1**
- JSON sidecars in `.native-media/storyboard/` (project.json, scene-N.json, shot-N.json) for easy migration/rollback.
- Or lightweight SQLite table if already present in native-media-gateway.
- Prefer JSON sidecars for reversibility.

**Migration/Rollback**
- All new tables/files are additive.
- Remove `.native-media/storyboard/` directory to rollback.
- No schema changes to existing jobs.json or assets.

---

## 7. Recommended Frontend UX

**Sidebar / Library**
- Projects → Scenes → Shots tree.
- References library (Characters / Locations / Props tabs) with @tag chips.
- Character Bible page: collection grid + default prompt template editor.

**Scene/Shot Board**
- Grid or horizontal strip of scene cards (like Popcorn 8-scene view).
- Shot card: thumbnail + prompt + reference chips + camera badge.
- Drag to reorder; "Add shot from last frame" button.

**Asset Actions (on existing generated cards)**
- "Add to References" → modal: choose/create Collection + type.
- "Use as next first frame" → creates new Shot pre-filled with reference.

**Shot Detail Panel**
- Prompt editor, reference chips (removable), camera controls (focal, sensor, movement presets), style chips, generate variants button.

**Variant Compare**
- Side-by-side or grid of variants across models (existing model catalog).
- "Promote to shot" action.

**Script-to-Board**
- Textarea or file upload → "Break into scenes/shots" → draft Scene/Shot records created.
- Editable before generation.

**Empty / Failure States**
- Empty storyboard: "Upload reference or start typing to generate your first scene."
- No references: "Create your first Character/Location/Prop to reuse across shots."
- Generation failed: retry + "use different model" suggestion.

---

## 8. Two-Phase PRD Outline

**Phase 1 — Storyboard + Reusable References (MVP)**
- Popcorn-style generator (prompt + optional ref image → N consistent scenes).
- ReferenceCollection + ReferenceAsset models (metadata pointers only).
- "Add to References" action on generated cards.
- Character Bible (lightweight collection + prompt template).
- First/last-frame chaining via reference reuse.
- Basic scene/shot board UI.
- JSON sidecar storage.

**Phase 2 — Cinema Studio Controls + Variants + Script**
- Per-shot camera/lens/focal/sensor prompt injection (existing logic).
- Multi-model variant generation + compare grid.
- Script/outline → draft scene/shot helper.
- Shot detail panel with full camera + style controls.
- @tag reference injection in prompts.
- Variant promotion to shot.

**Acceptance Criteria**
- Phase 1: User can create a 4-scene storyboard with one consistent character, reuse the last frame as first frame of shot 5, and export the board as a project.
- Phase 2: User can set focal length + movement per shot, generate variants across 3 models, and compare them side-by-side.

---

## 9. Spec Acceptance Criteria

- Storyboard generates ≤8 consistent images from prompt + optional reference.
- Last image can be selected as reference for a new shot without re-uploading.
- ReferenceCollections are project-scoped metadata records pointing to existing native-media assets.
- @tag resolution works in prompt input (frontend autocomplete + backend injection).
- Camera params (focal, sensor, movement) are stored per-shot and injected into generation prompt.
- No duplicate media files created; all references are pointers.
- Rollback: deleting `.native-media/storyboard/` removes all new data.
- Existing delete/download/history flows unaffected.

---

## 10. Test / Verification Checklist

- [ ] Create storyboard with reference image → verify character consistency across 4+ scenes.
- [ ] Chain 3 shots using last-frame-as-first-frame → verify visual continuity.
- [ ] Create Character + Location collections → verify @tag appears in prompt autocomplete.
- [ ] Generate shot with focal=85mm + dolly zoom → verify prompt contains camera language.
- [ ] Generate 3 model variants of same shot → verify compare grid renders.
- [ ] Delete native-media asset used as reference → verify reference link shows "missing" state (no crash).
- [ ] Remove storyboard directory → verify app still boots and native-media history intact.

---

## 11. Risks, Unknowns, Login / Browser Plan

**Risks**
- Account-gated deeper screens (Popcorn canvas, Cinema Studio workspace, Soul Cast manager) may reveal additional patterns not visible on landing pages.
- Consistency quality claims are marketing copy; real output may vary by model.
- @tag implementation details (embedding vs prompt text) unknown without login.

**Unknowns**
- Exact Soul ID / Soul Cast training flow (how many images, how long, cost).
- Real-time collab implementation (WebSocket? presence? conflict resolution?).
- Exact camera param vocabulary used by Higgsfield models.

**Login / Browser Plan (Low-Risk, Legal)**
- Create free Higgsfield account (daily credits advertised).
- Capture:
  - Popcorn canvas after first generation (reference chips, shot ordering, export button).
  - Cinema Studio workspace (Elements panel, @tag input, camera controls, Mr. Higgs chat).
  - Soul Cast creation flow (how many images required, preset application).
  - Shot detail view (first/last frame buttons, variant generation).
- Use only public browser + Firecrawl on allowed paths; respect robots.txt.
- If paywalled, stop and note "requires paid plan" — do not recommend bypass.

**Worth it?** Yes — the public pages already give 80% of the UX model. Login would confirm the remaining 20% (exact button placement, prompt injection format, training UI).

---

## 12. Explicit "Do Not Build Yet" List

- Full Soul ID / identity training pipeline (V2+).
- Realtime collaboration, presence, conflict resolution.
- Community feed, social features, project sharing.
- Video calls or live co-direct sessions.
- Full timeline / non-linear editor (keep linear scene/shot list).
- New model providers beyond existing catalog.
- Automatic prompt optimization beyond simple @tag injection.
- 3D scene reconstruction or hybrid 2.5D workflows.
- Mobile app parity or native mobile capture.

---

**End of Report.** All evidence is from public pages as of 2026-07-02. Ready for implementation planner.
