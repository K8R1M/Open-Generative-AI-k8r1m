# Future Work (post-V1) — Outline Only (do not build)

Not part of Phase 1 or Phase 2. Not sliced, not designed. Captured so V1
decisions don't paint us into corners. Each item gets its own Fable design pass
before implementation.

1. **Per-shot camera controls.** Add `camera: {move, lens, focalLengthMm,
   framing, style}` to the Shot schema via `schemaVersion: 2` migration
   (`.bak` + upgrade path already specified in 02-doc §2). CinemaStudio.jsx
   already contains camera control UI/logic (~449-664) — plan is adapter
   functions mapping shot.camera → prompt fragments (capability
   `supportsCameraFields: 'prompt-only'` for all current models). Research
   consensus: prompt-level only, no provider changes.
2. **Variant compare grid.** 2×2 side-by-side of variants with fixed
   prompt/settings and varied model. Data model already supports it
   (variants carry full provenance); this is pure UI + a “generate with N
   models” fan-out that respects per-provider concurrency.
3. **Script-to-board.** Paste script/outline → LLM proposes scenes/shots
   (metadata only, editable draft, never auto-generates media). Needs a
   provider decision (local Claude/Codex CLI vs API) — defer. The board and
   schema need nothing new.
4. **Frame picker.** Choose any frame (not just last) from a video variant —
   extend `frame-from-job` with `{atSeconds}`.
5. **Uploads management.** Rename/delete/tag uploads (needs gateway delete
   route + tombstone thinking).
6. **Sidecar → SQLite migration.** Only if project hydration measurably slows
   (>200ms index reads). Schema is designed to map 1:1 onto tables.
7. **@tag autocomplete in the plain studios** (outside projects) once studio
   prompts gain project context.
8. **Reference-removal model stability.** Karim observed after Gate A2 that
   removing refs while native Grok Imagine was selected could leave the selected
   model changed to Seedance Lite. Not blocking V1 merge; later pass should make
   ref removal never auto-change the selected video model.
9. **Append Image Studio handoff refs in natural order.** Karim observed that
   adding one Image Studio generation to Video Studio, returning to Image Studio,
   then adding another makes the newer image reference become slot 1 and moves
   the older one to slot 2. Desired later behavior: each new handoff appends as
   the next reference slot, preserving original order.

Explicitly rejected for any phase (from research + Karim's build philosophy):
identity/LoRA training, realtime collaboration, community/feed, MCP surface,
full NLE timeline, node-graph canvas, new providers as part of this effort,
auto-assembled long-video export.
