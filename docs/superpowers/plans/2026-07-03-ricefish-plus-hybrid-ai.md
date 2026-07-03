# Ricefish+ Hybrid AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third AI engine, "Ricefish+", that blends the default AI's rich multi-term evaluation with Ricefish's fast search shell (alpha-beta + TT + quiescence + Max^n) via a smooth phase-dependent score.

**Architecture:** Refactor Ricefish's `findRicefishMove` to accept an injectable score function (backward compatible: default is `ricefishScore`). A new `src/game/ai/ricefish-plus/` module provides a hybrid score that linearly blends normalized default-AI eval with normalized Ricefish eval via a phase factor `α` computed from the leading player's goal-fill fraction. The Engine dropdown in `src/app/play/page.tsx` gains a "Ricefish+" option.

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- Ricefish's existing behavior is unchanged. All existing `tests/game/ai/ricefish/*.test.ts` must still pass after the refactor.
- Per-node evaluation cost must not exceed roughly 2× Ricefish's cost — no calls into default-AI machinery that runs pathfinding, opening books, learned weights, or threat evaluation from inside `hybridScore`. Only `evaluatePosition` and `ricefishScore` are called per node.
- Hybrid uses Ricefish's search shell constants (`RICEFISH_DEPTH_2P`, `RICEFISH_DEPTH_MP`, `RICEFISH_TIME_BUDGET_MS`) — no new depth/time tuning surface.
- Personality (`generalist`/`defensive`/`aggressive`) is inherited from both eval calls; no new personality dial.
- No opening book, no regression/repetition penalties, no threat eval, no learned-weight lookups.

---

## File Structure

**New files:**
- `src/game/ai/ricefish-plus/evaluate.ts` — hybrid score function and phase blend.
- `src/game/ai/ricefish-plus/search.ts` — entry point that calls Ricefish's search with the hybrid score.
- `src/game/ai/ricefish-plus/index.ts` — exports.
- `tests/game/ai/ricefish-plus/evaluate.test.ts` — hybrid eval tests.
- `tests/game/ai/ricefish-plus/search.test.ts` — smoke test that Ricefish+ returns a legal move.

**Modified files:**
- `src/types/ai.ts` — extend `AIEngine` union, add `RICEFISH_PLUS_*` constants (aliased to Ricefish's).
- `src/game/ai/ricefish/search.ts` — add injectable score function.
- `src/game/ai/worker.ts` — dispatch `'ricefish-plus'` → `findRicefishPlusMove`.
- `src/app/play/page.tsx` — add "Ricefish+" option to the engine dropdown.

---

## Task 1: Inject score function into Ricefish's search

**Files:**
- Modify: `src/game/ai/ricefish/search.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - Exported type `type RicefishScoreFn = (state: GameState, player: PlayerIndex, personality: AIPersonality, cache?: GoalCellsCache) => number;` from `src/game/ai/ricefish/evaluate.ts` (re-exported through `search.ts` or via existing evaluate module — see below).
  - Modified export `findRicefishMove(state: GameState, difficulty: AIDifficulty, personality: AIPersonality, scoreFn?: RicefishScoreFn): Move | null` — new optional final parameter defaulting to `ricefishScore`.

- [ ] **Step 1: Add `RicefishScoreFn` type to `src/game/ai/ricefish/evaluate.ts`**

At the bottom of `src/game/ai/ricefish/evaluate.ts`, add:

```ts
export type RicefishScoreFn = (
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  cache?: GoalCellsCache,
) => number;
```

The `GoalCellsCache` type is defined higher in the same file — it's already private (`type GoalCellsCache = Map<PlayerIndex, CubeCoord[]>;`). Export it:

Change the existing line:

```ts
type GoalCellsCache = Map<PlayerIndex, CubeCoord[]>;
```

to:

```ts
export type GoalCellsCache = Map<PlayerIndex, CubeCoord[]>;
```

- [ ] **Step 2: Thread `scoreFn` through `ABContext` and `MaxNContext` in `src/game/ai/ricefish/search.ts`**

Find the `ABContext` interface (currently at ~line 84) and add `scoreFn`:

```ts
interface ABContext {
  root: PlayerIndex;
  personality: AIPersonality;
  cache: ReturnType<typeof createGoalCentroidCache>;
  tt: TT;
  killers: Map<number, Move[]>;
  budget: TimeBudget;
  pvHint: Move | null;
  scoreFn: RicefishScoreFn;
}
```

Find the `MaxNContext` interface (at ~line 338) and add `scoreFn`:

```ts
interface MaxNContext {
  personality: AIPersonality;
  cache: ReturnType<typeof createGoalCentroidCache>;
  budget: TimeBudget;
  scoreFn: RicefishScoreFn;
}
```

Add `RicefishScoreFn` to the existing import from `./evaluate` at the top of the file:

```ts
import {
  ricefishScore,
  createGoalCentroidCache,
  MATE,
  type RicefishScoreFn,
} from './evaluate';
```

- [ ] **Step 3: Replace the two direct `ricefishScore` calls with `ctx.scoreFn` calls**

In `quiesce()` (~line 174), change:

```ts
const raw = ricefishScore(state, ctx.root, ctx.personality, ctx.cache);
```

to:

```ts
const raw = ctx.scoreFn(state, ctx.root, ctx.personality, ctx.cache);
```

In `maxNLeaf()` (~line 344), change:

```ts
function maxNLeaf(state: GameState, ctx: MaxNContext): number[] {
  return state.activePlayers.map((p) =>
    ricefishScore(state, p, ctx.personality, ctx.cache)
  );
}
```

to:

```ts
function maxNLeaf(state: GameState, ctx: MaxNContext): number[] {
  return state.activePlayers.map((p) =>
    ctx.scoreFn(state, p, ctx.personality, ctx.cache)
  );
}
```

- [ ] **Step 4: Populate `scoreFn` when creating each context**

In `findBestMove2P()` (~line 284), add `scoreFn` to the `ABContext` initializer:

```ts
const ctx: ABContext = {
  root: state.currentPlayer,
  personality,
  cache: createGoalCentroidCache(),
  tt: new TT(),
  killers: new Map(),
  budget,
  pvHint: null,
  scoreFn,
};
```

In `findBestMoveMP()` (~line 389), add `scoreFn` to the `MaxNContext` initializer:

```ts
const ctx: MaxNContext = {
  personality,
  cache: createGoalCentroidCache(),
  budget,
  scoreFn,
};
```

Change `findBestMove2P` and `findBestMoveMP` signatures to accept `scoreFn`:

```ts
function findBestMove2P(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  scoreFn: RicefishScoreFn,
): Move | null {
  // ...
}

function findBestMoveMP(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  scoreFn: RicefishScoreFn,
): Move | null {
  // ...
}
```

- [ ] **Step 5: Add optional `scoreFn` parameter to `findRicefishMove` with default**

Change the exported `findRicefishMove` signature (currently at ~line 437):

```ts
export function findRicefishMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  scoreFn: RicefishScoreFn = ricefishScore,
): Move | null {
  if (state.finishedPlayers.some((fp) => fp.player === state.currentPlayer)) {
    return null;
  }
  if (hasPlayerWon(state, state.currentPlayer)) return null;

  if (state.activePlayers.length <= 2) {
    return findBestMove2P(state, difficulty, personality, scoreFn);
  }
  return findBestMoveMP(state, difficulty, personality, scoreFn);
}
```

- [ ] **Step 6: Re-export `RicefishScoreFn` from the Ricefish index**

In `src/game/ai/ricefish/index.ts`, add the type export:

```ts
export { findRicefishMove } from './search';
export { ricefishScore, playerDistance, MATE, type RicefishScoreFn, type GoalCellsCache, createGoalCentroidCache } from './evaluate';
export { orderMoves, ricefishOrderingScore } from './ordering';
```

Note `createGoalCentroidCache` was already exported from `./evaluate` but not from the index; add it now since Ricefish+ needs to construct caches too. (If it wasn't previously exported from `./evaluate`, verify by checking that file — `createGoalCentroidCache` is at ~line 176 with `export function`.)

- [ ] **Step 7: Run existing Ricefish tests to confirm the refactor is transparent**

Run: `npx vitest tests/game/ai/ricefish/ --run`
Expected: all tests pass. The default `scoreFn = ricefishScore` means Ricefish's behavior is byte-for-byte identical.

- [ ] **Step 8: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/game/ai/ricefish/evaluate.ts src/game/ai/ricefish/search.ts src/game/ai/ricefish/index.ts
git commit -m "refactor(ai/ricefish): inject score function into search shell

Enables reuse of the same alpha-beta / Max^n / TT / quiescence
machinery with different eval functions. Ricefish keeps its default
scoreFn = ricefishScore so existing behavior is unchanged."
```

---

## Task 2: Add Ricefish+ engine type and constants

**Files:**
- Modify: `src/types/ai.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `AIEngine` union extended: `'default' | 'ricefish' | 'ricefish-plus'`.
  - Constants `RICEFISH_PLUS_TIME_BUDGET_MS`, `RICEFISH_PLUS_DEPTH_2P`, `RICEFISH_PLUS_DEPTH_MP` — all aliased to the existing Ricefish constants (same values).

- [ ] **Step 1: Extend the `AIEngine` union**

In `src/types/ai.ts` at line 5, change:

```ts
export type AIEngine = 'default' | 'ricefish';
```

to:

```ts
export type AIEngine = 'default' | 'ricefish' | 'ricefish-plus';
```

- [ ] **Step 2: Add Ricefish+ constants after the existing Ricefish constants (~line 34)**

Insert after the `RICEFISH_DEPTH_MP` block:

```ts
/**
 * Ricefish+ (hybrid) reuses Ricefish's search shell, so it reuses the same
 * search-shape constants. Aliased here so the engine dispatcher can look
 * them up by name and any future divergence is a one-line change.
 */
export const RICEFISH_PLUS_TIME_BUDGET_MS = RICEFISH_TIME_BUDGET_MS;
export const RICEFISH_PLUS_DEPTH_2P = RICEFISH_DEPTH_2P;
export const RICEFISH_PLUS_DEPTH_MP = RICEFISH_DEPTH_MP;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/ai.ts
git commit -m "feat(ai): add 'ricefish-plus' to AIEngine union

New hybrid engine that will combine default AI's multi-term eval with
Ricefish's search shell. Depth / time-budget constants alias Ricefish's."
```

---

## Task 3: Implement hybrid evaluator

**Files:**
- Create: `src/game/ai/ricefish-plus/evaluate.ts`
- Create: `tests/game/ai/ricefish-plus/evaluate.test.ts`

**Interfaces:**
- Consumes:
  - `ricefishScore` and `GoalCellsCache` from `src/game/ai/ricefish/evaluate.ts`.
  - `evaluatePosition` from `src/game/ai/evaluate.ts` (signature: `(state, player, personality, difficulty?) => number`).
  - `countPiecesInGoal` and `getGoalPositionsForState` from `src/game/state.ts`.
  - `hasPlayerWon` from `src/game/state.ts`.
- Produces:
  - `export const DEFAULT_NORM = 100;`
  - `export const RICEFISH_NORM = 30;`
  - `export const ALPHA_ENDGAME_THRESHOLD = 0.7;` (fraction of goal filled at which `α` reaches 1).
  - `export function computePhaseAlpha(state: GameState): number` — returns `α ∈ [0, 1]`.
  - `export function createHybridScore(difficulty: AIDifficulty): RicefishScoreFn` — factory that returns a score function bound to a difficulty setting. The returned function computes the hybrid score.
  - `export const MATE = 1_000_000_000;` — re-exported from Ricefish for terminal handling in tests.

- [ ] **Step 1: Write failing tests for `computePhaseAlpha`**

Create `tests/game/ai/ricefish-plus/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { getGoalPositionsForState } from '@/game/state';
import type { GameState, PlayerIndex } from '@/types/game';
import {
  computePhaseAlpha,
  createHybridScore,
  DEFAULT_NORM,
  RICEFISH_NORM,
  ALPHA_ENDGAME_THRESHOLD,
} from '@/game/ai/ricefish-plus/evaluate';
import { ricefishScore, MATE } from '@/game/ai/ricefish/evaluate';
import { evaluatePosition } from '@/game/ai/evaluate';

function freshGame(activePlayers: PlayerIndex[] = [0, 2]): GameState {
  return createGame(2, activePlayers);
}

/** Fill exactly `count` of `player`'s goal cells with `player`'s pieces,
 *  clearing whatever else was there. Leaves the rest of the board untouched.
 *  Returns a new state. */
function withGoalFill(state: GameState, player: PlayerIndex, count: number): GameState {
  const board = new Map(state.board);
  const goals = getGoalPositionsForState(state, player);
  // Clear all pieces of this player anywhere on the board first.
  for (const [k, v] of board) {
    if (v.type === 'piece' && v.player === player) board.set(k, { type: 'empty' });
  }
  for (let i = 0; i < count && i < goals.length; i++) {
    const g = goals[i];
    board.set(`${g.q},${g.r}`, { type: 'piece', player });
  }
  return { ...state, board };
}

describe('computePhaseAlpha', () => {
  it('is 0 at the starting position (nobody home)', () => {
    const state = freshGame();
    expect(computePhaseAlpha(state)).toBe(0);
  });

  it('reaches 1 when the leading player has filled the threshold fraction of goals', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 0, needed);
    expect(computePhaseAlpha(filled)).toBe(1);
  });

  it('is between 0 and 1 in the midgame', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const half = Math.floor(goalCount / 2);
    const filled = withGoalFill(state, 0, half);
    const alpha = computePhaseAlpha(filled);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it('takes the max across active players', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    // Fill player 2's goals to threshold; player 0 has zero. Alpha should
    // still be 1 because we take max across players.
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 2, needed);
    expect(computePhaseAlpha(filled)).toBe(1);
  });
});

describe('createHybridScore', () => {
  it('returns +MATE when the player has won', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const won = withGoalFill(state, 0, goalCount);
    const score = createHybridScore('hard');
    expect(score(won, 0, 'generalist')).toBe(MATE);
  });

  it('equals normalized default-AI eval when alpha = 0', () => {
    const state = freshGame();
    // Starting position: alpha = 0. Hybrid should equal defaultTerm.
    const score = createHybridScore('hard');
    const expected = evaluatePosition(state, 0, 'generalist', 'hard') / DEFAULT_NORM;
    expect(score(state, 0, 'generalist')).toBeCloseTo(expected, 6);
  });

  it('equals normalized Ricefish eval when alpha = 1', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 0, needed);
    // alpha = 1 → hybrid should equal ricefishTerm alone. But player 0 has
    // won some pieces in that setup — need to pick a player who hasn't won.
    // Player 2 hasn't advanced, so evaluate from player 2's POV.
    const score = createHybridScore('hard');
    const expected = ricefishScore(filled, 2, 'generalist') / RICEFISH_NORM;
    expect(score(filled, 2, 'generalist')).toBeCloseTo(expected, 6);
  });

  it('is a valid number (not NaN) at every phase for both players', () => {
    const state = freshGame();
    const score = createHybridScore('hard');
    for (let fill = 0; fill <= 6; fill++) {
      const s = withGoalFill(state, 0, fill);
      const v0 = score(s, 0, 'generalist');
      const v2 = score(s, 2, 'generalist');
      expect(Number.isFinite(v0)).toBe(true);
      expect(Number.isFinite(v2)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (module doesn't exist)**

Run: `npx vitest tests/game/ai/ricefish-plus/evaluate.test.ts --run`
Expected: FAIL with "Cannot find module '@/game/ai/ricefish-plus/evaluate'" or similar.

- [ ] **Step 3: Create `src/game/ai/ricefish-plus/evaluate.ts`**

Create the file with this content:

```ts
import type { GameState, PlayerIndex } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { countPiecesInGoal, getGoalPositionsForState, hasPlayerWon } from '@/game/state';
import {
  ricefishScore,
  MATE,
  type GoalCellsCache,
  type RicefishScoreFn,
} from '@/game/ai/ricefish/evaluate';
import { evaluatePosition } from '@/game/ai/evaluate';

export { MATE };

/**
 * Normalization divisors chosen so that a typical mid-game position gives
 * both terms roughly ±1-magnitude. Empirically tuned starting values; adjust
 * after playing a few games and dumping representative eval scores.
 *
 * Default AI eval ranges in the hundreds/low-thousands (weighted personality
 * terms summed). Ricefish eval ranges in the tens (hex distances).
 */
export const DEFAULT_NORM = 100;
export const RICEFISH_NORM = 30;

/**
 * Fraction of any player's goal that, when filled, drives the phase blend
 * factor α to 1 (pure Ricefish eval). Below this, α ramps linearly from 0.
 */
export const ALPHA_ENDGAME_THRESHOLD = 0.7;

/**
 * Phase blend factor α ∈ [0, 1]:
 *   α = clamp(maxFill / ALPHA_ENDGAME_THRESHOLD, 0, 1)
 * where maxFill = max over active players of (pieces_in_goal / goal_size).
 *
 * Using the max across all players (not just the current player) means both
 * sides use the same eval regime when the position is tactically endgame-
 * shaped for anyone — avoids one side seeing endgame patterns while the
 * other sees midgame.
 */
export function computePhaseAlpha(state: GameState): number {
  let maxFill = 0;
  for (const player of state.activePlayers) {
    const goals = getGoalPositionsForState(state, player);
    if (goals.length === 0) continue;
    const fill = countPiecesInGoal(state, player) / goals.length;
    if (fill > maxFill) maxFill = fill;
  }
  const ratio = maxFill / ALPHA_ENDGAME_THRESHOLD;
  if (ratio >= 1) return 1;
  if (ratio <= 0) return 0;
  return ratio;
}

/**
 * Factory: given a difficulty setting, returns a `RicefishScoreFn` that
 * computes the hybrid score. The difficulty is captured in a closure so
 * `evaluatePosition` can receive it while keeping the returned function's
 * signature compatible with the score function type Ricefish's search
 * shell expects.
 */
export function createHybridScore(difficulty: AIDifficulty): RicefishScoreFn {
  return (
    state: GameState,
    player: PlayerIndex,
    personality: AIPersonality,
    cache?: GoalCellsCache,
  ): number => {
    if (hasPlayerWon(state, player)) return MATE;

    const alpha = computePhaseAlpha(state);
    const defaultTerm = evaluatePosition(state, player, personality, difficulty) / DEFAULT_NORM;
    const ricefishTerm = ricefishScore(state, player, personality, cache) / RICEFISH_NORM;
    return (1 - alpha) * defaultTerm + alpha * ricefishTerm;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest tests/game/ai/ricefish-plus/evaluate.test.ts --run`
Expected: all pass.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/ricefish-plus/evaluate.ts tests/game/ai/ricefish-plus/evaluate.test.ts
git commit -m "feat(ai/ricefish-plus): hybrid evaluator with phase blend

Blends normalized default-AI eval with normalized Ricefish eval via
a phase factor derived from the leading player's goal-fill fraction.
Alpha ramps from 0 (opening) to 1 (endgame) at 70% goal fill."
```

---

## Task 4: Implement Ricefish+ search entry point

**Files:**
- Create: `src/game/ai/ricefish-plus/search.ts`
- Create: `src/game/ai/ricefish-plus/index.ts`
- Create: `tests/game/ai/ricefish-plus/search.test.ts`

**Interfaces:**
- Consumes:
  - `findRicefishMove` from `src/game/ai/ricefish/search.ts` (via `src/game/ai/ricefish/index.ts`).
  - `createHybridScore` from `src/game/ai/ricefish-plus/evaluate.ts`.
- Produces:
  - `export function findRicefishPlusMove(state: GameState, difficulty: AIDifficulty, personality: AIPersonality): Move | null;`

- [ ] **Step 1: Write failing test for `findRicefishPlusMove`**

Create `tests/game/ai/ricefish-plus/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { findRicefishPlusMove } from '@/game/ai/ricefish-plus/search';
import { getAllValidMoves } from '@/game/moves';
import type { PlayerIndex } from '@/types/game';

describe('findRicefishPlusMove', () => {
  it('returns a legal move for the starting position (2-player)', () => {
    const state = createGame(2, [0, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    const legal = getAllValidMoves(state, state.currentPlayer);
    expect(legal.some((m) =>
      m.from.q === move!.from.q && m.from.r === move!.from.r &&
      m.to.q === move!.to.q && m.to.r === move!.to.r
    )).toBe(true);
  });

  it('returns a legal move for a 3-player game (Max^n path)', () => {
    const state = createGame(3, [0, 1, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    const legal = getAllValidMoves(state, state.currentPlayer);
    expect(legal.some((m) =>
      m.from.q === move!.from.q && m.from.r === move!.from.r &&
      m.to.q === move!.to.q && m.to.r === move!.to.r
    )).toBe(true);
  });

  it('returns a forward-progressing move at easy depth from opening', () => {
    const state = createGame(2, [0, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'aggressive');
    expect(move).not.toBeNull();
    // Player 0's back is at negative r; forward is r increasing toward 0.
    // Any sensible move from opening should not reduce r (i.e., go further
    // from goal). This is a weak sanity check that eval is doing SOMETHING.
    expect(move!.to.r).toBeGreaterThanOrEqual(move!.from.r);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest tests/game/ai/ricefish-plus/search.test.ts --run`
Expected: FAIL with "Cannot find module '@/game/ai/ricefish-plus/search'".

- [ ] **Step 3: Create `src/game/ai/ricefish-plus/search.ts`**

Create the file:

```ts
import type { GameState, Move } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { findRicefishMove } from '@/game/ai/ricefish/search';
import { createHybridScore } from './evaluate';

/**
 * Pick a move using the Ricefish+ hybrid engine.
 *
 * Reuses Ricefish's alpha-beta / Max^n / TT / quiescence machinery but
 * substitutes the hybrid score function, which blends default-AI eval
 * with Ricefish eval based on how deep into the endgame the position is.
 */
export function findRicefishPlusMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
): Move | null {
  const scoreFn = createHybridScore(difficulty);
  return findRicefishMove(state, difficulty, personality, scoreFn);
}
```

- [ ] **Step 4: Create `src/game/ai/ricefish-plus/index.ts`**

Create the file:

```ts
export { findRicefishPlusMove } from './search';
export {
  createHybridScore,
  computePhaseAlpha,
  DEFAULT_NORM,
  RICEFISH_NORM,
  ALPHA_ENDGAME_THRESHOLD,
  MATE,
} from './evaluate';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest tests/game/ai/ricefish-plus/search.test.ts --run`
Expected: all pass.

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/ai/ricefish-plus/search.ts src/game/ai/ricefish-plus/index.ts tests/game/ai/ricefish-plus/search.test.ts
git commit -m "feat(ai/ricefish-plus): search entry point

Thin wrapper over findRicefishMove that binds the hybrid score
function to the requested difficulty and delegates to Ricefish's
search shell."
```

---

## Task 5: Wire Ricefish+ into worker dispatch and Engine dropdown

**Files:**
- Modify: `src/game/ai/worker.ts`
- Modify: `src/app/play/page.tsx`

**Interfaces:**
- Consumes:
  - `findRicefishPlusMove` from `src/game/ai/ricefish-plus/search.ts`.
  - `AIEngine` (already extended in Task 2).
- Produces:
  - Worker dispatches on `engine === 'ricefish-plus'`.
  - Engine dropdown UI has a "Ricefish+" option that sets `engine: 'ricefish-plus'`, `difficulty: 'hard'` (mirroring how Ricefish is wired).

- [ ] **Step 1: Update worker dispatch**

In `src/game/ai/worker.ts`, add the import and extend the dispatch:

```ts
import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves } = e.data;
  const state = deserializeGameState(serialized);
  const move =
    engine === 'ricefish-plus' ? findRicefishPlusMove(state, difficulty, personality) :
    engine === 'ricefish'      ? findRicefishMove(state, difficulty, personality) :
                                 findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
```

- [ ] **Step 2: Update the Engine dropdown in `src/app/play/page.tsx`**

The current dropdown (around line 343–360) uses a single `value` that overloads engine and difficulty. Extend it to handle a third `'ricefish-plus'` value.

Find:

```tsx
<select
  value={aiConfig[playerIndex]!.engine === 'ricefish' ? 'ricefish' : aiConfig[playerIndex]!.difficulty}
  onChange={(e) => {
    const v = e.target.value;
    setAiConfig(prev => ({
      ...prev,
      [playerIndex]: v === 'ricefish'
        ? { ...prev[playerIndex]!, engine: 'ricefish', difficulty: 'hard' }
        : { ...prev[playerIndex]!, engine: 'default', difficulty: v as AIDifficulty },
    }));
  }}
  className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
>
  <option value="easy">Easy</option>
  <option value="medium">Medium</option>
  <option value="hard">Hard</option>
  <option value="ricefish">Ricefish</option>
</select>
```

Replace with:

```tsx
<select
  value={
    aiConfig[playerIndex]!.engine === 'ricefish-plus' ? 'ricefish-plus' :
    aiConfig[playerIndex]!.engine === 'ricefish'      ? 'ricefish' :
    aiConfig[playerIndex]!.difficulty
  }
  onChange={(e) => {
    const v = e.target.value;
    setAiConfig(prev => ({
      ...prev,
      [playerIndex]:
        v === 'ricefish-plus' ? { ...prev[playerIndex]!, engine: 'ricefish-plus', difficulty: 'hard' } :
        v === 'ricefish'      ? { ...prev[playerIndex]!, engine: 'ricefish',      difficulty: 'hard' } :
                                 { ...prev[playerIndex]!, engine: 'default',      difficulty: v as AIDifficulty },
    }));
  }}
  className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
>
  <option value="easy">Easy</option>
  <option value="medium">Medium</option>
  <option value="hard">Hard</option>
  <option value="ricefish">Ricefish</option>
  <option value="ricefish-plus">Ricefish+</option>
</select>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, including previously-existing Ricefish tests.

- [ ] **Step 4: Run type check + lint**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

- Open `http://localhost:3000/play`.
- Add an AI player.
- Open its Engine dropdown; verify "Ricefish+" appears as the last option.
- Select "Ricefish+" for one player and "Ricefish" for another.
- Start the game; both AIs should move within their normal time budgets.
- Play through at least 20 turns; watch the browser console for errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/worker.ts src/app/play/page.tsx
git commit -m "feat(ai/ricefish-plus): wire Ricefish+ into worker + UI

New 'Ricefish+' option in the Engine dropdown routes to the hybrid
engine via the AI worker."
```

---

## Self-Review Checklist (for the implementer)

After all tasks complete:

1. All existing tests still pass: `npm run test` — Ricefish and default AI behavior unchanged.
2. `evaluatePosition` is only called from `hybridScore`, never inside a hot loop that duplicates default-AI machinery. Per-node cost inspection: hybrid should be roughly (Ricefish per-node + evaluatePosition per-node) — no pathfinding, no opening book, no threat eval on the hot path.
3. Ricefish+ personality dropdown works — try each of generalist/defensive/aggressive and confirm the AI moves differently.
4. In midgame (say 3–4 pieces in each goal), Ricefish+ play should visually resemble default AI (corridor/chain-reach discipline). In late endgame (7+ pieces in leader's goal), play should resemble Ricefish (matching-driven, resolves stragglers/blockers).
