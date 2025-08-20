import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createArchive, restoreArchive } from '../src/archive';
import { makeFakeVault } from './test-utils';

vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  App: class {},
}));

describe('permissions and deletion behavior', () => {
  let chmodSpy: any;
  let fs: any;

  beforeEach(() => {
    fs = require('fs');
    chmodSpy = vi.spyOn(fs, 'chmod').mockImplementation((p: any, mode: any, cb: any) => cb && cb(null));
  });

  afterEach(() => {
    chmodSpy.mockRestore();
  });

  it('attempts to chmod zip, manifest, and restored files; zip entries are created with unixPermissions', async () => {
    const { vault, adapter, files } = makeFakeVault({
      'Folder/a.txt': 'A',
      'Folder/b.md': '# B',
    });
    // Provide basePath and path so tryChmod666 can compute absolute paths
    (adapter as any).basePath = process.cwd();
    (adapter as any).path = require('path');
    const app: any = { vault };

  // Spy on JSZip prototype to capture options passed to file()
  const JSZip = require('jszip');
  const fileSpy = vi.spyOn(JSZip.prototype as any, 'file');

  const res = await createArchive(app, '.', 'Archive', 'Folder', ['Folder/a.txt', 'Folder/b.md']);
    // zip and manifest created
    expect(files.has(res.zipPath)).toBe(true);
    expect(files.has(res.zipPath + '.manifest.json')).toBe(true);

    // chmod should have been attempted for zip and manifest
    const path = require('path');
    const absZip = path.join(process.cwd(), res.zipPath);
    const absManifest = path.join(process.cwd(), res.zipPath + '.manifest.json');
    const calledWithAbsZip = chmodSpy.mock.calls.some((c: any[]) => c[0] === absZip && c[1] === 0o666);
    const calledWithAbsManifest = chmodSpy.mock.calls.some((c: any[]) => c[0] === absManifest && c[1] === 0o666);
    expect(calledWithAbsZip).toBe(true);
    expect(calledWithAbsManifest).toBe(true);

    // Inspect calls to JSZip.file to ensure unixPermissions were supplied
    const hasPerms = fileSpy.mock.calls.some((call: any[]) => {
      const opts = call[2];
      const up = opts && opts.unixPermissions;
      return typeof up === 'number' && ((up === 0o644) || ((up & 0o777) === 0o644) || (up === 0o100644));
    });
    expect(hasPerms).toBe(true);
    fileSpy.mockRestore();

    // Now restore and expect chmod on restored file(s)
  await restoreArchive(app, res.zipPath);
    const restoredAbsA = path.join(process.cwd(), 'Folder/a.txt');
    const restoredAbsB = path.join(process.cwd(), 'Folder/b.md');
    const chmodOnRestore = chmodSpy.mock.calls.some((c: any[]) => (c[0] === restoredAbsA || c[0] === restoredAbsB) && c[1] === 0o666);
    expect(chmodOnRestore).toBe(true);
  });
});
