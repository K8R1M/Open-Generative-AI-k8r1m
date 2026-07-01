# Open Generative AI Feature Development

This folder tracks app feature-development rounds for this fork.

Use it before starting a new feature branch:

1. Record what is already done and tested.
2. Record the next requested features before entering planning mode.
3. Create one subfolder per feature round, then keep that round's plans, reviews, handoffs, test notes, and merge notes inside it.
4. Run feature branches on `19400` for testing, then merge back to `main` and the systemd `19300` app when verified.

## Required Feature Workflow

Before any coding starts:

1. Clarify the requested features.
   - Understand exactly what the user wants.
   - Understand how the user expects to use each feature.
   - Ask questions to clear ambiguity before planning.

2. Refresh code understanding.
   - Refresh Graphify before planning: `graphify update . --force`.
   - Use `graphify query` first, then narrow `rg`, `sed`, and `nl` reads.
   - Trace how the code actually works end to end.
   - Identify every file, API, state path, provider path, UI path, and test surface that should be touched.
   - Identify adjacent working behavior that must not be touched or broken.

3. Trace local skills, scripts, libraries, and server tools.
   - Find the relevant skills, scripts, wrappers, providers, and installed libraries already on the server.
   - Read how they work now before using or changing them.
   - Prefer the currently working app integration path over a new duplicate path.

4. Read official documentation where needed.
   - Use official docs for provider APIs, SDK behavior, CLI behavior, auth, file formats, and framework behavior.
   - Do not guess behavior or plan from assumptions.
   - Verify any external fact that affects architecture, provider calls, security, or user-visible behavior.

5. Delegate research to subagents.
   - Research should be done by separate subagents where practical.
   - Keep the main orchestrator context free for routing, synthesis, folder organization, and final plan assembly.
   - Store research outputs in the feature round subfolder before planning.

6. Make the plan in GPT-5.5 high or extra-high planning mode.
   - The plan must cover implementation, regression risks, verification gates, rollback/recovery, docs/state updates, and merge/testing flow.
   - The plan must explicitly preserve existing working features.

7. Audit the plan adversarially with Multica.
   - Required auditors by exact Multica agent name:
     - `GLM 5.2 - Opencode`
     - `Gemini 3.5 Flash High - General`
   - Do not substitute `OMX Gemini 3.5 Flash High - Coder`, `OMX Gemini 3.5 Flash High - Reviewer`, `OMX Gemini 3.5 Flash High - QA`, or any other OMX Gemini agent when this workflow asks for Gemini 3.5 Flash General.
   - If the exact `Gemini 3.5 Flash High - General` agent fails at runtime, report that failure and retry that exact agent only if Karim asks; do not silently swap in another Gemini agent.
   - Optional additional auditor: Grok 4.3 via Multica.
   - Audits must look for missing requirements, contradictions, omissions, inaccuracies, weak assumptions, bad architecture, duplicate paths, unclear boundaries, and regression risk.

8. Verify audit findings before amending the plan.
   - GPT-5.5 must not accept audit findings at face value.
   - Check the code, docs, and evidence for each material finding.
   - Amend the plan only with verified findings that improve correctness or safety.

9. Stop before execution.
   - Prompt Karim to switch the session into plan mode for extra-high planning if not already there.
   - Do not start coding until Karim confirms the preferred coding agents for that run.
   - Default coding agents are GPT-5.5 medium native `executor` subagents.
   - Karim may choose GLM 5.2 OpenCode or Composer 2.5 coding agents if available.
   - GPT-5.5 high native `code-reviewer` agents should review execution output before merge eligibility.

Standing rules:

- Do not break already-working native media paths while adding features.
- Keep `.native-media` stable across branches and merges; deleted assets should be actually removed server-side.
- Keep planning and run artifacts here instead of scattering them across the repo.
- Do not hand back a feature for testing with unrelated existing features disabled, fake-completed, or silently degraded.

Current baseline:

- `main` has the native media library, prompt copy, delete, history hydration, native image/video provider fixes, and stable `.native-media` root handling merged.
- The production test target is the systemd app on `19300`.
- The next feature-development branch should be hosted on `19400` for user testing.

Next feature inbox:

- Add requested features here before creating the next round subfolder.
