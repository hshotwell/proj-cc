import { describe, it, expect } from 'vitest';
import type { HexChessState, HexPiece, HexMove, HexPlayerIndex } from '@/game/hexchess/state';
import { rulesModeOf } from '@/game/hexchess/state';
import { applyMove, pseudoMovesForPiece, eliminatePlayer } from '@/game/hexchess/moves';
import { legalMoves, isInCheck, filterLegal } from '@/game/hexchess/check';
import { nextLivingPlayer, livingPlayers } from '@/game/hexchess/board';
import { hashState } from '@/game/hexchess/zobrist';
import { cubeCoord } from '@/game/coordinates';

function piece(
  id: string,
  player: HexPlayerIndex,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

/** 3-seat state (seats 0, 3, 1 — the CC 3-player corners). */
function state3(pieces: HexPiece[], overrides?: Partial<HexChessState>): HexChessState {
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: 0,
    turnNumber: 1,
    activePlayers: [0, 3, 1],
    eliminated: [],
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
    ...overrides,
  };
}

function moveOf(state: HexChessState, pieceId: string, q: number, r: number): HexMove {
  const m = legalMoves(state).find(
    mv => mv.pieceId === pieceId && mv.to.q === q && mv.to.r === r,
  );
  if (!m) throw new Error(`no legal move ${pieceId} -> (${q},${r})`);
  return m;
}

describe('rules mode', () => {
  it('2 seats = checkmate mode, 3+ seats = king-capture mode', () => {
    const two = state3([], { activePlayers: [0, 2] });
    expect(rulesModeOf(two)).toBe('checkmate');
    expect(rulesModeOf(state3([]))).toBe('king-capture');
  });
});

describe('advisory check (king-capture mode)', () => {
  it('allows moving the king into an attacked cell', () => {
    // Seat-1 rook attacks the whole r=1 row through empty cells.
    const s = state3([
      piece('k0', 0, 'king', 0, 0),
      piece('r1', 1, 'rook', 5, 1),
      piece('k1', 1, 'king', -8, 4),
      piece('k3', 3, 'king', 4, 4),
    ]);
    const kingMoves = legalMoves(s).filter(m => m.pieceId === 'k0');
    // (0,1) is attacked by the rook but must still be a legal destination.
    expect(kingMoves.some(m => m.to.q === 0 && m.to.r === 1)).toBe(true);
  });

  it('the same move is filtered out in 2-player checkmate mode', () => {
    const s = state3(
      [
        piece('k0', 0, 'king', 0, 0),
        piece('r1', 2, 'rook', 5, 1),
        piece('k1', 2, 'king', -4, 8),
      ],
      { activePlayers: [0, 2] },
    );
    const kingMoves = legalMoves(s).filter(m => m.pieceId === 'k0');
    expect(kingMoves.some(m => m.to.q === 0 && m.to.r === 1)).toBe(false);
  });

  it('filterLegal is the identity in king-capture mode', () => {
    const s = state3([
      piece('k0', 0, 'king', 0, 0),
      piece('r1', 1, 'rook', 5, 1),
      piece('k1', 1, 'king', -8, 4),
      piece('k3', 3, 'king', 4, 4),
    ]);
    const pseudos = pseudoMovesForPiece(s, s.pieces[0]);
    expect(filterLegal(s, pseudos)).toEqual(pseudos);
  });
});

describe('king capture eliminates', () => {
  function afterElimination(): HexChessState {
    // Seat 0 rook captures seat 3's king.
    const s = state3([
      piece('r0', 0, 'rook', 0, 0),
      piece('k0', 0, 'king', 4, -8),
      piece('k3', 3, 'king', 3, 0),
      piece('b3', 3, 'bishop', 0, 4),
      piece('k1', 1, 'king', -8, 4),
      piece('r1', 1, 'rook', -5, 1),
    ]);
    return applyMove(s, moveOf(s, 'r0', 3, 0));
  }

  it('records the elimination and keeps the dead army on the board', () => {
    const next = afterElimination();
    expect(next.eliminated).toEqual([3]);
    expect(next.result).toBeNull(); // two seats still alive
    // King removed, bishop remains as a frozen obstacle.
    expect(next.pieces.find(p => p.id === 'k3')).toBeUndefined();
    expect(next.pieces.find(p => p.id === 'b3')).toBeDefined();
  });

  it('turn order skips the eliminated seat forever', () => {
    const next = afterElimination();
    // Turn order 0 -> 3 -> 1; with 3 dead, 0's move passes to 1.
    expect(next.currentPlayer).toBe(1);
    expect(nextLivingPlayer(next, 1)).toBe(0);
  });

  it('eliminated pieces generate no moves', () => {
    const next = afterElimination();
    const deadBishop = next.pieces.find(p => p.id === 'b3')!;
    expect(pseudoMovesForPiece(next, deadBishop)).toEqual([]);
  });

  it('eliminated pieces give no check', () => {
    // Dead seat-3 bishop "attacks" seat 1's king cell — but gives no check.
    const s = state3(
      [
        piece('k0', 0, 'king', 4, -8),
        piece('b3', 3, 'bishop', 1, 1), // diagonal (−2,1) reaches (−1,2)
        piece('k1', 1, 'king', -1, 2),
      ],
      { eliminated: [3], currentPlayer: 1 },
    );
    expect(isInCheck(s, 1)).toBe(false);
    // A living bishop in the same spot would give check.
    const alive = { ...s, eliminated: [] as HexPlayerIndex[] };
    expect(isInCheck(alive, 1)).toBe(true);
  });

  it('eliminated pieces are capturable and block sliders', () => {
    const s = state3(
      [
        piece('r0', 0, 'rook', 0, 0),
        piece('k0', 0, 'king', 4, -8),
        piece('b3', 3, 'bishop', 3, 0), // dead, on seat-0 rook's file
        piece('k1', 1, 'king', -8, 4),
      ],
      { eliminated: [3] },
    );
    const rookMoves = legalMoves(s).filter(m => m.pieceId === 'r0');
    // Can capture the dead bishop...
    const cap = rookMoves.find(m => m.to.q === 3 && m.to.r === 0);
    expect(cap?.capture?.pieceId).toBe('b3');
    // ...but cannot slide past it.
    expect(rookMoves.some(m => m.to.q === 4 && m.to.r === 0)).toBe(false);
  });

  it('capturing the second king ends the game with a last-standing win', () => {
    const s = state3(
      [
        piece('r0', 0, 'rook', 0, 0),
        piece('k0', 0, 'king', 4, -8),
        piece('k1', 1, 'king', 3, 0),
        piece('b3', 3, 'bishop', 0, 4), // seat 3 already dead
      ],
      { eliminated: [3] },
    );
    const next = applyMove(s, moveOf(s, 'r0', 3, 0));
    expect(next.eliminated).toEqual([3, 1]);
    expect(next.result).toEqual({ winner: 0, reason: 'king-capture' });
  });
});

describe('eliminatePlayer (resignation path)', () => {
  it('freezes the seat and passes the turn if it was theirs', () => {
    const s = state3([
      piece('k0', 0, 'king', 4, -8),
      piece('k3', 3, 'king', 4, 4),
      piece('k1', 1, 'king', -8, 4),
    ]);
    const next = eliminatePlayer(s, 0);
    expect(next.eliminated).toEqual([0]);
    expect(next.currentPlayer).toBe(3);
    expect(next.result).toBeNull();
    expect(livingPlayers(next)).toEqual([3, 1]);
  });

  it('declares the last survivor the winner', () => {
    const s = state3(
      [
        piece('k0', 0, 'king', 4, -8),
        piece('k1', 1, 'king', -8, 4),
      ],
      { eliminated: [3] },
    );
    const next = eliminatePlayer(s, 0);
    expect(next.result).toEqual({ winner: 1, reason: 'king-capture' });
  });
});

describe('multiplayer draws', () => {
  it('threefold repetition still draws among survivors', () => {
    const base = state3([
      piece('k0', 0, 'king', 0, -1),
      piece('k3', 3, 'king', 4, 4),
      piece('k1', 1, 'king', -8, 4),
    ]);
    // Precompute the post-move position hash and seed it at count 2.
    const post = state3(
      [
        piece('k0', 0, 'king', 0, 0),
        piece('k3', 3, 'king', 4, 4),
        piece('k1', 1, 'king', -8, 4),
      ],
      { currentPlayer: 3 },
    );
    const targetHash = hashState(post);
    const seeded = { ...base, positionHashes: { [targetHash]: 2 } };
    const next = applyMove(seeded, moveOf(seeded, 'k0', 0, 0));
    expect(next.result).toEqual({ winner: 'draw', reason: 'repetition' });
  });

  it('K vs K vs K does NOT end as insufficient material in king-capture mode', () => {
    const s = state3([
      piece('k0', 0, 'king', 0, -1),
      piece('k3', 3, 'king', 4, 4),
      piece('k1', 1, 'king', -8, 4),
    ]);
    const next = applyMove(s, moveOf(s, 'k0', 0, 0));
    expect(next.result).toBeNull();
  });
});
