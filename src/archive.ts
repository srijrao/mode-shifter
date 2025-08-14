const JSZip = require('jszip');
const fg = require('fast-glob');
import { App } from 'obsidian';

export interface ArchiveResult {
  zipPath: string;
  manifest: { files: string[] };
}

export interface ZipVerificationResult {
  isValid: boolean;
  fileCount: number;
  errors: string[];
}

// Expand globs relative to vault root
export async function expandGlobs(vaultPath: string, patterns: string[]): Promise<string[]> {
  if (!patterns || patterns.length === 0) return [];
  const opts = { cwd: vaultPath, dot: true, onlyFiles: true, unique: true } as any;
  const entries = await fg(patterns, opts);
  return entries;
}

function withTimeout<T>(p: Promise<T>, ms: number, message = 'Operation timed out') {
  if (!ms || ms <= 0) return p;
  let t: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p, timeout]).then((v) => { clearTimeout(t); return v as T; });
}

export async function verifyZipIntegrity(app: App, zipPath: string, expectedFiles: string[], options?: { perFileTimeoutMs?: number }): Promise<ZipVerificationResult> {
  const { perFileTimeoutMs = 30000 } = options || {};
  const errors: string[] = [];
  
  try {
    // Read and load the zip
    const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip for verification timed out');
    const zip = await JSZip.loadAsync(data as ArrayBufferLike);
    
    // Filter out directory entries (JSZip automatically creates these)
    const zipEntries = Object.keys(zip.files).filter(name => !name.endsWith('/'));
    const missingFiles = expectedFiles.filter(f => !zipEntries.includes(f));
    const extraFiles = zipEntries.filter(f => !expectedFiles.includes(f));
    
    if (missingFiles.length > 0) {
      errors.push(`Missing files in zip: ${missingFiles.join(', ')}`);
    }
    
    if (extraFiles.length > 0) {
      errors.push(`Extra files in zip: ${extraFiles.join(', ')}`);
    }
    
    // Try to read a sample of files to verify they're not corrupted
    const samplesToTest = Math.min(5, zipEntries.length);
    const testFiles = zipEntries.slice(0, samplesToTest);
    
    for (const fileName of testFiles) {
      try {
        const file = zip.file(fileName);
        if (file) {
          await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Testing ${fileName} timed out`);
        }
      } catch (error) {
        errors.push(`Failed to read ${fileName} from zip: ${error}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      fileCount: zipEntries.length,
      errors
    };
  } catch (error) {
    errors.push(`Failed to verify zip: ${error}`);
    return {
      isValid: false,
      fileCount: 0,
      errors
    };
  }
}

export type CreateArchiveOptions = { 
  perFileTimeoutMs?: number, 
  overallTimeoutMs?: number, 
  onProgress?: (done:number,total:number)=>void, 
  deleteOriginals?: boolean,
  batchSize?: number
};

export async function createArchive(app: App, vaultPath: string, archiveFolder: string, modeName: string, files: string[], options?: CreateArchiveOptions): Promise<ArchiveResult> {
  const { perFileTimeoutMs = 30000, overallTimeoutMs = 10 * 60 * 1000, onProgress } = options || {};
  const mainPromise = (async () => {
    const zip = new JSZip();
    const manifest: { files: string[] } = { files: [] };

    let done = 0;
    const total = files.length;
    for (const relPath of files) {
      // read with per-file timeout
      const data = await withTimeout(app.vault.adapter.readBinary(relPath), perFileTimeoutMs, `Reading ${relPath} timed out`);
      zip.file(relPath, data as ArrayBuffer);
      manifest.files.push(relPath);
      done++;
      onProgress && onProgress(done, total);
    }

    // generate zip with timeout
    const content = await withTimeout(zip.generateAsync({ type: 'uint8array' }), perFileTimeoutMs * 4, 'Zip generation timed out');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = Math.random().toString(36).slice(2,8);
    const zipName = `${modeName}-${ts}-${hash}.zip`;
    const zipPath = `${archiveFolder}/${zipName}`;

    // ensure folder
    await app.vault.createFolder(archiveFolder).catch(()=>{});
    await withTimeout(Promise.resolve().then(()=>app.vault.adapter.writeBinary(zipPath, (content as Uint8Array).buffer as ArrayBuffer)), perFileTimeoutMs * 2, 'Writing zip timed out');

  // write manifest next to zip
  const manifestPath = `${zipPath}.manifest.json`;
  await withTimeout(Promise.resolve().then(()=>app.vault.adapter.write(manifestPath, JSON.stringify(manifest, null, 2))), perFileTimeoutMs, 'Writing manifest timed out');

  // IMPORTANT: Verify zip integrity before allowing any deletions
  const verification = await verifyZipIntegrity(app, zipPath, files, { perFileTimeoutMs });
  if (!verification.isValid) {
    throw new Error(`Zip verification failed: ${verification.errors.join('; ')}`);
  }

  return { zipPath, manifest };
  })();

  const result = await withTimeout(mainPromise, options?.overallTimeoutMs || overallTimeoutMs, 'Archive operation timed out');

  // If caller requested deletion of originals, perform it with rollback support
  if (options && (options as any).deleteOriginals) {
    try {
      await deleteOriginalsWithRollback(app, result.zipPath, files, { 
        perFileTimeoutMs: options.perFileTimeoutMs,
        batchSize: options.batchSize
      });
    } catch (e) {
      // If delete failed, surface error to caller
      throw e;
    }
  }

  return result;
}

async function deleteOriginalsWithRollback(app: App, zipPath: string, files: string[], opts?: { perFileTimeoutMs?: number; batchSize?: number }) {
  const perFileTimeoutMs = opts?.perFileTimeoutMs || 30000;
  const batchSize = opts?.batchSize || 10; // Process files in batches
  const deleted: string[] = [];
  const deleteBatches: string[][] = [];
  
  // Split files into batches
  for (let i = 0; i < files.length; i += batchSize) {
    deleteBatches.push(files.slice(i, i + batchSize));
  }
  
  try {
    // Process each batch
    for (let batchIndex = 0; batchIndex < deleteBatches.length; batchIndex++) {
      const batch = deleteBatches[batchIndex];
      const batchDeleted: string[] = [];
      
      try {
        for (const p of batch) {
          // attempt to resolve abstract file
          const af = app.vault.getAbstractFileByPath(p) as any;
          if (af) {
            await withTimeout(app.vault.delete(af), perFileTimeoutMs, `Deleting ${p} timed out`);
            batchDeleted.push(p);
            deleted.push(p);
          } else {
            // fallback to adapter remove if available
            try {
              await withTimeout((app.vault.adapter as any).remove(p), perFileTimeoutMs, `Adapter remove ${p} timed out`);
              batchDeleted.push(p);
              deleted.push(p);
            } catch (e) {
              // if file doesn't exist, skip
            }
          }
        }
        
        // Write checkpoint after each successful batch
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
        // If a batch fails, try to rollback just this batch first
        for (const failedFile of batchDeleted) {
          try {
            await restoreFileFromZip(app, zipPath, failedFile, { perFileTimeoutMs });
          } catch (restoreError) {
            // Log restore error but continue with full rollback
          }
        }
        throw batchError;
      }
    }

    // All batches completed successfully - write final deletelog
    const deletemeta = { deleted, timestamp: new Date().toISOString() };
    const logPath = `${zipPath}.deletelog.json`;
    await withTimeout(Promise.resolve().then(()=>app.vault.adapter.write(logPath, JSON.stringify(deletemeta, null, 2))), perFileTimeoutMs, 'Writing deletelog timed out');
    
    // Clean up checkpoint file
    try {
      await (app.vault.adapter as any).remove(`${zipPath}.checkpoint.json`);
    } catch (e) {
      // Ignore cleanup errors
    }
    
  } catch (err) {
    // Full rollback: restore all deleted files from zip
    try {
      await restoreArchive(app, zipPath, { perFileTimeoutMs });
    } catch (re) {
      // swallow restore error but include both errors
      (err as any).rollbackError = re;
    }
    throw err;
  }
}

async function restoreFileFromZip(app: App, zipPath: string, filePath: string, options?: { perFileTimeoutMs?: number }): Promise<void> {
  const { perFileTimeoutMs = 30000 } = options || {};
  
  const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip for single file restore timed out');
  const zip = await JSZip.loadAsync(data as ArrayBufferLike);
  
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`File ${filePath} not found in zip`);
  }
  
  const ab = await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Unzipping ${filePath} timed out`);
  
  // ensure folder structure exists
  const folders = filePath.split('/').slice(0, -1);
  let cur = '';
  for (const f of folders) {
    cur = cur ? `${cur}/${f}` : f;
    await app.vault.createFolder(cur).catch(() => {});
  }
  
  await withTimeout(
    Promise.resolve().then(() => app.vault.adapter.writeBinary(filePath, ab as ArrayBuffer)), 
    perFileTimeoutMs, 
    `Writing restored ${filePath} timed out`
  );
}

export type RestorePolicy = 'overwrite' | 'skip' | 'conflict-copy';

export async function restoreArchive(app: App, zipPath: string, options?: { perFileTimeoutMs?: number, overallTimeoutMs?: number, onProgress?: (done:number,total:number)=>void, policy?: RestorePolicy }): Promise<void> {
  const { perFileTimeoutMs = 30000, policy = 'overwrite' } = options || {};
  const main = (async () => {
    const data = await withTimeout(app.vault.adapter.readBinary(zipPath), perFileTimeoutMs * 2, 'Reading zip timed out');
    const zip = await JSZip.loadAsync(data as ArrayBufferLike);
    // Filter out directory entries
    const entries = Object.keys(zip.files).filter(name => !name.endsWith('/'));
    let done = 0;
    const total = entries.length;
    for (const entry of entries) {
      const file = zip.file(entry);
      if (!file) { done++; continue; }
      const ab = await withTimeout(file.async('arraybuffer'), perFileTimeoutMs, `Unzipping ${entry} timed out`);
      // ensure folder
      const folders = entry.split('/').slice(0,-1);
      let cur = '';
      for (const f of folders) {
        cur = cur ? `${cur}/${f}` : f;
        await app.vault.createFolder(cur).catch(()=>{});
      }
      // conflict resolution
      const existing = app.vault.getAbstractFileByPath(entry);
      if (existing) {
        if (policy === 'skip') {
          // skip writing this file
          done++;
          options?.onProgress && options.onProgress(done, total);
          continue;
        }
        if (policy === 'conflict-copy') {
          // compute a non-colliding name
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
        // otherwise overwrite: fallthrough to write
      }

      await withTimeout(Promise.resolve().then(()=>app.vault.adapter.writeBinary(entry, ab as ArrayBuffer)), perFileTimeoutMs, `Writing ${entry} timed out`);
      done++;
      options?.onProgress && options.onProgress(done, total);
    }
  })();

  return withTimeout(main, options?.overallTimeoutMs || 10 * 60 * 1000, 'Restore operation timed out');
}
