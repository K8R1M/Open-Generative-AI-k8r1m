# Target Architecture — Decisions and Contracts

All decisions below are FINAL for V1. Executors implement them as written.
Rationale is included so reviewers can check implementations against intent,
not so executors can re-open the decision.

## 1. Product shape

Merlin Studio = existing studios (Image/Video, untouched pipelines) + a new
**Projects layer** (storyboard: projects → scenes → shots), a **References
library** (characters/locations/props/styles + @tags), a **Media library tab**
(generated + uploaded assets with add-to-studio/project actions), **continuity
chaining** (last frame → next shot first frame), and **prompt templates**
(markdown). Everything is metadata over the existing `.native-media` store.

Consensus from both research corpora (GPT-PRO + grok/gpt-5.5): metadata-only
project layer, JSON sidecars, no media duplication, no identity training, no
node graphs, no collaboration, no timeline/NLE in V1. This plan adopts that.

## 2. Storage — JSON sidecars owned by the gateway

New directories under the existing store root (`NATIVE_MEDIA_ROOT`):

```
.native-media/
  projects/
    index.json                    # { schemaVersion: 1, projects: [{id,title,updatedAt,shotCount,coverAssetId?}] }
    <projectId>.project.json      # full project document (schema §4)
    <projectId>.project.json.bak  # written before any schema migration only
  prompt-templates/
    <slug>.md                     # markdown with YAML frontmatter (slice 11)
```

Rules:
- **Single writer: the gateway.** The browser never reads/writes these files;
  all access via new gateway routes (§5). Reuse `writeJsonAtomic()` and the
  promise-queue serialization pattern from `exports.js` (add a
  `projectsWriteQueue` analogous to `jobsWriteQueue`).
- IDs: `proj-<crypto.randomUUID()>`, `scene-<uuid>`, `shot-<uuid>`, `ref-<uuid>`,
  `refasset-<uuid>`, `var-<uuid>` — same convention as `job-`/`asset-`.
- `schemaVersion: 1` at document top level. Unknown higher version → gateway
  serves it read-only (`readOnly: true` in response) and refuses writes with 409.
- Rollback story: feature flag off → routes 404, studios ignore the directory.
  Deleting `.native-media/projects/` loses only project metadata, never media.
- Why not SQLite: single user, small N, file-based store matches every existing
  pattern in this codebase, rollback is `rm -rf` of one directory. Revisit only
  if hydration measurably slows (>200ms for index) — noted as accepted debt.

## 3. Feature flags

Exactly two flags, one concept:
- Gateway: `NATIVE_MEDIA_PROJECTS=1` — when unset, all `/projects` and
  `/prompt-templates` routes return 404 and no directories are created.
- Client (build-time): `NEXT_PUBLIC_STUDIO_PROJECTS=1` — when unset, the
  Projects/Library tabs and all “Add to project/reference” card actions are
  hidden.

Do NOT invent per-feature flags (`enableShotVariantCompare` etc. from the
research docs are rejected — over-granular for a single-user app).

## 4. Canonical project schema (reconciles the research contradictions)

One document per project. Entities are objects keyed by id (not arrays) except
ordered lists, which are id arrays on the parent.

```jsonc
{
  "schemaVersion": 1,
  "project": {
    "id": "proj-…", "title": "", "description": "",
    "aspectRatio": "16:9",            // default for new shots
    "styleNotes": "",                 // free text appended to prompts on request, not automatically
    "sceneOrder": ["scene-…"],
    "createdAt": "ISO", "updatedAt": "ISO"
  },
  "scenes": { "scene-…": {
    "id": "scene-…", "title": "", "summary": "", "shotOrder": ["shot-…"]
  }},
  "shots": { "shot-…": {
    "id": "shot-…", "sceneId": "scene-…", "title": "",
    "prompt": "", "negativePrompt": "",
    "modelId": null,                  // native model id or null = ask at generation
    "durationSeconds": null, "aspectRatio": null,   // null = model/project default
    "referenceIds": ["ref-…"],        // reference collections attached to this shot
    "firstFrame": null,               // AssetRef | null
    "lastFrame": null,                // AssetRef | null (target/continuity frame)
    "variantIds": ["var-…"],
    "pinnedVariantId": null,
    "status": "draft"                 // 'draft' | 'generating' | 'generated' | 'failed'
  }},
  "references": { "ref-…": {
    "id": "ref-…",
    "type": "character",              // 'character' | 'location' | 'prop' | 'style' | 'frame'
    "name": "", "tag": "@adil-cop",   // unique per project, /^@[a-z0-9-]{2,32}$/
    "promptSnippet": "",              // text inserted when @tag is resolved
    "assets": [ /* ReferenceAsset */ ],
    "bible": null                     // only for type 'character', see below
  }},
  "variants": { "var-…": {
    "id": "var-…", "shotId": "shot-…",
    "modelId": "", "provider": "",
    "promptResolved": "",             // after @tag expansion — exact text sent
    "promptRaw": "",                  // before expansion
    "parameters": {},                 // exact parameters object sent
    "inputs": [],                     // exact inputs array sent (asset refs + roles)
    "jobId": null,                    // null ONLY while status is 'created' (pre-submit);
                                      // then "job-…". Any other status REQUIRES a jobId.
                                      // THE native-job link; no separate GenerationJobLink entity
    "assetId": null,                  // filled when completed
    "status": "created",              // mirror of native job public status, lowercased; refreshed on read
    "error": null, "message": null,
    "createdAt": "ISO"
  }}
}
```

`ReferenceAsset` (element of `references[*].assets`):
```jsonc
{ "id": "refasset-…",
  "role": "identity",                 // 'identity' | 'wardrobe' | 'angle' | 'wide' | 'detail' | 'frame' | 'other'
  "assetRef": { /* AssetRef */ },
  "notes": "" }
```

`AssetRef` — the ONLY way any project entity points at media:
```jsonc
{ "kind": "generated" | "upload" | "derivedFrame",
  "assetId": "asset-…",               // truth; url is derived = /api/native-media/v1/assets/<assetId>
  "jobId": "job-…" | null,            // provenance when kind === 'generated' | 'derivedFrame'
  "mediaType": "image" | "video" }
```
The gateway resolves AssetRefs on every project read (`GET /projects/:id`) and
annotates each with `"missing": true` when the asset no longer exists. The UI
must render missing states; it must never 404-crash on a dead ref.

Character bible (`references[*].bible`, character type only):
```jsonc
{ "appearance": "", "wardrobe": "", "personality": "",
  "doNotChange": ["…"], "aliases": ["…"] }
```

Deliberate simplifications vs the research schemas (do not "restore" them):
- **No `GenerationJobLink` entity** — `Variant.jobId` is the link. The research
  version had no back-reference and forced a 3-hop traversal; folding it removes
  an entity and an indirection.
- **No separate `CharacterBible`/`Location`/`Prop` entities** — a reference
  collection's `type` + `bible` + `promptSnippet` covers all of them.
- **No `camera` object on Shot in V1** — camera controls are future work
  (`90-future-work-outline.md`); adding the field now invites dead UI. Schema
  version bump will add it.
- Status enums are LOCKED as written above. Do not invent new values.

## 5. Gateway API additions (all new code in `native-media-gateway/`)

New module `native-media-gateway/projects.js` (keep `exports.js` from growing);
`server.js` routes into it.

Flag gating — precise: ONLY `/projects*` (including `/projects/frame-from-job`)
and `/prompt-templates*` return 404 unless `NATIVE_MEDIA_PROJECTS=1`.
`PATCH /library/:id` and `GET /uploads` are UNGATED — they are plain library
features needed in Phase 1/slice 06 regardless of projects.
Next proxy methods: the catch-all proxy currently exports only GET/POST/DELETE
(`app/api/native-media/[[...path]]/route.js`) — slice 01 adds the `PATCH`
export, slice 05 adds `PUT`, both mirroring the existing one-line handlers.

| Method | Path | Contract |
|---|---|---|
| GET | `/projects` | `{ items: [{id,title,updatedAt,shotCount,coverAssetId}] }` from `index.json` |
| POST | `/projects` | body `{title}` → 201 full project doc (creates sidecar + index row) |
| GET | `/projects/:id` | full doc, AssetRefs resolved with `missing` annotations, variant statuses refreshed from `jobs.json` |
| PUT | `/projects/:id` | full-document replace. Body must carry `baseUpdatedAt` = the `project.updatedAt` the client loaded. Mismatch → 409 `{error:'CONFLICT'}`. Server re-stamps `updatedAt`, validates schema (§4 shapes, enum values, tag uniqueness/regex, AssetRef shape), rejects invalid with 400 + field path. |
| DELETE | `/projects/:id` | removes sidecar + index row → 204. Never touches media. |
| POST | `/projects/frame-from-job` | body `{jobId}` → extracts last frame via existing helper, **imports it as a real asset** (`saveAsset`, mime image/png) → 201 `{assetId, url}`. This replaces download-only last-frame for continuity use. Works for any completed video job; independent of any project (deliberately — the media tab uses it too). |
| PATCH | `/library/:id` | body `{displayName}` → re-sanitize via `cleanDisplayName`, update job record → 200 publicJob. (Naming/rename backend, slice 01.) |
| GET | `/uploads` | `{ items: [{assetId, url, mime, createdAt, size}] }` — list `uploads/` dir via meta.json files, newest first, `?limit=` cap 200. (Media tab needs it; today uploads are write-only.) |

Why full-document PUT instead of granular PATCH ops: single user, one window in
practice, documents are small; optimistic-concurrency PUT is simple enough that
junior executors cannot get merge logic wrong. 409 handling in the UI = reload +
toast “Project changed elsewhere — reloaded.”

## 6. Model capabilities — single source of truth (slice 04)

Problem today: capability facts are scattered (`nativeModels.js` fields, ad-hoc
helpers like `getMaxImagesForI2VNative`, `supportsLastFrame`, provider-side
`CAPABILITY_CONSTRAINTS`) and drift is guarded only by one fixture.

Target: every model entry in `NATIVE_MODELS` gains a normalized block:

```js
capabilities: {
  imageInit: true,          // accepts a first/start frame image
  referenceImages: 10,      // max reference-role images (0 = none)
  lastFrameInput: false,    // accepts an end/last-frame image input
  videoInput: false,        // accepts video reference inputs (omni: true)
  audioToggle: false,
  aspectRatioControl: true,
  durationsSeconds: [4,6,8],
  resolutions: ['720p','1080p'],
  refsForceDurationSeconds: 8 | null,   // veo peculiarity
}
```

One accessor `getModelCapabilities(modelId)` in `nativeModels.js` returns this
block (or a zeroed block for non-native models). ALL reference-aware UI and the
prompt composer read capabilities ONLY through this accessor — grep-level
acceptance: no new call sites of `maxReferenceImages`/`supportsLastFrame`
outside `nativeModels.js` after slice 04. Existing helpers become thin wrappers
to avoid a big-bang refactor of VideoStudio.

Contract test: extend `tests/fixtures/nativeContract.js` + a new
`tests/nativeCapabilityContract.test.js` asserting client `capabilities` agree
with gateway `CAPABILITY_CONSTRAINTS` (durations, resolutions, ref caps per
model). This kills the documented drift risk.

## 7. Cross-studio handoff — target design (slice 00)

The sessionStorage+nonce transport stays (it survives the unmount/remount tab
model). What changes is **consumption determinism** and **state shape**:

1. `uploadedImageUrl` scalar state is DELETED from VideoStudio. It becomes a
   derived value: `const uploadedImageUrl = uploadedImageUrls[0] ?? null;`
   Every write site sets only the list. (Kills the dual-state desync class,
   including the impure setState-inside-updater at ~974-978 / ~1194-1198.)
2. One mount pipeline, one owner: the persistence-load effect becomes the only
   mount-time writer. Order inside it: (a) restore persisted state into local
   variables, (b) read + consume any pending handoff payload, (c) decide final
   model = handoff-compatible model if a handoff exists else restored model,
   (d) apply ALL state once, (e) `hasRestored.current = true`. The separate
   consumption effect keeps handling the already-mounted case (nonce prop
   change) but is gated with `if (!hasRestored.current) return;` and reads the
   current model from a ref (`selectedModelRef`) — never from a render closure.
3. Refs are never silently hidden. If `uploadedImageUrls.length > 0` and the
   selected model's `capabilities` can't consume them, the strip still renders,
   with a warning chip: “<Model label> won't use reference images — switch model
   or remove them.” Switching to an incompatible model TRIMS (never clears) and
   warns. Explicit user removal is the only silent path.
4. Handoff payload gains `handoffId` (uuid). Consumption is
   read-then-delete-immediately (delete before applying state), so a failed
   apply can never replay into a loop; failures surface as a console.error plus
   a visible toast — never a silent no-op. The `return false → keep payload`
   behaviour of `appendGeneratedImageInputs` is removed.

## 8. Frontend architecture for new surfaces

- New tabs in `StandaloneShell.js` TABS: `projects` (“Projects”) and `library`
  (“Library”) — gated by `NEXT_PUBLIC_STUDIO_PROJECTS`.
- New components live in `packages/studio/src/components/projects/`:
  `ProjectsStudio.jsx` (list + board shell), `ShotBoard.jsx`, `ShotCard.jsx`,
  `ShotDetailPanel.jsx`, `ReferenceLibrary.jsx`, `ReferenceEditor.jsx`,
  `MediaLibrary.jsx`, plus `packages/studio/src/projectsClient.js` (fetch layer,
  mirrors `nativeMedia.js` conventions) and
  `packages/studio/src/promptComposer.js` (pure functions, no React).
- State: one hook `useProject(projectId)` in
  `packages/studio/src/components/projects/useProject.js` — loads the doc,
  exposes `{doc, update(mutatorFn), save()}` where `update` applies an immutable
  mutation locally and marks dirty; `save()` PUTs with `baseUpdatedAt` and
  debounces at 800ms after last change. No Redux/zustand/context libraries —
  plain hook + fetch. Studios (Image/Video) do NOT consume this hook; their only
  integration points are card actions that call `projectsClient` directly.
- Prompt composer contract (pure, unit-tested):
  ```js
  composePrompt({ prompt, project, shot, modelCapabilities }) →
    { resolvedPrompt,           // @tags replaced by promptSnippet text
      inputs,                   // [{assetId, role}] respecting capability caps, order: firstFrame, references
      warnings }                // ['@tag-unknown:@foo', 'refs-truncated:6/9', 'refs-unsupported', …]
  ```
  @tag resolution: word-boundary match of `references[*].tag`; unknown tags stay
  literal in the prompt and produce a warning. Reference media attachment order:
  shot.firstFrame first (role 'first-frame'), then each attached reference's
  `identity`-role assets, then remaining roles, truncated to
  `capabilities.referenceImages` with a warning.

## 9. Testing architecture (slice 00 establishes it)

- **Playwright** (`@playwright/test`, chromium only) as devDependency; config
  `playwright.config.js` starts `next dev` on an ephemeral port (default 19488)
  with `NATIVE_MEDIA_ROOT` pointed at a per-run temp fixture dir and the gateway
  started with NO live flags (fake vertex-video path is the only generation used
  in browser tests; **never set NATIVE_MEDIA_LIVE_* in tests**).
  npm scripts: `"test:e2e": "playwright test"`, `"test:unit": "node --test tests/"`
  — note `node --test tests/` currently works per-file; keep per-file invocation
  in CI notes if the directory form misbehaves.
- Browser tests seed adversarial persisted state via
  `page.addInitScript` (localStorage PERSIST_KEY variants) — this is exactly the
  class the regex tests missed.
- Unit tests (node:test) for: promptComposer, projects.js validation, schema
  round-trips, capability contract.
- E2E minimum set grows per slice; each slice doc lists its required specs under
  `tests/e2e/`.

## 10. Naming conventions

- Files/ids/routes as in §2/§4/§5. UI copy: “Project”, “Scene”, “Shot”,
  “Reference”, “Tag”. Higgsfield terms (Popcorn, Elements, Soul) never appear in
  code or UI.
- App name: **Merlin Studio** everywhere user-visible after slice 03.
  Internal package names (`studio` workspace etc.) stay unchanged.
