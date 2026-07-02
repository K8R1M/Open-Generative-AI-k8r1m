# Slice 09 — Reference-Aware Shot Generation + Variants

Assignee: GPT 5.5 (generation flow, variant lifecycle), GLM 5.2 (variant strip UI).
Depends on: slices 04, 07, 08. Branch: `slice/09-shot-generation`.

## Goal

Generate from a shot card/panel using the promptComposer; every attempt is a
Variant with full provenance; results reuse the EXISTING generation pipeline
end-to-end (no new provider code, no gateway generation changes).

## Generation flow (frontend orchestration, in a new
`packages/studio/src/components/projects/useShotGeneration.js`)

1. Guard: shot.modelId set (else focus the model select with a hint), model is
   a native video or image model, prompt non-empty after compose.
2. Compose: `composePrompt({prompt: shot.prompt, project: doc, shot,
   modelCapabilities: getModelCapabilities(shot.modelId)})`.
3. Surface `warnings` BEFORE submitting: render as amber lines under the
   Generate button; require explicit user confirm when warnings include
   `refs-unsupported`, `first-frame-unsupported`, or any `missing-asset` (a
   “Generate anyway” second click). Truncation warnings inform only.
4. Create the variant optimistically in the doc:
   `newVariantDraft` → fields per schema (`promptResolved`, `promptRaw`,
   `parameters`, `inputs`, status `created`, `jobId: null` — the schema allows
   null jobId ONLY in this pre-submit state), `shot.status='generating'`,
   `shot.variantIds` append; `save()` immediately (not debounced — flush).
5. Call the EXISTING `generateNativeMedia({ modelId: shot.modelId, task:
   inputs-has-first-frame||refs ? 'image-to-video' : 'text-to-video' (image
   models: 'text-to-image'/'image-to-image' analogous — reuse the studios'
   existing task-choice logic, factor it into a small exported helper rather
   than duplicating), prompt: resolvedPrompt, parameters: {durationSeconds,
   aspectRatio, resolution?…} from shot+project defaults filtered by
   capabilities, inputs, displayName: `<project.title>-<shotCode>` sanitized,
   clientRequestId: variant.id })`.
   `clientRequestId = variant.id` gives idempotency + a deterministic
   variant→job correlation even if the response is lost.
6. On submit response: write `variant.jobId`, status from response; `save()`.
   On completion (the existing poller resolves): status `completed`,
   `assetId` from result url (`/api/native-media/v1/assets/<assetId>` — parse
   id), shot.status `generated`; failure → variant status/error/message, shot
   status `failed` (unless another variant is completed — then `generated`).
7. Refresh path (browser closed mid-poll): slice 05's `getProject` already
   refreshes non-terminal variant statuses from jobs.json on read — verify this
   covers the reload case in the e2e test.

Concurrency: one in-flight generation per shot (disable button while
`generating`); multiple shots may generate in parallel (gateway scheduler
queues per provider — already handled).

## Variant UI (GLM)

In `ShotDetailPanel` section 6:
- Vertical list, newest first: thumbnail/video preview, model label, status
  pill, createdAt, and on hover: “Pin” (sets `pinnedVariantId`), “Retry”
  (new variant from this variant's `promptRaw`+`parameters`+`inputs` — NOT
  recomposed; provenance-faithful), “Open in Library” (switch to library tab
  filtered — simple: just switch tab), “Copy resolved prompt”, “Delete variant”
  (metadata only, confirm; never deletes media; pinned → unpin first).
- Failed variants show the public `message` inline (never raw detail).
- Pinned variant drives the ShotCard thumbnail (already wired in slice 08 rules).

Card-level: ShotCard gets a “Generate” icon-button (bottom-right) when status
is draft/failed — same flow, no panel needed for quick iterations.

## Tests

- Unit: task-choice helper; variant lifecycle reducer-ish helpers in
  `projectsModel.js` (`applyVariantResult(doc, variantId, result)` — add it,
  keep effects out of components).
- e2e `tests/e2e/shot-generation.spec.js` (fake vertex video path, NO live
  flags): shot with prompt + @character-with-identity-asset + firstFrame →
  Generate → intercept the POST and assert: resolvedPrompt contains the
  snippet text, `inputs[0]` is the firstFrame asset role `first-frame`,
  reference asset present role `reference`, `clientRequestId` equals the new
  variant id → let the fake job complete → variant completed, shot
  `generated`, card thumbnail updates, reload → state persists.
- e2e: warnings path — model without refs support (grok is i2v-only; use a
  seeded capability edge or veo with flag off → refs-unsupported) requires the
  second confirm click.

## Do not

- No batch “generate all shots”, no compare grid (Phase 2), no camera params.
- No changes to `nativeMedia.js` polling or gateway generation code.
- Never auto-retry failed paid generations.

## Acceptance criteria

- Full provenance verifiable: for any completed variant, the doc alone tells
  you exactly what was sent (prompt, params, inputs) and what came back
  (jobId, assetId).
- e2e green; suite green; build green; regression checklist green (CRITICAL
  here: plain studio generation untouched — run the studio e2e specs).
