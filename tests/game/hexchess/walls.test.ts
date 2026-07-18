import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';
import { rookMoves, bishopMoves, knightMoves, kingMoves, pseudoMovesForPiece } from '@/game/hexchess/moves';

/** Hexagonal board radius 4 with optional walls; kings parked far apart. */
function customState(opts: {
  pieces: HexPiece[];
  walls?: string[];
  promo?: Partial<Record<number, string[]>>;
}): HexChessState {
  const cells: string[] = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
  }
  const layout: HexLayoutSnapshot = {
    layoutId: 't', layoutName: 't', cells, walls: opts.walls ?? [],
    pieces: Object.fromEntries(opts.pieces.map(p => [
      coordKey(p.cell),
      { player: p.player, type: (p.type === 'soldier' ? 'pawn' : p.type) as never },
    ])),
    promotionPositions: (opts.promo ?? {}) as HexLayoutSnapshot['promotionPositions'],
    promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
  };
  return {
    mode: 'hexchess', pieces: opts.pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2], eliminated: [], enPassantTarget: null,
    pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
    layout,
  };
}

const king = (player: 0 | 2, q: number, r: number): HexPiece =>
  ({ id: `${player}-king-0`, player, type: 'king', cell: cubeCoord(q, r), hasMoved: false });

describe('walls in hex chess', () => {
  it('stop a rook ray and are never landable', () => {
    const rook: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(-3, 0), hasMoved: false };
    const st = customState({ pieces: [rook, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0'] });
    const targets = rookMoves(st, rook).map(coordKey);
    expect(targets).toContain('-2,0');
    expect(targets).toContain('-1,0');
    expect(targets).not.toContain('0,0');  // the wall itself
    expect(targets).not.toContain('1,0');  // beyond the wall
  });

  it('stop a bishop ray the same way', () => {
    const bishop: HexPiece = { id: '0-bishop-0', player: 0, type: 'bishop', cell: cubeCoord(-4, 2), hasMoved: false };
    // bishop slides along diagonal (2,-1): -4,2 -> -2,1 -> 0,0 -> 2,-1
    const st = customState({ pieces: [bishop, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0'] });
    const targets = bishopMoves(st, bishop).map(coordKey);
    expect(targets).toContain('-2,1');
    expect(targets).not.toContain('0,0');
    expect(targets).not.toContain('2,-1');
  });

  it('kings cannot step onto walls', () => {
    const k = king(0, 1, 0);
    const st = customState({ pieces: [k, king(2, 4, 0)], walls: ['0,0'] });
    const targets = kingMoves(st, k).map(coordKey);
    expect(targets).not.toContain('0,0');
  });

  it('knights leap over walls but cannot land on them', () => {
    const knight: HexPiece = { id: '0-knight-0', player: 0, type: 'knight', cell: cubeCoord(0, 1), hasMoved: false };
    // Leap (1,-3): 0,1 -> 1,-2 clears the walled-off terrain in between.
    const st = customState({ pieces: [knight, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0', '1,-1', '0,-1', '1,0'] });
    const targets = knightMoves(st, knight).map(coordKey);
    expect(targets).toContain('1,-2'); // leap over surrounded terrain
    for (const w of ['0,0', '1,-1', '0,-1', '1,0']) expect(targets).not.toContain(w);
  });

  it('moves never leave the custom board shape', () => {
    const rook: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(4, 0), hasMoved: false };
    const st = customState({ pieces: [rook, king(0, -4, 0), king(2, 0, 4)] });
    const targets = rookMoves(st, rook).map(coordKey);
    expect(targets).not.toContain('5,0'); // radius-4 board; 5,0 is off-board (would be on the 121 star)
  });

  it('pseudoMovesForPiece returns [] for a pawn-army with no derived forward', () => {
    const soldier: HexPiece = { id: '0-soldier-0', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const st = customState({ pieces: [soldier, king(0, -4, 0), king(2, 4, 0)] }); // no promotion tiles -> no forward
    expect(pseudoMovesForPiece(st, soldier)).toEqual([]);
  });
});
