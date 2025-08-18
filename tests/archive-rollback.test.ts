import { describe, it, expect, vi } from 'vitest';
import { createArchive, restoreArchive } from '../src/archive';
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
  it('can restore files from zip using restoreArchive', async () => {
    // First test that basic restore functionality works
    const base = makeFakeVault({ 'X/a.txt': 'A', 'X/b.txt': 'B', 'X/c.txt': 'C' });
    const app: any = { vault: base.vault };

    // Create archive
    const res = await createArchive(app, '.', 'Archive', 'X', ['X/a.txt','X/b.txt','X/c.txt'], { preserveBaseName: true });
    
    // Delete original files manually
    base.files.delete('X/a.txt');
    base.files.delete('X/b.txt');
    base.files.delete('X/c.txt');
    
    // Verify files are gone
    expect(base.files.has('X/a.txt')).toBe(false);
    expect(base.files.has('X/b.txt')).toBe(false);
    expect(base.files.has('X/c.txt')).toBe(false);
    
    // Restore from archive
    await restoreArchive(app, res.zipPath);
    
    // Files should be restored
    expect(base.files.has('X/a.txt')).toBe(true);
    expect(base.files.has('X/b.txt')).toBe(true);
    expect(base.files.has('X/c.txt')).toBe(true);
  });

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
    // This should fail and trigger rollback, restoring all files.
    await expect(
      createArchive(app, '.', 'Archive', 'X', ['X/a.txt','X/b.txt','X/c.txt'], { deleteOriginals: true, preserveBaseName: true })
    ).rejects.toThrow(/Failed to delete.*files in batch/);

    // After rollback, all original files should be present again
    expect(base.files.has('X/a.txt')).toBe(true);
    expect(base.files.has('X/b.txt')).toBe(true);
    expect(base.files.has('X/c.txt')).toBe(true);
  });
});
