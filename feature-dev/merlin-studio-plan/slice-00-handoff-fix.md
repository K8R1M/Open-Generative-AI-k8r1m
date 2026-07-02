# Slice 00 — Image→Video Handoff Fix + Browser Test Harness

Assignee: GPT 5.5 (diagnosis confirmation + fix + harness). GLM 5.2 may take
step 6 (warning-chip UI) if run in parallel after step 5.
Depends on: nothing. Branch: `slice/00-handoff-fix` off `feature/omni-v1-adjacent-controls`.

## Goal

“Use as Video Studio input” on a generated image card reliably puts that image
into Video Studio as a visible, usable reference/first-frame — every time,
regardless of what model/state Video Studio was left in — proven by real
browser tests, not source regexes.

Decision taken (from the three options in the planning brief): **fix properly on
the feature branch**. The diagnosis below is strong, and the Playwright harness
is needed for all later slices anyway.

## Diagnosis dossier (read before touching code)

Prior attempts fixed source-level theories and passed regex tests while the live
app stayed broken. The mechanism has FOUR interacting defects. Confirm each in
the browser first (step 1), then fix all four together (they are one design flaw:
multiple uncoordinated writers of the same state).

**D1 — Mount-flush writer race with stale-closure model choice.**
On tab switch VideoStudio remounts. Two effects run in the same mount flush, in
definition order:
1. Persistence-load effect (`VideoStudio.jsx` ~703-751) — queues
   `setSelectedModel(persisted)`, `setImageMode(persisted)`, ref restores, and
   calls `applyControlsForModel(persistedModel,…)`.
2. Handoff-consumption effect (~985-996) — calls
   `appendGeneratedImageInputs(urls)` (~951-983), which decides model
   compatibility against `selectedModel` **from the initial render closure**
   (the default model, NOT the persisted one), possibly retargets, then queues
   its own state.
Because both run before any re-render, the compatibility decision is made
against a model that will not be the final model. Depending on what was
persisted (e.g. Omni selected, or imageMode=false), the final committed state is
a mixture: handoff refs present in `uploadedImageUrls`, but selected model /
imageMode / controls from the persisted state. The visible ref strip is gated by
`imageMode && getMaxImagesForI2VNative(selectedModel) > 2` (~1968), so the refs
can exist in state yet be invisible or rendered only via the scalar mirror.
This explains “worked once” (virgin localStorage) → “stopped working after a
model change” (persisted incompatible state now wins on every remount).

**D2 — Dual scalar/list state with impure updaters.**
`uploadedImageUrl` (scalar) mirrors `uploadedImageUrls[0]`, and is written
*inside* `setUploadedImageUrls(prev => …)` updaters at ~974-978
(`appendGeneratedImageInputs`) and ~1194-1198 (`trimImageRefs`). Updaters must
be pure; 19400 runs `next dev` (App Router → React StrictMode), which
double-invokes updaters and can discard render passes — the scalar can desync
from the list. The single-slot UI branch (~2027+) renders from the scalar, so a
desync = invisible reference.

**D3 — Silent-failure consumption contract.**
The consumption effect removes the sessionStorage key only when
`appendGeneratedImageInputs` returns true. If the payload's urls fail
`isSameOriginAssetUrl` filtering, or JSON parsing throws, the key silently stays
(or the handoff silently no-ops) with no user-visible signal — indistinguishable
from “the feature is broken”.

**D4 — Capability-gated hiding.**
`handleModelSelect` (~1191-1250) clears or trims refs on model switch, and the
strip render gate hides refs entirely for ≤2-max models even when refs exist.
User-visible truth diverges from state.

## Steps

1. **Reproduce in the browser first (mandatory, before any fix).**
   Set up the Playwright harness (step 2) and write a failing spec
   `tests/e2e/handoff-repro.spec.js` with these scenarios (each seeds
   localStorage via `addInitScript` before load):
   a. Virgin storage → generate/seed an image card → click “Use as Video Studio
      input” → EXPECT visible ref thumbnail in Video Studio.
   b. PERSIST_KEY seeded with `{selectedModel:'native.vertex.gemini-omni-flash-preview', imageMode:false}`
      → same click path → EXPECT visible ref thumbnail.
   c. As (b) then change model via dropdown to `native.vertex.veo-3.1`, then back
      to Image Studio, hand off again → EXPECT visible ref thumbnail.
   Seeding an image card WITHOUT live providers: pre-populate the fixture
   `NATIVE_MEDIA_ROOT` with a completed fake job + asset (copy the pattern from
   `tests/nativeGatewayLibrary.test.js` fixtures) so ImageStudio history
   hydrates a native card via `/library`. Record which scenarios fail and how in
   `execution-log.md`. If all three pass on the unfixed branch, STOP — the
   diagnosis is wrong; report to Karim before proceeding.
2. **Playwright harness** (see `02-target-architecture.md` §9):
   `npm i -D @playwright/test`; `playwright.config.js` with `webServer` starting
   both the gateway (`node native-media-gateway/server.js` with
   `NATIVE_MEDIA_ROOT=<tmp fixture>`, `NATIVE_MEDIA_PROJECTS` unset, no live
   flags) and `next dev --port 19488`; `NATIVE_MEDIA_GATEWAY_URL` env pointed at
   the test gateway port (pick 19489). Add npm scripts `test:e2e`, `test:unit`.
   The harness must not touch the real `.native-media` (assert the root differs).
3. **Fix D2:** delete the `uploadedImageUrl` useState in `VideoStudio.jsx`;
   replace with derived `const uploadedImageUrl = uploadedImageUrls[0] ?? null;`
   Update every `setUploadedImageUrl(...)` call site: setting scalar+list →
   set list only; `clearImageUpload`-style sites set `[]`. Persistence: keep
   writing `uploadedImageUrl` into the saved blob for backward compat, but load
   only `uploadedImageUrls` (fall back to `[uploadedImageUrl]` if list absent —
   logic already exists ~719-725).
4. **Fix D1 + D3:** restructure per `02-target-architecture.md` §7:
   - Persistence-load effect becomes the single mount-time writer: restore into
     locals → synchronously read+delete the sessionStorage handoff payload →
     compute final model (handoff present: current-or-retargeted compatible
     model using the *restored* model as the starting point; else restored
     model) → apply all state in one pass → `hasRestored.current = true`.
   - Rewrite `appendGeneratedImageInputs` as a pure helper
     `planReferenceHandoff({urls, currentModelId, capabilitiesLookup})` →
     `{modelId, modelName, imageMode:true, urls, warnings}` (no setState inside;
     unit-testable). The effect/pipeline applies the plan.
   - The nonce-driven effect (already-mounted case) is gated on
     `hasRestored.current` and reads current model from a `selectedModelRef`
     kept in sync via a small effect. Payload deleted from sessionStorage BEFORE
     applying; failures toast + console.error (D3). Delete-then-apply, never
     keep-on-false.
5. **Fix D4:** in `handleModelSelect`, never `clearImageRefs()` on i2v-capable→
   non-capable switches — trim to capability max but keep at least the list
   intact when the target has `imageInit`; if target has no image input at all
   (pure t2v), keep `uploadedImageUrls` in state, hide nothing, and show the
   warning chip (step 6). Generation payload building already ignores refs for
   non-supporting models — verify and leave that as the enforcement point.
6. **Warning chip UI (GLM-able):** in the bottom bar, when
   `uploadedImageUrls.length > 0` and the selected model can't consume them
   (`!capabilities.imageInit`), render the thumbnail strip anyway plus a small
   amber chip: `“<label> won't use reference images”` with an ✕-all button.
   Match existing Tailwind idiom in the file.
7. **Tests to finish green:**
   - The three repro specs (now passing) + a spec asserting the generation
     request (intercept `POST /api/native-media/v1/generations` via
     `page.route`) includes `inputs[0].role === 'first-frame'` with the handed-off
     asset after scenario (b).
   - Unit tests for `planReferenceHandoff` (compatible model kept; incompatible
     retargets to first multi-ref i2v native model; empty/filtered urls →
     `{warnings:['no-usable-urls']}` and no state plan).
   - Existing regex tests: update the ones that pin the old code shapes
     (`nativeVideoStudioWiring.test.js`, `nativeImageStudioReferenceState.test.js`)
     minimally so they describe the new shapes. Do not delete tests.
   - `npm run build:studio` passes.
8. **Manual gate:** Karim tests on 19400 (restart via the usual dev-server
   restart; do not touch 19300). Only he can declare this slice done.

## Do not

- Do not migrate the handoff to context/props-only transport (remount model
  makes sessionStorage the right transport; the fix is deterministic consumption).
- Do not refactor unrelated VideoStudio state (prompt, v2v, history…).
- Do not touch ImageStudio's own (working) consumption path except to reuse the
  same delete-before-apply contract if trivially applicable.
- Do not add state libraries.

## Acceptance criteria

- All e2e specs pass headless; scenarios a-c pass repeatedly (run ×3).
- Handing off with ANY persisted model/mode state results in visible refs and
  correct model within one paint (no flicker of the wrong state).
- No `setUploadedImageUrl` state setter exists in the file.
- Regression checklist (99-doc) passes; Omni/Grok/Veo/Nano/Codex generation
  untouched (`git diff` limited to: `VideoStudio.jsx`, warning-chip styles,
  `StandaloneShell.js` only if payload gains `handoffId`, new test files,
  `package.json` devDeps/scripts, `playwright.config.js`).
