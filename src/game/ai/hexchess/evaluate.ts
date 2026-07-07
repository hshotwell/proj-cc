import { cubeDistance } from '@/game/coordinates';
import type { HexChessState, HexPiece, HexPieceType } from '@/game/hexchess/state';
import { pseudoMovesForPiece } from '@/game/hexchess/moves';

// ---------------------------------------------------------------------------
// Material values in centipawns
// ---------------------------------------------------------------------------

const MATERIAL_VALUES: Record<HexPieceType, number> = {
  king:    0,    // not counted — game ends on mate
  queen:   900,
  rook:    500,
  bishop:  340,
  knight:  320,
  pawn:    100,
  soldier: 100,
};

// ---------------------------------------------------------------------------
// Piece-square table (PST) — central cell bonus
// ---------------------------------------------------------------------------

function pstBonus(piece: HexPiece): number {
  const dist = cubeDistance(piece.cell, { q: 0, r: 0, s: 0 });
  if (dist <= 1) return 10;
  if (dist <= 3) return 5;
  return 0;
}

function materialScore(state: HexChessState): number {
  let s0 = 0, s1 = 0;
  for (const p of state.pieces) {
    const v = MATERIAL_VALUES[p.type];
    if (p.player === 0) s0 += v; else s1 += v;
  }
  return s0 - s1;
}

function pstScore(state: HexChessState): number {
  let s0 = 0, s1 = 0;
  for (const p of state.pieces) {
    const bonus = pstBonus(p);
    if (p.player === 0) s0 += bonus; else s1 += bonus;
  }
  return s0 - s1;
}

// ---------------------------------------------------------------------------
// Mobility — count pseudo-moves per piece (no legality filtering, fast)
// TODO(future): use filtered legal moves for more accurate mobility score
// ---------------------------------------------------------------------------

function mobilityScore(state: HexChessState): number {
  let s0 = 0, s1 = 0;
  for (const p of state.pieces) {
    const n = pseudoMovesForPiece(state, p).length;
    if (p.player === 0) s0 += n; else s1 += n;
  }
  return (s0 - s1) * 2;
}

// ---------------------------------------------------------------------------
// King safety — count friendly pieces within cube-distance 2 of own king
// ---------------------------------------------------------------------------

function kingSafetyScore(state: HexChessState): number {
  let s0 = 0, s1 = 0;
  for (const player of [0, 1] as const) {
    const king = state.pieces.find(p => p.player === player && p.type === 'king');
    if (!king) continue;
    const nearby = state.pieces.filter(
      p => p.player === player && p.id !== king.id && cubeDistance(p.cell, king.cell) <= 2,
    ).length;
    if (player === 0) s0 += nearby * 5; else s1 += nearby * 5;
  }
  return s0 - s1;
}

// ---------------------------------------------------------------------------
// Top-level evaluate
// ---------------------------------------------------------------------------

/**
 * Returns a centipawn score from player 0's perspective.
 * Positive = good for player 0, negative = good for player 1.
 *
 * Formula: material + pieceSquare + mobility + kingSafety + tempo
 */
export function evaluate(state: HexChessState): number {
  if (state.result) {
    if (state.result.winner === 'draw') return 0;
    return state.result.winner === 0
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
  }

  const material  = materialScore(state);
  const pst       = pstScore(state);
  const mobility  = mobilityScore(state);
  const safety    = kingSafetyScore(state);
  const tempo     = state.currentPlayer === 0 ? 5 : -5;

  return material + pst + mobility + safety + tempo;
}
