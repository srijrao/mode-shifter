import { describe, it, expect, vi, beforeAll } from 'vitest';
vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  Modal: class {},
  Setting: class {},
  PluginSettingTab: class {},
  Plugin: class {},
  App: class {},
}));
let ArchiverPlugin: any;
beforeAll(async () => {
  // Import the TypeScript source so Vitest can apply the obsidian alias mock
  ArchiverPlugin = (await import('../main')).default as any;
});

describe('deleteFolderSafely', () => {
  it('uses fallback rmdir when vault.delete fails', async () => {
  const logs: string[] = [];
    const vault = {
      adapter: {
        async rmdir(p: string, recursive: boolean){ logs.push(`rmdir:${p}:${recursive}`); },
      },
      async delete(_: any){ throw new Error('fail'); },
    };
  const fakePlugin: any = { app: { vault }, settings: { deleteArchiveAfterRestore: true } };
  const folder: any = { path: 'Folder', name: 'Folder', children: [] };
  const ok = await (ArchiverPlugin.prototype as any).deleteFolderSafely.call(fakePlugin, folder);
    expect(ok).toBe(true);
    expect(logs).toContain('rmdir:Folder:true');
  });

  it('retries rmdir on EPERM and succeeds', async () => {
    let nonRecursiveAttempts = 0;
    const vault = {
      adapter: {
        async rmdir(p: string, recursive: boolean){
          // Force the adapter recursive delete to fail so we hit the fallback path
          if (recursive) throw new Error('EPERM');
          nonRecursiveAttempts++;
          if (nonRecursiveAttempts < 2) throw new Error('EPERM');
        },
      },
      async delete(_: any){ throw new Error('fail'); },
      getAbstractFileByPath(){ return undefined; }
    };
  const fakePlugin: any = { app: { vault } };
  const folder: any = { path: 'Folder', name: 'Folder', children: [] };
  // stub content deletion to no-op
  (fakePlugin as any).deleteContentsRecursively = async () => {};
  const ok = await (ArchiverPlugin.prototype as any).deleteFolderSafely.call(fakePlugin, folder);
    expect(ok).toBe(true);
  expect(nonRecursiveAttempts).toBeGreaterThanOrEqual(2);
  });
});
