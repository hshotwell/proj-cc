import type { PlayerIndex } from './game';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIPersonality = 'generalist' | 'defensive' | 'aggressive';
export type AIEngine = 'default' | 'ricefish' | 'ricefish-plus';

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
  // Optional engine selector. When missing, treat as 'default' for
  // backward compatibility with games saved before the field existed.
  engine?: AIEngine;
}

/** Time budget for the Ricefish engine's iterative deepening (milliseconds). */
export const RICEFISH_TIME_BUDGET_MS: Record<AIDifficulty, number> = {
  easy:   500,
  medium: 1500,
  hard:   4000,
};

/** Search depth for the Ricefish engine in 2-player games. */
export const RICEFISH_DEPTH_2P: Record<AIDifficulty, number> = {
  easy:   2,
  medium: 3,
  hard:   4,
};

/** Search depth for the Ricefish engine in 3+ player games (branching is wider). */
export const RICEFISH_DEPTH_MP: Record<AIDifficulty, number> = {
  easy:   1,
  medium: 2,
  hard:   3,
};

/**
 * Ricefish+ (hybrid) reuses Ricefish's search shell, so it reuses the same
 * search-shape constants. Aliased here so the engine dispatcher can look
 * them up by name and any future divergence is a one-line change.
 */
export const RICEFISH_PLUS_TIME_BUDGET_MS = RICEFISH_TIME_BUDGET_MS;
export const RICEFISH_PLUS_DEPTH_2P = RICEFISH_DEPTH_2P;
export const RICEFISH_PLUS_DEPTH_MP = RICEFISH_DEPTH_MP;

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
