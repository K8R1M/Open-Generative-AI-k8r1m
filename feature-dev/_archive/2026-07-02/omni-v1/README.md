# Omni V1

This round is for Gemini Omni first, plus only the easiest adjacent controls that fit the current app without a larger library/sidebar build.

## Scope

1. Gemini Omni native video provider.
2. Minimal UI/input changes required for Omni's real supported modalities.
3. Multi-select generated assets for batch delete only.
4. Last-frame download for generated videos.
5. Use generated images as Image Studio and Video Studio references.
6. Per-studio output naming prefixes/counters with durable download/display metadata.

## Deferred

- Projects, References, Characters, and collection pages.
- Bulk add to project/reference.
- Sidebar/library redesign.
- Prompt templates and uploads tab.
- Generated video references, except whatever Gemini Omni itself truly supports and requires.

## Constraints

- Do not inspect `/home/k8r1m/merlin/Projects/omni tests/` until Karim says the running Omni tests are finished.
- Reuse the existing Vertex/Nano Banana/Veo style once traced; do not invent a parallel provider path.
- Record reusable Omni best practices and scripts so future runs can call scripts directly.
- Reuse the working Omni wrapper contract from `/home/k8r1m/merlin/bin/genai-omni` after Karim says tests are complete.
- Last-frame V1 is download-only: click a video card button, run deterministic server extraction, download the produced frame to the laptop. Upload-sidebar/import behavior is deferred.
- Naming V1 may keep server asset filenames unchanged, but must persist the assigned download/display name as metadata for future library, references, and project views.
- Preserve Grok video, Nano Banana 2/Pro image, native Codex image, prompt copy, delete, history hydration, and existing `.native-media` assets.
