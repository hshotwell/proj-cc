import type { Move, GameState, PlayerIndex } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { AI_DEPTH, AI_MOVE_LIMIT } from '@/types/ai';
import { getAllValidMoves } from '../moves';
import { applyMove, getGoalPositions } from '../state';
import { cubeDistance } from '../coordinates';
import { evaluatePosition } from './evaluate';
import { centroid } from '../coordinates';
import { loadEvolvedGenome } from '../training/persistence';
import {
  computeRegressionPenaltyWithGenome,
  computeRepetitionPenaltyWithGenome,
} from '../training/evaluate';

export function computeRegressionPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  difficulty?: AIDifficulty
): number {
  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return computeRegressionPenaltyWithGenome(state, move, player, genome);
    }
  }

  const goalPositions = getGoalPositions(player);
  const goalCenter = centroid(goalPositions);
  const distAfter = cubeDistance(move.to, goalCenter);
  const distBefore = cubeDistance(move.from, goalCenter);
  const delta = distAfter - distBefore;

  let penalty = delta > 0 ? delta * 5 : 0;

  // Steep penalty for leaving an actual goal position — almost always wrong,
  // but not an absolute veto so a genuinely great chain jump can still overcome it.
  const fromIsGoal = goalPositions.some((g) => g.q === move.from.q && g.r === move.from.r);
  const toIsGoal = goalPositions.some((g) => g.q === move.to.q && g.r === move.to.r);
  if (fromIsGoal && !toIsGoal) {
    penalty += 60;
  }

  return penalty;
}

export function computeRepetitionPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  difficulty?: AIDifficulty
): number {
  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return computeRepetitionPenaltyWithGenome(state, move, player, genome);
    }
  }

  const numPlayers = state.activePlayers.length;
  const lookback = numPlayers * 6;
  const history = state.moveHistory;
  const start = Math.max(0, history.length - lookback);

  // Trace this piece's position history backward.
  // Walk the move history in reverse; whenever a past move's destination
  // matches our current trace position, that move brought this piece there,
  // so the piece was previously at past.from.
  const previousPositions = new Set<string>();
  let tracePos = move.from;
  for (let i = history.length - 1; i >= start; i--) {
    const past = history[i];
    if (past.to.q === tracePos.q && past.to.r === tracePos.r) {
      const key = `${past.from.q},${past.from.r}`;
      previousPositions.add(key);
      tracePos = past.from;
    }
  }

  // Check if the proposed destination is a position this piece previously occupied
  const destKey = `${move.to.q},${move.to.r}`;
  if (!previousPositions.has(destKey)) return 0;

  // Count how many times this piece has cycled through this destination
  // by checking exact reversals too (the most egregious case)
  let reversals = 0;
  for (let i = start; i < history.length; i++) {
    const past = history[i];
    if (
      past.from.q === move.to.q && past.from.r === move.to.r &&
      past.to.q === move.from.q && past.to.r === move.from.r
    ) {
      reversals++;
    }
  }

  // Escalating penalties: cycle detected = at least 50,
  // exact reversals stack on top
  if (reversals >= 2) return Infinity;
  if (reversals === 1) return 80;
  return 50;
}

function getTopMoves(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  limit: number
): Move[] {
  const moves = getAllValidMoves(state, player);
  if (moves.length <= limit) return moves;

  // Score each move with a greedy 1-ply eval, penalizing regressions and repetitions
  const scored = moves.map((move) => {
    const next = applyMove(state, move);
    let score = evaluatePosition(next, player, personality, difficulty);
    score -= computeRegressionPenalty(state, move, player, difficulty);
    score -= computeRepetitionPenalty(state, move, player, difficulty);
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.move);
}

// Minimax with alpha-beta pruning for 2-player games
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  if (depth === 0) {
    return evaluatePosition(state, maximizingPlayer, personality, difficulty);
  }

  const currentPlayer = state.currentPlayer;
  const isMaximizing = currentPlayer === maximizingPlayer;
  const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, currentPlayer, personality, difficulty, limit);

  if (moves.length === 0) {
    return evaluatePosition(state, maximizingPlayer, personality, difficulty);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimax(next, depth - 1, alpha, beta, maximizingPlayer, personality, difficulty);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimax(next, depth - 1, alpha, beta, maximizingPlayer, personality, difficulty);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Max^n search for 3+ player games: each player maximizes their own score
function maxn(
  state: GameState,
  depth: number,
  aiPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  if (depth === 0) {
    return evaluatePosition(state, aiPlayer, personality, difficulty);
  }

  const currentPlayer = state.currentPlayer;
  const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, currentPlayer, personality, difficulty, limit);

  if (moves.length === 0) {
    return evaluatePosition(state, aiPlayer, personality, difficulty);
  }

  if (currentPlayer === aiPlayer) {
    // AI's turn: maximize own score
    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const score = maxn(next, depth - 1, aiPlayer, personality, difficulty);
      best = Math.max(best, score);
    }
    return best;
  } else {
    // Other player's turn: assume they maximize their own score
    // which is equivalent to minimizing the AI's score (approximately)
    let worst = Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const score = maxn(next, depth - 1, aiPlayer, personality, difficulty);
      worst = Math.min(worst, score);
    }
    return worst;
  }
}

export function findBestMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality
): Move | null {
  const player = state.currentPlayer;
  const depth = AI_DEPTH[difficulty];
  const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, player, personality, difficulty, limit);

  if (moves.length === 0) return null;

  // Easy (depth 1): pick randomly from top 3, filtering out vetoed moves
  if (difficulty === 'easy') {
    const top = moves.slice(0, Math.min(3, moves.length));
    const viable = top.filter(
      (m) => computeRepetitionPenalty(state, m, player, difficulty) < Infinity
    );
    const pool = viable.length > 0 ? viable : top;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const is2Player = state.activePlayers.length === 2;

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const penalty =
      computeRegressionPenalty(state, move, player, difficulty) +
      computeRepetitionPenalty(state, move, player, difficulty);

    const next = applyMove(state, move);
    let score: number;

    if (is2Player) {
      score = minimax(next, depth - 1, -Infinity, Infinity, player, personality, difficulty);
    } else {
      score = maxn(next, depth - 1, player, personality, difficulty);
    }

    score -= penalty;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Fallback: if all moves were vetoed (-Infinity), pick the first move anyway
  if (bestScore === -Infinity) {
    bestMove = moves[0];
  }

  return bestMove;
}
