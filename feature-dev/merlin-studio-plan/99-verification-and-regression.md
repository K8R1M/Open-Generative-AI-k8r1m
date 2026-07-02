# Verification Protocol + Regression Checklist

Applies to EVERY slice. The executor runs it before claiming done; the reviewer
re-runs the relevant parts independently. Results pasted into
`execution-log.md` per slice.

## 1. Build + suites

```
npm run build:studio                # must pass
node --test tests/<each touched/new test file>   # all green
# plus the standing core set (fast, always run):
node --test tests/nativeGatewayServer.test.js
node --test tests/nativeGatewayLibrary.test.js
node --test tests/nativeModelCatalog.test.js
node --test tests/nativeMediaLibraryClient.test.js
node --test tests/nativeMediaLibraryServer.test.js
node --test tests/nativeSchedulerRecovery.test.js
node --test tests/nativeStartupRecovery.test.js
npx playwright test                 # from slice 00 onward
```
Never run tests against the real `.native-media` — every test creates its own
`NATIVE_MEDIA_ROOT` temp dir. If you see the real root in a test env, stop.

## 2. Regression checklist (the Preserve list, made concrete)

Manual OR e2e-covered per slice; tick each with evidence (spec name or manual
note):

| # | Check | How |
|---|---|---|
| R1 | Image Studio: Nano Banana 2/Pro + Codex image generation reach the gateway and history shows the card | e2e fake-mode is NOT available for image models (fail-closed) — verify request construction via `page.route` intercept asserting a well-formed POST, plus unit tests. Live spot-check is Karim's at gates. |
| R2 | Video Studio: Veo/Omni/Grok request construction unchanged (task, parameters, inputs shapes) | intercept-assert e2e + existing unit suites |
| R3 | History hydration after reload (both studios) — cards reappear from `/library` | e2e |
| R4 | Prompt copy button copies the original prompt | e2e |
| R5 | Delete + batch delete remove card and server asset (tombstone), survive restart | e2e + slice 01 tombstone test |
| R6 | Last-frame download still streams an attachment | e2e download event |
| R7 | Image→Image and Image→Video reference handoffs work from a card | slice 00 specs |
| R8 | Existing `.native-media` assets untouched: after any slice's test runs, `git status` shows no repo changes outside the slice diff AND the real store root's file count/mtimes unchanged (`find .native-media -newer <marker> | wc -l` == 0 for non-log paths) | manual command, paste output |
| R9 | `NATIVE_MEDIA_ROOT` still shared/honoured (gateway boot log line shows the right root) | manual, gateway log |
| R10 | With `NATIVE_MEDIA_PROJECTS`/`NEXT_PUBLIC_STUDIO_PROJECTS` unset, the app is byte-identical in behaviour to pre-slice-05 (tabs hidden, routes 404) | e2e flag-off smoke |

## 3. Review protocol (for the reviewer agent)

For each slice, the reviewer (GPT 5.5 reviews GLM's slices; GLM or a fresh GPT
session reviews GPT's — never self-review a diff in the same session that wrote
it):

1. Read the slice doc, then the FULL diff (`git diff <base>...slice/NN-*`).
2. Check diff containment: every changed file is in the slice's “diff limited
   to” list. Anything else → reject.
3. Check design conformance against `02-target-architecture.md` (schema shapes,
   enums, route contracts, naming, flag gating). Quote doc section per finding.
4. Adversarial pass, minimum questions:
   - What happens on gateway restart mid-operation?
   - What happens when the underlying asset/job is deleted?
   - What happens with the feature flags off?
   - Does any code path fabricate media or success?
   - Any state written from a stale closure? Any impure setState updater?
   - Any new fetch not going through the documented client layer?
5. Run §1 commands yourself; run the slice's e2e twice (flake check).
6. Verdict in `execution-log.md`: APPROVE or CHANGES with file:line items.
   Two CHANGES rounds max, then escalate to Karim.

## 4. Karim's gate script (manual)

Pre-flight for every manual gate on 19400: run
`native-media-gateway/bin/check-fresh.sh 19335`, verify the 19400 app process env
contains `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335`, and record both in
`execution-log.md` before testing.

All gate testing happens on **19400**. 19300 (systemd, main) is only touched at
the end of Gate A (first deploy, slice 03) and after Gate D (final redeploy).

Gate A (post slice 02, ends Phase 1): handoff from a real generated image →
Video Studio ×3 with model changes in between; ONE real generated-image → Grok
Imagine video generation (exercises the slice 01 §D adapter change on the live
path); rename a card; name-at-generate; restart dev server; everything
persists. Sign-off triggers slice 03: rebrand + merge to main + systemd hosting
on 19300. Then verify 19300: loads, history
intact, one real generation, survives `systemctl --user restart`.
Gate B (post 06, on 19400 only): library tab shows real history + uploads;
send-to-studio; extract-last-frame appears in library. No main merge.
Gate C (post 09, on 19400 only): build a 2-scene project with a character
reference, generate a real Omni/Veo shot from the board, pin variant. No main
merge.
Gate D (post 11): full flow on 19400 — template → prompt → generate → chain
last frame → next shot → generate. Then Fable final review → the single Phase 2
merge to main → rebuild + `systemctl --user restart studio-gateway
studio-portal` → verify 19300.
