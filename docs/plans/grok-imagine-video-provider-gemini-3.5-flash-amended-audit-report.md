# Gemini 3.5 Flash Amended Plan Audit

## Verdict
APPROVE_WITH_NOTES

## Findings
- Severity: Note
- Evidence: Plan Section 7 and 10 (Cancel smoke).
- Problem: Since Python wrapper runs with `start_new_session=True`, a SIGTERM sent to the wrapper itself might not propagate to the child CLI process unless a process-group signal is sent.
- Recommended plan amendment: Ensure during the manual cancel smoke that process-table checks verify nested child termination.

- Severity: Note
- Evidence: Plan Section 8 (expected model count becomes 6).
- Problem: Some existing tests might hardcode the model count or namespaces.
- Recommended plan amendment: Ensure that all model catalog, registry, and contract tests are updated to expect 6 models.

## Unknowns
- Claim: Nested Grok process termination via SIGTERM.
- What would verify it: Running the manual cancel smoke on port 19400 and checking the active process table (`ps aux | grep grok`).

- Claim: Complete offline verification using fake provider.
- What would verify it: Running `node --test tests/native*.test.js` with `NATIVE_MEDIA_LIVE_GROK=0` (or not set) and verifying it runs faked results seamlessly.

## Checks Performed
- Files read:
  - `docs/plans/grok-imagine-video-provider-plan.md`
  - `docs/plans/grok-imagine-video-provider-task-list.md`
  - `docs/plans/grok-imagine-video-provider-context.md`
  - `docs/plans/grok-imagine-video-provider-grok-4.3-audit-report.md`
- Source anchors checked:
  - `packages/studio/src/nativeMedia.js`
  - `native-media-gateway/server.js`
