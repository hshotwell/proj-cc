# Endgame Training Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the endgame AI by applying evolved endgame weights to all difficulties, removing the obsolete 'evolved' difficulty, uncapping fitness scoring, adding 10 new training puzzles, 4 new pattern genes, and upgrading the training runner to beam search depth-3.

**Architecture:** New pattern genes (chainDepth, pathClearance, formationSpread, vanguardBonus) are added to the Genome type and evaluated in `training/evaluate.ts`. A new `loadEndgameGenome()` function loads the puzzle-trained genome for use in `ai/evaluate.ts` during the endgame phase for all difficulty levels. The training runner in `endgameRunner.ts` switches from depth-0 greedy to beam-3 depth-3 search. Convex cron moves from 60 to 180 minutes.

**Tech Stack:** TypeScript, Vitest, Convex (backend actions/mutations), Zustand, Next.js App Router

---

## File Map

**Modified:**
- `src/types/training.ts` — add 4 new fields to `Genome`
- `src/types/ai.ts` — remove `'evolved'` from `AIDifficulty` + all records
- `src/game/training/evaluate.ts` — add DEFAULT values + implement 4 pattern scoring functions + integrate into `evaluateWithGenome`
- `src/game/training/evolution.ts` — add GENE_RANGES for 4 new genes
- `src/game/training/endgameRunner.ts` — new scoring formula + beam search runner
- `src/game/training/persistence.ts` — add `loadEndgameGenome()`
- `src/hooks/useEvolvedGenome.ts` — add `getServerEndgameGenome()` with 5-min TTL cache
- `src/game/ai/evaluate.ts` — use endgame genome for all difficulties in endgame phase; remove 'evolved' branch
- `src/game/ai/search.ts` — remove 'evolved' regression-penalty branch
- `src/app/play/page.tsx` — remove 'evolved' UI option + `evolvedAvailable` state
- `convex/endgameTrainingActions.ts` — add 10 puzzles to SEED_PUZZLES; update budget comment
- `convex/endgameTraining.ts` — add `addMissingPuzzles` internal mutation for migration
- `convex/crons.ts` — change interval from 60 to 180 minutes

**Created:**
- `tests/game/training/endgamePatterns.test.ts` — tests for pattern scoring + fitness formula + beam search

---

## Task 1: Add 4 new genes to the Genome type

**Files:**
- Modify: `src/types/training.ts`

- [ ] **Step 1: Update Genome interface**

Replace the existing `Genome` interface in `src/types/training.ts` with:

```typescript
export interface Genome {
  // Evaluation weights
  progress: number;
  goalDistance: number;
  centerControl: number;
  blocking: number;
  jumpPotential: number;
  // Pattern weights (board-agnostic)
  chainDepth: number;
  pathClearance: number;
  formationSpread: number;
  vanguardBonus: number;
  // Scoring constants
  stragglerDivisor: number;
  centerPieceValue: number;
  blockingBaseValue: number;
  jumpPotentialMultiplier: number;
  jumpPotentialCap: number;
  // Penalty constants
  regressionMultiplier: number;
  goalLeavePenalty: number;
  repetitionPenalty: number;
  cyclePenalty: number;
  endgameThreshold: number;
}
```

- [ ] **Step 2: Add new gene ranges to evolution.ts**

In `src/game/training/evolution.ts`, add 4 entries to `GENE_RANGES` (the object already exists at the top of the file):

```typescript
const GENE_RANGES: Record<keyof Genome, [number, number]> = {
  progress: [0.5, 10],
  goalDistance: [0.5, 10],
  centerControl: [0, 5],
  blocking: [0, 8],
  jumpPotential: [0, 5],
  chainDepth: [0, 5],
  pathClearance: [0, 5],
  formationSpread: [0, 5],
  vanguardBonus: [0, 5],
  stragglerDivisor: [1, 20],
  centerPieceValue: [0.5, 10],
  blockingBaseValue: [1, 15],
  jumpPotentialMultiplier: [0.5, 5],
  jumpPotentialCap: [10, 80],
  regressionMultiplier: [1, 15],
  goalLeavePenalty: [10, 120],
  repetitionPenalty: [20, 150],
  cyclePenalty: [10, 100],
  endgameThreshold: [4, 9],
};
```

- [ ] **Step 3: Add default values to DEFAULT_GENOME in evaluate.ts**

In `src/game/training/evaluate.ts`, add the 4 new fields to `DEFAULT_GENOME` (conservative starting values — the GA will tune them):

```typescript
export const DEFAULT_GENOME: Genome = {
  // Evaluation weights (generalist personality)
  progress: 3.0,
  goalDistance: 2.5,
  centerControl: 1.0,
  blocking: 1.0,
  jumpPotential: 0.5,
  // Pattern weights
  chainDepth: 1.0,
  pathClearance: 1.0,
  formationSpread: 0.5,
  vanguardBonus: 1.0,
  // Scoring constants
  stragglerDivisor: 5,
  centerPieceValue: 3,
  blockingBaseValue: 5,
  jumpPotentialMultiplier: 2,
  jumpPotentialCap: 40,
  // Penalty constants
  regressionMultiplier: 5,
  goalLeavePenalty: 60,
  repetitionPenalty: 80,
  cyclePenalty: 50,
  endgameThreshold: 7,
};
```

- [ ] **Step 4: Build to verify no type errors**

```bash
npm run build 2>&1 | head -40
```

Expected: TypeScript will flag any place that constructs a `Genome` object without the new fields. Fix each by adding the 4 new fields with their default values (`chainDepth: 1.0, pathClearance: 1.0, formationSpread: 0.5, vanguardBonus: 1.0`). Likely places: `endgameTrainingActions.ts` warm-start genome construction (if any inline genome literals exist).

- [ ] **Step 5: Commit**

```bash
git add src/types/training.ts src/game/training/evolution.ts src/game/training/evaluate.ts
git commit -m "feat: add chainDepth, pathClearance, formationSpread, vanguardBonus genome genes"
```

---

## Task 2: Implement the 4 pattern scoring functions

**Files:**
- Modify: `src/game/training/evaluate.ts`
- Create: `tests/game/training/endgamePatterns.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/game/training/endgamePatterns.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { CubeCoord } from '@/types/game';
import {
  computeChainDepth,
  computePathClearance,
  computeFormationSpread,
  computeVanguardBonus,
} from '@/game/training/evaluate';

// Helper to build a minimal board Map for testing
function makeBoard(pieces: Array<{ q: number; r: number; player: number }>) {
  const board = new Map<string, { type: 'piece'; player: number } | { type: 'empty' }>();
  for (const p of pieces) {
    board.set(`${p.q},${p.r}`, { type: 'piece', player: p.player });
  }
  return board;
}

const coord = (q: number, r: number): CubeCoord => ({ q, r, s: -q - r });

describe('computeChainDepth', () => {
  it('returns 0 when no jumps are available', () => {
    // Isolated piece — no neighbors to jump over
    const board = makeBoard([{ q: 0, r: 0, player: 0 }]);
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBe(0);
  });

  it('returns 1 when a single jump is available', () => {
    // Piece at (0,0), neighbor at (1,0), empty landing at (2,0)
    const board = makeBoard([
      { q: 0, r: 0, player: 0 },
      { q: 1, r: 0, player: 1 },
    ]);
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBeGreaterThanOrEqual(1);
  });

  it('returns > 1 when a chain jump is possible', () => {
    // Piece at (0,0), jump over (1,0)→(2,0), then jump over (3,0)→(4,0)
    const board = makeBoard([
      { q: 0, r: 0, player: 0 },
      { q: 1, r: 0, player: 1 }, // first hop-over
      { q: 3, r: 0, player: 1 }, // second hop-over
    ]);
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBeGreaterThanOrEqual(2);
  });
});

describe('computeFormationSpread', () => {
  it('returns 0 for a single piece', () => {
    expect(computeFormationSpread([coord(0, 0)])).toBe(0);
  });

  it('returns higher value for spread-out pieces than clustered ones', () => {
    const clustered = [coord(0, 0), coord(1, 0), coord(0, 1)];
    const spread = [coord(0, 0), coord(4, 0), coord(0, 4)];
    expect(computeFormationSpread(spread)).toBeGreaterThan(computeFormationSpread(clustered));
  });
});

describe('computeVanguardBonus', () => {
  const goalCenter = coord(3, 3);

  it('returns 0 when all pieces are the same distance from goal', () => {
    const pieces = [coord(0, 0), coord(0, 1), coord(1, 0)];
    // All similar distance, no clear vanguard
    const bonus = computeVanguardBonus(pieces, goalCenter);
    expect(bonus).toBeGreaterThanOrEqual(0);
  });

  it('returns higher bonus when leader is 2-4 ahead of group than when too far ahead', () => {
    const goodVanguard = [
      coord(2, 2), // leader: close to goal
      coord(0, 0), coord(0, 1), coord(1, 0), // pack ~3 units behind
    ];
    const tooFarVanguard = [
      coord(3, 3), // leader: right at goal
      coord(-2, -2), coord(-2, -1), coord(-1, -2), // pack way behind
    ];
    const goodBonus = computeVanguardBonus(goodVanguard, goalCenter);
    const farBonus = computeVanguardBonus(tooFarVanguard, goalCenter);
    expect(goodBonus).toBeGreaterThan(farBonus);
  });
});

describe('computePathClearance', () => {
  it('returns higher value when path to goal is clear', () => {
    const goalCenter = coord(3, 3);
    const goalSet = new Set(['3,3', '4,3', '3,4']);
    const piece = coord(0, 0);

    // Board with no blockers
    const clearBoard = makeBoard([{ q: 0, r: 0, player: 0 }]);
    // Board with a blocker on the path
    const blockedBoard = makeBoard([
      { q: 0, r: 0, player: 0 },
      { q: 1, r: 1, player: 1 },
      { q: 2, r: 2, player: 1 },
    ]);

    const clearScore = computePathClearance([piece], goalCenter, goalSet, clearBoard);
    const blockedScore = computePathClearance([piece], goalCenter, goalSet, blockedBoard);
    expect(clearScore).toBeGreaterThanOrEqual(blockedScore);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: FAIL — `computeChainDepth`, `computeFormationSpread`, `computeVanguardBonus`, `computePathClearance` not exported.

- [ ] **Step 3: Implement the 4 functions in evaluate.ts**

Add the following 4 exported functions to `src/game/training/evaluate.ts`, after the existing imports and before `DEFAULT_GENOME`. They also need the `coordKey` import (already present) and `DIRECTIONS` (already present):

```typescript
// ── Pattern scoring helpers ────────────────────────────────────────────────

/** Recursively find the maximum chain-jump depth from `from`. */
function getMaxChainDepth(
  from: CubeCoord,
  board: Map<string, { type: string }>,
  visited: Set<string>
): number {
  const fromKey = coordKey(from);
  visited = new Set(visited);
  visited.add(fromKey);
  let max = 0;
  for (const dir of DIRECTIONS) {
    const over = cubeAdd(from, dir);
    const land = cubeAdd(over, dir);
    const landKey = coordKey(land);
    if (visited.has(landKey)) continue;
    const overContent = board.get(coordKey(over));
    const landContent = board.get(landKey);
    if (overContent?.type === 'piece' && (!landContent || landContent.type === 'empty')) {
      const deeper = getMaxChainDepth(land, board, visited);
      max = Math.max(max, 1 + deeper);
    }
  }
  return max;
}

/**
 * Sum of max chain-jump depth across all pieces.
 * Exported for testing.
 */
export function computeChainDepth(
  pieces: CubeCoord[],
  board: Map<string, { type: string }>
): number {
  let total = 0;
  for (const piece of pieces) {
    total += getMaxChainDepth(piece, board, new Set());
  }
  return total;
}

/**
 * For each non-goal piece, count how many move options (steps + jump landings)
 * are closer to the goal center and currently empty. More open options = more clearance.
 * Exported for testing.
 */
export function computePathClearance(
  pieces: CubeCoord[],
  goalCenter: CubeCoord,
  goalSet: Set<string>,
  board: Map<string, { type: string }>
): number {
  let total = 0;
  for (const piece of pieces) {
    if (goalSet.has(coordKey(piece))) continue;
    const distToGoal = cubeDistance(piece, goalCenter);
    let openOptions = 0;
    for (const dir of DIRECTIONS) {
      const adj = cubeAdd(piece, dir);
      const adjContent = board.get(coordKey(adj));
      if (adjContent?.type === 'piece') {
        // Could jump over — check landing
        const landing = cubeAdd(adj, dir);
        const landContent = board.get(coordKey(landing));
        if ((!landContent || landContent.type === 'empty') &&
            cubeDistance(landing, goalCenter) < distToGoal) {
          openOptions++;
        }
      } else if (!adjContent || adjContent.type === 'empty') {
        if (cubeDistance(adj, goalCenter) < distToGoal) {
          openOptions++;
        }
      }
    }
    total += openOptions;
  }
  return total;
}

/**
 * Standard deviation of piece positions from the group centroid.
 * Higher = more spread out (penalized by genome.formationSpread).
 * Exported for testing.
 */
export function computeFormationSpread(pieces: CubeCoord[]): number {
  if (pieces.length < 2) return 0;
  const cx = pieces.reduce((s, p) => s + p.q, 0) / pieces.length;
  const cy = pieces.reduce((s, p) => s + p.r, 0) / pieces.length;
  const variance =
    pieces.reduce((s, p) => {
      const dx = p.q - cx;
      const dy = p.r - cy;
      return s + dx * dx + dy * dy;
    }, 0) / pieces.length;
  return Math.sqrt(variance);
}

/**
 * Bell-curve bonus for having a lead piece 2–4 cells ahead of the group average.
 * Peaks at gap=3, falls off for too-close or too-far leaders.
 * Exported for testing.
 */
export function computeVanguardBonus(
  pieces: CubeCoord[],
  goalCenter: CubeCoord
): number {
  if (pieces.length < 2) return 0;
  const distances = pieces.map((p) => cubeDistance(p, goalCenter));
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const minDist = Math.min(...distances); // lead piece
  const gap = avgDist - minDist; // how far ahead is the leader
  // Bell curve: peak at gap=3, sigma=2
  return Math.exp(-((gap - 3) ** 2) / 8);
}
```

- [ ] **Step 4: Integrate pattern scores into evaluateWithGenome**

In `src/game/training/evaluate.ts`, update the `evaluateWithGenome` function. After computing `jumpPotentialScore`, add the 4 new scores. Also update the return statement:

```typescript
  // 7. Chain depth — actual jump chain potential
  const chainDepthScore = computeChainDepth(pieces, state.board as Map<string, { type: string }>);

  // 8. Path clearance — open routes toward goal
  const goalSet = new Set(goalPositions.map(coordKey));
  const pathClearanceScore = computePathClearance(pieces, goalCenter, goalSet, state.board as Map<string, { type: string }>);

  // 9. Formation spread — penalize scattered pieces
  const spreadScore = computeFormationSpread(pieces);

  // 10. Vanguard bonus — reward useful lead piece
  const vanguardScore = computeVanguardBonus(pieces, goalCenter);

  // Endgame focus
  const endgame = inGoal >= genome.endgameThreshold || state.winner !== null;
  const wProgress = endgame ? genome.progress * 2 : genome.progress;
  const wGoalDist = endgame ? genome.goalDistance * 2 : genome.goalDistance;
  const wStraggler = endgame ? 3.0 : 1.5;
  const wCenter = endgame ? 0 : genome.centerControl;
  const wBlocking = endgame ? 0 : genome.blocking;
  const wJumpPotential = endgame ? 0 : genome.jumpPotential;
  // Pattern weights scale with endgame (chain/clearance more important in endgame)
  const wChainDepth = endgame ? genome.chainDepth * 1.5 : genome.chainDepth;
  const wPathClearance = endgame ? genome.pathClearance * 1.5 : genome.pathClearance;
  const wFormationSpread = genome.formationSpread;
  const wVanguard = genome.vanguardBonus;

  return (
    wProgress * progressScore +
    wGoalDist * goalDistanceScore +
    wStraggler * stragglerScore +
    wCenter * centerControlScore +
    wBlocking * blockingScore +
    wJumpPotential * jumpPotentialScore +
    wChainDepth * chainDepthScore +
    wPathClearance * pathClearanceScore -
    wFormationSpread * spreadScore +
    wVanguard * vanguardScore
  );
```

Note: `formationSpread` is subtracted (penalty), all others added.

- [ ] **Step 5: Run tests**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 6: Full build check**

```bash
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/training/evaluate.ts tests/game/training/endgamePatterns.test.ts
git commit -m "feat: implement chainDepth, pathClearance, formationSpread, vanguardBonus scoring"
```

---

## Task 3: Add endgame genome loading

**Files:**
- Modify: `src/hooks/useEvolvedGenome.ts`
- Modify: `src/game/training/persistence.ts`

- [ ] **Step 1: Add getServerEndgameGenome to useEvolvedGenome.ts**

Read `src/hooks/useEvolvedGenome.ts` first, then add a parallel caching block for the endgame genome. Add this below the existing evolved genome cache block (which handles `api.training.getEvolvedGenome`):

```typescript
// ── Endgame genome cache (separate from general evolved genome) ────────────
let cachedEndgameGenome: Genome | null = null;
let endgameCacheTimestamp = 0;

export function getServerEndgameGenome(): Genome | null {
  const now = Date.now();
  if (cachedEndgameGenome !== null && now - endgameCacheTimestamp < CACHE_TTL) {
    return cachedEndgameGenome;
  }
  // Trigger async refresh (fire-and-forget)
  fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'endgameTraining:getEndgameEvolvedGenome',
      args: {},
      format: 'json',
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data?.value?.genome) {
        cachedEndgameGenome = data.value.genome as Genome;
        endgameCacheTimestamp = Date.now();
      }
    })
    .catch(() => {/* ignore */});

  return cachedEndgameGenome; // return stale or null while refreshing
}
```

Note: check how the existing `getServerEvolvedGenome` fetches from Convex in this file — mirror the same fetch pattern exactly (it may use a ConvexHttpClient or a direct fetch). Use the same approach for consistency.

- [ ] **Step 2: Add loadEndgameGenome to persistence.ts**

In `src/game/training/persistence.ts`, add after the existing `loadEvolvedGenome` function:

```typescript
import { getServerEndgameGenome } from '@/hooks/useEvolvedGenome';

export function loadEndgameGenome(): Genome | null {
  // Endgame-specific genome (puzzle-trained) takes priority during endgame
  const serverGenome = getServerEndgameGenome();
  if (serverGenome) return serverGenome;
  return null; // No local fallback — if not loaded, caller uses hardcoded weights
}
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEvolvedGenome.ts src/game/training/persistence.ts
git commit -m "feat: add endgame genome server fetch and loadEndgameGenome"
```

---

## Task 4: Apply endgame genome to all AI difficulties + remove 'evolved'

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/game/ai/evaluate.ts`
- Modify: `src/game/ai/search.ts`
- Modify: `src/app/play/page.tsx`

- [ ] **Step 1: Remove 'evolved' from AIDifficulty and all records in ai.ts**

Replace the entire content of `src/types/ai.ts` with:

```typescript
import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

/** Base mid-game search depth. */
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 2,
};

/** Deeper search used in early-game and end-game phases. */
export const AI_OPENING_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
};

export const AI_ENDGAME_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
};

export const AI_MOVE_LIMIT: Record<AIDifficulty, number> = {
  easy: 10,
  medium: 15,
  hard: 20,
};

export const AI_THINK_DELAY = 400;
```

- [ ] **Step 2: Apply endgame genome in evaluatePosition + remove evolved branch**

In `src/game/ai/evaluate.ts`, make two changes:

**a)** Add the import at the top (after existing imports):
```typescript
import { loadEndgameGenome } from '../training/persistence';
```

**b)** Replace the `evaluatePosition` function's opening block. Find:
```typescript
export function evaluatePosition(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty = 'hard'
): number {
  // Delegate to genome-based evaluation for evolved difficulty
  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return evaluateWithGenome(state, player, genome);
    }
    // Fall back to hard/generalist if no genome saved
  }
```

Replace with:
```typescript
export function evaluatePosition(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty = 'hard'
): number {
  // In endgame phase, all difficulties use the puzzle-trained endgame genome
  const inGoal = countPiecesInGoal(state, player);
  if (inGoal >= 7) {
    const endgameGenome = loadEndgameGenome();
    if (endgameGenome) {
      return evaluateWithGenome(state, player, endgameGenome);
    }
    // Fall through to personality-based evaluation if genome not yet loaded
  }
```

Also remove the `loadEvolvedGenome` import from this file if it is no longer used anywhere else in evaluate.ts (search the file for other usages first).

- [ ] **Step 3: Remove evolved branch from search.ts**

In `src/game/ai/search.ts`, find and remove:
```typescript
  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return computeRegressionPenaltyWithGenome(state, move, player, genome);
    }
  }
```

Then check if `loadEvolvedGenome` is imported in search.ts — if the only usage was in that block, remove the import too.

- [ ] **Step 4: Remove evolved from play page UI**

In `src/app/play/page.tsx`:

**a)** Remove the `evolvedAvailable` state and its `useEffect` initialization:
```typescript
// Remove this state:
const [evolvedAvailable, setEvolvedAvailable] = useState(false);
// Remove this effect (or the line inside it):
setEvolvedAvailable(hasEvolvedGenome());
```

**b)** Remove the `hasEvolvedGenome` import if it is no longer used.

**c)** Find the `<option value="evolved" ...>` element in the difficulty selector and remove it entirely.

- [ ] **Step 5: Handle saved game configs with 'evolved' difficulty**

In any place that loads an `AIConfig` from localStorage or Convex and assigns `difficulty`, add a guard. Search for where `AIConfig` or `difficulty` is deserialized from storage. In `src/store/gameStore.ts` or wherever games are loaded, add:

```typescript
// Migrate legacy 'evolved' difficulty to 'hard'
if ((config.difficulty as string) === 'evolved') {
  config.difficulty = 'hard';
}
```

Search for the loading location with:
```bash
grep -r "difficulty" src/store/ --include="*.ts" -n
```
Apply the guard wherever AI configs are hydrated from storage.

- [ ] **Step 6: Build and fix all remaining type errors**

```bash
npm run build 2>&1 | head -60
```

Fix any TypeScript errors from removing 'evolved' — usually exhaustive switch statements or record lookups. TypeScript strict mode will catch them all.

- [ ] **Step 7: Run all tests**

```bash
npm run test 2>&1 | tail -30
```

Expected: all pass (pre-existing pathfinding.test.ts errors are known and unrelated).

- [ ] **Step 8: Commit**

```bash
git add src/types/ai.ts src/game/ai/evaluate.ts src/game/ai/search.ts src/app/play/page.tsx src/store/
git commit -m "feat: apply endgame genome to all AI difficulties; remove 'evolved' difficulty option"
```

---

## Task 5: Reform fitness scoring formula

**Files:**
- Modify: `src/game/training/endgameRunner.ts`
- Modify: `tests/game/training/endgamePatterns.test.ts`

- [ ] **Step 1: Add scoring formula tests**

Append to `tests/game/training/endgamePatterns.test.ts`:

```typescript
import { scorePuzzleResult } from '@/game/training/endgameRunner';

describe('scorePuzzleResult', () => {
  it('returns 0 for unsolved', () => {
    expect(scorePuzzleResult(false, 99, 10)).toBe(0);
  });

  it('returns 100 for exactly hitting par', () => {
    expect(scorePuzzleResult(true, 10, 10)).toBe(100);
  });

  it('returns 200 for finishing in half par time', () => {
    expect(scorePuzzleResult(true, 5, 10)).toBe(200);
  });

  it('returns > 100 for beating par', () => {
    expect(scorePuzzleResult(true, 8, 10)).toBeGreaterThan(100);
  });

  it('returns < 100 for finishing over par', () => {
    expect(scorePuzzleResult(true, 12, 10)).toBeLessThan(100);
  });

  it('returns 0 when far over par (20 turns on par 10)', () => {
    expect(scorePuzzleResult(true, 20, 10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: FAIL — `scorePuzzleResult` not exported.

- [ ] **Step 3: Update endgameRunner.ts**

In `src/game/training/endgameRunner.ts`, add an exported `scorePuzzleResult` function and update `scoreGenomeOnPuzzles` to use it:

```typescript
/**
 * Score a single puzzle result.
 * - unsolved → 0
 * - solved > par → max(0, 100 − (turns − par) × 10)
 * - solved ≤ par → 100 × (par / turnsUsed)  [no ceiling — ratio-based]
 */
export function scorePuzzleResult(
  solved: boolean,
  turnsUsed: number,
  par: number
): number {
  if (!solved) return 0;
  if (turnsUsed <= par) {
    return (par / Math.max(1, turnsUsed)) * 100;
  }
  return Math.max(0, 100 - (turnsUsed - par) * 10);
}

/**
 * Score a genome across a set of puzzles.
 * Returns the mean score across all puzzles (uncapped — ratio scoring).
 */
export function scoreGenomeOnPuzzles(
  genome: Genome,
  puzzles: StoredPuzzle[]
): number {
  if (puzzles.length === 0) return 0;
  let total = 0;
  for (const puzzle of puzzles) {
    const { solved, turnsUsed } = runEndgamePuzzle(
      puzzle.positions,
      puzzle.goalPositions,
      puzzle.par,
      genome
    );
    total += scorePuzzleResult(solved, turnsUsed, puzzle.par);
  }
  return total / puzzles.length;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/training/endgameRunner.ts tests/game/training/endgamePatterns.test.ts
git commit -m "feat: uncapped ratio-based fitness scoring for endgame puzzles"
```

---

## Task 6: Add 10 new seed puzzles + migration mutation

**Files:**
- Modify: `convex/endgameTrainingActions.ts`
- Modify: `convex/endgameTraining.ts`

All positions use player 0's goal zone (GOAL) which is already defined in endgameTrainingActions.ts.

- [ ] **Step 1: Add 10 new puzzles to SEED_PUZZLES in endgameTrainingActions.ts**

Append to the `SEED_PUZZLES` array (after the existing 5 entries):

```typescript
  {
    // 9 in goal, 1 straggler ~4 hops out — tests regression avoidance
    name: 'Endgame Seed · Last Mile',
    positions: ['2,3','3,2','4,1','4,2','3,3','2,4','4,3','4,4','3,4','-1,2'],
    goalPositions: GOAL,
    par: 4,
    source: 'seeded',
  },
  {
    // 9 in goal, 1 piece needs indirect path to the only open goal cell
    name: 'Endgame Seed · Corner Entry',
    positions: ['1,4','3,2','4,1','4,2','3,3','2,4','4,3','4,4','3,4','-1,3'],
    goalPositions: GOAL,
    par: 3,
    source: 'seeded',
  },
  {
    // 8 in goal, 1 close, 1 still in starting zone — tests prioritization
    name: 'Endgame Seed · Straggler Crisis',
    positions: ['3,2','4,1','4,2','3,3','2,4','4,3','4,4','3,4','0,3','4,-5'],
    goalPositions: GOAL,
    par: 8,
    source: 'seeded',
  },
  {
    // 7 in goal, 3 pieces bunched at goal entrance needing ordered entry
    name: 'Endgame Seed · Traffic Jam',
    positions: ['4,1','4,2','3,3','2,4','4,3','4,4','3,4','0,3','1,3','0,4'],
    goalPositions: GOAL,
    par: 4,
    source: 'seeded',
  },
  {
    // 6 in goal, 4 pieces enabling chain jumps into goal
    name: 'Endgame Seed · Chain Ladder',
    positions: ['4,1','4,2','3,3','2,4','4,3','4,4','-1,1','0,2','1,2','0,3'],
    goalPositions: GOAL,
    par: 5,
    source: 'seeded',
  },
  {
    // 5 in goal, 3 near, 2 far — tests handling two separate groups
    name: 'Endgame Seed · Two Waves',
    positions: ['3,3','2,4','4,3','4,4','3,4','0,3','1,2','2,1','1,-1','0,-1'],
    goalPositions: GOAL,
    par: 10,
    source: 'seeded',
  },
  {
    // 5 in goal, 5 pieces funneling through a narrow corridor
    name: 'Endgame Seed · The Bottleneck',
    positions: ['4,2','3,3','4,3','4,4','3,4','0,3','1,3','0,4','1,2','0,2'],
    goalPositions: GOAL,
    par: 8,
    source: 'seeded',
  },
  {
    // 4 in goal, 6 pieces scattered at varied distances
    name: 'Endgame Seed · Spread Out',
    positions: ['4,3','4,4','3,4','2,4','0,3','2,1','0,0','1,-1','-1,1','2,-1'],
    goalPositions: GOAL,
    par: 14,
    source: 'seeded',
  },
  {
    // 2 in goal, 8 pieces in approach zone — sustained progress test
    name: 'Endgame Seed · Long Road',
    positions: ['4,4','3,4','0,3','1,2','-1,2','2,1','1,1','0,0','1,-1','2,-1'],
    goalPositions: GOAL,
    par: 20,
    source: 'seeded',
  },
  {
    // 0 in goal, all 10 pieces mid-board — full approach test
    name: 'Endgame Seed · Full Approach',
    positions: ['0,0','1,0','0,1','-1,1','1,-1','2,0','-1,0','0,-1','1,1','-1,2'],
    goalPositions: GOAL,
    par: 25,
    source: 'seeded',
  },
```

Also update the budget comment at the top of `runEndgameTrainingStep`:
```typescript
 * Compute budget: ~5 gens × 8 genomes × 15 puzzles ≈ 600 beam-search puzzle runs
 * per invocation (~15–20 s). At 8 invocations/day (180-min cron) with 256 MB RAM:
 * ~0.65 GB-hours/month. Under the 1 GB-hour/month limit.
```

- [ ] **Step 2: Add addMissingPuzzles migration mutation to endgameTraining.ts**

In `convex/endgameTraining.ts`, add after `seedPuzzles`:

```typescript
/**
 * Internal mutation: insert any SEED_PUZZLES not already in the DB (by name).
 * Safe to call multiple times — idempotent by name.
 */
export const addMissingPuzzles = internalMutation({
  args: {
    puzzles: v.array(
      v.object({
        name: v.string(),
        positions: v.array(v.string()),
        goalPositions: v.array(v.string()),
        par: v.number(),
        source: v.string(),
        createdAt: v.number(),
      })
    ),
  },
  handler: async (ctx, { puzzles }) => {
    for (const puzzle of puzzles) {
      const existing = await ctx.db
        .query('endgameTrainingPuzzles')
        .filter((q) => q.eq(q.field('name'), puzzle.name))
        .first();
      if (!existing) {
        await ctx.db.insert('endgameTrainingPuzzles', puzzle);
      }
    }
  },
});
```

- [ ] **Step 3: Call addMissingPuzzles in the training action**

In `convex/endgameTrainingActions.ts`, update the seeding logic. Find the existing seeding block:

```typescript
      if (puzzleCount === 0) {
        await ctx.runMutation(internal.endgameTraining.seedPuzzles, {
          puzzles: SEED_PUZZLES.map((p) => ({ ...p, createdAt: Date.now() })),
        });
        console.log(`[EndgameTraining] Seeded ${SEED_PUZZLES.length} puzzles`);
        return;
      }
```

Replace with:

```typescript
      // Always run addMissingPuzzles so new puzzles are added to existing deployments
      await ctx.runMutation(internal.endgameTraining.addMissingPuzzles, {
        puzzles: SEED_PUZZLES.map((p) => ({ ...p, createdAt: Date.now() })),
      });
      if (puzzleCount === 0) {
        console.log(`[EndgameTraining] Seeded ${SEED_PUZZLES.length} puzzles`);
        return; // Next invocation starts training
      }
```

- [ ] **Step 4: Commit**

```bash
git add convex/endgameTrainingActions.ts convex/endgameTraining.ts
git commit -m "feat: add 10 new endgame training puzzles and idempotent migration mutation"
```

---

## Task 7: Upgrade runner to beam search depth-3

**Files:**
- Modify: `src/game/training/endgameRunner.ts`
- Modify: `tests/game/training/endgamePatterns.test.ts`

- [ ] **Step 1: Add beam search test**

Append to `tests/game/training/endgamePatterns.test.ts`:

```typescript
import { runEndgamePuzzle } from '@/game/training/endgameRunner';
import { DEFAULT_GENOME } from '@/game/training/evaluate';

describe('runEndgamePuzzle (beam search)', () => {
  // "Nearly Done" puzzle: 9 in goal, 1 piece 1-2 hops out
  const GOAL = ['1,4','2,3','3,2','4,1','4,2','3,3','2,4','4,3','4,4','3,4'];
  const positions = ['2,3','3,2','4,1','4,2','3,3','2,4','4,3','4,4','3,4','0,3'];

  it('solves a simple puzzle', () => {
    const result = runEndgamePuzzle(positions, GOAL, 2, DEFAULT_GENOME);
    expect(result.solved).toBe(true);
  });

  it('solves in a reasonable number of turns', () => {
    const result = runEndgamePuzzle(positions, GOAL, 2, DEFAULT_GENOME);
    expect(result.turnsUsed).toBeLessThanOrEqual(6); // par × 3
  });
});
```

- [ ] **Step 2: Run test to confirm current behavior**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: PASS (current greedy runner already solves the simple puzzle — we're confirming baseline before replacing it).

- [ ] **Step 3: Replace greedy loop with beam search in endgameRunner.ts**

Replace the `runEndgamePuzzle` function body in `src/game/training/endgameRunner.ts`:

```typescript
const BEAM_WIDTH = 3;
const BEAM_DEPTH = 3;

/**
 * Score a move from a state using genome evaluation + penalties.
 * Returns -Infinity for vetoed moves (Infinity penalty).
 */
function scoreMoveForBeam(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  genome: Genome
): number {
  const regressionPenalty = computeRegressionPenaltyWithGenome(state, move, player, genome);
  const repetitionPenalty = computeRepetitionPenaltyWithGenome(state, move, player, genome);
  if (regressionPenalty === Infinity || repetitionPenalty === Infinity) return -Infinity;
  const next = applyMove(state, move);
  return (
    evaluateWithGenome(next, player, genome) - regressionPenalty - repetitionPenalty
  );
}

/**
 * Run one beam search step: expand all beam states, score their moves,
 * keep the top BEAM_WIDTH (state, chosenMove) pairs by leaf score.
 */
function expandBeam(
  beamStates: GameState[],
  player: PlayerIndex,
  genome: Genome
): { state: GameState; firstMove: Move | null }[] {
  const candidates: { state: GameState; score: number; firstMove: Move | null }[] = [];

  for (const beamState of beamStates) {
    const moves = getAllValidMoves(beamState, player);
    for (const move of moves) {
      const score = scoreMoveForBeam(beamState, move, player, genome);
      if (score === -Infinity) continue;
      candidates.push({
        state: applyMove(beamState, move),
        score,
        firstMove: (beamState as GameState & { _firstMove?: Move })._firstMove ?? move,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, BEAM_WIDTH).map((c) => ({
    state: Object.assign(c.state, { _firstMove: c.firstMove }),
    firstMove: c.firstMove,
  }));
}

/**
 * Run a single-player endgame puzzle with beam search (width=3, depth=3).
 * At each turn, look 3 moves ahead before committing to the best one.
 */
export function runEndgamePuzzle(
  positions: string[],
  goalPositions: string[],
  par: number,
  genome: Genome
): PuzzleResult {
  const maxTurns = par * 3;
  const player: PlayerIndex = 0;

  const layout = {
    id: 'endgame-training',
    name: 'Endgame Training',
    cells: DEFAULT_BOARD_LAYOUT.cells,
    startingPositions: { [player]: positions } as Record<PlayerIndex, string[]>,
    goalPositions: { [player]: goalPositions } as Record<PlayerIndex, string[]>,
    createdAt: 0,
  };

  let state = createGameFromLayout(layout);

  while (!isGameFullyOver(state) && state.turnNumber - 1 < maxTurns) {
    const moves = getAllValidMoves(state, player);
    if (moves.length === 0) break;

    // Single move — no need to search
    if (moves.length === 1) {
      state = applyMove(state, moves[0]);
      continue;
    }

    // Beam search: expand BEAM_DEPTH levels, pick the move leading to the best leaf
    let beam: { state: GameState; firstMove: Move | null }[] = [
      { state, firstMove: null },
    ];

    for (let depth = 0; depth < BEAM_DEPTH; depth++) {
      const next = expandBeam(beam.map((b) => b.state), player, genome);
      if (next.length === 0) break;
      beam = next;
    }

    // The best beam entry's firstMove is what we commit to
    const bestFirstMove = beam[0]?.firstMove;
    if (!bestFirstMove) {
      // Fallback: greedy depth-0 if beam produced nothing
      let bestMove = moves[0];
      let bestScore = -Infinity;
      for (const move of moves) {
        const score = scoreMoveForBeam(state, move, player, genome);
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      state = applyMove(state, bestMove);
    } else {
      state = applyMove(state, bestFirstMove);
    }
  }

  return {
    solved: state.finishedPlayers.length > 0 || isGameFullyOver(state),
    turnsUsed: state.turnNumber - 1,
  };
}
```

Also add the `Move` type to the imports at the top of `endgameRunner.ts` if not already present:
```typescript
import type { Genome } from '@/types/training';
import type { PlayerIndex, Move } from '@/types/game';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest tests/game/training/endgamePatterns.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/game/training/endgameRunner.ts tests/game/training/endgamePatterns.test.ts
git commit -m "feat: upgrade endgame puzzle runner to beam search width=3 depth=3"
```

---

## Task 8: Update cron interval to 3 hours

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Update the cron interval**

In `convex/crons.ts`, change the endgame training interval from 60 to 180 minutes:

```typescript
// Endgame training: runs every 3 hours (<0.65 GB-hours/month with beam search + 15 puzzles)
crons.interval("endgame training step", { minutes: 180 }, internal.endgameTrainingActions.runEndgameTrainingStep);
```

- [ ] **Step 2: Full test suite**

```bash
npm run test 2>&1 | tail -30
```

Expected: all pass (pre-existing pathfinding.test.ts errors are known).

- [ ] **Step 3: Final build**

```bash
npm run build 2>&1 | head -30
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add convex/crons.ts
git commit -m "chore: reduce endgame training cron to 180 minutes for beam search compute budget"
```

---

## Self-Review

**Spec coverage:**
- [x] Apply endgame genome to all AI in endgame phase → Task 4
- [x] Remove 'evolved' difficulty → Task 4
- [x] Uncapped ratio-based fitness scoring → Task 5
- [x] 10 new puzzles + migration → Task 6
- [x] chainDepth gene → Tasks 1 + 2
- [x] pathClearance gene → Tasks 1 + 2
- [x] formationSpread gene → Tasks 1 + 2
- [x] vanguardBonus bell-curve → Tasks 1 + 2
- [x] Beam search width=3 depth=3 runner → Task 7
- [x] Cron 60 → 180 minutes → Task 8
- [x] Endgame genome server fetch + caching → Task 3

**Potential issue:** `expandBeam` uses a type assertion `(beamState as GameState & { _firstMove?: Move })._firstMove` to thread the first-move choice through beam levels. This is a pragmatic approach — if the GameState type is strictly sealed (e.g. `readonly`), an alternative is to carry `{ state, firstMove }` tuples separately through the beam loop. Adjust if TypeScript rejects the assertion.

**Potential issue:** The `computePathClearance` and `computeChainDepth` functions receive `state.board` cast to `Map<string, { type: string }>`. Verify the actual board Map value type matches — it should be compatible since all entries have a `type` field, but check `src/types/game.ts` for the exact `BoardCell` type and adjust the cast if needed.
