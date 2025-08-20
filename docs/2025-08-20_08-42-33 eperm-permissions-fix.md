# EPERM/Access Denied: Cross‑platform fixes plan and log

Timestamp: 2025-08-20_08-42-33

Problem summary
- Some archives created by the plugin trigger Windows 0x80070005 (Access is denied) when copying/opening.
- Users also encounter EPERM when the plugin creates or deletes files.

Additional user-reported impact
- EPERM/Access is denied errors sometimes block creating or modifying unrelated files elsewhere in the vault.
- In some cases, the vault itself cannot be opened due to permission/lock issues after plugin operations.

Root-cause hypotheses
- Files created with restrictive/readonly attributes on Windows.
- Zip entries lacking sane permissions, causing readonly or blocked behavior on extract.
- Transient locks during deletion causing EPERM; need safer deletion paths.
 - OneDrive/AV/indexer races holding locks immediately after writes or deletes.
 - Archives created in-place next to sources can be touched during restore, worsening lock contention.

Plan of action
1) Normalize filesystem permissions for created artifacts
   - After writing any archive or metadata file, set mode to 0666 (rw for all) on Windows/POSIX.
   - When restoring files from zips, set 0666 on each file written.
2) Set explicit permissions on zip entries
   - Use JSZip unixPermissions=0644 for each file entry to avoid readonly results when unzipped elsewhere.
3) Harden deletions to avoid EPERM
   - Prefer moving to system trash/vault trash; retain retries/backoff for remove/rmdir.
   - Use the same safe deletion in “restore last” and orphaned cleanup paths.
   - If delete fails, attempt rename-then-remove to break locks.
4) Verify
   - Build + run tests; smoke-check archive creation and restore code paths compile.

Viability check
- All changes use available Node/Electron APIs (fs.chmod, electron.shell.trashItem) and Obsidian adapter paths.
- No breaking public API changes. Risk is low; guarded by try/catch and platform checks.

Scope clarification
- The fixes aim to prevent the plugin from creating files that later behave as readonly/locked on Windows and to reduce EPERM cascades that affect unrelated vault files or vault open. Changes include explicit permissions on created zips/manifests and restored files, safer deletion strategies across all code paths (including cleanup and restore commands), and reduced lock contention.

Execution log
- Will append timestamps and outcomes after implementation and tests.

2025-08-20_08-49-19
- Updated plan with broader impact scope (vault-wide EPERM effects and vault-open blocking).
- Implemented: set JSZip unixPermissions=0644 per entry; chmod 0666 on created zip and manifest; chmod 0666 on restored files; safe deletion in orphaned cleanup; helper to resolve absolute path and chmod when possible.
- Next: build and run tests; verify no type/lint errors; document results.

2025-08-20_08-49-58
- Build+tests completed successfully (15 files, 61 tests passed). No type errors. Proceeding to ship fix.

2025-08-20_09-03-55
- Lint: warnings present (console statements, unused vars) but no errors; does not block.
- Typecheck: completed without output (no errors).
- Tests: 16/16 passed, 62 tests total.
