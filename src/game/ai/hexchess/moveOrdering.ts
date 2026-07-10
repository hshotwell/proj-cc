import type { HexChessState, HexMove, HexPieceType } from '@/game/hexchess/state';

// ---------------------------------------------------------------------------
// Piece values for MVV-LVA ordering
// ---------------------------------------------------------------------------

export const PIECE_VALUE: Record<HexPieceType, number> = {
  king:    10000,
  queen:    900,
  rook:     500,
  bishop:   340,
  knight:   320,
  pawn:     100,
  soldier:  100,
};

// ---------------------------------------------------------------------------
// Score a single move for ordering purposes.
// Captures get a positive score = 10 * victimValue - attackerValue.
// Non-captures score 0 and fall after all captures.
// ---------------------------------------------------------------------------

function scoreForOrdering(state: HexChessState, move: HexMove): number {
  if (!move.capture) return 0;
  const attacker = state.pieces.find(p => p.id === move.pieceId);
  const victim   = state.pieces.find(p => p.id === move.capture!.pieceId);
  if (!attacker || !victim) return 0;
  return 10 * PIECE_VALUE[victim.type] - PIECE_VALUE[attacker.type];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `moves` sorted so that captures come before quiet moves,
 * and among captures the highest-value victim / lowest-value attacker comes
 * first (MVV-LVA).  Quiet moves preserve their original relative order.
 */
export function orderMoves(state: HexChessState, moves: HexMove[]): HexMove[] {
  // Separate captures from quiet moves so quiet moves keep their original order.
  const captures: Array<{ move: HexMove; score: number }> = [];
  const quiets: HexMove[] = [];

  for (const m of moves) {
    if (m.capture) {
      captures.push({ move: m, score: scoreForOrdering(state, m) });
    } else {
      quiets.push(m);
    }
  }

  captures.sort((a, b) => b.score - a.score);

  return [...captures.map(c => c.move), ...quiets];
}
