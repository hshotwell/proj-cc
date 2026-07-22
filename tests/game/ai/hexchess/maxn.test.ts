import { describe, it, expect } from 'vitest';
import { searchBestMove } from '@/game/ai/hexchess/search';
import { searchBestMoveMaxN } from '@/game/ai/hexchess/maxn';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessState, HexChessConfig, HexPiece, HexPlayerIndex } from '@/game/hexchess/state';
import { cubeCoord, cubeEquals } from '@/game/coordinates';

function piece(
  id: string,
  player: HexPlayerIndex,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

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

function configFor(seats: HexPlayerIndex[]): HexChessConfig {
  return {
    id: 'maxn-test',
    seats,
    players: Object.fromEntries(seats.map(s => [s, {
      color: '#ff0000', name: `P${s}`, isAI: true,
    }])),
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: null,
  };
}

const OPTS = { budgetMs: 3000, maxDepth: 1 };

describe('Max^n search', () => {
  it('takes a free adjacent king capture at depth 1', () => {
    const s = state3([
      piece('r0', 0, 'rook', 0, 0),
      piece('k0', 0, 'king', 4, -8),
      piece('k3', 3, 'king', 3, 0), // on the rook's file
      piece('k1', 1, 'king', -8, 4),
      piece('r1', 1, 'rook', -5, 2),
    ]);
    const result = searchBestMoveMaxN(s, OPTS);
    expect(result.move).not.toBeNull();
    expect(result.move!.pieceId).toBe('r0');
    expect(cubeEquals(result.move!.to, cubeCoord(3, 0))).toBe(true);
    expect(result.move!.capture?.pieceId).toBe('k3');
  });

  it('prefers capturing a queen over a soldier', () => {
    const s = state3([
      piece('r0', 0, 'rook', 0, 0),
      piece('k0', 0, 'king', 4, -8),
      piece('q3', 3, 'queen', 3, 0),
      piece('s3', 3, 'soldier', -3, 0),
      piece('k3', 3, 'king', 4, 4),
      piece('k1', 1, 'king', -8, 4),
    ]);
    const result = searchBestMoveMaxN(s, OPTS);
    expect(result.move?.capture?.pieceId).toBe('q3');
  });

  // Runs 3 separate Max^n searches (3/4/6-player boards) back to back —
  // give vitest headroom above the 5000ms default for CPU-contended runs.
  it('returns a legal move from the 3/4/6-player initial positions', () => {
    const seatSets: HexPlayerIndex[][] = [
      [0, 3, 1],
      [4, 3, 1, 5],
      [0, 4, 3, 2, 1, 5],
    ];
    for (const seats of seatSets) {
      const s = createInitialState(configFor(seats));
      const result = searchBestMoveMaxN(s, { budgetMs: 2000, maxDepth: 1 });
      expect(result.move).not.toBeNull();
      expect(result.move!.player).toBe(seats[0]);
    }
  }, 15_000);

  it('searchBestMove routes 3+ player states to Max^n', () => {
    const s = state3([
      piece('r0', 0, 'rook', 0, 0),
      piece('k0', 0, 'king', 4, -8),
      piece('k3', 3, 'king', 3, 0),
      piece('k1', 1, 'king', -8, 4),
    ]);
    const result = searchBestMove(s, OPTS);
    expect(result.move?.capture?.pieceId).toBe('k3');
  });

  it('never returns a move for an eliminated seat\'s piece', () => {
    const s = state3(
      [
        piece('r0', 0, 'rook', 0, 0),
        piece('k0', 0, 'king', 4, -8),
        piece('b3', 3, 'bishop', 2, 2), // dead army
        piece('k1', 1, 'king', -8, 4),
      ],
      { eliminated: [3] },
    );
    const result = searchBestMoveMaxN(s, { budgetMs: 1000, maxDepth: 2 });
    expect(result.move).not.toBeNull();
    expect(result.move!.player).toBe(0);
  });
});
