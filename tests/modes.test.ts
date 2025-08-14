import { describe, it, expect, vi } from 'vitest';
import { setActiveMode, recordLastArchive, getLastArchive } from '../src/modes';

describe('modes helpers', () => {
  it('setActiveMode marks exactly one mode active', () => {
    const modes = [ { id: 'a' }, { id: 'b' }, { id: 'c' } ];
    const updated = setActiveMode(modes as any, 'b');
    expect(updated.filter(m => m.active).length).toBe(1);
    expect(updated.find(m => m.id === 'b')!.active).toBe(true);
  });

  it('record/get last archive mapping', () => {
    let map = undefined as any;
    map = recordLastArchive(map, 'm1', 'Archive/m1.zip');
    map = recordLastArchive(map, 'm2', 'Archive/m2.zip');
    expect(getLastArchive(map, 'm1')).toBe('Archive/m1.zip');
    expect(getLastArchive(map, 'm2')).toBe('Archive/m2.zip');
    expect(getLastArchive(map, 'unknown')).toBe(null);
  });
});
