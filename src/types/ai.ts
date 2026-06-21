import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

/** Base mid-game search depth. */
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 3,
};

/** Deeper search used in early-game and end-game phases. */
export const AI_OPENING_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
};

export const AI_ENDGAME_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
};

export const AI_MOVE_LIMIT: Record<AIDifficulty, number> = {
  easy: 10,
  medium: 15,
  hard: 8,
};

export const AI_THINK_DELAY = 400;

/** Time budget for iterative deepening search (milliseconds). */
export const AI_TIME_BUDGET_MS: Record<AIDifficulty, number> = {
  easy:   250,
  medium: 600,
  hard:   1200,
};
