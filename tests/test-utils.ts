// Small helpers to build a fake vault + adapter for unit tests
export function makeFakeVault(initialFiles: Record<string, Uint8Array | string> = {}) {
  const files = new Map<string, Uint8Array>();
  for (const [p, v] of Object.entries(initialFiles)) {
    files.set(p, typeof v === 'string' ? new TextEncoder().encode(v) : v);
  }
  const folders = new Set<string>();
  const ensureFolders = (p: string) => {
    const parts = p.split('/');
    let cur = '';
    for (let i=0;i<parts.length-1;i++){
      cur = cur ? `${cur}/${parts[i]}` : parts[i];
      folders.add(cur);
    }
  };
  for (const p of files.keys()) ensureFolders(p);

  const adapter = {
    async readBinary(p: string){
      const v = files.get(p);
      if (!v) throw new Error('ENOENT ' + p);
      return v;
    },
    async writeBinary(p: string, ab: ArrayBuffer){
      ensureFolders(p);
      files.set(p, new Uint8Array(ab));
    },
    async write(p: string, s: string){
      ensureFolders(p);
      files.set(p, new TextEncoder().encode(s));
    },
    async remove(p: string){ files.delete(p); },
    async rmdir(p: string, recursive: boolean){
      // Remove folder by deleting contained files if recursive, else throw if any child exists
      const prefix = p.endsWith('/') ? p : p + '/';
      const hasChildren = Array.from(files.keys()).some(k => k.startsWith(prefix));
      if (hasChildren && !recursive) throw new Error('ENOTEMPTY');
      if (recursive){
        for (const k of Array.from(files.keys())) if (k.startsWith(prefix)) files.delete(k);
      }
      folders.delete(p);
    },
    async stat(p: string){ return { mtime: 1 } },
  };

  const vault = {
    adapter,
    getAllLoadedFiles(){
      return Array.from(files.keys()).map(p => ({ path: p }));
    },
    getAbstractFileByPath(p: string){
      if (files.has(p)) return { path: p } as any;
      return undefined;
    },
    async createFolder(p: string){ folders.add(p); },
    async delete(af: any){ files.delete(af.path); },
  };

  return { files, folders, vault, adapter };
}
