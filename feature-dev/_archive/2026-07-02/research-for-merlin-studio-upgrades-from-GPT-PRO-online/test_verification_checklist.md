# Test and Verification Checklist

## Native media regression

- [ ] Existing Image Studio generation appears in history.
- [ ] Existing Video Studio generation appears in history.
- [ ] Existing Cinema Studio generation appears in history.
- [ ] Grok video history/download/delete still works.
- [ ] Gemini Omni history/download/delete still works.
- [ ] Veo history/download/delete still works.
- [ ] Nano Banana and GPT Image history/download/delete still work.
- [ ] Prompt copy still copies the original prompt.
- [ ] Deleting a generated asset does not delete project metadata unexpectedly.

## Project sidecars

- [ ] `.native-media/projects/index.json` created on first project.
- [ ] Project JSON written atomically.
- [ ] Project reload after app restart works.
- [ ] Unknown schema opens read-only.
- [ ] Corrupt project file offers restore/export.
- [ ] Missing media asset renders missing state.

## Storyboard UX

- [ ] Create project.
- [ ] Add scene.
- [ ] Add shot.
- [ ] Reorder scene.
- [ ] Reorder shot.
- [ ] Duplicate shot.
- [ ] Delete shot.
- [ ] Shot card displays expected metadata.

## References

- [ ] Create Character reference from generated image.
- [ ] Create Location reference from upload.
- [ ] Create Prop reference from generated asset.
- [ ] Duplicate `@tag` rejected.
- [ ] Prompt editor autocomplete inserts `@tag`.
- [ ] Reference usage list updates after assigning to shots.
- [ ] Removing reference link does not delete media.

## Generation

- [ ] Text-only shot generation works.
- [ ] Single-reference generation works for compatible model.
- [ ] Multi-reference generation works for Gemini Omni if available.
- [ ] Unsupported multi-reference model shows warning.
- [ ] Successful job creates Variant and GenerationJobLink.
- [ ] Failed job creates failed Variant and retry.

## First/last-frame continuity

- [ ] Image output can be set as last frame.
- [ ] Video last frame can be extracted or disabled with explanation.
- [ ] Last frame attaches to next shot first frame.
- [ ] Shot cards show continuity chain.
- [ ] Compatible model receives first-frame media input.
- [ ] Incompatible model receives text fallback.

## Variant compare

- [ ] Generate two variants from same shot.
- [ ] Compare grid shows previews and metadata.
- [ ] Pin selected variant.
- [ ] Regenerate from variant preserves prompt/settings snapshot.
- [ ] Missing/deleted output appears as missing state.

## Script-to-board

- [ ] Paste outline; draft scenes/shots appear.
- [ ] Paste script; target shot count honored approximately.
- [ ] Draft is editable before save.
- [ ] No media generation occurs without confirmation.
- [ ] References can be assigned during draft review.
