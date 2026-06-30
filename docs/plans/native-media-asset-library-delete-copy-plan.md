# Native Media Library, Merge Preservation, Delete, And Copy Prompt Plan

Last updated: 2026-06-30
Branch: `feat/native-grok-imagine-video`
Status: final plan after GLM 5.2 Opencode Multica audit

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

V1 must make `NATIVE_MEDIA_ROOT` explicit in docs/scripts before merge, and the gateway should log the resolved native media root at startup. This prevents another empty-gallery surprise when the gateway starts from a different cwd.

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
GET    /api/native-media/v1/library?kind=image|video|all&limit=100&cursor=<createdAt-or-job-id>
DELETE /api/native-media/v1/library/:jobId
```

`GET /library`:

- Read `.native-media/jobs.json`.
- Include only terminal completed jobs with a same-origin `url`.
- Skip deleted/tombstoned jobs where `assetDeleted === true` or `status === "asset_deleted"`.
- Hide fake/test jobs by default; allow them only with an explicit dev-only `includeFake=1` query.
- Omit unknown kinds by default instead of guessing.
- Verify the referenced asset still exists with `getAsset(assetId)`.
- Return newest first.
- Split by kind from MIME or task:
  - `image/*` or `text-to-image`/`image-to-image` -> image
  - `video/*` or `text-to-video`/`image-to-video` -> video
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

`DELETE /library/:jobId`:

- Delete is keyed by `jobId` only. Never allow direct `assetId` deletion from the route URL in V1.
- Derive `assetId` from the server-side job record only.
- Confirm the job exists, is native, is completed, is not already deleted, and has a generated output asset.
- Reject running, queued, failed, upload-only, missing, non-native, fake-hidden, or path-unsafe jobs.
- Validate the derived `assetId` before filesystem use:
  - reject empty, `.`, `..`, separators, absolute paths, and path traversal
  - resolve the asset directory with `realpath`
  - resolve the `.native-media/assets` root with `realpath`
  - delete only when the asset directory is strictly contained inside the resolved assets root
- Never use URL params, client URLs, prompt text, or metadata paths as filesystem paths.
- Remove only `.native-media/assets/<asset-id>`.
- Patch `jobs.json` atomically with temp-file plus rename, keeping provenance but removing it from normal gallery results:
  - `status: "asset_deleted"` or `assetDeleted: true`
  - `deletedAt`
  - preserve `prompt`, `modelId`, `task`, timestamps
- Do not delete `.native-media/uploads` in V1.
- Return:
  - `204` for successful delete
  - `400` for invalid ID/path-traversal attempts
  - `401` or `403` if the existing app boundary rejects the request
  - `404` for missing or already tombstoned jobs
  - `409` for running/queued/upload-only/non-terminal jobs

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
  - `navigator.clipboard.writeText(entry.prompt || "")`
  - no-op or disabled when prompt is empty.
- Delete handler:
  - `if (!window.confirm("Delete this generation from the interface and server? This cannot be undone.")) return;`
  - if `entry.native && entry.jobId && entry.deletable`, call native delete API.
  - remove from current UI state after successful server delete.
  - for legacy/non-native entries, V1 should either hide only with a separate local remove action or disable server delete with a clear tooltip.
- Compute `deletable` per returned server item from job status, asset type, and server policy. Do not hardcode every native-looking item as deletable.

## Migration / All Branches

1. Treat `.native-media` as the durable native server store.
2. Before merge, back it up.
3. After merge, start gateway from this repo root or with `NATIVE_MEDIA_ROOT` set to this store.
4. Implement `GET /library`, then the UI will show every completed native job in that store regardless of branch-local `localStorage`.
5. If generations were made in a different worktree with a different `.native-media`, copy or merge those `.native-media/jobs.json`, `.native-media/assets`, and `.native-media/uploads` into this store with a one-off script before relying on the UI.
6. Leave legacy MuAPI browser history as browser-only fallback in V1. Do not import it into server state until there is a clear metadata migration plan.

## Decisions From Audit

- Delete by `jobId` only in V1.
- The server derives `assetId`; clients never choose a filesystem asset path.
- Deleted assets are tombstoned in `jobs.json` and omitted from normal library results.
- Fake/test jobs are hidden by default.
- Legacy MuAPI entries stay browser-local and are not server-deletable in V1.
- `NATIVE_MEDIA_ROOT` is a required merge/readiness concern, not an open question.
- Atomic `jobs.json` writes are required for delete/tombstone operations.

## Multica Audit Record

- `GLM 5.2 - Opencode` via Multica issue `MER-185` completed and returned `REQUEST_CHANGES` focused on safety/spec precision. Codex accepted the useful findings and incorporated them here.
- The earlier `GLM 5.2 Opencode - General` run used the wrong provider path and failed before audit. It was closed on the Multica board.
- `Gemini 3.5 Flash High - General` failed before producing an audit report in this asset-library planning round. It was closed on the Multica board. No Gemini recommendations were applied because no report was produced.
- Current Multica board cleanup status for this planning round: no in-progress issues remain.

## Tests

Gateway:

- `GET /library` returns completed image/video jobs, newest first.
- `GET /library?kind=video` excludes images.
- `GET /library` excludes deleted/tombstoned jobs.
- `GET /library` hides fake/test jobs by default.
- Unknown kind is omitted by default.
- Missing asset jobs are omitted or marked unavailable, not returned as playable.
- Private fields are not exposed.
- Delete rejects invalid asset IDs: empty, `.`, `..`, `../x`, separator-containing, absolute paths, and symlink/outside-root cases.
- Delete rejects non-completed jobs.
- Delete rejects running/queued/upload-only jobs with `409`.
- Delete is idempotent enough that a second delete returns `404` or a documented already-deleted response without corrupting `jobs.json`.
- Delete removes `.native-media/assets/<asset-id>` and marks the job deleted.
- Delete does not remove `.native-media/uploads`.
- Delete leaves `jobs.json` parseable after simulated write failure.
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
- Legacy MuAPI entries still render/download and are not sent to native delete.
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
