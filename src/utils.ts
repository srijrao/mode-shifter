import { App } from 'obsidian';

export function generateZipName(base: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const hash = Math.random().toString(36).slice(2,8);
  return `${base}-${ts}-${hash}.zip`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  // drop trailing .00
  const s = value % 1 === 0 ? value.toString().replace(/\.0+$/, '') : value.toString();
  return `${s} ${sizes[i]}`;
}

export async function calculateModeSize(app: App, files: string[]): Promise<{ totalBytes: number; fileCount: number; formattedSize: string }> {
  let totalBytes = 0;
  let fileCount = 0;
  
  for (const filePath of files) {
    try {
      const stat = await app.vault.adapter.stat(filePath);
      if (stat && stat.type === 'file') {
        totalBytes += stat.size;
        fileCount++;
      }
    } catch (error) {
      // File doesn't exist or can't be accessed, skip it
      continue;
    }
  }
  
  return {
    totalBytes,
    fileCount,
    formattedSize: formatBytes(totalBytes)
  };
}

// Helper: build patterns for a mode.
// If the user supplied a plain folder name (no glob chars), treat it as a recursive include (folder/**).
export async function buildPatterns(app: App, mode: { include?: string[]; exclude?: string[] }): Promise<string[]> {
  const includes = mode.include || [];
  const patterns: string[] = [];
  for (const raw of includes) {
    const p = (raw || '').trim();
    if (!p) continue;
    if (/[*?\[\]{}]/.test(p)) {
      patterns.push(p);
      continue;
    }
    try {
      const st = await (app.vault.adapter as any).stat(p);
      if (st && st.type === 'directory') {
        patterns.push(`${p.replace(/\/$/, '')}/**`);
      } else {
        patterns.push(p);
      }
    } catch (e) {
      patterns.push(p);
    }
  }
  const excludes = mode.exclude || [];
  for (const ex of excludes) {
    const e = (ex || '').trim();
    if (!e) continue;
    patterns.push(`!${e}`);
  }
  return patterns;
}

// Helper: get vault base path on desktop (FileSystemAdapter). Fallback to current dir for safety.
export function getVaultBasePath(app: App): string {
  const adapter: any = app?.vault?.adapter;
  try {
    if (adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    // Some builds expose basePath directly
    if (adapter && typeof adapter.basePath === 'string') {
      return adapter.basePath;
    }
  } catch (_) {
    // ignore and fallback
  }
  return '.';
}
