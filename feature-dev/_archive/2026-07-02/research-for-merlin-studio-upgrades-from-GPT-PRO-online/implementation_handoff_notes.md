# Implementation Handoff Notes

This is not implementation code. It is a planner-oriented map of where the feature likely touches the current repo.

## Existing surfaces supplied by user

- `packages/studio/src/components/ImageStudio.jsx`
- `packages/studio/src/components/VideoStudio.jsx`
- `packages/studio/src/components/CinemaStudio.jsx`
- `packages/studio/src/components/WorkflowStudio.jsx`
- `packages/studio/src/nativeMedia.js`
- `packages/studio/src/nativeModels.js`
- `native-media-gateway/server.js`
- `native-media-gateway/exports.js`
- `.native-media/jobs.json`
- `.native-media/assets`
- `.native-media/uploads`
- `feature-dev/next-feature-inbox.md`

## Additive implementation shape

### New UI areas

- Projects / Storyboard route or panel.
- Reference Library route or panel.
- Shot detail side panel.
- Add to Project / References modal.
- Variant compare modal/panel.

### Minimal new persistence helpers

- List projects.
- Read project.
- Write project.
- Backup project.
- Validate project schema.
- Resolve asset refs.
- Mark missing asset refs.

### Generated asset card additions

Add menu items only. Existing actions must remain unchanged.

### Native model capability metadata

Add or derive capabilities:

- image references supported?
- multiple references supported?
- max refs?
- first frame supported?
- last/start-end frame supported?
- camera fields supported as structured settings or prompt-only?

### Frame extraction

If gateway already has ffmpeg or equivalent:

- Add extract-last-frame helper.
- Store extracted frame as native asset or derivative asset.

If not:

- Keep action disabled or allow user to select/upload a frame manually.

## Recommended implementation order

1. Project sidecar read/write and schema validation.
2. Project list/detail UI with scenes/shots only.
3. AssetRef resolver against existing native media.
4. Add-to-Project action from generated cards.
5. Reference Collections and CharacterBible.
6. Prompt editor `@tag` suggestions.
7. Link references into compatible generation calls.
8. Variant records linked to jobs.
9. First/last-frame continuity action.
10. Phase 2 camera controls.
11. Phase 2 compare grid.
12. Phase 2 script-to-board helper.

## Hard regression guardrails

- Do not modify existing generated media file paths.
- Do not require a migration of old jobs.
- Do not alter delete/download behavior.
- Do not assume all providers support references.
- Do not copy media unless user explicitly exports/duplicates.
