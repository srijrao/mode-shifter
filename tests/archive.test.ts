import { describe, it, expect, vi } from 'vitest';
import { createArchive, verifyZipIntegrity, restoreArchive } from '../src/archive';
import { makeFakeVault } from './test-utils';

vi.mock('obsidian', () => ({
  App: class {},
}));

function text(str: string){ return new TextEncoder().encode(str); }

describe('archive module', () => {
  it('creates a zip and manifest and verifies integrity', async () => {
    const { vault, adapter, files } = makeFakeVault({
      'Folder/a.txt': 'A',
      'Folder/b.txt': 'B'
    });
  const app: any = { vault };

  const res = await createArchive(app, '.', 'Archive', 'Folder', ['Folder/a.txt','Folder/b.txt']);
    expect(res.zipPath.startsWith('Archive/')).toBe(true);
    expect(files.has(res.zipPath)).toBe(true);
    expect(files.has(res.zipPath + '.manifest.json')).toBe(true);

    const verify = await verifyZipIntegrity(app as any, res.zipPath, ['Folder/a.txt','Folder/b.txt']);
    expect(verify.isValid).toBe(true);
    expect(verify.fileCount).toBe(2);
  });

  it('restores with skip/overwrite/conflict-copy policies', async () => {
  const base = makeFakeVault({ 'x/a.txt': 'old' });
  const app: any = { vault: base.vault };
  const res = await createArchive(app, '.', 'Archive', 'x', ['x/a.txt']);

    // overwrite
    base.files.set('x/a.txt', text('existing'));
  await restoreArchive(app, res.zipPath, { policy: 'overwrite' });
    const t1 = new TextDecoder().decode(base.files.get('x/a.txt')!);
    expect(t1).toBe('old');

    // skip
    base.files.set('x/a.txt', text('existing2'));
  await restoreArchive(app, res.zipPath, { policy: 'skip' });
    const t2 = new TextDecoder().decode(base.files.get('x/a.txt')!);
    expect(t2).toBe('existing2');

    // conflict-copy
    base.files.set('x/a.txt', text('existing3'));
  await restoreArchive(app, res.zipPath, { policy: 'conflict-copy' });
    const copies = Array.from(base.files.keys()).filter(k => k.startsWith('x/a-conflict-') && k.endsWith('.txt'));
    expect(copies.length).toBe(1);
  });
});
