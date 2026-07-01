# Native Image Controls Audit Brief

Branch: `feat/native-grok-imagine-video`
Plan under audit: `docs/plans/native-media-asset-library-delete-copy-plan.md`

Audit only. Do not edit files. Review the plan amendment titled `Image Studio Native Model Controls` plus the related tests list.

Karim's exact request to preserve:

> ok now on the image studio page our nano banana 2 should only have options for 512 and 1k resolution not 2k - and both nano banana 2 and pro should by default be set to 1k and the aspect ration by default should be set to 16:9 not 1:1. i want that to be in the plan - and i want these aspect ratios you mentioned to be selectable for the codex gpt image 2 native image model auto, 1:1, 16:9, 9:16, 4:3, 3:4 and equivalent resolution modes for 1k 2k and 4k that call apprirate width and height dimensions in the correct way according to the aspect ratio selected (or the auto picked one) please cerefully ammend the plan and then tell the following agents of my request exactly and get them to audit your plan - you double check their audit then ammend the plan to include onlyh the useful things they say:  Gemini 3,5 flash general GLM 5.2 opencode Grok 4.3 (all multica agents)

Current local evidence checked before this audit:

- `packages/studio/src/nativeModels.js` currently declares Nano Banana 2 sizes `512`, `1K`, `2K`; Nano Banana Pro sizes `1K`, `2K`; native Codex GPT Image 2 has no aspect/size lists.
- `packages/studio/src/components/ImageStudio.jsx` derives native defaults from the first item in each native descriptor list.
- `native-media-gateway/vertexImageProvider.js` already forwards Nano Banana `aspectRatio` and `imageSize` to the wrapper.
- `native-media-gateway/codexImageProvider.js` currently ignores output aspect/size parameters.
- Official OpenAI image generation docs for GPT Image 2 say `size` supports `auto` or arbitrary `WIDTHxHEIGHT`; dimensions must be divisible by 16; aspect ratio must be between `1:3` and `3:1`; max supported resolution is `3840x2160`; above `2560x1440` is experimental.

Please audit:

1. Does the plan preserve the existing MuAPI GPT Image 2 models while adding behavior only for `native.codex.gpt-image-2`?
2. Does the Nano Banana 2/Pro default plan avoid one-off UI special cases where descriptor data would be enough?
3. Is the proposed native Codex GPT Image 2 `1K`/`2K`/`4K` dimension table valid against the OpenAI constraints, especially portrait 4K and square 4K?
4. Is `auto` correctly handled by sending `size: "auto"` instead of inventing dimensions?
5. Are the proposed tests sufficient to prevent regressions?
6. What should be changed in the plan before implementation?

Output contract:

- Start with one verdict: `APPROVE`, `APPROVE_WITH_NOTES`, or `REQUEST_CHANGES`.
- List only concrete findings.
- For each finding, say whether it is a blocker, major, minor, or note.
- Prefer exact plan amendments over broad advice.
- Do not suggest database, WebSocket, or gallery redesign work for this image-control amendment.
