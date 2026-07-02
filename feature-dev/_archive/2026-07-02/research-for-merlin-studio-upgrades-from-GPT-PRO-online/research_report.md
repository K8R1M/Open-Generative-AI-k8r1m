# Higgsfield-Style Storyboard, References, and AI Video Workflow Research Report

**Prepared for:** Open-Generative-AI implementation planning
**Date:** 2026-07-01
**Scope:** Product, UX, technical, data-model, and prior-art research for a small, reversible implementation plan.
**Non-goal:** This package does not include implementation code. It is a PRD/spec research handoff.

---

## 1. Executive summary

Open-Generative-AI can capture most of the practical value of Higgsfield-style production without building a new platform or identity-training system. The safest V1 is a **metadata-first Scene/Shot Board** layered on top of the existing native media library, with **References** for reusable Characters, Locations, and Props that point to existing `.native-media` jobs/assets/uploads instead of copying files.

The public Higgsfield pages consistently emphasize three production primitives:

1. **Storyboard sequencing:** PopCorn generates visually consistent scene/image sequences, commonly described as up to eight images per sequence, with continuation by using the final image as a new reference input.
2. **Reusable production elements:** Cinema Studio exposes Characters, Locations, and Props as reusable Elements that can be referenced with `@tags` and reused across prompts, projects, and teams.
3. **Continuity controls:** Long Video and model pages emphasize script-to-storyboard, multi-shot continuity, per-shot camera control, first/last-frame transitions, and side-by-side model comparisons.

For Open-Generative-AI, implement this in two contained phases:

### Phase 1 recommendation

Build a **Storyboard / Scene-Shot Board** and **Reference Library**:

- Project → Scene → Shot hierarchy.
- ReferenceCollection / ReferenceAsset for Character, Location, Prop, Style, and Frame references.
- CharacterBible as a metadata page around curated assets, notes, appearance rules, and prompt snippets.
- Generated-card actions: **Add to Project**, **Add to References**, **Set as Shot Thumbnail**, **Set as First Frame**, **Set as Last Frame**, **Use Last Frame as Next Shot First Frame**.
- Prompt composition that inserts `@Character`, `@Location`, and `@Prop` tags into shot prompts and resolves them to native asset references at generation time.
- JSON sidecars under `.native-media/projects/` so V1 is reversible and does not mutate existing jobs, files, or delete/download/history behavior.

### Phase 2 recommendation

Add higher-order production controls, still using existing model providers:

- Per-shot camera settings using existing Cinema Studio camera/lens/focal/aperture prompt logic.
- Variant comparison grid across the existing Open-Generative-AI model catalog.
- Script/outline-to-board assistant that creates editable Scene/Shot draft metadata before generation.

### Do not build yet

Do **not** build Soul ID-style identity training, real-time collaboration, community feed, video calls, full non-linear timeline editor, MCP server/client features, new provider integrations, or a full database migration in V1. These are visible in Higgsfield’s platform story, but not required to capture the core value in Open-Generative-AI.

---

## 2. Evidence table

A full CSV version is included as `evidence_table.csv`. Key evidence is summarized here.

| Source | Claim / observed fact | Confidence | Relevance |
|---|---:|---|---|
| Higgsfield Storyboard Generator | PopCorn is positioned as a next-gen storyboard generator; public page shows an eight-scene output example, 16:9 aspect, high quality, and FAQ says it can generate up to 8 images in a sequence. | High | Supports Phase 1 storyboard/shot board scope. |
| Higgsfield Storyboard Generator | FAQ says the final image can be used as a new reference input to continue the story. | High | Direct support for first/last-frame chaining. |
| Higgsfield Cinema Studio | Public UI examples show Genre, Style, Camera, Character, Prompt, Camera Style, and Location controls. | High | Supports per-shot control UX and data model. |
| Higgsfield Cinema Studio | FAQ describes reusable Elements as Characters, Locations, and Props that can be called with `@tags`. | High | Direct support for References feature. |
| Higgsfield Long Video Generator | Page describes script/brief input, storyboard mode, multi-shot continuity, per-shot camera control, reference system, first/last-frame transitions, and model switching. | High | Supports Phase 2 script-to-board, shot variants, and compare grid. |
| Higgsfield Soul 2.0 / Soul ID pages | Soul ID uses photo sets to train a consistent character/digital double; current pages/blogs repeatedly mention 20+ photos and paid credits. | High | Confirms why OGA should skip full identity training and use Character Bible metadata first. |
| Higgsfield Soul Cast | Soul Cast generates configurable AI actors with casting sheet/backstory and consistent identity across scenes. | Medium-High | Inspires Character Bible fields; do not copy full training/casting system. |
| Higgsfield Canvas | Canvas is a node-based/infinite workspace where prompts/images/references become nodes and workflows can be chained. | High | Useful UX inspiration, but too large for Phase 1. |
| Higgsfield Collab | Collab emphasizes shared projects, chat, calls, sharing generations with prompt/model/preview context. | High | Useful for future audit/share metadata, not Phase 1. |
| Higgsfield MCP | MCP page says agents can generate images/videos, train characters, browse previous generations, and use history as inputs after account auth. | High | Future automation inspiration; not required for V1. |
| Reddit PopCorn + Soul thread | User reports friction connecting Soul Characters inside PopCorn. | Low-Medium | Unofficial signal: avoid over-promising seamless cross-feature integration without testing. |
| AI Tool Curator PopCorn article | Third-party claims manual/auto modes, multiple image references, and bridge-frame chaining. | Low-Medium | Useful questions for login validation; not treated as confirmed. |
| Open-Generative-AI GitHub | Public repo is an open-source AI image/video/cinema/lip-sync studio; package is MIT and workspace-based. | High | Confirms stack/repo context and fit for metadata-first integration. |

---

## 3. Higgsfield UX map: screens, controls, objects, workflows, inferred backend concepts

### 3.1 PopCorn / Storyboard Generator

**Confirmed from public pages**

- Product is branded as a storyboard generator for AI video production.
- Public examples show text prompting, 16:9 aspect ratio, high quality, and an eight-scene output.
- FAQ says PopCorn generates visually consistent scenes from text and reference images.
- FAQ says users can upload a person/object/product reference.
- FAQ says it can generate up to eight images in one sequence.
- FAQ says the final image can be used as a new reference input to continue the story.
- FAQ says finalized storyboards can be exported to Sora 2.

**Inferred UI**

- Prompt box for story idea or shot concept.
- Reference upload/selection area.
- A storyboard output grid or strip with scene cards.
- Controls for aspect ratio and quality.
- Per-image actions: reuse as reference, continue sequence, export, possibly edit/regenerate.
- Because public page shows generated outputs rather than a full logged-in app, exact modals, menus, and edit controls are account-gated or uncertain.

**Inferred backend concepts**

- Storyboard/sequence entity.
- Scene image records with order index.
- Prompt snapshot and settings snapshot.
- Reference inputs linked to source assets.
- Continuation chain where `scene_n.output_asset` becomes `scene_n+1.reference_input`.

**OGA translation**

- Build Project → Scene → Shot board.
- Each Shot can have `firstFrameRef`, `lastFrameRef`, `referenceIds`, prompt, model settings, and variant links.
- Use native generated images/videos as linked assets; do not copy media.

### 3.2 Cinema Studio

**Confirmed from public pages**

- Cinema Studio is described as an AI production studio for cinematic video.
- Public UI text includes controls for Genre, Style, Camera, Character, Prompt, Camera Style, and Location.
- Longer page sections mention camera moves, locations, characters, moods, cast characters, locations and props, collaboration, color and camera controls.
- FAQ says Cinema Studio combines video generation, camera controls, reusable elements, an AI co-director, collaboration, and model access.
- FAQ says reusable Elements are Characters, Locations, and Props and can be referenced with `@tags`.
- FAQ says UI includes panels for genre, style, camera movement, focal length, aperture, lens type, and script structure.

**Inferred UI**

- Prompt area with `@tag` autocomplete or tokenization.
- Left or side panels for project assets/elements.
- Camera control panel with lens, focal length, aperture, motion, style, and genre presets.
- Character/Location/Prop selectors.
- Model selector.
- Assistant prompt helper such as “break a script into shots.”

**Inferred backend concepts**

- Project element library.
- Element objects with type, name, tag, assets, notes, and permissions.
- Shot generation settings with camera/lens/prompt metadata.
- Prompt compiler that expands selected elements and camera settings into model-specific prompts.

**OGA translation**

- Phase 1: implement References and `@tag` prompt insertion.
- Phase 2: expose per-shot camera settings by reusing current Cinema Studio prompt logic.

### 3.3 Elements / `@tags` for Characters, Locations, Props

**Confirmed from public pages**

- Higgsfield calls reusable assets “Elements.”
- Elements can be Characters, Locations, or Props.
- They can be called in prompts via `@tags`.
- They can be shared with a team.
- Pages claim they help keep production assets consistent across shots.

**Inferred UI**

- Asset bin / library of element cards.
- Create Element modal for name, type, tag, description, and image/video references.
- Prompt editor where typing `@` opens suggestions.
- Element detail page with reference assets and usage history.

**OGA translation**

Rename “Elements” to **References** to avoid product cloning and to fit the requested scope:

- ReferenceCollection: Character / Location / Prop / Style / Frame / Mixed.
- ReferenceAsset: points to existing native upload/job/asset.
- Tag alias: `@maya`, `@rooftop_bar`, `@red_suitcase`.
- Prompt compiler resolves tags to both text snippets and model input references where supported.

### 3.4 Soul ID / Soul Cast / character consistency

**Confirmed from public pages**

- Soul ID trains a consistent digital character/persona from user photos.
- Current Soul pages/blogs repeatedly mention 20+ photos, with a higher max such as 80 in blog posts.
- Blog posts mention training time and credit cost, but these should be treated as current-marketing/pricing details that may change.
- Soul Cast is positioned as a way to create castable AI actors by choosing attributes such as genre, era, archetype, physique, outfit, imperfections, and backstory.

**Contradiction / staleness note**

- A 2025 Soul ID blog mentions 10+ photos.
- 2026/current Soul pages mention 20+ photos.
- Use current pages as more reliable for present UX; mark old blog as historical.

**Inferred UI**

- Soul ID: upload photo set → training job → reusable identity object → apply across styles/models.
- Soul Cast: configure actor → generate casting sheet/backstory → use actor across scenes.

**OGA translation**

Do **not** build identity training in Phase 1. Instead:

- CharacterBible with curated references, appearance rules, wardrobe notes, “do not change” list, and preferred prompt fragments.
- ReferenceAsset roles: primary face, side view, full body, wardrobe, expression, pose, style, rejected/bad example.
- Model-specific warning if the selected model does not support multiple reference inputs.

### 3.5 AI Long Video Generator

**Confirmed from public pages**

- Input can be script or brief.
- Workflow describes storyboard mode and per-shot camera/lens/motion selection.
- Page mentions multi-shot continuity, character lock/reference system, scene extension, first/last-frame transitions, and model selection.
- Page mentions side-by-side model comparison and multi-model workspace.
- Page describes adding reference images and rendering/exporting a final video.

**Inferred UI**

- Script input / outline input.
- Generated scene/shot outline.
- Per-shot cards with prompt, reference, camera, model, and duration controls.
- Compare grid for variants from different models.
- Export/assemble controls.

**OGA translation**

- Phase 2 script-to-board helper outputs editable JSON metadata, not immediate generation.
- Variant grid stores prompt/settings snapshots and links to native jobs.
- Final assembly/export is optional and should remain outside Phase 2 unless existing Video Studio already handles it.

### 3.6 Canvas, MCP/CLI, and Collab where they affect production workflow

**Canvas confirmed observations**

- Node-based/infinite workflow where prompts, images, references, and model outputs can be connected.
- Versioned node workflows and reusable templates.
- Cross-model graph for image/video generation.

**OGA implication**

- Good future inspiration for Workflow Studio, but Phase 1 should stay a shot board, not an infinite graph.
- Reuse the pattern that “every output can become an input,” especially for first/last-frame workflows.

**MCP confirmed observations**

- Higgsfield’s MCP page says agent clients can generate media, train characters, browse history, and use past generations as inputs after account authentication.

**OGA implication**

- Future: expose project/reference metadata as an MCP resource only after V1 stabilizes.
- Phase 1: no MCP server/client work.

**Collab confirmed observations**

- Collab emphasizes shared projects, chat, calls, feedback, sharing generations with context, team/org plans, shared credits/elements.

**OGA implication**

- Useful model for future “share generation with prompt/model/preview context.”
- Phase 1: local projects only; no realtime collaboration.

### 3.7 First-frame, last-frame, scene extension, multi-shot continuity

**Confirmed Higgsfield pattern**

- PopCorn: use final image as new reference input.
- Long Video: first/last-frame transitions and scene extension are explicitly marketed.
- Model descriptions mention accurate start/end frame generation for specific providers.

**OGA translation**

- Store `firstFrameRef` and `lastFrameRef` on Shot.
- Add action: “Use last frame as next shot’s first frame.”
- For images, output image can directly become frame reference.
- For videos, add an explicit “Extract last frame” action that creates or links a native extracted-frame asset.
- If extraction is not currently available in native-media-gateway, stub the UX as disabled with a clear message or make extraction a small gateway utility later.

### 3.8 Shot variants and model comparison

**Confirmed Higgsfield pattern**

- Long Video page describes switching models per scene and comparing outputs side-by-side.
- Cinema Studio page describes access to many image/video models through one workspace.

**OGA translation**

- Variant = one generation attempt for one Shot.
- A compare grid can show model, provider, prompt snapshot, reference inputs, duration/aspect/settings, output preview, job status, rating, notes, and “pin as selected.”
- Do not require new providers; use existing `nativeModels.js` catalog.

---

## 4. Prior-art scan: repos/tools, license, stack, maturity, what to reuse

A full CSV version is included as `prior_art_scan.csv`.

| Tool / repo | License / status | Stack / fit | Maturity | Reuse recommendation |
|---|---|---|---|---|
| Wonder Unit Storyboarder | Publicly described as free/open-source; MIT-with-exceptions claim appears in older post; desktop maintenance appears low. | Electron/JS style desktop storyboard app. | Mature UX, low active maintenance. | Copy UX ideas: board grid, shot numbering, animatic thinking. Avoid direct code unless license/fork reviewed. |
| OpenTimelineIO | Open-source editorial interchange; timeline data model references external media, not a media container. | Python/C++ library; conceptual fit. | Mature industry standard. | Reuse ideas: clips reference external media; timeline is metadata. Do not implement full OTIO in V1. |
| Kitsu / Zou | AGPL-3.0. | Production tracking backend. | Mature. | Copy data concepts: projects, sequences/shots/assets/tasks/statuses. Avoid code due AGPL unless acceptable. |
| ComfyUI | Node graph AI workflow system; license review needed for direct embedding. | Python backend + web UI ecosystem. | Very mature community. | Copy ideas: reusable workflow templates, node provenance. Do not turn storyboard V1 into node graph. |
| Comfy Workflow Templates | MIT. | Template repository. | Active ecosystem. | Reuse pattern: versioned templates organized by media/task. |
| InvokeAI | Open-source creative engine; repo/license should be verified before reuse. | React UI + generation backend. | Mature. | Copy UI ideas: boards/canvas, asset reuse, prompt galleries. Avoid direct code without license review. |
| SwarmUI | MIT; beta; supports multiple image/video backends and Comfy workflow tab. | Web UI around model backends. | Active but beta. | Copy compare-grid/grid-generator idea for model/parameter comparison. |
| Toonflow | Apache-2.0; TypeScript/Node/Electron/Docker; public repo is popular. | Closest stack fit among AI storyboard tools. | Active/ambitious; verify production quality. | Study architecture and UX for script→story→storyboard→video. Reuse ideas first; evaluate code only after audit. |
| WaooWaoo | Public repo with unclear license label in observed listing; beta; Next.js/MySQL/Prisma/Redis. | Web app but DB-heavy. | Popular but very early. | Copy script-breakdown/character-scene extraction ideas only; avoid code until license clear. |
| ViMax | MIT; multi-agent script-to-video research/product repo. | Python/agents/pipelines/prompts. | Active research; more backend-agent than UI. | Reuse pipeline concepts: script understanding, storyboard, shot list, first/last-frame generation, consistency validation. |
| React Flow / xyflow | MIT. | React node/graph UI; likely compatible with Studio. | Very mature. | Candidate for future Workflow Studio/Canvas, not needed for Phase 1 shot board. |
| tldraw | Production license is commercial; GitHub license is not plain MIT. | React infinite canvas. | Mature. | Copy UX ideas or license properly. Avoid embedding in OSS V1 without license plan. |
| Langfuse prompt management | Open-source/open-core; prompt management docs show versioned collaborative prompts. | Backend/service pattern. | Mature. | Copy prompt-template versioning ideas only. |
| AUTOMATIC1111 PNG Info | Popular Stable Diffusion UI; stores prompt/settings in generated image metadata. | Python web UI. | Mature. | Copy idea: prompt/settings provenance attached to assets/jobs. |
| ShotList | GPL-2.0. | Metadata extraction/export utility. | Mature niche. | Copy idea: media metadata listing; avoid code due GPL. |
| OSideMedia Higgsfield prompt skill | MIT; unofficial prompt taxonomy. | Prompt templates/skills. | Recently updated; unofficial. | Use as inspiration for camera/action/style prompt fields, not as a source of Higgsfield product truth. |

### Prior-art lessons for Open-Generative-AI

- **Metadata beats media duplication.** OTIO’s most relevant lesson is that an edit/plan can reference external media rather than owning/copying it.
- **Shot board first, timeline later.** Storyboarder, Kitsu, Toonflow, and ViMax all validate scene/shot abstractions before full timeline editing.
- **References need roles, not just tags.** A character reference set should distinguish primary identity, wardrobe, pose, expression, full-body, and bad examples.
- **Variant comparison should be cheap metadata.** SwarmUI-style grids show the value of comparing model/parameter variants without creating a complex editor.
- **Prompt templates need versioning.** Langfuse and generation UIs show prompt text should be treated as versioned, inspectable metadata.

---

## 5. Recommended Open-Generative-AI product model

### 5.1 Product concept

Add a lightweight **Projects / Storyboard** layer across existing studios:

- **Project:** A creative container for related Scenes, Shots, References, and Variants.
- **Scene:** A narrative beat or location/time grouping.
- **Shot:** A single intended image/video generation unit.
- **Reference:** A curated collection of existing assets representing a character, location, prop, style, or frame continuity input.
- **Variant:** A generation attempt for a shot, linked to existing native jobs/assets.

This does not replace Image Studio, Video Studio, Cinema Studio, or Workflow Studio. It organizes what they already generate.

### 5.2 Core user stories

1. As a creator, I can create a project, add scenes, and break each scene into shots.
2. As a creator, I can add generated/uploaded media to a reusable Character, Location, or Prop reference without duplicating files.
3. As a creator, I can tag a shot prompt with `@character`, `@location`, and `@prop` references.
4. As a creator, I can use the last output frame from one shot as the first frame/reference for the next shot.
5. As a creator, I can generate multiple variants of a shot and compare them side-by-side.
6. As a creator, I can paste a script/outline and get an editable scene/shot draft before spending generation credits.

### 5.3 Product principles

- **Keep V1 reversible.** New project metadata lives separately under `.native-media/projects/`.
- **No duplicate media by default.** Project records link to existing assets/uploads/jobs.
- **Do not break current history.** Existing generated-card delete/download/copy/history hydration must keep working.
- **Prefer additive UX.** Add actions and panels around generated cards; do not rewrite the current studios.
- **Support reference-capable models gracefully.** Gemini Omni multi-reference support can be surfaced first; other models get text-only prompt references or disabled reference inputs with clear warnings.
- **Prompt provenance matters.** Every variant should snapshot prompt, model, settings, references, and camera fields.

---

## 6. Recommended backend/data model

### 6.1 Storage recommendation for V1

Use **JSON sidecars** under `.native-media/projects/`:

```text
.native-media/
  jobs.json
  assets/
  uploads/
  projects/
    index.json
    {projectId}.project.json
```

Why JSON sidecars first:

- Compatible with the repo’s existing file-based native media model.
- Reversible: deleting `.native-media/projects/` removes the feature without affecting media history.
- Easy to inspect and debug.
- Avoids premature SQLite migration and locking/concurrency complexity.
- Avoids mutating existing `jobs.json` schema in V1.

When to move to SQLite:

- Many projects, many variants, or slow hydration.
- Concurrent edits from multiple windows/users.
- Need robust querying, indexing, or collaboration.
- Need migrations across large project datasets.

### 6.2 Native media linking approach

References and variants should store links such as:

```json
{
  "assetRef": {
    "kind": "nativeAsset",
    "jobId": "job_abc123",
    "assetId": "asset_001",
    "relativePath": ".native-media/assets/job_abc123/output.mp4",
    "mediaType": "video",
    "mimeType": "video/mp4",
    "width": 1920,
    "height": 1080,
    "durationSec": 6.0,
    "sourceStudio": "VideoStudio"
  }
}
```

Rules:

- Never copy an asset into the project folder by default.
- Project metadata can cache dimensions/duration/thumbnails for fast UI, but source of truth remains native media.
- If the underlying asset is deleted, project UI should show a missing-asset state and keep the metadata record for recovery/debugging.
- Existing delete/download/copy-prompt/history behavior should be unchanged.

### 6.3 Proposed entities

#### Project

```json
{
  "id": "proj_...",
  "schemaVersion": 1,
  "title": "Campaign Short Film",
  "description": "30-second product film",
  "aspectRatio": "16:9",
  "styleBible": "Orange-teal dusk realism; handheld energy.",
  "sceneOrder": ["scene_001"],
  "referenceCollectionIds": ["ref_maya", "ref_rooftop"],
  "promptTemplateIds": ["tmpl_cinematic_shot"],
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

#### Scene

```json
{
  "id": "scene_001",
  "projectId": "proj_...",
  "title": "Rooftop reveal",
  "summary": "Hero sees the city at sunrise.",
  "beat": "Discovery",
  "order": 1,
  "shotIds": ["shot_001", "shot_002"],
  "characterIds": ["char_maya"],
  "locationIds": ["loc_rooftop"]
}
```

#### Shot

```json
{
  "id": "shot_001",
  "sceneId": "scene_001",
  "index": 1,
  "title": "Maya enters frame",
  "beat": "She steps onto rooftop.",
  "prompt": "@maya walks into @rooftop at sunrise, cinematic realism.",
  "negativePrompt": "extra fingers, distorted face, logo artifacts",
  "durationSec": 5,
  "aspectRatio": "16:9",
  "modelPreference": "gemini-omni-video",
  "camera": {
    "move": "slow dolly in",
    "lens": "35mm",
    "focalLengthMm": 35,
    "aperture": "f/2.8",
    "framing": "medium wide",
    "style": "handheld cinematic"
  },
  "referenceIds": ["ref_maya", "ref_rooftop"],
  "firstFrameRef": null,
  "lastFrameRef": null,
  "variantIds": ["var_001"],
  "status": "draft"
}
```

#### ReferenceCollection

```json
{
  "id": "ref_maya",
  "projectId": "proj_...",
  "type": "character",
  "name": "Maya",
  "tag": "@maya",
  "assetIds": ["refasset_001", "refasset_002"],
  "notes": "Hero character; keep bob haircut and red jacket.",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

#### ReferenceAsset

```json
{
  "id": "refasset_001",
  "collectionId": "ref_maya",
  "role": "primary_identity",
  "assetRef": {
    "kind": "nativeUpload",
    "uploadId": "upload_123",
    "relativePath": ".native-media/uploads/maya_front.png",
    "mediaType": "image"
  },
  "qualityNotes": "Best face reference, front-facing, clean lighting.",
  "rights": "User-owned / cleared for project",
  "source": "upload"
}
```

#### CharacterBible

```json
{
  "id": "char_maya",
  "collectionId": "ref_maya",
  "name": "Maya",
  "tag": "@maya",
  "description": "Curious 28-year-old documentary filmmaker.",
  "appearance": "Short black bob haircut, brown eyes, red cropped jacket, black boots.",
  "wardrobe": "Red jacket is mandatory in current sequence.",
  "personality": "Focused, observant, quietly intense.",
  "doNotChange": ["hair length", "red jacket", "eye color"],
  "promptSnippet": "Maya, same woman as references, short black bob, red jacket, expressive eyes",
  "referenceAssetIds": ["refasset_001", "refasset_002"]
}
```

#### Location

```json
{
  "id": "loc_rooftop",
  "collectionId": "ref_rooftop",
  "name": "Rooftop",
  "tag": "@rooftop",
  "description": "Concrete rooftop overlooking dense city skyline at sunrise.",
  "continuityNotes": "Keep steel railing, water tower, and orange sunrise direction consistent.",
  "promptSnippet": "same rooftop location, concrete floor, steel railing, city skyline, sunrise"
}
```

#### Prop

```json
{
  "id": "prop_suitcase",
  "collectionId": "ref_suitcase",
  "name": "Red Suitcase",
  "tag": "@red_suitcase",
  "description": "Small vintage red suitcase with brass latch.",
  "promptSnippet": "small vintage red suitcase with brass latch"
}
```

#### PromptTemplate

```json
{
  "id": "tmpl_cinematic_shot",
  "name": "Cinematic video shot",
  "scope": "shot",
  "version": 1,
  "template": "{{subject}} in {{location}}. {{action}}. Camera: {{camera.move}}, {{camera.lens}}, {{camera.framing}}. Style: {{styleBible}}.",
  "variables": ["subject", "location", "action", "camera", "styleBible"]
}
```

#### Variant

```json
{
  "id": "var_001",
  "shotId": "shot_001",
  "modelId": "veo-or-existing-model-id",
  "provider": "existing-provider",
  "promptSnapshot": "Maya walks into the rooftop at sunrise...",
  "settingsSnapshot": {
    "durationSec": 5,
    "aspectRatio": "16:9",
    "seed": null,
    "camera": {
      "move": "slow dolly in",
      "lens": "35mm"
    }
  },
  "referenceSnapshots": ["ref_maya", "ref_rooftop"],
  "jobLinkId": "joblink_001",
  "assetRefs": [],
  "status": "queued",
  "rating": null,
  "notes": ""
}
```

#### GenerationJobLink

```json
{
  "id": "joblink_001",
  "jobId": "native_job_abc",
  "assetId": "asset_001",
  "provider": "existing-provider",
  "modelId": "existing-model-id",
  "sourceStudio": "VideoStudio",
  "nativeJobPath": ".native-media/jobs.json",
  "createdAt": "2026-07-01T00:00:00.000Z"
}
```

### 6.4 Migration and rollback concerns

- Add a feature flag such as `enableProjectsStoryboard`.
- On first use, create `.native-media/projects/index.json` and project files only.
- Never transform existing assets/jobs/uploads in the initial migration.
- Write project files atomically: write temp file → fsync if available → rename.
- Keep a small rolling backup: `{projectId}.project.json.bak` before schema upgrades.
- Unknown schema versions open read-only with export option.
- Missing asset refs show a recoverable UI state rather than throwing.
- If the feature is disabled, existing studios should operate normally; project actions disappear but no media breaks.

---

## 7. Recommended frontend UX

### 7.1 Navigation and layout

Add a top-level or Studio-sidebar entry: **Projects** / **Storyboard**.

Recommended layout:

```text
Left sidebar
  Projects
  References
    Characters
    Locations
    Props
    Styles
  Media
  Prompt Templates

Main canvas
  Scene / Shot board

Right panel
  Selected shot / reference / project details
```

### 7.2 Scene / Shot board

Shot card fields:

- Thumbnail or empty placeholder.
- Shot number: `S01-SH03`.
- Title and beat.
- Prompt excerpt.
- Character / Location / Prop chips.
- First-frame and last-frame indicators.
- Model preference.
- Variant count and status.
- Last generated output preview.

Board modes:

- Scene columns: each scene is a column with ordered shot cards.
- Linear strip: compact sequence view for continuity.
- Reference filter: show all shots using `@maya` or `@rooftop`.

Actions:

- Add Scene.
- Add Shot.
- Duplicate Shot.
- Generate Shot.
- Generate Variants.
- Open Compare.
- Use Last Frame as Next First Frame.

### 7.3 Generated asset card actions

Add actions to existing generated image/video cards:

- Add to Project…
- Add to References…
- Set as Shot Thumbnail.
- Set as First Frame for Shot…
- Set as Last Frame for Shot…
- Use as Next Shot First Frame.
- Create New Shot from Asset.
- Compare as Variant.

Important: these actions must not replace existing prompt copy, delete, download, history hydration, or generated-asset actions.

### 7.4 Add to References / Project modal

Tabs:

1. **Project / Scene / Shot**
   - Project picker.
   - Scene picker or create new scene.
   - Shot picker or create new shot.
   - Role: thumbnail, first frame, last frame, variant output, reference input.

2. **Reference**
   - Type: Character, Location, Prop, Style, Frame.
   - Existing collection picker or create new.
   - Tag field with validation: starts with `@`, unique in project.
   - Asset role: primary identity, angle, wardrobe, expression, location wide, prop closeup, style, first frame, last frame.
   - Notes and rights/clearance field.

Default behavior: link original asset, no copy.

### 7.5 Character / Location / Prop pages

Character page:

- Hero reference image.
- Reference asset grid grouped by role.
- Character Bible fields: description, appearance, wardrobe, personality, prompt snippet, do-not-change list.
- Shot usage list.
- “Use in prompt” button inserts `@tag`.
- Warnings if only one low-quality reference exists.

Location page:

- Wide shot / establishing image.
- Continuity notes: lighting direction, geography, key background objects.
- Shot usage list and prompt snippet.

Prop page:

- Main prop reference and alternate angles.
- Scale/material/color notes.
- Shot usage list.

### 7.6 Shot detail panel

Sections:

- Shot metadata: title, beat, scene, order, duration, aspect ratio.
- Prompt editor with `@tag` autocomplete.
- References: selected character/location/prop/frame inputs.
- First/last-frame continuity block.
- Camera controls: Phase 2 only; initially collapsed/disabled unless Cinema Studio logic is wired.
- Model/settings selector.
- Variants/history list.
- Notes and acceptance checklist.

### 7.7 Generate variants and compare

Variant compare grid:

- Rows/cards: each variant output.
- Columns/metadata: model, provider, prompt snapshot, settings, references, duration, aspect, cost estimate if available, status, rating, notes.
- Actions: pin winner, regenerate from variant, use output as last frame, open native job, copy prompt, download.

Guardrails:

- Warn when selected model does not support multiple references.
- Warn when a shot has no primary character/location reference but uses tags.
- Keep failed variants visible with error reason and retry.

### 7.8 Use last frame as next first frame

Workflow:

1. User generates Shot A.
2. On output, user chooses **Set/Extract Last Frame**.
3. System creates a frame asset ref.
4. User chooses **Use as Next Shot First Frame**.
5. If Shot B exists, attach to Shot B `firstFrameRef`; otherwise create Shot B.
6. Prompt composer adds a continuity note: “Start from previous shot final frame; maintain character, wardrobe, location, lighting.”

Failure states:

- Video extraction unsupported: show disabled action with explanation.
- Extraction failed: show retry and keep original video link.
- Next shot model does not support image input: keep first frame as metadata and add text-only continuity note.

### 7.9 Script-to-board flow

Phase 2 flow:

1. Paste script, outline, or bullet beats.
2. Choose target aspect ratio, target shot count or scene count, tone/style, and available references.
3. AI proposes Scene/Shot draft:
   - Scene titles.
   - Shot titles.
   - Beat/action.
   - Suggested references.
   - Suggested camera move/framing.
   - Draft prompt.
4. User edits draft before generation.
5. User generates one shot or batch-generates selected shots.

Do not auto-generate video from the script in V1/Phase 2 without explicit user confirmation.

### 7.10 Empty states and failure states

Empty project:

- “Create your first scene.”
- “Paste a script to draft a board.”
- “Add references from Media Library.”

Empty references:

- “Create a Character from an upload or generated image.”
- “Add a Location or Prop reference from any asset card.”

Shot with missing reference:

- Show missing asset chip.
- Offer remove/refind/replace.
- Do not crash board hydration.

Model unsupported:

- “This model does not accept multiple image references; tags will be included as text only.”

Project JSON corrupt:

- Show recovery panel with backup restore/export raw JSON.

Asset deleted:

- Keep shot/variant record and mark asset unavailable.

---

## 8. Two-phase PRD outline

### Phase 1: Storyboard + References + continuity frames

**Goal**

Let users create a storyboard with reusable, consistent references without building identity training or a new media pipeline.

**In scope**

- Projects sidebar / project list.
- Project → Scene → Shot CRUD.
- Shot board with thumbnails, prompts, references, and statuses.
- ReferenceCollection / ReferenceAsset CRUD for Character, Location, Prop, Style, Frame.
- CharacterBible page/fields.
- Add-to-Project and Add-to-References modal from existing asset cards.
- `@tag` prompt insertion and reference selection.
- Link selected references to generation calls for models that support reference inputs.
- Use generated/extracted last frame as next shot’s first frame.
- Metadata-only JSON sidecars under `.native-media/projects/`.
- Preserve existing history/delete/download behavior.

**Out of scope**

- Soul ID/identity training.
- Soul Cast actor generation.
- Realtime collaboration.
- Canvas/infinite graph.
- Full timeline editor.
- New model providers.
- Automated long-video assembly.
- Public sharing/community.

**Success metrics**

- User can create a project, add 2 scenes, 6 shots, and 3 reference collections.
- User can attach existing generated/uploaded assets without file duplication.
- User can generate a shot with references through an existing supported model.
- User can link Shot A last frame to Shot B first frame.
- Existing native media history and delete/download actions continue to pass regression tests.

### Phase 2: Camera controls + variants + script-to-board

**Goal**

Turn the storyboard into a practical AI video planning and iteration workspace using existing Cinema Studio and model catalog capabilities.

**In scope**

- Per-shot camera panel using existing Cinema Studio prompt/control logic:
  - camera movement
  - lens/focal length
  - aperture/depth of field
  - framing
  - style/genre/tone
- Shot variant generation across existing `nativeModels.js` catalog.
- Variant compare grid.
- Pin/select winning variant.
- Script/outline-to-scene-shot draft assistant.
- Optional batch-generate selected shots if existing generation APIs are stable.

**Out of scope**

- Full timeline/NLE.
- Auto-edited long video export unless existing pipeline supports it cleanly.
- Paid team/org/collaboration features.
- MCP/CLI control surface.
- Training/fine-tuning models.
- Provider integrations not already present.

**Success metrics**

- User can generate at least 3 variants for a shot and compare them.
- User can use two existing video/image models for variants where supported.
- User can paste a script and get an editable scene/shot draft.
- User can adjust camera fields and see prompt output change predictably.

---

## 9. Spec acceptance criteria

### Data integrity

- Creating a project creates only files under `.native-media/projects/`.
- Adding a media asset to a project/reference stores a pointer to the existing asset/upload/job; it does not duplicate the binary media file.
- Deleting a project does not delete underlying native media assets unless a separate explicit asset delete action is used.
- Deleting a native media asset marks linked project references as missing rather than crashing.
- Existing `.native-media/jobs.json` hydration still works for old jobs.
- Existing generated-card delete/download/prompt-copy actions still work unchanged.

### Storyboard UX

- User can create, rename, reorder, and delete scenes.
- User can create, rename, reorder, duplicate, and delete shots.
- Shot cards show title, prompt excerpt, thumbnail, status, references, and variant count.
- Shot detail panel can edit prompt, references, first/last frames, duration/aspect/model preference.
- Empty states guide users toward creating scenes, shots, or references.

### References UX

- User can create Character, Location, Prop, Style, and Frame reference collections.
- User can create a reference from a generated/uploaded asset card.
- `@tag` uniqueness is enforced within a project.
- Prompt editor suggests existing `@tags`.
- Character Bible fields are saved and visible.
- Reference collections list usage by shot.

### Generation integration

- Shot generation passes prompt text and supported reference inputs to existing generation APIs.
- Unsupported references degrade to text prompt snippets with a visible warning.
- Each generation creates a Variant record linked to a native job.
- Variant stores prompt snapshot, settings snapshot, model id, provider id, reference snapshot, and job link.
- Failed jobs remain visible with error reason and retry action.

### First/last frame continuity

- User can set an image output as a shot’s last frame.
- User can extract or select a last frame from a video output where supported.
- User can attach a shot’s last frame as the next shot’s first frame.
- If the next model does not support first-frame input, UI preserves metadata and adds text continuity prompt.
- The chain is visible on shot cards and in shot detail.

### Phase 2 acceptance

- Per-shot camera settings are saved independently from global Cinema Studio settings.
- Camera settings are reflected in the generated prompt or settings payload.
- User can request multiple variants for a shot.
- Compare grid shows outputs side-by-side with model/settings/prompt metadata.
- User can pin a winning variant.
- Script-to-board creates editable scenes/shots without automatically generating media.

---

## 10. Test / verification checklist

### Regression tests around native media

- Existing image generation job appears in history after feature enabled.
- Existing video generation job appears in history after feature enabled.
- Existing Grok video job appears and downloads correctly.
- Existing Gemini Omni job appears and downloads correctly.
- Existing Veo job appears and downloads correctly.
- Existing Nano Banana / GPT Image assets appear and download correctly.
- Existing delete action removes the intended native media asset/job and does not delete unrelated project metadata.
- Existing prompt-copy action still copies original prompt.

### Project metadata tests

- New project file is created under `.native-media/projects/`.
- Project index updates after create/rename/delete.
- Project file survives app restart and hydrates correctly.
- Unknown schema version opens read-only.
- Corrupt project file offers backup/restore/export and does not crash Studio.
- Missing asset references show missing state.

### Reference tests

- Add generated image to Character reference.
- Add upload to Location reference.
- Add video output as Shot variant.
- Create `@tag`; duplicate tag is rejected.
- Remove reference asset from collection; underlying media remains.
- Delete underlying media; reference shows missing.
- Prompt editor suggests tags and inserts them.

### Generation tests

- Generate shot with text-only prompt.
- Generate shot with one reference image.
- Generate shot with multiple reference images using Gemini Omni if available.
- Generate shot using a model without multi-reference support; warning appears and generation still works as text-only if model supports text.
- Failed generation creates failed Variant record with retry.
- Successful generation links variant to native job and output asset.

### First/last-frame tests

- Set image as last frame and attach to next shot as first frame.
- Extract last frame from video if extraction is implemented.
- Failed extraction leaves original video intact.
- Next shot displays first-frame preview.
- Generation payload includes first-frame input for compatible model.
- Incompatible model shows warning and uses continuity prompt text.

### Variant compare tests

- Generate two variants from same shot with different models/settings.
- Compare grid shows both outputs and metadata.
- Pin one variant as selected.
- Delete one variant’s underlying media; compare grid marks missing but stays usable.
- Regenerate from a variant snapshots prompt/settings correctly.

### Script-to-board tests

- Paste short outline; draft scenes/shots appear.
- Paste longer script; user can set target shot count.
- Draft does not trigger generation until explicit confirmation.
- References can be assigned during draft review.
- User can edit all generated shots before saving.

---

## 11. Risks, unknowns, and login/browser/Firecrawl follow-up plan

### Key risks

1. **Marketing page vs actual product gap.** Public Higgsfield pages describe workflows but not every real modal, failure state, or account limitation.
2. **Reference support differs by model.** Existing OGA models may have very different image/video reference capabilities.
3. **Asset deletion semantics.** Project metadata must not assume media files live forever.
4. **Prompt-tag ambiguity.** `@tag` references must map to both text snippets and optional media inputs; users need to know what each model actually receives.
5. **Sidecar sprawl.** JSON sidecars are ideal for V1 but may become slow if users create many projects/variants.
6. **Character consistency overpromise.** Without Soul ID-style training, reference collections improve consistency but cannot guarantee identity lock.
7. **Video last-frame extraction.** If native-media-gateway lacks reliable frame extraction, the feature needs either a small utility or a disabled state.

### Unknowns needing account validation

- Exact PopCorn logged-in UI: manual/auto modes, shot editing, reference count, continuation controls.
- Whether PopCorn can directly use Soul Characters or Elements today; Reddit suggests possible user friction.
- Exact Element creation fields and `@tag` autocomplete behavior.
- Exact Cinema Studio camera panel controls and how they serialize into prompts/settings.
- Whether Long Video currently exposes true side-by-side model comparison or only model switching.
- Exact reference limits by model in real UI.
- Current pricing/credit limits for Soul ID and Long Video.
- Export behavior to Sora 2 and whether it is direct integration or prompt/storyboard export.

### Is account login worth it?

Yes, but only for UX validation, not for Phase 1 architecture. Public pages are enough to design the metadata-first OGA architecture. Login is worth it if the implementation team wants to copy proven interaction details such as modal labels, board layout, reference-picker behavior, camera control grouping, and actual failure states.

### Legal / low-risk collection plan

- Use a normal Higgsfield account controlled by the team.
- Respect Higgsfield terms, robots, rate limits, and paywalls.
- Do not bypass authentication, payment, usage limits, or technical protections.
- Capture only the team’s own projects, prompts, generated media, and UI screens.
- Avoid scraping community/private user content.
- Use browser screenshots and notes for UX research, not data extraction at scale.
- If Firecrawl is used, limit it to public pages already accessible without auth and obey rate limits.

### Specific screens to capture after login

1. **PopCorn new storyboard screen**
   - Questions: What inputs exist? Are there manual/auto modes? How many refs? Are scene counts fixed or editable?

2. **PopCorn generated storyboard result**
   - Questions: Can users edit individual scenes? Can they reorder? Is last-frame continuation a one-click action?

3. **PopCorn + saved character/reference flow**
   - Questions: Can Soul ID/Soul Cast/Elements be used directly? Does `@tag` autocomplete work?

4. **Cinema Studio create screen**
   - Questions: Exact layout for genre/style/camera/location/character/props; how model selector appears.

5. **Cinema Studio Elements library**
   - Questions: Create/edit fields, tags, reference counts, team sharing, scope/project ownership.

6. **Soul ID creation flow**
   - Questions: Photo upload requirements, validation messages, training lifecycle, resulting reusable object.
   - Value: informs CharacterBible UX while still skipping training.

7. **Soul Cast creation flow**
   - Questions: Actor fields, casting sheet/backstory structure, edit/regenerate controls.
   - Value: informs future CharacterBible templates.

8. **AI Long Video screen**
   - Questions: Script input, storyboard draft structure, per-shot controls, compare grid, export/assemble behavior.

9. **Canvas**
   - Questions: How prior assets become nodes, how references connect to prompts/models, template UX.
   - Value: future Workflow Studio only.

10. **Collab sharing a generation**
    - Questions: What metadata travels with shared generation? Prompt/model/preview/status?
    - Value: future project sharing/audit trail.

11. **MCP tool list/history browsing**
    - Questions: Does the agent see projects, elements, history, or only raw generations?
    - Value: future automation; not Phase 1.

---

## 12. Explicit “do not build yet” list

Do not build in Phase 1 or Phase 2 unless a later planner explicitly expands scope:

- Full Soul ID identity-training infrastructure.
- Face/person identity model training or fine-tuning.
- Soul Cast-style synthetic actor generator.
- Realtime collaboration, comments, chat, video calls, org workspaces, shared credits.
- Community feed or public project sharing.
- MCP server/client integration.
- CLI or agent-control surface.
- New model/provider integrations that are not already in Open-Generative-AI.
- Full non-linear timeline editor.
- Auto-edited long-video assembly/export pipeline.
- Audio/lip-sync/dubbing coupling to storyboard unless existing features already support it cleanly.
- Database migration to SQLite/Postgres in V1.
- Copying media into project folders by default.
- Modifying or deleting `.native-media/jobs.json`, `.native-media/assets`, or `.native-media/uploads` records during project creation.
- Enforcing character consistency guarantees that reference-only workflows cannot deliver.
- Complex permissioning/team models.
- Browser scraping or auth bypass against Higgsfield.

---

## Appendix A: Implementation handoff notes for the existing repo surfaces

The user-provided likely file surfaces are compatible with a small additive implementation. A planner should verify exact repo state before coding.

### Candidate integration points

- `packages/studio/src/components/ImageStudio.jsx`
  - Add generated-card actions: Add to Project, Add to References, Set as Shot frame.

- `packages/studio/src/components/VideoStudio.jsx`
  - Add generated-card actions and variant linking.
  - Add first/last-frame action affordances for generated videos.

- `packages/studio/src/components/CinemaStudio.jsx`
  - Phase 2: extract/reuse camera/lens/focal/aperture prompt logic for Shot camera settings.

- `packages/studio/src/components/WorkflowStudio.jsx`
  - Future only: Canvas/node workflow integration after storyboard model stabilizes.

- `packages/studio/src/nativeMedia.js`
  - Add project-sidecar read/write helpers if this module already owns native media metadata.
  - Do not alter existing history hydration path in V1.

- `packages/studio/src/nativeModels.js`
  - Phase 2: expose reference support metadata and model comparison choices.

- `native-media-gateway/server.js`
  - Add project metadata endpoints if the app cannot read/write directly.
  - Optional frame extraction endpoint only if existing dependencies support it safely.

- `native-media-gateway/exports.js`
  - Keep existing export behavior intact.

- `.native-media/jobs.json`, `.native-media/assets`, `.native-media/uploads`
  - Treat as existing source of truth for generated/uploaded media.
  - Do not restructure.

- `feature-dev/next-feature-inbox.md`
  - Add PRD tasks and acceptance checklist from this package.

### Suggested feature flags

- `enableStoryboardProjects`
- `enableReferenceCollections`
- `enableShotVariantCompare`
- `enableScriptToBoardDraft`

### Suggested model capability flags

Add or derive flags per native model:

```json
{
  "supportsImageReferences": true,
  "supportsMultipleReferences": true,
  "maxReferenceImages": 4,
  "supportsFirstFrame": true,
  "supportsLastFrame": false,
  "supportsStartEndFrame": false,
  "supportsCameraFields": "prompt-only"
}
```

These flags can drive warnings and graceful fallback. They should be verified against current provider behavior.

---

## Appendix B: Unsupported guesses explicitly marked

The following are **inferences**, not confirmed public facts:

- Exact PopCorn logged-in storyboard board layout.
- Exact PopCorn editing/reordering controls.
- Exact number of reference images accepted in logged-in PopCorn; official FAQ says upload references, while third-party sources mention additional details that require validation.
- Exact `@tag` autocomplete UI in Cinema Studio.
- Exact backend entities Higgsfield uses for Elements, Soul characters, storyboards, and variants.
- Exact side-by-side compare UX in Long Video.
- Exact model reference limits and credit costs as of implementation time.
- Whether export to Sora 2 is direct render, prompt export, or project handoff.
- Whether Soul Characters can be used seamlessly inside PopCorn; one Reddit thread suggests user confusion/friction.

---

## Appendix C: Source URLs

- higgsfield_popcorn: https://higgsfield.ai/storyboard-generator
- higgsfield_cinema: https://higgsfield.ai/cinematic-video-generator
- higgsfield_long_video: https://higgsfield.ai/ai-long-video-generator
- higgsfield_soul_intro: https://higgsfield.ai/soul-intro
- higgsfield_character: https://higgsfield.ai/character
- higgsfield_soul_cast: https://higgsfield.ai/soul-cast-intro
- higgsfield_soulid_creator_blog: https://higgsfield.ai/blog/how-to-turn-photo-into-consistent-ai-persona-creator
- higgsfield_soulid_best_blog: https://higgsfield.ai/blog/sould-id-best-character-consistency
- higgsfield_canvas: https://higgsfield.ai/canvas-intro
- higgsfield_collab: https://higgsfield.ai/chat-intro
- higgsfield_mcp: https://higgsfield.ai/mcp
- reddit_popcorn_soul: https://www.reddit.com/r/Higgsfield_AI/comments/1m21637/how_to_use_soul_characters_in_popcorn/
- reddit_motiondesign_review: https://www.reddit.com/r/MotionDesign/comments/1m022ts/higgsfield_ai_review/
- ai_tool_curator_popcorn: https://aitoolcurator.com/ai-tool/higgsfield-popcorn/
- open_generative_ai_repo: https://github.com/Anil-matcha/open-generative-ai
- open_generative_ai_package: https://github.com/Anil-matcha/open-generative-ai/blob/master/package.json
- open_generative_ai_releases: https://github.com/Anil-matcha/open-generative-ai/releases
- storyboarder_repo: https://github.com/wonderunit/storyboarder
- storyboarder_mit_post: https://wonderunit.com/storyboarder-open-source/
- comfyui_repo: https://github.com/comfyanonymous/ComfyUI
- comfy_workflow_templates: https://github.com/Comfy-Org/workflow_templates
- opentimelineio_docs: https://opentimelineio.readthedocs.io/en/latest/
- kitsu_zou_repo: https://github.com/cgwire/zou
- kitsu_site: https://www.cg-wire.com/
- invokeai_repo: https://github.com/invoke-ai/InvokeAI
- swarmui_repo: https://github.com/mcmonkeyprojects/SwarmUI
- toonflow_repo: https://github.com/HBAI-Ltd/Toonflow-app
- waoowaoo_repo: https://github.com/waooAI/waoowaoo
- vimax_repo: https://github.com/HKUDS/ViMax
- reactflow_repo: https://github.com/xyflow/xyflow
- reactflow_site: https://reactflow.dev/
- tldraw_repo: https://github.com/tldraw/tldraw
- tldraw_license: https://tldraw.dev/docs/license
- langfuse_prompt_mgmt: https://langfuse.com/docs/prompt-management/overview
- automatic1111_pnginfo: https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features
- shotlist_repo: https://github.com/zhourj/ShotList
- higgsfield_prompt_skill: https://github.com/OSideMedia/higgsfield-ai-prompt-skill
