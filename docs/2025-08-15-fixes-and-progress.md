# Mode Shifter: Fixes Plan and Progress (2025-08-15)

Timestamp: 2025-08-15T15:27:13.4948989Z

## Goals
- Fix EPERM errors when deleting folders so folders can be removed reliably.
- Make selection modals larger/taller for better usability.
- Ensure unzip modal finds archives in the vault (not just plugin folders).
- Add group unzip support and improve matching logic.
- Add option to zip immediate subfolders (not only top-level folder).

## Plan
1) Deletion reliability
   - Keep vault.delete first; add adapter.rmdir recursive fallback, then content-first deletion with retries for EPERM/EACCES/EBUSY.
   - Avoid plugin folders and locked files; sleep between retries.
2) Modal sizing
   - Increase modal width and list height; always allow scroll.
3) Archive discovery
   - Switch to vault.getAllLoadedFiles() and filter by .zip; exclude .obsidian/plugins paths.
4) Group unzip and selection
   - Keep archive select modal; ensure discovered items include vault files.
5) Folder Group selection modal
   - Ensure the tree shows top-level folders that can be expanded to subfolders and selectable at any depth.

## Viability
- Changes use only Obsidian public APIs (vault, adapter) and JSZip. No new deps.
- Windows EPERM mitigations are retries with small delay.
- UI changes are CSS style tweaks on Modal elements.

## Implementation Progress
- Implemented per-subfolder zipping in zip-folder and group zipping. Status: Done.
- Enlarged FolderSelectModal and ArchiveSelectModal. Status: Done.
- Reworked findAllArchives to use vault.getAllLoadedFiles() and exclude plugin paths. Status: Done.
- Strengthened deleteFolderSafely with retries on EPERM/EACCES/EBUSY and content-first cleanup. Status: Done.
- Added preserveBaseName option to archive create to keep subfolder name. Status: Done.

## Next
- Test in vault to confirm archive discovery includes vault zips and excludes plugin zips.
- Verify group unzip sees expected archives after discovery fix.
- If EPERM persists on specific paths, consider surfacing exact failing path in Notice.
