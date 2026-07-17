import { describe, it, expect } from 'vitest';
import { searchBestMove } from '@/game/ai/hexchess/search';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig, HexChessState, HexPiece } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 'test',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'P1', isAI: false },
    2: { color: 'blue', name: 'P2', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('searchBestMove', () => {
  it('depth 1 returns SOME move from the initial position', () => {
    const state = createInitialState(config);
    const result = searchBestMove(state, { budgetMs: 1000, maxDepth: 1 });
    expect(result.move).not.toBeNull();
    expect(result.depth).toBe(1);
  });

  it('time budget respected — returns within 2000ms even with large maxDepth', () => {
    const state = createInitialState(config);
    const start = Date.now();
    searchBestMove(state, { budgetMs: 100, maxDepth: 10 });
    const elapsed = Date.now() - start;
    // Budget is 100ms. The search runs one full iteration before checking the clock.
    // Depth 1 on the initial position can take ~100-300ms. We allow 2s for slow CI.
    expect(elapsed).toBeLessThan(2000);
  });

  it('depth 2 finds the capture of a hanging enemy queen', () => {
    // Player 0 has a rook that can directly capture player 1's queen.
    // Set up: place player 0 rook at (0,0,0), player 1 queen at (1,0,-1)
    // (adjacent via an edge direction), player 1 king somewhere safe,
    // player 0 king somewhere safe.
    // Player 0 to move → should capture the queen.
    const base = createInitialState(config);

    const pieces: HexPiece[] = [
      // Player 0 king — safe at south apex
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      // Player 0 rook at center
      { id: '0-rook', player: 0, type: 'rook', cell: { q: 0, r: 0, s: 0 }, hasMoved: true },
      // Player 1 king — safe at north apex
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
      // Player 1 queen — hanging next to player 0 rook (edge neighbor)
      { id: '1-queen', player: 2, type: 'queen', cell: { q: 1, r: 0, s: -1 }, hasMoved: true },
    ];

    const state: HexChessState = {
      ...base,
      pieces,
      currentPlayer: 0,
      turnNumber: 5,
      enPassantTarget: null,
      pendingPromotion: null,
      moveHistory: [],
      positionHashes: {},
      result: null,
    };

    const result = searchBestMove(state, { budgetMs: 1000, maxDepth: 2 });
    expect(result.move).not.toBeNull();
    // The best move should be the rook capturing the queen at (1,0,-1)
    expect(result.move!.pieceId).toBe('0-rook');
    expect(result.move!.to).toEqual({ q: 1, r: 0, s: -1 });
    expect(result.move!.capture).not.toBeNull();
    expect(result.move!.capture!.pieceId).toBe('1-queen');
  });
});
