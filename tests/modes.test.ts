import { describe, it, expect } from 'vitest';
import { setActiveMode, recordLastArchive, getLastArchive, ModeEntryBrief } from '../src/modes';

describe('modes', () => {
  it('setActiveMode activates only the requested id', () => {
    const modes: ModeEntryBrief[] = [
      { id: 'a', active: false },
      { id: 'b', active: true },
      { id: 'c' }
    ];
    const updated = setActiveMode(modes, 'c');
    expect(updated.map(m => m.id + ':' + (m.active ? '1' : '0')).join(',')).toBe('a:0,b:0,c:1');
    // Original must be unchanged
    expect(modes[1].active).toBe(true);
  });

  it('setActiveMode with null clears all', () => {
    const modes: ModeEntryBrief[] = [ { id: 'a', active: true }, { id: 'b', active: false } ];
    const updated = setActiveMode(modes, null);
    expect(updated.every(m => m.active === false)).toBe(true);
  });

  it('recordLastArchive creates immutable copy and getLastArchive reads it', () => {
    const m1 = recordLastArchive(undefined, 'modeA', 'a.zip');
    expect(m1).toEqual({ modeA: 'a.zip' });
    const m2 = recordLastArchive(m1, 'modeB', 'b.zip');
    expect(m1).toEqual({ modeA: 'a.zip' }); // original not mutated
    expect(m2).toEqual({ modeA: 'a.zip', modeB: 'b.zip' });
    expect(getLastArchive(m2, 'modeA')).toBe('a.zip');
    expect(getLastArchive(m2, 'missing')).toBeNull();
  });
});
