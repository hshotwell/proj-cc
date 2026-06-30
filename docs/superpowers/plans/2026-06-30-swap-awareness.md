# Swap-Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bias both the Ricefish and default AI engines toward swap-eviction moves *only* when an opponent blocker actually obstructs a goal cell that the player's greedy matching wants to claim.

**Architecture:** Surgical penalty applied at evaluation time. For Ricefish, modify `greedyAssignmentCost` to return both the match cost and an "obstructed pair count," then surcharge `playerDistance` by `OBSTRUCTION_PENALTY * obstructed`. For the default AI, extend the existing `lateEndgame` block in `evaluatePosition` to count obstructed cells in its already-computed `emptyGoals` set and feed a negative term into the weighted score sum.

**Tech Stack:** TypeScript, Vitest. Existing source layout — no new files outside tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-swap-awareness-design.md`.
- Ricefish penalty constant: `OBSTRUCTION_PENALTY = 1.5`.
- Default AI penalty constant: `2.0` progress points per obstructed cell.
- No ordering-bonus changes. No depth-extension changes. No anti-repetition. Move generation untouched.
- TDD: every code change is preceded by a failing test.

---

### Task 1: Ricefish — obstruction-aware playerDistance

**Files:**
- Modify: `src/game/ai/ricefish/evaluate.ts`
- Test: `tests/game/ai/ricefish/evaluate.test.ts`, `tests/game/ai/ricefish/search.test.ts`

**Interfaces:**
- Consumes: existing `GameState`, `PlayerIndex`, `CubeCoord` types from `@/types/game`; `coordKey`, `cubeDistance` helpers; `getGoalPositionsForState`, `hasPlayerWon`; `getPlayerPieces`.
- Produces: exported `OBSTRUCTION_PENALTY` constant. Internal `greedyAssignmentCost` returns `{ cost: number; obstructed: number }`. `playerDistance` continues to return `number` with semantics: `matchCost + OBSTRUCTION_PENALTY * obstructed`.

- [ ] **Step 1: Add eval test — obstruction adds penalty**

Append to `tests/game/ai/ricefish/evaluate.test.ts` (inside a new `describe`):

```ts
import { playerDistance, OBSTRUCTION_PENALTY } from '@/game/ai/ricefish/evaluate';

describe('playerDistance obstruction penalty', () => {
  it('adds OBSTRUCTION_PENALTY when a matched goal cell holds an opponent', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    // Clear all P2 pieces, then place 9 in goal cells and 1 outside adjacent
    // to (4,-5) so the matching has exactly one outside→goal pair to make.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    const goalKeys: Array<[number, number]> = [
      [2, -5], [3, -5], [4, -6], [2, -6], [3, -6],
      [3, -7], [4, -7], [4, -8], [3, -8],
    ]; // 9 P2 pieces in goal cells
    for (const [q, r] of goalKeys) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    // Single outside P2 piece at (4,-4); the lone unfilled goal is (4,-5).
    board.set('4,-4', { type: 'piece', player: 2 });
    const empty: GameState = { ...base, board: new Map(board) };
    const distEmpty = playerDistance(empty, 2);

    // Now place a P0 piece on the unfilled goal cell (4,-5).
    const boardObs = new Map(board);
    boardObs.set('4,-5', { type: 'piece', player: 0 });
    const obstructed: GameState = { ...base, board: boardObs };
    const distObstructed = playerDistance(obstructed, 2);

    expect(distObstructed).toBeCloseTo(distEmpty + OBSTRUCTION_PENALTY, 5);
  });

  it('does NOT penalize an opponent piece outside the matching', () => {
    // 1 outside P2 piece, 2 unfilled goals (close + far). Cardinality limit
    // min(1, 2) = 1, so greedy picks ONLY the closer pair. A blocker on the
    // far cell is not in the matching and must NOT be counted.
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    // 8 P2 in goal — leaves 2 unfilled goal cells: (4,-5) close, (4,-8) far.
    const goal8: Array<[number, number]> = [
      [2, -5], [3, -5], [4, -6], [2, -6], [3, -6],
      [3, -7], [4, -7], [3, -8],
    ];
    for (const [q, r] of goal8) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    // 1 outside P2 piece, adjacent to (4,-5).
    board.set('4,-4', { type: 'piece', player: 2 });
    // P0 blocker on the FAR unfilled goal (4,-8); (4,-5) stays empty.
    board.set('4,-8', { type: 'piece', player: 0 });
    const withFarBlocker: GameState = { ...base, board: new Map(board) };

    // Same fixture, blocker removed (cell empty).
    const noBlockerBoard = new Map(board);
    noBlockerBoard.set('4,-8', { type: 'empty' });
    const noBlocker: GameState = { ...base, board: noBlockerBoard };

    expect(playerDistance(withFarBlocker, 2)).toBeCloseTo(
      playerDistance(noBlocker, 2), 5,
    );
  });

  it('stacks penalty for multiple obstructed pairs', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    // 8 P2 in goal — 2 unfilled.
    const goal8: Array<[number, number]> = [
      [2, -5], [3, -5], [4, -6], [2, -6], [3, -6],
      [3, -7], [4, -7], [3, -8],
    ];
    for (const [q, r] of goal8) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    // 2 outside P2 pieces.
    board.set('4,-4', { type: 'piece', player: 2 });
    board.set('5,-4', { type: 'piece', player: 2 });
    const noBlockers: GameState = { ...base, board: new Map(board) };

    // Both unfilled goals (4,-5) and (4,-8) get P0 blockers.
    board.set('4,-5', { type: 'piece', player: 0 });
    board.set('4,-8', { type: 'piece', player: 0 });
    const twoBlockers: GameState = { ...base, board };

    const dEmpty = playerDistance(noBlockers, 2);
    const dObs = playerDistance(twoBlockers, 2);
    expect(dObs).toBeCloseTo(dEmpty + 2 * OBSTRUCTION_PENALTY, 5);
  });
});
```

- [ ] **Step 2: Run the new tests — confirm they fail**

Run: `npx vitest tests/game/ai/ricefish/evaluate.test.ts -t "obstruction" --run`
Expected: FAIL — `OBSTRUCTION_PENALTY` is not exported; or `playerDistance` returns the un-surcharged distance so the equality fails.

- [ ] **Step 3: Implement the eval change**

Edit `src/game/ai/ricefish/evaluate.ts`. Replace the existing `playerDistance` and `greedyAssignmentCost` with the version below. Add `OBSTRUCTION_PENALTY` as an exported constant.

```ts
export const OBSTRUCTION_PENALTY = 1.5;

export function playerDistance(
  state: GameState,
  player: PlayerIndex,
  cache?: GoalCellsCache,
): number {
  const goals = getOrComputeGoals(state, player, cache);
  const pieces = getPlayerPieces(state, player);
  if (pieces.length === 0 || goals.length === 0) return 0;

  const goalKeys = new Set(goals.map(coordKey));
  const piecesOutside: CubeCoord[] = [];
  for (const piece of pieces) {
    if (!goalKeys.has(coordKey(piece))) piecesOutside.push(piece);
  }
  if (piecesOutside.length === 0) return 0;

  const pieceKeys = new Set(pieces.map(coordKey));
  const unfilled = goals.filter((g) => !pieceKeys.has(coordKey(g)));
  if (unfilled.length === 0) return 0;

  const { cost, obstructed } = greedyAssignmentCost(state, player, piecesOutside, unfilled);
  return cost + OBSTRUCTION_PENALTY * obstructed;
}

function greedyAssignmentCost(
  state: GameState,
  player: PlayerIndex,
  pieces: CubeCoord[],
  goals: CubeCoord[],
): { cost: number; obstructed: number } {
  const pairs: Array<{ pi: number; gj: number; d: number }> = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < goals.length; j++) {
      pairs.push({ pi: i, gj: j, d: cubeDistance(pieces[i], goals[j]) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const usedP = new Set<number>();
  const usedG = new Set<number>();
  const limit = Math.min(pieces.length, goals.length);
  let total = 0;
  let obstructed = 0;
  for (const { pi, gj, d } of pairs) {
    if (usedP.size >= limit) break;
    if (usedP.has(pi) || usedG.has(gj)) continue;
    total += d;
    const cell = state.board.get(coordKey(goals[gj]));
    if (cell?.type === 'piece' && cell.player !== player) obstructed++;
    usedP.add(pi);
    usedG.add(gj);
  }
  return { cost: total, obstructed };
}
```

- [ ] **Step 4: Run the eval tests — confirm they pass**

Run: `npx vitest tests/game/ai/ricefish/evaluate.test.ts --run`
Expected: All tests pass, including the existing endgame regression and the new obstruction tests.

- [ ] **Step 5: Add search regression test for endgame swap**

Append to `tests/game/ai/ricefish/search.test.ts`:

```ts
describe('findRicefishMove endgame swap-awareness', () => {
  it('picks a swap when the only unfilled goal cell is occupied by an opponent', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    // Clear P2 pieces.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    // 9 P2 in goal, 1 outside adjacent to the lone empty goal cell (4,-5).
    const goalCells: Array<[number, number]> = [
      [2, -5], [3, -5], [4, -6], [2, -6], [3, -6],
      [3, -7], [4, -7], [4, -8], [3, -8],
    ];
    for (const [q, r] of goalCells) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    board.set('4,-4', { type: 'piece', player: 2 }); // 1 outside, adjacent to (4,-5)
    // Place a P0 blocker on (4,-5).
    board.set('4,-5', { type: 'piece', player: 0 });
    // Clear P0 from (4,-4)'s position if it was there in default; (4,-4)
    // is not a P0 home cell so this is fine.
    const state: GameState = { ...base, board, currentPlayer: 2 };

    const move = findRicefishMove(state, 'medium', 'generalist');
    expect(move).not.toBeNull();
    expect(move!.isSwap).toBe(true);
    // The swap target must be the obstructed goal cell.
    expect(move!.to.q).toBe(4);
    expect(move!.to.r).toBe(-5);
  });
});
```

- [ ] **Step 6: Run the search test — confirm it passes**

Run: `npx vitest tests/game/ai/ricefish/search.test.ts -t "swap-awareness" --run`
Expected: PASS — the new eval penalty makes the swap strictly preferred over any sideways shuffle.

- [ ] **Step 7: Run full ricefish + AI tests for no regressions**

Run: `npx vitest tests/game/ai/ --run`
Expected: All tests pass (including the existing oscillation regression in `evaluate.test.ts` and `search.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add src/game/ai/ricefish/evaluate.ts \
        tests/game/ai/ricefish/evaluate.test.ts \
        tests/game/ai/ricefish/search.test.ts
git commit -m "$(cat <<'EOF'
fix(ai/ricefish): obstruction-aware playerDistance

Surcharge playerDistance by OBSTRUCTION_PENALTY (1.5) per matched
(outside-piece → goal-cell) pair where the goal cell holds an opponent.
This makes a swap-eviction a positive eval delta instead of the previous
net-zero (our piece -1 distance, displaced opponent -1 distance), which
was a horizon effect in endgame stalemates.

Surgical: penalty applies only when the blocker is actually in the
greedy matching's cardinality-limited set. Mid-game positions where the
matching prefers empty goal cells get zero penalty.

No move-ordering changes, no depth-weighted blocker term, no anti-
repetition — the reverted attempt did all of those and made Ricefish
weaker overall.

EOF
)"
```

---

### Task 2: Default AI — obstruction-aware late-endgame block

**Files:**
- Modify: `src/game/ai/evaluate.ts`
- Test: `tests/game/ai/evaluate.test.ts` (create)

**Interfaces:**
- Consumes: existing `evaluatePosition(state, player, personality, difficulty)` signature; `lateEndgame`, `emptyGoals`, `piecesOutside` from the existing block (lines 392–416); `coordKey` from `@/game/coordinates`.
- Produces: no new exports. `evaluatePosition` returns a strictly lower score when an opponent blocker sits on a cell that would be in the late-endgame matching, relative to the same state with that blocker removed.

- [ ] **Step 1: Create the test file with a failing test**

Create `tests/game/ai/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { evaluatePosition } from '@/game/ai/evaluate';
import type { GameState } from '@/types/game';

describe('evaluatePosition late-endgame obstruction', () => {
  it('penalizes an opponent piece sitting on an unfilled goal cell at inGoal=9', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    // Clear all P2 pieces.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    // 9 P2 pieces in goal cells.
    const goalCells: Array<[number, number]> = [
      [2, -5], [3, -5], [4, -6], [2, -6], [3, -6],
      [3, -7], [4, -7], [4, -8], [3, -8],
    ];
    for (const [q, r] of goalCells) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    // 1 outside P2 piece adjacent to the lone unfilled goal (4,-5).
    board.set('4,-4', { type: 'piece', player: 2 });
    const noBlocker: GameState = { ...base, board: new Map(board) };

    // Place a P0 blocker on the unfilled goal (4,-5).
    const obsBoard = new Map(board);
    obsBoard.set('4,-5', { type: 'piece', player: 0 });
    const withBlocker: GameState = { ...base, board: obsBoard };

    const scoreEmpty = evaluatePosition(noBlocker, 2, 'generalist', 'hard');
    const scoreObstructed = evaluatePosition(withBlocker, 2, 'generalist', 'hard');
    // Strictly lower when blocker is present.
    expect(scoreObstructed).toBeLessThan(scoreEmpty);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest tests/game/ai/evaluate.test.ts --run`
Expected: FAIL — the current eval treats the obstructed cell the same as an empty one inside `emptyGoals`, so the two scores are equal.

- [ ] **Step 3: Implement the obstruction penalty**

Edit `src/game/ai/evaluate.ts`. In `evaluatePosition`, find the existing `lateEndgame` block (currently lines 392–416). Replace it with the version below — same behavior, but additionally computes `obstructionPenaltyPoints` available for use in the score sum.

```ts
  // Late endgame targeting: when 9+ pieces in goal, focus on nearest empty goal
  const goalKeySet = new Set(goalPositions.map((g) => coordKey(g)));
  const lateEndgame = inGoal >= 9;
  let obstructionPenaltyPoints = 0;
  if (lateEndgame) {
    const emptyGoals = goalPositions.filter((g) => {
      const content = state.board.get(coordKey(g));
      return !content || content.type === 'empty' || (content.type === 'piece' && content.player !== player);
    });
    if (emptyGoals.length > 0) {
      const piecesOutside = pieces.filter((p) => !goalKeySet.has(coordKey(p)));
      if (piecesOutside.length > 0) {
        if (state.isCustomLayout) {
          const worstMoveCost = getWorstAssignmentCost(state, piecesOutside, emptyGoals, false);
          stragglerScore = -(worstMoveCost * worstMoveCost) / 3;
        } else {
          const worstDist = Math.max(
            ...piecesOutside.map((p) =>
              Math.min(...emptyGoals.map((g) => cubeDistance(p, g)))
            )
          );
          stragglerScore = -(worstDist * worstDist) / 3;
        }
        // Obstruction surcharge: cells in emptyGoals that actually hold an
        // opponent piece are blockers we'll need to swap through. Cap at the
        // matching cardinality so we never over-penalize when piecesOutside
        // is the smaller set.
        const obstructed = emptyGoals.filter((g) => {
          const c = state.board.get(coordKey(g));
          return c?.type === 'piece' && c.player !== player;
        }).length;
        const obstructedInMatching = Math.min(obstructed, piecesOutside.length);
        obstructionPenaltyPoints = obstructedInMatching * 2.0;
      }
    }
  }
```

Then update the score sum (currently around line 636–652) so the `wDistProgress` term subtracts the obstruction surcharge:

```ts
  let score =
    wProgress          * progressScore +
    wDistProgress      * (distanceProgressScore - obstructionPenaltyPoints) +
    wStraggler         * stragglerScore +
    extremeStragPenalty                        +
    wAlignment         * alignmentScore +
    wChainReach        * chainReachScore +
    wCohesion          * cohesionScore +
    wBlockade          * blockadeScore +
    wPowerup           * powerupBonus +
    wBackConvoy        * backConvoyScore +
    wEmptyGoalTarget   * emptyGoalTargetScore +
    1.5                * approachLaneScore +
    1.0                * convoyFormationScore +
    3.0                * goalDepthScore +
    3.0                * chainPotentialScore +
    1.0                * backPieceIsolationPenalty;
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest tests/game/ai/evaluate.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Run the full test suite for regressions**

Run: `npm run test`
Expected: All tests pass (excluding the pre-existing TS errors in `tests/game/pathfinding.test.ts` noted in project memory).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: Pass (or pre-existing errors only; no new ones introduced by these changes).

- [ ] **Step 7: Commit**

```bash
git add src/game/ai/evaluate.ts tests/game/ai/evaluate.test.ts
git commit -m "$(cat <<'EOF'
fix(ai): late-endgame obstruction penalty in default AI eval

Inside the existing inGoal>=9 block, count how many cells in
emptyGoals actually hold an opponent piece (clipped to the matching
cardinality) and subtract 2 progress points per obstructed cell from
the wDistProgress term. Same surgical principle as the matching
Ricefish change: penalty only applies when a blocker is in the set
of goal cells we're trying to fill.

EOF
)"
```

---

## Self-review

- **Spec coverage:** Ricefish change → Task 1 (eval + tests + search regression). Default AI change → Task 2 (eval + test). Calibration / validation step described in the spec is not in the plan because it's a manual bake-off, not code — leave that to the user to run after merge.
- **Placeholder scan:** No TBDs; every test and code block is fully written.
- **Type consistency:** `OBSTRUCTION_PENALTY` exported from `evaluate.ts` and imported in the test. `greedyAssignmentCost` returns `{ cost, obstructed }`; only `playerDistance` calls it, and it's updated to consume the new shape.
- **Default AI:** `obstructionPenaltyPoints` declared as `let` outside the `if (lateEndgame)` block so it defaults to `0` when the block is skipped — no path leaves it undefined.

---

## Out of scope (do not implement in this plan)

- Anti-repetition penalty.
- Depth extensions in endgame search.
- Move-ordering bonus for swaps.
- Changes to move generation in `src/game/moves.ts`.
