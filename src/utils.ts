import { App } from 'obsidian';

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
 * Calculate the combined size of a list of files inside the vault.
 *
 * Inputs:
 * - `app`: Obsidian App object so we can call into the vault adapter
 * - `files`: array of vault-relative paths to files
 *
 * Returns an object with:
 * - `totalBytes`: raw number of bytes summed across accessible files
 * - `fileCount`: how many files we successfully inspected
 * - `formattedSize`: human-friendly string (via `formatBytes`)
 *
 * Notes for beginners:
 * - We call the vault adapter's `stat` method which returns information about a path.
 * - If `stat` throws (file missing, permission error), we simply skip that file.
 */
export async function calculateModeSize(
  app: App,
  files: string[]
): Promise<{ totalBytes: number; fileCount: number; formattedSize: string }> {
  let totalBytes = 0; // accumulator for size
  let fileCount = 0; // how many files we counted

  for (const filePath of files) {
    try {
      // ask the vault adapter for metadata about the path
      const stat = await app.vault.adapter.stat(filePath);

      // stat.type === 'file' guards against directories and other types
      if (stat && stat.type === 'file') {
        // add the file size to the total and increment the counter
        totalBytes += stat.size;
        fileCount++;
      }
    } catch (error) {
      // stat can throw if the file doesn't exist or can't be accessed.
      // For this utility we treat inaccessible files as "skip and continue".
      // Beginners: you could log the error here during debugging, but we avoid
      // noisy output in normal operation.
      continue;
    }
  }

  return {
    totalBytes,
    fileCount,
    // provide the human-readable representation too for display purposes
    formattedSize: formatBytes(totalBytes)
  };
}


/**
 * Build glob/include/exclude patterns for a mode definition.
 *
 * Behavior:
 * - `mode.include` is an array of strings. Each string can be:
 *   - a glob pattern (contains *, ?, [], {}), which we pass through as-is
 *   - a path to a directory (e.g. "folder"), which we expand to recursive include "folder/**"
 *   - a single file path, which we include verbatim
 * - `mode.exclude` entries are prefixed with `!` so downstream glob processors will exclude them
 *
 * This function is intentionally tolerant: if we can't `stat` a path (missing or virtual file),
 * we fall back to the raw value the user supplied. That keeps behavior predictable.
 */
export async function buildPatterns(
  app: App,
  mode: { include?: string[]; exclude?: string[] }
): Promise<string[]> {
  const includes = mode.include || [];
  const patterns: string[] = [];

  for (const raw of includes) {
    // normalize and skip empty strings
    const p = (raw || '').trim();
    if (!p) continue;

    // If the pattern contains common glob characters, trust the user and pass it through.
    if (/[*?\[\]{}]/.test(p)) {
      patterns.push(p);
      continue;
    }

    try {
      // Try to stat the path. On desktop builds this will tell us if it's a directory.
      const st = await (app.vault.adapter as any).stat(p);

      if (st && st.type === 'directory') {
        // For directories, include everything recursively inside it.
        // We remove a trailing slash if present before appending '/**'.
        patterns.push(`${p.replace(/\/$/, '')}/**`);
      } else {
        // Not a directory (likely a file) — include it directly.
        patterns.push(p);
      }
    } catch (e) {
      // If stat fails (path doesn't exist in the adapter), don't block the operation.
      // Instead, pass the original pattern through. The caller's glob matcher
      // will decide if that pattern matches anything.
      patterns.push(p);
    }
  }

  // Add excludes, prefixed with '!' which is a common negation in glob lists.
  const excludes = mode.exclude || [];
  for (const ex of excludes) {
    const e = (ex || '').trim();
    if (!e) continue;
    patterns.push(`!${e}`);
  }

  return patterns;
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
