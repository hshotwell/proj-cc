import type { CubeCoord, GameState } from '@/types/game';
import type { BoardPiece } from '@/types/boardView';
import { cubeAdd, cubeSubtract, cubeEquals, coordKey } from '@/game/coordinates';
import { findMovePath } from '@/game/pathfinding';
import { EDGE_DIRECTIONS, KNIGHT_LEAPS } from '@/game/hexchess/directions';

// ---------------------------------------------------------------------------
// Drag → circle/arrow/none decision
// ---------------------------------------------------------------------------

export type AnnotationDragResult =
  | { type: 'circle'; cell: CubeCoord }
  | { type: 'arrow'; from: CubeCoord; to: CubeCoord }
  | { type: 'none' };

export function resolveAnnotationDrag(
  dragOrigin: CubeCoord,
  releaseCell: CubeCoord | null,
): AnnotationDragResult {
  if (releaseCell === null) return { type: 'none' };
  if (cubeEquals(dragOrigin, releaseCell)) return { type: 'circle', cell: dragOrigin };
  return { type: 'arrow', from: dragOrigin, to: releaseCell };
}

// ---------------------------------------------------------------------------
// Chinese Checkers: bend the arrow through a real jump chain
// ---------------------------------------------------------------------------

export function computeCheckersArrowPath(
  state: GameState,
  from: CubeCoord,
  to: CubeCoord,
): CubeCoord[] {
  const content = state.board.get(coordKey(from));
  if (!content || content.type !== 'piece') return [from, to];

  const path = findMovePath(state, from, to, content.player);
  if (!path || !path.some(m => m.isJump)) return [from, to];

  return [from, ...path.map(m => m.to)];
}

// ---------------------------------------------------------------------------
// Hex chess: bend the arrow into a knight-leap elbow
// ---------------------------------------------------------------------------

// Every KNIGHT_LEAPS vector decomposes uniquely as 2*e1 + e2 for some pair
// of EDGE_DIRECTIONS (e1, e2) — mirrors the same idea forwardEdges() uses
// one level down (finding the two edges that sum to a diagonal). Brute
// force over the 6 edge directions (36 combinations) is intentionally fine
// here: this only ever runs when actually rendering a knight annotation
// arrow, not in any hot path.
function findElbowOffset(leap: CubeCoord): CubeCoord | null {
  for (const e1 of EDGE_DIRECTIONS) {
    for (const e2 of EDGE_DIRECTIONS) {
      const candidate = cubeAdd(cubeAdd(e1, e1), e2);
      if (cubeEquals(candidate, leap)) {
        return cubeAdd(e1, e1);
      }
    }
  }
  return null;
}

export function computeHexKnightArrowPath(
  pieces: BoardPiece[],
  from: CubeCoord,
  to: CubeCoord,
): CubeCoord[] {
  const mover = pieces.find(p => cubeEquals(p.cell, from));
  if (mover?.pieceType !== 'knight') return [from, to];

  const delta = cubeSubtract(to, from);
  const leap = KNIGHT_LEAPS.find(l => cubeEquals(l, delta));
  if (!leap) return [from, to];

  const elbowOffset = findElbowOffset(leap);
  if (!elbowOffset) return [from, to]; // defensive — every KNIGHT_LEAPS vector has a decomposition

  return [from, cubeAdd(from, elbowOffset), to];
}
