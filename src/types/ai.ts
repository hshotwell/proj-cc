import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export type AIPlayerMap = Partial<Record<PlayerIndex, AIConfig>>;

export const AI_THINK_DELAY = 400;
