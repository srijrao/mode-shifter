import { describe, it, expect, vi } from 'vitest';
import ArchiverPlugin from '../main.ts';
import { makeFakeVault } from './test-utils';
import * as archiveMod from '../src/archive';

vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  Modal: class {},
  Setting: class {},
  PluginSettingTab: class {},
  Plugin: class {},
  App: class {},
  TFolder: class {},
  TAbstractFile: class {},
}));

describe('group unzip matching and deleteOriginals robustness', () => {
  it('finds group archives by slugified group name prefix', async () => {
    const { vault } = makeFakeVault({
      'f1/a.txt': 'A',
      'f2/b.txt': 'B',
    });

    const plugin: any = new (ArchiverPlugin as any)({ vault });
    (plugin as any).app = { vault };
    plugin.settings = { archiveFolder: 'Archive', archiveInPlace: false, restorePolicy: 'overwrite', deleteOriginalFolder: false, deleteArchiveAfterRestore: false, folderGroups: [] };

    // Create an archive with a spaced group name to ensure slug is used
    const res = await archiveMod.createArchive(plugin.app, '.', 'Archive', 'My Group', ['f1/a.txt','f2/b.txt'], { preserveBaseName: true });
    expect(res.zipPath).toMatch(/^Archive\/My-Group-.*\.zip$/);

    // Now call unzipFolderGroup and expect it to select our archive without modal
    const restoreSpy = vi.spyOn(archiveMod, 'restoreArchive').mockResolvedValue(undefined as any);
    await plugin.unzipFolderGroup({ name: 'My Group', folders: [] });
    expect(restoreSpy).toHaveBeenCalled();
    expect(restoreSpy.mock.calls[0][1]).toBe(res.zipPath);
  });

  it('deleteOriginals retries and proceeds when adapter.remove initially fails', async () => {
    // Build a vault where adapter.remove fails a couple times then succeeds
    const base = makeFakeVault({ 'X/a.txt': 'A', 'X/b.txt': 'B' });
    const app: any = { vault: base.vault };

    let attempts = 0;
    const origRemove = base.adapter.remove;
    base.adapter.remove = async (p: string) => {
      if (p.startsWith('X/')){
        attempts++;
        if (attempts < 3) throw new Error('EPERM');
      }
      return origRemove(p);
    };

    const res = await archiveMod.createArchive(app, '.', 'Archive', 'X', ['X/a.txt','X/b.txt'], { deleteOriginals: true, preserveBaseName: true, perFileTimeoutMs: 5000 });
    // originals should be gone eventually
    expect(base.files.has('X/a.txt')).toBe(false);
    expect(base.files.has('X/b.txt')).toBe(false);
    expect(base.files.has(res.zipPath)).toBe(true);
  });
});
