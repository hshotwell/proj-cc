import { describe, it, expect } from 'vitest';
import { orderMoves } from '@/game/ai/hexchess/moveOrdering';
import { searchBestMove } from '@/game/ai/hexchess/search';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig, HexChessState, HexMove, HexPiece } from '@/game/hexchess/state';

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

// ---------------------------------------------------------------------------
// orderMoves tests
// ---------------------------------------------------------------------------

describe('orderMoves', () => {
  it('puts captures before non-captures', () => {
    const base = createInitialState(config);
    const pieces: HexPiece[] = [
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      { id: '0-rook', player: 0, type: 'rook', cell: { q: 0, r: 0, s: 0 }, hasMoved: true },
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
      { id: '1-pawn', player: 2, type: 'pawn', cell: { q: 1, r: 0, s: -1 }, hasMoved: true },
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

    // Create two fake moves: one capture, one non-capture
    const captureMove: HexMove = {
      pieceId: '0-rook',
      from: { q: 0, r: 0, s: 0 },
      to: { q: 1, r: 0, s: -1 },
      capture: { pieceId: '1-pawn', cell: { q: 1, r: 0, s: -1 } },
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 5,
    };
    const quietMove: HexMove = {
      pieceId: '0-rook',
      from: { q: 0, r: 0, s: 0 },
      to: { q: 0, r: 1, s: -1 },
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 5,
    };

    // Pass quiet move first, capture second — after ordering, capture must come first
    const ordered = orderMoves(state, [quietMove, captureMove]);
    expect(ordered[0].capture).not.toBeNull();
    expect(ordered[1].capture).toBeNull();
  });

  it('MVV-LVA: queen capture before pawn capture when attacker is the same piece', () => {
    const base = createInitialState(config);
    const pieces: HexPiece[] = [
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      { id: '0-rook', player: 0, type: 'rook', cell: { q: 0, r: 0, s: 0 }, hasMoved: true },
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
      { id: '1-queen', player: 2, type: 'queen', cell: { q: 1, r: 0, s: -1 }, hasMoved: true },
      { id: '1-pawn', player: 2, type: 'pawn', cell: { q: 2, r: 0, s: -2 }, hasMoved: true },
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

    const captureQueen: HexMove = {
      pieceId: '0-rook',
      from: { q: 0, r: 0, s: 0 },
      to: { q: 1, r: 0, s: -1 },
      capture: { pieceId: '1-queen', cell: { q: 1, r: 0, s: -1 } },
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 5,
    };
    const capturePawn: HexMove = {
      pieceId: '0-rook',
      from: { q: 0, r: 0, s: 0 },
      to: { q: 2, r: 0, s: -2 },
      capture: { pieceId: '1-pawn', cell: { q: 2, r: 0, s: -2 } },
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 5,
    };

    // Pass pawn-capture first, queen-capture second — after ordering, queen-capture first
    const ordered = orderMoves(state, [capturePawn, captureQueen]);
    expect(ordered[0].capture!.pieceId).toBe('1-queen');
    expect(ordered[1].capture!.pieceId).toBe('1-pawn');
  });

  it('non-captures preserve relative order', () => {
    const base = createInitialState(config);
    const pieces: HexPiece[] = [
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
    ];
    const state: HexChessState = {
      ...base,
      pieces,
      currentPlayer: 0,
      turnNumber: 1,
      enPassantTarget: null,
      pendingPromotion: null,
      moveHistory: [],
      positionHashes: {},
      result: null,
    };

    const move1: HexMove = {
      pieceId: '0-king',
      from: { q: 4, r: -8, s: 4 },
      to: { q: 3, r: -7, s: 4 },
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 1,
    };
    const move2: HexMove = {
      pieceId: '0-king',
      from: { q: 4, r: -8, s: 4 },
      to: { q: 4, r: -7, s: 3 },
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 1,
    };

    const ordered = orderMoves(state, [move1, move2]);
    // Both quiet — original order preserved (stable sort with equal scores)
    expect(ordered[0].to).toEqual(move1.to);
    expect(ordered[1].to).toEqual(move2.to);
  });
});

// ---------------------------------------------------------------------------
// Quiescence search integration test
// ---------------------------------------------------------------------------

describe('quiescence search', () => {
  it('correctly evaluates net material after a free exchange sequence', () => {
    // Scenario: player 0 rook can capture player 1 knight for free.
    // (A knight rather than a pawn: under the unified pawn rules a hanging
    // pawn's only move keeps it on the rook's ray, so delaying the capture
    // costs nothing and the quiet line legitimately ties. A knight can leap
    // to safety, so the capture must be taken NOW to win material.)
    //
    // With quiescence: after depth=0 leaf, it will extend into the capture and
    // correctly account for the captured piece's value rather than stopping
    // before it.
    const base = createInitialState(config);
    const pieces: HexPiece[] = [
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      { id: '0-rook', player: 0, type: 'rook', cell: { q: 0, r: 0, s: 0 }, hasMoved: true },
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
      // Knight undefended — rook can take it for free, but only right now
      { id: '1-knight', player: 2, type: 'knight', cell: { q: 1, r: 0, s: -1 }, hasMoved: true },
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

    const result = searchBestMove(state, { budgetMs: 2000, maxDepth: 2 });
    expect(result.move).not.toBeNull();
    // Should capture the hanging knight
    expect(result.move!.capture).not.toBeNull();
    expect(result.move!.capture!.pieceId).toBe('1-knight');
  });

  it('quiescence does not blunder into a losing exchange (pawn takes defended rook)', () => {
    // Player 0 pawn can capture player 1 rook, but player 1 queen defends the rook.
    // If pawn (100) takes rook (500), queen (900) recaptures pawn → net: player 0 gains 500 but
    // loses 100 pawn = net +400 for player 0.  Wait — actually that IS profitable.
    //
    // Correct losing scenario: player 0 queen captures player 1 pawn, but that pawn is defended
    // by player 1 rook. Queen (900) takes pawn (100), rook (500) recaptures queen → net -400 for player 0.
    // The search should prefer a quiet move or a different capture.
    const base = createInitialState(config);
    const pieces: HexPiece[] = [
      { id: '0-king', player: 0, type: 'king', cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
      // Player 0 queen at center — could take player 1 pawn but that's defended by player 1 rook
      { id: '0-queen', player: 0, type: 'queen', cell: { q: 0, r: 0, s: 0 }, hasMoved: true },
      { id: '1-king', player: 2, type: 'king', cell: { q: -4, r: 8, s: -4 }, hasMoved: true },
      // Player 1 pawn at (1,0,-1) defended by player 1 rook at (2,0,-2)
      { id: '1-pawn', player: 2, type: 'pawn', cell: { q: 1, r: 0, s: -1 }, hasMoved: true },
      { id: '1-rook', player: 2, type: 'rook', cell: { q: 2, r: 0, s: -2 }, hasMoved: true },
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

    const result = searchBestMove(state, { budgetMs: 3000, maxDepth: 3 });
    // Quiescence should see that queen-takes-pawn allows rook-takes-queen (net -400),
    // so the best move should NOT be queen capturing the pawn at (1,0,-1).
    if (result.move !== null) {
      const isBlunder =
        result.move.pieceId === '0-queen' &&
        result.move.capture?.pieceId === '1-pawn';
      expect(isBlunder).toBe(false);
    }
  });
});
