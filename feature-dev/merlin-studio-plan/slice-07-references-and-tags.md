# Slice 07 — References Library + @tag Prompt Composer

Assignee: GPT 5.5 (promptComposer + model helpers), GLM 5.2 (UI).
Depends on: slice 05. Branch: `slice/07-references`.

## Goal

Reusable references (characters/locations/props/styles) with @tags, stored in
project documents (schema already live from slice 05), plus the pure prompt
composer that later slices use at generation time.

## Part 1 — promptComposer (GPT 5.5, pure JS, TDD)

`packages/studio/src/promptComposer.js` exactly per
`02-target-architecture.md` §8:

```js
export function composePrompt({ prompt, project, shot = null, modelCapabilities }) {
  // returns { resolvedPrompt, inputs, warnings }
}
export function findTags(text)              // → ['@adil-cop', …] regex /@[a-z0-9-]{2,32}/g with word boundaries
export function tagIndex(project)           // → Map<tag, reference>
```

Rules (implement exactly):
1. Tag replacement: each known tag occurrence → the reference's
   `promptSnippet` if non-empty, else the reference `name`. Unknown tag → left
   literal + warning `unknown-tag:@foo`.
2. Inputs assembly order: `shot.firstFrame` (role `first-frame`) → for each
   reference attached to the shot (`shot.referenceIds` order; when no shot,
   references whose tags appear in the prompt, in first-appearance order):
   assets with role `identity` first, then remaining roles in stored order,
   each as `{assetId, role:'reference'}`.
3. Capability enforcement: if `!modelCapabilities.imageInit` → no first-frame
   input + warning `first-frame-unsupported`. Reference inputs truncated to
   `modelCapabilities.referenceImages` with warning `refs-truncated:<kept>/<total>`;
   zero allowed → no ref inputs + warning `refs-unsupported` (text snippets
   still resolve — text always works).
4. Missing assets (AssetRef annotated `missing:true`) are skipped + warning
   `missing-asset:<assetId>`.
5. Pure function: no fetch, no globals, deterministic.

Unit tests `tests/promptComposer.test.js`: each rule, plus combined scenario
(2 characters + 1 location, model with referenceImages=3 → truncation order
provable), idempotence (composing a resolvedPrompt again changes nothing when
snippets contain no tags — document that snippets containing @tags are NOT
recursively resolved; one pass only).

## Part 2 — References UI (GLM 5.2)

Lives inside the Projects tab (slice 08 builds the board; this slice builds the
References panel first with a minimal Projects-tab shell):

- `ProjectsStudio.jsx` v0: tab id `projects`, label “Projects” in shell (gated
  like `library`); left rail with project list (create/rename/delete via
  `projectsClient`), main area: for this slice only the **References** section
  of the selected project.
- `ReferenceLibrary.jsx`: grid grouped by type (Characters / Locations / Props /
  Styles / Frames); “New reference” → type picker + name → auto-suggest tag
  (`@` + kebab-cased name, editable, validated `/^@[a-z0-9-]{2,32}$/`, dup check
  against `tagIndex`).
- `ReferenceEditor.jsx` (right panel when a reference is selected):
  name, tag, promptSnippet (textarea), assets strip (thumbnails via AssetRef →
  url; missing → grey tile with “missing” label), role dropdown per asset
  (enum from schema), notes; for characters: bible fields (appearance,
  wardrobe, personality, doNotChange list editor, aliases).
- Adding assets to a reference: “Add from Library” opens an inline picker
  listing the same merged data as slice 06 (extract that fetch+merge into a
  shared hook `useServerMedia()` in
  `packages/studio/src/components/useServerMedia.js` and refactor
  MediaLibrary.jsx to use it — the ONLY cross-slice refactor allowed here).
  Selecting an item appends `{id:'refasset-…', role:'other', assetRef:{…}}` via
  `projectsModel` helpers.
- All mutations through `useProject`'s `update()` + debounced `save()`
  (`useProject.js` — build it in this slice per 02-doc §8 if slice 08 hasn't;
  coordinate via execution-log).
- 409 on save → reload doc + toast “Project changed elsewhere — reloaded.”

## Card action (both studios + media library)

“Add to Reference…” on image cards: minimal chooser (project → reference or
“new character/location/prop from this image”), appends the asset with role
`identity` (characters) / `wide` (locations) / `other` (else). Reuse the
existing overlay-button idiom. This is 3 call sites importing one new component
`AddToReferenceMenu.jsx`.

## Tests

- Unit: composer suite (above), tag validation, useServerMedia merge order.
- e2e `tests/e2e/references.spec.js`: create project → create character with
  tag → add fixture image as identity asset → reload → everything persisted;
  duplicate tag rejected inline; missing-asset tile shown after deleting the
  underlying library item.

## Do not

- No generation wiring yet (slice 09 consumes the composer).
- No @tag autocomplete in studio prompt boxes yet (slice 09, where generation
  context exists).
- No cross-project reference sharing (per-project only in V1).

## Acceptance criteria

- Composer: 100% of listed rules unit-tested.
- e2e green; build green; regression checklist green.
- Projects tab hidden without the flag.
