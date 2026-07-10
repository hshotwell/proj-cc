import { describe, it, expect } from 'vitest';
import { resolvePreMoveFiring } from '@/hooks/useHexChessPreMoveFiring';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[], currentPlayer: 0 | 1 = 0): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

function piece(id: string, player: 0 | 1, type: HexPiece['type'], q: number, r: number): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

describe('resolvePreMoveFiring', () => {
  it('returns none when nothing is queued and nothing is selected', () => {
    const state = stateWith([piece('k0', 0, 'king', 4, -8)]);
    expect(resolvePreMoveFiring(state, [], null)).toEqual({ type: 'none' });
  });

  it('returns promote-selection when the queue is empty but a piece is selected', () => {
    const state = stateWith([piece('k0', 0, 'king', 4, -8)]);
    expect(resolvePreMoveFiring(state, [], 'k0')).toEqual({ type: 'promote-selection', pieceId: 'k0' });
  });

  it('returns fire for a queued move that is still legal', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const state = stateWith([rook, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    const decision = resolvePreMoveFiring(state, [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }], null);
    expect(decision).toEqual({ type: 'fire', pieceId: 'r0', to: cubeCoord(3, 0), promotion: null });
  });

  it('returns invalidate when the queued destination is no longer reachable', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const blocker = piece('b1', 1, 'knight', 1, 0);
    const state = stateWith([rook, blocker, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    // blocker sits directly between the rook and (3,0), so that cell is no longer reachable
    const decision = resolvePreMoveFiring(state, [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }], null);
    expect(decision).toEqual({ type: 'invalidate' });
  });

  it('prioritizes the queued move over a lingering selection', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const state = stateWith([rook, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    const decision = resolvePreMoveFiring(
      state,
      [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }],
      'some-other-piece-id',
    );
    expect(decision.type).toBe('fire');
  });
});
