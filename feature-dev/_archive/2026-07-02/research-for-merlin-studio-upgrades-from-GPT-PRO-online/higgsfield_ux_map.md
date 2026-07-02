# Higgsfield UX Map and OGA Translation

## Confirmed vs inferred convention

- **Confirmed:** Public Higgsfield page, FAQ, blog, GitHub, or official docs explicitly say it.
- **Inferred:** Reasonable product/backend interpretation from public UI/marketing, but not verified in logged-in product.
- **Needs login:** Exact modal fields, controls, limits, and failure states.

## PopCorn / storyboard

### Confirmed

- AI storyboard generator for sequences.
- Uses text and reference images.
- Generates up to eight images in one sequence.
- Final image can become new reference input to continue the story.
- Export to Sora 2 is advertised.

### Inferred objects

- StoryboardSequence
- StoryboardFrame / ShotImage
- ReferenceInput
- PromptSnapshot
- ContinuationChain

### OGA mapping

- Project → Scene → Shot.
- Shot has `firstFrameRef`, `lastFrameRef`, `variantIds`, `referenceIds`.
- “Use last frame as next first frame” is the central continuity action.

## Cinema Studio

### Confirmed

- Controls for genre, style, camera, character, location, props, mood, color/camera.
- Reusable Elements are Characters, Locations, Props.
- Elements can be referenced with `@tags`.
- Camera controls include movement, focal length, aperture, lens type, script structure.
- Model access is presented as multi-model workspace.

### Inferred objects

- ProjectElement
- ElementTag
- CameraSettings
- PromptCompiler
- ShotVariant

### OGA mapping

- Rename Elements to References.
- Character / Location / Prop pages.
- Phase 2 camera panel on Shot detail.

## Soul ID / Soul Cast

### Confirmed

- Soul ID trains consistent characters from user photo sets.
- Current pages emphasize 20+ photos.
- Soul Cast creates configurable AI actors and casting sheets.

### Inferred objects

- IdentityTrainingJob
- ReusableCharacterModel
- CastingSheet

### OGA mapping

- Do not build training in V1.
- Build CharacterBible metadata and curated reference collections.
- Make consistency claims conservative.

## AI Long Video

### Confirmed

- Script/brief to multi-shot video.
- Storyboard mode.
- Per-shot camera control.
- Multi-shot continuity.
- Reference/character lock.
- First/last-frame transitions and scene extension.
- Model switching and side-by-side comparison.

### OGA mapping

- Phase 2 script-to-board draft helper.
- Per-shot camera settings.
- Variant compare grid.
- Do not build full assembly/export unless already available.

## Canvas

### Confirmed

- Infinite/node-based workspace.
- Prompts, images, references, and model outputs become nodes.
- Prior generations/assets can be reused as nodes.
- Collaboration/templates are emphasized.

### OGA mapping

- Future Workflow Studio inspiration.
- Do not use as Phase 1 shape; a shot board is simpler.

## Collab

### Confirmed

- Shared projects, chat, calls, comments, generation sharing with context.

### OGA mapping

- Future metadata sharing/audit trail.
- Do not build realtime collaboration.

## MCP

### Confirmed

- Authenticated MCP access for agents to generation/history/character training workflows.

### OGA mapping

- Future automation surface after project/reference metadata stabilizes.
- Do not build in Phase 1/2.
