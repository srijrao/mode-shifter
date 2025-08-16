import { describe, it, expect, vi } from 'vitest';
import { verifyZipIntegrity } from '../src/archive';
import { makeFakeVault } from './test-utils';

vi.mock('obsidian', () => ({ App: class {} }));

describe('verifyZipIntegrity error paths', () => {
  it('returns isValid false and error when zip file missing', async () => {
    const { vault } = makeFakeVault({});
    const app: any = { vault };
    const res = await verifyZipIntegrity(app, 'Archive/missing.zip', ['a.txt']);
    expect(res.isValid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Failed to verify zip/i);
  });
});
