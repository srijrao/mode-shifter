# Implementation Log (2025-08-15)

Time started: 2025-08-15T15:27:13.4948989Z

## Plan Recap
- Fix EPERM deletion errors with retries and fallbacks
- Enlarge modals
- Improve archive discovery to include vault, exclude plugin zips
- Add per-subfolder zipping option for single folders and groups

## Steps Executed
1. archive.ts
   - Added `preserveBaseName` to CreateArchiveOptions to keep subfolder names when desired.
2. main.ts
   - Settings: added `zipStrategy` (top-level | per-subfolder) with UI in settings.
   - Zip command: implemented per-subfolder branch; otherwise original behavior.
   - Group zip: added per-subfolder handling; deletes subfolders if configured.
   - Archive discovery: switched to `vault.getAllLoadedFiles()` and filtered `.zip`, excluding `.obsidian/plugins/`.
   - Folder deletion: added recursive retries for rmdir when EPERM/EACCES/EBUSY occur.
   - Modals: increased modal width and list heights.
3. README.md
   - Documented usability and discovery improvements; removed mention of a zip strategy setting.

## Quick Viability Check
- TypeScript compiles with no emitted errors using skipLibCheck. Build completed.
- No new dependencies added.

## Next
- Manual test inside Obsidian:
  - Zip a folder with many subfolders (top-level vs per-subfolder).
  - Delete originals to ensure EPERM retry works on Windows.
  - Unzip Archive: confirm only vault zips appear, plugin zips excluded.
  - Group unzip: verify matching archives visible and selectable.

Time ended: 2025-08-15T15:27:13.4948989Z
