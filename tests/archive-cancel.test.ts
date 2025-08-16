import { describe, it, expect, vi } from 'vitest';
import { createArchive, restoreArchive } from '../src/archive';
import { CancellationToken } from '../src/progress-modal';
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

describe('archive cancellation integration', () => {
  it('throws when cancellation token cancelled during createArchive loop', async () => {
    const { vault } = makeFakeVault({ 'A/a.txt': 'a', 'A/b.txt': 'b', 'A/c.txt': 'c' });
    const app: any = { vault };
    const token = new CancellationToken();

    // Cause cancellation after first file read by stubbing onProgress
    const onProgress = (done:number) => { if (done >= 1) token.cancel(); };

    await expect(createArchive(app, '.', 'Archive', 'A', ['A/a.txt','A/b.txt','A/c.txt'], { onProgress, cancellationToken: token })).rejects.toThrow(/cancelled|Operation was cancelled/i);
  });

  it('throws when cancellation token cancelled during restoreArchive', async () => {
    const base = makeFakeVault({ 'X/a.txt': 'old' });
    const app: any = { vault: base.vault };

    // Create an archive for X
    const res = await createArchive(app, '.', 'Archive', 'X', ['X/a.txt']);

    const token = new CancellationToken();
    // stub adapter.readBinary to cancel after starting
    const origRead = base.adapter.readBinary.bind(base.adapter);
    let first = true;
    base.adapter.readBinary = async (p: string) => {
      const v = await origRead(p);
      if (first) { token.cancel(); first = false; }
      return v;
    };

    await expect(restoreArchive(app, res.zipPath, { cancellationToken: token })).rejects.toThrow(/cancelled|Operation was cancelled/i);
  });
});
