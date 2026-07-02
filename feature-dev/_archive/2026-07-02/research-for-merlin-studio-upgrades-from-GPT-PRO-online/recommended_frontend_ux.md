# Recommended Frontend UX

## Top-level layout

```text
Projects / Storyboard
  Left sidebar: Projects, References, Media, Templates
  Main: Scene / Shot Board
  Right panel: selected Shot / Reference details
```

## Scene / Shot Board

Shot cards should show:

- Thumbnail or placeholder.
- `S01-SH03` numbering.
- Title and beat.
- Prompt excerpt.
- Reference chips: Character, Location, Prop, Style, Frame.
- First/last-frame indicators.
- Model/status.
- Variant count.

## Generated asset card actions

Add to existing generated cards:

- Add to Project…
- Add to References…
- Set as Shot Thumbnail.
- Set as First Frame…
- Set as Last Frame…
- Use as Next Shot First Frame.
- Create New Shot from Asset.
- Compare as Variant.

Do not remove existing download/delete/copy/history actions.

## Add to Project / References modal

Fields:

- Project picker.
- Scene picker or create new scene.
- Shot picker or create new shot.
- Reference type: Character, Location, Prop, Style, Frame.
- Collection picker or create new.
- `@tag` field.
- Asset role.
- Notes.
- Rights/clearance note.
- Default: link original asset, no copy.

## Character page

- Hero image.
- Reference grid by role.
- Character Bible fields.
- Do-not-change list.
- Prompt snippet.
- Shot usage list.
- Add more references.

## Location page

- Establishing image.
- Lighting/spatial continuity notes.
- Key background objects.
- Prompt snippet.
- Shot usage list.

## Prop page

- Primary image and alternate angles.
- Scale/material/color notes.
- Prompt snippet.
- Shot usage list.

## Shot detail panel

Sections:

- Metadata.
- Prompt editor with `@tag` suggestions.
- References.
- First/last frame continuity.
- Camera panel in Phase 2.
- Model/settings.
- Variants/history.
- Notes.

## Variant compare grid

Show:

- Output preview.
- Model/provider.
- Prompt snapshot.
- Settings snapshot.
- Reference snapshot.
- Status/error.
- Rating/notes.
- Pin winner action.

## Empty states

- No projects: create project or paste script.
- No scenes: create first scene.
- No shots: add shot or generate draft from outline.
- No references: add from media library.
- No variants: generate first variant.

## Failure states

- Missing media asset.
- Unsupported model reference input.
- Failed generation.
- Failed last-frame extraction.
- Corrupt project file.
- Unknown schema version.
