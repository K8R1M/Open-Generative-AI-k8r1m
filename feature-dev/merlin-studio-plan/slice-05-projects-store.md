# Slice 05 — Projects Sidecar Store + Gateway API

Assignee: GPT 5.5. Depends on: slice 03. Parallel-safe with slice 04.
Branch: `slice/05-projects-store`. Backend only — no UI in this slice.

## Goal

Implement `native-media-gateway/projects.js` + routes per
`02-target-architecture.md` §2, §4, §5: sidecar storage, full CRUD, validation,
AssetRef resolution, optimistic concurrency. Slice 01 already created
`projects.js` with `frame-from-job`; extend the same module.

## Module layout (`native-media-gateway/projects.js`)

```js
// deps injected or imported from exports.js: writeJsonAtomic, storeRoot helpers,
// readGeneratedAsset/readUploadAsset (for missing-checks), getJob (jobs.json read)
module.exports = {
  projectsEnabled,        // () => process.env.NATIVE_MEDIA_PROJECTS === '1'
  listProjects,           // () => {items:[summary]}
  createProject,          // ({title}) => doc
  getProject,             // (id) => resolved doc (missing-annotated, variant statuses refreshed)
  putProject,             // (id, body) => doc | throws Conflict/Validation
  deleteProject,          // (id) => void
  frameFromJob,           // (already there from slice 01)
  validateProjectDocument // exported for tests
};
```

Storage invariants:
- All writes through a `projectsWriteQueue` promise chain (copy the
  `jobsWriteQueue` pattern in `exports.js`) + `writeJsonAtomic`.
- `index.json` is derived state: rebuilt entry on every create/put/delete
  (title, updatedAt, shotCount = total shots, coverAssetId = first shot's
  pinned/first variant assetId or null). If `index.json` is missing/corrupt,
  regenerate it by scanning `*.project.json` on first `listProjects()` — never
  fail listing because the index is bad.
- Corrupt project file on read: return 500 `{error:'PROJECT_CORRUPT'}` for that
  id, keep listing working, never overwrite the corrupt file automatically.
- `schemaVersion > 1`: serve with `readOnly:true`, reject PUT with 409
  `{error:'SCHEMA_TOO_NEW'}`.

## Validation (in `validateProjectDocument(doc)`)

Reject with `{error:'VALIDATION', path:'shots.shot-x.status', message}` (400):
- top-level shape and `schemaVersion === 1`;
- enums: shot.status ∈ draft|generating|generated|failed; reference.type ∈
  character|location|prop|style|frame; ReferenceAsset.role ∈ identity|wardrobe|
  angle|wide|detail|frame|other; AssetRef.kind ∈ generated|upload|derivedFrame;
- tags: match `/^@[a-z0-9-]{2,32}$/`, unique within the project;
- referential integrity: sceneOrder ⊆ scenes keys, scene.shotOrder ⊆ shots keys,
  shot.sceneId exists, shot.referenceIds ⊆ references keys, shot.variantIds ⊆
  variants keys, variant.shotId exists, pinnedVariantId ∈ shot.variantIds|null;
- variant.jobId: `null` is allowed ONLY when `variant.status === 'created'`
  (pre-submit draft, see slice 09); for every other status it must match
  `/^job-[A-Za-z0-9-]+$/`;
- AssetRef.assetId matches `/^asset-[A-Za-z0-9-]+$/`, jobId matches
  `/^job-[A-Za-z0-9-]+$/` when present (reuse existing id-format guards from
  exports.js if exported; otherwise duplicate the regex — do not weaken it);
- string length caps: title/name ≤ 200, prompts ≤ 8000, notes ≤ 4000.

Server-enforced fields (ignore client values): `project.updatedAt`,
`project.createdAt` (from existing doc), all ids on create paths.

## Resolution on read (`getProject`)

- For every AssetRef in the doc (shot frames, reference assets, variant
  assetIds): check existence via the same path-safe asset readers used by
  `listLibrary`; annotate `missing: true` on the ref object in the RESPONSE only
  (never persisted).
- For every variant with non-terminal `status`: re-read its job from jobs.json,
  update `status`/`assetId`/`error`/`message` in the response AND persist the
  refresh (queued write) so the sidecar converges. Lowercase statuses.

## Routes (`server.js`)

Wire per the table in `02-target-architecture.md` §5 — EXCEPT `GET /uploads`:
do NOT implement it here, it is deliberately deferred to slice 06 (and it is
ungated; only `/projects*` and `/prompt-templates*` are flag-gated). Follow
existing routing idiom in `handleNativeRequest` (`routeParts()` matching). Error mapping through
`safeError()` — add `CONFLICT` (409), `VALIDATION` (400 with path),
`PROJECT_CORRUPT` (500), `SCHEMA_TOO_NEW` (409), `PROJECTS_DISABLED` (404).
Next proxy: no work (catch-all + PATCH handler already added in slice 01; PUT
must be exported the same way — check and add).

## Client fetch layer (this slice, no UI)

`packages/studio/src/projectsClient.js`:
```js
export async function listProjects()
export async function createProject(title)
export async function getProject(id)
export async function putProject(doc)         // injects baseUpdatedAt from doc.project.updatedAt
export async function deleteProject(id)
export async function frameFromJob(jobId)     // → {assetId, url}
```
Same conventions as `nativeMedia.js` (endpoint consts, `buildNativeHeaders()`,
throw on !ok with status in message). Plus pure helpers in
`packages/studio/src/projectsModel.js`:
```js
export function newProjectDoc(title)          // client-side skeleton for tests
export function newScene(), newShot(sceneId), newReference(type), newVariantDraft(...)
export function addShot(doc, sceneId), reorderShots(doc, sceneId, shotOrder), … // immutable helpers
```
Immutable = return new doc, never mutate input (unit-testable, GLM consumes in
slices 07-08 without inventing state logic).

## Tests

- `tests/nativeProjectsStore.test.js`: CRUD round-trip on a temp
  `NATIVE_MEDIA_ROOT`; concurrency (two PUTs, second with stale baseUpdatedAt →
  409); validation matrix (each enum violation, bad tag, dup tag, dangling
  sceneId/shotId/variantId, bad assetId format, `jobId:null` accepted for
  status `created` and rejected for every other status); index rebuild from
  missing index.json; corrupt file isolation; flag-off → 404; schemaVersion 2 →
  read-only + PUT 409.
- `tests/nativeProjectsResolution.test.js`: missing-asset annotation (ref to a
  deleted asset dir → `missing:true` in response, absent in file); variant
  status refresh from a seeded jobs.json (running → completed with assetId).
- `tests/projectsModel.test.js` (node:test, plain JS): immutability + helper
  behaviour.

## Do not

- No UI, no tabs, no studio changes.
- No search/filter/pagination beyond `?limit` on listProjects (single user).
- No media writes anywhere except `frameFromJob` (already done).

## Acceptance criteria

- Full test matrix green; suite green; build green.
- Manual curl round-trip documented in execution-log (create → put → get shows
  resolution → delete).
- Diff limited to gateway files, `projectsClient.js`, `projectsModel.js`, tests,
  proxy route (PUT export if needed).
