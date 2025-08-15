// We use JSZip to create and read .zip archives in memory.
// JSZip provides a convenient API to add files, generate binary blobs, and read entries.
const JSZip = require('jszip');

// Obsidian's App type gives us access to the vault and adapter APIs.
// We only import the type here so TypeScript can check signatures; at runtime
// the real `app` instance is provided by the caller/plugin environment.
import { App } from 'obsidian';

// ArchiveResult: describes the result of creating an archive.
// zipPath: path in the vault where the zip file was written.
// manifest: a small JSON manifest that lists files included in the zip.
// ArchiveResult: the public return value from createArchive.
// - zipPath: the path (relative to the vault) where the produced .zip lives.
// - manifest: a tiny JSON object listing the files included in the archive.
export interface ArchiveResult {
  zipPath: string;
  manifest: { files: string[] };
}

// ZipVerificationResult: result of validating a zip file's contents.
// isValid: whether verification succeeded.
// fileCount: number of non-directory entries found in the zip.
// errors: any messages collected during verification.
// ZipVerificationResult: a simple structure describing whether a zip is OK.
// - isValid: true when the zip contained exactly the expected files and sample extraction succeeded.
// - fileCount: how many non-directory entries the zip contained (useful for sanity checks).
// - errors: any human-readable error messages collected during verification.
export interface ZipVerificationResult {
  isValid: boolean;
  fileCount: number;
  errors: string[];
}

// normalizePath: helper to produce a canonical relative path string
// - removes leading "./" and converts backslashes to forward slashes
// normalizePath: produce a canonical relative path string for comparison and zipping.
// - converts backslashes to forward slashes (consistent cross-platform)
// - removes a leading "./" which is a common way to reference the current folder
// Returns the unchanged value when p is falsy so callers don't need extra checks.
function normalizePath(p: string) {
  if (!p) return p;
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

// withTimeout: wraps a promise and rejects if it doesn't complete within `ms` milliseconds.
// - Useful to avoid long hangs when reading/writing many files or slow adapters.
// - If ms is falsy or <= 0, returns the original promise (disabled timeout).
// withTimeout: utility wrapper that rejects a promise if it does not settle within `ms` milliseconds.
// This is useful when interacting with file systems or adapters that might hang or be slow.
// Usage notes for beginners:
// - If ms is falsy or <= 0, the timeout is disabled and the original promise is returned unchanged.
// - The implementation uses Promise.race to return whichever settles first (the operation or the timeout).
// - We clear the timer when the operation finishes to avoid leaking resources.
function withTimeout<T>(p: Promise<T>, ms: number, message = 'Operation timed out') {
  if (!ms || ms <= 0) return p;
  let t: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  // Promise.race returns the first promise that settles (resolve or reject).
  return Promise.race([p, timeout]).then((v) => { clearTimeout(t); return v as T; });
}

// verifyZipIntegrity:
// - Reads a zip from the vault and compares its contents to expectedFiles.
// - Also attempts to read a small sample of files to make sure they can be extracted.
// - Returns a ZipVerificationResult describing the outcome.
// Note: This function uses the vault adapter to read the zip file as binary.
// verifyZipIntegrity: check that the zip at zipPath contains exactly the files
// we expect and that a small sample of entries can be extracted successfully.
// This helps detect cases where a zip write succeeded but the archive is missing
// files or corrupted.
export async function verifyZipIntegrity(app: App, zipPath: string, expectedFiles: string[], options?: { perFileTimeoutMs?: number }): Promise<ZipVerificationResult> {
  // perFileTimeoutMs controls how long we wait for each small step (reading file, extracting entry).
  const { perFileTimeoutMs = 30000 } = options || {};
  const errors: string[] = [];

  try {
    // Read the zip file from the vault's adapter as binary data. We allow a longer
    // timeout for the entire zip read since it may be larger than individual files.
    const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip for verification timed out');
    // Load the zip into JSZip for inspection.
    const zip = await JSZip.loadAsync(data as ArrayBufferLike);

    // JSZip stores entries under zip.files where directory entries end with '/'.
    // Filter to files only because directories are not relevant to file-level checks.
    const zipEntries = Object.keys(zip.files).filter(name => !name.endsWith('/'));

    // Normalize expected file paths before comparing so path separators don't cause false mismatches.
    const normalizedExpected = (expectedFiles || []).map(normalizePath);

    // Find missing and extra entries by simple comparisons. For very large archives
    // a more efficient set-difference approach would be preferred, but this is
    // readable and fine for moderate sizes.
    const missingFiles = normalizedExpected.filter(f => !zipEntries.includes(f));
    const extraFiles = zipEntries.filter(f => !normalizedExpected.includes(f));

    if (missingFiles.length > 0) {
      errors.push(`Missing files in zip: ${missingFiles.join(', ')}`);
    }

    if (extraFiles.length > 0) {
      errors.push(`Extra files in zip: ${extraFiles.join(', ')}`);
    }

    // To ensure entries are readable (not just listed), try to read a small sample of files.
    // We limit to up to 5 entries to keep verification fast while still catching common issues.
    const samplesToTest = Math.min(5, zipEntries.length);
    const testFiles = zipEntries.slice(0, samplesToTest);

    for (const fileName of testFiles) {
      try {
        const file = zip.file(fileName);
        if (file) {
          // Try to extract the file into an ArrayBuffer; if this fails it indicates corruption.
          await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Testing ${fileName} timed out`);
        }
      } catch (error) {
        // Don't abort verification on the first extraction failure; record it and continue
        // so the caller gets a full picture of what went wrong.
        errors.push(`Failed to read ${fileName} from zip: ${error}`);
      }
    }

    return {
      isValid: errors.length === 0,
      fileCount: zipEntries.length,
      errors
    };
  } catch (error) {
    // Any top-level error means verification couldn't complete (for example the zip couldn't be read).
    errors.push(`Failed to verify zip: ${error}`);
    return {
      isValid: false,
      fileCount: 0,
      errors
    };
  }
}

// CreateArchiveOptions: options you can pass to createArchive
// Options for createArchive. These allow callers to tune timeouts and behavior.
export type CreateArchiveOptions = { 
  perFileTimeoutMs?: number,    // timeout for each small file operation (ms)
  overallTimeoutMs?: number,    // maximum allowed time for the entire archive operation (ms)
  onProgress?: (done:number,total:number)=>void, // optional progress callback
  deleteOriginals?: boolean,    // if true, original files will be deleted after successful verification
  batchSize?: number,           // when deleting originals, how many files to delete per batch
  preserveBaseName?: boolean    // if true, do not override the provided modeName when naming the zip
};

// createArchive:
// - Creates a zip containing the provided files and writes it to archiveFolder.
// - Writes a companion manifest (.manifest.json) next to the zip.
// - Verifies the zip contents before returning.
// - Optionally deletes original files after successful verification (see deleteOriginals option).
// createArchive: produce a zip file containing `files` and write it into `archiveFolder`.
// Steps (high level):
// 1. Read each file from the vault adapter and add it to an in-memory JSZip instance.
// 2. Generate the zip binary and write it to the vault.
// 3. Write a small manifest alongside the zip to record which files were included.
// 4. Verify the zip contents can be read back.
// 5. Optionally delete original files with safe rollback semantics.
export async function createArchive(app: App, vaultPath: string, archiveFolder: string, modeName: string, files: string[], options?: CreateArchiveOptions): Promise<ArchiveResult> {
  const { perFileTimeoutMs = 30000, overallTimeoutMs = 10 * 60 * 1000, onProgress } = options || {};

  // Wrap the main archive creation logic so we can apply a single overall timeout later.
  const mainPromise = (async () => {
    const zip = new JSZip();
    const manifest: { files: string[] } = { files: [] };

    // Track progress for callers that want UI feedback.
    let done = 0;
    const total = files.length;

    // Read each file from the vault and add it to the zip. We use the relative
    // path as the entry name so folder structure is preserved in the archive.
    for (const relPath of files) {
      // read each file using the vault adapter, with a per-file timeout to avoid hangs.
      const data = await withTimeout(app.vault.adapter.readBinary(relPath), perFileTimeoutMs, `Reading ${relPath} timed out`);
      // Add file contents to zip using the relative path as the entry name.
      zip.file(relPath, data as ArrayBuffer);
      // Record the path in the manifest so the zip contents are discoverable later.
      manifest.files.push(relPath);
      done++;
      onProgress && onProgress(done, total);
    }

    // Generate the zip binary. This is an in-memory operation and can be
    // memory/CPU intensive for large archives, so we give it a longer timeout.
    const content = await withTimeout(zip.generateAsync({ type: 'uint8array' }), perFileTimeoutMs * 4, 'Zip generation timed out');

    // Build a human-friendly filename: include the modeName, timestamp and a short random hash.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = Math.random().toString(36).slice(2,8);
    // If all files come from a single top-level folder, use that folder name to make the filename meaningful.
    let baseName = modeName;
    // Only override the base name when not explicitly preserved and all files share one top-level folder
    if (!options?.preserveBaseName && files.length > 0) {
      const tops = files.map(f => f.split('/')[0]);
      const uniq = Array.from(new Set(tops));
      if (uniq.length === 1 && uniq[0]) baseName = uniq[0];
    }
    // Slugify the base name slightly for safer filenames and better matching (spaces/underscores -> hyphens)
    const safeBaseName = String(baseName)
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    const zipName = `${safeBaseName}-${ts}-${hash}.zip`;
    const zipPath = `${archiveFolder}/${zipName}`;

    // Ensure the archive folder exists. createFolder will reject if a parent doesn't exist,
    // so we ignore errors (folder might already exist).
    await app.vault.createFolder(archiveFolder).catch(()=>{});

    // Write the zip binary to the vault using adapter.writeBinary. We convert the Uint8Array
    // buffer into a plain ArrayBuffer for compatibility with some adapters.
    await withTimeout(Promise.resolve().then(()=>app.vault.adapter.writeBinary(zipPath, (content as Uint8Array).buffer as ArrayBuffer)), perFileTimeoutMs * 2, 'Writing zip timed out');

    // Write a human readable manifest next to the zip so others (or later runs) know what was archived.
    const manifestPath = `${zipPath}.manifest.json`;
    await withTimeout(Promise.resolve().then(()=>app.vault.adapter.write(manifestPath, JSON.stringify(manifest, null, 2))), perFileTimeoutMs, 'Writing manifest timed out');

    // IMPORTANT: Verify zip integrity before allowing any deletions of original files.
    // This prevents data loss in case the zip is corrupted or incomplete.
    const verification = await verifyZipIntegrity(app, zipPath, files, { perFileTimeoutMs });
    if (!verification.isValid) {
      // If verification fails, throw an error; the caller can decide how to handle it.
      // No originals will have been deleted at this point.
      throw new Error(`Zip verification failed: ${verification.errors.join('; ')}`);
    }

    return { zipPath, manifest };
  })();

  // Apply an overall timeout to the entire archive operation to bound total runtime.
  const result = await withTimeout(mainPromise, options?.overallTimeoutMs || overallTimeoutMs, 'Archive operation timed out');

  // If the caller asked to delete originals after archiving, attempt that with rollback support.
  if (options && (options as any).deleteOriginals) {
    try {
      await deleteOriginalsWithRollback(app, result.zipPath, files, { 
        perFileTimeoutMs: options.perFileTimeoutMs,
        batchSize: options.batchSize
      });
    } catch (e) {
      // If deletion failed (and rollback attempted), propagate the error to the caller.
      throw e;
    }
  }

  return result;
}

// deleteOriginalsWithRollback:
// - Deletes original files in batches to limit work done at once.
// - After each successful batch, writes a checkpoint file next to the zip so progress is persisted.
// - If a batch fails, attempts to restore the files deleted in that batch from the zip.
// - If any unrecoverable failure occurs, performs a full rollback by restoring all deleted files.
// deleteOriginalsWithRollback: safely delete original files after archiving.
// We perform deletions in batches and write a checkpoint after each successful
// batch so that a partially-completed deletion can be resumed or rolled back.
async function deleteOriginalsWithRollback(app: App, zipPath: string, files: string[], opts?: { perFileTimeoutMs?: number; batchSize?: number }) {
  const perFileTimeoutMs = opts?.perFileTimeoutMs || 30000;
  const batchSize = opts?.batchSize || 10; // Process files in batches to avoid long operations
  const deleted: string[] = []; // global list of files deleted so far
  const failed: string[] = []; // files we could not delete despite retries
  const deleteBatches: string[][] = [];

  // Split files into batches for incremental processing.
  for (let i = 0; i < files.length; i += batchSize) {
    deleteBatches.push(files.slice(i, i + batchSize));
  }

  try {
    // Process each batch sequentially so we can checkpoint progress between batches.
    for (let batchIndex = 0; batchIndex < deleteBatches.length; batchIndex++) {
      const batch = deleteBatches[batchIndex];
  const batchDeleted: string[] = [];

      try {
        for (const p of batch) {
          let success = false;
          // Prefer the high-level vault API so Obsidian updates internal caches and plugins correctly.
          const af = app.vault.getAbstractFileByPath(p) as any;
          if (af) {
            try {
              await withTimeout(app.vault.delete(af), perFileTimeoutMs, `Deleting ${p} timed out`);
              success = true;
            } catch (e) {
              // Fall through to adapter-based strategies
            }
          }
          if (!success) {
            // Try adapter.remove with retries on transient Windows errors (EPERM/EACCES/EBUSY/ENOTEMPTY)
            const tryRemove = async () => {
              const maxAttempts = 5;
              let attempt = 0;
              let lastErr: any = undefined;
              while (attempt < maxAttempts) {
                try {
                  await withTimeout((app.vault.adapter as any).remove(p), perFileTimeoutMs, `Adapter remove ${p} timed out`);
                  return true;
                } catch (err) {
                  const msg = String((err as any)?.message || err).toLowerCase();
                  lastErr = err;
                  if (msg.includes('eperm') || msg.includes('eacces') || msg.includes('ebusy') || msg.includes('enotempty') || msg.includes('permission denied')) {
                    // backoff then retry
                    await new Promise(r => setTimeout(r, 200 + attempt * 150));
                    attempt++;
                    continue;
                  }
                  // Non-retryable
                  break;
                }
              }
              // Attempt a rename-then-remove as a last resort where adapters support rename
              try {
                const tmp = p + '.deleting-' + Math.random().toString(36).slice(2,8);
                if (typeof (app.vault.adapter as any).rename === 'function') {
                  await (app.vault.adapter as any).rename(p, tmp);
                  await (app.vault.adapter as any).remove(tmp);
                  return true;
                }
              } catch {}
              // Give up
              if (lastErr) throw lastErr;
              return false;
            };
            try {
              success = await tryRemove();
            } catch {
              success = false;
            }
          }

          if (success) {
            batchDeleted.push(p);
            deleted.push(p);
          } else {
            failed.push(p);
          }
        }

        // After a full batch succeeds, write a checkpoint so progress is persisted on disk.
        // The checkpoint includes which files have been deleted so far. If deletion stops
        // mid-way (process crash, power loss), the plugin can read this checkpoint to know
        // how far it progressed.
        const checkpointData = { 
          deleted, 
          currentBatch: batchIndex + 1,
          totalBatches: deleteBatches.length,
          timestamp: new Date().toISOString() 
        };
        const checkpointPath = `${zipPath}.checkpoint.json`;
        await withTimeout(
          Promise.resolve().then(() => app.vault.adapter.write(checkpointPath, JSON.stringify(checkpointData, null, 2))), 
          perFileTimeoutMs, 
          'Writing checkpoint timed out'
        );

      } catch (batchError) {
        // If a batch fails partway through, attempt to restore the files deleted in this batch only.
        // This is a best-effort attempt to minimize data loss.
        for (const failedFile of batchDeleted) {
          try {
            await restoreFileFromZip(app, zipPath, failedFile, { perFileTimeoutMs });
          } catch (restoreError) {
            // If a per-file restore fails, log it implicitly and continue; a full rollback will be attempted below.
          }
        }
        // Propagate the batch error up to trigger full rollback logic.
        throw batchError;
      }
    }

    // If all batches completed successfully, write a final deletelog summarizing deletions.
  const deletemeta = { deleted, failed, timestamp: new Date().toISOString() };
    const logPath = `${zipPath}.deletelog.json`;
    await withTimeout(Promise.resolve().then(()=>app.vault.adapter.write(logPath, JSON.stringify(deletemeta, null, 2))), perFileTimeoutMs, 'Writing deletelog timed out');

    // Clean up the checkpoint file now that deletion is finished. Ignore errors here
    // because failure to remove the checkpoint does not change the fact the deletes succeeded.
    try {
      await (app.vault.adapter as any).remove(`${zipPath}.checkpoint.json`);
    } catch (e) {
      // Ignore cleanup errors to avoid masking successful deletion.
    }

  } catch (err) {
    // If anything went wrong during deletion, attempt a full rollback to restore all deleted files.
    try {
      await restoreArchive(app, zipPath, { perFileTimeoutMs });
    } catch (re) {
      // If rollback fails, attach that error to the original error for diagnostics.
      (err as any).rollbackError = re;
    }
    // Re-throw the original deletion error (with possible rollback error attached).
    throw err;
  }
}

// restoreFileFromZip:
// - Restores a single file from the zip archive back into the vault (creating folders as needed).
// - Throws if the file is not present in the zip.
// restoreFileFromZip: restore a single file from the zip into the vault.
// Note: For simplicity we read the whole zip and extract the requested file. For very large
// archives a streaming approach would be more efficient, but this is straightforward and
// reliable for typical plugin usage patterns.
async function restoreFileFromZip(app: App, zipPath: string, filePath: string, options?: { perFileTimeoutMs?: number }): Promise<void> {
  const { perFileTimeoutMs = 30000 } = options || {};

  // Read zip and load it into JSZip. We allow a longer timeout for the full zip read.
  const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip for single file restore timed out');
  const zip = await JSZip.loadAsync(data as ArrayBufferLike);

  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`File ${filePath} not found in zip`);
  }

  // Extract binary contents and prepare to write back to the vault adapter.
  const ab = await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Unzipping ${filePath} timed out`);

  // Ensure the folder hierarchy exists before writing. createFolder will create
  // intermediates or reject if they already exist; ignoring errors keeps this idempotent.
  const folders = filePath.split('/').slice(0, -1);
  let cur = '';
  for (const f of folders) {
    cur = cur ? `${cur}/${f}` : f;
    await app.vault.createFolder(cur).catch(() => {});
  }

  // Write the restored file using adapter.writeBinary which accepts an ArrayBuffer.
  await withTimeout(
    Promise.resolve().then(() => app.vault.adapter.writeBinary(filePath, ab as ArrayBuffer)), 
    perFileTimeoutMs, 
    `Writing restored ${filePath} timed out`
  );
}

// RestorePolicy: controls how restoreArchive handles conflicts with existing files.
// - 'overwrite': replace existing files
// - 'skip': do not overwrite existing files
// - 'conflict-copy': write a copy with a '-conflict-<hash>' suffix if a file exists
// RestorePolicy controls how we handle existing files during restore:
// - 'overwrite': replace existing files with the archive version
// - 'skip': leave existing files untouched and do not write the archived file
// - 'conflict-copy': write a copy next to the existing file with a '-conflict-<hash>' suffix
export type RestorePolicy = 'overwrite' | 'skip' | 'conflict-copy';

// restoreArchive:
// - Restores all files from the zip to the vault.
// - Supports conflict resolution policies (overwrite, skip, conflict-copy).
// - Reports progress via onProgress callback when provided.
// restoreArchive: restores all files from a zip archive into the vault.
// It supports three policies for handling conflicts with existing files:
// - overwrite: replace files
// - skip: leave existing files untouched
// - conflict-copy: write a new file next to the existing one with a '-conflict-<hash>' suffix
export async function restoreArchive(app: App, zipPath: string, options?: { perFileTimeoutMs?: number, overallTimeoutMs?: number, onProgress?: (done:number,total:number)=>void, policy?: RestorePolicy }): Promise<void> {
  const { perFileTimeoutMs = 30000, policy = 'overwrite' } = options || {};
  const main = (async () => {
    // Read zip binary and load using JSZip.
    const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip timed out');
    const zip = await JSZip.loadAsync(data as ArrayBufferLike);

    // Filter out directories: JSZip includes folder entries which we don't need
    // to write explicitly since files will cause folders to be created.
    const entries = Object.keys(zip.files).filter(name => !name.endsWith('/'));
    let done = 0;
    const total = entries.length;

    for (const entry of entries) {
      const file = zip.file(entry);
      if (!file) { done++; continue; }

      // Extract binary contents for writing to the vault adapter.
      const ab = await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Unzipping ${entry} timed out`);

      // Ensure folder hierarchy exists before writing.
      const folders = entry.split('/').slice(0,-1);
      let cur = '';
      for (const f of folders) {
        cur = cur ? `${cur}/${f}` : f;
        await app.vault.createFolder(cur).catch(()=>{});
      }

      // Conflict resolution: decide whether to overwrite, skip, or write a conflict copy.
      const existing = app.vault.getAbstractFileByPath(entry);
      if (existing) {
        if (policy === 'skip') {
          // Skip writing this file (leave existing one untouched)
          done++;
          options?.onProgress && options.onProgress(done, total);
          continue;
        }
        if (policy === 'conflict-copy') {
          // Create a conflict copy name that won't collide with existing names.
          const parts = entry.split('/');
          const base = parts.pop() || '';
          const dir = parts.join('/');
          const dot = base.lastIndexOf('.');
          const name = dot === -1 ? base : base.slice(0, dot);
          const ext = dot === -1 ? '' : base.slice(dot);
          const hash = Math.random().toString(36).slice(2,8);
          const newBase = `${name}-conflict-${hash}${ext}`;
          const newPath = dir ? `${dir}/${newBase}` : newBase;
          await withTimeout(Promise.resolve().then(()=>app.vault.adapter.writeBinary(newPath, ab as ArrayBuffer)), perFileTimeoutMs, `Writing conflict copy ${newPath} timed out`);
          done++;
          options?.onProgress && options.onProgress(done, total);
          continue;
        }
        // Otherwise fall through to overwrite behavior.
      }

      // Write file (either new or overwrite) using adapter.writeBinary.
      await withTimeout(Promise.resolve().then(()=>app.vault.adapter.writeBinary(entry, ab as ArrayBuffer)), perFileTimeoutMs, `Writing ${entry} timed out`);
      done++;
      options?.onProgress && options.onProgress(done, total);
    }
  })();

  // Apply an overall timeout to the restore operation as well.
  return withTimeout(main, options?.overallTimeoutMs || 10 * 60 * 1000, 'Restore operation timed out');
}
