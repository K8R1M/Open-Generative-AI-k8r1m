# Slice 01 — Gateway Hygiene: Tombstone Fix, Rename Endpoint, Frame-to-Asset, Grok Asset Fix

Assignee: GPT 5.5. Depends on: nothing (parallel-safe with slice 00).
Branch: `slice/01-gateway-hygiene`.

Four small, independent backend changes. All in `native-media-gateway/` + tests.

## A. Fix `asset_deleted` reconciliation bug (pre-existing, confirmed in live data)

`scheduler.js` `TERMINAL_STATUSES` = `{completed, failed, cancelled,
INTERRUPTED_PROCESS, OUTCOME_UNKNOWN, ASSET_UNAVAILABLE}` — missing
`asset_deleted`. On gateway restart, `reconcileJobState` treats tombstoned jobs
(soft-deleted via `DELETE /library/:id`) as non-terminal `running`-ish records
and settles them `OUTCOME_UNKNOWN/NO_VERIFIED_OUTPUT`, clobbering delete
semantics (live example: `job-3dbba0c8…` in `.native-media/jobs.json`).

Fix: add `'asset_deleted'` to `TERMINAL_STATUSES`. Audit for other status-set
checks that enumerate terminals (grep `TERMINAL` and `asset_deleted` across
`native-media-gateway/` and `packages/studio/src/nativeMedia.js` — the client's
`TERMINAL_NATIVE_STATUSES` already handles unknowns safely; add `asset_deleted`
there too for correctness).

Test: extend `tests/nativeStartupRecovery.test.js` (or sibling) — seed a
tombstoned job, run `reconcileOnRestart`, assert status stays `asset_deleted`
and `assetDeleted:true`/`deletedAt` survive.

Data repair: also write a one-off check in the test fixture style — do NOT
mass-rewrite the real `jobs.json`; just note in `execution-log.md` how many live
records were already clobbered (read-only count).

## B. Rename endpoint — `PATCH /library/:id` (UNGATED — no feature flag)

Purpose: backend for the naming UI (slice 02). Today `displayName` is
write-once at job creation.

- `server.js`: route `PATCH` + path `library/:id` → `gateway.renameLibraryJob(id, body)`.
  (The http server currently handles GET/POST/DELETE — extend the method switch;
  the Next proxy `app/api/native-media/[[...path]]/route.js` must export a
  `PATCH` handler too — mirror the existing GET/POST/DELETE exports.)
- `exports.js` (or keep in exports since it touches jobs.json queue):
  `renameLibraryJob(jobId, {displayName})`:
  - validate job exists, `status === 'completed'`, not deleted → else 404/409;
  - `displayName` must be a string 1..120 chars pre-sanitization; run
    `cleanDisplayName()`; empty result → 400 `{error:'BAD_REQUEST'}`;
  - atomic update via `updateJobsAtomic`: set `displayName`, `downloadName`
    (same value), `updatedAt`;
  - return `publicJob(job)` 200.
- Contract note: renaming affects future downloads' filenames and the last-frame
  attachment name (both already read `displayName`) — no other coupling.

Tests: `tests/nativeLibraryRename.test.js` — happy path, 404 unknown id, 409 on
tombstoned job, sanitization (path separators, >120 chars, emoji → `-`),
idempotent re-rename.

## C. Frame-to-asset endpoint — `POST /projects/frame-from-job`

Purpose: continuity chaining (slice 10) and media-tab actions need the extracted
last frame as a REAL native asset (today `POST /library/:id/last-frame` only
streams a download).

- Route lives under the projects namespace but is implemented now and gated by
  `NATIVE_MEDIA_PROJECTS=1` (404 otherwise) — see `02-target-architecture.md` §5.
- Helper plumbing FIRST (the helpers this needs are currently private — do not
  duplicate their logic, and do not create a circular dep on `server.js`):
  1. Move `runLastFrameHelper` (currently local in `server.js` ~246-270) into a
     new module `native-media-gateway/frames.js`; export it; `server.js`
     requires it from there. The existing `POST /library/:id/last-frame`
     download route must keep working unchanged (its tests prove it).
  2. In `exports.js`, add and EXPORT a narrow wrapper (raw `saveAsset` stays
     private):
     ```js
     async function saveDerivedFrameAsset(bytes, { jobId }) {
       const saved = await saveAsset(bytes, { mime: 'image/png' });
       // extend the asset's meta.json with: derivedFrom: { jobId, kind: 'last-frame' }
       return saved; // { assetId, id, url, mime }
     }
     ```
     (additive meta field — nothing else reads meta.json fields it doesn't know).
  3. `resolveLibraryVideoAsset` is ALREADY exported (`exports.js` ~1115) — use it.
- Handler flow (new `native-media-gateway/projects.js`, first function in it):
  1. body `{jobId}`; validate with `resolveLibraryVideoAsset(jobId)`
     (completed, not deleted, video mime);
  2. `frames.runLastFrameHelper()` → PNG bytes in an OS temp dir;
  3. `saveDerivedFrameAsset(bytes, {jobId})` → new `asset-<uuid>` in `assets/`;
  4. respond 201 `{assetId, url: assetUrl(assetId), mime:'image/png'}`.
- Errors: ffmpeg failure → 500 `{error:'FRAME_EXTRACTION_FAILED', message:'Could
  not extract last frame.'}` (add to `safeError` mapping); no fake success.

Tests: `tests/nativeFrameFromJob.test.js` — with a tiny fixture mp4 (generate
with ffmpeg in test setup, or reuse an existing fixture if present): 201 +
asset readable via `readGeneratedAsset`; 404 unknown job; 404 when flag off;
non-video job → 400/404 per `resolveLibraryVideoAsset` semantics.

## D. Grok adapter: accept generated/derived assets (fixes a latent LIVE bug)

Today `grokVideoProvider.js` rejects any input asset not stored under
`uploads/`: `isUploadedNativeAssetPath()` (~89-93) requires the asset's
grandparent directory to be named `uploads`, and `validateGrokVideoInputs`
throws `'Grok video inputs must be uploaded native assets'` (~145-147).
Generated images live under `assets/`, so “generated image → Grok video”
fails at generation time even in the current app. Slice 00 makes that flow
prominent; this must work.

Change (surgical):
1. Rename `isUploadedNativeAssetPath` → `isAllowedNativeAssetPath`. Same
   resolution logic; accept grandparent basename `'uploads'` OR `'assets'`:
   ```js
   function isAllowedNativeAssetPath(filePath, assetId) {
     const resolved = path.resolve(String(filePath || ''));
     const assetDir = path.dirname(resolved);
     const parent = path.basename(path.dirname(assetDir));
     return path.basename(assetDir) === assetId && (parent === 'uploads' || parent === 'assets');
   }
   ```
2. Error message → `'Grok video inputs must be native uploaded or generated assets'`.
3. NOTHING else in the adapter changes (extension allowlist, size caps, counts,
   argv building all stay byte-identical).

Tests: extend `tests/nativeGrokVideoProvider.test.js`: input asset under
`assets/<assetId>/data.png` now accepted; `uploads/` still accepted; asset dir
whose basename ≠ assetId rejected; path outside both roots rejected; traversal
(`..`) rejected. Live verification happens at Gate A (99-doc §4: Karim runs a
real generated-image → Grok generation on 19400).

## Acceptance criteria

- All four features unit-tested green (`node --test tests/<new files>` and the
  full existing suite per-file — no regressions).
- No change to scheduler launch paths or public shapes of existing routes; the
  only provider-adapter change is §D exactly as specified.
- `git diff` limited to: `scheduler.js`, `exports.js`, `server.js`,
  `projects.js` (new), `frames.js` (new), `grokVideoProvider.js`,
  Next proxy route file (PATCH export), `nativeMedia.js` (terminal-status set
  only), new/extended tests.
