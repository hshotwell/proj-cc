import { describe, it, expect } from 'vitest';
import { selectHexChessBoardView } from '@/store/hexChessStore';
import { createInitialState } from '@/game/hexchess';
import { applyMove, legalMoves } from '@/game/hexchess';
import { coordKey } from '@/game/coordinates';
import type { HexChessConfig } from '@/game/hexchess';

const DEFAULT_CONFIG: HexChessConfig = {
  id: 'test-game',
  players: [
    { color: '#ff0000', name: 'Red', isAI: false },
    { color: '#0000ff', name: 'Blue', isAI: false },
  ],
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('selectHexChessBoardView', () => {
  it('Test 1: returns null when store state is null', () => {
    const result = selectHexChessBoardView({
      state: null,
      gameId: null,
      config: null,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);
    expect(result).toBeNull();
  });

  it('Test 2: initial state produces view with 26 pieces each with pieceType set', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view).not.toBeNull();
    expect(view!.pieces).toHaveLength(26);
    for (const piece of view!.pieces) {
      expect(piece.pieceType).toBeDefined();
      expect(piece.pieceType).not.toBe('marble');
    }

    // Check specific piece types exist in the initial state (2 players × 1 king each, etc.)
    const types = view!.pieces.map(p => p.pieceType);
    expect(types.filter(t => t === 'king')).toHaveLength(2);
    expect(types.filter(t => t === 'queen')).toHaveLength(2);
    expect(types.filter(t => t === 'rook')).toHaveLength(4);
    expect(types.filter(t => t === 'bishop')).toHaveLength(4);
    expect(types.filter(t => t === 'knight')).toHaveLength(4);
    expect(types.filter(t => t === 'soldier')).toHaveLength(10);
  });

  it('Test 3: homeZones is empty in hex chess (no arm-cell tinting)', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view).not.toBeNull();
    // Hex chess relies on the 3-shade beige/brown tile pattern for orientation
    // and does not tint arm cells with player colors.
    expect(view!.homeZones.size).toBe(0);
  });

  it('Test 4: selection highlight added when a piece is selected', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const selectedPiece = state.pieces[0]; // king for player 0
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: selectedPiece.id,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view).not.toBeNull();
    const selectionHighlights = view!.highlights.filter(h => h.kind === 'selection');
    expect(selectionHighlights).toHaveLength(1);
    expect(coordKey(selectionHighlights[0].cell)).toBe(coordKey(selectedPiece.cell));
  });

  it('Test 5: legalMoveEmpty and legalMoveCapture highlights present for a selected piece', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    // Find a piece that has legal moves (soldier/bishop should have moves)
    const allMoves = legalMoves(state);
    const pieceWithMoves = state.pieces.find(p =>
      p.player === 0 && allMoves.some(m => m.pieceId === p.id)
    );
    expect(pieceWithMoves).toBeDefined();

    const targets = allMoves.filter(m => m.pieceId === pieceWithMoves!.id);
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: pieceWithMoves!.id,
      legalMoveTargets: targets,
      lastMove: null,
    } as never);

    expect(view).not.toBeNull();
    const emptyHighlights = view!.highlights.filter(h => h.kind === 'legalMoveEmpty');
    const captureHighlights = view!.highlights.filter(h => h.kind === 'legalMoveCapture');

    // Total move highlights must match the number of legal targets
    expect(emptyHighlights.length + captureHighlights.length).toBe(targets.length);

    // Each target maps to exactly one highlight of the right kind
    for (const target of targets) {
      const expectedKind = target.capture !== null ? 'legalMoveCapture' : 'legalMoveEmpty';
      const matching = view!.highlights.filter(
        h => h.kind === expectedKind && coordKey(h.cell) === coordKey(target.to)
      );
      expect(matching.length).toBe(1);
    }
  });

  it('Test 6: check highlight on king when in check', () => {
    // Build a state where player 0 is in check by constructing a position manually.
    // Start from initial state, then force a position where we can verify the check flag.
    // We'll use the isInCheck function to verify check detection and then check the highlight.
    const state = createInitialState(DEFAULT_CONFIG);

    // Manually place player 0's king in check:
    // We'll construct a state directly with a simplified piece list.
    // Player 0 king at (4,-8), Player 1 rook at (4,-7) attacking king.
    const inCheckState = {
      ...state,
      currentPlayer: 0 as const,
      pieces: [
        // Player 0 king only at (4,-8)
        { id: '0-king', player: 0 as const, type: 'king' as const, cell: { q: 4, r: -8, s: 4 }, hasMoved: true },
        // Player 1 rook adjacent to king — at (3,-8,5) attacking along q direction
        { id: '1-rook', player: 1 as const, type: 'rook' as const, cell: { q: 3, r: -8, s: 5 }, hasMoved: true },
      ],
    };

    const view = selectHexChessBoardView({
      state: inCheckState,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view).not.toBeNull();
    // The check highlight should be on the king's cell
    const checkHighlights = view!.highlights.filter(h => h.kind === 'check');
    expect(checkHighlights).toHaveLength(1);
    expect(coordKey(checkHighlights[0].cell)).toBe(coordKey({ q: 4, r: -8, s: 4 }));
  });
});
