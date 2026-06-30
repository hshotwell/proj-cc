import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { applyMove, getGoalPositions } from '@/game/state';
import {
  ricefishScore,
  playerDistance,
  MATE,
  createGoalCentroidCache,
  OBSTRUCTION_PENALTY,
} from '@/game/ai/ricefish/evaluate';
import type { CellContent, GameState, Move, PlayerIndex } from '@/types/game';

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

  it('treats a piece sitting on a goal cell as distance 0', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    // Clear all of player 2, then place a single piece on a goal cell.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    board.set('3,-6', { type: 'piece', player: 2 }); // (3,-6) is a goal cell
    const state: GameState = { ...base, board };
    expect(playerDistance(state, 2)).toBe(0);
  });
});

describe('playerDistance obstruction penalty', () => {
  // P0's home cells (= P2's goal cells). createGame seeds these with P0 pieces,
  // so test fixtures must explicitly empty any cell they want as "unfilled."
  const P0_HOME: Array<[number, number]> = [
    [4, -8], [3, -7], [4, -7], [2, -6], [3, -6], [4, -6],
    [1, -5], [2, -5], [3, -5], [4, -5],
  ];

  function clearAllP0AndP2(board: Map<string, CellContent>) {
    for (const [k, v] of board) {
      if (v.type === 'piece' && (v.player === 0 || v.player === 2)) {
        board.set(k, { type: 'empty' });
      }
    }
  }

  it('adds OBSTRUCTION_PENALTY when a matched goal cell holds an opponent', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    clearAllP0AndP2(board);
    // 9 of 10 goal cells filled with P2 (skip (4,-5)); 1 outside P2 at (4,-4).
    for (const [q, r] of P0_HOME) {
      if (q === 4 && r === -5) continue;
      board.set(`${q},${r}`, { type: 'piece', player: 2 });
    }
    board.set('4,-4', { type: 'piece', player: 2 });
    const empty: GameState = { ...base, board: new Map(board) };
    const distEmpty = playerDistance(empty, 2);

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
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    clearAllP0AndP2(board);
    // Fill 8 of the 10 goal cells (skip (4,-5) close and (4,-8) far).
    for (const [q, r] of P0_HOME) {
      if (q === 4 && (r === -5 || r === -8)) continue;
      board.set(`${q},${r}`, { type: 'piece', player: 2 });
    }
    // 1 outside P2 adjacent to (4,-5).
    board.set('4,-4', { type: 'piece', player: 2 });
    // Blocker on the FAR unfilled goal (4,-8); (4,-5) stays empty.
    board.set('4,-8', { type: 'piece', player: 0 });
    const withFarBlocker: GameState = { ...base, board: new Map(board) };

    const noBlockerBoard = new Map(board);
    noBlockerBoard.set('4,-8', { type: 'empty' });
    const noBlocker: GameState = { ...base, board: noBlockerBoard };

    expect(playerDistance(withFarBlocker, 2)).toBeCloseTo(
      playerDistance(noBlocker, 2), 5,
    );
  });

  it('stacks penalty for multiple obstructed pairs', () => {
    const base = freshGame([0, 2]);
    const board = new Map(base.board);
    clearAllP0AndP2(board);
    // 8 P2 in goal cells (skip (4,-5) and (4,-8)); 2 outside P2 pieces.
    for (const [q, r] of P0_HOME) {
      if (q === 4 && (r === -5 || r === -8)) continue;
      board.set(`${q},${r}`, { type: 'piece', player: 2 });
    }
    board.set('4,-4', { type: 'piece', player: 2 });
    board.set('5,-4', { type: 'piece', player: 2 });
    const noBlockers: GameState = { ...base, board: new Map(board) };

    const obsBoard = new Map(board);
    obsBoard.set('4,-5', { type: 'piece', player: 0 });
    obsBoard.set('4,-8', { type: 'piece', player: 0 });
    const twoBlockers: GameState = { ...base, board: obsBoard };

    const dEmpty = playerDistance(noBlockers, 2);
    const dObs = playerDistance(twoBlockers, 2);
    expect(dObs).toBeCloseTo(dEmpty + 2 * OBSTRUCTION_PENALTY, 5);
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
