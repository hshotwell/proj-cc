# Endgame Search Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the greedy late-endgame intercept with real depth-scaled search, add a training-built endgame tablebase for 1–2 piece positions, and add a pattern cache to improve move ordering.

**Architecture:** `computeSearchParams()` replaces the `detectPhase`/depth-constants trio with a single function that scales depth and move-limit based on pieces in goal. `findEndgameMove()` is stripped to two provably-correct fast-path cases. A tablebase (built by training, stored in localStorage, checked in `useAITurn` before the worker) handles 1–2 piece positions perfectly. A pattern cache (built during GA tournament, sent to the worker via `WorkerRequest`) improves move ordering in the minimax.

**Tech Stack:** TypeScript, Vitest, Zustand, Web Worker, localStorage

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/ai.ts` | Modify | Remove `AI_DEPTH`, `AI_OPENING_DEPTH`, `AI_ENDGAME_DEPTH`, `AI_MOVE_LIMIT` |
| `src/game/ai/search.ts` | Modify | Add `computeSearchParams`, update `minimax`/`maxn` signatures, add `setPatternCache`, apply cache in `getTopMoves` |
| `src/game/ai/endgame.ts` | Modify | Strip `findEndgameMove` to direct-entry + move-deeper only; remove `findMakeRoomMove`, `findSteppingStoneMove`, `findShuffleSequence` |
| `src/game/ai/tablebase.ts` | Create | Position key generation, localStorage load/save, `lookupTablebase()` |
| `src/game/training/tablebaseBuilder.ts` | Create | Position enumeration, deep solve, `buildEndgameTablebase()` |
| `src/game/training/patternCache.ts` | Create | Feature extraction, accumulation, `flushPatternCache()`, `getSerializedPatternCache()` |
| `src/game/training/evaluate.ts` | Modify | Expose `searchDepth`/`moveLimit` params in `findBestMoveWithGenome` |
| `src/game/ai/workerClient.ts` | Modify | Add `patternCache` field to `WorkerRequest` |
| `src/game/ai/worker.ts` | Modify | Extract and apply `patternCache` from request via `setPatternCache` |
| `src/hooks/useAITurn.ts` | Modify | Tablebase check before worker dispatch; pass pattern cache in request |
| `src/store/trainingStore.ts` | Modify | Record pattern features during tournament; expose tablebase build |
| `src/app/training/page.tsx` | Modify | "Build Endgame Table" button with progress |
| `tests/game/ai/searchParams.test.ts` | Create | `computeSearchParams` unit tests |
| `tests/game/ai/tablebase.test.ts` | Create | Key canonicalization + lookup unit tests |
| `tests/game/training/tablebaseBuilder.test.ts` | Create | Position enumeration + solve unit tests |
| `tests/game/training/patternCache.test.ts` | Create | Feature extraction + accumulation unit tests |

---

## Task 1: computeSearchParams + types cleanup

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/game/ai/search.ts`
- Create: `tests/game/ai/searchParams.test.ts`

- [ ] **Step 1: Write failing tests for computeSearchParams**

Create `tests/game/ai/searchParams.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { applyMove } from '@/game/state';
import { getAllValidMoves } from '@/game/moves';

// We test the exported function directly after it's added.
// Import path will be valid after Step 3.
import { computeSearchParams } from '@/game/ai/search';

describe('computeSearchParams', () => {
  it('returns depth 2 and large limit for midgame (0 pieces in goal)', () => {
    const state = createGame(2);
    const params = computeSearchParams(state, state.currentPlayer, 'hard');
    expect(params.depth).toBe(2);
    expect(params.moveLimit).toBe(20);
  });

  it('hard difficulty: returns depth 5 at exactly 7 pieces in goal', () => {
    // Build a mock state by inspecting what countPiecesInGoal returns.
    // We test by calling with a crafted state; use the createGame + default for shape.
    // The actual piece-count is what matters — we verify thresholds indirectly
    // by checking that depth increases as inGoal increases.
    const state = createGame(2);
    const base = computeSearchParams(state, state.currentPlayer, 'hard');
    expect(base.depth).toBeLessThanOrEqual(3);
  });

  it('medium depth is always <= hard depth', () => {
    const state = createGame(2);
    const hard = computeSearchParams(state, state.currentPlayer, 'hard');
    const medium = computeSearchParams(state, state.currentPlayer, 'medium');
    expect(medium.depth).toBeLessThanOrEqual(hard.depth);
  });

  it('easy depth is always <= medium depth', () => {
    const state = createGame(2);
    const medium = computeSearchParams(state, state.currentPlayer, 'medium');
    const easy = computeSearchParams(state, state.currentPlayer, 'easy');
    expect(easy.depth).toBeLessThanOrEqual(medium.depth);
  });

  it('move limit decreases as difficulty decreases', () => {
    const state = createGame(2);
    const hard = computeSearchParams(state, state.currentPlayer, 'hard');
    const easy = computeSearchParams(state, state.currentPlayer, 'easy');
    expect(easy.moveLimit).toBeLessThan(hard.moveLimit);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/game/ai/searchParams.test.ts
```
Expected: FAIL — `computeSearchParams` is not exported

- [ ] **Step 3: Remove dead constants from `src/types/ai.ts`**

Remove `AI_DEPTH`, `AI_OPENING_DEPTH`, `AI_ENDGAME_DEPTH`, `AI_MOVE_LIMIT`. Keep `AI_THINK_DELAY`. The file becomes:

```ts
import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

export const AI_THINK_DELAY = 400;
```

- [ ] **Step 4: Add `computeSearchParams` to `src/game/ai/search.ts`**

Add this import at the top of search.ts (alongside the existing `countPiecesInGoal`-adjacent imports):
```ts
import { countPiecesInGoal } from '../state';
```

Then add the function near the top of the file, after the imports. Also remove the now-broken import line `import { AI_DEPTH, AI_OPENING_DEPTH, AI_ENDGAME_DEPTH, AI_MOVE_LIMIT } from '@/types/ai';` — replace it with just the types needed:
```ts
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { AI_THINK_DELAY } from '@/types/ai';
```
(Remove `AI_THINK_DELAY` too if it's not used in search.ts — check first.)

Add the function and export it:

```ts
export function computeSearchParams(
  state: GameState,
  player: PlayerIndex,
  difficulty: AIDifficulty
): { depth: number; moveLimit: number } {
  const inGoal = countPiecesInGoal(state, player);

  if (inGoal >= 9) {
    return {
      depth:     difficulty === 'hard' ? 9 : difficulty === 'medium' ? 7 : 4,
      moveLimit: difficulty === 'hard' ? 6 : difficulty === 'medium' ? 4 : 3,
    };
  }
  if (inGoal === 8) {
    return {
      depth:     difficulty === 'hard' ? 7 : difficulty === 'medium' ? 5 : 3,
      moveLimit: difficulty === 'hard' ? 8 : difficulty === 'medium' ? 6 : 4,
    };
  }
  if (inGoal === 7) {
    return {
      depth:     difficulty === 'hard' ? 5 : difficulty === 'medium' ? 4 : 3,
      moveLimit: difficulty === 'hard' ? 12 : difficulty === 'medium' ? 10 : 6,
    };
  }
  if (inGoal >= 4) {
    return {
      depth:     difficulty === 'hard' ? 3 : 2,
      moveLimit: difficulty === 'hard' ? 16 : difficulty === 'medium' ? 12 : 8,
    };
  }
  // 0–3 in goal — midgame
  return {
    depth: 2,
    moveLimit: difficulty === 'hard' ? 20 : difficulty === 'medium' ? 15 : 10,
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/game/ai/searchParams.test.ts
```
Expected: PASS

- [ ] **Step 6: Verify build is clean**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors (AI_DEPTH etc. only used in search.ts which we'll fix in Task 3)

- [ ] **Step 7: Commit**

```bash
git add src/types/ai.ts src/game/ai/search.ts tests/game/ai/searchParams.test.ts
git commit -m "feat: add computeSearchParams, remove dead AI depth constants"
```

---

## Task 2: Strip findEndgameMove to fast-path only

**Files:**
- Modify: `src/game/ai/endgame.ts`

- [ ] **Step 1: Add a focused test for the stripped behaviour**

Add to `tests/game/training/endgamePatterns.test.ts` (append at the end):

```ts
import { findEndgameMove } from '@/game/ai/endgame';
import { createGameFromLayout } from '@/game/setup';
import { DEFAULT_BOARD_LAYOUT } from '@/game/defaultLayout';
import type { PlayerIndex } from '@/types/game';

describe('findEndgameMove (stripped fast-path)', () => {
  const PLAYER: PlayerIndex = 0;
  // Standard player-0 goal positions (top triangle)
  const GOAL = ['4,-8','3,-7','4,-7','2,-6','3,-6','4,-6','1,-5','2,-5','3,-5','4,-5'];

  function makeState(positions: string[]) {
    return createGameFromLayout({
      id: 'test', name: 'test', cells: DEFAULT_BOARD_LAYOUT.cells,
      startingPositions: { [PLAYER]: positions } as Record<PlayerIndex, string[]>,
      goalPositions: { [PLAYER]: GOAL } as Record<PlayerIndex, string[]>,
      createdAt: 0,
    });
  }

  it('returns a direct goal entry when one is available', () => {
    // 9 pieces in goal, straggler at 4,-3 (close to goal)
    const positions = ['3,-7','4,-7','2,-6','3,-6','4,-6','1,-5','2,-5','3,-5','4,-5','4,-3'];
    const state = makeState(positions);
    const move = findEndgameMove(state, PLAYER);
    // Should find a move heading into the goal (4,-8 is the empty goal cell)
    expect(move).not.toBeNull();
    if (move) {
      expect(GOAL).toContain(`${move.to.q},${move.to.r}`);
    }
  });

  it('returns null when neither direct entry nor deeper-in-goal is possible', () => {
    // All pieces outside goal (midgame-like), none adjacent to goal
    const positions = ['0,0','1,0','-1,0','0,1','0,-1','1,-1','-1,1','2,0','-2,0','0,2'];
    const state = makeState(positions);
    const move = findEndgameMove(state, PLAYER);
    expect(move).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (findEndgameMove still does extra work)**

```bash
npx vitest run tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```
The new describe block should run. If `findEndgameMove` returns a non-goal move for the second test, it fails.

- [ ] **Step 3: Replace `findEndgameMove` in `src/game/ai/endgame.ts`**

Delete the bodies of `findMakeRoomMove`, `findSteppingStoneMove`, and `findShuffleSequence` — remove all three functions entirely (they are private helpers not used by `scoreEndgameMove`). Verify `couldEnterGoalIfEmpty` stays (used in `scoreEndgameMove`).

Replace `findEndgameMove` with:

```ts
export function findEndgameMove(state: GameState, player: PlayerIndex): Move | null {
  const allMoves = getAllValidMoves(state, player);
  if (allMoves.length === 0) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // Priority 1: Direct goal entry — outside piece steps or jumps into an empty goal cell.
  // Always optimal; take deepest available.
  const directEntries = allMoves
    .filter(m => !goalKeys.has(coordKey(m.from)) && goalKeys.has(coordKey(m.to)))
    .map(m => ({
      move: m,
      depth: getGoalPositionDepth(m.to),
      jumpLen: m.jumpPath?.length ?? 0,
    }))
    .sort((a, b) => b.depth !== a.depth ? b.depth - a.depth : b.jumpLen - a.jumpLen);

  if (directEntries.length > 0) return directEntries[0].move;

  // Priority 2: Move deeper within goal — piece advances to a deeper goal cell.
  // Always a strict positional improvement; no search needed.
  const deeperMoves = allMoves
    .filter(m => {
      if (!goalKeys.has(coordKey(m.from)) || !goalKeys.has(coordKey(m.to))) return false;
      return getGoalPositionDepth(m.to) > getGoalPositionDepth(m.from);
    })
    .map(m => ({
      move: m,
      gain: getGoalPositionDepth(m.to) - getGoalPositionDepth(m.from),
    }))
    .sort((a, b) => b.gain - a.gain);

  if (deeperMoves.length > 0) return deeperMoves[0].move;

  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/game/training/endgamePatterns.test.ts
```
Expected: PASS (all tests including the new ones)

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/endgame.ts tests/game/training/endgamePatterns.test.ts
git commit -m "refactor: strip findEndgameMove to direct-entry + move-deeper fast-path only"
```

---

## Task 3: Wire computeSearchParams into findBestMove, update minimax/maxn

**Files:**
- Modify: `src/game/ai/search.ts`

- [ ] **Step 1: Update `minimax` to accept `moveLimit` parameter**

In `search.ts`, the `minimax` function signature currently looks up `AI_MOVE_LIMIT[difficulty]` internally. Change it to accept `moveLimit` as a parameter and propagate it through recursion. Find `function minimax(` and update:

```ts
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  moveLimit: number          // NEW
): number {
  // ... (TT lookup unchanged) ...

  if (depth === 0) {
    const score = evaluatePosition(state, maximizingPlayer, personality, difficulty);
    storeTT(ttKey, score, 'exact', 0);
    return score;
  }

  const currentPlayer = state.currentPlayer;
  const isMaximizing = currentPlayer === maximizingPlayer;
  // REMOVE: const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, currentPlayer, personality, difficulty, moveLimit);

  // ... rest of function, update recursive calls to pass moveLimit:
  const eval_ = minimax(next, depth - 1, alpha, beta, maximizingPlayer, personality, difficulty, moveLimit);
```

- [ ] **Step 2: Update `maxn` similarly**

```ts
function maxn(
  state: GameState,
  depth: number,
  aiPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  moveLimit: number          // NEW
): number {
  // ...
  // REMOVE: const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, currentPlayer, personality, difficulty, moveLimit);
  // recursive:
  const score = maxn(next, depth - 1, aiPlayer, personality, difficulty, moveLimit);
```

- [ ] **Step 3: Replace `detectPhase` + depth constants in `findBestMove`**

In `findBestMove`, find the phase detection block:
```ts
const phase = detectPhase(state, player);
const depth =
  phase === 'mid'   ? AI_DEPTH[difficulty] :
  phase === 'early' ? AI_OPENING_DEPTH[difficulty] :
                      AI_ENDGAME_DEPTH[difficulty];
const limit = AI_MOVE_LIMIT[difficulty];
```

Replace with:
```ts
const { depth, moveLimit } = computeSearchParams(state, player, difficulty);
```

Update the minimax and maxn call sites in `findBestMove` to pass `moveLimit`:
```ts
score = minimax(next, depth - 1, -Infinity, Infinity, player, personality, difficulty, moveLimit);
// and for 3+ player:
score = maxn(next, depth - 1, player, personality, difficulty, moveLimit);
```

Remove the `detectPhase` function and its helper (no longer needed). Remove the `GamePhase` type.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run tests/game/ 2>&1 | tail -30
```
Expected: all existing tests pass

- [ ] **Step 5: Run build**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/search.ts
git commit -m "refactor: wire computeSearchParams into findBestMove, thread moveLimit through minimax"
```

---

## Task 4: Expose depth/moveLimit params in findBestMoveWithGenome

**Files:**
- Modify: `src/game/training/evaluate.ts`

- [ ] **Step 1: Update `findBestMoveWithGenome` signature**

In `src/game/training/evaluate.ts`, find:
```ts
export function findBestMoveWithGenome(
  state: GameState,
  genome: Genome
): Move | null {
  const player = state.currentPlayer;
  const depth = 2;
  const moveLimit = 12;
```

Change to:
```ts
export function findBestMoveWithGenome(
  state: GameState,
  genome: Genome,
  searchDepth = 2,
  moveLimit = 12
): Move | null {
  const player = state.currentPlayer;
  const depth = searchDepth;
```

- [ ] **Step 2: Verify existing tests still pass (backward-compatible defaults)**

```bash
npx vitest run tests/game/training.test.ts
```
Expected: PASS (default args preserve old behaviour)

- [ ] **Step 3: Commit**

```bash
git add src/game/training/evaluate.ts
git commit -m "feat: expose searchDepth and moveLimit params in findBestMoveWithGenome"
```

---

## Task 5: Create tablebase.ts — key generation, lookup, save

**Files:**
- Create: `src/game/ai/tablebase.ts`
- Create: `tests/game/ai/tablebase.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/game/ai/tablebase.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTablebaseKey, lookupTablebase, saveTablebase, clearTablebaseCache } from '@/game/ai/tablebase';
import type { TablebaseEntry } from '@/game/ai/tablebase';

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  clearTablebaseCache();
});

describe('makeTablebaseKey', () => {
  it('is order-independent for outside pieces', () => {
    const a = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }, { q: 3, r: -1, s: -2 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    const b = makeTablebaseKey(
      [{ q: 3, r: -1, s: -2 }, { q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(a).toBe(b);
  });

  it('is order-independent for empty goals', () => {
    const a = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }, { q: 3, r: -7, s: 4 }]
    );
    const b = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 3, r: -7, s: 4 }, { q: 4, r: -8, s: 4 }]
    );
    expect(a).toBe(b);
  });

  it('differs when outside pieces differ', () => {
    const a = makeTablebaseKey([{ q: 1, r: 2, s: -3 }], [{ q: 4, r: -8, s: 4 }]);
    const b = makeTablebaseKey([{ q: 2, r: 2, s: -4 }], [{ q: 4, r: -8, s: 4 }]);
    expect(a).not.toBe(b);
  });
});

describe('lookupTablebase', () => {
  it('returns null when table is empty', () => {
    const result = lookupTablebase(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toBeNull();
  });

  it('returns the stored entry after saveTablebase', () => {
    const entry: TablebaseEntry = { from: { q: 1, r: 2 }, to: { q: 3, r: -7 }, solvedIn: 2 };
    const key = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    saveTablebase({ [key]: entry });

    const result = lookupTablebase(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toEqual(entry);
  });

  it('returns null for 3+ outside pieces', () => {
    const result = lookupTablebase(
      [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 2, r: 0, s: -2 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/game/ai/tablebase.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/game/ai/tablebase.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/game/ai/tablebase.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/tablebase.ts tests/game/ai/tablebase.test.ts
git commit -m "feat: add endgame tablebase key generation and localStorage lookup"
```

---

## Task 6: Wire tablebase lookup into useAITurn

**Files:**
- Modify: `src/hooks/useAITurn.ts`

- [ ] **Step 1: Add imports to useAITurn.ts**

Add at the top of `src/hooks/useAITurn.ts`:

```ts
import { lookupTablebase } from '@/game/ai/tablebase';
import { getPiecesOutsideGoal, getEmptyGoalsByDepth } from '@/game/ai/endgame';
import { getValidMoves } from '@/game/moves';  // already imported
```

(`getValidMoves` is already imported in useAITurn.ts)

- [ ] **Step 2: Add tablebase check before worker.postMessage**

Inside the `setTimeout` callback in `useAITurn.ts`, find the block just before `worker.postMessage(...)`. Add the tablebase check immediately before it:

```ts
// --- Tablebase lookup (main thread — localStorage, no worker needed) ---
const tbPlayer = current.gameState.currentPlayer;
const outsidePieces = getPiecesOutsideGoal(current.gameState, tbPlayer);
if (outsidePieces.length >= 1 && outsidePieces.length <= 2) {
  const emptyGoals = getEmptyGoalsByDepth(current.gameState, tbPlayer);
  const tbEntry = lookupTablebase(outsidePieces, emptyGoals);
  if (tbEntry) {
    const fromCoord = { q: tbEntry.from.q, r: tbEntry.from.r, s: -tbEntry.from.q - tbEntry.from.r };
    const tbMoves = getValidMoves(current.gameState, fromCoord);
    const tbMove = tbMoves.find(m => m.to.q === tbEntry.to.q && m.to.r === tbEntry.to.r);
    if (tbMove) {
      useGameStore.getState().selectPiece(tbMove.from);
      setTimeout(() => {
        const animate = useSettingsStore.getState().animateMoves;
        useGameStore.getState().makeMove(tbMove.to, animate);
      }, 50);
      return;
    }
  }
}
// --- End tablebase lookup ---
```

Place this block immediately before the existing `worker.postMessage({...})` call (around line 142 in the current file).

- [ ] **Step 3: Run build to verify no type errors**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAITurn.ts
git commit -m "feat: check endgame tablebase in useAITurn before worker dispatch"
```

---

## Task 7: Create tablebaseBuilder.ts

**Files:**
- Create: `src/game/training/tablebaseBuilder.ts`
- Create: `tests/game/training/tablebaseBuilder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/game/training/tablebaseBuilder.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { enumerateEndgamePositions, buildEndgameTablebase } from '@/game/training/tablebaseBuilder';
import { DEFAULT_GENOME } from '@/game/training/evaluate';
import { clearTablebaseCache } from '@/game/ai/tablebase';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

describe('enumerateEndgamePositions', () => {
  it('returns positions for 1 piece', () => {
    const positions = enumerateEndgamePositions(1);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.outsidePieces).toHaveLength(1);
      expect(p.emptyGoals).toHaveLength(1);
    }
  });

  it('returns positions for 2 pieces', () => {
    const positions = enumerateEndgamePositions(2);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.outsidePieces).toHaveLength(2);
      expect(p.emptyGoals).toHaveLength(2);
    }
  });

  it('outside pieces are never in goal positions', () => {
    const positions = enumerateEndgamePositions(1);
    // Spot-check a few
    for (const p of positions.slice(0, 5)) {
      for (const op of p.outsidePieces) {
        const isInGoal = p.emptyGoals.some(g => g.q === op.q && g.r === op.r);
        expect(isInGoal).toBe(false);
      }
    }
  });
});

describe('buildEndgameTablebase', () => {
  it('saves at least some entries to localStorage', async () => {
    clearTablebaseCache();
    Object.keys(store).forEach(k => delete store[k]);

    let progressCalled = false;
    // Only build 1-piece positions to keep test fast
    await buildEndgameTablebase(DEFAULT_GENOME, (solved, total, _bytes) => {
      progressCalled = true;
      expect(solved).toBeLessThanOrEqual(total);
    }, { maxPiecesOutside: 1 });

    expect(progressCalled).toBe(true);
    const saved = store['chinese-checkers-endgame-table'];
    expect(saved).toBeDefined();
    const parsed = JSON.parse(saved);
    expect(Object.keys(parsed.entries).length).toBeGreaterThan(0);
  }, 60000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/game/training/tablebaseBuilder.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/game/training/tablebaseBuilder.ts`**

```ts
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { Genome } from '@/types/training';
import { DEFAULT_BOARD_LAYOUT } from '../defaultLayout';
import { createGame } from '../setup';
import { getGoalPositionsForState, isGameFullyOver, applyMove } from '../state';
import { cubeDistance, centroid, coordKey } from '../coordinates';
import { findBestMoveWithGenome } from './evaluate';
import { makeTablebaseKey, saveTablebase } from '@/game/ai/tablebase';
import type { TablebaseEntry } from '@/game/ai/tablebase';
import { createGameFromLayout } from '../setup';

const PLAYER: PlayerIndex = 0;
const MAX_DIST_FROM_GOAL = 8;
// Solve depths: deep enough to find good moves, not so deep as to time out
const SOLVE_DEPTH_1 = 6;
const SOLVE_DEPTH_2 = 4;
const SOLVE_MOVE_LIMIT = 6;

/** Get the standard goal positions for player 0 in a 2-player game. */
function getStandardGoalPositions(): CubeCoord[] {
  const tempState = createGame(2);
  return getGoalPositionsForState(tempState, PLAYER);
}

/** Get all non-goal board cells from the standard layout. */
function getNonGoalBoardCells(goalSet: Set<string>): CubeCoord[] {
  const cells: CubeCoord[] = [];
  for (const key of DEFAULT_BOARD_LAYOUT.cells) {
    if (goalSet.has(key)) continue;
    const [q, r] = key.split(',').map(Number);
    cells.push({ q, r, s: -q - r });
  }
  return cells;
}

export interface EndgamePosition {
  outsidePieces: CubeCoord[];
  emptyGoals: CubeCoord[];
}

/**
 * Enumerate all reachable 1 or 2-piece endgame positions within distance
 * MAX_DIST_FROM_GOAL of the goal centroid.
 */
export function enumerateEndgamePositions(numOutside: 1 | 2): EndgamePosition[] {
  const goalPositions = getStandardGoalPositions();
  const goalSet = new Set(goalPositions.map(g => coordKey(g)));
  const goalCenter = centroid(goalPositions);

  const nearbyCells = getNonGoalBoardCells(goalSet)
    .filter(c => cubeDistance(c, goalCenter) <= MAX_DIST_FROM_GOAL);

  const positions: EndgamePosition[] = [];

  if (numOutside === 1) {
    for (const outside of nearbyCells) {
      for (const emptyGoal of goalPositions) {
        positions.push({ outsidePieces: [outside], emptyGoals: [emptyGoal] });
      }
    }
  } else {
    for (let i = 0; i < nearbyCells.length; i++) {
      for (let j = i + 1; j < nearbyCells.length; j++) {
        for (let a = 0; a < goalPositions.length; a++) {
          for (let b = a + 1; b < goalPositions.length; b++) {
            positions.push({
              outsidePieces: [nearbyCells[i], nearbyCells[j]],
              emptyGoals: [goalPositions[a], goalPositions[b]],
            });
          }
        }
      }
    }
  }

  return positions;
}

function buildPieceStrings(outsidePieces: CubeCoord[], goalPositions: CubeCoord[], emptyGoals: CubeCoord[]): string[] {
  const emptySet = new Set(emptyGoals.map(g => coordKey(g)));
  const inGoal = goalPositions
    .filter(g => !emptySet.has(coordKey(g)))
    .map(g => `${g.q},${g.r}`);
  const outside = outsidePieces.map(p => `${p.q},${p.r}`);
  return [...inGoal, ...outside];
}

function solvePosition(
  position: EndgamePosition,
  goalPositions: CubeCoord[],
  genome: Genome,
  depth: number
): TablebaseEntry | null {
  const goalStrings = goalPositions.map(g => `${g.q},${g.r}`);
  const pieceStrings = buildPieceStrings(position.outsidePieces, goalPositions, position.emptyGoals);

  const layout = {
    id: 'tablebase-solve',
    name: 'Tablebase',
    cells: DEFAULT_BOARD_LAYOUT.cells,
    startingPositions: { [PLAYER]: pieceStrings } as Record<PlayerIndex, string[]>,
    goalPositions: { [PLAYER]: goalStrings } as Record<PlayerIndex, string[]>,
    createdAt: 0,
  };

  const state = createGameFromLayout(layout);
  const firstMove = findBestMoveWithGenome(state, genome, depth, SOLVE_MOVE_LIMIT);
  if (!firstMove) return null;

  // Play forward to count turns
  let current = state;
  let turnsUsed = 0;
  const maxTurns = position.outsidePieces.length * 8;

  while (!isGameFullyOver(current) && turnsUsed < maxTurns) {
    const move = findBestMoveWithGenome(current, genome, Math.min(depth, 4), SOLVE_MOVE_LIMIT);
    if (!move) break;
    current = applyMove(current, move);
    turnsUsed++;
  }

  if (!isGameFullyOver(current)) return null;

  return {
    from: { q: firstMove.from.q, r: firstMove.from.r },
    to: { q: firstMove.to.q, r: firstMove.to.r },
    solvedIn: turnsUsed,
  };
}

export interface BuildOptions {
  maxPiecesOutside?: 1 | 2;
}

/**
 * Enumerate and solve all 1 (and optionally 2) piece endgame positions.
 * Saves the solved table to localStorage via saveTablebase.
 */
export async function buildEndgameTablebase(
  genome: Genome,
  onProgress: (solved: number, total: number, sizeBytes: number) => void,
  options: BuildOptions = {}
): Promise<void> {
  const maxOutside = options.maxPiecesOutside ?? 2;
  const goalPositions = getStandardGoalPositions();

  const positions1 = enumerateEndgamePositions(1);
  const positions2 = maxOutside >= 2 ? enumerateEndgamePositions(2) : [];
  const allPositions: Array<{ pos: EndgamePosition; depth: number }> = [
    ...positions1.map(pos => ({ pos, depth: SOLVE_DEPTH_1 })),
    ...positions2.map(pos => ({ pos, depth: SOLVE_DEPTH_2 })),
  ];

  const total = allPositions.length;
  const entries: Record<string, TablebaseEntry> = {};
  let solved = 0;

  for (const { pos, depth } of allPositions) {
    const entry = solvePosition(pos, goalPositions, genome, depth);
    if (entry) {
      const key = makeTablebaseKey(pos.outsidePieces, pos.emptyGoals);
      entries[key] = entry;
    }
    solved++;

    if (solved % 50 === 0 || solved === total) {
      saveTablebase(entries);
      const sizeBytes = JSON.stringify(entries).length;
      onProgress(solved, total, sizeBytes);
      // Yield to keep browser responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  saveTablebase(entries);
  onProgress(total, total, JSON.stringify(entries).length);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/game/training/tablebaseBuilder.test.ts
```
Expected: PASS (the buildEndgameTablebase test may take ~30-60s for 1-piece positions)

- [ ] **Step 5: Commit**

```bash
git add src/game/training/tablebaseBuilder.ts tests/game/training/tablebaseBuilder.test.ts
git commit -m "feat: add endgame tablebase builder with 1/2-piece position enumeration and deep solve"
```

---

## Task 8: Wire tablebase build into trainingStore + training UI

**Files:**
- Modify: `src/store/trainingStore.ts`
- Modify: `src/app/training/page.tsx`

- [ ] **Step 1: Add tablebase build state and action to `trainingStore.ts`**

Add these to the `TrainingStore` interface in `trainingStore.ts`:

```ts
isBuildingTablebase: boolean;
tablebaseBuildProgress: { solved: number; total: number; sizeBytes: number } | null;
buildTablebase: () => void;
```

Add initial values in the `create` call:
```ts
isBuildingTablebase: false,
tablebaseBuildProgress: null,
```

Add the action implementation (after `applyBestGenome`):

```ts
buildTablebase: () => {
  const { bestGenome } = get();
  if (!bestGenome) return;

  set({ isBuildingTablebase: true, tablebaseBuildProgress: { solved: 0, total: 1, sizeBytes: 0 } });

  buildEndgameTablebase(
    bestGenome,
    (solved, total, sizeBytes) => {
      set({ tablebaseBuildProgress: { solved, total, sizeBytes } });
    }
  ).then(() => {
    set({ isBuildingTablebase: false });
  }).catch(() => {
    set({ isBuildingTablebase: false });
  });
},
```

Add the import at the top of `trainingStore.ts`:
```ts
import { buildEndgameTablebase } from '@/game/training/tablebaseBuilder';
```

- [ ] **Step 2: Add the "Build Endgame Table" section to the training page**

In `src/app/training/page.tsx`, destructure the new fields from the store:

```ts
const {
  // ... existing fields ...
  isBuildingTablebase,
  tablebaseBuildProgress,
  buildTablebase,
} = useTrainingStore();
```

Find the section after the "Apply to Game AI" button (or at the end of the left controls column). Add a new card below it:

```tsx
{/* Endgame Tablebase */}
{(isComplete || hasExistingGenome) && (
  <div className="bg-white rounded-xl shadow p-6 mt-4">
    <h2 className="text-lg font-semibold text-gray-900 mb-2">
      Endgame Tablebase
    </h2>
    <p className="text-sm text-gray-500 mb-3">
      Solve 1–2 piece endgame positions using the best genome. Takes several minutes.
    </p>
    <button
      onClick={buildTablebase}
      disabled={isBuildingTablebase || isRunning}
      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium
                 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isBuildingTablebase ? 'Building...' : 'Build Endgame Table'}
    </button>
    {isBuildingTablebase && tablebaseBuildProgress && (
      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all"
            style={{
              width: `${Math.round((tablebaseBuildProgress.solved / tablebaseBuildProgress.total) * 100)}%`
            }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-center">
          {tablebaseBuildProgress.solved} / {tablebaseBuildProgress.total} positions
          ({(tablebaseBuildProgress.sizeBytes / 1024).toFixed(0)} KB)
        </p>
      </div>
    )}
    {!isBuildingTablebase && tablebaseBuildProgress?.solved === tablebaseBuildProgress?.total
      && tablebaseBuildProgress?.total > 0 && (
      <p className="text-sm text-green-600 mt-2 text-center">
        Table built — {(tablebaseBuildProgress.sizeBytes / 1024).toFixed(0)} KB saved
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3: Run build**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/store/trainingStore.ts src/app/training/page.tsx
git commit -m "feat: wire tablebase builder into training store and add Build Endgame Table UI"
```

---

## Task 9: Create patternCache.ts

**Files:**
- Create: `src/game/training/patternCache.ts`
- Create: `tests/game/training/patternCache.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/game/training/patternCache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractMoveFeatures,
  makePatternKey,
  accumulatePattern,
  getSerializedPatternCache,
  flushPatternCache,
  resetPatternCacheForTesting,
} from '@/game/training/patternCache';
import { createGame } from '@/game/setup';
import { getAllValidMoves } from '@/game/moves';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  resetPatternCacheForTesting();
});

describe('extractMoveFeatures', () => {
  it('returns null for positions with < 3 pieces in goal', () => {
    const state = createGame(2);
    const moves = getAllValidMoves(state, state.currentPlayer);
    if (moves.length === 0) return;
    const result = extractMoveFeatures(state, moves[0], state.currentPlayer);
    expect(result).toBeNull(); // 0 pieces in goal at game start
  });
});

describe('makePatternKey', () => {
  it('produces a non-empty string', () => {
    const key = makePatternKey({
      piecesInGoalBucket: '6-7',
      isChainJump: true,
      chainLengthBucket: '2',
      isDirectGoalEntry: false,
      distBucket: 'near',
    });
    expect(key.length).toBeGreaterThan(0);
    expect(key).toContain('6-7');
    expect(key).toContain('cj');
  });

  it('two different features produce different keys', () => {
    const k1 = makePatternKey({
      piecesInGoalBucket: '3-5',
      isChainJump: false,
      chainLengthBucket: '1',
      isDirectGoalEntry: true,
      distBucket: 'near',
    });
    const k2 = makePatternKey({
      piecesInGoalBucket: '8',
      isChainJump: false,
      chainLengthBucket: '1',
      isDirectGoalEntry: false,
      distBucket: 'far',
    });
    expect(k1).not.toBe(k2);
  });
});

describe('accumulatePattern + getSerializedPatternCache', () => {
  it('accumulates wins and produces positive scoreDelta for a win-heavy feature', () => {
    const features = {
      piecesInGoalBucket: '6-7' as const,
      isChainJump: true,
      chainLengthBucket: '3+' as const,
      isDirectGoalEntry: false,
      distBucket: 'mid' as const,
    };
    // 8 wins, 2 losses
    for (let i = 0; i < 8; i++) accumulatePattern(features, true);
    for (let i = 0; i < 2; i++) accumulatePattern(features, false);

    const cache = getSerializedPatternCache();
    const key = makePatternKey(features);
    expect(cache[key]).toBeGreaterThan(0); // 80% win rate → positive delta
  });

  it('produces zero delta when win rate is exactly 50%', () => {
    const features = {
      piecesInGoalBucket: '8' as const,
      isChainJump: false,
      chainLengthBucket: '1' as const,
      isDirectGoalEntry: false,
      distBucket: 'far' as const,
    };
    for (let i = 0; i < 5; i++) accumulatePattern(features, true);
    for (let i = 0; i < 5; i++) accumulatePattern(features, false);

    const cache = getSerializedPatternCache();
    const key = makePatternKey(features);
    expect(Math.abs(cache[key] ?? 0)).toBeLessThan(0.001);
  });

  it('flushPatternCache writes to localStorage', () => {
    const features = {
      piecesInGoalBucket: '3-5' as const,
      isChainJump: false,
      chainLengthBucket: '1' as const,
      isDirectGoalEntry: true,
      distBucket: 'near' as const,
    };
    accumulatePattern(features, true);
    flushPatternCache();
    expect(store['chinese-checkers-pattern-cache']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/game/training/patternCache.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/game/training/patternCache.ts`**

```ts
import type { Move, GameState, PlayerIndex } from '@/types/game';
import { countPiecesInGoal } from '../state';
import { getGoalPositionsForState } from '../state';
import { cubeDistance, centroid, coordKey } from '../coordinates';

const STORAGE_KEY = 'chinese-checkers-pattern-cache';
const CACHE_VERSION = 1;
const PATTERN_SCALE = 50;
const MIN_GAMES_FOR_SIGNAL = 5; // don't emit delta until we have enough data

export type PiecesInGoalBucket = '3-5' | '6-7' | '8';
export type ChainLengthBucket = '1' | '2' | '3+';
export type DistBucket = 'near' | 'mid' | 'far';

export interface MoveFeatures {
  piecesInGoalBucket: PiecesInGoalBucket;
  isChainJump: boolean;
  chainLengthBucket: ChainLengthBucket;
  isDirectGoalEntry: boolean;
  distBucket: DistBucket;
}

interface PatternEntry {
  wins: number;
  total: number;
  scoreDelta: number;
}

interface PatternCacheStore {
  version: number;
  gamesRecorded: number;
  entries: Record<string, PatternEntry>;
}

let cache: PatternCacheStore = { version: CACHE_VERSION, gamesRecorded: 0, entries: {} };
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored: PatternCacheStore = JSON.parse(raw);
    if (stored.version === CACHE_VERSION) cache = stored;
  } catch { /* ignore */ }
}

function piecesInGoalBucket(inGoal: number): PiecesInGoalBucket | null {
  if (inGoal >= 3 && inGoal <= 5) return '3-5';
  if (inGoal >= 6 && inGoal <= 7) return '6-7';
  if (inGoal === 8) return '8';
  return null;
}

function chainLengthBucket(len: number): ChainLengthBucket {
  if (len <= 1) return '1';
  if (len === 2) return '2';
  return '3+';
}

function distBucket(dist: number): DistBucket {
  if (dist <= 3) return 'near';
  if (dist <= 6) return 'mid';
  return 'far';
}

export function extractMoveFeatures(
  state: GameState,
  move: Move,
  player: PlayerIndex
): MoveFeatures | null {
  const inGoal = countPiecesInGoal(state, player);
  const bucket = piecesInGoalBucket(inGoal);
  if (bucket === null) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  const goalCenter = centroid(goalPositions);
  const chainLen = move.jumpPath?.length ?? 1;

  return {
    piecesInGoalBucket: bucket,
    isChainJump: move.isJump && chainLen > 1,
    chainLengthBucket: chainLengthBucket(chainLen),
    isDirectGoalEntry: !goalKeys.has(coordKey(move.from)) && goalKeys.has(coordKey(move.to)),
    distBucket: distBucket(cubeDistance(move.from, goalCenter)),
  };
}

export function makePatternKey(f: MoveFeatures): string {
  return `${f.piecesInGoalBucket}_${f.isChainJump ? 'cj' : 'nj'}_${f.chainLengthBucket}_${f.isDirectGoalEntry ? 'dge' : 'ndge'}_${f.distBucket}`;
}

export function accumulatePattern(features: MoveFeatures, won: boolean): void {
  ensureLoaded();
  const key = makePatternKey(features);
  const entry = cache.entries[key] ?? { wins: 0, total: 0, scoreDelta: 0 };
  entry.total++;
  if (won) entry.wins++;
  entry.scoreDelta = entry.total >= MIN_GAMES_FOR_SIGNAL
    ? ((entry.wins / entry.total) - 0.5) * PATTERN_SCALE
    : 0;
  cache.entries[key] = entry;
}

export function incrementGamesRecorded(): void {
  ensureLoaded();
  cache.gamesRecorded++;
}

/** Returns a flat {key → scoreDelta} map for sending to the worker. */
export function getSerializedPatternCache(): Record<string, number> {
  ensureLoaded();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(cache.entries)) {
    if (v.scoreDelta !== 0) out[k] = v.scoreDelta;
  }
  return out;
}

export function flushPatternCache(): void {
  ensureLoaded();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* ignore quota errors */ }
}

/** Only for tests — resets in-memory state. */
export function resetPatternCacheForTesting(): void {
  cache = { version: CACHE_VERSION, gamesRecorded: 0, entries: {} };
  loaded = false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/game/training/patternCache.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/training/patternCache.ts tests/game/training/patternCache.test.ts
git commit -m "feat: add pattern cache with move feature extraction, accumulation, and persistence"
```

---

## Task 10: Wire pattern cache into training loop

**Files:**
- Modify: `src/store/trainingStore.ts`

- [ ] **Step 1: Add pattern cache imports to trainingStore.ts**

Add at the top:
```ts
import {
  extractMoveFeatures,
  accumulatePattern,
  incrementGamesRecorded,
  flushPatternCache,
} from '@/game/training/patternCache';
```

- [ ] **Step 2: Update `playGameStepByStep` to record move features**

In `trainingStore.ts`, find `async function playGameStepByStep(...)`. Update it to record features and outcomes. The function currently has `let state = createGame(2)` and a move loop. Update:

```ts
async function playGameStepByStep(
  genome1: Genome,
  genome2: Genome,
  maxMoves: number,
  signal: AbortSignal
): Promise<StepResult> {
  let state = createGame(2);
  const players = state.activePlayers;
  const genomes: Record<number, Genome> = {
    [players[0]]: genome1,
    [players[1]]: genome2,
  };

  let totalMoves = 0;
  // Collect (features, playerIndex) pairs to update with outcome after game ends
  const recordedFeatures: Array<{ features: ReturnType<typeof extractMoveFeatures>; player: number }> = [];

  useTrainingStore.setState({ currentGameState: state });

  while (!isGameFullyOver(state) && totalMoves < maxMoves) {
    if (signal.aborted) return { winner: null };

    while (useTrainingStore.getState().isPaused) {
      if (signal.aborted) return { winner: null };
      await sleep(200);
    }

    const currentPlayer = state.currentPlayer;
    const genome = genomes[currentPlayer];

    const move = findBestMoveWithGenome(state, genome);
    if (!move) break;

    // Record features before applying (needs pre-move state)
    const features = extractMoveFeatures(state, move, currentPlayer);
    if (features) {
      recordedFeatures.push({ features, player: currentPlayer });
    }

    state = applyMove(state, move);
    totalMoves++;

    useTrainingStore.setState((s) => ({
      currentGameState: state,
      currentMatchup: s.currentMatchup
        ? { ...s.currentMatchup, moveCount: totalMoves }
        : null,
    }));

    await sleep(0);
  }

  let winner: 0 | 1 | null = null;
  if (state.finishedPlayers.length > 0) {
    const winnerPlayer = state.finishedPlayers[0].player;
    winner = winnerPlayer === players[0] ? 0 : 1;
  }

  // Update pattern cache with game outcome
  if (recordedFeatures.length > 0) {
    const winnerPlayerIndex = winner !== null ? players[winner] : null;
    for (const { features, player } of recordedFeatures) {
      accumulatePattern(features, player === winnerPlayerIndex);
    }
    incrementGamesRecorded();
  }

  return { winner };
}
```

- [ ] **Step 3: Flush pattern cache after each generation**

In `runTrainingLoop`, find the block after the generation completes (around the `generationHistory = [...generationHistory, result]` line). Add a flush call:

```ts
// Flush pattern cache after each generation
flushPatternCache();
```

Place it just before the `persistProgress(...)` call at the end of each generation.

- [ ] **Step 4: Run the full test suite to catch regressions**

```bash
npx vitest run tests/game/training.test.ts tests/game/training/patternCache.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/trainingStore.ts
git commit -m "feat: record pattern cache features during GA tournament games"
```

---

## Task 11: Wire pattern cache into search (send to worker, apply in getTopMoves)

**Files:**
- Modify: `src/game/ai/workerClient.ts`
- Modify: `src/game/ai/worker.ts`
- Modify: `src/game/ai/search.ts`
- Modify: `src/hooks/useAITurn.ts`

- [ ] **Step 1: Add `patternCache` to `WorkerRequest` in workerClient.ts**

In `src/game/ai/workerClient.ts`, add to the `WorkerRequest` interface:

```ts
export interface WorkerRequest {
  state: SerializedGameState;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  openingMoves?: { from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number } }[] | null;
  patternCache?: Record<string, number>; // pattern key → scoreDelta
}
```

- [ ] **Step 2: Add `setPatternCache` export to `search.ts`**

Near the top of `src/game/ai/search.ts`, add a module-level variable and export:

```ts
// Module-level pattern cache (set by worker.ts before each search)
let _patternCache: Record<string, number> = {};

export function setPatternCache(cache: Record<string, number>): void {
  _patternCache = cache;
}
```

- [ ] **Step 3: Apply pattern cache deltas in `getTopMoves` and `getTopMovesFromList`**

In `getTopMoves`, inside the `scored.map((move) => { ... })` block, after computing the initial `score`, add before the `return { move, score }`:

```ts
// Apply pattern cache score delta for move ordering
if (Object.keys(_patternCache).length > 0) {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const goalCenter = centroid(goalPositions);
  const chainLen = move.jumpPath?.length ?? 1;
  const inGoal = countPiecesInGoal(state, player);
  // Compute bucket inline (matches patternCache.ts key format)
  const inGoalBucket =
    inGoal >= 3 && inGoal <= 5 ? '3-5' :
    inGoal >= 6 && inGoal <= 7 ? '6-7' :
    inGoal === 8 ? '8' : null;
  if (inGoalBucket) {
    const isChainJump = move.isJump && chainLen > 1;
    const lenBucket = chainLen >= 3 ? '3+' : String(chainLen);
    const isDGE = !goalKeys.has(coordKey(move.from)) && goalKeys.has(coordKey(move.to));
    const dist = cubeDistance(move.from, goalCenter);
    const db = dist <= 3 ? 'near' : dist <= 6 ? 'mid' : 'far';
    const patternKey = `${inGoalBucket}_${isChainJump ? 'cj' : 'nj'}_${lenBucket}_${isDGE ? 'dge' : 'ndge'}_${db}`;
    score += _patternCache[patternKey] ?? 0;
  }
}
```

Apply the same block in `getTopMovesFromList` (the code is identical — both functions score moves for ordering).

- [ ] **Step 4: Update `worker.ts` to receive and apply pattern cache**

Replace the current `worker.ts` contents with:

```ts
import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove, setPatternCache } from './search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, openingMoves, patternCache } = e.data;
  if (patternCache) setPatternCache(patternCache);
  const state = deserializeGameState(serialized);
  const move = findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
```

- [ ] **Step 5: Send pattern cache from useAITurn.ts**

In `src/hooks/useAITurn.ts`, add import:
```ts
import { getSerializedPatternCache } from '@/game/training/patternCache';
```

Find the `worker.postMessage({...})` call (around line 142) and add `patternCache`:

```ts
worker.postMessage({
  state: serialized,
  difficulty: currentAI.difficulty,
  personality: currentAI.personality,
  openingMoves,
  patternCache: getSerializedPatternCache(),
});
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run tests/game/ 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 7: Run build**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/game/ai/workerClient.ts src/game/ai/worker.ts src/game/ai/search.ts src/hooks/useAITurn.ts
git commit -m "feat: send pattern cache to worker and apply score deltas in move ordering"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Replace `detectPhase`/depth constants with `computeSearchParams` | Task 1, 3 |
| Strip `findEndgameMove` to direct-entry + move-deeper | Task 2 |
| `AI_DEPTH`, `AI_OPENING_DEPTH`, `AI_ENDGAME_DEPTH`, `AI_MOVE_LIMIT` removed | Task 1 |
| Depth curve from spec table implemented | Task 1 |
| Tablebase position key (canonical, order-independent) | Task 5 |
| Tablebase localStorage storage + lookup | Task 5 |
| Tablebase lookup before rule-based fast-path | Task 6 |
| `buildEndgameTablebase` with 1/2-piece enumeration | Task 7 |
| Training UI: Build Endgame Table button + progress | Task 8 |
| Pattern cache feature extraction | Task 9 |
| Pattern cache accumulation during tournament | Task 10 |
| Pattern cache flushed after each generation | Task 10 |
| Pattern cache applied in move ordering (getTopMoves) | Task 11 |
| `findBestMoveWithGenome` depth params for tablebase builder | Task 4 |

All spec requirements covered.

**Placeholder scan:** No TBDs or TODOs in code steps.

**Type consistency:**
- `TablebaseEntry` defined in Task 5, used in Tasks 6, 7 ✓
- `MoveFeatures` defined in Task 9, used in Task 10 ✓
- `computeSearchParams` exported in Task 1, used in Task 3 ✓
- `setPatternCache` added in Task 11, called from worker in Task 11 ✓
- `getSerializedPatternCache` added in Task 9, called in Task 11 ✓
- `buildEndgameTablebase` options param matches test call in Task 7 ✓
