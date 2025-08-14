import { describe, it, expect } from 'vitest';
import { generateZipName, formatBytes, calculateModeSize } from '../src/utils';

describe('utils', () => {
  it('generateZipName creates unique names', () => {
    const name1 = generateZipName('test');
    const name2 = generateZipName('test');
    
    expect(name1).toMatch(/^test-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9]{6}$/);
    expect(name2).toMatch(/^test-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9]{6}$/);
    expect(name1).not.toBe(name2);
  });

  it('formatBytes formats file sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('calculateModeSize computes total size and file count', async () => {
    // Mock app with adapter
    const mockAdapter = {
      stat: async (path: string) => {
        const sizes: Record<string, number> = {
          'file1.md': 100,
          'file2.md': 200,
          'file3.md': 300
        };
        
        if (sizes[path]) {
          return { type: 'file', size: sizes[path] };
        }
        throw new Error('File not found');
      }
    };

    const mockApp = { vault: { adapter: mockAdapter } };

    const result = await calculateModeSize(mockApp as any, ['file1.md', 'file2.md', 'file3.md']);
    
    expect(result.totalBytes).toBe(600);
    expect(result.fileCount).toBe(3);
    expect(result.formattedSize).toBe('600 B');
  });

  it('calculateModeSize handles missing files gracefully', async () => {
    const mockAdapter = {
      stat: async (path: string) => {
        if (path === 'exists.md') {
          return { type: 'file', size: 150 };
        }
        throw new Error('File not found');
      }
    };

    const mockApp = { vault: { adapter: mockAdapter } };

    const result = await calculateModeSize(mockApp as any, ['exists.md', 'missing.md', 'also-missing.md']);
    
    expect(result.totalBytes).toBe(150);
    expect(result.fileCount).toBe(1);
    expect(result.formattedSize).toBe('150 B');
  });
});
