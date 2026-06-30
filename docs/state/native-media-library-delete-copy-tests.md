# Native Media Library/Delete/Copy Test State

Executor C added tests for native media library listing/delete/copy controls and image-control defaults.

Current blockers from `node --test tests/nativeMediaLibraryServer.test.js tests/nativeModelCatalog.test.js`:

- `native-media-gateway/exports.js:listLibrary` returns items without public `jobId`; the contract expects `jobId` for jobId-only delete and stable pagination.
- `native-media-gateway/exports.js:deleteLibraryJob` returns `400` for completed jobs whose asset directory is already missing; the contract expects tombstone + `204`.
- `native-media-gateway/server.js` returns `200` with a body for successful library deletes; the contract expects `204`, with concurrent deletes resolving to `[204, 404]`.
- `packages/studio/src/nativeModels.js` Codex GPT Image 2 descriptor lacks `defaultAspectRatio: "auto"` and `defaultImageSize: "1K"`.
