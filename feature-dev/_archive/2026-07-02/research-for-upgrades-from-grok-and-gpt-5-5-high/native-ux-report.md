# Native UX Report: Production Board Recommendation

Date: 2026-07-02
Research lane: GPT-5.5 native designer
Scope: Product/UX spec only; no code edits.

## Recommendation

Build a Production Board, not another prompt box.

Higgsfield's strongest pattern is structured continuity: storyboard first, reusable identities and locations, per-shot direction, and frame-to-frame control. Its public pages emphasize Popcorn storyboards with framing/motion/characters, consistent multi-scene output, model comparison, Cinema Studio camera/lens control, and first/last-frame references.

## Phase Shape

```text
+--------+-----------------------------+-----------------------------+
| Phase  | Build                       | Skip                        |
+--------+-----------------------------+-----------------------------+
| 1      | Shot board + asset library  | Full NLE timeline           |
| 1      | @tags + Character Bible     | Complex workflow graph      |
| 2      | Continuity + model compare  | Every-model benchmarking    |
| 2      | Script-to-board import      | Pro scheduling/callsheets   |
+--------+-----------------------------+-----------------------------+
```

## Phase 1: Shot Board

Screen layout:

- Left rail: Script / Assets / History.
- Center: responsive shot board.
- Right inspector: selected shot details.

Each shot card should show:

- Thumbnail.
- Shot number.
- Duration.
- Status.
- Model.
- Aspect ratio.
- Character/location chips.
- Small continuity-link icon when chained from a prior frame.

Core controls:

- Add shot.
- Duplicate shot.
- Reorder shot.
- Regenerate.
- Compare variants.
- Use selected image/video as shot reference.
- Extract last frame.
- Send last frame to next shot as first frame.

Empty state:

- "Start from a prompt, paste a script, or add your first shot."
- Starter cards: Character intro, Dialogue scene, Product reveal.

Failure state:

- Failed generation keeps the shot card in place.
- Prompt/settings are preserved.
- Missing thumbnail shows a neutral placeholder plus Retry / Change model / View logs.

## Phase 1: Reusable Assets And @Tags

Add a project asset drawer with tabs:

- Characters.
- Locations.
- Props.
- Styles.

Assets are structured references, not just uploaded files.

`@tag` insertion should work inside every prompt field:

- Typing `@` opens a grouped picker.
- Groups: Characters, Locations, Props, Recent.
- Insert chips such as `@Adil-Cop`, not raw text only.
- Unresolved tags render as error chips with Create asset / Replace / Remove.

Character Bible fields:

- Canonical name.
- Aliases.
- Tag.
- Face references.
- Full-body sheet.
- Wardrobe notes.
- Voice/dialogue notes.
- Do-not-change traits.
- Allowed styles.
- Usage rights note.

Location fields:

- Establishing image.
- Angle references.
- Lighting.
- Time of day.
- Recurring props.

Empty state:

- "No reusable cast yet. Create a character from selected image or upload references."

## Phase 2: Continuity And Variant Compare

Generated-asset actions should be available on every output:

- Use as shot thumbnail.
- Use as first frame.
- Use as last frame.
- Use last frame in next shot.
- Save as character.
- Save as location.
- Save as prop.
- Compare models.
- Upscale.
- Delete.

The "last frame -> next first frame" action is critical. Make it one click, with warnings for aspect ratio or model capability mismatch.

Model compare:

- Selected shot opens a 2x2 or 1x3 compare tray.
- Keep prompt, seed/reference, aspect, duration, and camera fixed by default.
- Vary only the model unless user changes the controls.
- Winner replaces the shot thumbnail.
- Losers remain in history.

Failure states:

- Model does not support end frame.
- Reference image too large.
- Output empty.
- Queue timeout.
- Provider failed.

Always preserve shot settings.

## Phase 2: Script-To-Board

Script import should create editable shot stubs, not final generations.

Layout:

- Script panel left.
- Generated board center.
- Inspector right.

Selecting a script line can create a shot.

Core controls:

- Paste script.
- Auto-detect scenes.
- Split into beats.
- Generate shot stubs.
- Assign characters/locations via `@tags`.
- Choose visual style.
- Generate selected shots only.

## Skip For Now

- Full screenplay formatting.
- Collaboration approvals.
- PDF export customization.
- Call sheets.
- Shooting schedule.
- Public asset marketplace.
- 3D scene navigation.
- Node editor.

The first useful product is the board plus reusable continuity assets.
