# Tests and EPERM Fix Plan

Timestamp: 2025-08-15 10:47:15 -05:00

## Goal
- Add tests for core features described in README (archiving, restoration policies, discovery logic) and important helpers in `src/`.
- Address persistent `EPERM` folder deletion errors on Windows by strengthening deletion fallbacks.

## Plan
1. Build in-memory vault/adapter mocks to simulate Obsidian APIs used by `src/` and deletion logic.
2. Write tests:
   - utils: `generateZipName`, `formatBytes`, `getVaultBasePath`.
   - archive: `createArchive`, `verifyZipIntegrity`, `restoreArchive` with policies (overwrite, skip, conflict-copy).
   - deletion: exercise `deleteFolderSafely` retries and EPERM/EACCES/EBUSY handling.
3. Improve deletion logic:
   - Increase retries and include ENOTEMPTY/"Directory not empty" detection.
   - Add small backoff between attempts.
   - Final fallback: best-effort rename then remove recursively when supported.
4. Run tests and iterate until green.

## Viability Check
- Vitest is present in devDependencies. JSZip is available for archive tests.
- Obsidian environment will be mocked; no actual vault required.
- Changes limited to deletion method in `main.ts`; low risk.

## Execution Log
- [10:47] Initialized plan and started adding tests/mocks.
- [10:58] Wrote tests for utils, modes, archive; created obsidian module mock and vitest alias.
- [11:02] Strengthened deleteFolderSafely with retries, ENOTEMPTY/permission checks, and backoff.
- [11:06] First test run: failures due to main.js requiring real 'obsidian'.
- [11:10] Switched tests to import TypeScript source, enabled tsconfig allowImportingTsExtensions.
- [11:12] Fixed discover test to set plugin.app and adjusted EPERM retry test to cover non-recursive rmdir path.
- [11:13] All tests passing (13). Deletion fallbacks verified under EPERM conditions. Documenting completion.
