# Group unzip naming + deletion robustness — plan, viability, execution

Date/time: 2025-08-15 11:52 am (America/Chicago, Houston)

## Plan
- Ensure group archives are saved with the group name as the base of the zip filename.
  - Preserve the provided base name for zips when archiving a folder or a folder group.
  - Slugify spaces/underscores to hyphens so matching is reliable.
- Make unzip-group find the right archive.
  - Match by filename prefix `${slug(group.name)}-` instead of generic substring.
- Improve deletion after zipping.
  - Add robust retries for adapter.remove with backoff for EPERM/EACCES/EBUSY/ENOTEMPTY.
  - Fall back to rename-then-remove as a last resort (when supported).
  - Log deleted/failed items in a `.deletelog.json` file.
- Add tests to ensure fixes.
  - Assert archive filename uses the group/folder name (slugified).
  - Assert unzip group selects the matching archive without prompting.
  - Assert deleteOriginals succeeds even when adapter.remove fails initially.

## Viability check
- Naming: We already control archive file naming in `createArchive` — OK to tweak and slugify.
- Group unzip: We can adjust selection to filename-prefix — no API blockers.
- Deletion: Using vault.delete first is correct; retries + adapter fallback are safe; rename fallback guarded by adapter support — acceptable.
- Tests: Current test harness provides a fake vault/adapter — suitable for simulating failures.

Decision: Proceed as planned.

## Execution summary (what changed)
- Updated archive creation to slugify and preserve base name when requested:
  - src/archive.ts
- Ensured the UI passes `preserveBaseName: true` for folder and group zips; tightened group unzip matching:
  - main.ts
- Added/updated tests:
  - tests/archive.test.ts (slugified base-name assertion)
  - tests/group-unzip-and-delete.test.ts (new; group matching + deletion retry)
  - tests/deleteFolderSafely.test.ts (import TS source)
  - tests/discover.test.ts (import TS source)

## Results
- Unit tests: PASS (6 files, 16 tests) confirming:
  - Archives for groups/folders start with the slugified name.
  - Unzip group auto-restores the matching archive.
  - Deletion after zipping succeeds with retry strategy.

## Notes
- Timestamp in filenames retains ISO elements; we normalize separators for safer filenames and easier matching.
- Deletion writes `${zipPath}.deletelog.json` including any files that ultimately failed to delete.

## Next
- Optional: surface deletion failures to the UI with a final summary count.
- Optional: add a setting to tune deletion retry/backoff.
