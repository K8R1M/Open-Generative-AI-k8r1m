# Login, Browser, and Firecrawl Follow-Up Plan

## Purpose

Validate logged-in UX details that public pages do not reveal. Public evidence is enough for the metadata-first architecture, but login is useful for copying proven interaction patterns and avoiding wrong assumptions.

## Boundaries

- Use a normal Higgsfield account controlled by the team.
- Do not bypass auth, paywalls, credits, or usage limits.
- Do not scrape private/community user assets.
- Respect terms, robots, and rate limits.
- Use screenshots/notes for research; no bulk extraction.

## Firecrawl plan

Use Firecrawl only for public pages that are accessible without login:

- Storyboard Generator
- Cinema Studio
- AI Long Video Generator
- Soul 2.0 / Soul ID pages
- Soul Cast
- Canvas
- Collab
- MCP
- Public blog posts

Capture page title, URL, headings, FAQ entries, and short excerpts. Do not crawl account or community content.

## Browser screenshot plan after login

1. PopCorn new storyboard screen
   - Inputs, modes, reference picker, aspect/quality/shot count.

2. PopCorn generated storyboard
   - Scene card layout, regenerate/edit/reorder/export/continue actions.

3. PopCorn reference/character use
   - Whether saved Soul/Elements can be selected and how.

4. Cinema Studio main screen
   - Layout of prompt, genre/style/camera/model panels.

5. Cinema Studio Elements
   - Create/edit fields, tag behavior, reference counts, sharing scope.

6. Soul ID creation flow
   - Required photo count, validation, training status, resulting object.

7. Soul Cast creation flow
   - Actor fields, casting sheet/backstory, reuse controls.

8. AI Long Video
   - Script input, draft storyboard, per-shot controls, compare/export.

9. Canvas
   - Node types, asset-to-node behavior, templates, versioning.

10. Collab
    - Generation sharing metadata and project-scoped asset behavior.

11. MCP
    - Tool list/history/resource behavior in agent client.

## Questions to answer after login

- Are PopCorn sequences always eight frames or configurable?
- Is the final-image continuation a button or a manual reuse workflow?
- How many image references are accepted by PopCorn and Long Video in real UI?
- Does `@tag` autocomplete exist in PopCorn, Cinema Studio, and Long Video?
- Can Soul ID/Soul Cast characters be used directly inside PopCorn?
- Are Elements scoped per user, project, or team?
- Does the compare grid show side-by-side outputs or just a model selector?
- What exact error/failure states appear for unsupported refs or failed generations?
- How does export to Sora 2 work?
