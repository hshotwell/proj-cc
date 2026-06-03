import type { CubeCoord } from '@/types/game';

export interface TablebaseEntry {
  from: { q: number; r: number };
  to: { q: number; r: number };
  solvedIn: number;
}

const STORAGE_KEY = 'chinese-checkers-endgame-table';
const STORAGE_VERSION = 1;

interface TablebaseStore {
  version: number;
  entries: Record<string, TablebaseEntry>;
}

let cachedEntries: Record<string, TablebaseEntry> | null = null;

export function makeTablebaseKey(
  outsidePieces: CubeCoord[],
  emptyGoals: CubeCoord[]
): string {
  const sortCoords = (coords: CubeCoord[]) =>
    [...coords]
      .sort((a, b) => a.q !== b.q ? a.q - b.q : a.r - b.r)
      .map(c => `${c.q},${c.r}`)
      .join(';');
  return `out:${sortCoords(outsidePieces)}|eg:${sortCoords(emptyGoals)}`;
}

export function lookupTablebase(
  outsidePieces: CubeCoord[],
  emptyGoals: CubeCoord[]
): TablebaseEntry | null {
  if (outsidePieces.length === 0 || outsidePieces.length > 2) return null;

  if (cachedEntries === null) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const store: TablebaseStore = JSON.parse(raw);
      if (store.version !== STORAGE_VERSION) return null;
      cachedEntries = store.entries;
    } catch {
      return null;
    }
  }

  const key = makeTablebaseKey(outsidePieces, emptyGoals);
  return cachedEntries[key] ?? null;
}

export function saveTablebase(entries: Record<string, TablebaseEntry>): void {
  const store: TablebaseStore = { version: STORAGE_VERSION, entries };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage quota exceeded — store partial result silently
  }
  cachedEntries = entries;
}

export function clearTablebaseCache(): void {
  cachedEntries = null;
}

export function getTablebaseSize(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? raw.length : 0;
  } catch {
    return 0;
  }
}
