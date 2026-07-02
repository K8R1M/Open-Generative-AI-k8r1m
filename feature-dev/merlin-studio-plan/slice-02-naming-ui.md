# Slice 02 — Naming / Rename UI on Generated Cards

Assignee: GLM 5.2. Depends on: slice 01 (PATCH endpoint).
Branch: `slice/02-naming-ui`.

## Goal

Karim expected visible naming controls; current behaviour is automatic metadata
only. Add: (1) an optional name field in the generation bar, (2) a rename action
on every native generated card, in both Image Studio and Video Studio.

## Design (final)

1. **Name-before-generate:** a small optional text input in the bottom prompt
   bar of ImageStudio and VideoStudio, placeholder “Name (optional)”, max 120
   chars, value passed as `displayName` in the existing
   `generateNativeMedia({...})` call (the request builder already supports
   `displayName` — verify by grep in `nativeMedia.js`, wire it through the two
   `generateNativeMedia` call sites). Input clears after successful submit.
   Keep it visually subordinate to the prompt (single-line, ~10rem, existing
   input styling idiom from the file).
2. **Rename on card:** add a “Rename” action (pencil icon, `lucide-react`
   `Pencil`, size 14, same button style as existing overlay actions) to the
   hover overlay of native cards in BOTH studios' history grids — next to the
   existing download/copy/delete buttons. Click → inline prompt: use
   `window.prompt('Rename generation', current)` — **yes, window.prompt; do not
   build a modal** (single-user tool; smallest correct thing). On non-empty
   result:
   - `await renameNativeLibraryItem(jobId, name)` — NEW client function in
     `packages/studio/src/nativeMedia.js`:
     ```js
     export async function renameNativeLibraryItem(jobId, displayName) {
       const res = await fetch(`${NATIVE_LIBRARY_ENDPOINT}/${encodeURIComponent(jobId)}`,
         { method:'PATCH', headers: buildNativeHeaders(),
           body: JSON.stringify({ displayName }) });
       if (!res.ok) throw new Error(`Rename failed (${res.status})`);
       return res.json();
     }
     ```
   - update the card's entry in local history state (`displayName` field) so the
     name shows without refetch; persistence effects already save history.
3. **Display:** card shows `entry.displayName` (fallback: nothing — current
   look) as a single truncated line above/below the existing metadata, matching
   each studio's card typography. Download filename behaviour is already handled
   server-side — do not touch download code beyond what exists.
4. Rename only exists for native entries (`entry.native === true`) with a
   `jobId`; non-native (muapi) cards unchanged.

## Steps

1. Client function + wire `displayName` into both studios' generate calls.
2. Name input in VideoStudio bottom bar; then ImageStudio.
3. Rename overlay button + handler in VideoStudio history card; then ImageStudio.
4. Show `displayName` on cards (both studios).
5. Tests:
   - e2e `tests/e2e/naming.spec.js`: seed fixture library job → card shows no
     name → rename via dialog (`page.on('dialog')`) → name visible → reload →
     name still visible (server round-trip proven).
   - Unit: none beyond slice 01's server tests; client function is covered by e2e.
6. `npm run build:studio`; regression checklist.

## Do not

- No modal/library, no tagging, no folders (that's the projects layer).
- Do not rename uploads (no backend for it; out of scope).
- Do not alter existing automatic `downloadName` fallbacks.

## Acceptance criteria

- Generate-with-name and rename-later both persist across reload (e2e-proven).
- Existing card actions untouched in position/behaviour.
- Diff limited to: `ImageStudio.jsx`, `VideoStudio.jsx`, `nativeMedia.js`,
  new e2e spec.
