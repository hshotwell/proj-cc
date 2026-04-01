import type { GameState, PlayerIndex, CubeCoord, Move } from '@/types/game';
import { coordKey } from '../coordinates';
import { getAllValidMoves } from '../moves';

export interface OpeningMove {
  from: CubeCoord;
  to: CubeCoord;
}

export interface OpeningLine {
  id: string;
  name: string;
  description: string;
  moves: OpeningMove[]; // Player-0 canonical coordinates
}

// ── Coordinate rotation ─────────────────────────────────────────────────────
// CCW 60° rotation formula: (q, r, s) → (-r, -s, -q)
// Since s = -q - r, this simplifies to: new_q = -r, new_r = q+r, new_s = -q
function rotateOnce(c: CubeCoord): CubeCoord {
  return { q: -c.r, r: c.q + c.r, s: -c.q };
}

function rotateCoord(c: CubeCoord, times: number): CubeCoord {
  let result = c;
  for (let i = 0; i < times; i++) {
    result = rotateOnce(result);
  }
  return result;
}

// Number of CCW 60° rotations to transform from player-0 coords to each player's coords.
// Board clockwise order: 0 → 4 → 3 → 2 → 1 → 5 → 0
const PLAYER_ROTATIONS: Partial<Record<PlayerIndex, number>> = {
  0: 0,
  4: 1,
  3: 2,
  2: 3,
  1: 4,
  5: 5,
};

function transformMove(move: OpeningMove, player: PlayerIndex): OpeningMove {
  const rotations = PLAYER_ROTATIONS[player] ?? 0;
  return {
    from: rotateCoord(move.from, rotations),
    to: rotateCoord(move.to, rotations),
  };
}


export const OPENING_LINES: OpeningLine[] = [
  {
    id: 'none',
    name: 'None',
    description: 'No opening book — AI evaluates from the first move',
    moves: [],
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get moves for the given opening ID.
 * Built-in ids return from OPENING_LINES.
 * Custom ids look up from the caller-provided customOpenings list.
 */
export function getMovesForOpening(
  openingId: string,
  customOpenings: Array<{ id: string; moves: OpeningMove[] }> = []
): OpeningMove[] {
  if (!openingId || openingId === 'none') return [];
  const builtin = OPENING_LINES.find((l) => l.id === openingId);
  if (builtin) return builtin.moves;
  const custom = customOpenings.find((o) => o.id === openingId);
  return custom?.moves ?? [];
}

/**
 * Returns the next book move for the given player if the opening still applies,
 * or null if the opening is exhausted, doesn't apply, or the board has diverged.
 *
 * @param state     Current game state
 * @param player    The player to move
 * @param moves     The canonical (player-0) opening moves to follow
 * @param maxMoves  Optional cap on opening length (for difficulty scaling)
 */
export function getOpeningMove(
  state: GameState,
  player: PlayerIndex,
  moves: OpeningMove[],
  maxMoves?: number
): Move | null {
  if (moves.length === 0) return null;

  const limit = maxMoves !== undefined ? Math.min(maxMoves, moves.length) : moves.length;

  // Collect this player's moves in chronological order
  const playerMoves = state.moveHistory.filter(m => m.player === player);
  const playerMoveCount = playerMoves.length;
  if (playerMoveCount >= limit) return null; // Opening exhausted or difficulty cap reached

  // Verify the sequence was followed without interruption: every previous move by
  // this player must match the corresponding opening move. If any move deviated
  // (because the opening was skipped and a different move was made instead),
  // treat the opening as permanently cancelled for this game.
  for (let i = 0; i < playerMoveCount; i++) {
    const expected = transformMove(moves[i], player);
    const actual = playerMoves[i];
    if (
      actual.from.q !== expected.from.q || actual.from.r !== expected.from.r ||
      actual.to.q   !== expected.to.q   || actual.to.r   !== expected.to.r
    ) {
      return null;
    }
  }

  // Transform the canonical move to this player's coordinates
  const canonical = moves[playerMoveCount];
  const transformed = transformMove(canonical, player);

  // Verify the piece is still at its expected starting position
  const fromKey = coordKey(transformed.from);
  const fromContent = state.board.get(fromKey);
  if (fromContent?.type !== 'piece' || fromContent.player !== player) return null;

  // Verify the destination is empty
  const toKey = coordKey(transformed.to);
  const toContent = state.board.get(toKey);
  if (toContent?.type !== 'empty') return null;

  // Match against the legal move list (ensures we don't return an illegal move)
  const validMoves = getAllValidMoves(state, player);
  const match = validMoves.find(
    m =>
      m.from.q === transformed.from.q &&
      m.from.r === transformed.from.r &&
      m.to.q === transformed.to.q &&
      m.to.r === transformed.to.r
  );

  return match ?? null;
}
