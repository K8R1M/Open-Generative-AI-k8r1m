# Slice 06 — Media Library Tab (generated + uploads)

Assignee: GLM 5.2. Depends on: slices 04, 05.
Branch: `slice/06-media-library`.

## Goal

A “Library” tab showing ALL server media — generated (from `/library`) and
uploaded (from `/uploads`, added in slice 01… NOTE: `/uploads` GET listing is
specified in `02-target-architecture.md` §5 but scheduled HERE — implement the
gateway listing route in this slice, it is 30 lines) — with actions to send any
item into the studios or (later slices) projects.

## Backend part (small, do first)

`GET /uploads` in `server.js`/`exports.js`: scan `uploads/*/meta.json`, newest
first by `createdAt`, `?limit=` cap 200 default 100, response
`{items:[{assetId, id, url, mime, createdAt, size}]}` (size via stat of the data
file). Path-safety identical to `readGeneratedAsset` (realpath containment).
Test: `tests/nativeUploadsList.test.js` (seed two uploads fixtures, order,
limit, path-safety with a hostile dirname).

## Frontend

New `packages/studio/src/components/MediaLibrary.jsx`, tab id `library`,
label “Library”, registered in `StandaloneShell.js` TABS + render switch, gated
by `NEXT_PUBLIC_STUDIO_PROJECTS` (see §3 of 02-doc; export from
`packages/studio/src/index.js` — mind the existing duplicate-export guard).

Layout (match existing studio dark idiom, Tailwind, no new deps):
- Header row: filter pills `All / Images / Videos / Uploads`, search box
  (client-side substring match on displayName/prompt), refresh button.
- Responsive grid of cards (reuse the visual language of the studios' history
  grids: aspect-square thumbs for images, video thumbs with duration badge if
  cheaply available — `<video preload="metadata">` is fine).
- Data: `listNativeLibrary({kind:'all', limit:100})` + `listNativeUploads()`
  (new client fn in `nativeMedia.js`, same idiom) merged, sorted by
  createdAt/completedAt desc. No pagination UI in V1 (limit 100 each is fine —
  note as accepted debt).
- Card hover actions (icon buttons, existing overlay style):
  - images: “Use in Image Studio” / “Use in Video Studio” → reuse the EXACT
    existing handoff: call the shell's `handleGeneratedImageReference` — expose
    it to this tab via the same prop mechanism
    (`onGeneratedImageReference` prop, already passed to ImageStudio; pass to
    MediaLibrary too). Uploads count as valid handoff sources — their urls are
    same-origin asset urls, which the consumption filter already accepts.
  - videos: “Download”, “Copy prompt” (generated only), “Extract last frame →
    Library” calling `frameFromJob(jobId)` then refreshing the grid (the new
    frame appears as an image whose card can then be sent to a studio —
    continuity primitive for free).
  - generated: “Rename” (same pattern as slice 02), “Delete”
    (`deleteNativeLibraryItem`, confirm() like existing).
  - uploads: no rename/delete in V1 (no backend) — omit those buttons.
- Empty state: “Nothing here yet — generate something or drop a file.” Drag &
  drop: the shell already captures drops per-tab; wire `droppedFiles` prop →
  `uploadNativeFile` for each file → refresh (mirror how studios consume
  `droppedFiles` + `onFilesHandled`).

## Tests

e2e `tests/e2e/media-library.spec.js`: fixture-seeded generated job + upload →
both appear; filter pills work; “Use in Video Studio” lands the image as a
visible ref in Video Studio (reuses slice 00 assertions); extract-last-frame on
a fixture video adds an image card.

## Do not

- No infinite scroll/virtualization; no lightbox beyond the existing
  fullscreen pattern if trivially reusable; no bulk selection in V1.
- Do not modify ImageStudio/VideoStudio internals (only the shell wiring for
  the new tab + prop).

## Acceptance criteria

- e2e green, build green, regression checklist green.
- Tab hidden when `NEXT_PUBLIC_STUDIO_PROJECTS` unset.
- Diff limited to: `MediaLibrary.jsx` (new), `StandaloneShell.js` (tab + props),
  `packages/studio/src/index.js` (export), `nativeMedia.js`
  (`listNativeUploads`), gateway uploads-list route + test, e2e spec.
