# Merlin Studio — Execution Plan

Author: Fable (senior architect pass, 2026-07-02).
Executors: GPT 5.5 High (orchestrator + backend/architecture coder), GLM 5.2 (frontend coder), Gemini 3.5 Flash (spare).
Karim reviews at the end of each phase gate; Fable returns at the audit step,
end of Phase 1, and final review.

**PLAN STATUS: `FINAL — PHASE 1 APPROVED + GATE A CORRECTION APPROVED` (Fable, 2026-07-02: Gate A reached, not signed off; root causes investigated and correction slices C0-C3 + Gate A2 defined in `gate-a-correction-plan.md` — execute those before slice 03)**
(Only Fable updates this line. Executors: if the status is not
`FINAL — PHASE 1 APPROVED` or later, do not write any code.)

## Orchestration sequence (GPT 5.5: follow this exactly)

This is the master sequence. Karim should never have to re-explain it.

1. **Adversarial audit (GPT 5.5, first session).**
   Follow `adversarial-audit-prompt.md` in this folder, to the letter. Output
   goes to `audit/gpt55-audit-report.md`. Write the report, update nothing
   else, stop. No coding, no plan edits.
2. **Fable verifies the audit (Karim runs Fable, extra-high thinking).**
   Fable reads the report, verifies findings against source (not at face
   value), folds accepted findings into the plan docs, discards the rest with
   one-line reasons appended to the audit report under `## Fable adjudication`,
   and updates PLAN STATUS to `FINAL — PHASE 1 APPROVED`.
3. **Execution bookkeeping, then Phase 1 (GPT 5.5 orchestrates).**
   a. Create `task-list.md` in this folder: every slice broken into its doc's
      numbered steps as checkboxes, grouped by phase, plus the gate rows.
      Create `execution-log.md` (append-only). Keep both current — tick tasks
      as they complete, log every deviation. These two files are the state;
      any fresh session reads README → task-list → execution-log and knows
      exactly where things stand.
   b. Execute slices 00 → 01 → 02 (00 and 01 may run in parallel) using
      subagents, following each slice doc EXACTLY as prescribed — executors
      implement, they do not redesign (see Global rules). Apply the review
      protocol in `99-verification-and-regression.md` §3 to every slice.
   c. Gate A: stop. Karim tests on 19400 per `99` §4. Only on his sign-off run
      slice 03 (rebrand → merge to main → systemd hosting on 19300). Karim
      then verifies 19300.
4. **End of Phase 1 — mandatory stop.**
   When slice 03 is complete and 19300 is verified: STOP. Update task-list and
   execution-log, set PLAN STATUS to `PHASE 1 SHIPPED — AWAITING FABLE PHASE 2
   REVIEW`, and hand back to Karim. Fable then re-reviews
   `02-target-architecture.md` and slices 04-11 against Phase 1 learnings
   (especially the slice 00 browser findings) and sets PLAN STATUS to
   `FINAL — PHASE 2 APPROVED`.
5. **Phase 2 (GPT 5.5 orchestrates, same pattern).**
   Slices 04-11 on `feature/merlin-studio-v1`, tested on 19400 only, gates B/C
   as checkpoints (no main merges), Gate D → Fable final review → single merge
   to main + 19300 redeploy per slice 03 §C step 5.

## What this is

A slice-by-slice plan to take the Open-Generative-AI fork from its current state
(feature branch `feature/omni-v1-adjacent-controls`, two known bugs, several working
new features) to **Merlin Studio**: a personal creative production portal with
projects, storyboards, reusable references, uploads library, continuity chaining,
and prompt templates — layered over the existing native media gateway without
breaking any working provider path.

All design decisions are already made in these documents. Executors implement;
they do not redesign. If a slice document contradicts reality (file moved, line
drifted), the executor adapts mechanically and notes the drift in the PR/commit
message — they do not invent new architecture.

## Read order

| Doc | Who must read it |
|---|---|
| `00-README.md` (this) | everyone, every session |
| `01-current-architecture.md` | everyone, once per session working on any slice |
| `02-target-architecture.md` | everyone, once per session working on slice 04+ |
| `slice-XX-*.md` | the executor + reviewer of that slice only |
| `99-verification-and-regression.md` | every executor before claiming a slice done; every reviewer |
| `adversarial-audit-prompt.md` | GPT 5.5, orchestration step 1 only |
| `task-list.md` + `execution-log.md` | everyone, every session (created at orchestration step 3a) |
| `90-future-work-outline.md` | nobody yet — future planning input only |

Do NOT read `feature-dev/_archive/` or the two research folders. Everything
needed from them is already distilled into these documents.

## Phases (operating model)

**Phase 1 — Stabilise & Ship (slices 00-03).** Fix everything already built on
the current feature branch (handoff bug, gateway hygiene, naming UI), rebrand to
Merlin Studio, merge to `main`, and host `main` as a **systemd-managed
production app on port 19300**. From that moment 19300 is Karim's daily app.

**Phase 2 — Merlin Studio features (slices 04-11).** Cut a fresh branch
`feature/merlin-studio-v1` from the merged main. ALL feature work happens there,
tested exclusively on **19400** (dev server + its own dev gateway instance).
`main` and 19300 are NOT touched during Phase 2 — no merges, no restarts, no
config changes. Phase 2 merges back to `main` exactly once, at the final gate,
after Karim declares it working.

## Slice index and order

Slices are strictly ordered unless marked parallel-safe. A slice starts only when
its preconditions (listed in its doc) are met.

| Phase | # | Slice | Assignee | Depends on |
|---|---|---|---|---|
| 1 | 00 | Image→Video handoff fix + browser test harness | GPT 5.5 (diagnosis+fix), GLM (UI warning strip) | — |
| 1 | 01 | Gateway hygiene: tombstone fix, rename endpoint, frame-to-asset endpoint | GPT 5.5 | — (parallel-safe with 00) |
| 1 | 02 | Naming/rename UI on generated cards | GLM 5.2 | 01 |
| 1 | 03 | Phase 1 ship: rebrand + merge to main + systemd hosting on 19300 | GPT 5.5 | 00, 01, 02 verified |
| 2 | 04 | Model capability flags — single source + contract test | GPT 5.5 | 03 |
| 2 | 05 | Projects sidecar store + gateway API | GPT 5.5 | 03 (parallel-safe with 04) |
| 2 | 06 | Uploads / media library tab | GLM 5.2 | 04, 05 |
| 2 | 07 | References library + @tag prompt composer | GPT 5.5 (composer+store), GLM (UI) | 05 |
| 2 | 08 | Storyboard board UI (projects/scenes/shots) | GLM 5.2 | 05, 07 |
| 2 | 09 | Reference-aware generation + variants | GPT 5.5 | 04, 07, 08 |
| 2 | 10 | Continuity: last frame → next shot first frame | GPT 5.5 + GLM | 01, 09 |
| 2 | 11 | Prompt templates (markdown) | GLM 5.2 (backend part is trivial; GLM does both) | 05 |

Gates (Karim tests manually before proceeding):
- **Gate A** (end of Phase 1, tested on 19400): slices 00-02 verified → slice 03
  ships main to 19300 under systemd.
- **Gate B** after slice 06 — checkpoint on 19400 only. No main merge.
- **Gate C** after slice 09 — checkpoint on 19400 only. No main merge.
- **Gate D** after slice 11 — Fable returns for final review, THEN the single
  Phase 2 merge to main + 19300 redeploy.

## Ports, branches, hosting

| Surface | Branch | How it runs | Who touches it |
|---|---|---|---|
| **19300** (daily app) | `main` | systemd user services (`studio-portal.service` + `studio-gateway.service`, defined in slice 03), production build | Only slice 03 (Phase 1 ship) and the final Gate D redeploy. Nothing else, ever. |
| **19400** (dev/test) | Phase 1: `feature/omni-v1-adjacent-controls` → Phase 2: `feature/merlin-studio-v1` | `next dev --port 19400` + dev gateway on **19335** with `NATIVE_MEDIA_PROJECTS=1` | All slice work and Karim's gate testing |
| e2e harness | per-branch | ephemeral ports 19488 (app) / 19489 (gateway), temp `NATIVE_MEDIA_ROOT` | Playwright only |

The shared real media store (`NATIVE_MEDIA_ROOT` → `.native-media`) is used by
BOTH gateways (prod 19334, dev 19335). This is intentional: real history is
visible while developing. The Phase 2 dev gateway writes new subdirectories
(`projects/`, `prompt-templates/`) that main's code never reads — safe by
design. Job/asset writes go through the same atomic single-file queue per
process; avoid running real generations on both gateways simultaneously.

## Global rules (non-negotiable)

1. **No fake media as success.** A user-facing generation either produced a real
   provider output or fails visibly. Never stub, never placeholder. (Fake mode
   exists for vertex/codex/grok video in tests only — never with live flags on.)
2. **Preserve list** — these must keep working after every slice; the regression
   checklist in `99-verification-and-regression.md` is run per slice:
   Omni video, Grok video, Nano Banana 2/Pro image, Codex image, Veo video,
   prompt copy, delete + batch delete, history hydration, last-frame download,
   existing `.native-media` assets, shared `NATIVE_MEDIA_ROOT`.
3. **Never touch `.native-media` contents destructively.** New feature data goes
   in NEW subdirectories (`projects/`, `prompt-templates/`). Never modify
   `jobs.json` schema for existing fields; only ever add optional fields.
4. **Metadata, not media.** Projects/references point at existing assets by
   `assetId`/`jobId`. Never copy media files. Deleting project metadata never
   deletes media; deleting media flips references to a visible `missing` state.
5. **Additive UI.** New actions on generated cards are added; existing actions
   (copy prompt, download, delete, fullscreen, use-as-reference) are never
   removed or reordered.
6. **Worktrees/ports:** feature work runs in `/home/k8r1m/Open-Generative-AI`
   (port 19400, `next dev`). `/home/k8r1m/Open-Generative-AI-main-19300` is the
   clean main comparison (port 19300) — never point it at the feature worktree,
   never merge unverified WIP into `main`.
7. **Tests:** behaviour is proven with real interaction tests (Playwright harness
   from slice 00) and node:test unit tests. Regex-over-source tests (the existing
   `tests/native*.test.js` style) are wiring guards only — they are NEVER
   acceptable as the sole proof that a UI behaviour works. They stay green but
   new behaviour requires a behavioural test.
8. **Build check:** `npm run build:studio` must pass before any slice is declared
   done. `npm run lint` is currently unusable (interactive ESLint prompt) — skip it.
9. **Commit discipline:** one slice = one branch `slice/NN-short-name` cut from
   the integration branch (see slice 03 for branch strategy), small commits,
   commit messages reference the slice doc. No drive-by refactors.
10. **When blocked or when reality contradicts the plan:** stop, write findings
    to `feature-dev/merlin-studio-plan/execution-log.md` (append-only), and
    surface to Karim. Never silently improvise a different architecture.

## State files

Created at orchestration step 3a, maintained by the orchestrator:
- `task-list.md` — single source of truth for progress. Every slice's numbered
  steps as checkboxes, grouped by phase, gates as explicit rows. Tick on
  completion, never silently drop. After each task, re-read the list and pick
  the next un-ticked item in the current phase — no freelancing.
- `execution-log.md` — append-only: date, slice, what was done, deviations from
  the slice doc, review verdicts, open questions. This is the handover spine
  between agent sessions.

Any fresh session bootstraps with: README (this file, note PLAN STATUS) →
`task-list.md` → `execution-log.md` → the slice doc for the next un-ticked task.
