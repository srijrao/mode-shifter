import { describe, it, expect, vi } from 'vitest';
import { createArchive } from '../src/archive';
import { makeFakeVault } from './test-utils';

vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  App: class {},
}));

describe('original file deletion behavior', () => {
  it('deletes original files when deleteOriginals option is true', async () => {
    const { vault, files } = makeFakeVault({
      'SourceFolder/file1.txt': 'Content 1',
      'SourceFolder/file2.md': '# Markdown',
      'SourceFolder/subfolder/file3.txt': 'Content 3'
    });
    const app: any = { vault };

    // Verify files exist before archiving
    expect(files.has('SourceFolder/file1.txt')).toBe(true);
    expect(files.has('SourceFolder/file2.md')).toBe(true);
    expect(files.has('SourceFolder/subfolder/file3.txt')).toBe(true);

    // Create archive with deleteOriginals enabled
    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'SourceFolder', 
      ['SourceFolder/file1.txt', 'SourceFolder/file2.md', 'SourceFolder/subfolder/file3.txt'],
      { deleteOriginals: true }
    );

    // Verify archive was created
    expect(files.has(result.zipPath)).toBe(true);

    // Verify original files were deleted
    expect(files.has('SourceFolder/file1.txt')).toBe(false);
    expect(files.has('SourceFolder/file2.md')).toBe(false);
    expect(files.has('SourceFolder/subfolder/file3.txt')).toBe(false);
  });

  it('preserves original files when deleteOriginals option is false', async () => {
    const { vault, files } = makeFakeVault({
      'SourceFolder/file1.txt': 'Content 1',
      'SourceFolder/file2.md': '# Markdown'
    });
    const app: any = { vault };

    // Create archive with deleteOriginals disabled (default)
    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'SourceFolder', 
      ['SourceFolder/file1.txt', 'SourceFolder/file2.md']
      // deleteOriginals defaults to false
    );

    // Verify archive was created
    expect(files.has(result.zipPath)).toBe(true);

    // Verify original files were preserved
    expect(files.has('SourceFolder/file1.txt')).toBe(true);
    expect(files.has('SourceFolder/file2.md')).toBe(true);
  });

  it('preserves original files when deleteOriginals option is explicitly false', async () => {
    const { vault, files } = makeFakeVault({
      'SourceFolder/file1.txt': 'Content 1',
      'SourceFolder/file2.md': '# Markdown'
    });
    const app: any = { vault };

    // Create archive with deleteOriginals explicitly disabled
    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'SourceFolder', 
      ['SourceFolder/file1.txt', 'SourceFolder/file2.md'],
      { deleteOriginals: false }
    );

    // Verify archive was created
    expect(files.has(result.zipPath)).toBe(true);

    // Verify original files were preserved
    expect(files.has('SourceFolder/file1.txt')).toBe(true);
    expect(files.has('SourceFolder/file2.md')).toBe(true);
  });

  it('handles mixed file deletion scenarios correctly', async () => {
    const { vault, files } = makeFakeVault({
      'FolderA/file1.txt': 'Content A1',
      'FolderA/file2.txt': 'Content A2',
      'FolderB/file1.txt': 'Content B1',
      'FolderB/file2.txt': 'Content B2'
    });
    const app: any = { vault };

    // Archive FolderA with deletion
    const resultA = await createArchive(
      app, 
      '.', 
      'Archive', 
      'FolderA', 
      ['FolderA/file1.txt', 'FolderA/file2.txt'],
      { deleteOriginals: true }
    );

    // Archive FolderB without deletion  
    const resultB = await createArchive(
      app, 
      '.', 
      'Archive', 
      'FolderB', 
      ['FolderB/file1.txt', 'FolderB/file2.txt'],
      { deleteOriginals: false }
    );

    // Verify both archives created
    expect(files.has(resultA.zipPath)).toBe(true);
    expect(files.has(resultB.zipPath)).toBe(true);

    // Verify FolderA files deleted
    expect(files.has('FolderA/file1.txt')).toBe(false);
    expect(files.has('FolderA/file2.txt')).toBe(false);

    // Verify FolderB files preserved
    expect(files.has('FolderB/file1.txt')).toBe(true);
    expect(files.has('FolderB/file2.txt')).toBe(true);
  });
});
