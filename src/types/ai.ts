import type { PlayerIndex } from './game';
import type { DefaultGenome, RicefishGenome, RicefishPlusGenome } from '@/game/training-v2/genomes';

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

/**
 * Base mid-game search depth. `hard` bumped 3->4: the default engine's
 * interior search nodes now use a cheap O(1) move-ordering heuristic
 * (+ killer moves + a real position hash) instead of evaluating every
 * candidate move with the full heuristic stack, so the extra ply fits
 * comfortably in the same time budget. This is a ceiling, not a target —
 * iterative deepening only reaches it if the budget allows.
 */
export const AI_DEPTH: Record<AIDifficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 4,
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

export type ChampionGenomeSet = {
  default:         Record<AIPersonality, DefaultGenome>;
  ricefish:        Record<AIPersonality, RicefishGenome>;
  'ricefish-plus': Record<AIPersonality, RicefishPlusGenome>;
};

/**
 * Master switch: when true, the client attempts to fetch trained champion
 * genomes from Convex and passes them to the worker. When false, engines
 * always use their hard-coded defaults.
 */
export const USE_TRAINED_GENOMES = true;

/**
 * Time budget for iterative deepening search (milliseconds). `hard`/`medium`
 * bumped up now that interior search nodes are much cheaper per-node (see
 * AI_DEPTH comment) — the search reaches further within the same wall clock
 * time even without a budget increase; this bump lets it go further still.
 * `easy` stays put: its character is intentional weakness/randomness via
 * move filtering, not raw search depth.
 */
export const AI_TIME_BUDGET_MS: Record<AIDifficulty, number> = {
  easy:   250,
  medium: 900,
  hard:   2000,
};
