import { describe, it, expect } from 'vitest';
import ArchiverPlugin from '../main.ts';

function makePlugin(vault: any){
  const plugin: any = new (ArchiverPlugin as any)({ vault });
  // In tests, the mock Plugin may not assign app; ensure methods can access vault
  (plugin as any).app = { vault };
  plugin.settings = { archiveFolder: 'Archive', archiveInPlace: false, restorePolicy: 'overwrite', deleteOriginalFolder: false, deleteArchiveAfterRestore: true, folderGroups: [] };
  return plugin as any;
}

describe('findAllArchives', () => {
  it('discovers .zip files and ignores plugin folder', async () => {
    const vault = {
      adapter: { async stat(){ return { mtime: 123 }; } },
      getAllLoadedFiles(){
        return [
          { path: 'Archive/a.zip' },
          { path: '.obsidian/plugins/mode-shifter/temp.zip' },
          { path: 'nested/b/c.zip' },
          { path: 'notes.md' },
        ];
      },
    };
    const plugin = makePlugin(vault);
    const archives = await plugin.findAllArchives();
    expect(archives.map((a:any)=>a.path).sort()).toEqual(['Archive/a.zip','nested/b/c.zip']);
  });
});
