import { describe, it, expect } from 'vitest';
import { generateZipName, formatBytes, getVaultBasePath } from '../src/utils';

describe('utils', () => {
  it('generateZipName includes base and .zip', () => {
    const name = generateZipName('test');
    expect(name.startsWith('test-')).toBe(true);
    expect(name.endsWith('.zip')).toBe(true);
  });

  it('formatBytes formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024*1024)).toBe('1 MB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('getVaultBasePath prefers adapter.getBasePath()', () => {
    const app: any = { vault: { adapter: { getBasePath: () => 'C:/Vault' } } };
    expect(getVaultBasePath(app)).toBe('C:/Vault');
  });

  it('getVaultBasePath uses basePath property', () => {
    const app: any = { vault: { adapter: { basePath: '/vault' } } };
    expect(getVaultBasePath(app)).toBe('/vault');
  });

  it('getVaultBasePath falls back to .', () => {
    const app: any = { vault: { adapter: {} } };
    expect(getVaultBasePath(app)).toBe('.');
  });
});
