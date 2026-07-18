import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';
import { pawnMoves, applyMove, pseudoMovesForPiece } from '@/game/hexchess/moves';

function customState(opts: {
  pieces: HexPiece[];
  walls?: string[];
}): HexChessState {
  const cells: string[] = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
  }
  const layout: HexLayoutSnapshot = {
    layoutId: 't', layoutName: 't', cells, walls: opts.walls ?? [],
    pieces: Object.fromEntries(opts.pieces.map(p => [
      coordKey(p.cell),
      { player: p.player, type: (p.type === 'pawn' || p.type === 'soldier' ? 'pawn' : p.type) as never },
    ])),
    promotionPositions: { 0: ['4,-2', '4,-1', '4,0'], 2: ['-4,0', '-4,1', '-4,2'] },
    promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
  };
  return {
    mode: 'hexchess', pieces: opts.pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2], eliminated: [], enPassantTarget: null,
    pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
    layout,
  };
}

// Kings on r=0 keep the derived forward snapped to the horizontal edge.
const kings: HexPiece[] = [
  { id: '0-king-0', player: 0, type: 'king', cell: cubeCoord(-4, 0), hasMoved: false },
  { id: '2-king-0', player: 2, type: 'king', cell: cubeCoord(4, 0), hasMoved: false },
];
const pawn = (q: number, r: number, player: 0 | 2 = 0): HexPiece =>
  ({ id: `${player}-pawn-0`, player, type: 'pawn', cell: cubeCoord(q, r), hasMoved: false });

describe('edge-forward pawn en passant', () => {
  it('captures a double-stepping enemy pawn via a flanking cell', () => {
    // White pawn at its start -2,0 double-steps to 0,0 passing through -1,0.
    // Black pawn at 0,-1: black forward is (-1,0), captureDirs (-1,1)/(0,-1);
    // 0,-1 + (-1,1) = -1,0 -> it watches the passed-through cell.
    const white = pawn(-2, 0);
    const black = pawn(0, -1, 2);
    const st = customState({ pieces: [white, black, ...kings] });
    const dbl = pseudoMovesForPiece(st, white).find(m => m.isDoubleStep)!;
    const afterDouble = applyMove(st, dbl); // black to move
    const ep = pawnMoves(afterDouble, black).filter(m => m.isEnPassant);
    expect(ep).toHaveLength(1);
    expect(coordKey(ep[0].to)).toBe('-1,0');
    expect(coordKey(ep[0].epCapturedCell!)).toBe('0,0'); // the double-stepper's cell
  });

  it('applying the EP move removes the double-stepped pawn', () => {
    const white = pawn(-2, 0);
    const black = pawn(0, -1, 2);
    const st = customState({ pieces: [white, black, ...kings] });
    const dbl = pseudoMovesForPiece(st, white).find(m => m.isDoubleStep)!;
    const afterDouble = applyMove(st, dbl);
    const blackNow = afterDouble.pieces.find(p => p.id === black.id)!;
    const epMove = pseudoMovesForPiece(afterDouble, blackNow).find(m => m.isEnPassant)!;
    const done = applyMove(afterDouble, epMove);
    expect(done.pieces.find(p => p.id === white.id)).toBeUndefined();
    expect(coordKey(done.pieces.find(p => p.id === black.id)!.cell)).toBe('-1,0');
  });

  it('EP expires after one turn', () => {
    const white = pawn(-2, 0);
    const black = pawn(0, -1, 2);
    const farWhite: HexPiece = { ...pawn(-2, 2), id: '0-pawn-1' };
    const st = customState({ pieces: [white, black, farWhite, ...kings] });
    const dbl = pseudoMovesForPiece(st, white).find(m => m.isDoubleStep)!;
    let s = applyMove(st, dbl);
    // black plays something else (its own single step)
    const other = pseudoMovesForPiece(s, s.pieces.find(p => p.id === black.id)!)
      .find(m => !m.isEnPassant)!;
    s = applyMove(s, other);
    // white moves, then black no longer has EP
    const w2 = pseudoMovesForPiece(s, s.pieces.find(p => p.id === farWhite.id)!)[0];
    s = applyMove(s, w2);
    const blackNow = s.pieces.find(p => p.id === black.id)!;
    expect(pawnMoves(s, blackNow).filter(m => m.isEnPassant)).toHaveLength(0);
  });
});
