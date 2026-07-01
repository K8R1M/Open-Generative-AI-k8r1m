# Open Generative AI Agent Instructions

- Feature work must preserve already-working native media paths unless the user explicitly approves disabling them. Before handing back for testing, verify the changed feature and the previously-working adjacent paths: Grok video, Nano Banana 2/Pro image, native Codex image, prompt copy, delete, history hydration, and existing `.native-media` assets.
- Never serve a fake provider result as a successful user-facing generation. If a real provider is unavailable, fail visibly and do not add a gallery card.
- Preserve runtime provider environment across restarts. Native Vertex/Nano Banana requires ADC to reach the worker; do not drop `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CLOUD_PROJECT` from the trusted gateway process.
- Use the same `NATIVE_MEDIA_ROOT` across separate clones/worktrees/forks or merge their `.native-media` stores before switching back; do not run clean commands that remove ignored `.native-media`.
- Track feature-development rounds in `feature-dev/`. Before planning or branching for the next feature run, read `feature-dev/README.md`, add the requested features there, then create the round subfolder/branch from that context.
