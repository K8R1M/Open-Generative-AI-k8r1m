# Open Generative AI Feature Development

This folder tracks app feature-development rounds for this fork.

Use it before starting a new feature branch:

1. Record what is already done and tested.
2. Record the next requested features before entering planning mode.
3. Create one subfolder per feature round, then keep that round's plans, reviews, handoffs, test notes, and merge notes inside it.
4. Run feature branches on `19400` for testing, then merge back to `main` and the systemd `19300` app when verified.

Standing rules:

- Do not break already-working native media paths while adding features.
- Keep `.native-media` stable across branches and merges; deleted assets should be actually removed server-side.
- Keep planning and run artifacts here instead of scattering them across the repo.

Current baseline:

- `main` has the native media library, prompt copy, delete, history hydration, native image/video provider fixes, and stable `.native-media` root handling merged.
- The production test target is the systemd app on `19300`.
- The next feature-development branch should be hosted on `19400` for user testing.

Next feature inbox:

- Add requested features here before creating the next round subfolder.
