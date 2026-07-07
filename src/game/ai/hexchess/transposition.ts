import type { HexMove } from '@/game/hexchess';

// ---------------------------------------------------------------------------
// Transposition table types
// ---------------------------------------------------------------------------

export type TTFlag = 'exact' | 'lower' | 'upper';

export interface TTEntry {
  depth: number;
  evalCp: number;
  flag: TTFlag;
  bestMove: HexMove | null;
}

// ---------------------------------------------------------------------------
// TranspositionTable — depth-preferred replacement, fixed-capacity
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ENTRIES = 65536;

export class TranspositionTable {
  private readonly maxEntries: number;
  private table: Map<string, TTEntry>;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.table = new Map();
  }

  set(hash: string, entry: TTEntry): void {
    const existing = this.table.get(hash);

    if (existing !== undefined) {
      // Depth-preferred: only overwrite if incoming depth >= existing depth
      if (entry.depth >= existing.depth) {
        this.table.set(hash, entry);
      }
      return;
    }

    // New key: only insert if under capacity
    if (this.table.size < this.maxEntries) {
      this.table.set(hash, entry);
    }
  }

  get(hash: string): TTEntry | null {
    return this.table.get(hash) ?? null;
  }

  clear(): void {
    this.table.clear();
  }

  size(): number {
    return this.table.size;
  }
}
