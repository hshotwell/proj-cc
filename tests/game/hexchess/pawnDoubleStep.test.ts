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

describe('edge-forward pawn double-step', () => {
  it('offers the double-step only from a layout starting cell', () => {
    const p = pawn(-2, 0); // -2,0 IS its snapshot cell -> a start cell
    const st = customState({ pieces: [p, ...kings] });
    const moves = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(moves.map(m => coordKey(m.to)).sort()).toEqual(['-1,0', '0,0']);
    expect(moves.find(m => coordKey(m.to) === '0,0')!.isDoubleStep).toBe(true);
  });

  it('no double-step once the pawn is off its start cell', () => {
    const p = pawn(-2, 0);
    const st = customState({ pieces: [p, ...kings] });
    const dbl = pseudoMovesForPiece(st, p).find(m => m.isDoubleStep)!;
    const next = applyMove(st, dbl);
    const moved = next.pieces.find(pc => pc.id === p.id)!;
    const later = pawnMoves(next, moved).filter(m => !m.isCapture);
    expect(later.every(m => !m.isDoubleStep)).toBe(true);
  });

  it('double-step blocked when the pass-through or landing cell is occupied or a wall', () => {
    const p = pawn(-2, 0);
    const blockAt = (key: string, walls?: string[]) => {
      const [bq, br] = key.split(',').map(Number);
      const blocker: HexPiece | null = walls ? null :
        { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(bq, br), hasMoved: false };
      return customState({ pieces: blocker ? [p, blocker, ...kings] : [p, ...kings], walls });
    };
    // pass-through occupied
    expect(pawnMoves(blockAt('-1,0'), p).some(m => m.isDoubleStep)).toBe(false);
    // landing occupied
    expect(pawnMoves(blockAt('0,0'), p).some(m => m.isDoubleStep)).toBe(false);
    // pass-through is a wall
    expect(pawnMoves(blockAt('-1,0', ['-1,0']), p).some(m => m.isDoubleStep)).toBe(false);
  });

  it('double-step records an EP target on the passed-through cell', () => {
    const p = pawn(-2, 0);
    const st = customState({ pieces: [p, ...kings] });
    const dbl = pseudoMovesForPiece(st, p).find(m => m.isDoubleStep)!;
    const next = applyMove(st, dbl);
    expect(next.enPassantTarget).not.toBeNull();
    expect(next.enPassantTarget!.targetCells.map(coordKey)).toEqual(['-1,0']);
    expect(next.enPassantTarget!.availableUntilTurn).toBe(next.turnNumber);
  });
});
