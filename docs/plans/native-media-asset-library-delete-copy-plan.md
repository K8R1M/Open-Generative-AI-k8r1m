# Native Media Library, Merge Preservation, Delete, And Copy Prompt Plan

Last updated: 2026-06-30
Branch: `feat/native-grok-imagine-video`
Status: final plan after Grok 4.3, GLM 5.2 Opencode, and Gemini 3.5 Flash Multica audits

## Merge Preservation Note

Do not merge or clean in a way that removes `.native-media/`.

Current generated native media lives outside git and is ignored by `.gitignore`:

- `.native-media/jobs.json`
- `.native-media/assets/<asset-id>/data.<ext>`
- `.native-media/assets/<asset-id>/meta.json`
- `.native-media/uploads/<asset-id>/data.<ext>`
- `.native-media/uploads/<asset-id>/meta.json`

Current local inventory during planning:

- Native jobs: 48
- Completed native jobs with URLs: 29
- Generated output assets: 29 directories, about 56 MB
- Uploaded input assets: 19 directories, about 26 MB
- Temp/log outputs: about 57 MB

Before merging back to `main`, make a backup from the repo root:

```bash
tar -czf /tmp/open-generative-ai-native-media-before-merge-$(date +%Y%m%d-%H%M%S).tgz .native-media/jobs.json .native-media/assets .native-media/uploads
```

After merge, run the app from the same repo directory or set a stable `NATIVE_MEDIA_ROOT` pointing to this same `.native-media` store. The merge should not delete ignored files, but a different worktree or cwd creates a different default `.native-media` and makes the interface look empty.

V1 must make `NATIVE_MEDIA_ROOT` explicit in docs/scripts before merge, and the gateway should log the resolved native media root at startup. Log the root plus total/completed/tombstoned job counts and whether the assets root exists. This prevents another empty-gallery surprise when the gateway starts from a different cwd.

## Problem

Image Studio and Video Studio currently render `localStorage` history:

- Image Studio key: `hg_image_studio_persistent`
- Video Studio key: `hg_video_studio_persistent`

That history is browser-local, branch/session-sensitive, and capped in the component. Native generated files are already durable on disk, but the UI does not list completed native server jobs. Switching branches, running from another worktree, or losing browser state makes the interface look empty even though assets still exist under `.native-media`.

Legacy MuAPI generations are different: they are URL-only from the local browser history. This repo has no MuAPI asset-delete endpoint, so only native same-origin assets can be deleted from this server in V1.

## Goals

1. Keep all native generated images/videos visible after branch switches and merge to `main`.
2. Show completed native server assets in Image Studio and Video Studio from `.native-media/jobs.json`.
3. Preserve existing localStorage history as fallback, especially legacy MuAPI URL entries.
4. Add subtle overlay actions on each card:
   - Copy prompt to clipboard.
   - Delete asset with an "Are you sure?" confirmation.
5. Delete native generated assets from both UI and server storage to clear disk space.
6. Avoid deleting source uploads unless a later explicit cleanup feature handles unreferenced uploads.

## Non-Goals For V1

- Do not delete remote MuAPI-hosted files without a real MuAPI delete contract.
- Do not move existing `.native-media` files during merge.
- Do not store generated media in git.
- Do not build a database; reuse `jobs.json`, asset `meta.json`, and small JSON sidecars if needed.
- Do not add a new UI framework or icon dependency.

## Proposed Server API

Add native media library routes under the existing gateway/proxy:

```text
GET    /api/native-media/v1/library?kind=image|video|all&limit=100&cursor=<opaque-createdAt-jobId>
DELETE /api/native-media/v1/library/:jobId
```

`GET /library`:

- Read `.native-media/jobs.json`.
- Include only terminal completed jobs with a same-origin `url`.
- Skip deleted/tombstoned jobs where `assetDeleted === true` or `status === "asset_deleted"`.
- Hide fake/test jobs by default; allow them only with an explicit dev/loopback-only `includeFake=1` query. Ignore or reject that flag outside dev/loopback mode.
- Omit unknown kinds by default instead of guessing.
- Verify the referenced asset still exists with `getAsset(assetId)`.
- Return newest first by `createdAt` descending with `jobId` as the stable tie-break.
- Cursor is opaque to the client and encodes the last `(createdAt, jobId)` pair.
- Split by kind from MIME first, then task:
  - `image/*` or `text-to-image`/`image-to-image` -> image
  - `video/*` or `text-to-video`/`image-to-video` -> video
- If MIME and task conflict, MIME wins. If both are indeterminate, omit the job.
- Return safe public fields only:

```json
{
  "items": [
    {
      "id": "job-...",
      "jobId": "job-...",
      "assetId": "asset-...",
      "url": "/api/native-media/v1/assets/asset-...",
      "kind": "video",
      "prompt": "prompt text",
      "model": "native.grok.imagine-video",
      "task": "image-to-video",
      "createdAt": "2026-06-30T17:48:14.021Z",
      "completedAt": "2026-06-30T17:50:03.586Z",
      "native": true,
      "deletable": true
    }
  ],
  "nextCursor": null
}
```

Do not expose private fields in library responses:

- local filesystem paths
- input/upload asset IDs or paths
- raw provider request or response payloads
- raw `parameters`
- `providerConfig`
- diagnostics fields such as `detail`, `codexDiagnostics`, or `grokDiagnostics`
- process fields such as `pid`, `pgid`, `outputPath`, or `subprocessProvider`

`DELETE /library/:jobId`:

- Delete is keyed by `jobId` only. Never allow direct `assetId` deletion from the route URL in V1.
- Derive `assetId` from the server-side job record only.
- Confirm the job exists, is native, is completed, is not already deleted, and has server-side generated output provenance such as `assetId`/same-origin `url`.
- Reject running, queued, failed, upload-only, missing-job, non-native, fake-hidden, or path-unsafe jobs.
- Serialize all `jobs.json` and idempotency read-modify-write mutations in the gateway with one in-memory promise queue/mutex. Atomic rename prevents partial files; the queue prevents stale read overwrites inside the single gateway process.
- If multiple gateway processes are ever supported, replace the in-memory queue with a filesystem or external lock before enabling DELETE.
- Validate the derived `assetId` before filesystem use:
  - reject empty, `.`, `..`, separators, absolute paths, and path traversal
  - resolve the `.native-media/assets` root with `realpath`
  - resolve the asset directory with `realpath` when it exists
  - if the asset directory is already missing, skip filesystem deletion and still tombstone the job
  - if it exists, delete only when the resolved asset directory is strictly contained inside the resolved assets root
- Never use URL params, client URLs, prompt text, or metadata paths as filesystem paths.
- Tombstone first, then delete from disk:
  1. Patch `jobs.json` atomically with temp-file plus rename, keeping provenance but removing it from normal gallery results.
  2. Only after the tombstone rename succeeds, remove `.native-media/assets/<asset-id>`.
  3. If filesystem removal fails after tombstone, log it and return `204`; the gallery is consistent and a later cleanup can remove the orphaned directory.
- Tombstone patch:
  - `status: "asset_deleted"` or `assetDeleted: true`
  - `deletedAt`
  - preserve `prompt`, `modelId`, `task`, timestamps
- Do not delete `.native-media/uploads` in V1.
- Return:
  - `204` for successful delete
  - `204` when a native completed job exists but its asset directory is already missing and the job is newly tombstoned
  - `400` for invalid ID/path-traversal attempts
  - `401` or `403` if the existing app boundary rejects the request
  - `404` for missing or already tombstoned jobs
  - `409` for existing jobs that are not in a deletable or recoverable state, including running/queued/upload-only/non-terminal jobs

Auth and request boundary:

- Preserve the existing same-origin Next proxy and loopback gateway boundary.
- If this route is ever exposed beyond loopback or same-origin app traffic, require the same app auth and CSRF protections as other destructive routes before enabling DELETE.
- DELETE must not be reachable cross-origin.

Optional later route:

```text
POST /api/native-media/v1/library/import
```

This can import existing browser `localStorage` entries as metadata-only records, but server deletion should be disabled unless the URL is same-origin native media.

## Proposed Client Changes

Add small native client helpers in `packages/studio/src/nativeMedia.js`:

- `listNativeLibrary({ kind, limit, cursor })`
- `deleteNativeLibraryItem(jobId)`

Update Image Studio and Video Studio:

- On mount, fetch native library entries for the studio kind.
- Merge server entries with existing local history deterministically:
  - exact `url` match first
  - then `jobId`
  - then `id`
- Prefer server fields when duplicate.
- Preserve legacy entries as `native: false`.
- Sort by `completedAt || timestamp || createdAt` descending.
- Keep localStorage fallback for legacy MuAPI entries.
- Continue adding newly generated native entries immediately, then let the server list be source of truth on refresh.

Small card overlay actions:

- Keep current Fullscreen and Download buttons.
- Add Copy Prompt button near them.
- Add Delete button near them.
- Use small subtle icon buttons matching current overlay style.
- Copy handler:
  - disable or hide when prompt is empty
  - use `navigator.clipboard.writeText(entry.prompt)` when available
  - fall back to temporary textarea selection copy when clipboard API is unavailable on non-secure local/IP access
- Delete handler:
  - `if (!window.confirm("Delete this generation from the interface and server? This cannot be undone.")) return;`
  - if `entry.native && entry.jobId && entry.deletable`, call native delete API.
  - remove from current UI state after successful server delete.
  - if `!entry.native`, skip the server API and remove only from local state/localStorage after confirmation, clearly treating it as browser-local removal.
- Trust the server `deletable` flag for server delete. Do not re-derive server delete policy in the browser. Legacy/localStorage-only entries are not server-deletable.

## Migration / All Branches

1. Treat `.native-media` as the durable native server store.
2. Before merge, back it up.
3. After merge, start gateway from this repo root or with `NATIVE_MEDIA_ROOT` set to this store.
4. Implement `GET /library`, then the UI will show every completed native job in that store regardless of branch-local `localStorage`.
5. If generations were made in a different worktree with a different `.native-media`, merge those `.native-media/jobs.json`, `.native-media/assets`, and `.native-media/uploads` into this store with a one-off script before relying on the UI. Do not `cp -r` over the destination blindly:
   - merge `jobs.json` by `jobId`
   - use last-write-wins or newest-`createdAt`-wins and document the choice
   - copy asset/upload directories by `assetId`
   - skip and report asset/upload collisions instead of clobbering
6. Leave legacy MuAPI browser history as browser-only fallback in V1. Do not import it into server state until there is a clear metadata migration plan.

## Decisions From Audit

- Delete by `jobId` only in V1.
- The server derives `assetId`; clients never choose a filesystem asset path.
- Deleted assets are tombstoned in `jobs.json` and omitted from normal library results.
- Fake/test jobs are hidden by default.
- Legacy MuAPI entries stay browser-local and are not server-deletable in V1.
- `NATIVE_MEDIA_ROOT` is a required merge/readiness concern, not an open question.
- Atomic `jobs.json` writes are required for delete/tombstone operations.
- All `jobs.json` read-modify-write mutations need single-process serialization; atomic rename alone is not enough.
- DELETE tombstones before filesystem removal, so failed `fs.rm` cannot leave a completed job pointing at a deleted asset.
- Missing asset directory on DELETE is recoverable: tombstone the completed native job and return `204`.
- Server is authoritative for `deletable`; the client only performs local removal for non-native localStorage entries.

## Multica Audit Record

- `GLM 5.2 - Opencode` via Multica issue `MER-185` completed and returned `REQUEST_CHANGES` focused on safety/spec precision. Codex accepted the useful findings and incorporated them here.
- The earlier `GLM 5.2 Opencode - General` run used the wrong provider path and failed before audit. It was closed on the Multica board.
- `Gemini 3.5 Flash High - General` failed before producing an audit report in this asset-library planning round. It was closed on the Multica board. No Gemini recommendations were applied because no report was produced.
- Second audit round:
  - `Grok 4.3 General` issue `MER-187`, run `8e105a3d-a31e-4eca-9e0a-25b9bc8d7794`: `APPROVE`, no required amendments.
  - `Gemini 3.5 Flash High - General` issue `MER-189`, run `14c550ac-e562-408f-b83b-5fa0bf9b93a8`: `APPROVE_WITH_NOTES`; accepted jobs-write serialization, missing-asset tombstone, clipboard fallback, local-only legacy removal, and cursor tie-break findings.
  - `GLM 5.2 - Opencode` issue `MER-188` produced no usable audit and was closed; retry issue `MER-190`, run `3988eb0e-cc77-4c4d-9017-9dc34b264715`: `APPROVE_WITH_NOTES`; accepted tombstone-first delete, asset-missing recovery, kind precedence, server-authoritative `deletable`, private-field enumeration, and migration merge clarifications.
  - Rejected as V1 overbuild: database migration, WebSockets/gallery push sync, source upload cleanup, bespoke auth framework for only this endpoint, and direct client-side server-delete policy derivation.

## Tests

Gateway:

- `GET /library` returns completed image/video jobs, newest first.
- `GET /library?kind=video` excludes images.
- `GET /library` excludes deleted/tombstoned jobs.
- `GET /library` hides fake/test jobs by default.
- Unknown kind is omitted by default.
- Pagination with equal `createdAt` values uses `jobId` tie-break without duplicates or skipped items.
- MIME/task conflicts resolve by MIME precedence.
- Missing asset jobs are omitted or marked unavailable, not returned as playable.
- Private fields listed in the server spec are not exposed.
- Delete rejects invalid asset IDs: empty, `.`, `..`, `../x`, separator-containing, absolute paths, and symlink/outside-root cases.
- Delete rejects non-completed jobs.
- Delete rejects running/queued/upload-only jobs with `409`.
- Delete is idempotent enough that a second delete returns `404` or a documented already-deleted response without corrupting `jobs.json`.
- Delete on a completed native job whose asset directory is already missing tombstones the job and returns `204`.
- Delete tombstones before `fs.rm`; simulated `fs.rm` failure leaves the gallery consistent and a retry convergent.
- Delete removes `.native-media/assets/<asset-id>` and marks the job deleted.
- Delete does not remove `.native-media/uploads`.
- Delete leaves `jobs.json` parseable after simulated write failure.
- Concurrent job completion/delete write paths do not lose unrelated `jobs.json` mutations.
- Two concurrent DELETE calls for the same `jobId` leave a convergent tombstoned record.
- Tombstone preserves `prompt`, `modelId`, `task`, `createdAt`, and `completedAt`.
- `includeFake=1` is ignored or rejected outside dev/loopback mode.
- DELETE respects the same app/same-origin boundary as other native-media mutating routes.

Client:

- Image Studio hydrates native image history from `listNativeLibrary`.
- Video Studio hydrates native video history from `listNativeLibrary`.
- Server entries merge with localStorage entries without duplicates.
- Copy prompt uses clipboard with the entry prompt.
- Delete shows confirmation before API call.
- Delete removes card only after successful native delete.
- Failed delete leaves the card visible.
- Copy prompt is disabled/no-op when prompt is empty.
- Copy prompt handles missing `navigator.clipboard` without crashing.
- Legacy MuAPI entries still render/download and are not sent to native delete.
- Legacy MuAPI/localStorage delete removes only the browser-local entry after confirmation and never calls native server delete.
- Deleting a duplicate server+localStorage native entry does not leave a zombie localStorage card on refresh.
- Server-down library fetch falls back to localStorage history.

Manual:

- Start app on `19400`.
- Confirm existing native Grok videos from `.native-media/jobs.json` appear after refresh.
- Confirm branch switch/merge does not erase the list.
- Copy prompt from a video card.
- Delete one disposable native generated asset and confirm:
  - Card disappears.
  - Asset directory is gone.
  - Job record is marked deleted.
  - Other assets still stream.
