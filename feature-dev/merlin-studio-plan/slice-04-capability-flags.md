# Slice 04 — Model Capability Flags: Single Source + Contract Test

Assignee: GPT 5.5. Depends on: slice 03 (runs on `feature/merlin-studio-v1`).
Branch: `slice/04-capability-flags`. Parallel-safe with slice 05.

## Goal

One normalized `capabilities` block per native model, one accessor, one contract
test binding client and gateway. Foundation for every reference-aware feature
(slices 06-10). See `02-target-architecture.md` §6 for the block shape.

## Steps

1. In `packages/studio/src/nativeModels.js`, add to each `NATIVE_MODELS` entry a
   `capabilities` object derived from the existing fields (do not delete the old
   fields yet — other code reads them):

   | model | imageInit | referenceImages | lastFrameInput | videoInput | audioToggle | aspectRatioControl | durationsSeconds | resolutions | refsForceDurationSeconds |
   |---|---|---|---|---|---|---|---|---|---|
   | nano-banana-2 (image) | true | 10 | false | false | false | true | [] | [] | null |
   | nano-banana-pro (image) | true | 1 | false | false | false | true | [] | [] | null |
   | veo-3.1 / veo-3.1-fast | true | `NATIVE_VEO_REFERENCE_IMAGES_ENABLED ? 3 : 0` | true | false | true | true | [4,6,8] | ['720p','1080p'] | 8 |
   | gemini-omni-flash-preview | true | 10 | false | true | false | true | [1..10] | [] | null |
   | gpt-image-2 (image) | true | 10 | false | false | false | true | [] | [] | null |
   | grok.imagine-video | true | 6 | false | false | false | false | [6,10] | ['480p','720p'] | null |

   Cross-check every value against the provider adapters
   (`native-media-gateway/*Provider.js` validation code) before writing —
   adapters are the runtime truth. Where this table and an adapter disagree, the
   adapter wins; record the discrepancy in execution-log.
   For image models, `referenceImages` = existing `maxReferences`.
2. Add accessor + zeroed default:
   ```js
   const EMPTY_CAPABILITIES = Object.freeze({ imageInit:false, referenceImages:0,
     lastFrameInput:false, videoInput:false, audioToggle:false,
     aspectRatioControl:false, durationsSeconds:[], resolutions:[],
     refsForceDurationSeconds:null });
   export function getModelCapabilities(modelId) {
     return nativeModelById(modelId)?.capabilities || EMPTY_CAPABILITIES;
   }
   ```
3. Convert existing helpers into thin wrappers where trivially safe:
   `getMaxImagesForI2VNative` (native branch → `1 + caps.referenceImages`),
   `nativeVideoReferencesEnabled` (→ `caps.referenceImages > 0`, keep the grok
   special-case exactly as-is if it differs). Do NOT sweep VideoStudio for all
   `supportsLastFrame`/`supportsAudioToggle` reads — leave working reads alone;
   new code (slices 06+) must use the accessor.
4. Contract test `tests/nativeCapabilityContract.test.js`:
   - For each native model, assert `capabilities` agrees with
     `NATIVE_CAPABILITY_CONSTRAINTS` (client) AND with the gateway's
     `CAPABILITY_CONSTRAINTS` (import `native-media-gateway/exports.js`
     directly, as existing gateway tests do): durations, resolutions,
     ref caps, aspect ratios.
   - Assert every `NATIVE_MODEL_IDS` entry has a `capabilities` block with all
     nine keys and correct types (schema guard against future model additions).
5. Update `tests/fixtures/nativeContract.js` if it needs the new block to stay
   the single pinned contract.

## Do not

- No behaviour changes in studios or gateway. This slice is metadata + tests.
- Do not remove or rename any existing catalog field.

## Acceptance criteria

- Contract test green; whole suite green; `build:studio` green.
- `getModelCapabilities` exported and covered.
- Diff limited to `nativeModels.js`, test files, fixtures.
