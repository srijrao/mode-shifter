Release 1.0.1 — Mode Shifter

Summary

This release bumps the plugin to version 1.0.1 and includes minor packaging and metadata updates.

Artifacts to attach to the GitHub release

- manifest.json (root and release attachment)
- main.js (built bundle)
- styles.css

What changed

- Bumped version to 1.0.1 in `package.json` and `manifest.json`.
- Added `1.0.1` entry to `versions.json`.
- Small release notes file added to repo.

Verification performed

- Project built successfully (`npm run build`).
- Unit tests: 61 tests passed.

How to publish (web UI)

1. Go to the repository on GitHub.
2. Click "Releases" → "Draft a new release".
3. For "Tag version" enter exactly: `1.0.1` (no `v` prefix).
4. Select the target branch `main`.
5. Paste this file's contents into the release description.
6. Upload `manifest.json`, `main.js`, and `styles.css` as binary attachments.
7. Publish the release.

Notes

- The tag created here is an unsigned annotated tag. If you prefer a GPG-signed tag, you must create it locally with your GPG config (e.g., `git tag -s 1.0.1 -m "Release 1.0.1"`) and push that tag instead.
- `gh` CLI is not available in this environment, so I cannot create the release draft on GitHub automatically.
