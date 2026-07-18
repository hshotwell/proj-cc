import { describe, it, expect } from 'vitest';
import { isCellAttacked, isInCheck } from '@/game/hexchess/check';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2],
    eliminated: [],
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

function piece(
  id: string,
  player: 0 | 1 | 2,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

// ─── isCellAttacked ───────────────────────────────────────────────────────────

describe('isCellAttacked — rook', () => {
  it('attacks along an open file (empty board)', () => {
    // Player 1 rook at (0,0) — should attack (3,0) along edge direction (+1,0)
    const rook = piece('r', 2, 'rook', 0, 0);
    const s = stateWith([rook]);
    expect(isCellAttacked(s, cubeCoord(3, 0), 2)).toBe(true);
  });

  it('attacks the cell containing the blocking piece but NOT beyond', () => {
    // Rook at (0,0), blocker at (2,0), target at (3,0)
    const rook    = piece('r', 2, 'rook', 0, 0);
    const blocker = piece('b', 0, 'knight', 2, 0);
    const s = stateWith([rook, blocker]);
    expect(isCellAttacked(s, cubeCoord(2, 0), 2)).toBe(true);   // blocker cell IS attacked
    expect(isCellAttacked(s, cubeCoord(3, 0), 2)).toBe(false);  // behind blocker — NOT attacked
  });

  it('attacks a cell occupied by own piece (defends it)', () => {
    // Own rook defends own knight — own-piece cells are included in attack set
    const rook   = piece('r', 2, 'rook', 0, 0);
    const friend = piece('f', 2, 'knight', 2, 0);
    const s = stateWith([rook, friend]);
    expect(isCellAttacked(s, cubeCoord(2, 0), 2)).toBe(true);
  });
});

describe('isCellAttacked — soldier', () => {
  it('attacks its 2 forward-edge cells only (player 0)', () => {
    // Player 0 soldier at (0,0): forward diagonal = (-1,2), forward edges = (0,1) and (-1,1)
    const s0 = piece('s', 0, 'soldier', 0, 0);
    const state = stateWith([s0]);
    // The two forward-edge cells should be attacked
    expect(isCellAttacked(state, cubeCoord(0, 1), 0)).toBe(true);
    expect(isCellAttacked(state, cubeCoord(-1, 1), 0)).toBe(true);
    // The forward-diagonal cell should NOT be an attack cell
    expect(isCellAttacked(state, cubeCoord(-1, 2), 0)).toBe(false);
  });

  it('attacks its 2 forward-edge cells even when those cells are empty', () => {
    const s1 = piece('s', 2, 'soldier', 0, 0);
    const state = stateWith([s1]);
    // Player 1 forward diagonal = (1,-2), forward edges = (0,-1) and (1,-1)
    expect(isCellAttacked(state, cubeCoord(0, -1), 2)).toBe(true);
    expect(isCellAttacked(state, cubeCoord(1, -1), 2)).toBe(true);
    // The forward-diagonal cell NOT an attack cell
    expect(isCellAttacked(state, cubeCoord(1, -2), 2)).toBe(false);
  });
});

describe('isCellAttacked — pawn (unified rule: attacks flanking capture cells)', () => {
  it('attacks its 2 flanking capture cells, not its forward move cell (player 0)', () => {
    // Player 0 (point-forward on the standard board): forward diagonal = (-1,2),
    // capture cells = the flanking edges (0,1) and (-1,1).
    const p0 = piece('p', 0, 'pawn', 0, 0);
    const state = stateWith([p0]);
    expect(isCellAttacked(state, cubeCoord(-1, 2), 0)).toBe(false); // move cell — NOT attacked
    expect(isCellAttacked(state, cubeCoord(0, 1), 0)).toBe(true);   // capture cells — attacked
    expect(isCellAttacked(state, cubeCoord(-1, 1), 0)).toBe(true);
  });

  it('attacks its capture cells even when they are empty (player 2)', () => {
    const p1 = piece('p', 2, 'pawn', 0, 0);
    const state = stateWith([p1]);
    // Player 2 forward diagonal = (1,-2); capture cells = (0,-1) and (1,-1)
    expect(isCellAttacked(state, cubeCoord(1, -2), 2)).toBe(false);
    expect(isCellAttacked(state, cubeCoord(0, -1), 2)).toBe(true);
    expect(isCellAttacked(state, cubeCoord(1, -1), 2)).toBe(true);
  });
});

describe('isCellAttacked — king and knight', () => {
  it('king attacks all 12 adjacent cells including own-piece cells', () => {
    const k = piece('k', 0, 'king', 0, 0);
    const s = stateWith([k]);
    // 6 edge + 6 diagonal = 12 attack cells
    expect(isCellAttacked(s, cubeCoord(1, -1), 0)).toBe(true);
    expect(isCellAttacked(s, cubeCoord(2, -1), 0)).toBe(true);
    expect(isCellAttacked(s, cubeCoord(0, 3), 0)).toBe(false); // not adjacent
  });

  it('king attacks a cell occupied by own piece (defends it)', () => {
    const k      = piece('k', 0, 'king', 0, 0);
    const friend = piece('f', 0, 'rook', 1, -1);
    const s = stateWith([k, friend]);
    expect(isCellAttacked(s, cubeCoord(1, -1), 0)).toBe(true);
  });

  it('knight attacks its 12 leap cells regardless of intervening pieces', () => {
    // Use a blocker that does NOT itself attack (0,1) — an enemy piece is fine,
    // but we want to isolate just the knight.  Put only the knight on the board
    // and verify (2,1) IS attacked but (0,2) (not a leap) is NOT.
    const n = piece('n', 2, 'knight', 0, 0);
    const s = stateWith([n]);
    expect(isCellAttacked(s, cubeCoord(2, 1), 2)).toBe(true);  // knight leap target
    expect(isCellAttacked(s, cubeCoord(0, 2), 2)).toBe(false); // NOT a knight leap target
  });
});

describe('isCellAttacked — bishop / queen', () => {
  it('bishop attacks along diagonal rays', () => {
    const b = piece('b', 0, 'bishop', 0, 0);
    const s = stateWith([b]);
    // Diagonal direction (2,-1) — should reach (4,-2) if on board
    expect(isCellAttacked(s, cubeCoord(2, -1), 0)).toBe(true);
    expect(isCellAttacked(s, cubeCoord(4, -2), 0)).toBe(true);
  });

  it('queen attacks edge and diagonal rays', () => {
    const q = piece('q', 2, 'queen', 0, 0);
    const s = stateWith([q]);
    expect(isCellAttacked(s, cubeCoord(3, 0), 2)).toBe(true);  // edge ray
    expect(isCellAttacked(s, cubeCoord(2, -1), 2)).toBe(true); // diagonal ray
  });
});

// ─── isInCheck ────────────────────────────────────────────────────────────────

describe('isInCheck', () => {
  it('king on open file with enemy rook ahead is in check', () => {
    // Player 0 king at (0,0), player 1 rook at (3,0) — edge direction (+1,0)
    const king = piece('k0', 0, 'king', 0, 0);
    const rook = piece('r1', 2, 'rook', 3, 0);
    const s = stateWith([king, rook]);
    expect(isInCheck(s, 0)).toBe(true);
  });

  it('king shielded by own piece is NOT in check', () => {
    // Player 0 king at (0,0), own rook at (1,0) as shield, enemy rook at (3,0)
    const king   = piece('k0', 0, 'king', 0, 0);
    const shield = piece('sh', 0, 'rook', 1, 0);
    const rook   = piece('r1', 2, 'rook', 3, 0);
    const s = stateWith([king, shield, rook]);
    expect(isInCheck(s, 0)).toBe(false);
  });

  it('king threatened by enemy knight is in check', () => {
    // Player 1 king at (0,0), player 0 knight at (2,1) — a valid leap target
    const king   = piece('k1', 2, 'king', 0, 0);
    const knight = piece('n0', 0, 'knight', 2, 1);
    const s = stateWith([king, knight]);
    expect(isInCheck(s, 2)).toBe(true);
  });

  it('returns false when no king exists (no crash)', () => {
    const rook = piece('r', 2, 'rook', 0, 0);
    const s = stateWith([rook]);
    expect(isInCheck(s, 0)).toBe(false);
  });

  it('same-color pieces do not put king in check', () => {
    const king   = piece('k0', 0, 'king', 0, 0);
    const friend = piece('f',  0, 'rook', 3, 0);
    const s = stateWith([king, friend]);
    expect(isInCheck(s, 0)).toBe(false);
  });
});
