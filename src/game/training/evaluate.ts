import type { GameState, PlayerIndex, Move, CubeCoord, CellContent } from '@/types/game';
import type { Genome } from '@/types/training';
import { getPlayerPieces } from '../setup';
import { getGoalPositionsForState, countPiecesInGoal, applyMove } from '../state';
import { cubeDistance, centroid, cubeAdd, coordKey } from '../coordinates';
import { getAllValidMoves } from '../moves';
import { DIRECTIONS } from '../constants';

// ── Pattern scoring helpers ────────────────────────────────────────────────

/** Recursively find the maximum chain-jump depth reachable from `from`. */
function getMaxChainDepth(
  from: CubeCoord,
  board: Map<string, CellContent>,
  visited: Set<string>
): number {
  const newVisited = new Set(visited);
  newVisited.add(coordKey(from));
  let max = 0;
  for (const dir of DIRECTIONS) {
    const over = cubeAdd(from, dir);
    const land = cubeAdd(over, dir);
    const landKey = coordKey(land);
    if (newVisited.has(landKey)) continue;
    const overContent = board.get(coordKey(over));
    const landContent = board.get(landKey);
    if (overContent?.type === 'piece' && landContent?.type === 'empty') {
      const deeper = getMaxChainDepth(land, board, newVisited);
      max = Math.max(max, 1 + deeper);
    }
  }
  return max;
}

/**
 * Sum of max chain-jump depth across all pieces.
 * Exported for testing.
 */
export function computeChainDepth(
  pieces: CubeCoord[],
  board: Map<string, CellContent>
): number {
  let total = 0;
  for (const piece of pieces) {
    total += getMaxChainDepth(piece, board, new Set());
  }
  return total;
}

/**
 * For each non-goal piece, count how many move options (steps + jump landings)
 * are closer to goal and currently empty. More open options = more clearance.
 * Exported for testing.
 */
export function computePathClearance(
  pieces: CubeCoord[],
  goalCenter: CubeCoord,
  goalSet: Set<string>,
  board: Map<string, CellContent>
): number {
  let total = 0;
  for (const piece of pieces) {
    if (goalSet.has(coordKey(piece))) continue;
    const distToGoal = cubeDistance(piece, goalCenter);
    let openOptions = 0;
    for (const dir of DIRECTIONS) {
      const adj = cubeAdd(piece, dir);
      const adjContent = board.get(coordKey(adj));
      if (adjContent?.type === 'piece') {
        const landing = cubeAdd(adj, dir);
        const landContent = board.get(coordKey(landing));
        if (
          landContent?.type === 'empty' &&
          cubeDistance(landing, goalCenter) < distToGoal
        ) {
          openOptions++;
        }
      } else if (adjContent?.type === 'empty') {
        if (cubeDistance(adj, goalCenter) < distToGoal) {
          openOptions++;
        }
      }
    }
    total += openOptions;
  }
  return total;
}

/**
 * Standard deviation of piece positions from group centroid.
 * Higher = more spread out (penalised by genome.formationSpread).
 * Exported for testing.
 */
export function computeFormationSpread(pieces: CubeCoord[]): number {
  if (pieces.length < 2) return 0;
  const cx = pieces.reduce((s, p) => s + p.q, 0) / pieces.length;
  const cy = pieces.reduce((s, p) => s + p.r, 0) / pieces.length;
  const variance =
    pieces.reduce((s, p) => {
      const dx = p.q - cx;
      const dy = p.r - cy;
      return s + dx * dx + dy * dy;
    }, 0) / pieces.length;
  return Math.sqrt(variance);
}

/**
 * Bell-curve bonus for having a lead piece 2–4 cells ahead of group average.
 * Peaks at gap=3, falls off for leaders that are too close or too far ahead.
 * Exported for testing.
 */
export function computeVanguardBonus(
  pieces: CubeCoord[],
  goalCenter: CubeCoord
): number {
  if (pieces.length < 2) return 0;
  const distances = pieces.map((p) => cubeDistance(p, goalCenter));
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const minDist = Math.min(...distances);
  if (minDist === 0) return 0; // All pieces at or past goal center — no useful vanguard
  const gap = avgDist - minDist;
  // Bell curve: peak at gap=3, sigma=2
  return Math.exp(-((gap - 3) ** 2) / 8);
}

/**
 * Like computeChainDepth but only for pieces NOT in the goal zone.
 * Rewards straggler pieces that have a jump chain set up.
 * Exported for testing.
 */
export function computeStragglersChainDepth(
  pieces: CubeCoord[],
  goalSet: Set<string>,
  board: Map<string, CellContent>
): number {
  let total = 0;
  for (const piece of pieces) {
    if (goalSet.has(coordKey(piece))) continue;
    total += getMaxChainDepth(piece, board, new Set());
  }
  return total;
}

/**
 * For each non-goal piece, checks if it can jump into a goal cell in one hop
 * (adjacent piece exists, landing cell is a goal cell, landing cell is empty).
 * Returns total count of such goal-entry opportunities.
 * Exported for testing.
 */
export function computeGoalEntryBonus(
  pieces: CubeCoord[],
  goalSet: Set<string>,
  board: Map<string, CellContent>
): number {
  let count = 0;
  for (const piece of pieces) {
    if (goalSet.has(coordKey(piece))) continue;
    for (const dir of DIRECTIONS) {
      const over = cubeAdd(piece, dir);
      const land = cubeAdd(over, dir);
      const landKey = coordKey(land);
      const overContent = board.get(coordKey(over));
      const landContent = board.get(landKey);
      if (
        overContent?.type === 'piece' &&
        goalSet.has(landKey) &&
        landContent?.type === 'empty'
      ) {
        count++;
      }
    }
  }
  return count;
}

// Default genome: extracted from hard/generalist values
export const DEFAULT_GENOME: Genome = {
  // Evaluation weights (generalist personality)
  progress: 3.0,
  goalDistance: 2.5,
  centerControl: 1.0,
  blocking: 1.0,
  jumpPotential: 0.5,
  // Pattern weights
  chainDepth: 1.0,
  pathClearance: 1.0,
  formationSpread: 0.5,
  vanguardBonus: 1.0,
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
  stragglerChainMultiplier: 2.0,
  goalEntryBonus: 8.0,
  lastPieceMultiplier: 3.0,
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

  // 6. Jump potential — cheap heuristic: count adjacent occupied cells per piece
  // (proxy for jump opportunities without expensive BFS)
  let jumpPotentialScore = 0;
  if (genome.jumpPotential > 0) {
    let adjacentCount = 0;
    for (const piece of pieces) {
      for (const dir of DIRECTIONS) {
        const neighbor = cubeAdd(piece, dir);
        const content = state.board.get(coordKey(neighbor));
        if (content?.type === 'piece') {
          adjacentCount++;
        }
      }
    }
    jumpPotentialScore = Math.min(
      adjacentCount * genome.jumpPotentialMultiplier,
      genome.jumpPotentialCap
    );
  }

  // 7. Chain depth — actual jump chain potential
  const chainDepthScore = computeChainDepth(pieces, state.board);

  // 8. Path clearance — open routes toward goal
  const goalSet = new Set(goalPositions.map(coordKey));
  const pathClearanceScore = computePathClearance(pieces, goalCenter, goalSet, state.board);

  // 9. Formation spread — penalise scattered pieces
  const spreadScore = computeFormationSpread(pieces);

  // 10. Vanguard bonus — reward useful lead piece
  const vanguardScore = computeVanguardBonus(pieces, goalCenter);

  // Endgame focus
  const endgame = inGoal >= genome.endgameThreshold || state.winner !== null;
  const wProgress = endgame ? genome.progress * 2 : genome.progress;
  const wCenter = endgame ? 0 : genome.centerControl;
  const wBlocking = endgame ? 0 : genome.blocking;
  const wJumpPotential = endgame ? 0 : genome.jumpPotential;
  const wChainDepth = endgame ? genome.chainDepth * 1.5 : genome.chainDepth;
  const wPathClearance = endgame ? genome.pathClearance * 1.5 : genome.pathClearance;
  const wFormationSpread = genome.formationSpread;
  const wVanguard = genome.vanguardBonus;
  const wStraggler = endgame ? 3.0 : 1.5;

  // Endgame straggler signals
  const lastPieceFactor =
    endgame && pieces.length - inGoal === 1 ? genome.lastPieceMultiplier : 1.0;
  const wGoalDist = endgame
    ? genome.goalDistance * 2 * lastPieceFactor
    : genome.goalDistance;
  const stragglersChainScore = endgame
    ? computeStragglersChainDepth(pieces, goalSet, state.board)
    : 0;
  const goalEntryCount = endgame
    ? computeGoalEntryBonus(pieces, goalSet, state.board)
    : 0;

  return (
    wProgress * progressScore +
    wGoalDist * goalDistanceScore +
    wStraggler * stragglerScore +
    wCenter * centerControlScore +
    wBlocking * blockingScore +
    wJumpPotential * jumpPotentialScore +
    wChainDepth * chainDepthScore +
    wPathClearance * pathClearanceScore -
    wFormationSpread * spreadScore +
    wVanguard * vanguardScore +
    genome.stragglerChainMultiplier * lastPieceFactor * stragglersChainScore +
    genome.goalEntryBonus * goalEntryCount
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
// Default depth 2 + limit 12 for training (balances quality vs compute time).
// Tablebase builder passes higher depth for deep solve.
export function findBestMoveWithGenome(
  state: GameState,
  genome: Genome,
  searchDepth = 2,
  moveLimit = 12
): Move | null {
  const player = state.currentPlayer;
  const depth = searchDepth;
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
