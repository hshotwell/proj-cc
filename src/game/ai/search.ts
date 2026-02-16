import type { Move, GameState, PlayerIndex, CubeCoord } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { AI_DEPTH, AI_MOVE_LIMIT } from '@/types/ai';
import { getAllValidMoves } from '../moves';
import { applyMove, getGoalPositionsForState } from '../state';
import { getPlayerPieces } from '../setup';
import { cubeDistance, coordKey, centroid } from '../coordinates';
import { DIRECTIONS } from '../constants';
import { evaluatePosition } from './evaluate';
import { loadEvolvedGenome } from '../training/persistence';
import { computePlayerProgress } from '../progress';
import {
  computeRegressionPenaltyWithGenome,
  computeRepetitionPenaltyWithGenome,
} from '../training/evaluate';
import { computeStrategicScore, isEndgame } from './strategy';
import { findEndgameMove, isLateEndgame, scoreEndgameMove } from './endgame';

// Track recent board states to detect loops at the game state level
const recentBoardStates = new Map<string, number>(); // hash -> count
const MAX_STATE_HISTORY = 20;

/**
 * Generate a hash of the board state for loop detection.
 */
function getBoardStateHash(state: GameState): string {
  // Create a sorted list of piece positions for consistent hashing
  const pieces: string[] = [];
  for (const [key, content] of state.board) {
    if (content.type === 'piece') {
      pieces.push(`${key}:${content.player}`);
    }
  }
  pieces.sort();
  return pieces.join('|');
}

/**
 * Check if making this move would create a repeated board state.
 */
function wouldRepeatState(state: GameState, move: Move): { repeats: boolean; count: number } {
  const nextState = applyMove(state, move);
  const hash = getBoardStateHash(nextState);
  const count = recentBoardStates.get(hash) || 0;
  return { repeats: count > 0, count };
}

/**
 * Record a board state after a move is made.
 * Call this when a move is actually executed (not during search).
 */
export function recordBoardState(state: GameState): void {
  const hash = getBoardStateHash(state);
  recentBoardStates.set(hash, (recentBoardStates.get(hash) || 0) + 1);

  // Limit history size
  if (recentBoardStates.size > MAX_STATE_HISTORY * 2) {
    // Remove oldest entries (first half)
    const entries = Array.from(recentBoardStates.entries());
    for (let i = 0; i < MAX_STATE_HISTORY; i++) {
      recentBoardStates.delete(entries[i][0]);
    }
  }
}

/**
 * Clear state history. Call when starting a new game.
 */
export function clearStateHistory(): void {
  recentBoardStates.clear();
}

/**
 * Check if a move creates an IMMEDIATE jumping opportunity for another piece.
 * Only returns true if a friendly piece can jump over the destination position
 * right after this move is made.
 */
function isImmediateSteppingStone(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord
): boolean {
  // Only applies to step moves (not jumps) that go forward
  if (move.isJump) return false;

  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  if (distAfter >= distBefore) return false; // Not moving forward

  // Simulate the state after the move
  const nextState = applyMove(state, move);

  // Check each direction: is there a friendly piece that can now jump over 'to'?
  for (const dir of DIRECTIONS) {
    // Position where a jumping piece would be
    const jumperPos = {
      q: move.to.q - dir.q,
      r: move.to.r - dir.r,
      s: move.to.s - dir.s,
    };
    const jumperKey = coordKey(jumperPos);

    // Check if there's a friendly piece there
    const jumperContent = nextState.board.get(jumperKey);
    if (jumperContent?.type !== 'piece' || jumperContent.player !== player) continue;

    // Position where the piece would land after jumping
    const landingPos = {
      q: move.to.q + dir.q,
      r: move.to.r + dir.r,
      s: move.to.s + dir.s,
    };
    const landingKey = coordKey(landingPos);

    // Check if landing is on board and empty
    const landingContent = nextState.board.get(landingKey);
    if (landingContent?.type !== 'empty') continue;

    // Check if the jump moves the piece forward (toward goal)
    const jumperDist = cubeDistance(jumperPos, goalCenter);
    const landingDist = cubeDistance(landingPos, goalCenter);
    if (landingDist < jumperDist) {
      // This is a valid forward jump enabled by the stepping stone
      return true;
    }
  }

  return false;
}

/**
 * Check if vacating a goal position allows another piece to immediately jump INTO that goal.
 * This is a key endgame strategy - move a piece out of a goal so another can fill it.
 */
function enablesGoalFill(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalKeySet: Set<string>
): boolean {
  const fromKey = coordKey(move.from);

  // Only applies when leaving a goal position
  if (!goalKeySet.has(fromKey)) return false;

  // Simulate the state after the move (the goal position is now empty)
  const nextState = applyMove(state, move);

  // Check if any friendly piece can now jump INTO the vacated goal position
  for (const dir of DIRECTIONS) {
    // Position where a jumping piece would be (2 steps away from the vacated goal)
    const jumperPos = {
      q: move.from.q - dir.q * 2,
      r: move.from.r - dir.r * 2,
      s: move.from.s - dir.s * 2,
    };
    const jumperKey = coordKey(jumperPos);

    // Check if there's a friendly piece there
    const jumperContent = state.board.get(jumperKey);
    if (jumperContent?.type !== 'piece' || jumperContent.player !== player) continue;

    // Position that would be jumped over (between jumper and goal)
    const overPos = {
      q: move.from.q - dir.q,
      r: move.from.r - dir.r,
      s: move.from.s - dir.s,
    };
    const overKey = coordKey(overPos);

    // Check if there's a piece to jump over (could be the moving piece's new position or another piece)
    const overContent = nextState.board.get(overKey);
    if (overContent?.type !== 'piece') continue;

    // The vacated goal position should now be empty
    const goalContent = nextState.board.get(fromKey);
    if (goalContent?.type !== 'empty') continue;

    // A piece can jump into the vacated goal!
    return true;
  }

  return false;
}

export function computeRegressionPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  difficulty?: AIDifficulty
): number {
  // For custom layouts, penalties are handled in findBestMoveForCustomLayout
  // This function is only used for standard layouts now
  if (state.isCustomLayout) {
    // Simple progress-based penalty as fallback (shouldn't be called normally)
    const progressBefore = computePlayerProgress(state, player);
    const nextState = applyMove(state, move);
    const progressAfter = computePlayerProgress(nextState, player);
    const progressDelta = progressAfter - progressBefore;

    if (progressDelta < -0.01) {
      return Infinity;
    }
    return progressDelta < 0.01 ? 100 : -progressDelta * 50;
  }

  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return computeRegressionPenaltyWithGenome(state, move, player, genome);
    }
  }

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;

  const goalCenter = centroid(goalPositions);

  // Calculate progress change - this is the PRIMARY factor
  const progressBefore = computePlayerProgress(state, player);
  const nextState = applyMove(state, move);
  const progressAfter = computePlayerProgress(nextState, player);
  const progressDelta = progressAfter - progressBefore; // Positive = good

  let penalty = 0;

  // Check for IMMEDIATE stepping stone (enables a jump right now)
  const enablesJump = isImmediateSteppingStone(state, move, player, goalCenter);

  // Standard layout penalty logic
  {
    // STANDARD LAYOUT: More nuanced penalties
    if (progressDelta < 0) {
      const progressLoss = -progressDelta;
      if (progressLoss > 2) {
        penalty = 500 + progressLoss * 50;
      } else if (progressLoss > 0.5) {
        penalty = enablesJump ? 150 : 300;
      } else {
        penalty = enablesJump ? 50 : 100;
      }
    } else if (progressDelta === 0) {
      penalty = enablesJump ? 40 : 80;
    } else {
      penalty = -progressDelta * 30;
      if (enablesJump) {
        penalty -= 15;
      }
    }
  }

  // Check if leaving a goal position
  const goalKeySet = new Set(goalPositions.map(g => coordKey(g)));
  const fromIsGoal = goalKeySet.has(coordKey(move.from));
  const toIsGoal = goalKeySet.has(coordKey(move.to));

  if (fromIsGoal && !toIsGoal) {
    // Leaving a goal - check if it enables another piece to fill this goal
    const allowsGoalFill = enablesGoalFill(state, move, player, goalKeySet);
    const distBefore = cubeDistance(move.from, goalCenter);
    const distAfter = cubeDistance(move.to, goalCenter);
    const isForward = distAfter < distBefore;

    // Count how many pieces are already in goals (endgame detection)
    const piecesInGoals = Array.from(state.board.entries()).filter(([key, content]) =>
      content.type === 'piece' && content.player === player && goalKeySet.has(key)
    ).length;
    const isEndgame = piecesInGoals >= 6; // 6+ pieces in goal = endgame

    if (allowsGoalFill) {
      // Vacating goal so another piece can fill it - GOOD in endgame
      penalty += isEndgame ? -20 : 20; // Bonus in endgame, small penalty otherwise
    } else if (isForward && enablesJump) {
      // Forward move from goal that enables a jump (not into the goal)
      penalty += isEndgame ? 30 : 50;
    } else {
      // Leaving goal without good reason - heavy penalty
      penalty += 200;
    }
  }

  // State repetition - ABSOLUTE VETO
  const { repeats, count } = wouldRepeatState(state, move);
  if (repeats) {
    return Infinity; // Hard veto - never repeat a state
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
  const lookback = numPlayers * 10; // Extended lookback window
  const history = state.moveHistory;
  const start = Math.max(0, history.length - lookback);

  // Trace this piece's position history backward.
  const previousPositions = new Map<string, number>(); // position -> how many times visited
  let tracePos = move.from;
  for (let i = history.length - 1; i >= start; i--) {
    const past = history[i];
    if (past.to.q === tracePos.q && past.to.r === tracePos.r) {
      const key = `${past.from.q},${past.from.r}`;
      previousPositions.set(key, (previousPositions.get(key) || 0) + 1);
      tracePos = past.from;
    }
  }

  // Check if the proposed destination is a position this piece previously occupied
  const destKey = `${move.to.q},${move.to.r}`;
  const visitCount = previousPositions.get(destKey) || 0;

  // Count exact reversals (A->B then B->A)
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

  // ANY reversal or return to previous position is now heavily penalized
  // Combined with state-based detection, this should prevent cycles
  if (reversals >= 1) return Infinity; // Hard veto for ANY reversal
  if (visitCount >= 2) return Infinity; // Hard veto for repeated cycling
  if (visitCount === 1) return 200; // Heavy penalty for returning to any previous position

  return 0;
}

function getTopMoves(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  limit: number
): Move[] {
  const allMoves = getAllValidMoves(state, player);

  // Pre-filter vetoed moves
  const viableMoves = allMoves.filter((m) => {
    const regPenalty = computeRegressionPenalty(state, m, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, m, player, difficulty);
    return regPenalty < Infinity && repPenalty < Infinity;
  });

  const moves = viableMoves.length > 0 ? viableMoves : allMoves;
  if (moves.length <= limit) return moves;

  // Check if we're in endgame (strategic scoring matters more)
  const inEndgame = isEndgame(state, player);
  const inLateEndgame = isLateEndgame(state, player);

  // Score each move with a greedy 1-ply eval, penalizing regressions and repetitions
  const scored = moves.map((move) => {
    const next = applyMove(state, move);
    let score = evaluatePosition(next, player, personality, difficulty);
    const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);
    const totalPenalty = (regPenalty === Infinity || repPenalty === Infinity)
      ? 1000000
      : regPenalty + repPenalty;
    score -= totalPenalty;

    // Add strategic scoring (more important in endgame and for medium+ difficulty)
    if (difficulty !== 'easy') {
      const strategic = computeStrategicScore(state, move, player, personality);
      // Strategic score weight increases in endgame
      const strategicWeight = inEndgame ? 2.0 : 1.0;
      score += strategic.total * strategicWeight;
    }

    // CRITICAL: In late endgame, heavily prioritize finishing moves for ALL difficulties
    if (inLateEndgame) {
      const endgameScore = scoreEndgameMove(state, move, player);
      score += endgameScore; // Can add up to 1000+ for direct goal entries
    }

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

/**
 * Check if a piece would return to a position it recently occupied.
 * This catches the case where AI jumps forward then back, even when
 * the overall board state is different due to other players moving.
 */
function wouldReturnToPreviousPosition(
  state: GameState,
  move: Move
): { returns: boolean; turnsAgo: number } {
  const history = state.moveHistory;

  // Trace this piece's position history backward
  // Start from the piece's current position (move.from) and work backwards
  let tracePos = move.from;
  let turnsAgo = 0;

  for (let i = history.length - 1; i >= 0 && turnsAgo < 10; i--) {
    const pastMove = history[i];

    // Check if this past move ended at our current trace position
    // (meaning this is a move by the same piece we're tracing)
    if (pastMove.to.q === tracePos.q && pastMove.to.r === tracePos.r) {
      turnsAgo++;

      // Check if the piece came FROM the position we're trying to move TO
      if (pastMove.from.q === move.to.q && pastMove.from.r === move.to.r) {
        return { returns: true, turnsAgo };
      }

      // Continue tracing backwards
      tracePos = pastMove.from;
    }
  }

  return { returns: false, turnsAgo: 0 };
}

/**
 * Compute total distance of all pieces to the goal center.
 * Lower is better (pieces closer to goal).
 */
function computeTotalDistanceToGoal(
  state: GameState,
  player: PlayerIndex,
  goalCenter: CubeCoord
): number {
  const pieces = getPlayerPieces(state, player);
  return pieces.reduce((sum, piece) => sum + cubeDistance(piece, goalCenter), 0);
}

/**
 * For custom layouts: directly select the move that minimizes total distance to goal.
 * This is a simpler, more direct approach than using progress percentages.
 *
 * Priority (in order):
 * 1. Endgame finishing moves (direct goal entry or enabling entry)
 * 2. Total distance reduction - lower total distance to goal wins
 * 3. Among equal: this piece's distance reduction
 * 4. Among equal: avoid returning to previous positions
 * 5. Among equal: prefer jumps (cover more ground)
 */
function findBestMoveForCustomLayout(
  state: GameState,
  player: PlayerIndex
): Move | null {
  const allMoves = getAllValidMoves(state, player);
  if (allMoves.length === 0) return null;

  // Check for endgame finishing move first
  if (isLateEndgame(state, player)) {
    const endgameMove = findEndgameMove(state, player);
    if (endgameMove) {
      return endgameMove;
    }
  }

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return allMoves[0]; // Fallback if no goals defined

  const goalCenter = centroid(goalPositions);
  const currentTotalDist = computeTotalDistanceToGoal(state, player, goalCenter);

  // Score each move by how much it reduces total distance to goal
  const scoredMoves = allMoves.map((move) => {
    const nextState = applyMove(state, move);
    const nextTotalDist = computeTotalDistanceToGoal(nextState, player, goalCenter);

    // Positive = good (moved closer to goal overall)
    const totalDistReduction = currentTotalDist - nextTotalDist;

    // Calculate how much closer THIS PIECE gets to the goal center
    const pieceDirBefore = cubeDistance(move.from, goalCenter);
    const pieceDistAfter = cubeDistance(move.to, goalCenter);
    const pieceDistReduction = pieceDirBefore - pieceDistAfter; // Positive = moving toward goal

    // Check if this piece would return to a previous position (piece-level loop detection)
    const { returns: pieceReturns } = wouldReturnToPreviousPosition(state, move);

    // Check if this would repeat a board state (global loop detection)
    const { repeats: stateRepeats } = wouldRepeatState(state, move);

    return {
      move,
      totalDistReduction,
      pieceDistReduction,
      pieceReturns,
      stateRepeats,
      isJump: move.isJump,
    };
  });

  // Sort: highest total distance reduction wins
  scoredMoves.sort((a, b) => {
    // 1. TOTAL DISTANCE REDUCTION IS PRIMARY - higher reduction (closer to goal) wins
    if (Math.abs(a.totalDistReduction - b.totalDistReduction) > 0.01) {
      return b.totalDistReduction - a.totalDistReduction;
    }

    // 2. For equal total: prefer moves that move THIS piece toward goal
    if (Math.abs(a.pieceDistReduction - b.pieceDistReduction) > 0.01) {
      return b.pieceDistReduction - a.pieceDistReduction;
    }

    // 3. Avoid moves that return to previous position
    if (a.pieceReturns !== b.pieceReturns) {
      return a.pieceReturns ? 1 : -1;
    }

    // 4. Avoid state repeats
    if (a.stateRepeats !== b.stateRepeats) {
      return a.stateRepeats ? 1 : -1;
    }

    // 5. Prefer jumps (cover more ground efficiently)
    if (a.isJump !== b.isJump) {
      return a.isJump ? -1 : 1;
    }

    return 0;
  });

  // Pick the best move
  return scoredMoves[0]?.move ?? null;
}

export function findBestMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality
): Move | null {
  const player = state.currentPlayer;

  // PRIORITY: Late endgame finishing logic for ALL difficulty levels
  // When 7+ pieces are in goal, finishing quickly is fundamental
  if (isLateEndgame(state, player)) {
    const endgameMove = findEndgameMove(state, player);
    if (endgameMove) {
      return endgameMove;
    }
    // If no clear finishing move found, continue with normal logic
    // but endgame scoring will still apply
  }

  // For custom layouts, use the simple progress-maximizing approach
  // This is more reliable than layered penalties for arbitrary board shapes
  if (state.isCustomLayout) {
    return findBestMoveForCustomLayout(state, player);
  }

  // Standard layouts use the full search with penalties
  const depth = AI_DEPTH[difficulty];
  const limit = AI_MOVE_LIMIT[difficulty];
  const allMoves = getAllValidMoves(state, player);

  if (allMoves.length === 0) return null;

  // Pre-filter: remove any moves with Infinity penalty (hard vetoes)
  const viableMoves = allMoves.filter((m) => {
    const regPenalty = computeRegressionPenalty(state, m, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, m, player, difficulty);
    return regPenalty < Infinity && repPenalty < Infinity;
  });

  // If ALL moves are vetoed, pick the one with smallest penalty
  let movesToConsider: Move[];
  if (viableMoves.length > 0) {
    movesToConsider = viableMoves;
  } else {
    // All moves vetoed - find the least bad option
    const scoredByPenalty = allMoves.map((m) => {
      const regPenalty = computeRegressionPenalty(state, m, player, difficulty);
      const repPenalty = computeRepetitionPenalty(state, m, player, difficulty);
      // Convert Infinity to a large but finite number for comparison
      const totalPenalty = (regPenalty === Infinity ? 1000000 : regPenalty) +
                           (repPenalty === Infinity ? 1000000 : repPenalty);
      return { move: m, penalty: totalPenalty };
    });
    scoredByPenalty.sort((a, b) => a.penalty - b.penalty);
    movesToConsider = scoredByPenalty.slice(0, limit).map((s) => s.move);
  }

  // Get top moves for deeper search
  const moves = getTopMovesFromList(state, movesToConsider, player, personality, difficulty, limit);

  if (moves.length === 0) return allMoves[0]; // Absolute fallback

  // Easy (depth 1): pick randomly from top 3
  if (difficulty === 'easy') {
    const top = moves.slice(0, Math.min(3, moves.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  const is2Player = state.activePlayers.length === 2;

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);

    // If penalty is Infinity, use a large finite number so we can still compare
    const penalty = (regPenalty === Infinity ? 1000000 : regPenalty) +
                    (repPenalty === Infinity ? 1000000 : repPenalty);

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

  return bestMove;
}

/**
 * Score and sort moves from a given list (used after pre-filtering).
 */
function getTopMovesFromList(
  state: GameState,
  moves: Move[],
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  limit: number
): Move[] {
  if (moves.length <= limit) return moves;

  // Check if we're in endgame
  const inEndgame = isEndgame(state, player);
  const inLateEndgame = isLateEndgame(state, player);

  // Score each move with a greedy 1-ply eval, penalizing regressions and repetitions
  const scored = moves.map((move) => {
    const next = applyMove(state, move);
    let score = evaluatePosition(next, player, personality, difficulty);
    const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);

    // Treat Infinity as a very large number for sorting (these were pre-filtered but just in case)
    const totalPenalty = (regPenalty === Infinity || repPenalty === Infinity)
      ? 1000000
      : regPenalty + repPenalty;

    score -= totalPenalty;

    // Add strategic scoring
    if (difficulty !== 'easy') {
      const strategic = computeStrategicScore(state, move, player, personality);
      const strategicWeight = inEndgame ? 2.0 : 1.0;
      score += strategic.total * strategicWeight;
    }

    // CRITICAL: In late endgame, heavily prioritize finishing moves for ALL difficulties
    if (inLateEndgame) {
      const endgameScore = scoreEndgameMove(state, move, player);
      score += endgameScore;
    }

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.move);
}
