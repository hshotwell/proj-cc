import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';
import { pawnMoves } from '@/game/hexchess/moves';

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
    // Player 0 promotes on the right edge column, player 2 on the left:
    // forward(0) snaps to edge (1,0); forward(2) snaps to edge (-1,0).
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

// IMPORTANT: kings sit on r=0 so each army's centroid stays near the r=0 axis
// and the derived forward reliably snaps to the horizontal EDGE (1,0)/(-1,0).
const kings: HexPiece[] = [
  { id: '0-king-0', player: 0, type: 'king', cell: cubeCoord(-4, 0), hasMoved: false },
  { id: '2-king-0', player: 2, type: 'king', cell: cubeCoord(4, 0), hasMoved: false },
];
const pawn = (q: number, r: number, player: 0 | 2 = 0): HexPiece =>
  ({ id: `${player}-pawn-0`, player, type: 'pawn', cell: cubeCoord(q, r), hasMoved: false });

describe('edge-forward pawn', () => {
  it('moves along the forward edge only (single step + double-step from its start cell)', () => {
    // The snapshot registers the pawn's cell as its start cell, so the
    // double-step is also available here.
    const p = pawn(0, 0);
    const st = customState({ pieces: [p, ...kings] });
    const nonCaptures = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(nonCaptures.map(m => coordKey(m.to)).sort()).toEqual(['1,0', '2,0']);
    expect(nonCaptures.find(m => coordKey(m.to) === '2,0')!.isDoubleStep).toBe(true);
  });

  it('cannot move forward onto ANY piece (no capture straight ahead)', () => {
    const p = pawn(0, 0);
    const enemy: HexPiece = { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(1, 0), hasMoved: false };
    const st = customState({ pieces: [p, enemy, ...kings] });
    expect(pawnMoves(st, p).filter(m => !m.isCapture)).toHaveLength(0);
    // and the straight-ahead enemy is NOT capturable
    expect(pawnMoves(st, p).some(m => coordKey(m.to) === '1,0')).toBe(false);
  });

  it('captures only on the two adjacent flanking cells', () => {
    const p = pawn(0, 0);
    const e1: HexPiece = { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(1, -1), hasMoved: false };
    const e2: HexPiece = { id: '2-rook-1', player: 2, type: 'rook', cell: cubeCoord(0, 1), hasMoved: false };
    const st = customState({ pieces: [p, e1, e2, ...kings] });
    const captures = pawnMoves(st, p).filter(m => m.isCapture);
    expect(captures.map(m => coordKey(m.to)).sort()).toEqual(['0,1', '1,-1']);
  });

  it('does not capture own pieces on flanking cells', () => {
    const p = pawn(0, 0);
    const own: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(1, -1), hasMoved: false };
    const st = customState({ pieces: [p, own, ...kings] });
    expect(pawnMoves(st, p).filter(m => m.isCapture)).toHaveLength(0);
  });

  it('cannot move or capture onto walls', () => {
    const p = pawn(0, 0);
    const st = customState({ pieces: [p, ...kings], walls: ['1,0', '1,-1'] });
    const moves = pawnMoves(st, p);
    expect(moves.some(m => coordKey(m.to) === '1,0')).toBe(false);
    expect(moves.some(m => coordKey(m.to) === '1,-1')).toBe(false);
  });

  it('mirrored army: player 2 pawn moves along (-1,0)', () => {
    const p = pawn(0, 0, 2);
    const st = customState({ pieces: [p, ...kings] });
    st.currentPlayer = 2;
    const nonCaptures = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(nonCaptures.map(m => coordKey(m.to)).sort()).toEqual(['-1,0', '-2,0']);
  });
});
