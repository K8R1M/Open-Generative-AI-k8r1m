# Prompt For Grok 4.3: Adversarial Audit Of Native Grok Imagine Video Provider Plan

You are Grok 4.3 acting as an adversarial architecture reviewer. Audit the plan for adding a native server-side Grok Imagine video provider to `/home/k8r1m/Open-Generative-AI`.

Do not edit production code. Do not implement the feature. Produce a Markdown audit report only.

Read these files first:

- `/home/k8r1m/Open-Generative-AI/docs/plans/grok-imagine-video-provider-context.md`
- `/home/k8r1m/Open-Generative-AI/docs/plans/grok-imagine-video-provider-plan.md`
- `/home/k8r1m/Open-Generative-AI/docs/plans/grok-imagine-video-provider-task-list.md`

Then inspect focused repo code only as needed, especially:

- `/home/k8r1m/Open-Generative-AI/packages/studio/src/nativeModels.js`
- `/home/k8r1m/Open-Generative-AI/packages/studio/src/nativeMedia.js`
- `/home/k8r1m/Open-Generative-AI/packages/studio/src/components/VideoStudio.jsx`
- `/home/k8r1m/Open-Generative-AI/native-media-gateway/server.js`
- `/home/k8r1m/Open-Generative-AI/native-media-gateway/exports.js`
- `/home/k8r1m/Open-Generative-AI/native-media-gateway/scheduler.js`
- `/home/k8r1m/Open-Generative-AI/native-media-gateway/vertexVideoProvider.js`
- `/home/k8r1m/Open-Generative-AI/native-media-gateway/codexImageProvider.js`
- `/home/k8r1m/.codex/skills/grok-imagine-video/SKILL.md`
- `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`

Official docs to verify against, not trust from memory:

- https://docs.x.ai/developers/model-capabilities/imagine
- https://docs.x.ai/developers/model-capabilities/video/generation
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://docs.x.ai/developers/model-capabilities/video/reference-to-video
- https://docs.x.ai/developers/models/grok-imagine-video-1.5-preview

Audit goals:

1. Find flaws in the proposed architecture before implementation.
2. Challenge the model ID/naming decision: `native.grok.imagine-video` vs any `1.5` naming.
3. Check whether the plan keeps Veo, Codex, Vertex, and Grok behavior separate without duplicating avoidable plumbing.
4. Check request validation, UI controls, gateway dispatch, scheduler/cancel/timeout behavior, asset import, file naming, and observability.
5. Check whether wrapper behavior and official xAI docs are correctly separated.
6. Check security boundaries: no browser credentials, no path traversal, no leaked local paths/logs/prompts/auth state.
7. Check tests for the smallest sufficient coverage: provider adapter, model catalog, route gating, credential boundary, UI wiring, fake/live behavior, cancellation, and safe error messages.
8. Identify anything missing that would likely cause a failed implementation or bad manual smoke on port `19400`.

Output format:

```markdown
# Grok 4.3 Audit Report: Native Grok Imagine Video Provider Plan

## Verdict
APPROVE_WITH_NOTES | REQUEST_CHANGES

## Findings
- Severity: Blocker | Major | Minor | Note
- Evidence: exact file/path/line or official doc URL
- Problem:
- Recommended plan amendment:

## Plan Amendments Worth Considering
- Exact target file:
- Exact proposed wording/change:
- Why this improves correctness:

## Claims I Could Not Verify
- Claim:
- Why not verified:
- What would verify it:

## Checks Performed
- Local files inspected:
- Official docs inspected:
- Commands run:
```

Be strict. Do not praise the plan unless the evidence supports it. Do not ask for implementation. Do not invent extra abstractions unless a real failure mode requires them.

If you have write access, write the report to:

`/home/k8r1m/Open-Generative-AI/docs/plans/grok-imagine-video-provider-grok-4.3-audit-report.md`

If you do not have write access, return the full Markdown report in your answer.
