# Recommended Backend and Data Model

See `sample_project_schema.json` for an example metadata-only project file.

## Storage choice

Use JSON sidecars in `.native-media/projects/` for V1.

## Why not SQLite in V1

SQLite is better after project metadata grows, but it increases migration, locking, packaging, and rollback complexity. The current native media model already uses files and JSON, so sidecars are the lowest-risk bridge.

## Why not only existing native job records

Native job records are job/output history, not project planning records. A storyboard needs draft shots, references, character notes, missing asset states, and future shots that may not yet have generation jobs.

## Why not duplicate media

Duplicating generated/uploaded media into project folders breaks expected delete/download/storage semantics and can double disk usage. Use pointers and cache only light metadata.

## Entity list

- Project
- Scene
- Shot
- ReferenceCollection
- ReferenceAsset
- CharacterBible
- Location
- Prop
- PromptTemplate
- Variant
- GenerationJobLink

## File layout

```text
.native-media/
  jobs.json
  assets/
  uploads/
  projects/
    index.json
    proj_abc.project.json
    proj_abc.project.json.bak
```

## AssetRef contract

Every reference to existing media should be a structured pointer:

- kind: `nativeAsset`, `nativeUpload`, `jobOutput`, `externalUrl` only if already supported.
- jobId / assetId / uploadId where available.
- relativePath under `.native-media`.
- mediaType and mimeType.
- optional cached width/height/duration/thumbnail.

## Delete behavior

- Delete project: remove project metadata only.
- Delete reference collection: remove metadata only.
- Remove reference asset: remove link only.
- Delete native media asset: existing behavior only; project marks missing.

## Variant provenance

Each Variant must snapshot:

- model id and provider id.
- prompt after tag expansion.
- raw prompt before tag expansion if useful.
- selected reference ids.
- resolved asset refs sent to model.
- camera/settings snapshot.
- native job link.
- status/error.

## Migration plan

- Add feature flag.
- Create project dir lazily.
- No existing media migration.
- Atomic writes.
- Backup before schema upgrades.
- Unknown future schema opens read-only.

## Rollback plan

- Disable feature flag.
- Existing studios ignore `.native-media/projects/`.
- Users may archive/delete project sidecars manually without touching media.
