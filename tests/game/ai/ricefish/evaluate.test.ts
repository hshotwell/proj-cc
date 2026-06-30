import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { applyMove, getGoalPositions } from '@/game/state';
import {
  ricefishScore,
  playerDistance,
  MATE,
  createGoalCentroidCache,
} from '@/game/ai/ricefish/evaluate';
import type { GameState, Move, PlayerIndex } from '@/types/game';

function freshGame(activePlayers: PlayerIndex[] = [0, 2]): GameState {
  return createGame(2, activePlayers);
}

describe('playerDistance', () => {
  it('is positive for the starting position', () => {
    const state = freshGame();
    expect(playerDistance(state, 0)).toBeGreaterThan(0);
    expect(playerDistance(state, 2)).toBeGreaterThan(0);
  });

  it('is symmetric for symmetric 2-player setup', () => {
    const state = freshGame();
    // Standard 2-player game: Red (top) and Cyan (bottom) are mirror images,
    // so their total distances to their respective goal centroids should match.
    expect(playerDistance(state, 0)).toBe(playerDistance(state, 2));
  });

  it('decreases after moving toward goal', () => {
    const state = freshGame();
    const before = playerDistance(state, 0);
    // Red's back row at (q=4, r=-8) tip. A single forward step from a back
    // piece should reduce total distance by exactly 1 (only one piece moved
    // and it moved one hex closer to the centroid).
    const allMoves = collectStepsFor(state, 0);
    const forwardSteps = allMoves.filter((m) => {
      const dBefore = chebDistToCentroid0(state, m.from);
      const dAfter = chebDistToCentroid0(state, m.to);
      return dAfter < dBefore;
    });
    expect(forwardSteps.length).toBeGreaterThan(0);
    const after = playerDistance(applyMove(state, forwardSteps[0]), 0);
    expect(after).toBeLessThan(before);
  });
});

describe('endgame regression — no oscillation when nearly home', () => {
  // Captured from a real game: Ricefish reached 8/10 pieces in goal but the
  // remaining two pieces (player 2, "Cyan") sat near the goal triangle and
  // oscillated between (1,-4) and (3,-4) because the old centroid eval gave
  // both positions an identical score. Under the nearest-unfilled-goal eval
  // the position with the piece at (3,-4) must score strictly better.
  it('prefers (3,-4) over (1,-4) for the wandering piece', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);

    // Clear every player-2 piece, then place ten pieces in the configuration
    // observed in the bug report.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    const placeP2 = (pieces: Array<[number, number]>) => {
      for (const [q, r] of pieces) {
        board.set(`${q},${r}`, { type: 'piece', player: 2 });
      }
    };

    // Variant A: piece at (3,-4) — one hex from empty goal cell (4,-5).
    const piecesA: Array<[number, number]> = [
      [3, -4], [2, -4], [1, -5], [2, -5], [3, -5],
      [4, -6], [2, -6], [3, -6], [3, -7], [4, -7],
    ];
    placeP2(piecesA);
    const stateA: GameState = { ...base, board: new Map(board) };

    // Variant B: piece at (1,-4) — four hexes from any empty goal cell.
    for (const [q, r] of piecesA) board.set(`${q},${r}`, { type: 'empty' });
    const piecesB: Array<[number, number]> = [
      [1, -4], [2, -4], [1, -5], [2, -5], [3, -5],
      [4, -6], [2, -6], [3, -6], [3, -7], [4, -7],
    ];
    placeP2(piecesB);
    const stateB: GameState = { ...base, board: new Map(board) };

    expect(playerDistance(stateA, 2)).toBeLessThan(playerDistance(stateB, 2));
    expect(ricefishScore(stateA, 2, 'generalist')).toBeGreaterThan(
      ricefishScore(stateB, 2, 'generalist'),
    );
  });

  it('rewards in-goal pieces by depth (entry row = 0, deeper > 0)', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    for (const [k, v] of board) {
      if (v.type === 'piece') board.set(k, { type: 'empty' });
    }
    // Single P2 piece on the entry row (depth 0): contributes nothing.
    board.set('3,-5', { type: 'piece', player: 2 });
    let state: GameState = { ...base, board };
    expect(playerDistance(state, 2)).toBe(0);
    // Move the same piece to a deeper cell (3,-6) = depth 1: ownDepthBonus
    // pushes playerDistance negative by OWN_DEPTH_WEIGHT (1).
    const board2 = new Map(base.board);
    for (const [k, v] of board2) {
      if (v.type === 'piece') board2.set(k, { type: 'empty' });
    }
    board2.set('3,-6', { type: 'piece', player: 2 });
    state = { ...base, board: board2 };
    expect(playerDistance(state, 2)).toBe(-1);
    // Tip cell (4,-8) = depth 3: contributes -3.
    const board3 = new Map(base.board);
    for (const [k, v] of board3) {
      if (v.type === 'piece') board3.set(k, { type: 'empty' });
    }
    board3.set('4,-8', { type: 'piece', player: 2 });
    state = { ...base, board: board3 };
    expect(playerDistance(state, 2)).toBe(-3);
  });

  it('penalizes blockers more when they sit deeper in my goal', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    for (const [k, v] of board) {
      if (v.type === 'piece') board.set(k, { type: 'empty' });
    }
    // One P2 piece in goal at (3,-6) depth 1 (ownDepthBonus = 1), two P0
    // blockers: (4,-8) depth 3 and (4,-5) depth 0.
    board.set('3,-6', { type: 'piece', player: 2 });
    board.set('4,-8', { type: 'piece', player: 0 });
    board.set('4,-5', { type: 'piece', player: 0 });
    const state: GameState = { ...base, board };
    // filledFraction = 3 / 10 (1 own + 2 blockers in 10-cell goal) = 0.3 → mult 1.0
    // blockerTerm = 1.0 × (BLOCKER_PENALTY*2 + BLOCKER_DEPTH_WEIGHT*(3+0)) = 12
    // ownDepthTerm = OWN_DEPTH_WEIGHT * 1 = 1
    // total = 12 - 1 = 11
    expect(playerDistance(state, 2)).toBe(11);
  });

  it('depth gradient: shifting a blocker shallower lowers playerDistance', () => {
    // A useful intermediate-step regression: with one P2 piece on the
    // entry row and one P0 blocker, moving the blocker from depth 3 → 0
    // (over four hypothetical states) should strictly decrease distance.
    const base = freshGame([0, 2]);
    const distFor = (blockerCoord: [number, number]) => {
      const board = new Map(base.board);
      for (const [k, v] of board) {
        if (v.type === 'piece') board.set(k, { type: 'empty' });
      }
      board.set('3,-5', { type: 'piece', player: 2 }); // P2 fixed
      board.set(`${blockerCoord[0]},${blockerCoord[1]}`, { type: 'piece', player: 0 });
      return playerDistance({ ...base, board }, 2);
    };
    const d3 = distFor([4, -8]); // depth 3
    const d2 = distFor([3, -7]); // depth 2
    const d1 = distFor([3, -6]); // depth 1
    const d0 = distFor([2, -5]); // depth 0
    expect(d3).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThan(d0);
  });
});

describe('ricefishScore', () => {
  it('is zero from a symmetric start under the generalist personality', () => {
    const state = freshGame();
    // playerDistance(0) === playerDistance(2) ⇒ score = 1*opp - own = 0
    expect(ricefishScore(state, 0, 'generalist')).toBe(0);
    expect(ricefishScore(state, 2, 'generalist')).toBe(0);
  });

  it('uses defensive weighting > 1 to amplify opponent distance', () => {
    const state = freshGame();
    // From a symmetric start, generalist = 0. Defensive multiplies opp's
    // distance by 2 while leaving ours alone, so defensive should be positive.
    expect(ricefishScore(state, 0, 'defensive')).toBeGreaterThan(0);
  });

  it('uses aggressive weighting < 1 to dampen opponent terms', () => {
    const state = freshGame();
    expect(ricefishScore(state, 0, 'aggressive')).toBeLessThan(0);
  });

  it('returns MATE for the winning player after a win', () => {
    // Construct a state where player 0 has all pieces in their goal.
    const state = freshGame();
    const winning = forceWin(state, 0);
    expect(ricefishScore(winning, 0, 'generalist')).toBe(MATE);
    expect(ricefishScore(winning, 2, 'generalist')).toBe(-MATE);
  });

  it('respects the centroid cache (no observable behavior change)', () => {
    const state = freshGame();
    const cache = createGoalCentroidCache();
    const a = ricefishScore(state, 0, 'generalist', cache);
    const b = ricefishScore(state, 0, 'generalist', cache);
    expect(a).toBe(b);
    expect(cache.size).toBe(2); // both players' centroids memoized
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function collectStepsFor(state: GameState, player: PlayerIndex): Move[] {
  // Inlined: any step (not jump) by the given player. We don't import the AI's
  // getAllValidMoves here to keep this test independent of search code.
  const out: Move[] = [];
  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player !== player) continue;
    const [q, r] = key.split(',').map(Number);
    const dirs = [
      [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
    ] as const;
    for (const [dq, dr] of dirs) {
      const nq = q + dq, nr = r + dr;
      const nKey = `${nq},${nr}`;
      const nContent = state.board.get(nKey);
      if (nContent?.type === 'empty') {
        out.push({
          from: { q, r, s: -q - r },
          to: { q: nq, r: nr, s: -nq - nr },
          isJump: false,
        });
      }
    }
  }
  return out;
}

function chebDistToCentroid0(state: GameState, c: { q: number; r: number }): number {
  // Goal centroid for player 0 in standard 2-player game is symmetric of Red's
  // home — centered around (q=-4, r=8). We approximate by reading from the
  // shared playerDistance computation: distance to centroid.
  // For a single point we use cubeDistance to the same centroid.
  const cent = { q: -4, r: 8, s: -4 };
  return Math.max(
    Math.abs(c.q - cent.q),
    Math.abs(c.r - cent.r),
    Math.abs(-c.q - c.r - cent.s),
  );
}

function forceWin(state: GameState, player: PlayerIndex): GameState {
  // Hack a state where every piece of `player` sits on a goal cell. This
  // bypasses move legality — it's a test fixture, not a real game position.
  const goalKeys = Array.from(state.board.keys()).filter((k) => {
    const [q, r] = k.split(',').map(Number);
    return chebDistToCentroid0(state, { q, r }) <= 2; // near the goal centroid
  }).slice(0, 10);
  const newBoard = new Map(state.board);
  // Clear player's existing pieces.
  for (const [k, v] of newBoard) {
    if (v.type === 'piece' && v.player === player) newBoard.set(k, { type: 'empty' });
  }
  // The goal positions for player 0 are exactly the home positions of player
  // 2 (and vice versa); placing all of `player`'s pieces there satisfies the
  // win condition.
  void goalKeys;
  for (const pos of getGoalPositions(player)) {
    newBoard.set(`${pos.q},${pos.r}`, { type: 'piece', player });
  }
  return { ...state, board: newBoard };
}
