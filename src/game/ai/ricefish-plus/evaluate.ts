import type { GameState, PlayerIndex } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { countPiecesInGoal, getGoalPositionsForState, hasPlayerWon } from '@/game/state';
import {
  ricefishScore,
  MATE,
  type GoalCellsCache,
  type RicefishScoreFn,
} from '@/game/ai/ricefish/evaluate';
import { evaluatePosition } from '@/game/ai/evaluate';

export { MATE };

/**
 * Normalization divisors chosen so that a typical mid-game position gives
 * both terms roughly ±1-magnitude. Empirically tuned starting values; adjust
 * after playing a few games and dumping representative eval scores.
 *
 * Default AI eval ranges in the hundreds/low-thousands (weighted personality
 * terms summed). Ricefish eval ranges in the tens (hex distances).
 */
export const DEFAULT_NORM = 100;
export const RICEFISH_NORM = 30;

/**
 * Fraction of any player's goal that, when filled, drives the phase blend
 * factor α to 1 (pure Ricefish eval). Below this, α ramps linearly from 0.
 */
export const ALPHA_ENDGAME_THRESHOLD = 0.7;

/**
 * Phase blend factor α ∈ [0, 1]:
 *   α = clamp(maxFill / ALPHA_ENDGAME_THRESHOLD, 0, 1)
 * where maxFill = max over active players of (pieces_in_goal / goal_size).
 *
 * Using the max across all players (not just the current player) means both
 * sides use the same eval regime when the position is tactically endgame-
 * shaped for anyone — avoids one side seeing endgame patterns while the
 * other sees midgame.
 */
export function computePhaseAlpha(state: GameState): number {
  let maxFill = 0;
  for (const player of state.activePlayers) {
    const goals = getGoalPositionsForState(state, player);
    if (goals.length === 0) continue;
    const fill = countPiecesInGoal(state, player) / goals.length;
    if (fill > maxFill) maxFill = fill;
  }
  const ratio = maxFill / ALPHA_ENDGAME_THRESHOLD;
  if (ratio >= 1) return 1;
  if (ratio <= 0) return 0;
  return ratio;
}

/**
 * Factory: given a difficulty setting, returns a `RicefishScoreFn` that
 * computes the hybrid score. The difficulty is captured in a closure so
 * `evaluatePosition` can receive it while keeping the returned function's
 * signature compatible with the score function type Ricefish's search
 * shell expects.
 */
export function createHybridScore(difficulty: AIDifficulty): RicefishScoreFn {
  return (
    state: GameState,
    player: PlayerIndex,
    personality: AIPersonality,
    cache?: GoalCellsCache,
  ): number => {
    if (hasPlayerWon(state, player)) return MATE;

    const alpha = computePhaseAlpha(state);
    const defaultTerm = evaluatePosition(state, player, personality, difficulty) / DEFAULT_NORM;
    const ricefishTerm = ricefishScore(state, player, personality, cache) / RICEFISH_NORM;
    return (1 - alpha) * defaultTerm + alpha * ricefishTerm;
  };
}
