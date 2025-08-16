import { describe, it, expect, vi } from 'vitest';
import { createArchive } from '../src/archive';
import { makeFakeVault } from './test-utils';

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

describe('deleteOriginals rollback behavior', () => {
  it('restores deleted files when a batch fails mid-way', async () => {
    // Create a vault with three files. We'll force high-level delete to throw so
    // adapter.remove path is used; then make adapter.remove succeed for the
    // first file and throw for the second to simulate a mid-batch failure.
    const base = makeFakeVault({ 'X/a.txt': 'A', 'X/b.txt': 'B', 'X/c.txt': 'C' });
    const app: any = { vault: base.vault };

    // Ensure vault.delete throws to make deleteOriginals use adapter.remove
    app.vault.delete = async (_: any) => { throw new Error('fail delete'); };

    const origRemove = base.adapter.remove.bind(base.adapter);
    let call = 0;
    base.adapter.remove = async (p: string) => {
      call++;
      if (p === 'X/b.txt') {
        // Fail on second file to trigger batch error
        throw new Error('EPERM');
      }
      // succeed for others
      return origRemove(p);
    };

    // Create archive and request deleteOriginals so deletion will run and fail.
    const res = await createArchive(app, '.', 'Archive', 'X', ['X/a.txt','X/b.txt','X/c.txt'], { deleteOriginals: true, preserveBaseName: true });

    // After rollback, originals should be present again and the zip should exist
    expect(base.files.has('X/a.txt')).toBe(true);
    expect(base.files.has('X/b.txt')).toBe(true);
    expect(base.files.has('X/c.txt')).toBe(true);
    expect(base.files.has(res.zipPath)).toBe(true);
  });
});
