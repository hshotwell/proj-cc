import { describe, it, expect } from 'vitest';
import { kingMoves, knightMoves } from '@/game/hexchess/moves';
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

describe('king moves', () => {
  it('reaches up to 12 nearby cells (6 edges + 6 diagonals) from center', () => {
    const k: HexPiece = { id: 'K', player: 0, type: 'king', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([k]);
    const targets = kingMoves(s, k);
    expect(targets).toHaveLength(12);
  });

  it('excludes own pieces, includes enemy pieces', () => {
    const k: HexPiece = { id: 'K', player: 0, type: 'king', cell: cubeCoord(0, 0), hasMoved: false };
    const friend: HexPiece = { id: 'F', player: 0, type: 'soldier', cell: cubeCoord(1, -1), hasMoved: false };
    const enemy: HexPiece = { id: 'E', player: 2, type: 'soldier', cell: cubeCoord(0, 1), hasMoved: false };
    const s = stateWith([k, friend, enemy]);
    const t = kingMoves(s, k);
    expect(t).not.toContainEqual(cubeCoord(1, -1));
    expect(t).toContainEqual(cubeCoord(0, 1));
  });
});

describe('knight moves', () => {
  it('leaps to 12 non-queen-reachable cells from center', () => {
    const n: HexPiece = { id: 'N', player: 0, type: 'knight', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([n]);
    expect(knightMoves(s, n)).toHaveLength(12);
  });

  it('jumps over pieces (own or enemy adjacent do not block)', () => {
    const n: HexPiece = { id: 'N', player: 0, type: 'knight', cell: cubeCoord(0, 0), hasMoved: false };
    const blocker: HexPiece = { id: 'B', player: 2, type: 'rook', cell: cubeCoord(1, 0), hasMoved: false };
    const s = stateWith([n, blocker]);
    // Knight target (1, -3) is unaffected by the (1,0) blocker.
    expect(knightMoves(s, n)).toContainEqual(cubeCoord(1, -3));
  });
});
