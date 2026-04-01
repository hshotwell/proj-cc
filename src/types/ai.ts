import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'evolved';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

/** Base mid-game search depth (all difficulties use depth-2 in mid-game). */
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 2,
  evolved: 2,
};

/** Deeper search used in early-game and end-game phases. */
export const AI_OPENING_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
  evolved: 4,
};

export const AI_ENDGAME_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
  evolved: 4,
};

export const AI_MOVE_LIMIT: Record<AIDifficulty, number> = {
  easy: 10,
  medium: 15,
  hard: 20,
  evolved: 20,
};

export const AI_THINK_DELAY = 400;
