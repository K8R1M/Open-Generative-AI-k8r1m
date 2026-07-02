# Slice 08 — Storyboard Board (Projects / Scenes / Shots)

Assignee: GLM 5.2. Depends on: slices 05, 07. Branch: `slice/08-storyboard`.

## Goal

The Production Board: scenes as columns/sections of shot cards, with a shot
detail panel. Metadata only — generation buttons appear in slice 09 (render
them disabled with tooltip “coming next” is NOT wanted; simply omit them).

## Layout (inside ProjectsStudio.jsx, replacing the v0 shell from slice 07)

```
┌ left rail ────────┬ main: Shot Board ───────────────┬ right panel ─────────┐
│ project list       │ Scene 1 ─ title, summary        │ ShotDetailPanel      │
│ (from slice 07)    │  [ShotCard][ShotCard][+ shot]   │ (selected shot)      │
│ section switch:    │ Scene 2 …                       │ or ReferenceEditor   │
│  Board | References│  [+ scene]                      │ (slice 07, kept)     │
└────────────────────┴─────────────────────────────────┴──────────────────────┘
```

- `ShotBoard.jsx`: vertical list of scenes; each scene = header (inline-editable
  title, summary, kebab menu: rename/duplicate/delete/move up/down) + horizontal
  row of `ShotCard`s + add-shot tile.
- `ShotCard.jsx` shows: thumbnail (pinned variant's asset → else first
  completed variant → else firstFrame → else placeholder), shot code
  (`S<sceneIdx+1>-SH<shotIdx+1>`, computed, not stored), title, status pill
  (draft grey / generating pulse / generated green / failed red), reference tag
  chips (first 3 + “+n”), continuity icons: ▸ left icon when `firstFrame` set,
  ▸ right icon when `lastFrame` set. Click → select (opens detail panel).
  Kebab: duplicate (new id, copies prompt/refs/frames, status draft, no
  variants), delete (confirm), move left/right within scene.
- Reordering: buttons/kebab actions only (move up/down/left/right) — **no
  drag-and-drop library in V1**; all reorders via `projectsModel` helpers
  (`reorderShots`, `reorderScenes`).
- `ShotDetailPanel.jsx` sections (all editing through `useProject.update`):
  1. Title, scene selector (move shot between scenes), status (read-only).
  2. Prompt textarea with @tag support: highlight known tags (simple regex
     styling), typing `@` shows a dropdown of project tags filtered by prefix
     (plain controlled component — no editor libraries; insert on click/Enter).
     Unknown tags render amber. NegativePrompt textarea (collapsed by default).
  3. Model & settings: model select (native models only, from
     `NATIVE_MODELS`), duration/aspect selects populated from
     `getModelCapabilities(modelId)`; null = “project default”.
  4. References: chips of attached referenceIds with remove ✕; “Attach…”
     dropdown listing project references (grouped by type).
  5. Frames: firstFrame / lastFrame slots — thumbnail or empty slot; “Set from
     Library” opens the `useServerMedia()` picker (slice 07); clear button.
     Missing-asset refs render the missing tile.
  6. Variants: list (empty until slice 09) — render count + placeholder text
     “No generations yet”.
- Board header: project title (inline edit), aspectRatio select, styleNotes
  (collapsible textarea), shot count.

## Data flow rules

- ALL document math via `projectsModel.js` pure helpers (extend it with:
  `duplicateShot(doc, shotId)`, `moveShot(doc, shotId, targetSceneId, index)`,
  `attachReference(doc, shotId, refId)`, `setShotFrame(doc, shotId,
  'firstFrame'|'lastFrame', assetRefOrNull)` — GPT 5.5 reviews these helper
  additions). UI components never hand-edit the doc shape.
- Saves debounced via `useProject`; a small “Saved / Saving…” indicator top-right.
- Selection state (selected shot/reference) is component state, never persisted.

## Tests

- Unit: new projectsModel helpers (duplicate preserves prompt/refs but not
  variants; move between scenes fixes both shotOrders; setShotFrame validates
  AssetRef shape).
- e2e `tests/e2e/storyboard.spec.js`: create project → 2 scenes → 3 shots →
  reorder shot (assert visual order) → edit prompt with @tag autocomplete
  (assert dropdown + insertion) → set firstFrame from library picker → attach
  reference → reload page → everything persisted; delete scene with shots →
  confirm dialog → gone; shot codes renumber.

## Do not

- No drag-and-drop deps, no virtualization, no keyboard-shortcut system.
- No generation, no variant rendering beyond the placeholder.
- No timeline/animatic view.

## Acceptance criteria

- e2e green ×2 runs; build green; regression checklist green.
- A 2-scene/6-shot project with references and frames survives restart
  (matches the research success metric).
- Diff limited to `packages/studio/src/components/projects/*`,
  `projectsModel.js`, tests.
