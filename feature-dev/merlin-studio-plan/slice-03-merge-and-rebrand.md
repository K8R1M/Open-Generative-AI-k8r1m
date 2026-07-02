# Slice 03 — Phase 1 Ship: Rebrand, Merge to Main, systemd Hosting on 19300

Assignee: GPT 5.5. Depends on: slices 00, 01, 02 verified by Karim (Gate A).
This slice ends Phase 1: after it, 19300 is Karim's stable daily app and all
further work moves to the Phase 2 branch on 19400.

## A. Rebrand → Merlin Studio (do BEFORE the merge, on the feature branch)

User-visible name becomes **Merlin Studio**. Internal identifiers (workspace
package `studio`, env var names, repo folder) unchanged.

Exact edit list (verified current locations):
| File | Change |
|---|---|
| `components/StandaloneShell.js:341-348` | wordmark text `OpenGenerativeAI` → `Merlin Studio`; replace logo SVG (see logo note) |
| `components/ApiKeyModal.js:42` | fallback title → `Merlin Studio` |
| `app/layout.js:10-11` | title `Merlin Studio — AI Image & Video Studio`; description: keep factual, drop "Free"/model-name marketing list, e.g. `Merlin Studio — personal AI image and video production portal.` |
| `app/studio/[[...slug]]/page.js:4` | `Studio — Merlin Studio` |
| `app/workflow/[id]/page.js:4` + `app/workflow/[id]/[tab]/page.js:4` | `Workflow — Merlin Studio` |
| `app/agents/layout.js:7`, `app/agents/[agent_id]/page.js:14`, `app/agents/[agent_id]/[conversation_id]/page.js:13` | `Agent Chat — Merlin Studio` |
| `packages/studio/src/components/McpCliStudio.jsx:76` | prose mention → `Merlin Studio` |
| `electron/main.js:34` | window title → `Merlin Studio` |
| `index.html:7,9` (vite/electron shell) | title/description → Merlin Studio equivalents |
| `package.json:40` `productName` | `Merlin Studio` |
| `package.json:93` maintainer | `Merlin` |

Also remove the Vadoo promo banner block in `StandaloneShell.js` (~314-335 and
its `showVadooBanner` state ~75-78, localStorage key) — third-party ad, not part
of Karim's portal.

Logo note: replace the inline layers-icon SVG in the shell header with the
Merlin brand mark (gold on midnight). If no SVG asset is provided in
`public/assets/` by Gate A, use a text-only wordmark: `Merlin` in bold +
`Studio` in white/60, no icon, and flag in execution-log for Karim to supply
the mark. Do NOT invent a logo. Add `app/icon.svg` only if the brand SVG is
supplied.

Grep-verify completion:
`grep -rn "Open Generative AI\|OpenGenerativeAI" --include="*.js" --include="*.jsx" --include="*.html" --include="*.json" app/ components/ packages/ electron/ index.html package.json`
→ remaining hits must be non-user-visible (repo URLs, LICENSE, README history)
and listed in execution-log. README.md intentionally NOT rebranded (fork
provenance) — leave as-is.

## B. Merge gate to main

Preconditions (verify each, record in `execution-log.md`):
- Gate A manual sign-off from Karim on 19400 (slices 00-02 + rebrand).
- Full unit suite green per-file; e2e suite green ×2 consecutive runs;
  `npm run build:studio` green; regression checklist (99-doc) executed.

Procedure:
1. Confirm `main` (visible in `/home/k8r1m/Open-Generative-AI-main-19300`) has
   no commits beyond the feature branch's merge-base (`git merge-base` check).
   If it does, stop and report.
2. Merge with history preserved:
   `git checkout main && git merge --no-ff feature/omni-v1-adjacent-controls`.
3. Update the main worktree: in `/home/k8r1m/Open-Generative-AI-main-19300`,
   `git checkout main && git pull` (or update the worktree ref — it's the same
   local repo; use `git -C … merge --ff-only` as appropriate to bring the
   worktree to the new main).

## C. systemd hosting on 19300 (production, replaces the ad-hoc dev process)

Two user-level units in `~/.config/systemd/user/` (linger is already enabled on
this machine). Before writing them, capture how the CURRENT gateway process is
run (`ps aux | grep native-media-gateway`; env via `tr '\0' '\n' </proc/<pid>/environ`)
— the unit must reproduce its env exactly (NATIVE_MEDIA_ROOT, all
`NATIVE_MEDIA_LIVE_*=1` flags, `NATIVE_MEDIA_ALLOW_GOOGLE_APPLICATION_CREDENTIALS`
if set, port 19334). Record the captured env (redact nothing here — it's flags
and paths, no secrets; secrets live in `.native-media/.env` which the python
wrappers read themselves).

`studio-gateway.service`:
```ini
[Unit]
Description=Merlin Studio native media gateway (main, 19334)
After=network.target

[Service]
WorkingDirectory=/home/k8r1m/Open-Generative-AI-main-19300
ExecStart=/usr/bin/env node native-media-gateway/server.js
Environment=NATIVE_MEDIA_GATEWAY_PORT=19334
# + the captured NATIVE_MEDIA_* env lines here
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

`studio-portal.service` (production build, not dev mode):
```ini
[Unit]
Description=Merlin Studio portal (main, 19300)
After=studio-gateway.service
Wants=studio-gateway.service

[Service]
WorkingDirectory=/home/k8r1m/Open-Generative-AI-main-19300
ExecStart=/usr/bin/env node node_modules/.bin/next start --hostname 127.0.0.1 --port 19300
Environment=NODE_ENV=production
Environment=NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19334
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

Deploy steps:
1. In the main worktree: `npm run build:packages && npm run build`
   (full Next production build; `next start` requires it). If the production
   build fails on issues dev mode tolerated, fix forward on main ONLY for
   build-blocking errors, minimally, and note each in execution-log.
2. Keep binding `127.0.0.1` (current dev binding — access pattern unchanged).
   If Karim wants direct Tailscale access later, that's a one-line change; flag
   it as an open question in execution-log, don't decide it.
3. Kill the old ad-hoc `next dev … 19300` and gateway processes; then
   `systemctl --user daemon-reload && systemctl --user enable --now
   studio-gateway.service studio-portal.service`.
4. Verify: `systemctl --user status` both green; app loads on 19300; library
   hydrates (real history visible); one real generation spot-check by Karim;
   `journalctl --user -u studio-portal -n 50` clean; reboot-survival note
   (linger) recorded.
5. Redeploy procedure (documented for Gate D, not run now): merge → `npm run
   build:packages && npm run build` in main worktree → `systemctl --user
   restart studio-gateway studio-portal`.

## D. Open Phase 2

1. In the feature worktree `/home/k8r1m/Open-Generative-AI`:
   `git checkout -b feature/merlin-studio-v1 main`.
2. Dev runtime for Phase 2 on 19400 (document in execution-log; a small
   `scripts/dev-19400.sh` committed to the branch is welcome):
   - dev gateway: `NATIVE_MEDIA_GATEWAY_PORT=19335 NATIVE_MEDIA_PROJECTS=1
     <captured live flags> node native-media-gateway/server.js` (feature
     worktree code, same shared `NATIVE_MEDIA_ROOT`);
   - app: `NATIVE_MEDIA_GATEWAY_URL=http://127.0.0.1:19335
     NEXT_PUBLIC_STUDIO_PROJECTS=1 next dev --port 19400`.
3. **Standing policy from here to Gate D: `main`, 19300, and the two systemd
   units are frozen. No merges, no restarts, no edits from Phase 2 work.**

## Tests / acceptance

- e2e smoke: header shows “Merlin Studio”; no Vadoo banner; tab bar intact.
- `npm run build:studio` + full suites green before merge; production build
  green on main.
- 19300 served by systemd, survives `systemctl --user restart`, real history
  intact; Karim sign-off.
- `feature/merlin-studio-v1` created; 19400 dev stack (app + 19335 gateway)
  running and documented.
