# Native Video Last Frame Download Plan

## Goal

Add a small action on native video generation cards to extract the final frame of a completed video and download it as an image, so it can be reused as the first frame for the next image-to-video generation.

## Scope

- Add a video-card action next to the existing fullscreen/download/copy/delete controls.
- Only enable it for completed video assets with a native server job/asset URL.
- Use server-side `ffmpeg`/`ffprobe`; do not decode full videos in the browser.
- Return a same-origin browser download, likely PNG.
- V1 is download-only. Do not auto-import the frame into Uploads or prompt inputs until the later Uploads/sidebar phase.
- Add a deterministic repo-local helper script that takes a video path and output path and extracts the true final frame at source quality.

## API Shape

```text
POST /api/native-media/v1/library/:jobId/last-frame
```

Response: stream the PNG directly with `Content-Disposition: attachment`.

## Server Plan

1. Resolve the job by `jobId`; reject deleted/missing/non-video jobs.
2. Derive the asset path from the job record, not from client input.
3. Verify the resolved video file is under `.native-media/assets`.
4. Invoke the deterministic helper script with fixed argv and `shell:false`; the helper can use `ffprobe`/`ffmpeg` internally to extract the final frame.
5. Bound runtime and output size; delete temp files after streaming if not imported.
6. Redact local paths and subprocess stderr in public errors.

## Client Plan

1. Add a compact last-frame/download icon action on native video history cards.
2. Disable while extraction is running.
3. Trigger browser download from the returned URL/blob.
4. Show a normal toast on failure; do not remove or mutate the video card.

## Tests

- Server rejects local-only/non-native/missing/deleted/non-video jobs.
- Server derives paths safely and rejects traversal/symlink tricks.
- Server invokes `ffmpeg` with fixed argv and `shell:false`.
- Client action appears only for native videos.
- Client preserves the card on failure and triggers download on success.

## Merge Gate

Before merging to `main`, implement and test this plan after the current native library/delete/copy branch is backed up.
