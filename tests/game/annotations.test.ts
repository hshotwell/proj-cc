import { describe, it, expect } from 'vitest';
import {
  resolveAnnotationDrag,
  computeCheckersArrowPath,
  computeHexKnightArrowPath,
} from '@/game/annotations';
import { cubeCoord, coordKey } from '@/game/coordinates';
import { createGame, cloneGameState } from '@/game/setup';
import type { GameState } from '@/types/game';
import type { BoardPiece } from '@/types/boardView';

// ---- resolveAnnotationDrag ----

describe('resolveAnnotationDrag', () => {
  it('returns a circle when release is the same cell as the origin', () => {
    const cell = cubeCoord(0, 0);
    expect(resolveAnnotationDrag(cell, cell)).toEqual({ type: 'circle', cell });
  });

  it('returns an arrow when release differs from the origin', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    expect(resolveAnnotationDrag(from, to)).toEqual({ type: 'arrow', from, to });
  });

  it('returns none when release is null (dragged off the board)', () => {
    expect(resolveAnnotationDrag(cubeCoord(0, 0), null)).toEqual({ type: 'none' });
  });
});

// ---- computeCheckersArrowPath ----

function isolatedState(): GameState {
  const state = cloneGameState(createGame(2));
  for (const key of state.board.keys()) {
    state.board.set(key, { type: 'empty' });
  }
  return state;
}

describe('computeCheckersArrowPath', () => {
  it('returns a straight 2-point line when the origin has no piece', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, 0);
    const state = isolatedState();
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line for a single-step reachable destination', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 0);
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when no jump path exists', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(5, 5); // nothing set up to reach here
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a bent polyline through the jump chain when the destination is a real multi-hop jump', () => {
    // Piece at (0,0), obstacles at (1,0) and (3,0) -> chain jump lands at (2,0) then (4,0).
    const from = cubeCoord(0, 0);
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    state.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    state.board.set(coordKey(cubeCoord(3, 0)), { type: 'piece', player: 1 });
    const to = cubeCoord(4, 0);
    const path = computeCheckersArrowPath(state, from, to);
    expect(path).toEqual([from, cubeCoord(2, 0), cubeCoord(4, 0)]);
  });
});

// ---- computeHexKnightArrowPath ----

function knightPiece(cell = cubeCoord(0, 0)): BoardPiece {
  return { id: 'k1', cell, color: 'red', pieceType: 'knight' };
}

describe('computeHexKnightArrowPath', () => {
  it('returns a straight 2-point line when there is no piece at the origin', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    expect(computeHexKnightArrowPath([], from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when the origin piece is not a knight', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    const pieces: BoardPiece[] = [{ id: 'r1', cell: from, color: 'red', pieceType: 'rook' }];
    expect(computeHexKnightArrowPath(pieces, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when the destination is not a knight-leap vector', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 1); // not in KNIGHT_LEAPS
    expect(computeHexKnightArrowPath([knightPiece(from)], from, to)).toEqual([from, to]);
  });

  it('returns a 3-point elbowed path for leap vector (1,-3): elbow at (0,-2)', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(0, -2), to]);
  });

  it('returns a 3-point elbowed path for leap vector (2,1): elbow at (2,0)', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, 1);
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(2, 0), to]);
  });

  it('works from a non-origin starting cell', () => {
    const from = cubeCoord(4, -8);
    const to = cubeCoord(5, -11); // from + (1,-3)
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(4, -10), to]);
  });
});
