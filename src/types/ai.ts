import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'evolved';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  evolved: 3,
};

export const AI_MOVE_LIMIT: Record<AIDifficulty, number> = {
  easy: 10,
  medium: 15,
  hard: 20,
  evolved: 20,
};

export const AI_THINK_DELAY = 400;
