import { describe, it, expect } from 'vitest';
import { applyMoveCore, applyMove } from '@/game/hexchess/moves';
import { confirmPromotion } from '@/game/hexchess/promotion';
import { armCellsForPlayer, createInitialState } from '@/game/hexchess/starting';
import type { HexChessState, HexPiece, HexMove } from '@/game/hexchess/state';
import { coordKey, cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[], overrides?: Partial<HexChessState>): HexChessState {
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: 0,
    turnNumber: 1,
    activePlayers: [0, 2],
    eliminated: [],
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
    ...overrides,
  };
}

/** Build a minimal HexMove that moves pieceId from `from` to `to`. */
function buildMove(piece: HexPiece, to: HexPiece['cell']): HexMove {
  return {
    pieceId: piece.id,
    from: piece.cell,
    to,
    capture: null,
    promotion: null,
    isEnPassant: false,
    isDoubleStep: false,
    player: piece.player,
    turnNumber: 1,
  };
}

// ---------------------------------------------------------------------------
// Helpers: cells in player 1's arm (opponent arm for player 0)
// ---------------------------------------------------------------------------

/** Returns the first cell in player 1's arm (the opponent arm for player 0). */
function p1ArmCell(index: number): HexPiece['cell'] {
  const cells = armCellsForPlayer(2);
  return cells[index];
}

/** Returns the first cell in player 0's arm (the opponent arm for player 1). */
function p0ArmCell(index: number): HexPiece['cell'] {
  const cells = armCellsForPlayer(0);
  return cells[index];
}

// ---------------------------------------------------------------------------
// Test 1: soldier reaching opponent arm sets pendingPromotion
// ---------------------------------------------------------------------------

describe('promotion — soldier', () => {
  it('sets pendingPromotion when soldier reaches opponent arm cell; turn does NOT advance; result is null', () => {
    const targetCell = p1ArmCell(9); // last base-row cell of player 1's arm

    const soldier: HexPiece = {
      id: 's0-soldier',
      player: 0,
      type: 'soldier',
      cell: cubeCoord(0, 0), // anywhere off-board arm, just needs to be the piece
      hasMoved: true,
    };

    // Build state with the soldier already adjacent to the promotion zone:
    // We directly move it to `targetCell` via a manufactured move.
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king',
      cell: cubeCoord(4, -8), hasMoved: false,
    };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king',
      cell: cubeCoord(-4, 8), hasMoved: false,
    };

    const st = stateWith([soldier, king0, king1]);
    const move = buildMove(soldier, targetCell);
    const next = applyMoveCore(st, move);

    // pendingPromotion should be set
    expect(next.pendingPromotion).not.toBeNull();
    expect(next.pendingPromotion!.pieceId).toBe('s0-soldier');
    expect(coordKey(next.pendingPromotion!.targetCell)).toBe(coordKey(targetCell));
    expect(next.pendingPromotion!.options).toContain('queen');
    expect(next.pendingPromotion!.options).toContain('rook');
    expect(next.pendingPromotion!.options).toContain('bishop');
    expect(next.pendingPromotion!.options).toContain('knight');

    // Turn must NOT advance
    expect(next.currentPlayer).toBe(0);
    expect(next.turnNumber).toBe(1);

    // Game result not populated
    expect(next.result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: pawn reaching opponent arm sets pendingPromotion
// ---------------------------------------------------------------------------

describe('promotion — pawn', () => {
  it('sets pendingPromotion when pawn reaches opponent arm cell', () => {
    const targetCell = p1ArmCell(0); // apex of player 1's arm

    const pawn: HexPiece = {
      id: 'p0-pawn',
      player: 0,
      type: 'pawn',
      cell: cubeCoord(0, 0),
      hasMoved: true,
    };
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king',
      cell: cubeCoord(4, -8), hasMoved: false,
    };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king',
      cell: cubeCoord(-4, 8), hasMoved: false,
    };

    const st = stateWith([pawn, king0, king1]);
    const move = buildMove(pawn, targetCell);
    const next = applyMoveCore(st, move);

    expect(next.pendingPromotion).not.toBeNull();
    expect(next.pendingPromotion!.pieceId).toBe('p0-pawn');
    expect(next.currentPlayer).toBe(0);
    expect(next.turnNumber).toBe(1);
    expect(next.result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 3: confirmPromotion applies choice, advances turn, clears pendingPromotion
// ---------------------------------------------------------------------------

describe('confirmPromotion', () => {
  function makePromotionState(): HexChessState {
    const targetCell = p1ArmCell(9);
    const soldier: HexPiece = {
      id: 's0-soldier',
      player: 0,
      type: 'soldier',
      cell: cubeCoord(0, 0),
      hasMoved: true,
    };
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king', cell: cubeCoord(4, -8), hasMoved: false };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king', cell: cubeCoord(-4, 8), hasMoved: false };

    const st = stateWith([soldier, king0, king1]);
    const move = buildMove(soldier, targetCell);
    return applyMove(st, move);
  }

  it('replaces the piece type with choice, advances the turn, and clears pendingPromotion', () => {
    const pendingState = makePromotionState();
    expect(pendingState.pendingPromotion).not.toBeNull();

    const confirmed = confirmPromotion(pendingState, 'queen');

    // Piece type changed
    const promotedPiece = confirmed.pieces.find(p => p.id === 's0-soldier');
    expect(promotedPiece).toBeDefined();
    expect(promotedPiece!.type).toBe('queen');

    // Turn advanced
    expect(confirmed.currentPlayer).toBe(2);
    expect(confirmed.turnNumber).toBe(2);

    // pendingPromotion cleared
    expect(confirmed.pendingPromotion).toBeNull();
  });

  it('records the promotion choice on the last moveHistory entry', () => {
    const pendingState = makePromotionState();
    const confirmed = confirmPromotion(pendingState, 'rook');

    const lastMove = confirmed.moveHistory[confirmed.moveHistory.length - 1];
    expect(lastMove.promotion).toBe('rook');
  });

  // ---------------------------------------------------------------------------
  // Test 4: invalid choice is rejected
  // ---------------------------------------------------------------------------

  it('throws when choice is not in pendingPromotion.options', () => {
    const pendingState = makePromotionState();
    // 'king' and 'pawn' and 'soldier' are not valid promotion choices
    expect(() => confirmPromotion(pendingState, 'king' as never)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // Test 5: no pendingPromotion throws
  // ---------------------------------------------------------------------------

  it('throws when state has no pendingPromotion', () => {
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king', cell: cubeCoord(4, -8), hasMoved: false };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king', cell: cubeCoord(-4, 8), hasMoved: false };
    const normalState = stateWith([king0, king1]);
    expect(() => confirmPromotion(normalState, 'queen')).toThrow();
  });

  // ---------------------------------------------------------------------------
  // Test 6: confirmPromotion delivering checkmate produces correct result
  // ---------------------------------------------------------------------------

  it('produces result { winner, reason: checkmate } when promotion delivers checkmate', () => {
    // Checkmate position after soldier promotes to queen at (-3,7):
    //   king1 at (-4,8): on-board neighbors are only (-3,7), (-4,7), (-3,6)
    //   queen (promoted) at (-3,7) — checks via edge {+1,-1} reversed: (-4,8)→(-3,7)
    //   queen covers (-4,7) via edge {-1,0}: queen at (-3,7) in dir (-1,0) → (-4,7)
    //   queen covers (-3,6) via edge {0,-1}: queen at (-3,7) in dir (0,-1) → (-3,6)
    //   rook0 at (-3,5) — on q=-3 ray, defends queen at (-3,7) so king can't capture it
    //   king0 at (4,-8)
    //
    // King1 escape analysis (only 3 on-board neighbors):
    //   (-3,7): queen — rook at (-3,5) defends it, king can't capture
    //   (-4,7): queen edge {-1,0} ray covers it
    //   (-3,6): queen edge {0,-1} ray covers it
    //   → checkmate

    const promotionTarget = armCellsForPlayer(2)[1]; // (-3, 7)

    const soldier: HexPiece = {
      id: 's0',
      player: 0,
      type: 'soldier',
      cell: cubeCoord(0, 0),
      hasMoved: true,
    };
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king', cell: cubeCoord(4, -8), hasMoved: false,
    };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king', cell: cubeCoord(-4, 8), hasMoved: false,
    };
    // Rook at (-3,5): on q=-3 edge ray toward (-3,7), defends the queen after promotion.
    const rook0: HexPiece = {
      id: 'r0', player: 0, type: 'rook', cell: cubeCoord(-3, 5), hasMoved: true,
    };

    const st = stateWith([soldier, king0, king1, rook0]);
    const move = buildMove(soldier, promotionTarget);
    const pendingState = applyMove(st, move);

    expect(pendingState.pendingPromotion).not.toBeNull();

    const confirmed = confirmPromotion(pendingState, 'queen');

    expect(confirmed.result).not.toBeNull();
    expect(confirmed.result!.reason).toBe('checkmate');
    expect(confirmed.result!.winner).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: replay reconstruction — promotions in moveHistory are applied
// ---------------------------------------------------------------------------

describe('replay reconstruction with promotion', () => {
  it('reconstructing a moveHistory that includes a promotion yields the promoted piece type', () => {
    // Build a state with a soldier one step away from the promotion zone.
    const targetCell = armCellsForPlayer(2)[6]; // base-row cell (-1,5) of seat 2's arm
    const soldier: HexPiece = {
      id: 's0-soldier',
      player: 0,
      type: 'soldier',
      cell: cubeCoord(0, 0),
      hasMoved: true,
    };
    const king0: HexPiece = {
      id: 'k0', player: 0, type: 'king', cell: cubeCoord(4, -8), hasMoved: false,
    };
    const king1: HexPiece = {
      id: 'k1', player: 2, type: 'king', cell: cubeCoord(-4, 8), hasMoved: false,
    };

    const initial = stateWith([soldier, king0, king1]);

    // Simulate what the store records: applyMove followed by confirmPromotion.
    const afterMove = applyMove(initial, buildMove(soldier, targetCell));
    expect(afterMove.pendingPromotion).not.toBeNull();
    const afterConfirm = confirmPromotion(afterMove, 'queen');
    expect(afterConfirm.pendingPromotion).toBeNull();

    // moveHistory now contains one entry with promotion = 'queen'.
    const moveHistory = afterConfirm.moveHistory;
    expect(moveHistory).toHaveLength(1);
    expect(moveHistory[0].promotion).toBe('queen');

    // Replay reconstruction: reproduce what HexReplayContainer does.
    const arr = [initial];
    for (const move of moveHistory) {
      let next = applyMove(arr[arr.length - 1], move);
      if (next.pendingPromotion !== null && move.promotion !== null) {
        next = confirmPromotion(next, move.promotion);
      }
      arr.push(next);
    }

    // The final state should have the soldier promoted to a queen.
    const finalState = arr[arr.length - 1];
    const promotedPiece = finalState.pieces.find(p => p.id === 's0-soldier');
    expect(promotedPiece).toBeDefined();
    expect(promotedPiece!.type).toBe('queen');
    // pendingPromotion cleared
    expect(finalState.pendingPromotion).toBeNull();
    // Turn advanced past player 0
    expect(finalState.currentPlayer).toBe(2);
  });
});
