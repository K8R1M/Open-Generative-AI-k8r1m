# Spec Acceptance Criteria

## Phase 1 must pass

### Metadata and storage

- Project files are created only under `.native-media/projects/`.
- Existing media files are not copied when added to a project/reference.
- Asset references use existing job/asset/upload identifiers and relative paths.
- Existing `.native-media/jobs.json` behavior is unchanged.
- Disabling the feature hides project UI and leaves existing studios usable.

### Storyboard

- Create, rename, reorder, duplicate, and delete scenes/shots.
- Shot cards show thumbnail, title, prompt excerpt, reference chips, status, and variant count.
- Shot detail panel edits prompt/references/frames/model/duration/aspect.
- Project reload after app restart restores all metadata.

### References

- Create Character, Location, Prop, Style, and Frame references.
- Add generated/uploaded media to reference collection without copying file.
- Unique `@tag` validation inside a project.
- Prompt editor suggests `@tags`.
- CharacterBible saves appearance, wardrobe, personality, do-not-change, and prompt snippet.

### Generation

- Generate shot from prompt and supported references.
- Unsupported reference capabilities show warning and fall back safely.
- Variant links to native job and output asset.
- Failed generation appears as failed Variant with retry.

### Continuity

- Set image output as last frame.
- Extract or select last frame from video if supported.
- Attach last frame to next shot as first frame.
- Compatible model receives first-frame input.
- Incompatible model receives text continuity fallback and visible warning.

## Phase 2 must pass

- Camera settings save per shot.
- Camera settings affect prompt/settings payload.
- Variant compare grid shows multiple outputs side-by-side.
- Pinning a variant marks it as selected.
- Script-to-board creates editable metadata only and does not auto-generate media.
