import { cubeDistance } from '@/game/coordinates';
import type { HexChessState, HexPiece, HexPieceType, HexPlayerIndex } from '@/game/hexchess/state';
import { pseudoMovesForPiece } from '@/game/hexchess/moves';
import { isEliminated, livingPlayers } from '@/game/hexchess/board';

// ---------------------------------------------------------------------------
// Material values in centipawns
// ---------------------------------------------------------------------------

const MATERIAL_VALUES: Record<HexPieceType, number> = {
  king:    0,    // not counted — game ends on mate / king capture
  queen:   900,
  rook:    500,
  bishop:  340,
  knight:  320,
  pawn:    100,
  soldier: 100,
};

// 2-player mate score — a large FINITE value. ±Infinity here would make every
// mated line compare equal (Infinity > Infinity is false), so minimax could
// never pick a "least bad" move and would return null while legal moves still
// existed, stalling the game.
export const MATE_CP = 1_000_000;

// Max^n terminal scores — large finite values keep vector comparisons sane.
const MAXN_WIN = 1_000_000_000;
const MAXN_ELIMINATED = -1_000_000;
// Every eliminated opponent is a step toward winning — worth far more than
// any material swing (otherwise removing a weak opponent can LOWER a seat's
// "minus average opponent" score, since the weak army left the average).
const MAXN_ELIMINATION_BONUS = 10_000;

// ---------------------------------------------------------------------------
// Piece-square table (PST) — central cell bonus
// ---------------------------------------------------------------------------

function pstBonus(piece: HexPiece): number {
  const dist = cubeDistance(piece.cell, { q: 0, r: 0, s: 0 });
  if (dist <= 1) return 10;
  if (dist <= 3) return 5;
  return 0;
}

/** material + pst + mobility + king safety for one living seat. */
function seatScore(state: HexChessState, seat: HexPlayerIndex): number {
  let material = 0;
  let pst = 0;
  let mobility = 0;
  let king: HexPiece | null = null;

  for (const p of state.pieces) {
    if (p.player !== seat) continue;
    material += MATERIAL_VALUES[p.type];
    pst += pstBonus(p);
    mobility += pseudoMovesForPiece(state, p).length;
    if (p.type === 'king') king = p;
  }

  let safety = 0;
  if (king) {
    const kingCell = king.cell;
    const kingId = king.id;
    const nearby = state.pieces.filter(
      p => p.player === seat && p.id !== kingId && cubeDistance(p.cell, kingCell) <= 2,
    ).length;
    safety = nearby * 5;
  }

  return material + pst + mobility * 2 + safety;
}

// ---------------------------------------------------------------------------
// Top-level evaluate — 2-player (checkmate mode)
// ---------------------------------------------------------------------------

/**
 * Returns a centipawn score from the FIRST seat's perspective
 * (state.activePlayers[0]; seat 0 in a standard 2-player game).
 * Positive = good for the first seat, negative = good for the second.
 *
 * Formula: material + pieceSquare + mobility + kingSafety + tempo
 */
export function evaluate(state: HexChessState): number {
  const [seatA, seatB] = state.activePlayers;

  if (state.result) {
    if (state.result.winner === 'draw') return 0;
    return state.result.winner === seatA ? MATE_CP : -MATE_CP;
  }

  const tempo = state.currentPlayer === seatA ? 5 : -5;
  return seatScore(state, seatA) - seatScore(state, seatB) + tempo;
}

// ---------------------------------------------------------------------------
// Max^n vector evaluation — king-capture mode (3+ players)
// ---------------------------------------------------------------------------

/**
 * Returns one absolute score per seat (higher = better for that seat).
 * Each living seat scores its own material/position minus the average of the
 * living opponents', so capturing an enemy piece helps and losing one hurts.
 * Eliminated seats score a large negative; a decided game scores the winner
 * a large positive.
 */
export function evaluateVector(state: HexChessState): Record<number, number> {
  const scores: Record<number, number> = {};

  if (state.result) {
    for (const seat of state.activePlayers) {
      if (state.result.winner === 'draw') {
        scores[seat] = isEliminated(state, seat) ? MAXN_ELIMINATED : 0;
      } else {
        scores[seat] = state.result.winner === seat ? MAXN_WIN : MAXN_ELIMINATED;
      }
    }
    return scores;
  }

  const living = livingPlayers(state);
  const raw: Record<number, number> = {};
  for (const seat of living) {
    raw[seat] = seatScore(state, seat);
  }

  for (const seat of state.activePlayers) {
    if (isEliminated(state, seat)) {
      scores[seat] = MAXN_ELIMINATED;
      continue;
    }
    const opponents = living.filter(s => s !== seat);
    const oppAvg = opponents.length > 0
      ? opponents.reduce((sum: number, s) => sum + raw[s], 0) / opponents.length
      : 0;
    const eliminatedOpponents = state.activePlayers.length - 1 - opponents.length;
    scores[seat] =
      raw[seat] - oppAvg +
      eliminatedOpponents * MAXN_ELIMINATION_BONUS +
      (state.currentPlayer === seat ? 5 : 0);
  }
  return scores;
}

export { MAXN_WIN, MAXN_ELIMINATED };
