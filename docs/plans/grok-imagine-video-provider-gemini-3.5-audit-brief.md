# Multica Brief: Gemini 3.5 Flash Adversarial Audit

Agent: `Gemini 3.5 Flash High - General`

Workspace gate:

- First command: `cd /home/k8r1m/Open-Generative-AI`
- Then verify: `test "$PWD" = "/home/k8r1m/Open-Generative-AI"`
- Read and write only under `/home/k8r1m/Open-Generative-AI`.
- Do not implement production code.
- Do not edit source files.
- Do not edit existing plan files.
- Write exactly one Markdown report:
  `/home/k8r1m/Open-Generative-AI/docs/plans/grok-imagine-video-provider-gemini-3.5-flash-audit-report.md`

Task:

Perform an intense adversarial audit of the plan for adding a native server-side Grok Imagine video provider. The goal is to find flaws before implementation, not to approve the plan politely.

Runtime constraints:

- Do not inspect Multica issue metadata, comments, or run history.
- Do not set issue status.
- Do not narrate every file read.
- Finish with a report even if you only complete a focused audit.
- Prefer the top concrete risks over a broad tour.
- Read the three plan files first. Inspect source only to verify a specific suspected flaw.

Read these local files first:

- `docs/plans/README.md`
- `docs/plans/grok-imagine-video-provider-context.md`
- `docs/plans/grok-imagine-video-provider-plan.md`
- `docs/plans/grok-imagine-video-provider-task-list.md`
- `docs/plans/grok-imagine-video-provider-grok-4.3-audit-prompt.md`

Then inspect focused repo code only where needed to verify a finding:

- `packages/studio/src/nativeModels.js`
- `packages/studio/src/nativeMedia.js`
- `packages/studio/src/components/VideoStudio.jsx`
- `native-media-gateway/server.js`
- `native-media-gateway/exports.js`
- `native-media-gateway/scheduler.js`
- `native-media-gateway/vertexVideoProvider.js`
- `native-media-gateway/codexImageProvider.js`
- `native-media-gateway/bin/genai-video`
- `tests/fixtures/nativeContract.js`
- `tests/nativeModelCatalog.test.js`
- `tests/nativeRouteVersioning.test.js`
- `tests/nativeCredentialBoundary.test.js`
- `tests/nativeGatewayServer.test.js`
- `tests/nativeVideoStudioWiring.test.js`

Also inspect the local Grok skill/wrapper:

- `/home/k8r1m/.codex/skills/grok-imagine-video/SKILL.md`
- `/home/k8r1m/.codex/skills/grok-imagine-video/scripts/grok_imagine_video.py`

Verify current xAI docs from official sources if network access is available:

- https://docs.x.ai/developers/model-capabilities/imagine
- https://docs.x.ai/developers/model-capabilities/video/generation
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://docs.x.ai/developers/model-capabilities/video/reference-to-video
- https://docs.x.ai/developers/models/grok-imagine-video-1.5-preview

Audit focus:

- Model ID/name correctness: `native.grok.imagine-video` vs any `1.5` naming.
- Whether wrapper limits and xAI REST behavior are cleanly separated.
- Whether Veo/Codex/Vertex/Grok behavior stays separate without unnecessary new abstractions.
- Whether gateway validation rejects unsupported task/duration/resolution/input count/MIME/path traversal before spawn.
- Whether UI controls hide unsupported aspect/audio/end-frame behavior for Grok while preserving Veo behavior.
- Whether scheduler/cancel/timeout/process-tree behavior is adequately planned.
- Whether file naming/save locations are deterministic and private logs stay private.
- Whether public errors are safe and useful.
- Whether tests are sufficient and minimal.
- Whether the 19400 manual smoke plan would actually catch likely breakages.

Report format:

```markdown
# Gemini 3.5 Flash Audit Report: Native Grok Imagine Video Provider Plan

## Verdict
APPROVE_WITH_NOTES | REQUEST_CHANGES

## Findings
- Severity: Blocker | Major | Minor | Note
- Evidence: exact file/path/line or official doc URL
- Problem:
- Recommended plan amendment:

## Plan Amendments Worth Considering
- Target file:
- Proposed wording/change:
- Verification needed by Codex before accepting:

## Claims I Could Not Verify
- Claim:
- Why not verified:
- What would verify it:

## Checks Performed
- Local files inspected:
- Official docs inspected:
- Commands run:
```

Do not edit the plan directly. Codex will verify your report and decide what, if anything, to amend.
