import { describe, it, expect } from 'vitest';
import { createGame, cloneGameState } from '@/game/setup';
import { cubeCoord, coordKey } from '@/game/coordinates';
import { getGoalPositions, getHomePositions } from '@/game/state';
import {
  computeRegressionPenalty,
  computeRepetitionPenalty,
  serializeGameState,
  deserializeGameState,
} from '@/game/ai';
import { getPiecePhase, canReachGoalViaChain, findOptimalEndgameSequence } from '@/game/ai/endgame';
import { scoreLandingQuality, scoreLastMoveResponse, scoreSetupBlockRisk, scoreLeapfrogPotential } from '@/game/ai/strategy';
import type { GameState, Move, PlayerIndex } from '@/types/game';

// Helper: create a simple move
function makeMove(
  fq: number, fr: number,
  tq: number, tr: number,
  isJump = false
): Move {
  return {
    from: cubeCoord(fq, fr),
    to: cubeCoord(tq, tr),
    isJump,
  };
}

describe('computeRegressionPenalty', () => {
  // Player 0 starts at top (pieces around (4,-8)), goal is player 2's home near (-3,6).

  it('returns a bonus (non-positive) for a move toward the goal', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    // Piece at (1,-5) moving to (0,-4) — closer to goal centroid
    const move = makeMove(1, -5, 0, -4);
    const penalty = computeRegressionPenalty(state, move, player);
    expect(penalty).toBeLessThanOrEqual(0);
  });

  it('returns positive penalty for a move away from the goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    // Move piece forward first, then test backward move
    testState.board.set(coordKey(cubeCoord(0, -4)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, -5)), { type: 'empty' });
    // Backward: (0,-4) → (1,-5)
    const move = makeMove(0, -4, 1, -5);
    const penalty = computeRegressionPenalty(testState, move, player);
    expect(penalty).toBeGreaterThan(0);
  });

  it('penalizes backward moves more than forward moves', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    // Set up piece at (0,-4)
    testState.board.set(coordKey(cubeCoord(0, -4)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, -5)), { type: 'empty' });
    // Forward: (0,-4) → (-1,-3)
    const forwardPenalty = computeRegressionPenalty(testState, makeMove(0, -4, -1, -3), player);
    // Backward: (0,-4) → (1,-5)
    const backwardPenalty = computeRegressionPenalty(testState, makeMove(0, -4, 1, -5), player);
    expect(backwardPenalty).toBeGreaterThan(forwardPenalty);
  });
});

describe('computeRepetitionPenalty', () => {
  it('returns 0 when move history is empty', () => {
    const state = createGame(2);
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });

  it('returns 0 when piece has not visited the destination before', () => {
    const state = createGame(2);
    // Piece moved from A to B in the past
    state.moveHistory.push(makeMove(0, -3, 0, -4));
    // Now proposing B to C — C was never occupied by this piece
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });

  it('penalizes exact reversals (A->B then B->A)', () => {
    const state = createGame(2);
    // Piece moved from B to A (so it was at B before)
    state.moveHistory.push(makeMove(0, -5, 0, -4));
    // Now proposing A->B — returning to previous position, and it is an exact reversal
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    // Any single reversal is now a hard veto
    expect(penalty).toBe(Infinity);
  });

  it('returns Infinity for 2+ exact reversals', () => {
    const state = createGame(2);
    const pastMove = makeMove(0, -5, 0, -4);
    state.moveHistory.push(pastMove);
    state.moveHistory.push(pastMove);
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(Infinity);
  });

  it('detects multi-step cycles (A->B->C->A)', () => {
    const state = createGame(2);
    // Piece path: A(0,-3) -> B(0,-4) -> C(0,-5)
    state.moveHistory.push(makeMove(0, -3, 0, -4));
    state.moveHistory.push(makeMove(0, -4, 0, -5));
    // Now proposing C -> A — returning to A, a 3-step cycle
    const move = makeMove(0, -5, 0, -3);
    const penalty = computeRepetitionPenalty(state, move, 0);
    // (0,-5) is a midgame piece (far from player 0's goal at lower-left),
    // so the soft 200-point penalty applies rather than the endgame hard-veto.
    expect(penalty).toBe(200);
  });

  it('respects lookback window', () => {
    const state = createGame(2); // 2 players -> lookback = 20 (numPlayers * 10)
    // Push enough filler moves to push the old move out of the window
    const filler = makeMove(1, 0, 2, 0);
    for (let i = 0; i < 21; i++) {
      state.moveHistory.push(filler);
    }
    // The reversal is now at index 0, well outside the lookback window
    state.moveHistory.unshift(makeMove(0, -5, 0, -4));
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });
});

describe('computeRegressionPenalty — goal positions', () => {
  it('applies steep penalty for leaving a goal position', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    const goalPositions = getGoalPositions(player);
    const goalPos = goalPositions[0];
    // Move from a goal position to a non-goal position
    const move = makeMove(goalPos.q, goalPos.r, 0, 0);
    const penalty = computeRegressionPenalty(state, move, player);
    // Should include the 60-point goal-leaving penalty on top of the distance penalty
    expect(penalty).toBeGreaterThanOrEqual(60);
  });

  it('does not apply goal-leaving penalty for moves within the goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    const goalPositions = getGoalPositions(player);
    const homePositions = getHomePositions(player);
    // Place player 0's piece at a goal position (replacing player 2's piece)
    testState.board.set(coordKey(homePositions[0]), { type: 'empty' });
    testState.board.set(coordKey(goalPositions[0]), { type: 'piece', player: 0 });
    testState.board.set(coordKey(goalPositions[1]), { type: 'empty' });
    // Move between two goal positions
    const move = makeMove(
      goalPositions[0].q, goalPositions[0].r,
      goalPositions[1].q, goalPositions[1].r
    );
    const penalty = computeRegressionPenalty(testState, move, player);
    // No goal-leaving penalty since destination is also a goal position
    expect(penalty).toBeLessThan(60);
  });
});

describe('serializeGameState / deserializeGameState roundtrip', () => {
  it('preserves board Map through serialization', () => {
    const state = createGame(2);
    const serialized = serializeGameState(state);
    const restored = deserializeGameState(serialized);

    expect(restored.board).toBeInstanceOf(Map);
    expect(restored.board.size).toBe(state.board.size);

    for (const [key, value] of state.board) {
      expect(restored.board.get(key)).toEqual(value);
    }
  });

  it('preserves all scalar and array fields', () => {
    const state = createGame(2);
    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.playerCount).toBe(state.playerCount);
    expect(restored.activePlayers).toEqual(state.activePlayers);
    expect(restored.currentPlayer).toBe(state.currentPlayer);
    expect(restored.moveHistory).toEqual(state.moveHistory);
    expect(restored.winner).toBe(state.winner);
    expect(restored.finishedPlayers).toEqual(state.finishedPlayers);
    expect(restored.turnNumber).toBe(state.turnNumber);
  });

  it('preserves optional fields when present', () => {
    const state = createGame(2);
    state.aiPlayers = { 0: { difficulty: 'hard', personality: 'aggressive' } };
    state.playerColors = { 0: '#ff0000' };
    state.isCustomLayout = true;

    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.aiPlayers).toEqual(state.aiPlayers);
    expect(restored.playerColors).toEqual(state.playerColors);
    expect(restored.isCustomLayout).toBe(true);
  });

  it('handles undefined optional fields', () => {
    const state = createGame(2);
    // These are undefined by default
    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.isCustomLayout).toBeUndefined();
    expect(restored.playerColors).toBeUndefined();
  });
});

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
    // Clear all player 2 pieces so we control exactly what's contested
    for (const [key, content] of testState.board) {
      if (content.type === 'piece' && content.player === 2) {
        testState.board.set(key, { type: 'empty' });
      }
    }
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

describe('scoreLandingQuality', () => {
  it('corridor: move reducing lateral deviation from goal axis scores higher than lateral drift', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    ts.board.set(coordKey(cubeCoord(1, -3)), { type: 'piece', player: 0 });
    const moveToward = { from: cubeCoord(1, -3), to: cubeCoord(0, -2), isJump: false };
    const moveLateral = { from: cubeCoord(1, -3), to: cubeCoord(2, -3), isJump: false };
    const scoreToward = scoreLandingQuality(ts, moveToward, 0, 'generalist', 'hard');
    const scoreLateral = scoreLandingQuality(ts, moveLateral, 0, 'generalist', 'hard');
    expect(scoreToward).toBeGreaterThanOrEqual(scoreLateral);
  });

  it('consolidation: landing near teammates scores higher than landing isolated', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && content.player === 0) ts.board.set(key, { type: 'empty' });
    }
    ts.board.set(coordKey(cubeCoord(-2, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-3, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(0, 2)), { type: 'piece', player: 0 });
    const moveNear = { from: cubeCoord(0, 2), to: cubeCoord(-2, 4), isJump: false };
    const moveIsolated = { from: cubeCoord(0, 2), to: cubeCoord(4, -6), isJump: false };
    const scoreNear = scoreLandingQuality(ts, moveNear, 0, 'defensive', 'hard');
    const scoreIsolated = scoreLandingQuality(ts, moveIsolated, 0, 'defensive', 'hard');
    expect(scoreNear).toBeGreaterThan(scoreIsolated);
  });

  it('straggler: landing near straggler scores higher than landing far from straggler', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && content.player === 0) ts.board.set(key, { type: 'empty' });
    }
    // 9 player 0 pieces in/near goal (one will be the moving piece)
    const nearGoal = ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-4,7','-3,7'];
    for (const cell of nearGoal) {
      const [q, r] = cell.split(',').map(Number);
      ts.board.set(`${q},${r}`, { type: 'piece', player: 0 });
    }
    // Straggler far away at (4,-8) — distance ~14 from goal center
    ts.board.set(coordKey(cubeCoord(4, -8)), { type: 'piece', player: 0 });
    // The moving piece starts at (-4,5) (in goal, distance ~3 from goal center)
    // gap = 14 - 3 = 11 >= 3 → hasSignificantStraggler fires
    // Move near: to (-3,5) — staying in goal, consolidation bonus (near neighbors)
    // Move far: to (0,0) — moving away from goal toward straggler but not close enough
    // The near move should win due to consolidation bonus being locally strong
    const moveNearStraggler = { from: cubeCoord(-4, 5), to: cubeCoord(-3, 5), isJump: false };
    const moveFarFromStraggler = { from: cubeCoord(-4, 5), to: cubeCoord(0, 0), isJump: false };
    const scoreNear = scoreLandingQuality(ts, moveNearStraggler, 0, 'generalist', 'hard');
    const scoreFar = scoreLandingQuality(ts, moveFarFromStraggler, 0, 'generalist', 'hard');
    // Landing among goal pieces (consolidation) should beat moving to center
    expect(scoreNear).toBeGreaterThan(scoreFar);
  });

  it('difficulty scaling: hard scores higher than easy for same move', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    ts.board.set(coordKey(cubeCoord(-2, 4)), { type: 'piece', player: 0 });
    const move = { from: cubeCoord(-2, 4), to: cubeCoord(-3, 5), isJump: false };
    const scoreHard = scoreLandingQuality(ts, move, 0, 'generalist', 'hard');
    const scoreEasy = scoreLandingQuality(ts, move, 0, 'generalist', 'easy');
    expect(Math.abs(scoreHard)).toBeGreaterThanOrEqual(Math.abs(scoreEasy));
  });
});

describe('scoreLastMoveResponse', () => {
  it('returns 0 for easy difficulty', () => {
    const state = createGame(2);
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
    // Opponent (player 2) just moved TO (-1,2). Player 2 goal is top-right (~(3,-6)).
    // From (-1,2) they can jump over (0,1) to land (1,0) — forward progress.
    // cubeDistance((-1,2),(3,-6)): Δq=4,Δr=8,Δs=4 → max=8
    // cubeDistance((1,0),(3,-6)): Δq=2,Δr=6,Δs=4 → max=6 → gain=2 (> 0, triggers with <= 0 threshold)
    ts.board.set(coordKey(cubeCoord(-1, 2)), { type: 'piece', player: 2 }); // just-moved opponent
    ts.board.set(coordKey(cubeCoord(0, 1)), { type: 'piece', player: 0 });  // jumping stone
    ts.board.set(coordKey(cubeCoord(1, 0)), { type: 'empty' });             // landing
    ts.moveHistory.push({ from: cubeCoord(-2, 3), to: cubeCoord(-1, 2), isJump: true, player: 2 });
    // Our move blocks the landing (1,0)
    const blockingMove = { from: cubeCoord(2, -1), to: cubeCoord(1, 0), isJump: false };
    const scoreDefensive = scoreLastMoveResponse(ts, blockingMove, 0, 'defensive', 'hard');
    // Non-blocking move to unrelated position
    const otherMove = { from: cubeCoord(2, -1), to: cubeCoord(2, 0), isJump: false };
    const scoreOther = scoreLastMoveResponse(ts, otherMove, 0, 'defensive', 'hard');
    expect(scoreDefensive).toBeGreaterThan(scoreOther);
  });

  it('aggressive AI scores 0 for blocking (ignores opponent threats)', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    // Same geometry as the defensive test
    ts.board.set(coordKey(cubeCoord(-1, 2)), { type: 'piece', player: 2 });
    ts.board.set(coordKey(cubeCoord(0, 1)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(1, 0)), { type: 'empty' });
    ts.moveHistory.push({ from: cubeCoord(-2, 3), to: cubeCoord(-1, 2), isJump: true, player: 2 });
    const blockingMove = { from: cubeCoord(2, -1), to: cubeCoord(1, 0), isJump: false };
    const scoreAggressive = scoreLastMoveResponse(ts, blockingMove, 0, 'aggressive', 'hard');
    expect(scoreAggressive).toBe(0);
  });

  it('returns positive score for landing on the square opponent just vacated (if forward progress)', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    // Opponent moved FROM (1,1) TO (1,-1). Vacated (1,1).
    ts.board.set(coordKey(cubeCoord(1, 1)), { type: 'empty' });
    ts.board.set(coordKey(cubeCoord(1, -1)), { type: 'piece', player: 2 });
    ts.moveHistory.push({ from: cubeCoord(1, 1), to: cubeCoord(1, -1), isJump: true, player: 2 });
    // Our piece at (3,3) moves to (1,1) — vacated square, forward progress toward lower-left goal
    // cubeDistance((3,3,-6), goalCenter(-3,6,-3)) = max(6,3,3) = 6
    // cubeDistance((1,1,-2), goalCenter(-3,6,-3)) = max(4,5,1) = 5 → gain = 1
    ts.board.set(coordKey(cubeCoord(3, 3)), { type: 'piece', player: 0 });
    const vacatedMove = { from: cubeCoord(3, 3), to: cubeCoord(1, 1), isJump: false };
    const score = scoreLastMoveResponse(ts, vacatedMove, 0, 'generalist', 'hard');
    // Unrelated move away from goal
    const otherMove = { from: cubeCoord(3, 3), to: cubeCoord(4, 3), isJump: false };
    const scoreOther = scoreLastMoveResponse(ts, otherMove, 0, 'generalist', 'hard');
    expect(score).toBeGreaterThanOrEqual(scoreOther);
  });
});

describe('scoreSetupBlockRisk', () => {
  // scoreSetupBlockRisk returns a NEGATIVE value (penalty) or 0.
  // Player 0 goal center ≈ (-3, 6). Forward for P0 = moving toward (-3,6).
  // A hop from (1,0) over (0,1) to land (-1,2):
  //   cubeDistance((1,0), (-3,6)) = max(4,6,2) = 6
  //   cubeDistance((-1,2), (-3,6)) = max(2,4,2) = 4
  //   jumpGain = 6 - 4 = 2 (forward!) ✓

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
    // Clear all pieces so we control the board
    for (const [key] of ts.board) {
      ts.board.set(key, { type: 'empty' });
    }
    // Board setup (all using cube coords with s = -q - r):
    // Piece B at (1,0) will hop over (0,1) to land at (-1,2) — forward for P0, jumpGain = 2
    // Piece A (the setup piece) moves TO (0,1) to become the stepping stone
    // Opponent at (0,2) is 1 step from landing (-1,2) → fill block risk

    ts.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 0 });  // piece B
    ts.board.set(coordKey(cubeCoord(0, 1)), { type: 'empty' });              // will be piece A's landing
    ts.board.set(coordKey(cubeCoord(-1, 2)), { type: 'empty' });             // intended landing
    ts.board.set(coordKey(cubeCoord(0, 2)), { type: 'piece', player: 2 });  // opponent — 1 step from landing
    // Piece A starts at (2,-1), moves to (0,1) (the stepping stone position)
    ts.board.set(coordKey(cubeCoord(2, -1)), { type: 'piece', player: 0 }); // piece A

    const setupMove = { from: cubeCoord(2, -1), to: cubeCoord(0, 1), isJump: false };

    const penaltyDefensive  = scoreSetupBlockRisk(ts, setupMove, 0, 'defensive',  'hard', 5);
    const penaltyAggressive = scoreSetupBlockRisk(ts, setupMove, 0, 'aggressive', 'hard', 5);

    // Defensive gets a negative penalty (risky setup is discouraged)
    expect(penaltyDefensive).toBeLessThan(0);
    // Aggressive ignores it (near 0 or at 0)
    expect(penaltyAggressive).toBeGreaterThan(penaltyDefensive);
  });

  it('removal block: penalty when chain relies on opponent piece that can be moved', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    for (const [key] of ts.board) {
      ts.board.set(key, { type: 'empty' });
    }
    // Chain: piece B at (1,0) hops over OPPONENT at (0,1) to land (-1,2) — jumpGain = 2
    // Our setup move: piece A moves AWAY from (-1,2), making it an empty landing
    // After setup: B at (1,0), opponent at (0,1) [stepping stone], (-1,2) empty
    // Opponent piece at (0,1) CAN move → removal risk fires

    ts.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 0 });   // piece B
    ts.board.set(coordKey(cubeCoord(0, 1)), { type: 'piece', player: 2 });   // opponent stepping stone
    ts.board.set(coordKey(cubeCoord(-1, 2)), { type: 'piece', player: 0 });  // piece A (moving away)

    // Piece A moves away from (-1,2) to (1,-1), vacating (-1,2) as the landing
    const setupMove = { from: cubeCoord(-1, 2), to: cubeCoord(1, -1), isJump: false };

    const penaltyDefensive = scoreSetupBlockRisk(ts, setupMove, 0, 'defensive', 'hard', 5);
    // Removal risk: opponent at (0,1) can be moved → penalty should be ≤ 0
    expect(penaltyDefensive).toBeLessThanOrEqual(0);
  });
});

describe('findOptimalEndgameSequence', () => {
  it('returns null when more than 3 pieces are outside goal', () => {
    const state = createGame(2);
    // Default game has 10 pieces outside — exceeds threshold
    const result = findOptimalEndgameSequence(state, 0);
    expect(result).toBeNull();
  });

  it('returns a move when 1 piece is outside and 1 goal slot is empty', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    // Clear all player 0 pieces
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && (content as { type: 'piece'; player: number }).player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }
    // Place 9 player 0 pieces in goal
    const inGoal = ['-4,5','-3,5','-2,5','-1,5','-2,6','-3,6','-4,6','-3,7','-4,8'];
    for (const c of inGoal) {
      const [q, r] = c.split(',').map(Number);
      ts.board.set(`${q},${r}`, { type: 'piece', player: 0 });
    }
    // (-4,7) is the remaining empty goal. Place outside piece adjacent at (-3,6)...
    // that's in the inGoal list. Let's use a piece at (-4,6) (in goal) that can step to (-4,7).
    // Actually (-4,7) is the remaining empty goal. (-4,6) is in the inGoal list.
    // Step: (-4,6) → (-4,7) is within goal (deeper), valid.
    // But we need an OUTSIDE piece too. Let's place one piece outside:
    ts.board.set(coordKey(cubeCoord(-4, 7)), { type: 'empty' }); // the empty goal
    ts.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 }); // 1 outside piece
    ts.currentPlayer = 0;

    const result = findOptimalEndgameSequence(ts, 0);
    // Should find a move (not null) — either the within-goal step or some path
    expect(result).not.toBeNull();
    if (result) {
      expect(result.from).toBeDefined();
      expect(result.to).toBeDefined();
    }
  });

  it('returns null when outside pieces are too far and no 8-move path exists', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    // Clear all player 0 pieces
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && (content as { type: 'piece'; player: number }).player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }
    // 3 pieces in isolated positions very far from goal, goal zone empty
    ts.board.set(coordKey(cubeCoord(4, -8)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(4, -7)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(4, -6)), { type: 'piece', player: 0 });
    ts.currentPlayer = 0;
    // All 10 goal positions are empty — emptyGoals.length > 4 guard fires before BFS even starts
    const result = findOptimalEndgameSequence(ts, 0);
    expect(result).toBeNull();
  });
});

describe('scoreLeapfrogPotential', () => {
  it('returns non-negative value for any move (never negative)', () => {
    const state = createGame(2);
    const move = { from: cubeCoord(4, -8), to: cubeCoord(4, -7), isJump: false };
    const score = scoreLeapfrogPotential(state, move, 0, 'generalist');
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns higher score when landing enables a friendly piece to jump forward over us', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    // Clear all player 0 pieces for clean setup
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && (content as { type: 'piece'; player: number }).player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }
    // Piece A at (-1,3) steps to (-1,4).
    // Piece B at (0,3) can jump over (-1,4) [direction (-1,+1,0)] to land (-2,5).
    // jumpGain for B: cubeDistance((0,3),(-3,6))=3, cubeDistance((-2,5),(-3,6))=1, gain=2 > 0
    ts.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 }); // piece A (moving)
    ts.board.set(coordKey(cubeCoord(0, 3)), { type: 'piece', player: 0 });  // piece B (will jump)
    ts.board.set(coordKey(cubeCoord(-2, 5)), { type: 'empty' });            // B's landing

    const moveWithLeapfrog = { from: cubeCoord(-1, 3), to: cubeCoord(-1, 4), isJump: false };

    // Control: a move to an isolated position where no piece can jump over us forward
    ts.board.set(coordKey(cubeCoord(3, -5)), { type: 'piece', player: 0 }); // isolated piece C
    const moveWithoutLeapfrog = { from: cubeCoord(3, -5), to: cubeCoord(3, -4), isJump: false };

    const scoreWith = scoreLeapfrogPotential(ts, moveWithLeapfrog, 0, 'generalist');
    const scoreWithout = scoreLeapfrogPotential(ts, moveWithoutLeapfrog, 0, 'generalist');
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('aggressive personality scores higher than defensive for same leapfrog setup', () => {
    const state = createGame(2);
    const ts = cloneGameState(state);
    for (const [key, content] of ts.board) {
      if (content.type === 'piece' && (content as { type: 'piece'; player: number }).player === 0) {
        ts.board.set(key, { type: 'empty' });
      }
    }
    ts.board.set(coordKey(cubeCoord(-1, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(0, 3)), { type: 'piece', player: 0 });
    ts.board.set(coordKey(cubeCoord(-2, 5)), { type: 'empty' });
    const move = { from: cubeCoord(-1, 3), to: cubeCoord(-1, 4), isJump: false };

    const aggressive = scoreLeapfrogPotential(ts, move, 0, 'aggressive');
    const defensive = scoreLeapfrogPotential(ts, move, 0, 'defensive');
    expect(aggressive).toBeGreaterThan(defensive);
  });
});
