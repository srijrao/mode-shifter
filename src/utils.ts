import { App } from 'obsidian';

/**
 * Get safe archive location that prevents conflicts and data loss.
 * 
 * When archiving "in place", we need to be careful not to create the archive
 * in a location where it might conflict with existing files or cause issues
 * during restoration.
 * 
 * @param app - Obsidian app instance
 * @param archiveInPlace - whether to archive in the same location as source
 * @param archiveFolder - default archive folder when not archiving in place
 * @param sourceFolderPath - path of the folder being archived
 * @returns safe archive location path
 */
export function getSafeArchiveLocation(
  app: App, 
  archiveInPlace: boolean, 
  archiveFolder: string, 
  sourceFolderPath: string
): string {
  if (!archiveInPlace) {
    return archiveFolder;
  }
  
  // For "in place" archiving, we need to be more careful
  const sourceFolder = app.vault.getAbstractFileByPath(sourceFolderPath);
  const parentPath = sourceFolder?.parent?.path || '';
  
  // If archiving in place and the source is at root level,
  // create archives in a dedicated subfolder to prevent clutter
  if (!parentPath) {
    return '_archives';
  }
  
  return parentPath;
}

/**
 * Check if an archive location would conflict with restoration.
 * This prevents data loss scenarios where restoring an archive
 * would overwrite the archive itself.
 * 
 * @param archiveLocation - where the archive will be stored
 * @param sourceFolderPath - path of the folder being archived
 * @returns true if there would be a conflict
 */
export function wouldRestoreConflict(archiveLocation: string, sourceFolderPath: string): boolean {
  // If archive location is the same as or inside the source folder,
  // restoration could overwrite the archive
  if (archiveLocation === sourceFolderPath) {
    return true;
  }
  
  if (archiveLocation.startsWith(sourceFolderPath + '/')) {
    return true;
  }
  
  return false;
}

/**
 * Create a predictable, reasonably-unique zip filename.
 *
 * Example output: "my-mode-2025-08-14T12-34-56-789Z-k3jf2a.zip"
 * - `base` is used as the human-readable prefix
 * - ISO timestamp is used so files sort chronologically
 * - a short random hash reduces collisions when exporting multiple times per second
 */
export function generateZipName(base: string): string {
  // Convert current time to ISO and replace ':' and '.' with '-' so it's filesystem-safe.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // Small random string using base36. We slice to keep it short but still reasonably unique.
  const hash = Math.random().toString(36).slice(2, 8);

  // Combine the parts into a standard zip filename.
  return `${base}-${ts}-${hash}.zip`;
}


/**
 * Turn a byte count (number) into a human readable string.
 *
 * This is common UX when showing file sizes (e.g. "2.5 MB").
 * - We use binary multiples (1024) to match typical filesystem sizes
 * - We keep two decimal places but strip trailing ".00" for round numbers
 */
export function formatBytes(bytes: number): string {
  // Quick edge case: zero bytes
  if (bytes === 0) return '0 B';

  const k = 1024; // binary kilo
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  // i is the order of magnitude (0 => bytes, 1 => KB, 2 => MB, ...)
  // Math.log(bytes) / Math.log(k) calculates log base 1024 of bytes
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Defensive: if for some reason i is outside of sizes, clamp it.
  const idx = Math.min(Math.max(i, 0), sizes.length - 1);

  // Convert the number into the chosen unit and keep two decimals.
  const value = parseFloat((bytes / Math.pow(k, idx)).toFixed(2));

  // If the value has no fractional part (e.g. 2.00), drop the ".00" to show "2".
  const s = value % 1 === 0 ? value.toString().replace(/\.0+$/, '') : value.toString();

  // Return a combined string like "2.5 MB"
  return `${s} ${sizes[idx]}`;
}

/**
 * Attempt to extract the vault base path on desktop (FileSystemAdapter).
 *
 * Some Obsidian adapters expose helper methods like `getBasePath()` or a
 * `basePath` property. This helper checks common locations and falls back
 * to the current directory ('.') if none are available. The fallback keeps
 * code safe in non-desktop or browser-like environments.
 */
export function getVaultBasePath(app: App): string {
  const adapter: any = app?.vault?.adapter;
  try {
    // Preferred: an adapter method that returns an absolute path
    if (adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    // Some builds expose basePath as a string property
    if (adapter && typeof adapter.basePath === 'string') {
      return adapter.basePath;
    }
  } catch (_) {
    // Intentionally silent: if anything goes wrong, we'll return the fallback below.
  }

  // Safe fallback for environments where a real filesystem path is not available
  return '.';
}
