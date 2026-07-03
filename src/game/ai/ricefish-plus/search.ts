import type { GameState, Move } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { findRicefishMove } from '@/game/ai/ricefish/search';
import { createHybridScore } from './evaluate';

/**
 * Pick a move using the Ricefish+ hybrid engine.
 *
 * Reuses Ricefish's alpha-beta / Max^n / TT / quiescence machinery but
 * substitutes the hybrid score function, which blends default-AI eval
 * with Ricefish eval based on how deep into the endgame the position is.
 */
export function findRicefishPlusMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
): Move | null {
  const scoreFn = createHybridScore(difficulty);
  return findRicefishMove(state, difficulty, personality, scoreFn);
}
