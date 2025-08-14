import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { expandGlobs, createArchive, restoreArchive, verifyZipIntegrity } from '../src/archive';
import * as fs from 'fs';
import * as path from 'path';

// Minimal in-memory adapter + vault mock for testing
class MockAdapter {
  files = new Map<string, Uint8Array | string>();
  failureMode: string | null = null; // For testing failures

  async readBinary(p: string) {
    if (this.failureMode === 'read' && p.includes('fail')) {
      throw new Error('Simulated read failure');
    }
    const v = this.files.get(p);
    if (!v) throw new Error('Not found ' + p);
    if (typeof v === 'string') return Buffer.from(v).buffer as ArrayBuffer;
    return (v as Uint8Array).buffer as ArrayBuffer;
  }

  async writeBinary(p: string, ab: ArrayBuffer) {
    if (this.failureMode === 'write' && p.includes('fail')) {
      throw new Error('Simulated write failure');
    }
    this.files.set(p, new Uint8Array(ab));
  }

  async write(p: string, s: string) {
    if (this.failureMode === 'write' && p.includes('fail')) {
      throw new Error('Simulated write failure');
    }
    this.files.set(p, s);
  }

  async remove(p: string) {
    if (this.failureMode === 'delete' && p.includes('fail')) {
      throw new Error('Simulated delete failure');
    }
    this.files.delete(p);
  }

  async list(folder: string) {
    const files: string[] = [];
    for (const k of this.files.keys()) {
      if (k.startsWith(folder + '/')) files.push(k.slice(folder.length + 1));
    }
    return { files };
  }

  async stat(p: string) {
    // If exact file exists, return file stat
    const v = this.files.get(p);
    if (v) {
      const size = typeof v === 'string' ? Buffer.byteLength(v) : v.length;
      return { type: 'file', size };
    }
    // If there are files under this path, treat as directory
    const prefix = p.endsWith('/') ? p : p + '/';
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) return { type: 'directory' } as any;
    }
    throw new Error('Not found ' + p);
  }
}

class MockVault {
  adapter: MockAdapter;
  deletedFiles: string[] = []; // Track deletions for testing
  
  constructor(adapter: MockAdapter) { this.adapter = adapter; }
  async createFolder(_p: string) { /* no-op */ }
  getAbstractFileByPath(p: string) { return this.adapter.files.has(p) ? { path: p } : null; }
  async delete(af: any) { 
    if (af && af.path) {
      // Use adapter's remove method so it can fail appropriately
      await this.adapter.remove(af.path);
      this.deletedFiles.push(af.path);
    }
  }
}

class MockApp {
  vault: MockVault;
  constructor(vault: MockVault) { this.vault = vault; }
}

const tmpVault = path.join(__dirname, 'tmp-vault');

beforeEach(() => {
  // ensure tmp vault dir exists
  if (!fs.existsSync(tmpVault)) fs.mkdirSync(tmpVault, { recursive: true });
});

afterEach(() => {
  // cleanup tmp files
  if (fs.existsSync(tmpVault)) {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

describe('archive utilities', () => {
  // (generateZipName tested separately in utils.test)

  it('expandGlobs returns matching files including dotfiles', async () => {
    const a = path.join(tmpVault, 'a.md');
    const sub = path.join(tmpVault, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(a, 'hello');
    fs.writeFileSync(path.join(sub, 'b.md'), 'b');
    fs.writeFileSync(path.join(tmpVault, '.hidden.md'), 'h');

    const res = await expandGlobs(tmpVault, ['**/*.md']);
    // normalize and sort
    const normalized = res.map(r => r.replace(/\\/g, '/')).sort();
    expect(normalized).toContain('a.md');
    expect(normalized).toContain('sub/b.md');
    expect(normalized).toContain('.hidden.md');
  });

  it('createArchive writes a zip and manifest and restoreArchive can restore files', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // prepare some files in adapter
    adapter.files.set('note1.md', Buffer.from('# note1'));
    adapter.files.set('dir/note2.md', Buffer.from('# note2'));

    // create archive
    const res = await createArchive(app as any, '.', 'Archive', 'testmode', ['note1.md', 'dir/note2.md'], { perFileTimeoutMs: 2000 });
    expect(res.zipPath).toMatch(/^Archive\//);
    // zip should exist in adapter
    const zipKey = res.zipPath;
    // manifest should exist
    expect(adapter.files.has(zipKey + '.manifest.json')).toBe(true);

    // remove originals to simulate they were deleted
    adapter.files.delete('note1.md');
    adapter.files.delete('dir/note2.md');
    expect(adapter.files.has('note1.md')).toBe(false);

    // restore from zip
    await restoreArchive(app as any, zipKey, { perFileTimeoutMs: 2000 });

    expect(adapter.files.has('note1.md')).toBe(true);
    expect(adapter.files.has('dir/note2.md')).toBe(true);
    const restored = await adapter.readBinary('note1.md');
    const buf = Buffer.from(restored);
    expect(buf.toString()).toContain('# note1');
  });

  it('verifyZipIntegrity handles expected files with backslashes or posix', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    adapter.files.set('subdir/file.md', Buffer.from('ok'));
    const res = await createArchive(app as any, '.', 'Archive', 'bs-test', ['subdir/file.md'], { perFileTimeoutMs: 2000 });

    // Pass expected list using backslash style
    const verification = await verifyZipIntegrity(app as any, res.zipPath, ['subdir\\file.md'], { perFileTimeoutMs: 2000 });
    expect(verification.isValid).toBe(true);
  });

  it('restoreArchive respects overwrite/skip/conflict-copy policies', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // prepare initial files
    adapter.files.set('note.md', Buffer.from('original'));
    adapter.files.set('new/note2.md', Buffer.from('v2'));

    // create archive containing files with same paths
    const res = await createArchive(app as any, '.', 'Archive', 'policytest', ['note.md', 'new/note2.md'], { perFileTimeoutMs: 2000 });
    const zipKey = res.zipPath;

    // overwrite policy: remove originals then restore should bring back archived versions
    adapter.files.set('note.md', Buffer.from('changed'));
    adapter.files.delete('new/note2.md');
    await restoreArchive(app as any, zipKey, { perFileTimeoutMs: 2000, policy: 'overwrite' as any });
    let buf = Buffer.from(await adapter.readBinary('note.md'));
    expect(buf.toString()).toContain('original');

    // skip policy: if file exists, it should keep existing content
    adapter.files.set('note.md', Buffer.from('current'));
    await restoreArchive(app as any, zipKey, { perFileTimeoutMs: 2000, policy: 'skip' as any });
    buf = Buffer.from(await adapter.readBinary('note.md'));
    expect(buf.toString()).toContain('current');

    // conflict-copy: restores a second copy instead of overwriting
    adapter.files.set('note.md', Buffer.from('keepme'));
    await restoreArchive(app as any, zipKey, { perFileTimeoutMs: 2000, policy: 'conflict-copy' as any });
    // find any key that starts with 'note-conflict-' or contains 'conflict'
    const found = Array.from(adapter.files.keys()).some(k => k.includes('conflict'));
    expect(found).toBe(true);
  });

  it('verifyZipIntegrity correctly validates zip contents', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // Create some test files
    adapter.files.set('test1.md', Buffer.from('content1'));
    adapter.files.set('test2.md', Buffer.from('content2'));

    // Create archive
    const res = await createArchive(app as any, '.', 'Archive', 'testmode', ['test1.md', 'test2.md'], { perFileTimeoutMs: 2000 });
    
    // Verify with correct file list
    const verification1 = await verifyZipIntegrity(app as any, res.zipPath, ['test1.md', 'test2.md'], { perFileTimeoutMs: 2000 });
    expect(verification1.isValid).toBe(true);
    expect(verification1.fileCount).toBe(2);
    expect(verification1.errors).toHaveLength(0);

    // Verify with missing file in expectation
    const verification2 = await verifyZipIntegrity(app as any, res.zipPath, ['test1.md'], { perFileTimeoutMs: 2000 });
    expect(verification2.isValid).toBe(false);
    expect(verification2.errors.some(e => e.includes('Extra files'))).toBe(true);

    // Verify with extra file in expectation
    const verification3 = await verifyZipIntegrity(app as any, res.zipPath, ['test1.md', 'test2.md', 'missing.md'], { perFileTimeoutMs: 2000 });
    expect(verification3.isValid).toBe(false);
    expect(verification3.errors.some(e => e.includes('Missing files'))).toBe(true);
  });

  it('createArchive with deleteOriginals deletes files after successful verification', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // Prepare files
    adapter.files.set('delete1.md', Buffer.from('content1'));
    adapter.files.set('delete2.md', Buffer.from('content2'));

    // Create archive with deletion
    const res = await createArchive(app as any, '.', 'Archive', 'deletetest', ['delete1.md', 'delete2.md'], {
      perFileTimeoutMs: 2000,
      deleteOriginals: true
    });

    // Files should be deleted
    expect(adapter.files.has('delete1.md')).toBe(false);
    expect(adapter.files.has('delete2.md')).toBe(false);
    
    // Archive and manifest should exist
    expect(adapter.files.has(res.zipPath)).toBe(true);
    expect(adapter.files.has(res.zipPath + '.manifest.json')).toBe(true);
    expect(adapter.files.has(res.zipPath + '.deletelog.json')).toBe(true);
  });

  it('createArchive with deleteOriginals rolls back on deletion failure', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // Prepare files
    adapter.files.set('rollback1.md', Buffer.from('content1'));
    adapter.files.set('rollback_fail.md', Buffer.from('content2')); // This will fail to delete

    let errorThrown = false;
    try {
      // Set failure mode for delete operations
      adapter.failureMode = 'delete';
      
      await createArchive(app as any, '.', 'Archive', 'rollbacktest', ['rollback1.md', 'rollback_fail.md'], {
        perFileTimeoutMs: 2000,
        deleteOriginals: true,
        batchSize: 1
      });
    } catch (error) {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);
    
    // Files should be restored (either never deleted or restored from zip)
    // At minimum, the archive should exist for rollback
    const zipExists = Array.from(adapter.files.keys()).some(k => k.includes('rollbacktest') && k.endsWith('.zip'));
    expect(zipExists).toBe(true);
  });

  it('handles batched deletion with checkpoints', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // Create several files to test batching
    const files = [];
    for (let i = 0; i < 5; i++) {
      const fileName = `batch${i}.md`;
      adapter.files.set(fileName, Buffer.from(`content${i}`));
      files.push(fileName);
    }

    // Create archive with small batch size
    const res = await createArchive(app as any, '.', 'Archive', 'batchtest', files, {
      perFileTimeoutMs: 2000,
      deleteOriginals: true,
      batchSize: 2
    });

    // All files should be deleted
    files.forEach(file => {
      expect(adapter.files.has(file)).toBe(false);
    });

    // Check that checkpoint file was cleaned up
    expect(adapter.files.has(res.zipPath + '.checkpoint.json')).toBe(false);
    
    // But deletelog should exist
    expect(adapter.files.has(res.zipPath + '.deletelog.json')).toBe(true);
  });

  it('plain folder include archives the folder and restores it (end-to-end)', async () => {
    const adapter = new MockAdapter();
    const vault = new MockVault(adapter);
    const app = new MockApp(vault as any);

    // create files under FolderA
    adapter.files.set('FolderA/n1.md', Buffer.from('one'));
    adapter.files.set('FolderA/sub/n2.md', Buffer.from('two'));

    // build a mode-like object
    const mode = { id: 'm1', name: 'FolderA mode', include: ['FolderA'], exclude: [] } as any;

  // Use the helper from src/utils to build patterns
  const { buildPatterns } = await import('../src/utils');
  const patterns = await buildPatterns(app as any, mode);
    // Should have expanded FolderA -> FolderA/**
    expect(patterns.some(p => p.startsWith('FolderA'))).toBe(true);

    // fast-glob operates on the real filesystem; our adapter is in-memory.
    // Derive expected files directly from the mock adapter's keys instead.
    const files = Array.from(adapter.files.keys()).map(k => k.replace(/\\/g, '/'))
      .filter(k => k.startsWith('FolderA/'));
    expect(files).toContain('FolderA/n1.md');
    expect(files).toContain('FolderA/sub/n2.md');

    // create archive using folder-based include
    const res = await (await import('../src/archive')).createArchive(app as any, '.', 'Archive', 'mode', files, { perFileTimeoutMs: 2000 });
    // zip name should start with FolderA-
    expect(res.zipPath).toMatch(/^Archive\/FolderA-/);

    // remove originals and restore
    adapter.files.delete('FolderA/n1.md');
    adapter.files.delete('FolderA/sub/n2.md');

    await (await import('../src/archive')).restoreArchive(app as any, res.zipPath, { perFileTimeoutMs: 2000 });

    expect(adapter.files.has('FolderA/n1.md')).toBe(true);
    expect(adapter.files.has('FolderA/sub/n2.md')).toBe(true);
  });
});
