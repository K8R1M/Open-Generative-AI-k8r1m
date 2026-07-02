# Slice 11 — Prompt Templates (Markdown)

Assignee: GLM 5.2 (gateway part is trivial CRUD; GLM does both, GPT 5.5 reviews
the gateway diff). Depends on: slice 05. Branch: `slice/11-prompt-templates`.

## Goal

Karim's ask verbatim: “Prompt templates stored as simple Markdown.” Reusable
prompt text snippets, editable as files AND in the UI, insertable into any
prompt box in the Projects tab.

## Storage

`.native-media/prompt-templates/<slug>.md`:
```markdown
---
name: Cinematic product reveal
tags: [product, reveal]
---
Slow dolly-in on {{subject}}, dramatic rim lighting, shallow depth of field,
photoreal, 35mm.
```
- Slug: kebab-case of name, unique, `/^[a-z0-9-]{2,64}$/`.
- Frontmatter: `name` (required), `tags` (optional string list). Body = the
  template text. `{{placeholders}}` are plain text conventions — V1 does NOT
  substitute them; the user edits after insertion. (Deliberate: substitution UI
  is Phase 2 if ever; keep V1 dumb and predictable.)
- Parse with a 20-line hand parser (split on `---` fences, `key: value` +
  `[a, b]` lists) — **no yaml dependency**.

## Gateway routes (gated by `NATIVE_MEDIA_PROJECTS=1`)

| Method | Path | Contract |
|---|---|---|
| GET | `/prompt-templates` | `{items:[{slug, name, tags, body}]}` sorted by name |
| PUT | `/prompt-templates/:slug` | body `{name, tags, body}` → write file (atomic tmp+rename), 200 item; slug from URL validated by regex; new slug = create |
| DELETE | `/prompt-templates/:slug` | remove file → 204 |

Path safety: slug regex + resolved-path containment under the directory (same
pattern as `readGeneratedAsset`). Files edited on disk by hand are picked up on
next GET (no caching).

## UI

- Projects tab left rail gains a third section: `Board | References | Templates`.
- Template list + editor (name, tags chips, body textarea, save/delete).
- Insertion: in the ShotDetailPanel prompt textarea (slice 08), typing `/`
  at line start or clicking a small “Templates” button above the textarea opens
  the same dropdown idiom as @tags, listing templates by name; selection inserts
  the body at the cursor.
- Client fns in `projectsClient.js`: `listPromptTemplates()`,
  `savePromptTemplate(slug, {name,tags,body})`, `deletePromptTemplate(slug)`.

## Tests

- Gateway unit `tests/nativePromptTemplates.test.js`: CRUD round-trip, hand
  parser (frontmatter variants, missing frontmatter → name falls back to slug,
  hostile slug rejected), disk-edited file visible on GET.
- e2e: create template in UI → insert into a shot prompt → text lands at
  cursor → template survives reload.

## Do not

- No placeholder substitution engine, no versioning, no per-project scoping
  (templates are global), no markdown rendering (it's prompt text, show raw).

## Acceptance criteria

- CRUD + insertion e2e green; hand-edited file round-trip proven; build green.
