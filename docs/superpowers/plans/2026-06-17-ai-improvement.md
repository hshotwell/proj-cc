# AI Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 24 flagged AI gameplay failures — useless lateral moves, backsteps from the goal zone, poor endgame sequencing, and repetition loops — through per-piece phase detection, multi-hop chain analysis, and targeted heuristic tuning.

**Architecture:** Add `getPiecePhase` (per-piece endgame classification) and `canReachGoalViaChain` (BFS jump-reachability) to `endgame.ts`. Use these to evaluate lateral moves for their setup value, lower the endgame solver threshold from 7 to 6 pieces, and strengthen repetition penalties for endgame pieces. Layer in midgame priority bonus, opponent-gift detection, and consecutive-piece penalty as strategic score components.

**Tech Stack:** TypeScript, Vitest, cube coordinate hex grid (`{q, r, s}` with `q+r+s=0`). Run tests with `npx vitest tests/game/ai.test.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-17-ai-improvement-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/game/ai/endgame.ts` | Add `getPiecePhase`, `canReachGoalViaChain`, `evaluateEndgameLateral`; lower `isLateEndgame` threshold; upgrade `couldEnterGoalIfEmpty`; add swap bonus to `scoreEndgameMove` |
| `src/game/ai/strategy.ts` | Add `midgamePriorityBonus` + `computeOpponentGiftPenalty` to `computeStrategicScore` |
| `src/game/ai/search.ts` | Wire `evaluateEndgameLateral` in move scoring; add `computeConsecutivePiecePenalty`; enable strategic scoring for easy; escalate endgame repetition penalty |
| `src/game/ai/evaluate.ts` | Straggler divisor 5 → 3 |
| `tests/game/ai.test.ts` | Add `getPiecePhase` and `canReachGoalViaChain` test suites |

**Key constants for tests:**
- Player 0 starts at `(4,-8)…(4,-5)` area (upper-right), goal = player 2's home = `(-4,5)…(-4,8)` area (lower-left)
- Player 0's goal cells include: `(-4,5)`, `(-3,5)`, `(-2,5)`, `(-1,5)`, `(-2,6)`, `(-3,6)`, `(-4,6)`, `(-4,7)`, `(-3,7)`, `(-4,8)`
- `cubeDistance(a,b) = (|Δq|+|Δr|+|Δs|)/2`
- `getGoalPositionDepth(pos) = cubeDistance(pos, {q:0,r:0,s:0})` — higher = deeper = better

---

## Task 1: `getPiecePhase` — per-piece endgame classification

**Files:**
- Modify: `src/game/ai/endgame.ts` (add after `isLateEndgame`)
- Modify: `tests/game/ai.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing tests**

Add at the bottom of `tests/game/ai.test.ts`:

```typescript
import {
  computeRegressionPenalty,
  computeRepetitionPenalty,
  serializeGameState,
  deserializeGameState,
} from '@/game/ai';
import { getPiecePhase } from '@/game/ai/endgame';
```

Replace the existing import line with:

```typescript
import {
  computeRegressionPenalty,
  computeRepetitionPenalty,
  serializeGameState,
  deserializeGameState,
} from '@/game/ai';
import { getPiecePhase } from '@/game/ai/endgame';
```

Then add at the bottom of the file:

```typescript
describe('getPiecePhase', () => {
  // Player 0 goal cells (lower-left): (-4,5)…(-4,8)
  // A piece at (-2,4) is 1 cell from (-2,5) → within 3 → endgame territory
  // A piece at (1,1) is 4+ cells from nearest goal cell → midgame

  it('returns endgame for a piece inside the goal zone', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Place a player 0 piece at goal cell (-4,6)
    testState.board.set(coordKey(cubeCoord(-4, 6)), { type: 'piece', player: 0 });
    const phase = getPiecePhase(testState, cubeCoord(-4, 6), 0);
    expect(phase).toBe('endgame');
  });

  it('returns endgame for a piece within 3 cells of goal with no opponent nearby', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Clear player 2 pieces from the goal region so no opponents are near
    testState.board.set(coordKey(cubeCoord(-2, 5)), { type: 'empty' });
    testState.board.set(coordKey(cubeCoord(-3, 5)), { type: 'empty' });
    testState.board.set(coordKey(cubeCoord(-4, 5)), { type: 'empty' });
    // Place player 0 piece at (-2,4): 1 cell from (-2,5) goal cell
    testState.board.set(coordKey(cubeCoord(-2, 4)), { type: 'piece', player: 0 });
    const phase = getPiecePhase(testState, cubeCoord(-2, 4), 0);
    expect(phase).toBe('endgame');
  });

  it('returns endgame-contested when an opponent is between piece and goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Player 0 piece near goal at (-2,4)
    testState.board.set(coordKey(cubeCoord(-2, 4)), { type: 'piece', player: 0 });
    // Opponent at (-3,5) — closer to goal center than (-2,4)
    testState.board.set(coordKey(cubeCoord(-3, 5)), { type: 'piece', player: 2 });
    const phase = getPiecePhase(testState, cubeCoord(-2, 4), 0);
    expect(phase).toBe('endgame-contested');
  });

  it('returns midgame for a piece far from the goal', () => {
    const state = createGame(2);
    // Player 0 piece at (2,-3) — far from goal
    const phase = getPiecePhase(state, cubeCoord(2, -3), 0);
    expect(phase).toBe('midgame');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|getPiecePhase|Cannot find"
```

Expected: fails with `"Module '@/game/ai/endgame' has no export 'getPiecePhase'"` or similar.

- [ ] **Step 3: Implement `getPiecePhase` in `endgame.ts`**

Add this function after the `isLateEndgame` export in `src/game/ai/endgame.ts`:

```typescript
/**
 * Classify a single piece's phase for move evaluation.
 * endgame: piece is in/near goal (within 3 cells) with no opponents between it and the goal.
 * endgame-contested: same proximity but an opponent piece is closer to goal than this piece.
 * midgame: piece is not near the goal.
 */
export function getPiecePhase(
  state: GameState,
  piece: CubeCoord,
  player: PlayerIndex
): 'midgame' | 'endgame' | 'endgame-contested' {
  const goalPositions = getGoalPositionsForState(state, player);
  const nearGoal = goalPositions.some(g => cubeDistance(piece, g) <= 3);
  if (!nearGoal) return 'midgame';

  const goalCenter = centroid(goalPositions);
  const pieceToGoalDist = cubeDistance(piece, goalCenter);

  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player === player) continue;
    const [q, r] = key.split(',').map(Number);
    const opponentPos: CubeCoord = { q, r, s: -q - r };
    if (cubeDistance(opponentPos, goalCenter) < pieceToGoalDist) {
      return 'endgame-contested';
    }
  }

  return 'endgame';
}
```

The import of `centroid` and `cubeDistance` is already present in `endgame.ts`. Verify the imports at the top of the file include both — add if missing.

- [ ] **Step 4: Run tests**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|getPiecePhase"
```

Expected: all 4 `getPiecePhase` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/endgame.ts tests/game/ai.test.ts
git commit -m "feat(ai): add getPiecePhase for per-piece endgame classification"
```

---

## Task 2: `canReachGoalViaChain` — BFS jump-reachability

**Files:**
- Modify: `src/game/ai/endgame.ts`
- Modify: `tests/game/ai.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the import at top of `tests/game/ai.test.ts`:

```typescript
import { getPiecePhase, canReachGoalViaChain } from '@/game/ai/endgame';
```

Add at the bottom of the test file:

```typescript
describe('canReachGoalViaChain', () => {
  // Player 0 goal: (-4,5)…(-4,8). We'll test if a piece outside can
  // chain-jump through stepping stones into a goal cell.

  it('returns true when piece can reach target via a single jump', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Clear the goal area so we control it
    for (const cell of ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7','-4,8']) {
      const [q, r] = cell.split(',').map(Number);
      testState.board.set(`${q},${r}`, { type: 'empty' });
    }
    // Piece P at (-2,4), stepping stone at (-3,5) (player 0), target (-4,6) empty
    testState.board.set(coordKey(cubeCoord(-2, 4)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-3, 5)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-4, 6)), { type: 'empty' });
    // (-2,4) → over (-3,5) → land (-4,6)
    const result = canReachGoalViaChain(testState, cubeCoord(-2, 4), cubeCoord(-4, 6), 0);
    expect(result).toBe(true);
  });

  it('returns true when piece can reach target via a 2-hop chain', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Clear goal area
    for (const cell of ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7','-4,8']) {
      const [q, r] = cell.split(',').map(Number);
      testState.board.set(`${q},${r}`, { type: 'empty' });
    }
    // Chain: (0,2) → over (-1,3) → land (-2,4) → over (-3,5) → land (-4,6)
    testState.board.set(coordKey(cubeCoord(0, 2)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 }); // step over
    testState.board.set(coordKey(cubeCoord(-2, 4)), { type: 'empty' });            // intermediate landing
    testState.board.set(coordKey(cubeCoord(-3, 5)), { type: 'piece', player: 0 }); // step over
    testState.board.set(coordKey(cubeCoord(-4, 6)), { type: 'empty' });            // target goal cell
    const result = canReachGoalViaChain(testState, cubeCoord(0, 2), cubeCoord(-4, 6), 0);
    expect(result).toBe(true);
  });

  it('returns false when no jump path exists', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Clear goal area
    for (const cell of ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7','-4,8']) {
      const [q, r] = cell.split(',').map(Number);
      testState.board.set(`${q},${r}`, { type: 'empty' });
    }
    // Piece in isolation with no stepping stones
    testState.board.set(coordKey(cubeCoord(2, -1)), { type: 'piece', player: 0 });
    const result = canReachGoalViaChain(testState, cubeCoord(2, -1), cubeCoord(-4, 6), 0);
    expect(result).toBe(false);
  });

  it('respects maxHops — does not find path beyond limit', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    // Clear goal area
    for (const cell of ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7','-4,8']) {
      const [q, r] = cell.split(',').map(Number);
      testState.board.set(`${q},${r}`, { type: 'empty' });
    }
    // 2-hop chain as above
    testState.board.set(coordKey(cubeCoord(0, 2)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-2, 4)), { type: 'empty' });
    testState.board.set(coordKey(cubeCoord(-3, 5)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(-4, 6)), { type: 'empty' });
    // With maxHops=1, can only reach (-2,4), not (-4,6)
    const result = canReachGoalViaChain(testState, cubeCoord(0, 2), cubeCoord(-4, 6), 0, 1);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "canReachGoalViaChain|Cannot find"
```

Expected: fails with missing export.

- [ ] **Step 3: Implement `canReachGoalViaChain` in `endgame.ts`**

Add `canJumpOver` to the imports at the top of `endgame.ts` if not already present:
```typescript
import { getAllValidMoves, canJumpOver } from '../moves';
```

Add this function after `getPiecePhase` in `src/game/ai/endgame.ts`:

```typescript
/**
 * BFS over jump paths: can `piece` reach `targetGoalPos` via a chain of jumps?
 * Only counts jumps (not steps) — used to detect if a setup move unlocks a chain entry.
 * maxHops bounds the search to keep it fast (default 6).
 */
export function canReachGoalViaChain(
  state: GameState,
  piece: CubeCoord,
  targetGoalPos: CubeCoord,
  player: PlayerIndex,
  maxHops: number = 6
): boolean {
  const visited = new Set<string>();
  const queue: Array<{ pos: CubeCoord; hops: number }> = [{ pos: piece, hops: 0 }];
  visited.add(coordKey(piece));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (cubeEquals(current.pos, targetGoalPos)) return true;
    if (current.hops >= maxHops) continue;

    for (const dir of DIRECTIONS) {
      const over: CubeCoord = {
        q: current.pos.q + dir.q,
        r: current.pos.r + dir.r,
        s: current.pos.s + dir.s,
      };
      const land: CubeCoord = {
        q: current.pos.q + dir.q * 2,
        r: current.pos.r + dir.r * 2,
        s: current.pos.s + dir.s * 2,
      };

      if (!state.board.has(coordKey(land))) continue;
      if (state.board.get(coordKey(land))?.type !== 'empty') continue;
      if (!canJumpOver(state, over, player)) continue;

      const landKey = coordKey(land);
      if (!visited.has(landKey)) {
        visited.add(landKey);
        queue.push({ pos: land, hops: current.hops + 1 });
      }
    }
  }

  return false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|canReachGoalViaChain"
```

Expected: all 4 `canReachGoalViaChain` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/endgame.ts tests/game/ai.test.ts
git commit -m "feat(ai): add canReachGoalViaChain BFS for multi-hop chain detection"
```

---

## Task 3: Lower `isLateEndgame` threshold + upgrade `couldEnterGoalIfEmpty`

**Files:**
- Modify: `src/game/ai/endgame.ts`

- [ ] **Step 1: Lower `isLateEndgame` threshold from 7 to 6**

In `src/game/ai/endgame.ts`, find `isLateEndgame`:

```typescript
// BEFORE:
return inGoal >= 7;

// AFTER:
return inGoal >= 6;
```

- [ ] **Step 2: Upgrade `couldEnterGoalIfEmpty` to use `canReachGoalViaChain`**

Find `couldEnterGoalIfEmpty` in `endgame.ts`. It currently does a 1-hop check. Replace the entire function body:

```typescript
function couldEnterGoalIfEmpty(
  state: GameState,
  goalPos: CubeCoord,
  player: PlayerIndex,
  piecesOutside: CubeCoord[]
): CubeCoord | null {
  // Simulate the goal position being empty so chain detection is accurate
  const tempBoard = new Map(state.board);
  tempBoard.set(coordKey(goalPos), { type: 'empty' });
  const tempState: GameState = { ...state, board: tempBoard };

  for (const piece of piecesOutside) {
    if (canReachGoalViaChain(tempState, piece, goalPos, player)) {
      return piece;
    }
  }
  return null;
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all existing tests still pass (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/game/ai/endgame.ts
git commit -m "fix(ai): lower endgame solver threshold to 6 pieces, upgrade couldEnterGoalIfEmpty to BFS chain detection"
```

---

## Task 4: `evaluateEndgameLateral` — penalize purposeless laterals, reward setup moves

**Files:**
- Modify: `src/game/ai/endgame.ts` (add function)
- Modify: `src/game/ai/search.ts` (wire into move scoring)

- [ ] **Step 1: Add `evaluateEndgameLateral` to `endgame.ts`**

Add this export after `canReachGoalViaChain` in `src/game/ai/endgame.ts`. It requires `applyMove` — check it's imported at the top, add if missing:
```typescript
import { applyMove, getGoalPositionsForState, countPiecesInGoal } from '../state';
```

```typescript
/**
 * For endgame-phase pieces making a lateral or backward move:
 * check whether the move unlocks a new chain-jump path to a goal cell.
 * Returns a large positive score if it unlocks deeper goal access,
 * or a heavy penalty if it sets nothing up.
 * Returns 0 for midgame pieces or forward moves (handled elsewhere).
 */
export function evaluateEndgameLateral(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const phase = getPiecePhase(state, move.from, player);
  if (phase === 'midgame') return 0;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  if (distAfter < distBefore) return 0; // Forward move — not a lateral

  const nextState = applyMove(state, move);
  const emptyGoals = getEmptyGoalsByDepth(nextState, player);
  if (emptyGoals.length === 0) return -2000; // Goal is full

  const piecesOutsideBefore = getPiecesOutsideGoal(state, player);
  const piecesOutsideAfter = getPiecesOutsideGoal(nextState, player);

  let bestDepthUnlocked = 0;

  for (const emptyGoal of emptyGoals) {
    const depth = getGoalPositionDepth(emptyGoal);

    // Was this goal already reachable by any piece before the move?
    const wasReachable = piecesOutsideBefore.some(p =>
      canReachGoalViaChain(state, p, emptyGoal, player)
    );
    if (wasReachable) continue; // No new value — skip

    // Is it reachable after the move?
    const isReachableNow = piecesOutsideAfter.some(p =>
      canReachGoalViaChain(nextState, p, emptyGoal, player)
    );
    if (isReachableNow) {
      bestDepthUnlocked = Math.max(bestDepthUnlocked, depth);
    }
  }

  if (bestDepthUnlocked > 0) {
    return bestDepthUnlocked * 500; // Bonus: unlocks deeper goal access
  }

  return -2000; // No setup value detected: heavy endgame lateral penalty
}
```

- [ ] **Step 2: Wire `evaluateEndgameLateral` into move scoring in `search.ts`**

In `src/game/ai/search.ts`, add the import:
```typescript
import { findEndgameMove, isLateEndgame, scoreEndgameMove, evaluateEndgameLateral } from './endgame';
```

Find the scoring block inside `getTopMoves` (the `scored = moves.map(...)` section). After the existing `score += strategic.total * strategicWeight;` line, add:

```typescript
// Endgame lateral evaluation: penalise purposeless sidesteps,
// reward laterals that unlock a new chain entry into goal
const lateralBonus = evaluateEndgameLateral(state, move, player);
score += lateralBonus;
```

Apply the same addition to the identical scoring block inside `getTopMovesFromList`.

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/ai/endgame.ts src/game/ai/search.ts
git commit -m "feat(ai): evaluateEndgameLateral — penalise purposeless laterals, reward chain-setup moves"
```

---

## Task 5: Midgame priority bonus in `computeStrategicScore`

**Files:**
- Modify: `src/game/ai/strategy.ts`

- [ ] **Step 1: Add `midgamePriorityBonus` to `StrategicScore` interface**

Find the `StrategicScore` interface in `strategy.ts` and add the new field:

```typescript
export interface StrategicScore {
  steppingStoneValue: number;
  unblockingValue: number;
  backwardnessBonus: number;
  opponentPieceBonus: number;
  blockingOpponentValue: number;
  pastOpponentsPenalty: number;
  stragglerBonus: number;
  midgamePriorityBonus: number; // NEW
  total: number;
}
```

- [ ] **Step 2: Compute and apply `midgamePriorityBonus` in `computeStrategicScore`**

Add the import for `getPiecePhase` at the top of `strategy.ts`:

```typescript
import { getPiecePhase } from './endgame';
```

In `computeStrategicScore`, add after the `stragglerBonus` calculation:

```typescript
// Midgame priority: prefer moving pieces still crossing the board over
// pieces already near the goal. Endgame pieces should be handled by
// the dedicated endgame solver or exceptional opportunities.
const movingPiecePhase = getPiecePhase(state, move.from, player);
const midgamePriorityBonus = movingPiecePhase === 'midgame' ? 12 : 0;
```

Update the `total` calculation to include it:

```typescript
const total =
  weights.steppingStone * steppingStoneValue +
  weights.unblocking * unblockingValue +
  weights.backwardness * backwardnessBonus +
  weights.opponentPiece * opponentPieceBonus +
  weights.blockingOpponent * blockingOpponentValue +
  weights.straggler * stragglerBonus +
  midgamePriorityBonus -                          // NEW (no personality weight — applies to all)
  weights.pastOpponents * pastOpponentsPenalty;
```

Update the return statement to include the new field:

```typescript
return {
  steppingStoneValue,
  unblockingValue,
  backwardnessBonus,
  opponentPieceBonus,
  blockingOpponentValue,
  pastOpponentsPenalty,
  stragglerBonus,
  midgamePriorityBonus, // NEW
  total,
};
```

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/ai/strategy.ts
git commit -m "feat(ai): add midgame priority bonus to computeStrategicScore"
```

---

## Task 6: Swap move bonus in `scoreEndgameMove`

**Files:**
- Modify: `src/game/ai/endgame.ts`
- Modify: `src/game/ai/search.ts` (update call sites to pass personality)

- [ ] **Step 1: Add optional `personality` parameter to `scoreEndgameMove`**

Find `scoreEndgameMove` in `endgame.ts`. Update its signature:

```typescript
export function scoreEndgameMove(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality?: AIPersonality
): number {
```

Add the import at the top of `endgame.ts`:
```typescript
import type { AIPersonality } from '@/types/ai';
```

- [ ] **Step 2: Add swap bonus inside `scoreEndgameMove`**

After the opening comment and before the existing score logic, add:

```typescript
// Swap move: displaces an opponent from our goal cell — highly valuable.
// Personality-weighted: defensive prizes this, aggressive less so.
if (move.isSwap) {
  const swapDepth = getGoalPositionDepth(move.to);
  const baseSwapBonus = 30000 + swapDepth * 800;
  const personalityMultiplier =
    personality === 'defensive' ? 1.5 :
    personality === 'aggressive' ? 0.6 : 1.0;
  score += baseSwapBonus * personalityMultiplier;
}
```

- [ ] **Step 3: Update call sites in `search.ts` to pass personality**

In `search.ts`, find both calls to `scoreEndgameMove` (in `getTopMoves` and `getTopMovesFromList`) and add the personality argument:

```typescript
// BEFORE (in getTopMoves):
const endgameScore = scoreEndgameMove(state, move, player);

// AFTER:
const endgameScore = scoreEndgameMove(state, move, player, personality);
```

Apply the same change to the identical line in `getTopMovesFromList`.

- [ ] **Step 4: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/endgame.ts src/game/ai/search.ts
git commit -m "feat(ai): add personality-weighted swap move bonus in scoreEndgameMove"
```

---

## Task 7: Opponent-gift detection in `computeStrategicScore`

**Files:**
- Modify: `src/game/ai/strategy.ts`

- [ ] **Step 1: Add `computeOpponentGiftPenalty` helper**

Add this function before `computeStrategicScore` in `strategy.ts`:

```typescript
/**
 * Penalise moves that hand an opponent a large forward jump.
 * Simulates the result of our move and checks opponent jump gains.
 * Only checks the top 5 opponent moves (bounded for performance).
 */
function computeOpponentGiftPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  // Simulate our move
  const nextBoard = new Map(state.board);
  const fromContent = nextBoard.get(coordKey(move.from));
  nextBoard.set(coordKey(move.from), { type: 'empty' });
  nextBoard.set(coordKey(move.to), fromContent!);
  const nextState: GameState = { ...state, board: nextBoard };

  let maxGift = 0;

  for (const opponent of state.activePlayers) {
    if (opponent === player) continue;
    const oppGoalPositions = getGoalPositionsForState(state, opponent);
    const oppGoalCenter = centroid(oppGoalPositions);

    // Get opponent moves on the new state, check up to 5
    let checked = 0;
    for (const [key, content] of nextState.board) {
      if (content.type !== 'piece' || content.player !== opponent) continue;
      const [q, r] = key.split(',').map(Number);
      const from: CubeCoord = { q, r, s: -q - r };

      for (const dir of DIRECTIONS) {
        const over: CubeCoord = { q: from.q + dir.q, r: from.r + dir.r, s: from.s + dir.s };
        const land: CubeCoord = { q: from.q + dir.q * 2, r: from.r + dir.r * 2, s: from.s + dir.s * 2 };
        if (!nextState.board.has(coordKey(land))) continue;
        if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
        if (!canJumpOver(nextState, over, opponent)) continue;

        const gain = cubeDistance(from, oppGoalCenter) - cubeDistance(land, oppGoalCenter);
        if (gain > maxGift) maxGift = gain;
      }

      checked++;
      if (checked >= 5) break;
    }
  }

  // Only penalise gifts of 3+ cells
  return maxGift >= 3 ? maxGift * 2 : 0;
}
```

Add the missing import at the top of `strategy.ts`:
```typescript
import { canJumpOver } from '../moves';
```
(Check if already imported — it may be under a different name.)

- [ ] **Step 2: Wire `computeOpponentGiftPenalty` into `computeStrategicScore`**

Add `opponentGiftPenalty` to the `StrategicScore` interface:

```typescript
export interface StrategicScore {
  // ... existing fields ...
  opponentGiftPenalty: number;   // NEW
  total: number;
}
```

In `computeStrategicScore`, add after the `midgamePriorityBonus` calculation (only for medium+ difficulty context — but since `computeStrategicScore` doesn't receive difficulty, apply at reduced weight and let the caller decide):

```typescript
// Opponent-gift: penalise moves that give opponent a large forward jump.
// Only for generalist/defensive personalities (aggressive ignores opponent threats).
const opponentGiftPenalty =
  personality !== 'aggressive'
    ? computeOpponentGiftPenalty(state, move, player)
    : 0;
```

Add to `total`:

```typescript
const total =
  weights.steppingStone * steppingStoneValue +
  weights.unblocking * unblockingValue +
  weights.backwardness * backwardnessBonus +
  weights.opponentPiece * opponentPieceBonus +
  weights.blockingOpponent * blockingOpponentValue +
  weights.straggler * stragglerBonus +
  midgamePriorityBonus -
  weights.pastOpponents * pastOpponentsPenalty -
  weights.blockingOpponent * opponentGiftPenalty; // uses blockingOpponent weight for personality scaling
```

Update return statement:

```typescript
return {
  steppingStoneValue,
  unblockingValue,
  backwardnessBonus,
  opponentPieceBonus,
  blockingOpponentValue,
  pastOpponentsPenalty,
  stragglerBonus,
  midgamePriorityBonus,
  opponentGiftPenalty, // NEW
  total,
};
```

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/ai/strategy.ts
git commit -m "feat(ai): add opponent-gift penalty to computeStrategicScore"
```

---

## Task 8: Consecutive-piece penalty + enable strategic scoring for easy

**Files:**
- Modify: `src/game/ai/search.ts`

- [ ] **Step 1: Add `computeConsecutivePiecePenalty`**

Add this function after `computeRepetitionPenalty` in `search.ts`:

```typescript
/**
 * Soft penalty for moving the same piece on consecutive turns.
 * Moving the same piece 3+ times in a row is almost always suboptimal —
 * other pieces need attention. Traces move history for the current player.
 */
function computeConsecutivePiecePenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  // Count consecutive past moves of this player that used the same piece
  let count = 0;
  let tracePos = move.from; // The piece we're proposing to move is currently at move.from

  for (let i = state.moveHistory.length - 1; i >= 0; i--) {
    const past = state.moveHistory[i];
    if (past.player !== player) continue;
    // This past move ended at the position our piece is currently at → same piece
    if (past.to.q === tracePos.q && past.to.r === tracePos.r) {
      count++;
      tracePos = past.from; // Trace back further
    } else {
      break; // Different piece was moved last
    }
    if (count >= 4) break;
  }

  // count = number of previous consecutive turns this piece was moved
  if (count < 2) return 0;   // 2nd consecutive turn: no penalty (sometimes necessary)
  if (count === 2) return 20; // 3rd consecutive turn: moderate penalty
  return 80;                  // 4th+ consecutive turn: strong penalty
}
```

- [ ] **Step 2: Apply consecutive-piece penalty in `findBestMove`**

In `findBestMove` in `search.ts`, find the final scoring loop:

```typescript
for (const move of moves) {
  const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
  const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);
  const penalty = (regPenalty === Infinity ? 1000000 : regPenalty) +
                  (repPenalty === Infinity ? 1000000 : repPenalty);
```

Add the consecutive-piece penalty:

```typescript
for (const move of moves) {
  const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
  const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);
  const consecPenalty = computeConsecutivePiecePenalty(state, move, player); // NEW
  const penalty = (regPenalty === Infinity ? 1000000 : regPenalty) +
                  (repPenalty === Infinity ? 1000000 : repPenalty) +
                  consecPenalty; // NEW
```

- [ ] **Step 3: Enable strategic scoring for easy difficulty**

In `search.ts`, find the guard in `getTopMoves`:

```typescript
if (difficulty !== 'easy') {
  const strategic = computeStrategicScore(state, move, player, personality, threats);
  const strategicWeight = inEndgame ? 2.0 : 1.0;
  score += strategic.total * strategicWeight;
}
```

Replace with:

```typescript
{
  const strategic = computeStrategicScore(state, move, player, personality, threats);
  // Easy gets reduced strategic weight (setup concept still applies, just lighter)
  const difficultyMultiplier = difficulty === 'easy' ? 0.4 : 1.0;
  const strategicWeight = inEndgame ? 2.0 : 1.0;
  score += strategic.total * strategicWeight * difficultyMultiplier;
}
```

Apply the same change to the identical guard in `getTopMovesFromList`.

- [ ] **Step 4: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/search.ts
git commit -m "feat(ai): add consecutive-piece penalty, enable strategic scoring for easy difficulty"
```

---

## Task 9: Straggler divisor + strengthen endgame repetition

**Files:**
- Modify: `src/game/ai/evaluate.ts`
- Modify: `src/game/ai/search.ts`

- [ ] **Step 1: Change straggler divisor from 5 to 3 in `evaluate.ts`**

In `src/game/ai/evaluate.ts`, find:

```typescript
stragglerScore = -(maxPieceDist * maxPieceDist) / 5;
```

Change to:

```typescript
stragglerScore = -(maxPieceDist * maxPieceDist) / 3;
```

There is a second occurrence of this pattern in the `lateEndgame` block — leave that one unchanged (it already uses `/3`):
```typescript
stragglerScore = -(worstDist * worstDist) / 3;
```

- [ ] **Step 2: Escalate repetition penalty for endgame-phase pieces in `computeRepetitionPenalty`**

In `search.ts`, find `computeRepetitionPenalty`. Add the import at the top of `search.ts`:

```typescript
import { findEndgameMove, isLateEndgame, scoreEndgameMove, evaluateEndgameLateral, getPiecePhase } from './endgame';
```

(Update the existing endgame import line.)

Inside `computeRepetitionPenalty`, find:

```typescript
if (visitCount === 1) return 200; // Heavy penalty for returning to any previous position
```

Replace with:

```typescript
// In endgame phase, escalate the penalty to a hard veto —
// a piece near the goal should never be shuffling back to past positions.
const piecePhase = getPiecePhase(state, move.from, player);
if (piecePhase !== 'midgame') {
  if (visitCount >= 1) return Infinity; // Hard veto for endgame pieces
} else {
  if (visitCount === 1) return 200;
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass. If `computeRegressionPenalty — goal positions` test fails (it checks penalty ≥ 60 for leaving goal), that's fine — verify the value is still ≥ 60.

- [ ] **Step 4: Commit**

```bash
git add src/game/ai/evaluate.ts src/game/ai/search.ts
git commit -m "fix(ai): tighten straggler penalty divisor (5→3), hard-veto repetition for endgame pieces"
```

---

## Task 10: Smoke-test the full AI improvement in the browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Set up a 2-player AI vs AI game at medium/generalist**

Navigate to `http://localhost:3000/play`, set both players to AI medium/generalist. Start the game. Let it play out or fast-forward via the turn indicator.

- [ ] **Step 3: Verify the following behaviours are no longer present**

- Pieces deep in the goal zone jumping backwards out of it
- The same piece making 4+ consecutive lateral moves with no entry following
- The game stalling after 6/10 pieces are in goal

- [ ] **Step 4: Run full test suite one final time**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -p
git commit -m "fix(ai): smoke-test adjustments after browser verification"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 Per-piece phase detection | Task 1 (`getPiecePhase`) |
| §2 Piece move priority | Task 5 (midgame bonus) |
| §3 Setup move at all phases | Task 4 (wire `evaluateEndgameLateral`), Task 8 (enable for easy) |
| §4 Endgame-contested: swap bonus | Task 6 |
| §4 Endgame-contested: opponent-gift | Task 7 |
| §5 Consecutive-piece penalty | Task 8 |
| §5 Opponent-gift midgame | Task 7 (same function, lower weight for midgame via personality path) |
| §5 Straggler divisor | Task 9 |
| §6 Lateral move handling | Task 4 (`evaluateEndgameLateral`) |
| §6 `canReachGoalViaChain` | Task 2 |
| §6 `couldEnterGoalIfEmpty` upgrade | Task 3 |
| §6 `isLateEndgame` threshold | Task 3 |
| §7 Board-state repetition escalation | Task 9 |
| §7 Per-piece cycle detection | Task 9 (hard veto via visitCount check) |

All spec requirements covered. No TBDs or placeholders in task steps.
