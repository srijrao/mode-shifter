import { describe, it, expect, vi } from 'vitest';
import { createArchive, verifyZipIntegrity } from '../src/archive';
import { makeFakeVault } from './test-utils';
import JSZip from 'jszip';

vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  App: class {},
}));

describe('archive content validation', () => {
  it('ensures zip files contain actual file content, not empty archives', async () => {
    // Create vault with test files
    const { vault, files } = makeFakeVault({
      'TestFolder/file1.txt': 'Content of file 1',
      'TestFolder/file2.md': '# Markdown content\n\nThis is a test file.',
      'TestFolder/subfolder/file3.txt': 'Content in subfolder'
    });
    const app: any = { vault };

    // Create archive
    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'TestFolder', 
      ['TestFolder/file1.txt', 'TestFolder/file2.md', 'TestFolder/subfolder/file3.txt']
    );

    // Verify archive was created
    expect(files.has(result.zipPath)).toBe(true);
    expect(result.zipPath.startsWith('Archive/')).toBe(true);

    // Get the zip binary data
    const zipData = files.get(result.zipPath)!;
    expect(zipData).toBeDefined();
    expect(zipData.length).toBeGreaterThan(0);

    // Load the zip file and verify contents
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipData);

    // Check that all files exist in the zip
    expect(loadedZip.file('TestFolder/file1.txt')).toBeTruthy();
    expect(loadedZip.file('TestFolder/file2.md')).toBeTruthy();
    expect(loadedZip.file('TestFolder/subfolder/file3.txt')).toBeTruthy();

    // Verify file contents match original
    const file1Content = await loadedZip.file('TestFolder/file1.txt')?.async('text');
    const file2Content = await loadedZip.file('TestFolder/file2.md')?.async('text');
    const file3Content = await loadedZip.file('TestFolder/subfolder/file3.txt')?.async('text');

    expect(file1Content).toBe('Content of file 1');
    expect(file2Content).toBe('# Markdown content\n\nThis is a test file.');
    expect(file3Content).toBe('Content in subfolder');

    // Verify the zip is not empty - count only files, not directory entries
    const actualFiles = Object.keys(loadedZip.files).filter(path => !loadedZip.files[path].dir);
    expect(actualFiles.length).toBe(3);

    // Use the built-in verification as well
    const verification = await verifyZipIntegrity(app, result.zipPath, [
      'TestFolder/file1.txt', 
      'TestFolder/file2.md', 
      'TestFolder/subfolder/file3.txt'
    ]);
    expect(verification.isValid).toBe(true);
    expect(verification.fileCount).toBe(3);
  });

  it('creates archives with correct size and non-zero binary data', async () => {
    const { vault, files } = makeFakeVault({
      'TestFolder/large-file.txt': 'A'.repeat(1000), // 1000 byte file
      'TestFolder/small-file.txt': 'Small content'
    });
    const app: any = { vault };

    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'TestFolder', 
      ['TestFolder/large-file.txt', 'TestFolder/small-file.txt']
    );

    // Get zip data and verify it's substantial
    const zipData = files.get(result.zipPath)!;
    
    // Zip should be more than just headers - should contain compressed data
    expect(zipData.length).toBeGreaterThan(100); // Much larger than empty zip
    
    // Verify first few bytes are zip signature
    expect(zipData[0]).toBe(0x50); // 'P'
    expect(zipData[1]).toBe(0x4B); // 'K'
    expect(zipData[2]).toBe(0x03); // ZIP signature
    expect(zipData[3]).toBe(0x04); // ZIP signature
  });

  it('preserves file structure and paths in zip archives', async () => {
    const { vault, files } = makeFakeVault({
      'Project/src/main.ts': 'console.log("main");',
      'Project/src/utils/helper.ts': 'export function help() {}',
      'Project/README.md': '# Project\n\nDescription',
      'Project/config.json': '{"name": "test"}'
    });
    const app: any = { vault };

    const result = await createArchive(
      app, 
      '.', 
      'Archive', 
      'Project', 
      [
        'Project/src/main.ts',
        'Project/src/utils/helper.ts', 
        'Project/README.md',
        'Project/config.json'
      ]
    );

    // Load and inspect zip structure
    const zipData = files.get(result.zipPath)!;
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipData);

    // Verify all paths are preserved correctly
    const zipFiles = Object.keys(loadedZip.files);
    expect(zipFiles).toContain('Project/src/main.ts');
    expect(zipFiles).toContain('Project/src/utils/helper.ts');
    expect(zipFiles).toContain('Project/README.md');
    expect(zipFiles).toContain('Project/config.json');

    // Verify content and structure integrity
    const mainContent = await loadedZip.file('Project/src/main.ts')?.async('text');
    const configContent = await loadedZip.file('Project/config.json')?.async('text');
    
    expect(mainContent).toBe('console.log("main");');
    expect(configContent).toBe('{"name": "test"}');
  });
});
