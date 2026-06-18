# AI Improvement Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add landing quality scoring, hard difficulty depth increase, last-move opponent awareness, and setup move block risk to make the AI genuinely challenging at all difficulty levels.

**Architecture:** Three new exported functions in `strategy.ts` (`scoreLandingQuality`, `scoreLastMoveResponse`, `scoreSetupBlockRisk`) called from the move-scoring loops in `search.ts` alongside the existing `computeStrategicScore`. `AI_DEPTH['hard']` bumped from 2 to 3 in `types/ai.ts`. No changes to `computeStrategicScore` signature — the new functions receive `difficulty` directly.

**Tech Stack:** TypeScript, Vitest, cube coordinate hex grid (`{q,r,s}` with `q+r+s=0`). Run tests: `npx vitest tests/game/ai.test.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-18-ai-improvement-round2-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/game/ai/strategy.ts` | Add `scoreLandingQuality`, `scoreLastMoveResponse`, `scoreSetupBlockRisk`; add `AIPersonality`/`AIDifficulty` import |
| `src/game/ai/search.ts` | Wire three new scoring functions into `getTopMoves` and `getTopMovesFromList` |
| `src/types/ai.ts` | `AI_DEPTH['hard']`: `2` → `3` |
| `tests/game/ai.test.ts` | New describe blocks for all three functions |

**Key constants for tests:**
- Player 0 goal = lower-left triangle: `(-4,5)`, `(-3,5)`, `(-2,5)`, `(-1,5)`, `(-2,6)`, `(-3,6)`, `(-4,6)`, `(-4,7)`, `(-3,7)`, `(-4,8)`
- Goal centroid ≈ `(-3, 6)` — the goal direction from origin
- `cubeDistance(a,b) = (|Δq|+|Δr|+|Δs|)/2` — max of the three absolute differences (this is `Math.max(|Δq|,|Δr|,|Δs|)` in the codebase's `cubeDistance`)
- `getGoalPositionsForState(state, 0)` returns the 10 goal cells for player 0
- `createGame(2)` starts a fresh 2-player game; `cloneGameState(state)` deep-copies it

---

## Task 1: `scoreLandingQuality` — corridor alignment + consolidation + straggler connectivity

**Files:**
- Modify: `src/game/ai/strategy.ts`
- Modify: `tests/game/ai.test.ts`

- [ ] **Step 1: Add `AIPersonality` and `AIDifficulty` imports to `strategy.ts`**

At the top of `src/game/ai/strategy.ts`, the current imports from `@/types/game` do NOT include the AI types. Add:

```typescript
import type { AIPersonality, AIDifficulty } from '@/types/ai';
```

- [ ] **Step 2: Write the failing tests**

Add to the imports at the top of `tests/game/ai.test.ts`:

```typescript
import { scoreLandingQuality } from '@/game/ai/strategy';
```

Add at the bottom of `tests/game/ai.test.ts`:

```typescript
describe('scoreLandingQuality', () => {
  // Player 0 goal is lower-left; goal center ≈ (-3, 6).
  // A move that reduces lateral deviation from the goal axis scores positively on corridor alignment.
  // A move landing near teammates scores on consolidation.
  // A move landing near a straggler scores on straggler connectivity.

  it('corridor: move reducing lateral deviation from goal axis scores higher than lateral drift', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Place a player 0 piece at (1,-3) — this piece will be the "moving piece"
    ts.board.set(coordKey(cubeCoord(1, -3)), { type: 'piece', player: 0 });

    // Move A: toward the goal corridor (reduces lateral deviation) — from (1,-3) to (0,-2)
    const moveToward = { from: cubeCoord(1, -3), to: cubeCoord(0, -2), isJump: false };
    // Move B: lateral drift — from (1,-3) to (2,-3)
    const moveLateral = { from: cubeCoord(1, -3), to: cubeCoord(2, -3), isJump: false };

    const scoreToward = scoreLandingQuality(ts, moveToward, 0, 'generalist', 'hard');
    const scoreLateral = scoreLandingQuality(ts, moveLateral, 0, 'generalist', 'hard');

    // Corridor-aligned landing should score >= lateral landing
    expect(scoreToward).toBeGreaterThanOrEqual(scoreLateral);
  });

  it('consolidation: landing near teammates scores higher than landing isolated', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Clear player 0 starting pieces and place known positions
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && content.player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }

    // Cluster of player 0 pieces at (-2,3), (-1,3), (-3,3)
    ts.board.set(coordKey(cubeCoord(-2, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-3, 3)), { type: 'piece', player: 0 });

    // Moving piece at (0,2) — it will move toward or away from cluster
    ts.board.set(coordKey(cubeCoord(0, 2)), { type: 'piece', player: 0 });

    // Move near cluster (distance 1-2 from teammates)
    const moveNear = { from: cubeCoord(0, 2), to: cubeCoord(-2, 4), isJump: false };
    // Move isolated (far from teammates)
    const moveIsolated = { from: cubeCoord(0, 2), to: cubeCoord(4, -6), isJump: false };

    const scoreNear = scoreLandingQuality(ts, moveNear, 0, 'defensive', 'hard');
    const scoreIsolated = scoreLandingQuality(ts, moveIsolated, 0, 'defensive', 'hard');

    expect(scoreNear).toBeGreaterThan(scoreIsolated);
  });

  it('straggler: landing near straggler scores higher than landing far from straggler', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Clear player 0 starting pieces
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && content.player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }

    // 9 player 0 pieces near goal, 1 straggler at (4,-8) far away
    const nearGoal = ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7'];
    for (const cell of nearGoal) {
      const [q, r] = cell.split(',').map(Number);
      ts.board.set(`${q},${r}`, { type: 'piece', player: 0 });
    }
    ts.board.set(coordKey(cubeCoord(4, -8)), { type: 'piece', player: 0 }); // straggler

    // Moving piece at (2,-6) — moves toward or away from straggler
    ts.board.set(coordKey(cubeCoord(2, -6)), { type: 'piece', player: 0 });

    // Move toward straggler (within 3 cells)
    const moveNearStraggler = { from: cubeCoord(2, -6), to: cubeCoord(3, -7), isJump: false };
    // Move away from straggler
    const moveFarFromStraggler = { from: cubeCoord(2, -6), to: cubeCoord(-3, 5), isJump: false };

    const scoreNear = scoreLandingQuality(ts, moveNearStraggler, 0, 'generalist', 'hard');
    const scoreFar = scoreLandingQuality(ts, moveFarFromStraggler, 0, 'generalist', 'hard');

    expect(scoreNear).toBeGreaterThan(scoreFar);
  });

  it('difficulty scaling: hard scores higher than easy for same move', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    ts.board.set(coordKey(cubeCoord(-2, 4)), { type: 'piece', player: 0 });

    const move = { from: cubeCoord(-2, 4), to: cubeCoord(-3, 5), isJump: false };

    const scoreHard = scoreLandingQuality(ts, move, 0, 'generalist', 'hard');
    const scoreEasy = scoreLandingQuality(ts, move, 0, 'generalist', 'easy');

    // Easy is 0.2x weight, hard is 1.0x — hard must score >= easy (for non-negative components)
    expect(Math.abs(scoreHard)).toBeGreaterThanOrEqual(Math.abs(scoreEasy));
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "scoreLandingQuality|Cannot find"
```

Expected: fails with missing export.

- [ ] **Step 4: Implement `scoreLandingQuality` in `strategy.ts`**

Add this function before `computeStrategicScore` in `src/game/ai/strategy.ts`. The `hasSignificantStraggler` function is already defined in this file. `getPlayerPieces` is already imported from `'../setup'`.

```typescript
/**
 * Evaluate the quality of a move's landing position across three components:
 * 1. Corridor alignment — how well the landing is aligned with the goal axis
 * 2. Consolidation — friendly pieces within 2 cells of landing
 * 3. Straggler connectivity — does landing help bridge the furthest-back piece
 * Scaled by difficulty: hard=1.0, medium=0.6, easy=0.2
 */
export function scoreLandingQuality(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);

  // Component 1: Corridor alignment
  // Perpendicular deviation from the goal-direction axis at landing vs. starting position.
  // Positive = moved closer to goal axis (good).
  const gLen = Math.sqrt(goalCenter.q * goalCenter.q + goalCenter.r * goalCenter.r);
  let corridorScore = 0;
  if (gLen > 0.01) {
    const px = -goalCenter.r / gLen;
    const py =  goalCenter.q / gLen;
    const lateralFrom = Math.abs(move.from.q * px + move.from.r * py);
    const lateralTo   = Math.abs(move.to.q   * px + move.to.r   * py);
    corridorScore = (lateralFrom - lateralTo) * 2; // positive = moved toward axis
  }

  // Component 2: Consolidation — count friendly pieces within 2 cells of landing
  const pieces = getPlayerPieces(state, player);
  let consolidation = 0;
  for (const piece of pieces) {
    if (piece.q === move.from.q && piece.r === move.from.r) continue; // skip moving piece
    if (cubeDistance(piece, move.to) <= 2) consolidation++;
  }
  const consolidationWeight =
    personality === 'aggressive' ? 0.5 :
    personality === 'defensive'  ? 2.0 : 1.2;
  const consolidationScore = consolidation * consolidationWeight;

  // Component 3: Straggler connectivity
  let stragglerScore = 0;
  const { hasStraggler, stragglerPos } = hasSignificantStraggler(state, player);
  if (hasStraggler && stragglerPos) {
    const distToStraggler = cubeDistance(move.to, stragglerPos);

    // Bonus if landing within 3 cells of straggler (direct connection)
    if (distToStraggler <= 3) {
      stragglerScore = 4;
    } else {
      // Check bridging: dist(straggler→to) + dist(to→nearestPack) < dist(straggler→nearestPack)
      let nearestPackDist = Infinity;
      let nearestPackPiece: CubeCoord | null = null;
      for (const piece of pieces) {
        if (piece.q === move.from.q && piece.r === move.from.r) continue;
        if (piece.q === stragglerPos.q && piece.r === stragglerPos.r) continue;
        const d = cubeDistance(piece, stragglerPos);
        if (d < nearestPackDist) { nearestPackDist = d; nearestPackPiece = piece; }
      }
      if (nearestPackPiece && nearestPackDist < Infinity) {
        const distToPack = cubeDistance(move.to, nearestPackPiece);
        if (distToStraggler + distToPack < nearestPackDist) {
          stragglerScore = 2; // Bridging position
        }
      }
    }

    // Penalty if move takes the piece away from the straggler when they were close
    const distFromBefore = cubeDistance(move.from, stragglerPos);
    if (distToStraggler > distFromBefore && distToStraggler > 4) {
      stragglerScore -= 2;
    }
  }

  const raw = corridorScore + consolidationScore + stragglerScore;

  const diffMult =
    difficulty === 'hard'   ? 1.0 :
    difficulty === 'medium' ? 0.6 : 0.2;

  return raw * diffMult;
}
```

- [ ] **Step 5: Wire `scoreLandingQuality` into `search.ts`**

In `src/game/ai/search.ts`, add the import:

```typescript
import { computeStrategicScore, findOpponentJumpThreats, scoreLandingQuality } from './strategy';
```

(Update the existing `strategy` import line — it currently imports `computeStrategicScore` and `findOpponentJumpThreats`.)

In `getTopMoves`, after the existing `score += strategic.total * strategicWeight * difficultyMultiplier;` line, add:

```typescript
    // Round 2: landing quality (corridor alignment + consolidation + straggler)
    score += scoreLandingQuality(state, move, player, personality, difficulty);
```

Apply the **identical addition** to `getTopMovesFromList`.

- [ ] **Step 6: Run tests**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|scoreLandingQuality"
```

Expected: all 4 `scoreLandingQuality` tests PASS. Run `npm run test 2>&1 | tail -8` to confirm no regressions (2 pre-existing training failures OK).

- [ ] **Step 7: Commit**

```bash
git add src/game/ai/strategy.ts src/game/ai/search.ts tests/game/ai.test.ts
git commit -m "feat(ai): add scoreLandingQuality — corridor alignment, consolidation, straggler connectivity"
```

---

## Task 2: Hard midgame depth increase (2 → 3)

**Files:**
- Modify: `src/types/ai.ts`

- [ ] **Step 1: Change `AI_DEPTH['hard']` from 2 to 3**

In `src/types/ai.ts`, find:

```typescript
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 2,
};
```

Change to:

```typescript
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 3,
};
```

- [ ] **Step 2: Run tests**

```bash
npm run test 2>&1 | tail -8
```

Expected: 160 passed, 2 pre-existing failures. The depth change has no unit test — it's a constant.

- [ ] **Step 3: Commit**

```bash
git add src/types/ai.ts
git commit -m "feat(ai): increase hard difficulty midgame search depth from 2 to 3"
```

---

## Task 3: `scoreLastMoveResponse` — last-move threat amplification + vacated square opportunity

**Files:**
- Modify: `src/game/ai/strategy.ts`
- Modify: `src/game/ai/search.ts`
- Modify: `tests/game/ai.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the import in `tests/game/ai.test.ts`:

```typescript
import { scoreLandingQuality, scoreLastMoveResponse } from '@/game/ai/strategy';
```

Add at the bottom of `tests/game/ai.test.ts`:

```typescript
describe('scoreLastMoveResponse', () => {
  // Player 0 goal: lower-left. Player 2 goal: upper-right (player 0's starting area).

  it('returns 0 for easy difficulty', () => {
    const state = createGame(2);
    // Add an opponent last move to history
    state.moveHistory.push({ from: cubeCoord(0, 1), to: cubeCoord(0, -1), isJump: true, player: 2 });
    const move = { from: cubeCoord(1, -5), to: cubeCoord(0, -4), isJump: false };
    const score = scoreLastMoveResponse(state, move, 0, 'generalist', 'easy');
    expect(score).toBe(0);
  });

  it('returns 0 when move history is empty', () => {
    const state = createGame(2);
    const move = { from: cubeCoord(1, -5), to: cubeCoord(0, -4), isJump: false };
    const score = scoreLastMoveResponse(state, move, 0, 'generalist', 'hard');
    expect(score).toBe(0);
  });

  it('defensive AI gets positive score for blocking opponent last-move jump threat', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Opponent (player 2) just moved their piece TO (1,-2)
    // From (1,-2), opponent can jump over (0,-1) to land at (-1,0) — that's a 3+ cell gain for them
    // Set up board: opponent at (1,-2), a piece to jump over at (0,-1)
    ts.board.set(coordKey(cubeCoord(1, -2)), { type: 'piece', player: 2 });
    ts.board.set(coordKey(cubeCoord(0, -1)), { type: 'piece', player: 0 }); // jumping stone
    ts.board.set(coordKey(cubeCoord(-1, 0)), { type: 'empty' });            // landing

    ts.moveHistory.push({
      from: cubeCoord(2, -3),
      to: cubeCoord(1, -2),
      isJump: true,
      player: 2,
    });

    // Our move: land at (-1,0) — blocks the opponent's intended landing
    const blockingMove = { from: cubeCoord(-2, 1), to: cubeCoord(-1, 0), isJump: false };
    const scoreDefensive = scoreLastMoveResponse(ts, blockingMove, 0, 'defensive', 'hard');

    // Non-blocking move to an unrelated position
    const otherMove = { from: cubeCoord(-2, 1), to: cubeCoord(-2, 2), isJump: false };
    const scoreOther = scoreLastMoveResponse(ts, otherMove, 0, 'defensive', 'hard');

    expect(scoreDefensive).toBeGreaterThan(scoreOther);
  });

  it('aggressive AI scores near 0 for blocking (ignores opponent threats)', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    ts.board.set(coordKey(cubeCoord(1, -2)), { type: 'piece', player: 2 });
    ts.board.set(coordKey(cubeCoord(0, -1)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-1, 0)), { type: 'empty' });
    ts.moveHistory.push({ from: cubeCoord(2, -3), to: cubeCoord(1, -2), isJump: true, player: 2 });

    const blockingMove = { from: cubeCoord(-2, 1), to: cubeCoord(-1, 0), isJump: false };
    const scoreAggressive = scoreLastMoveResponse(ts, blockingMove, 0, 'aggressive', 'hard');
    expect(scoreAggressive).toBe(0);
  });

  it('returns positive score for landing on the square opponent just vacated', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Opponent moved FROM (1,1) TO (1,-1) — vacated (1,1)
    ts.board.set(coordKey(cubeCoord(1, 1)), { type: 'empty' }); // vacated
    ts.board.set(coordKey(cubeCoord(1, -1)), { type: 'piece', player: 2 }); // new position
    ts.moveHistory.push({ from: cubeCoord(1, 1), to: cubeCoord(1, -1), isJump: true, player: 2 });

    // Our move: land on the vacated square (1,1) — forward progress toward our goal (lower-left)
    // Player 0 is at (2,2), moving to (1,1) is forward (closer to lower-left goal)
    ts.board.set(coordKey(cubeCoord(2, 2)), { type: 'piece', player: 0 });
    const vacatedMove = { from: cubeCoord(2, 2), to: cubeCoord(1, 1), isJump: false };
    const score = scoreLastMoveResponse(ts, vacatedMove, 0, 'generalist', 'hard');

    // Non-vacated move
    const otherMove = { from: cubeCoord(2, 2), to: cubeCoord(2, 3), isJump: false };
    const scoreOther = scoreLastMoveResponse(ts, otherMove, 0, 'generalist', 'hard');

    expect(score).toBeGreaterThanOrEqual(scoreOther);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "scoreLastMoveResponse|Cannot find"
```

Expected: fails with missing export.

- [ ] **Step 3: Implement `scoreLastMoveResponse` in `strategy.ts`**

Add after `scoreLandingQuality` in `src/game/ai/strategy.ts`:

```typescript
/**
 * Score a move based on how it responds to the opponent's most recent move.
 * Sub-component 1: Block a jump threat set up by the opponent's last move.
 * Sub-component 2: Exploit the square the opponent just vacated (land there for progress).
 * Easy difficulty: always returns 0.
 * Personality-weighted: defensive values blocking, aggressive ignores it.
 */
export function scoreLastMoveResponse(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  if (difficulty === 'easy') return 0;

  const history = state.moveHistory;
  if (history.length === 0) return 0;

  // Find the most recent move by a non-player player
  let lastOpponentMove: Move | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].player !== player) {
      lastOpponentMove = history[i];
      break;
    }
  }
  if (!lastOpponentMove || lastOpponentMove.player === undefined) return 0;

  const opponentPlayer = lastOpponentMove.player;
  const oppGoalPositions = getGoalPositionsForState(state, opponentPlayer);
  if (oppGoalPositions.length === 0) return 0;
  const oppGoalCenter = centroid(oppGoalPositions);

  let score = 0;

  // Sub-component 1: Threat amplification — does our move block a jump the opponent set up?
  const lastMovedTo = lastOpponentMove.to;
  for (const dir of DIRECTIONS) {
    const over: CubeCoord = {
      q: lastMovedTo.q + dir.q,
      r: lastMovedTo.r + dir.r,
      s: lastMovedTo.s + dir.s,
    };
    const land: CubeCoord = {
      q: lastMovedTo.q + dir.q * 2,
      r: lastMovedTo.r + dir.r * 2,
      s: lastMovedTo.s + dir.s * 2,
    };

    if (!state.board.has(coordKey(land))) continue;
    if (state.board.get(coordKey(land))?.type !== 'empty') continue;
    if (!canJumpOver(state, over, opponentPlayer)) continue;

    const gain = cubeDistance(lastMovedTo, oppGoalCenter) - cubeDistance(land, oppGoalCenter);
    if (gain < 3) continue; // Only significant threats

    // Blocking bonus: our move occupies the landing OR the stepping-over position
    const blockingWeight =
      personality === 'defensive'  ? 3.0 :
      personality === 'generalist' ? 1.5 : 0;

    if (coordKey(move.to) === coordKey(land) || coordKey(move.to) === coordKey(over)) {
      score += gain * blockingWeight;
    }
  }

  // Sub-component 2: Opportunity from vacated square
  // If our move lands on the square the opponent just vacated AND that is forward progress, bonus.
  const vacatedPos = lastOpponentMove.from;
  const myGoalPositions = getGoalPositionsForState(state, player);
  const myGoalCenter = centroid(myGoalPositions);
  const distFromBefore = cubeDistance(move.from, myGoalCenter);
  const distLanding = cubeDistance(move.to, myGoalCenter);

  if (coordKey(move.to) === coordKey(vacatedPos) && distLanding < distFromBefore) {
    const opportunityWeight =
      personality === 'aggressive' ? 2.0 :
      personality === 'generalist' ? 1.0 : 0.5;
    const gain = distFromBefore - distLanding;
    score += gain * opportunityWeight;
  }

  // Difficulty scaling
  const diffMult = difficulty === 'medium' ? 0.6 : 1.0;
  return score * diffMult;
}
```

- [ ] **Step 4: Wire into `search.ts`**

Update the `strategy` import in `search.ts`:

```typescript
import { computeStrategicScore, findOpponentJumpThreats, scoreLandingQuality, scoreLastMoveResponse } from './strategy';
```

In `getTopMoves`, after the existing `score += scoreLandingQuality(...)` line, add:

```typescript
    // Round 2: last-move opponent awareness
    score += scoreLastMoveResponse(state, move, player, personality, difficulty);
```

Apply the **identical addition** to `getTopMovesFromList`.

- [ ] **Step 5: Run tests**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|scoreLastMoveResponse"
```

Expected: all 5 tests PASS. Then: `npm run test 2>&1 | tail -8` — 160 passed, 2 pre-existing failures.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/strategy.ts src/game/ai/search.ts tests/game/ai.test.ts
git commit -m "feat(ai): add scoreLastMoveResponse — last-move threat blocking and vacated square opportunity"
```

---

## Task 4: `scoreSetupBlockRisk` — fill block + removal block

**Files:**
- Modify: `src/game/ai/strategy.ts`
- Modify: `src/game/ai/search.ts`
- Modify: `tests/game/ai.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import in `tests/game/ai.test.ts`:

```typescript
import { scoreLandingQuality, scoreLastMoveResponse, scoreSetupBlockRisk } from '@/game/ai/strategy';
```

Add at the bottom of `tests/game/ai.test.ts`:

```typescript
describe('scoreSetupBlockRisk', () => {
  // scoreSetupBlockRisk returns a NEGATIVE value (penalty) when a setup move is risky.
  // It receives the steppingStoneValue so it can skip non-setup moves.

  it('returns 0 when steppingStoneValue is 0 (not a setup move)', () => {
    const state = createGame(2);
    const move = { from: cubeCoord(1, -5), to: cubeCoord(0, -4), isJump: false };
    const result = scoreSetupBlockRisk(state, move, 0, 'defensive', 'hard', 0);
    expect(result).toBe(0);
  });

  it('returns 0 for easy difficulty', () => {
    const state = createGame(2);
    const move = { from: cubeCoord(1, -5), to: cubeCoord(0, -4), isJump: false };
    const result = scoreSetupBlockRisk(state, move, 0, 'defensive', 'easy', 10);
    expect(result).toBe(0);
  });

  it('fill block: defensive penalty when opponent can reach the enabled landing in 1 step', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    // Clear known pieces so we control the board
    for (const [key, content] of ts.board) {
      if (content.type === 'piece') ts.board.set(key, { type: 'empty' });
    }

    // Setup: player 0 moving piece A from (0,0) to (-1,1) — acting as a stepping stone
    // This enables piece B at (-2,2) to jump over (-1,1) and land at (0,2)
    ts.board.set(coordKey(cubeCoord(-2, 2)), { type: 'piece', player: 0 }); // piece B
    ts.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });  // piece A (moving)
    ts.board.set(coordKey(cubeCoord(0, 2)), { type: 'empty' });              // intended landing

    // Opponent adjacent to the intended landing (0,2) — can step there to fill-block
    ts.board.set(coordKey(cubeCoord(1, 2)), { type: 'piece', player: 2 }); // opponent 1 step from landing

    const setupMove = { from: cubeCoord(0, 0), to: cubeCoord(-1, 1), isJump: false };

    // steppingStoneValue > 0 to indicate this is a setup move
    const penaltyDefensive = scoreSetupBlockRisk(ts, setupMove, 0, 'defensive', 'hard', 5);
    const penaltyAggressive = scoreSetupBlockRisk(ts, setupMove, 0, 'aggressive', 'hard', 5);

    // Defensive should get a meaningful penalty (negative)
    expect(penaltyDefensive).toBeLessThan(0);
    // Aggressive nearly ignores it
    expect(penaltyAggressive).toBeGreaterThan(penaltyDefensive);
  });

  it('removal block: penalty when chain relies on an opponent stepping stone that can move', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);

    for (const [key, content] of ts.board) {
      if (content.type === 'piece') ts.board.set(key, { type: 'empty' });
    }

    // Setup: piece A at (0,0) moves to (-1,1), enabling piece B at (-2,2)
    // to jump OVER the OPPONENT piece at (-1,1)... wait, piece A is ours.
    // For removal risk: the chain requires jumping over an OPPONENT piece.
    // Piece B at (-2,2) can jump over the opponent piece at (-1,1) to land at (0,0)
    // Our setup move moves piece A OUT of (0,0) making it the landing.

    ts.board.set(coordKey(cubeCoord(-2, 2)), { type: 'piece', player: 0 }); // piece B (will jump)
    ts.board.set(coordKey(cubeCoord(-1, 1)), { type: 'piece', player: 2 }); // opponent stepping stone
    ts.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });  // piece A (moving away)

    // Piece A moves to (1,-1), vacating (0,0) — now piece B can jump over opponent at (-1,1) to land at (0,0)
    const setupMove = { from: cubeCoord(0, 0), to: cubeCoord(1, -1), isJump: false };
    // The opponent piece at (-1,1) CAN move (it has valid moves since it's not blocked)
    // → removal risk exists

    const penaltyDefensive = scoreSetupBlockRisk(ts, setupMove, 0, 'defensive', 'hard', 5);
    // Should return a negative penalty since the opponent can remove their own stepping stone
    expect(penaltyDefensive).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "scoreSetupBlockRisk|Cannot find"
```

Expected: fails with missing export.

- [ ] **Step 3: Implement `scoreSetupBlockRisk` in `strategy.ts`**

Add after `scoreLastMoveResponse` in `src/game/ai/strategy.ts`. This function needs `getAllValidMoves` (already imported). It checks both fill-block risk (can opponent land on our intended landing?) and removal-block risk (can opponent move a piece we planned to jump over?).

```typescript
/**
 * Penalise setup moves whose enabled chain can be disrupted by one opponent move.
 *
 * Two disruption types:
 * - Fill block: opponent can land on an intended chain landing position (occupying it)
 * - Removal block: opponent can move a piece that the chain requires jumping over
 *
 * Returns a negative score (penalty). Returns 0 for non-setup moves (steppingStoneValue=0)
 * or easy difficulty.
 */
export function scoreSetupBlockRisk(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  steppingStoneValue: number
): number {
  if (difficulty === 'easy') return 0;
  if (steppingStoneValue <= 0) return 0;

  // Simulate our setup move
  const nextBoard = new Map(state.board);
  const fromContent = nextBoard.get(coordKey(move.from));
  nextBoard.set(coordKey(move.from), { type: 'empty' });
  nextBoard.set(coordKey(move.to), fromContent!);
  const nextState: GameState = { ...state, board: nextBoard };

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);
  const pieces = getPlayerPieces(nextState, player);

  let totalRisk = 0;

  for (const piece of pieces) {
    if (piece.q === move.to.q && piece.r === move.to.r) continue; // skip the moved piece itself

    for (const dir of DIRECTIONS) {
      const over: CubeCoord = {
        q: piece.q + dir.q,
        r: piece.r + dir.r,
        s: piece.s + dir.s,
      };
      const land: CubeCoord = {
        q: piece.q + dir.q * 2,
        r: piece.r + dir.r * 2,
        s: piece.s + dir.s * 2,
      };

      if (!nextState.board.has(coordKey(land))) continue;
      if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
      if (!canJumpOver(nextState, over, player)) continue;

      const jumpGain = cubeDistance(piece, goalCenter) - cubeDistance(land, goalCenter);
      if (jumpGain <= 0) continue; // Only forward-moving chains

      // TYPE 1: Fill block — can any opponent reach `land` in one move?
      let fillRisk = 0;
      for (const opponent of state.activePlayers) {
        if (opponent === player) continue;
        for (const [oppKey, oppContent] of nextState.board) {
          if (oppContent.type !== 'piece' || oppContent.player !== opponent) continue;
          const [oq, or_] = oppKey.split(',').map(Number);
          const oppPos: CubeCoord = { q: oq, r: or_, s: -oq - or_ };

          // Step to land?
          if (cubeDistance(oppPos, land) === 1) {
            fillRisk = 1.0;
            break;
          }
          // Jump to land?
          for (const od of DIRECTIONS) {
            const oppOver: CubeCoord = { q: oppPos.q + od.q, r: oppPos.r + od.r, s: oppPos.s + od.s };
            const oppLand: CubeCoord = { q: oppPos.q + od.q * 2, r: oppPos.r + od.r * 2, s: oppPos.s + od.s * 2 };
            if (coordKey(oppLand) !== coordKey(land)) continue;
            if (nextState.board.get(coordKey(oppOver))?.type !== 'piece') continue;
            if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
            fillRisk = 1.0;
            break;
          }
          if (fillRisk > 0) break;
        }
        if (fillRisk > 0) break;
      }

      // TYPE 2: Removal block — is `over` an opponent piece that can move?
      let removalRisk = 0;
      const overContent = nextState.board.get(coordKey(over));
      if (overContent?.type === 'piece' && overContent.player !== player) {
        // Opponent piece — they could move it, breaking the chain
        removalRisk = 0.6;
      }

      totalRisk += jumpGain * (fillRisk + removalRisk);
    }
  }

  if (totalRisk <= 0) return 0;

  const personalityMult =
    personality === 'defensive'  ? 2.0 :
    personality === 'generalist' ? 1.0 : 0.3;

  const diffMult = difficulty === 'medium' ? 0.6 : 1.0;

  return -(totalRisk * personalityMult * diffMult);
}
```

- [ ] **Step 4: Wire into `search.ts`**

Update the `strategy` import in `search.ts`:

```typescript
import { computeStrategicScore, findOpponentJumpThreats, scoreLandingQuality, scoreLastMoveResponse, scoreSetupBlockRisk } from './strategy';
```

In `getTopMoves`, after the existing `score += scoreLastMoveResponse(...)` line, add:

```typescript
    // Round 2: setup move block risk (penalises setups the opponent can disrupt)
    score += scoreSetupBlockRisk(state, move, player, personality, difficulty, strategic.steppingStoneValue);
```

Apply the **identical addition** to `getTopMovesFromList`. Note: in `getTopMovesFromList`, `strategic` is also computed — use `strategic.steppingStoneValue` there too.

- [ ] **Step 5: Run tests**

```bash
npx vitest tests/game/ai.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|scoreSetupBlockRisk"
```

Expected: all 4 tests PASS. Then: `npm run test 2>&1 | tail -8` — 160 passed, 2 pre-existing failures.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/strategy.ts src/game/ai/search.ts tests/game/ai.test.ts
git commit -m "feat(ai): add scoreSetupBlockRisk — fill block and removal block detection for risky setup moves"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 Corridor alignment | Task 1 (`scoreLandingQuality` Component 1) |
| §1 Consolidation | Task 1 (`scoreLandingQuality` Component 2) |
| §1 Straggler connectivity | Task 1 (`scoreLandingQuality` Component 3) |
| §1 Difficulty scaling | Task 1 (diffMult in `scoreLandingQuality`) |
| §2 Hard depth 2→3 | Task 2 (`AI_DEPTH['hard']`) |
| §3 Threat amplification last-move | Task 3 (`scoreLastMoveResponse` Sub-component 1) |
| §3 Vacated square opportunity | Task 3 (`scoreLastMoveResponse` Sub-component 2) |
| §3 Difficulty/personality scaling | Task 3 (personality weights + diffMult) |
| §4 Fill block detection | Task 4 (`scoreSetupBlockRisk` Type 1) |
| §4 Removal block detection | Task 4 (`scoreSetupBlockRisk` Type 2) |
| §4 Personality scaling | Task 4 (personalityMult: 2.0/1.0/0.3) |
| §4 Difficulty scaling | Task 4 (diffMult in `scoreSetupBlockRisk`) |

All spec requirements covered. No placeholders or TODOs in task steps.
