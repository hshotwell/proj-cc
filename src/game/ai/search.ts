import type { Move, GameState, PlayerIndex, CubeCoord } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { AI_DEPTH, AI_OPENING_DEPTH, AI_ENDGAME_DEPTH, AI_MOVE_LIMIT, AI_TIME_BUDGET_MS } from '@/types/ai';
import { getAllValidMoves, canJumpOver } from '../moves';
import { applyMove, getGoalPositionsForState } from '../state';
import { getPlayerPieces } from '../setup';
import { cubeDistance, coordKey, centroid } from '../coordinates';
import { DIRECTIONS } from '../constants';
import { evaluatePosition } from './evaluate';
import { computePlayerProgress } from '../progress';
import { computeStrategicScore, isEndgame, findOpponentJumpThreats, scoreLandingQuality, scoreLastMoveResponse, scoreSetupBlockRisk, scoreLeapfrogPotential } from './strategy';
import { findEndgameMove, isLateEndgame, scoreEndgameMove, evaluateEndgameLateral, getPiecePhase, findOptimalEndgameSequence } from './endgame';
import { getOpeningMove } from './openingBook';

// Track recent board states to detect loops at the game state level
const recentBoardStates = new Map<string, number>(); // hash -> count
const MAX_STATE_HISTORY = 20;

// Module-level time budget for recursive search — set at findBestMove entry
let _searchStartTime = 0;
let _searchTimeBudget = 0;

// ── Transposition table ────────────────────────────────────────────────────
type TTFlag = 'exact' | 'lower' | 'upper';
interface TTEntry { score: number; flag: TTFlag; depth: number; }
const transpositionTable = new Map<string, TTEntry>();
const MAX_TT_SIZE = 60000;

function getTTKey(state: GameState, depth: number): string {
  return `${getBoardStateHash(state)}|${depth}|${state.currentPlayer}`;
}

function storeTT(key: string, score: number, flag: TTFlag, depth: number): void {
  if (transpositionTable.size >= MAX_TT_SIZE) {
    const firstKey = transpositionTable.keys().next().value;
    if (firstKey !== undefined) transpositionTable.delete(firstKey);
  }
  transpositionTable.set(key, { score, flag, depth });
}

export function clearTranspositionTable(): void {
  transpositionTable.clear();
}

// ── Game phase detection ────────────────────────────────────────────────────
type GamePhase = 'early' | 'mid' | 'end';

/**
 * Detect game phase for depth-scaling purposes.
 * early: pieces haven't converged yet (no opponent within 4 cells of any own piece)
 * end:   pieces have passed each other (same condition but progress > 40%)
 * mid:   active contest — default
 */
function detectPhase(state: GameState, player: PlayerIndex): GamePhase {
  const myPieces = getPlayerPieces(state, player);
  const opponentPieces: CubeCoord[] = [];
  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player === player) continue;
    const [q, r] = key.split(',').map(Number);
    opponentPieces.push({ q, r, s: -q - r });
  }

  if (opponentPieces.length === 0) return 'mid';

  let opponentNearby = false;
  outer: for (const myPiece of myPieces) {
    for (const opPiece of opponentPieces) {
      if (cubeDistance(myPiece, opPiece) <= 4) {
        opponentNearby = true;
        break outer;
      }
    }
  }

  if (!opponentNearby) {
    return computePlayerProgress(state, player) < 40 ? 'early' : 'end';
  }
  return 'mid';
}

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
 * Returns 'leapfrog' if the stone can then advance past the hopper for another hop,
 * 'steppingStone' if it enables a forward jump, or 'none'.
 */
function isImmediateSteppingStone(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord
): 'none' | 'steppingStone' | 'leapfrog' {
  // Only applies to step moves (not jumps) that go forward
  if (move.isJump) return 'none';

  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  if (distAfter >= distBefore) return 'none'; // Not moving forward

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
      // Found a valid forward jump — check for leapfrog continuation
      // Can the stone (move.to) then step/hop forward past the hopper's landing
      // and set up another hop?
      const stoneDist = cubeDistance(move.to, goalCenter);
      for (const d of DIRECTIONS) {
        // Stone STEP forward
        const stepTarget = {
          q: move.to.q + d.q,
          r: move.to.r + d.r,
          s: move.to.s + d.s,
        };
        if (nextState.board.get(coordKey(stepTarget))?.type === 'empty' &&
            cubeDistance(stepTarget, goalCenter) < stoneDist) {
          // Check if the hopper at landingPos could then hop over stepTarget
          for (const d2 of DIRECTIONS) {
            if (landingPos.q + d2.q === stepTarget.q &&
                landingPos.r + d2.r === stepTarget.r) {
              const nextLand = {
                q: stepTarget.q + d2.q,
                r: stepTarget.r + d2.r,
                s: stepTarget.s + d2.s,
              };
              if (nextState.board.get(coordKey(nextLand))?.type === 'empty' &&
                  cubeDistance(nextLand, goalCenter) < landingDist) {
                return 'leapfrog';
              }
            }
          }
        }

        // Stone HOP forward
        const overPos = {
          q: move.to.q + d.q,
          r: move.to.r + d.r,
          s: move.to.s + d.s,
        };
        const hopLand = {
          q: move.to.q + d.q * 2,
          r: move.to.r + d.r * 2,
          s: move.to.s + d.s * 2,
        };
        if (canJumpOver(nextState, overPos, player) &&
            nextState.board.get(coordKey(hopLand))?.type === 'empty' &&
            cubeDistance(hopLand, goalCenter) < stoneDist) {
          // Check if the hopper at landingPos could then hop over hopLand
          for (const d2 of DIRECTIONS) {
            if (landingPos.q + d2.q === hopLand.q &&
                landingPos.r + d2.r === hopLand.r) {
              const nextLand = {
                q: hopLand.q + d2.q,
                r: hopLand.r + d2.r,
                s: hopLand.s + d2.s,
              };
              if (nextState.board.get(coordKey(nextLand))?.type === 'empty' &&
                  cubeDistance(nextLand, goalCenter) < landingDist) {
                return 'leapfrog';
              }
            }
          }
        }
      }

      return 'steppingStone';
    }
  }

  return 'none';
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

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;

  const goalCenter = centroid(goalPositions);

  // Calculate progress change - this is the PRIMARY factor
  const progressBefore = computePlayerProgress(state, player);
  const nextState = applyMove(state, move);
  const progressAfter = computePlayerProgress(nextState, player);
  const progressDelta = progressAfter - progressBefore; // Positive = good

  // Hard-veto backward moves per difficulty rules
  if (progressDelta < 0) {
    // Easy: absolute ban — never take a backward step
    if (difficulty === 'easy') return Infinity;

    const nextMoves = getAllValidMoves(nextState, player);
    let bestNextDelta = 0;
    for (const nextMove of nextMoves.slice(0, 10)) {
      const afterNext = applyMove(nextState, nextMove);
      const progressAfterNext = computePlayerProgress(afterNext, player);
      const nextDelta = progressAfterNext - progressAfter;
      if (nextDelta > bestNextDelta) {
        bestNextDelta = nextDelta;
      }
    }

    if (difficulty === 'hard') {
      // Hard: only allow if the net gain is more than double the loss
      // (requires an exceptional recovery to justify going backward)
      if (progressDelta + bestNextDelta <= Math.abs(progressDelta)) {
        return Infinity;
      }
    } else {
      // Medium: veto if 2-move net is not positive
      if (progressDelta + bestNextDelta <= 0) {
        return Infinity;
      }
    }
  }

  let penalty = 0;

  // Check for IMMEDIATE stepping stone (enables a jump right now)
  const steppingStoneResult = isImmediateSteppingStone(state, move, player, goalCenter);
  const enablesJump = steppingStoneResult !== 'none';
  const enablesLeapfrog = steppingStoneResult === 'leapfrog';

  // Standard layout penalty logic
  {
    if (progressDelta < 0) {
      const progressLoss = -progressDelta;
      if (progressLoss > 2) {
        penalty = enablesLeapfrog ? 300 + progressLoss * 30 : 500 + progressLoss * 50;
      } else if (progressLoss > 0.5) {
        penalty = enablesLeapfrog ? 80 : enablesJump ? 150 : 300;
      } else {
        penalty = enablesLeapfrog ? 20 : enablesJump ? 50 : 100;
      }
    } else if (progressDelta === 0) {
      // Lateral moves: never prune at root — let search depth evaluate their value.
      // A lateral that sets up a long chain is often worth it; the search will find this.
      penalty = 0;
    } else {
      penalty = -progressDelta * 30;
      if (enablesLeapfrog) {
        penalty -= 25;
      } else if (enablesJump) {
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

    // Hard veto: never leave goal once 6+ pieces are already secured there
    if (piecesInGoals >= 6) return Infinity;

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

  // Hard veto: no backward/lateral moves within goal when 6+ pieces already secured
  if (fromIsGoal && toIsGoal && progressDelta <= 0) {
    const piecesInGoalsForBackward = Array.from(state.board.entries()).filter(([key, content]) =>
      content.type === 'piece' && content.player === player && goalKeySet.has(key)
    ).length;
    if (piecesInGoalsForBackward >= 6) return Infinity;
  }

  // State repetition - ABSOLUTE VETO
  const { repeats, count } = wouldRepeatState(state, move);
  if (repeats) {
    return Infinity; // Hard veto - never repeat a state
  }

  return penalty;
}

/**
 * Soft penalty for moving the same piece on consecutive turns.
 * Moving the same piece 3+ times in a row is almost always suboptimal.
 * Traces move history for the current player only.
 */
function computeConsecutivePiecePenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  // Count consecutive past player-turns that moved the same piece
  let count = 0;
  let tracePos = move.from;

  for (let i = state.moveHistory.length - 1; i >= 0; i--) {
    const past = state.moveHistory[i];
    if (past.player !== player) continue;
    if (past.to.q === tracePos.q && past.to.r === tracePos.r) {
      count++;
      tracePos = past.from;
    } else {
      break;
    }
    if (count >= 4) break;
  }

  if (count < 2) return 0;   // 1st or 2nd consecutive turn: no penalty
  if (count === 2) return 20; // 3rd consecutive turn: moderate
  return 80;                  // 4th+ consecutive turn: strong
}

export function computeRepetitionPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  difficulty?: AIDifficulty
): number {
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
  // Endgame pieces have less flexibility — escalate to a hard veto
  // to prevent shuffling loops near the goal.
  const piecePhase = getPiecePhase(state, move.from, player);
  if (piecePhase !== 'midgame') {
    if (visitCount >= 1) return Infinity;
  } else {
    if (visitCount === 1) return 200;
  }

  return 0;
}

/**
 * For each starting piece with multiple chain-jump stopping points (A→B, A→B→C, etc.),
 * keep only the highest-scored stopping point. Non-jump moves and single-hop jumps
 * pass through unmodified. This prevents the move limit from being consumed by
 * inferior chain variants of the same piece.
 */
function selectBestChainStop(
  scored: Array<{ move: Move; score: number }>
): Array<{ move: Move; score: number }> {
  const chainGroups = new Map<string, { move: Move; score: number }>();
  const nonChainMoves: Array<{ move: Move; score: number }> = [];

  for (const entry of scored) {
    const { move } = entry;
    // Multi-hop jump: jumpPath exists and has ≥1 step (meaning the move went through at least one intermediate)
    if (move.isJump && move.jumpPath && move.jumpPath.length >= 1) {
      const key = coordKey(move.from);
      const existing = chainGroups.get(key);
      if (!existing || entry.score > existing.score) {
        chainGroups.set(key, entry);
      }
    } else {
      nonChainMoves.push(entry);
    }
  }

  return [...nonChainMoves, ...Array.from(chainGroups.values())];
}

/**
 * Check if any piece currently has a forward chain jump gaining ≥ 4 cells.
 * Computed once per turn and passed into move scoring.
 */
function checkBigJumpOpportunity(
  allMoves: Move[],
  goalCenter: CubeCoord
): boolean {
  return allMoves.some(m => {
    if (!m.isJump) return false;
    const gain = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
    return gain >= 4;
  });
}

/**
 * If a big jump opportunity exists this turn, apply a bonus to moves that
 * capitalise on it (jump gain ≥ 4). This prevents the AI making small endgame
 * moves when a large chain jump is available.
 */
function computeBigJumpOpportunityBonus(
  move: Move,
  goalCenter: CubeCoord,
  hasBigOpportunity: boolean
): number {
  if (!hasBigOpportunity) return 0;
  if (!move.isJump) return 0;
  const gain = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  if (gain < 4) return 0;
  return gain * 8;
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

  // Pre-compute opponent threats once for all moves (expensive, state-dependent only)
  const threats = (difficulty !== 'easy' && (personality === 'defensive' || personality === 'generalist'))
    ? findOpponentJumpThreats(state, player)
    : undefined;

  // Compute goal center for big jump opportunity detection
  const goalPositionsForBonus = getGoalPositionsForState(state, player);
  const goalCenterForBonus = centroid(goalPositionsForBonus);
  const hasBigOpportunity = !state.isCustomLayout && checkBigJumpOpportunity(moves, goalCenterForBonus);

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
    {
      const strategic = computeStrategicScore(state, move, player, personality, threats);
      // Easy gets reduced strategic weight (setup concepts still apply, just lighter)
      const difficultyMultiplier = difficulty === 'easy' ? 0.4 : 1.0;
      const strategicWeight = inEndgame ? 2.0 : 1.0;
      score += strategic.total * strategicWeight * difficultyMultiplier;
      score += scoreLandingQuality(state, move, player, personality, difficulty);
      score += scoreLastMoveResponse(state, move, player, personality, difficulty);
      score += scoreSetupBlockRisk(state, move, player, personality, difficulty, strategic.steppingStoneValue);
      score += scoreLeapfrogPotential(state, move, player, personality);
    }

    // CRITICAL: In late endgame, heavily prioritize finishing moves for ALL difficulties
    if (inLateEndgame) {
      const endgameScore = scoreEndgameMove(state, move, player, personality);
      score += endgameScore; // Can add up to 1000+ for direct goal entries
    }

    // Endgame lateral evaluation: penalise purposeless sidesteps,
    // reward laterals that unlock a new chain entry into goal
    const lateralBonus = evaluateEndgameLateral(state, move, player);
    score += lateralBonus;

    // Prioritize large chain jumps when available (transition timing heuristic)
    score += computeBigJumpOpportunityBonus(move, goalCenterForBonus, hasBigOpportunity);

    // Landing hop quality: for jump endpoints, reward positions from which
    // the moved piece can make another good forward hop next turn.
    // This prevents the AI from stopping at a consolidation-rich but dead-end position.
    if (move.isJump) {
      let bestNextHopGain = 0;
      for (const dir of DIRECTIONS) {
        const over = { q: move.to.q + dir.q, r: move.to.r + dir.r, s: move.to.s + dir.s };
        const land = { q: move.to.q + dir.q * 2, r: move.to.r + dir.r * 2, s: move.to.s + dir.s * 2 };
        if (canJumpOver(next, over, player) && next.board.get(coordKey(land))?.type === 'empty') {
          const gain = cubeDistance(move.to, goalCenterForBonus) - cubeDistance(land, goalCenterForBonus);
          if (gain > bestNextHopGain) bestNextHopGain = gain;
        }
      }
      score += bestNextHopGain * 5;
    }

    return { move, score };
  });

  const deduped = selectBestChainStop(scored);
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit).map((s) => s.move);
}

// Minimax with alpha-beta pruning and transposition table for 2-player games
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  // Time-guard: abort deep recursion if budget exceeded
  if (depth > 0 && performance.now() - _searchStartTime >= _searchTimeBudget) {
    return evaluatePosition(state, maximizingPlayer, personality, difficulty);
  }

  const origAlpha = alpha;
  const origBeta = beta;

  // Transposition table lookup
  const ttKey = getTTKey(state, depth);
  const ttEntry = transpositionTable.get(ttKey);
  if (ttEntry !== undefined && ttEntry.depth >= depth) {
    if (ttEntry.flag === 'exact') return ttEntry.score;
    if (ttEntry.flag === 'lower') alpha = Math.max(alpha, ttEntry.score);
    if (ttEntry.flag === 'upper') beta = Math.min(beta, ttEntry.score);
    if (alpha >= beta) return ttEntry.score;
  }

  if (depth === 0) {
    const score = evaluatePosition(state, maximizingPlayer, personality, difficulty);
    storeTT(ttKey, score, 'exact', 0);
    return score;
  }

  const currentPlayer = state.currentPlayer;
  const isMaximizing = currentPlayer === maximizingPlayer;
  const limit = AI_MOVE_LIMIT[difficulty];
  const moves = getTopMoves(state, currentPlayer, personality, difficulty, limit);

  if (moves.length === 0) {
    return evaluatePosition(state, maximizingPlayer, personality, difficulty);
  }

  let score: number;

  if (isMaximizing) {
    score = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimax(next, depth - 1, alpha, beta, maximizingPlayer, personality, difficulty);
      if (eval_ > score) score = eval_;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
  } else {
    score = Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const eval_ = minimax(next, depth - 1, alpha, beta, maximizingPlayer, personality, difficulty);
      if (eval_ < score) score = eval_;
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
  }

  // Store in transposition table with appropriate bound flag
  const flag: TTFlag =
    score <= origAlpha ? 'upper' :
    score >= origBeta  ? 'lower' : 'exact';
  storeTT(ttKey, score, flag, depth);

  return score;
}

// Max^n search for 3+ player games: each player maximizes their own score
function maxn(
  state: GameState,
  depth: number,
  aiPlayer: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  // Time-guard: abort deep recursion if budget exceeded
  if (depth > 0 && performance.now() - _searchStartTime >= _searchTimeBudget) {
    return evaluatePosition(state, aiPlayer, personality, difficulty);
  }

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

/**
 * Given a sorted list of scored candidate moves, pick one with
 * difficulty-appropriate variance.
 *
 * When the top move is a clear outlier (gap > threshold), always pick it.
 * When scores are close, sample from top-3 with weighted randomness:
 *   hard:   [20, 3, 1]  — strongly favours best, very rare deviation
 *   medium: [ 5, 2, 1]  — moderate variance
 *   easy:   [ 1, 2, 1]  — slightly prefers 2nd best (imperfect play)
 */
function selectMoveWithVariance(
  scored: Array<{ move: Move; score: number }>,
  difficulty: AIDifficulty
): Move {
  if (scored.length === 0) throw new Error('No moves to select from');
  if (scored.length === 1) return scored[0].move;

  const best = scored[0].score;

  // Gap thresholds: if the gap to 2nd is above this, always take the best move
  const clearOutlierThreshold: Record<AIDifficulty, number> = {
    easy:    60,
    medium:  40,
    hard:    25,
  };

  const gap = best - scored[1].score;
  if (gap > clearOutlierThreshold[difficulty]) {
    return scored[0].move; // Obvious winner — no variance
  }

  // Weights for top-3 positions
  const weights: Record<AIDifficulty, [number, number, number]> = {
    easy:    [1, 2, 1],  // Slightly prefer 2nd (imperfect)
    medium:  [5, 2, 1],  // Mostly best with some variance
    hard:    [20, 3, 1], // Strongly best with rare deviation
  };

  const w = weights[difficulty];
  const candidates = scored.slice(0, 3);
  const totalWeight = candidates.reduce((sum, _, i) => sum + (w[i] ?? 0), 0);
  const roll = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += w[i] ?? 0;
    if (roll < cumulative) return candidates[i].move;
  }

  return scored[0].move;
}

export function findBestMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  openingMoves?: { from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number } }[] | null
): Move | null {
  const player = state.currentPlayer;

  // Set timer immediately so time-guards in minimax/maxn are valid for this call
  _searchStartTime = performance.now();
  _searchTimeBudget = AI_TIME_BUDGET_MS[difficulty];

  // PRIORITY 0: Opening book — play textbook lines in the early game
  if (!state.isCustomLayout && openingMoves && openingMoves.length > 0) {
    const maxOpeningMoves = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 4 : 11;
    const bookMove = getOpeningMove(state, player, openingMoves, maxOpeningMoves);
    if (bookMove) {
      // Deviate if a significantly better alternative exists (1-ply check)
      const bookScore = evaluatePosition(applyMove(state, bookMove), player, personality, difficulty);
      const allMoves = getAllValidMoves(state, player);
      let bestAltScore = -Infinity;
      for (const m of allMoves) {
        if (m.from.q === bookMove.from.q && m.from.r === bookMove.from.r &&
            m.to.q === bookMove.to.q && m.to.r === bookMove.to.r) continue;
        const s = evaluatePosition(applyMove(state, m), player, personality, difficulty);
        if (s > bestAltScore) bestAltScore = s;
      }
      if (bestAltScore <= bookScore + 300) return bookMove;
      // A significantly better move exists — fall through to normal search
    }
  }

  // PRIORITY: BFS optimal finish for small endgame puzzles (≤3 outside, ≤4 empty goals).
  // Finds the minimum-move sequence exactly, bypassing all heuristics.
  if (!state.isCustomLayout) {
    const optimalMove = findOptimalEndgameSequence(state, player);
    if (optimalMove) {
      const { repeats } = wouldRepeatState(state, optimalMove);
      if (!repeats) return optimalMove;
    }
  }

  // PRIORITY: Late endgame finishing logic for ALL difficulty levels
  // When 6+ pieces are in goal, the dedicated endgame solver is authoritative.
  // Trust it completely — the regression gate previously rejected valid moves like
  // (4,-7)→(4,-8) because moving to the deepest corner increases distance from
  // goal centroid, which computePlayerProgress misreads as backward progress.
  if (isLateEndgame(state, player)) {
    const endgameMove = findEndgameMove(state, player);
    if (endgameMove) {
      // Only veto if this move would repeat a board state (cycle detection).
      // No progress gate — the endgame solver's priority waterfall is authoritative.
      const { repeats } = wouldRepeatState(state, endgameMove);
      if (!repeats) {
        return endgameMove;
      }
      // State would repeat — fall through to normal search which has its own
      // repetition penalties to find a different path out of the cycle.
    }
  }

  // For custom layouts, use the simple progress-maximizing approach
  // This is more reliable than layered penalties for arbitrary board shapes
  if (state.isCustomLayout) {
    return findBestMoveForCustomLayout(state, player);
  }

  // Standard layouts use iterative deepening within a time budget.
  // Start shallow and go deeper until the budget runs out, returning the
  // best move found at the deepest completed depth.
  const phase = detectPhase(state, player);
  const maxDepth =
    phase === 'mid'   ? AI_DEPTH[difficulty] :
    phase === 'early' ? AI_OPENING_DEPTH[difficulty] :
                        AI_ENDGAME_DEPTH[difficulty];
  const limit = AI_MOVE_LIMIT[difficulty];
  const timeBudget = _searchTimeBudget; // already set at function entry
  const startTime = _searchStartTime;  // already set at function entry
  const allMoves = getAllValidMoves(state, player);

  if (allMoves.length === 0) return null;

  // Difficulty-based directional jump filtering (simulates limited horizon)
  // Easy: no backward jump starts; lateral jumps only 50% of the time
  // Medium: backward jumps only 30% of the time
  let candidateMoves = allMoves;
  if (difficulty === 'easy' || difficulty === 'medium') {
    const goalPositions = getGoalPositionsForState(state, player);
    const goalCenter = centroid(goalPositions);
    const filtered = allMoves.filter((m) => {
      if (!m.isJump) return true; // Steps are always available
      const distBefore = cubeDistance(m.from, goalCenter);
      const distAfter = cubeDistance(m.to, goalCenter);
      const delta = distBefore - distAfter; // positive = moving toward goal
      if (difficulty === 'easy') {
        if (delta < -0.5) return false;          // Never backward jumps
        if (Math.abs(delta) <= 0.5) return Math.random() > 0.5; // 50% lateral jumps
      } else {
        if (delta < -0.5) return Math.random() < 0.3; // 30% backward jumps
      }
      return true;
    });
    if (filtered.length > 0) candidateMoves = filtered;
  }

  // Pre-filter: remove any moves with Infinity penalty (hard vetoes)
  const viableMoves = candidateMoves.filter((m) => {
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
    const scoredByPenalty = candidateMoves.map((m) => {
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

  // Get top moves for deeper search.
  // `let` (not const) because iterative deepening reorders this for better alpha-beta pruning.
  let moves = getTopMovesFromList(state, movesToConsider, player, personality, difficulty, limit);

  // Always include swap moves — they can be critical for unblocking but may be
  // outscored by chain jumps and dropped by the move limit
  const swapMoves = movesToConsider.filter((m) => m.isSwap);
  if (swapMoves.length > 0) {
    const inMoves = new Set(moves.map((m) => `${m.from.q},${m.from.r},${m.to.q},${m.to.r}`));
    for (const sm of swapMoves) {
      if (!inMoves.has(`${sm.from.q},${sm.from.r},${sm.to.q},${sm.to.r}`)) {
        moves.push(sm);
      }
    }
  }

  if (moves.length === 0) return allMoves[0]; // Absolute fallback

  const is2Player = state.activePlayers.length === 2;

  // Pre-compute per-move penalties (depth-independent — same for all iterations)
  const movePenalties = new Map<Move, number>();
  for (const move of moves) {
    const regPenalty = computeRegressionPenalty(state, move, player, difficulty);
    const repPenalty = computeRepetitionPenalty(state, move, player, difficulty);
    const consecPenalty = computeConsecutivePiecePenalty(state, move, player);
    const penalty = (regPenalty === Infinity ? 1000000 : regPenalty) +
                    (repPenalty === Infinity ? 1000000 : repPenalty) +
                    consecPenalty;
    movePenalties.set(move, penalty);
  }

  // Iterative deepening: search depth 1, then 2, ... up to maxDepth.
  // Each iteration overwrites the previous result, so even if we abort
  // mid-iteration we still have the previous depth's best move.
  let bestScoredMoves: Array<{ move: Move; score: number }> = moves.map(m => ({
    move: m,
    score: -(movePenalties.get(m) ?? 0),
  }));

  for (let depth = 1; depth <= maxDepth; depth++) {
    // Check time budget before starting a new iteration
    if (performance.now() - startTime >= timeBudget) break;

    const iterationScores: Array<{ move: Move; score: number }> = [];
    let aborted = false;

    for (const move of moves) {
      // Check time budget mid-iteration too
      if (performance.now() - startTime >= timeBudget) {
        aborted = true;
        break;
      }

      const penalty = movePenalties.get(move) ?? 0;
      const next = applyMove(state, move);
      let score: number;

      if (is2Player) {
        score = minimax(next, depth - 1, -Infinity, Infinity, player, personality, difficulty);
      } else {
        score = maxn(next, depth - 1, player, personality, difficulty);
      }

      score -= penalty;
      iterationScores.push({ move, score });
    }

    // Only commit this iteration's results if it completed fully
    if (!aborted && iterationScores.length === moves.length) {
      bestScoredMoves = iterationScores;
      // Reorder moves by score so the next depth searches the best-looking move
      // first — significantly improves alpha-beta pruning at deeper depths.
      const sortedThisDepth = [...iterationScores].sort((a, b) => b.score - a.score);
      moves = sortedThisDepth.map((s) => s.move);
    } else {
      break;
    }
  }

  bestScoredMoves.sort((a, b) => b.score - a.score);

  return selectMoveWithVariance(bestScoredMoves, difficulty);
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

  // Compute goal center for big jump opportunity detection
  const goalPositionsForBonus = getGoalPositionsForState(state, player);
  const goalCenterForBonus = centroid(goalPositionsForBonus);
  const hasBigOpportunity = !state.isCustomLayout && checkBigJumpOpportunity(moves, goalCenterForBonus);

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
    {
      const strategic = computeStrategicScore(state, move, player, personality);
      const difficultyMultiplier = difficulty === 'easy' ? 0.4 : 1.0;
      const strategicWeight = inEndgame ? 2.0 : 1.0;
      score += strategic.total * strategicWeight * difficultyMultiplier;
      score += scoreLandingQuality(state, move, player, personality, difficulty);
      score += scoreLastMoveResponse(state, move, player, personality, difficulty);
      score += scoreSetupBlockRisk(state, move, player, personality, difficulty, strategic.steppingStoneValue);
      score += scoreLeapfrogPotential(state, move, player, personality);
    }

    // CRITICAL: In late endgame, heavily prioritize finishing moves for ALL difficulties
    if (inLateEndgame) {
      const endgameScore = scoreEndgameMove(state, move, player, personality);
      score += endgameScore;
    }

    // Endgame lateral evaluation: penalise purposeless sidesteps,
    // reward laterals that unlock a new chain entry into goal
    const lateralBonus = evaluateEndgameLateral(state, move, player);
    score += lateralBonus;

    // Prioritize large chain jumps when available (transition timing heuristic)
    score += computeBigJumpOpportunityBonus(move, goalCenterForBonus, hasBigOpportunity);

    // Landing hop quality: for jump endpoints, reward positions from which
    // the moved piece can make another good forward hop next turn.
    if (move.isJump) {
      let bestNextHopGain = 0;
      for (const dir of DIRECTIONS) {
        const over = { q: move.to.q + dir.q, r: move.to.r + dir.r, s: move.to.s + dir.s };
        const land = { q: move.to.q + dir.q * 2, r: move.to.r + dir.r * 2, s: move.to.s + dir.s * 2 };
        if (canJumpOver(next, over, player) && next.board.get(coordKey(land))?.type === 'empty') {
          const gain = cubeDistance(move.to, goalCenterForBonus) - cubeDistance(land, goalCenterForBonus);
          if (gain > bestNextHopGain) bestNextHopGain = gain;
        }
      }
      score += bestNextHopGain * 5;
    }

    return { move, score };
  });

  const deduped = selectBestChainStop(scored);
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit).map((s) => s.move);
}

