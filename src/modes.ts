export interface ModeEntryBrief {
  id: string;
  name?: string;
  active?: boolean;
}

export function setActiveMode(modes: ModeEntryBrief[], activateId: string | null): ModeEntryBrief[] {
  return modes.map(m => ({ ...m, active: activateId === m.id }));
}

export function recordLastArchive(mapping: Record<string, string> | undefined, modeId: string, zipPath: string) {
  const m = Object.assign({}, mapping || {});
  m[modeId] = zipPath;
  return m;
}

export function getLastArchive(mapping: Record<string, string> | undefined, modeId: string): string | null {
  if (!mapping) return null;
  return mapping[modeId] || null;
}
