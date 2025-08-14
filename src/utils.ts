import { App } from 'obsidian';

export function generateZipName(base: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const hash = Math.random().toString(36).slice(2,8);
  return `${base}-${ts}-${hash}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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
