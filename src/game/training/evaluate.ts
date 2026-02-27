import type { GameState, PlayerIndex, Move } from '@/types/game';
import type { Genome } from '@/types/training';
import { getPlayerPieces } from '../setup';
import { getGoalPositionsForState, countPiecesInGoal, applyMove } from '../state';
import { cubeDistance, centroid } from '../coordinates';
import { getAllValidMoves } from '../moves';

// Default genome: extracted from hard/generalist values
export const DEFAULT_GENOME: Genome = {
  // Evaluation weights (generalist personality)
  progress: 3.0,
  goalDistance: 2.5,
  centerControl: 1.0,
  blocking: 1.0,
  jumpPotential: 0.5,
  // Scoring constants (from evaluatePosition)
  stragglerDivisor: 5,
  centerPieceValue: 3,
  blockingBaseValue: 5,
  jumpPotentialMultiplier: 2,
  jumpPotentialCap: 40,
  // Penalty constants (from search.ts)
  regressionMultiplier: 5,
  goalLeavePenalty: 60,
  repetitionPenalty: 80,
  cyclePenalty: 50,
  endgameThreshold: 7,
};

export function evaluateWithGenome(
  state: GameState,
  player: PlayerIndex,
  genome: Genome
): number {
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);

  // 1. Progress score: pieces already in goal (0-100)
  const inGoal = countPiecesInGoal(state, player);
  const progressScore = inGoal * 10;

  // 2. Goal distance score: how close pieces are to goal centroid (0-100)
  const distances = pieces.map((p) => cubeDistance(p, goalCenter));
  const sumDist = distances.reduce((a, b) => a + b, 0);
  const maxDist = 160;
  const goalDistanceScore = 100 - (Math.min(sumDist, maxDist) / maxDist) * 100;

  // 3. Straggler penalty (0 to negative)
  const maxPieceDist = distances.length > 0 ? Math.max(...distances) : 0;
  const stragglerScore = -(maxPieceDist * maxPieceDist) / genome.stragglerDivisor;

  // 4. Center control
  const origin = { q: 0, r: 0, s: 0 };
  const centerPieces = pieces.filter((p) => cubeDistance(p, origin) <= 4).length;
  const centerControlScore = centerPieces * genome.centerPieceValue;

  // 5. Blocking
  let blockingScore = 0;
  if (genome.blocking > 0) {
    for (const opponent of state.activePlayers) {
      if (opponent === player) continue;
      const opponentGoal = getGoalPositionsForState(state, opponent);
      const opponentInGoal = countPiecesInGoal(state, opponent);
      const leaderWeight = opponentInGoal > 5 ? 2 : 1;
      for (const goalPos of opponentGoal) {
        const occupied = pieces.some(
          (p) => p.q === goalPos.q && p.r === goalPos.r
        );
        if (occupied) {
          blockingScore += genome.blockingBaseValue * leaderWeight;
        }
      }
    }
  }

  // 6. Jump potential
  let jumpPotentialScore = 0;
  if (genome.jumpPotential > 0) {
    const allMoves = getAllValidMoves(state, player);
    const jumpMoves = allMoves.filter((m) => m.isJump);
    jumpPotentialScore = Math.min(
      jumpMoves.length * genome.jumpPotentialMultiplier,
      genome.jumpPotentialCap
    );
  }

  // Endgame focus
  const endgame = inGoal >= genome.endgameThreshold || state.winner !== null;
  const wProgress = endgame ? genome.progress * 2 : genome.progress;
  const wGoalDist = endgame ? genome.goalDistance * 2 : genome.goalDistance;
  const wStraggler = endgame ? 3.0 : 1.5;
  const wCenter = endgame ? 0 : genome.centerControl;
  const wBlocking = endgame ? 0 : genome.blocking;
  const wJumpPotential = endgame ? 0 : genome.jumpPotential;

  return (
    wProgress * progressScore +
    wGoalDist * goalDistanceScore +
    wStraggler * stragglerScore +
    wCenter * centerControlScore +
    wBlocking * blockingScore +
    wJumpPotential * jumpPotentialScore
  );
}

export function computeRegressionPenaltyWithGenome(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  genome: Genome
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const distAfter = cubeDistance(move.to, goalCenter);
  const distBefore = cubeDistance(move.from, goalCenter);
  const delta = distAfter - distBefore;

  let penalty = delta > 0 ? delta * genome.regressionMultiplier : 0;

  const fromIsGoal = goalPositions.some(
    (g) => g.q === move.from.q && g.r === move.from.r
  );
  const toIsGoal = goalPositions.some(
    (g) => g.q === move.to.q && g.r === move.to.r
  );
  if (fromIsGoal && !toIsGoal) {
    penalty += genome.goalLeavePenalty;
  }

  return penalty;
}

export function computeRepetitionPenaltyWithGenome(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  genome: Genome
): number {
  const numPlayers = state.activePlayers.length;
  const lookback = numPlayers * 6;
  const history = state.moveHistory;
  const start = Math.max(0, history.length - lookback);

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

  const destKey = `${move.to.q},${move.to.r}`;
  if (!previousPositions.has(destKey)) return 0;

  let reversals = 0;
  for (let i = start; i < history.length; i++) {
    const past = history[i];
    if (
      past.from.q === move.to.q &&
      past.from.r === move.to.r &&
      past.to.q === move.from.q &&
      past.to.r === move.from.r
    ) {
      reversals++;
    }
  }

  if (reversals >= 2) return Infinity;
  if (reversals === 1) return genome.repetitionPenalty;
  return genome.cyclePenalty;
}

// Genome-based move filtering (mirrors getTopMoves from search.ts)
function getTopMovesWithGenome(
  state: GameState,
  player: PlayerIndex,
  genome: Genome,
  limit: number
): Move[] {
  const moves = getAllValidMoves(state, player);
  if (moves.length <= limit) return moves;

  const scored = moves.map((move) => {
    const next = applyMove(state, move);
    let score = evaluateWithGenome(next, player, genome);
    score -= computeRegressionPenaltyWithGenome(state, move, player, genome);
    score -= computeRepetitionPenaltyWithGenome(state, move, player, genome);
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.move);
}

// Minimax with alpha-beta for 2-player genome-based search
function minimaxWithGenome(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: PlayerIndex,
  genome: Genome,
  moveLimit: number
): number {
  if (depth === 0) {
    return evaluateWithGenome(state, maximizingPlayer, genome);
  }

  const currentPlayer = state.currentPlayer;
  const isMaximizing = currentPlayer === maximizingPlayer;
  const moves = getTopMovesWithGenome(state, currentPlayer, genome, moveLimit);

  if (moves.length === 0) {
    return evaluateWithGenome(state, maximizingPlayer, genome);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimaxWithGenome(
        next, depth - 1, alpha, beta, maximizingPlayer, genome, moveLimit
      );
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimaxWithGenome(
        next, depth - 1, alpha, beta, maximizingPlayer, genome, moveLimit
      );
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Find best move using genome-based evaluation
// depth 2 + limit 12 for server training (balances quality vs compute time)
export function findBestMoveWithGenome(
  state: GameState,
  genome: Genome
): Move | null {
  const player = state.currentPlayer;
  const depth = 2;
  const moveLimit = 12;
  const moves = getTopMovesWithGenome(state, player, genome, moveLimit);

  if (moves.length === 0) return null;

  const is2Player = state.activePlayers.length === 2;

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const penalty =
      computeRegressionPenaltyWithGenome(state, move, player, genome) +
      computeRepetitionPenaltyWithGenome(state, move, player, genome);

    const next = applyMove(state, move);
    let score: number;

    if (is2Player) {
      score = minimaxWithGenome(
        next, depth - 1, -Infinity, Infinity, player, genome, moveLimit
      );
    } else {
      // For training we only use 2-player games, but support multi-player
      score = minimaxWithGenome(
        next, depth - 1, -Infinity, Infinity, player, genome, moveLimit
      );
    }

    score -= penalty;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  if (bestScore === -Infinity) {
    bestMove = moves[0];
  }

  return bestMove;
}
