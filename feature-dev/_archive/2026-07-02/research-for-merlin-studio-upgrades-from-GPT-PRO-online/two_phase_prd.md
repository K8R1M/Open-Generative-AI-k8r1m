# Two-Phase PRD Outline

## Phase 1: PopCorn-style storyboard + reusable references

### Goal

Make Open-Generative-AI useful for planning and generating a coherent multi-shot AI video using existing media, uploads, and models.

### Features

1. Project list and project detail.
2. Scene CRUD and ordering.
3. Shot CRUD and ordering.
4. Shot board cards and shot detail panel.
5. Reference Collections: Character, Location, Prop, Style, Frame.
6. Character Bible metadata.
7. Add generated/uploaded asset to Project or References.
8. Prompt `@tag` insertion.
9. Reference-aware generation with model fallback warnings.
10. Variant records linked to existing native jobs.
11. First/last-frame continuity action.
12. JSON sidecar persistence.

### Non-goals

- Soul ID training.
- Soul Cast actor generator.
- Collaboration.
- Canvas graph.
- Full timeline.
- New providers.
- Long-video auto assembly.

### Acceptance summary

A user can create a project with scenes/shots/references, generate shots using existing models, link the last frame from one shot to the next shot, and restart the app without losing metadata or breaking native media history.

## Phase 2: Camera controls + variants + script-to-board

### Goal

Add higher-level video-production control and iteration while preserving the small Phase 1 architecture.

### Features

1. Per-shot camera controls from Cinema Studio logic.
2. Per-shot model/settings override.
3. Multi-model variant generation.
4. Variant compare grid.
5. Pin selected variant.
6. Script/outline-to-board draft helper.
7. Optional selected-shot batch generation.

### Non-goals

- Full NLE.
- Realtime collab.
- New providers.
- Training/fine-tuning.
- MCP/CLI.
- Community.

### Acceptance summary

A user can paste a script, get editable scenes/shots, assign references, set camera controls, generate multiple variants from existing models, compare them, and select a winner.
