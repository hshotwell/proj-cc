import type { Move } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import { cubeDistance } from '@/game/coordinates';

/**
 * Score a move for ordering purposes (descending). Mirrors Ricefish's
 * `MoveList::rate()` which scores by hex distance traveled, with two small
 * extensions:
 *   - jumps get a +1 nudge over equally long steps (Ricefish picks them first
 *     in `add_moves` by generating jumps before steps);
 *   - aggressive personality adds a bonus proportional to distance traveled.
 */
export function ricefishOrderingScore(move: Move, personality: AIPersonality): number {
  const traveled = cubeDistance(move.from, move.to);
  let score = traveled + (move.isJump ? 1 : 0);
  // Swaps look unimpressive by distance alone (always 1) but are often the
  // only way to displace a blocker. Boost them so alpha-beta examines them
  // early enough to actually keep the line.
  if (move.isSwap) score += 5;
  if (personality === 'aggressive') {
    score += 0.5 * traveled;
  }
  return score;
}

/**
 * Order an in-place mutable move array in descending ordering score. Stable —
 * preserves original order among equal-score moves.
 */
export function orderMoves(moves: Move[], personality: AIPersonality): Move[] {
  // Decorate-sort-undecorate to keep the sort stable across runtimes (the
  // ECMAScript spec only guarantees stable Array.prototype.sort since 2019,
  // but we want our own sort key array for deterministic tie-breaking).
  const tagged = moves.map((m, i) => ({ m, i, k: ricefishOrderingScore(m, personality) }));
  tagged.sort((a, b) => b.k - a.k || a.i - b.i);
  return tagged.map((t) => t.m);
}
