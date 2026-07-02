# Fable Current Handoff: OGAI Native Media Portal

Updated: 2026-07-02

## Read First

This is the single current planning handoff for Fable. Older Omni/task/inbox plan docs are archived under `feature-dev/_archive/`; do not read them unless this brief is insufficient and Karim asks for historical detail.

## Product Goal

Karim is building his own AI media portal: a high-quality UI/UX for image and video workflows that uses his native/local subscription-backed providers instead of browser-paid API calls where possible. The app should support practical creative flows like Higgsfield-style iteration, references, image-to-video, video-to-video, last-frame workflows, reusable generated assets, visible history, and clear prompt/reference state.

Provider rule: no fake/dummy media may ever appear as a successful user-facing generation. Real provider failures must fail visibly.

## Build Philosophy

- Keep the app as Karim's personal creative portal, not a generic SaaS dashboard.
- Native providers should run through Karim's subscriptions, local scripts, browser/session tools, or trusted server wrappers where possible.
- The UI should make AI video/image workflows fast: generate, reuse outputs as references, carry prompts/refs forward, download last frames, organize history, and eventually storyboard/projects/references.
- Preserve working provider paths. Do not trade a new UX feature for broken Omni/Grok/Nano/Codex media generation.

## Branches / Runtime

- Clean main worktree: `/home/k8r1m/Open-Generative-AI-main-19300`
  - Branch: `main`
  - Serves: `19300`
  - Purpose: stable comparison/fallback. Do not merge broken WIP here.

- Feature worktree: `/home/k8r1m/Open-Generative-AI`
  - Branch: `feature/omni-v1-adjacent-controls`
  - Serves: `19400`
  - Purpose: current feature WIP and Karim testing.

- Shared media root: `/home/k8r1m/Open-Generative-AI/.native-media`
  - Preserve it. Do not clean it.

Recommendation: do not merge into `main` before Fable planning. Fable should inspect the feature worktree as the active branch and use main only for comparison.

## Tech Stack / Architecture

- App shell: Next.js / React.
- Studio package: workspace package `packages/studio`.
- Key UI components:
  - `components/StandaloneShell.js`
  - `packages/studio/src/components/ImageStudio.jsx`
  - `packages/studio/src/components/VideoStudio.jsx`
- Native media API/client:
  - `packages/studio/src/nativeMedia.js`
  - Next proxy route under `app/api/native-media/[[...path]]/route.js`
- Native media gateway:
  - Node gateway in `native-media-gateway/server.js` and `native-media-gateway/exports.js`
  - Job/asset state under shared `.native-media`
  - Provider wrappers under `native-media-gateway/bin/`
- Current native providers/paths include:
  - Gemini Omni video: `native-media-gateway/omniVideoProvider.js`, `bin/genai-omni`
  - Vertex/Veo video: `vertexVideoProvider.js`
  - Gemini Nano Banana image: `vertexImageProvider.js`
  - Grok video: `grokVideoProvider.js`
  - Codex/OpenAI image: `codexImageProvider.js`
- Tests are Node test files under `tests/`.
- `npm run build:studio` is the reliable studio build check.
- `npm run lint` is not useful right now because Next prompts for ESLint setup interactively.

## Done On Main

Local `main` has the real Omni V1 merge:

- Gemini Omni native video provider.
- `NATIVE_MEDIA_LIVE_OMNI=1` real-provider gate.
- Fail-closed behavior: no fake successful Omni generation.
- Safe public Omni error codes/messages.
- Prompt hydration after refresh.
- Omni generated-card resolution display fixed to `720p`.
- Completed Omni test media preserved in shared `.native-media`.

`19300` was repaired to run from the clean main worktree. Do not point it back at the feature worktree.

## Done On Feature Branch

Appears working / likely keep:

- Batch delete for generated image/video cards.
- Last-frame download for completed native video cards.
- Generated-image-to-Image-Studio reference action.
- Automatic image/video display/download naming metadata.
- Duplicate export guard in `packages/studio/src/index.js`.

Implemented but not accepted:

- Generated-image-to-Video-Studio reference action.
  - It worked once for Karim.
  - After a Video Studio model change, the visible reference disappeared.
  - Later attempts stopped working.
  - After an attempted fix and controlled `19400` restart, Karim reported it still does not work.
  - Automated/source tests passed, but the live manual result overrides them.

Attempted diagnosis/fix already tried:

- Root theory was split Video Studio state:
  - `uploadedImageUrls` = real multi-reference list.
  - `uploadedImageUrl` = single visible/start-frame mirror.
- Attempted fixes made new handoffs win, synchronized scalar/list state, preserved compatible refs on model switches, and cleared refs for incompatible video paths.
- Focused tests and build passed, but manual `19400` still failed.
- Do not repeat this same source-only approach. Prove the actual browser/state path.

## Remaining / Needs Plan

1. Decide what to do with the broken Video Studio handoff:
   - fix it properly in the feature branch;
   - temporarily disable/remove the broken action before merge;
   - or split working features into a cleaner merge branch and leave this for a new branch.

2. If fixing, plan an end-to-end diagnosis before coding:
   - generated card click action;
   - same-origin guard;
   - sessionStorage payload write;
   - shell tab switch;
   - handoff nonce;
   - Video Studio mount/effect consumption;
   - visible reference input rendering;
   - repeat attempts after model changes.

3. Add a real interaction/state-transition test or small harness. Existing regex/source tests were not enough.

4. Naming UI:
   - Current behavior is automatic metadata only.
   - Karim expected visible naming/rename controls.
   - Visible prefix/rename UI is not built.

## Future Direction After Current Merge

Karim wants the portal to grow toward a creative production workspace:

- Storyboarding and scene/shot workflows inspired by Higgsfield.
- Reusable References:
  - characters,
  - locations,
  - props.
- Projects:
  - scenes,
  - shots,
  - generated images/videos grouped by purpose.
- Uploads tab for server media with add-to-studio actions.
- Prompt templates stored as simple Markdown.
- Better visible naming/prefix/rename controls.
- Generated assets should be easy to reuse as references without losing prompt/reference state.

Research folders exist for wider planning. Fable should read them directly when planning the broader upgrade path:

- `feature-dev/research-for-merlin-studio-upgrades-from-GPT-PRO-online/`
- `feature-dev/research-for-upgrades-from-grok-and-gpt-5-5-high/`

## Important Files

- Shell handoff: `components/StandaloneShell.js`
- Image Studio: `packages/studio/src/components/ImageStudio.jsx`
- Video Studio: `packages/studio/src/components/VideoStudio.jsx`
- Native client: `packages/studio/src/nativeMedia.js`
- Native model catalog: `packages/studio/src/nativeModels.js`
- Gateway: `native-media-gateway/server.js`, `native-media-gateway/exports.js`
- Omni provider: `native-media-gateway/omniVideoProvider.js`, `native-media-gateway/bin/genai-omni`
- Last-frame helper: `native-media-gateway/bin/extract-last-frame.js`

## First Inspection Path

To avoid wasting tokens, inspect in this order:

1. `components/StandaloneShell.js` for card action handoff and tab switching.
2. `packages/studio/src/components/ImageStudio.jsx` for generated image card actions.
3. `packages/studio/src/components/VideoStudio.jsx` for handoff consumption and visible reference input state.
4. `packages/studio/src/nativeMedia.js` only if the issue crosses native asset URL validation/client helpers.
5. `tests/nativeGeneratedReferenceHandoff.test.js` and `tests/nativeVideoStudioWiring.test.js` to see why current tests missed the live failure.

## Preserve

- Omni video.
- Grok video.
- Nano Banana 2/Pro image.
- Codex image.
- Prompt copy.
- Delete and batch delete.
- History hydration.
- Existing `.native-media` assets.
- Shared `NATIVE_MEDIA_ROOT`.

## Context Only

Karim will prompt Fable separately. This file is context, not the prompt.
