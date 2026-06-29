import type { Move, GameState, PlayerIndex, CubeCoord } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import { AI_DEPTH, AI_OPENING_DEPTH, AI_ENDGAME_DEPTH, AI_MOVE_LIMIT, AI_TIME_BUDGET_MS } from '@/types/ai';
import { getAllValidMoves, getValidMoves, canJumpOver } from '../moves';
import { applyMove, getGoalPositionsForState, countPiecesInGoal } from '../state';
import { getPlayerPieces } from '../setup';
import { cubeDistance, coordKey, centroid } from '../coordinates';
import { DIRECTIONS } from '../constants';
import { evaluatePosition } from './evaluate';
import { computePlayerProgress } from '../progress';
import { computeStrategicScore, isEndgame, findOpponentJumpThreats, scoreLandingQuality, scoreLastMoveResponse, scoreSetupBlockRisk, scoreLeapfrogPotential, scoreResidualTrajectory, scoreSourceDominance, scoreCreatesOpponentJump, scoreBackPieceChainSetup, scoreBackPiecePriority, backPriorityPersonalityFactor, proactiveJumpFactor, scoreLandingLateralDrift, scoreLateralCohesion, scoreChainExtension, scoreMakeRoomSetup, scoreInGoalRegression, scoreChainEndpointSetup, scoreChainBackwardHop, scoreChainEnablingStep, scoreFrontPieceSidestepPenalty, scoreInGoalLateralPenalty, scoreSamePieceMissedForwardPenalty, scoreLateralReachableByForwardPenalty, scoreShallowGoalEntryPenalty, chainEnablingRiskMultiplier, computeCurrentForwardJumps, computeBestForwardGainBySource } from './strategy';
import { findEndgameMove, isLateEndgame, scoreEndgameMove, evaluateEndgameLateral, getPiecePhase, findOptimalEndgameSequence } from './endgame';
import { getOpeningMove } from './openingBook';
import { clearApproachLaneCache } from './corridors';

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
 * Threshold: count >= 2 (third visit) — one revisit is normal endgame shuffling
 * and shouldn't override authoritative endgame-solver moves. A second revisit
 * (count of 2) indicates an actual cycle and blocks the move.
 */
function wouldRepeatState(state: GameState, move: Move): { repeats: boolean; count: number } {
  const nextState = applyMove(state, move);
  const hash = getBoardStateHash(nextState);
  const count = recentBoardStates.get(hash) || 0;
  return { repeats: count >= 2, count };
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
  clearApproachLaneCache();
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

  // Hard-veto in-goal backward moves: from a goal cell to a shallower goal
  // cell. The user has flagged "full back jumps" as the worst kind of error —
  // they're never justified outside the rare immediate stepping-stone case.
  // Detected here as a regression that progressDelta misses (centroid-distance
  // can be equal for both endpoints inside the goal triangle).
  {
    const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
    const fromInGoal = goalKeys.has(coordKey(move.from));
    const toInGoal = goalKeys.has(coordKey(move.to));
    if (fromInGoal && toInGoal) {
      const origin = { q: 0, r: 0, s: 0 };
      const fromDepth = cubeDistance(move.from, origin);
      const toDepth = cubeDistance(move.to, origin);
      if (toDepth < fromDepth) {
        // Allow only if it enables an immediate stepping-stone chain.
        const steppingStoneResult = isImmediateSteppingStone(state, move, player, goalCenter);
        if (steppingStoneResult === 'none') return Infinity;
      }
    }
    // Hard-veto pieces leaving the goal triangle. Flag 3 — `(4,-5) → (3,-4)`
    // is lateral by cube distance to centroid but the piece exits the goal,
    // dropping in-goal count by 1. User has flagged this as "BACKSTEP = BAD,
    // NEVER, NOT WORTH IT".
    if (fromInGoal && !toInGoal && difficulty === 'hard') return Infinity;

    // Hard-veto in-goal-to-in-goal LATERAL moves on hard when any outside
    // piece still has a forward move available. The user has flagged these
    // four rounds running as "total waste of a turn" — the soft penalty
    // (even at −800) loses to `evaluatePosition` deltas of 1000+ that can
    // arise from cohesion/alignment shifts in the leaf eval. There is no
    // legitimate case for shuffling pieces sideways inside the goal while
    // outside pieces still need to advance.
    if (fromInGoal && toInGoal && difficulty === 'hard') {
      const origin = { q: 0, r: 0, s: 0 };
      const fromDepthGoal = cubeDistance(move.from, origin);
      const toDepthGoal = cubeDistance(move.to, origin);
      if (toDepthGoal === fromDepthGoal) {
        const pieces = getPlayerPieces(state, player);
        for (const piece of pieces) {
          if (goalKeys.has(coordKey(piece))) continue;
          const pieceDist = cubeDistance(piece, goalCenter);
          for (const dir of DIRECTIONS) {
            const adj = { q: piece.q + dir.q, r: piece.r + dir.r, s: piece.s + dir.s };
            const content = state.board.get(coordKey(adj));
            if (content?.type !== 'empty') continue;
            const adjDist = cubeDistance(adj, goalCenter);
            if (pieceDist - adjDist >= 1) return Infinity;
          }
        }
      }
    }
  }

  // Cube-distance check supplements progressDelta because computePlayerProgress
  // clamps to [0,100]; in the opening (progress = 0), a backward step keeps
  // progress at 0 and slips through the progressDelta < 0 gate. Cube distance
  // is unclamped and detects every move that physically increases the moving
  // piece's distance to goal centroid.
  const fromCubeDist = cubeDistance(move.from, goalCenter);
  const toCubeDist = cubeDistance(move.to, goalCenter);
  const cubeBackward = toCubeDist > fromCubeDist + 0.01;

  // Hard-veto: outside-source lateral move when the SAME piece has a forward
  // move with gain ≥ 2 available (jump OR step). User has flagged this pattern
  // four rounds running ("this piece had a forward jump available, took a
  // sidestep instead"). Soft penalties up to −700 lose to evaluatePosition
  // deltas the minimax tree returns from cohesion/alignment shifts at the
  // leaves — making this a hard veto removes the move from candidates entirely
  // so the high leaf eval never matters.
  if (difficulty === 'hard' && !state.isCustomLayout) {
    const moveGain = fromCubeDist - toCubeDist;
    const fromInGoalCheck = (() => {
      for (const g of goalPositions) {
        if (g.q === move.from.q && g.r === move.from.r) return true;
      }
      return false;
    })();
    if (moveGain < 0.5 && !fromInGoalCheck) {
      const sourceMoves = getValidMoves(state, move.from);
      for (const sm of sourceMoves) {
        const smGain = cubeDistance(sm.from, goalCenter) - cubeDistance(sm.to, goalCenter);
        if (smGain >= 2) return Infinity;
      }
    }
  }

  // Hard-veto backward moves per difficulty rules
  if (progressDelta < 0 || cubeBackward) {
    // Easy and HARD: absolute ban on all backward moves. The user has
    // repeatedly flagged backsteps and back-hops as "terrible move, no reason
    // ever" — the prior hard-difficulty exception (allow if 2-ply net positive)
    // produced too many false positives where the "saved" gain never
    // materialised after opponent responses.
    if (difficulty === 'easy' || difficulty === 'hard') return Infinity;

    // Medium: backward steps (non-jump) are never justified — a step back by
    // 1 cell cannot reliably set up a better chain within the shallow lookahead.
    // Backward jumps (over a piece) may still pass the 2-move net check below.
    if (!move.isJump) return Infinity;

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

    // Medium: veto backward jumps if 2-move net is not positive
    if (progressDelta + bestNextDelta <= 0) {
      return Infinity;
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
      // Lateral step with no immediate chain payoff: bias toward forward movement.
      // Lateral jumps (rare, but valid for consolidation) keep no penalty.
      // Step moves that enable an immediate chain also stay at 0.
      // Penalty escalates when pieces are entering the goal AND a back piece is
      // being neglected — endzone sidesteps are the persistent observed mistake.
      if (!move.isJump && steppingStoneResult === 'none') {
        const piecesInGoal = countPiecesInGoal(state, player);
        // Detect a back piece left behind: any outside piece > 9 cells from goal centre
        let hasBackPiece = false;
        if (piecesInGoal >= 4) {
          const pieces = getPlayerPieces(state, player);
          const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
          for (const p of pieces) {
            if (goalKeys.has(coordKey(p))) continue;
            if (cubeDistance(p, goalCenter) > 9) { hasBackPiece = true; break; }
          }
        }
        if (hasBackPiece) {
          // Sidestep while a back piece is stranded — strongly discouraged.
          // Higher penalty for moves originating near the goal: those pieces have
          // no business shuffling while the back of the train is still in the start zone.
          const fromDist = cubeDistance(move.from, goalCenter);
          penalty = fromDist <= 5 ? 120 : 60;
        } else {
          penalty = piecesInGoal >= 7 ? 35 : 15;
        }
      }
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

  // Stronger scaling — repeated same-piece moves are almost always sidestep loops
  // that the previous values (20/80) didn't deter. Forces piece rotation.
  if (count < 2) return 0;     // 1st or 2nd consecutive turn: no penalty
  if (count === 2) return 60;  // 3rd consecutive turn: significant
  if (count === 3) return 200; // 4th: strong
  return 500;                  // 5th+: hard discouragement
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
  const chainGroups = new Map<string, Array<{ move: Move; score: number }>>();
  const nonChainMoves: Array<{ move: Move; score: number }> = [];

  for (const entry of scored) {
    const { move } = entry;
    // Multi-hop jump: jumpPath exists and has ≥1 step
    if (move.isJump && move.jumpPath && move.jumpPath.length >= 1) {
      const key = coordKey(move.from);
      const group = chainGroups.get(key);
      if (!group) {
        chainGroups.set(key, [entry]);
      } else {
        group.push(entry);
      }
    } else {
      nonChainMoves.push(entry);
    }
  }

  const result: Array<{ move: Move; score: number }> = [...nonChainMoves];
  for (const group of chainGroups.values()) {
    group.sort((a, b) => b.score - a.score);
    result.push(group[0]); // Always keep best-scored stop

    if (group.length > 1) {
      // Also always expose the longest chain stop (most intermediate hops) —
      // the 1-ply score can incorrectly prefer an early stop (better consolidation
      // at the intermediate position) over continuing to the furthest-forward cell.
      // Exposing the longest chain lets the deeper minimax resolve which is truly better.
      const longestChain = [...group].sort(
        (a, b) => (b.move.jumpPath?.length ?? 0) - (a.move.jumpPath?.length ?? 0)
      )[0];

      if (longestChain !== group[0]) {
        result.push(longestChain);
      } else if (group[0].score - group[1].score < 25) {
        result.push(group[1]); // Keep 2nd-best within 25 pts as before
      }
    }
  }

  return result;
}

/**
 * Best next-turn forward jump gain available to the piece that just stepped to
 * `from` in `nextState`. Considers full chain stops, not just single hops —
 * a step that opens a 2-hop chain into goal-zone wins over a step that only
 * unlocks a 1-cell hop (Flag 5 / Flag 7 pattern).
 */
function bestStepChainGain(
  nextState: GameState,
  from: CubeCoord,
  goalCenter: CubeCoord,
): number {
  let best = 0;
  for (const m of getValidMoves(nextState, from)) {
    if (!m.isJump) continue;
    const gain = cubeDistance(from, goalCenter) - cubeDistance(m.to, goalCenter);
    if (gain > best) best = gain;
  }
  return best;
}

/**
 * Check if any piece currently has a forward jump gaining ≥ 2 cells.
 * Computed once per turn and passed into move scoring.
 */
function checkBigJumpOpportunity(
  allMoves: Move[],
  goalCenter: CubeCoord
): boolean {
  return allMoves.some(m => {
    if (!m.isJump) return false;
    const gain = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
    return gain >= 2;
  });
}

/**
 * When a forward jump opportunity exists this turn:
 * - Bonus for moves that capitalise on it (jump gain ≥ 2).
 * - Penalty for lateral/backward non-jump moves — pointless sidesteps
 *   when a useful jump is available are a persistent AI mistake.
 */
function computeBigJumpOpportunityBonus(
  move: Move,
  goalCenter: CubeCoord,
  hasBigOpportunity: boolean
): number {
  if (!hasBigOpportunity) return 0;
  const moveDist = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  if (!move.isJump) {
    // Non-jump lateral or backward step while a forward jump exists — penalise
    if (moveDist <= 0) return -25;
    return 0; // Forward step is acceptable
  }
  const gain = moveDist;
  if (gain < 2) return 0;      // Lateral/backward jump — no bonus
  if (gain >= 4) return gain * 8; // Large jump — big bonus
  return gain * 4;               // Moderate jump — smaller bonus
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
  const goalKeySetForBonus = new Set(goalPositionsForBonus.map(g => coordKey(g)));
  const hasBigOpportunity = !state.isCustomLayout && checkBigJumpOpportunity(moves, goalCenterForBonus);
  const currentFwdJumpsLocal = computeCurrentForwardJumps(state, player, goalCenterForBonus);
  const bestFwdGainBySrcLocal = computeBestForwardGainBySource(state, player, goalCenterForBonus);

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

    // Pre-filter must see the same sidestep penalties the root sort sees, or
    // bad lateral chains slip into the top 8 protected by `selectBestChainStop`.
    score += scoreFrontPieceSidestepPenalty(state, move, player, goalCenterForBonus, currentFwdJumpsLocal);
    score += scoreInGoalLateralPenalty(state, move, player, goalCenterForBonus, currentFwdJumpsLocal);
    score += scoreSamePieceMissedForwardPenalty(state, move, player, goalCenterForBonus, bestFwdGainBySrcLocal);
    score += scoreLateralReachableByForwardPenalty(state, move, player, goalCenterForBonus);
    score += scoreShallowGoalEntryPenalty(state, move, player);

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
      score += scoreResidualTrajectory(state, move, player, goalCenterForBonus);
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

    // Goal-entry chain stop bonus: a chain jump that lands INSIDE the goal zone
    // should clearly beat one that stops just outside. Chain-length bonus prefers
    // the longer chain when multiple stops along the path land in goal — without
    // this, the shorter chain's stronger landing-quality often beat the deeper
    // entry (the "stop too early" pattern from Flag 3). Only applies in midgame
    // (below isLateEndgame's threshold); above that, scoreEndgameMove handles it.
    if (move.isJump && !state.isCustomLayout && goalKeySetForBonus.has(coordKey(move.to))) {
      const depthBonus = cubeDistance(move.to, { q: 0, r: 0, s: 0 }); // deeper = farther from center
      const chainLenBonus = (move.jumpPath?.length ?? 1) * 60;
      score += 100 + depthBonus * 8 + chainLenBonus;
    }

    // Source-dominance bonus: jump-over-friendly wins over a step from that
    // friendly to the same destination — both end at the same spot, but the
    // jump moves a back piece while the step would have moved the front piece.
    score += scoreSourceDominance(state, move, player);

    // Creates-opponent-jump penalty: stepping to a cell whose neighbor is an
    // opponent piece and whose opposite cell is empty hands the opponent a
    // free forward jump over us next turn.
    score += scoreCreatesOpponentJump(state, move, player);

    // Back-piece chain setup: a step that opens a new forward jump for the
    // most-back piece is strategically more valuable than a same-improvement
    // step from a front piece (Flag 4 — the "3-piece setup" pattern).
    score += scoreBackPieceChainSetup(state, move, player);

    // STRICT back-piece priority: a forward move on the back-most outside
    // piece(s) is unconditionally preferred. Catches "tied back pieces" and
    // "1-cell gap" cases that hasSignificantStraggler (gap≥2) misses.
    // Personality-scaled: generalist/aggressive damp this so proactive jumps
    // can compete with single back-piece steps in midgame.
    score += scoreBackPiecePriority(state, move, player)
      * backPriorityPersonalityFactor(personality, countPiecesInGoal(state, player));

    // Lateral cohesion: reward outside-piece moves whose destination closes
    // the gap to the centroid of other outside pieces. Counter-pressure on
    // forward steps that drift to the board edge and abandon teammates.
    score += scoreLateralCohesion(state, move, player);

    // Chain extension: quadratic in jump improvement so longer chain stops
    // beat shorter stops in the same BFS tree. Personality-scaled: generalist
    // and aggressive amplify this so big chain jumps reliably outscore single
    // back-piece steps in midgame.
    score += scoreChainExtension(state, move, player) * proactiveJumpFactor(personality);

    // Make-room: in-goal piece relocation that vacates a cell adjacent to a
    // back piece's chain approach. Rewards strategic stepping-stone setup
    // before the dedicated endgame solver kicks in at inGoal ≥ 6.
    score += scoreMakeRoomSetup(state, move, player);

    // In-goal regression: heavily penalize in-goal moves to shallower cells.
    score += scoreInGoalRegression(state, move, player);

    // Chain endpoint setup: for jumps, reward landing positions that enable
    // a teammate to jump over us forward, or block an opponent's planned jump.
    score += scoreChainEndpointSetup(state, move, player);

    // Backward-hop penalty: chains that go deeper into goal then come back to
    // a shallower cell are penalized — the deeper stop was better.
    score += scoreChainBackwardHop(state, move, player);

    // Mid-board lateral-drift penalty for jump landings: penalises chain stops
    // that drift off-axis when still far from goal (wasted lateral motion).
    score += scoreLandingLateralDrift(state, move, player, personality);

    // Prioritize large chain jumps when available (transition timing heuristic).
    // Personality-scaled (defensive 1.0, generalist 1.3, aggressive 1.6).
    score += computeBigJumpOpportunityBonus(move, goalCenterForBonus, hasBigOpportunity)
      * proactiveJumpFactor(personality);

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

    // Step-move next-turn jump potential: which step direction sets up the
    // best follow-up jump? Considers full chain stops so a "lateral that
    // unlocks a double jump" (Flag 5/7) beats a "forward step that dead-ends".
    if (!move.isJump && !state.isCustomLayout) {
      // Personality-scaled: generalist/aggressive favor setup steps that unlock
      // bigger follow-up jumps (proactiveJumpFactor: 1.0 / 1.3 / 1.6).
      score += bestStepChainGain(next, move.to, goalCenterForBonus) * 8 * proactiveJumpFactor(personality);
    }

    return { move, score };
  });

  const deduped = selectBestChainStop(scored);
  deduped.sort((a, b) => b.score - a.score);
  return keepGoalEntryJumps(deduped, goalKeySetForBonus, limit, state).map((s) => s.move);
}

/**
 * Slice to `limit`, but guarantee that every chain jump entering the goal zone
 * survives. Without this, a piece's longest goal-entering chain can rank just
 * below the limit and get dropped — the AI then never sees its best move (the
 * "didn't jump all the way into the end zone" failure mode).
 *
 * "Goal-entering" = jump whose source is outside the goal but lands inside it.
 * Already-in-goal shuffles do not get the guarantee (they get vetoed elsewhere).
 */
function keepGoalEntryJumps(
  sortedByScore: Array<{ move: Move; score: number }>,
  goalKeys: Set<string>,
  limit: number,
  state: GameState,
): Array<{ move: Move; score: number }> {
  if (state.isCustomLayout || sortedByScore.length <= limit) return sortedByScore.slice(0, limit);
  const top = sortedByScore.slice(0, limit);
  const topSet = new Set(top.map((s) => s.move));
  const protectedExtras: Array<{ move: Move; score: number }> = [];
  for (const entry of sortedByScore.slice(limit)) {
    if (topSet.has(entry.move)) continue;
    const { move } = entry;
    if (!move.isJump) continue;
    if (!goalKeys.has(coordKey(move.to))) continue;
    if (goalKeys.has(coordKey(move.from))) continue;
    protectedExtras.push(entry);
  }
  return protectedExtras.length === 0 ? top : [...top, ...protectedExtras];
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

/**
 * Re-runs each scorer individually to build a per-move breakdown for debug
 * display. Mirrors the scoring order in getTopMoves/getTopMovesFromList.
 */
function captureMoveBreakdown(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  minimaxScore: number
): import('@/types/game').AIScoreBreakdown {
  const next = applyMove(state, move);
  const inEndgame = isEndgame(state, player);
  const inLateEndgameLocal = isLateEndgame(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const threats = findOpponentJumpThreats(state, player);
  const allMovesLocal = getAllValidMoves(state, player);
  const hasBigOpportunity = !state.isCustomLayout && checkBigJumpOpportunity(allMovesLocal, goalCenter);

  const evalPos = evaluatePosition(next, player, personality, difficulty);
  const regPen = computeRegressionPenalty(state, move, player, difficulty);
  const repPen = computeRepetitionPenalty(state, move, player, difficulty);

  const strategic = computeStrategicScore(state, move, player, personality, threats);
  const difficultyMultiplier = difficulty === 'easy' ? 0.4 : 1.0;
  const strategicWeight = inEndgame ? 2.0 : 1.0;

  const landingQ = scoreLandingQuality(state, move, player, personality, difficulty);
  const lastMove = scoreLastMoveResponse(state, move, player, personality, difficulty);
  const setupBlock = scoreSetupBlockRisk(state, move, player, personality, difficulty, strategic.steppingStoneValue);
  const leapfrog = scoreLeapfrogPotential(state, move, player, personality);
  const residual = scoreResidualTrajectory(state, move, player, goalCenter);

  const endgameMoveScore = inLateEndgameLocal ? scoreEndgameMove(state, move, player, personality) : 0;
  const endgameLatScore = evaluateEndgameLateral(state, move, player);
  const currentFwdJumps = computeCurrentForwardJumps(state, player, goalCenter);
  const bestFwdGainBySrc = computeBestForwardGainBySource(state, player, goalCenter);
  const chainEnablingRaw = scoreChainEnablingStep(state, move, next, player, goalCenter, currentFwdJumps);
  // Apply the same risk discount the strategic bonus path uses, so the debug
  // breakdown shows the value that actually shaped the decision.
  const chainEnabling = chainEnablingRaw > 0
    ? chainEnablingRaw * chainEnablingRiskMultiplier(next, move.to, player)
    : chainEnablingRaw;
  const frontPieceSidestep = scoreFrontPieceSidestepPenalty(state, move, player, goalCenter, currentFwdJumps);
  const inGoalLateral = scoreInGoalLateralPenalty(state, move, player, goalCenter, currentFwdJumps);
  const samePieceMissedForward = scoreSamePieceMissedForwardPenalty(state, move, player, goalCenter, bestFwdGainBySrc);
  const lateralReachableByForward = scoreLateralReachableByForwardPenalty(state, move, player, goalCenter);
  const shallowGoalEntry = scoreShallowGoalEntryPenalty(state, move, player);

  let goalEntryBonus = 0;
  if (move.isJump && !state.isCustomLayout && goalKeys.has(coordKey(move.to))) {
    const depthBonus = cubeDistance(move.to, { q: 0, r: 0, s: 0 });
    const chainLenBonus = (move.jumpPath?.length ?? 1) * 60;
    goalEntryBonus = 100 + depthBonus * 8 + chainLenBonus;
  }

  let landingHop = 0;
  if (move.isJump) {
    let bestNextHopGain = 0;
    for (const dir of DIRECTIONS) {
      const over = { q: move.to.q + dir.q, r: move.to.r + dir.r, s: move.to.s + dir.s };
      const land = { q: move.to.q + dir.q * 2, r: move.to.r + dir.r * 2, s: move.to.s + dir.s * 2 };
      if (canJumpOver(next, over, player) && next.board.get(coordKey(land))?.type === 'empty') {
        const gain = cubeDistance(move.to, goalCenter) - cubeDistance(land, goalCenter);
        if (gain > bestNextHopGain) bestNextHopGain = gain;
      }
    }
    landingHop = bestNextHopGain * 5;
  }

  return {
    evaluatePosition: evalPos,
    regressionPenalty: regPen === Infinity ? -999999 : -regPen,
    repetitionPenalty: repPen === Infinity ? -999999 : -repPen,
    strategicTotal: strategic.total * strategicWeight * difficultyMultiplier,
    landingQuality: landingQ,
    lastMoveResponse: lastMove,
    setupBlockRisk: setupBlock,
    leapfrogPotential: leapfrog,
    residualTrajectory: residual,
    sourceDominance: scoreSourceDominance(state, move, player),
    createsOpponentJump: scoreCreatesOpponentJump(state, move, player),
    backPieceChainSetup: scoreBackPieceChainSetup(state, move, player),
    backPiecePriority: scoreBackPiecePriority(state, move, player)
      * backPriorityPersonalityFactor(personality, countPiecesInGoal(state, player)),
    chainEnablingStep: chainEnabling,
    frontPieceSidestep,
    inGoalLateral,
    samePieceMissedForward,
    lateralReachableByForward,
    shallowGoalEntry,
    lateralCohesion: scoreLateralCohesion(state, move, player),
    chainExtension: scoreChainExtension(state, move, player) * proactiveJumpFactor(personality),
    makeRoomSetup: scoreMakeRoomSetup(state, move, player),
    inGoalRegression: scoreInGoalRegression(state, move, player),
    chainEndpointSetup: scoreChainEndpointSetup(state, move, player),
    chainBackwardHop: scoreChainBackwardHop(state, move, player),
    goalEntryBonus,
    endgameLateral: endgameLatScore,
    endgameMove: endgameMoveScore,
    landingHopQuality: landingHop,
    bigJumpOpportunity: computeBigJumpOpportunityBonus(move, goalCenter, hasBigOpportunity)
      * proactiveJumpFactor(personality),
    minimaxScore,
  };
}

function buildDebugInfo(
  state: GameState,
  player: PlayerIndex,
  bestScoredMoves: Array<{ move: Move; score: number }>,
  pickedMove: Move,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  depthReached: number
): import('@/types/game').AIDebugInfo {
  const topCandidates = bestScoredMoves.slice(0, 8);
  return {
    difficulty,
    personality,
    depthReached,
    candidateCount: bestScoredMoves.length,
    candidates: topCandidates.map(s => ({
      from: s.move.from,
      to: s.move.to,
      isJump: s.move.isJump,
      jumpPath: s.move.jumpPath,
      finalScore: s.score,
      breakdown: captureMoveBreakdown(state, s.move, player, personality, difficulty, s.score),
      picked: s.move === pickedMove,
    })),
  };
}

function buildMinimalDebugInfo(
  move: Move,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  note: string
): import('@/types/game').AIDebugInfo {
  const zeroBreakdown: import('@/types/game').AIScoreBreakdown = {
    evaluatePosition: 0, regressionPenalty: 0, repetitionPenalty: 0,
    strategicTotal: 0, landingQuality: 0, lastMoveResponse: 0,
    setupBlockRisk: 0, leapfrogPotential: 0, residualTrajectory: 0,
    sourceDominance: 0, createsOpponentJump: 0, backPieceChainSetup: 0, backPiecePriority: 0, chainEnablingStep: 0, frontPieceSidestep: 0, inGoalLateral: 0, samePieceMissedForward: 0, lateralReachableByForward: 0, shallowGoalEntry: 0,
    lateralCohesion: 0, chainExtension: 0, makeRoomSetup: 0,
    inGoalRegression: 0, chainEndpointSetup: 0, chainBackwardHop: 0,
    goalEntryBonus: 0, endgameLateral: 0, endgameMove: 0,
    landingHopQuality: 0, bigJumpOpportunity: 0, minimaxScore: 0,
  };
  return {
    difficulty,
    personality,
    depthReached: 0,
    candidateCount: 1,
    candidates: [{
      from: move.from, to: move.to, isJump: move.isJump,
      jumpPath: move.jumpPath, finalScore: 0,
      breakdown: zeroBreakdown, picked: true,
    }],
    note,
  };
}

interface StrategicMoveContext {
  inEndgame: boolean;
  inLateEndgame: boolean;
  goalCenter: CubeCoord;
  goalKeySet: Set<string>;
  hasBigOpportunity: boolean;
  threats: ReturnType<typeof findOpponentJumpThreats> | undefined;
  currentForwardJumps: Array<{ sourceDist: number; gain: number }>;
  bestForwardGainBySource: Map<string, number>;
}

/**
 * Strategic-bonus portion of the 1-ply pre-filter score.
 *
 * Excludes `evaluatePosition` (minimax already computes that at leaves) and
 * penalties (added separately). Mirrors the inline scoring in getTopMoves /
 * getTopMovesFromList so the SAME signals that pick candidates also rank
 * them at the root sort — otherwise minimax silently discards every
 * move-level signal (back-piece priority, goal-entry bonus, chain extension,
 * etc.) and only positional evaluation drives the final pick.
 */
function computeStrategicMoveBonus(
  state: GameState,
  move: Move,
  next: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  ctx: StrategicMoveContext,
): number {
  let bonus = 0;

  const strategic = computeStrategicScore(state, move, player, personality, ctx.threats);
  const difficultyMultiplier = difficulty === 'easy' ? 0.4 : 1.0;
  const strategicWeight = ctx.inEndgame ? 2.0 : 1.0;
  bonus += strategic.total * strategicWeight * difficultyMultiplier;
  bonus += scoreLandingQuality(state, move, player, personality, difficulty);
  bonus += scoreLastMoveResponse(state, move, player, personality, difficulty);
  bonus += scoreSetupBlockRisk(state, move, player, personality, difficulty, strategic.steppingStoneValue);
  bonus += scoreLeapfrogPotential(state, move, player, personality);
  bonus += scoreResidualTrajectory(state, move, player, ctx.goalCenter);

  if (ctx.inLateEndgame) {
    bonus += scoreEndgameMove(state, move, player, personality);
  }
  bonus += evaluateEndgameLateral(state, move, player);

  if (move.isJump && !state.isCustomLayout && ctx.goalKeySet.has(coordKey(move.to))) {
    const depthBonus = cubeDistance(move.to, { q: 0, r: 0, s: 0 });
    const chainLenBonus = (move.jumpPath?.length ?? 1) * 60;
    bonus += 100 + depthBonus * 8 + chainLenBonus;
  }

  bonus += scoreSourceDominance(state, move, player);
  bonus += scoreCreatesOpponentJump(state, move, player);
  {
    const chainEnablingRaw = scoreChainEnablingStep(state, move, next, player, ctx.goalCenter, ctx.currentForwardJumps);
    // Risk discount: if our setup piece becomes a stepping stone for an
    // opponent's 1-ply jump, the chain we enabled is liable to be undone.
    bonus += chainEnablingRaw > 0
      ? chainEnablingRaw * chainEnablingRiskMultiplier(next, move.to, player)
      : chainEnablingRaw;
  }
  bonus += scoreFrontPieceSidestepPenalty(state, move, player, ctx.goalCenter, ctx.currentForwardJumps);
  bonus += scoreInGoalLateralPenalty(state, move, player, ctx.goalCenter, ctx.currentForwardJumps);
  bonus += scoreSamePieceMissedForwardPenalty(state, move, player, ctx.goalCenter, ctx.bestForwardGainBySource);
  bonus += scoreLateralReachableByForwardPenalty(state, move, player, ctx.goalCenter);
  bonus += scoreShallowGoalEntryPenalty(state, move, player);
  bonus += scoreBackPieceChainSetup(state, move, player);
  bonus += scoreBackPiecePriority(state, move, player)
    * backPriorityPersonalityFactor(personality, countPiecesInGoal(state, player));
  bonus += scoreLateralCohesion(state, move, player);
  bonus += scoreChainExtension(state, move, player) * proactiveJumpFactor(personality);
  bonus += scoreMakeRoomSetup(state, move, player);
  bonus += scoreInGoalRegression(state, move, player);
  bonus += scoreChainEndpointSetup(state, move, player);
  bonus += scoreChainBackwardHop(state, move, player);
  bonus += scoreLandingLateralDrift(state, move, player, personality);
  bonus += computeBigJumpOpportunityBonus(move, ctx.goalCenter, ctx.hasBigOpportunity)
    * proactiveJumpFactor(personality);

  if (move.isJump) {
    let bestNextHopGain = 0;
    for (const dir of DIRECTIONS) {
      const over = { q: move.to.q + dir.q, r: move.to.r + dir.r, s: move.to.s + dir.s };
      const land = { q: move.to.q + dir.q * 2, r: move.to.r + dir.r * 2, s: move.to.s + dir.s * 2 };
      if (canJumpOver(next, over, player) && next.board.get(coordKey(land))?.type === 'empty') {
        const gain = cubeDistance(move.to, ctx.goalCenter) - cubeDistance(land, ctx.goalCenter);
        if (gain > bestNextHopGain) bestNextHopGain = gain;
      }
    }
    bonus += bestNextHopGain * 5;
  }

  if (!move.isJump && !state.isCustomLayout) {
    bonus += bestStepChainGain(next, move.to, ctx.goalCenter) * 8 * proactiveJumpFactor(personality);
  }

  return bonus;
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
      if (bestAltScore <= bookScore + 300) {
        bookMove.debug = buildMinimalDebugInfo(bookMove, difficulty, personality, 'opening book');
        return bookMove;
      }
      // A significantly better move exists — fall through to normal search
    }
  }

  // PRIORITY: BFS optimal finish for small endgame puzzles (≤3 outside, ≤4 empty goals).
  // Finds the minimum-move sequence exactly, bypassing all heuristics.
  if (!state.isCustomLayout) {
    const optimalMove = findOptimalEndgameSequence(state, player);
    if (optimalMove) {
      const { repeats } = wouldRepeatState(state, optimalMove);
      if (!repeats) {
        optimalMove.debug = buildMinimalDebugInfo(optimalMove, difficulty, personality, 'optimal endgame BFS');
        return optimalMove;
      }
    }
  }

  // PRIORITY: Late endgame finishing logic for ALL difficulty levels
  // When 6+ pieces are in goal, the dedicated endgame solver is authoritative —
  // UNLESS there is an "extreme straggler": a piece more than 12 cells from the
  // goal center. The endgame solver greedily fills the goal from nearby pieces,
  // completely ignoring pieces that are still far away. When a distant straggler
  // exists, fall through to the regular search which has an extreme-straggler
  // penalty that correctly prioritises moving that piece first.
  if (isLateEndgame(state, player)) {
    const goalPosES = getGoalPositionsForState(state, player);
    const goalCenterES = centroid(goalPosES);
    const goalKeysES = new Set(goalPosES.map(g => coordKey(g)));
    const piecesES = getPlayerPieces(state, player);

    // Straggler-aware threshold: scales with the number of pieces already in goal
    // so mid-distance stragglers (8–11 cells out) trigger the bypass, not just
    // far ones. Mirrors the extremeStragPenalty threshold in evaluate.ts.
    //   6 in goal → 8,   7 in goal → 6,   8+ in goal → 5
    // Smaller threshold ⇒ the minimax (with its straggler penalties) drives
    // the move, not the greedy endgame solver.
    const inGoalES = piecesES.filter(p => goalKeysES.has(coordKey(p))).length;
    const stragglerThreshold = inGoalES >= 5
      ? Math.max(5, 12 - (inGoalES - 4) * 2)
      : 12;
    const hasExtremeStraggler = piecesES.some(
      p => !goalKeysES.has(coordKey(p)) && cubeDistance(p, goalCenterES) > stragglerThreshold
    );

    if (!hasExtremeStraggler) {
      const endgameMove = findEndgameMove(state, player);
      if (endgameMove) {
        // Take the endgame solver's recommendation. The wouldRepeatState gate
        // now allows one revisit (count >= 2), so a move triggering it means
        // we'd genuinely be in a third visit — at that point the regular search
        // (which has its own anti-cycle penalties) handles escape.
        const { repeats } = wouldRepeatState(state, endgameMove);
        if (!repeats) {
          endgameMove.debug = buildMinimalDebugInfo(endgameMove, difficulty, personality, 'late-endgame solver');
          return endgameMove;
        }
      }
    }
    // Extreme straggler present, or solver suggested a cycle — fall through.
  }

  // For custom layouts, use the simple progress-maximizing approach
  // This is more reliable than layered penalties for arbitrary board shapes
  if (state.isCustomLayout) {
    const customMove = findBestMoveForCustomLayout(state, player);
    if (customMove) {
      customMove.debug = buildMinimalDebugInfo(customMove, difficulty, personality, 'custom layout');
    }
    return customMove;
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
    // All moves vetoed - find the least bad option.
    // Regression violations (backward/leaving-goal moves) score 5× higher than
    // repetition violations (forward moves that repeat state) so the fallback
    // always prefers a forward-cycling move over a backward step.
    const scoredByPenalty = candidateMoves.map((m) => {
      const regPenalty = computeRegressionPenalty(state, m, player, difficulty);
      const repPenalty = computeRepetitionPenalty(state, m, player, difficulty);
      const totalPenalty = (regPenalty === Infinity ? 5000000 : regPenalty) +
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

  // Pre-compute per-move strategic bonuses (depth-independent — they only
  // depend on root state + move, so we compute once and reuse every depth).
  // Minimax leaves use evaluatePosition only; without re-adding these signals
  // at the root sort, back-piece priority, goal-entry bonus, chain extension,
  // setup-block risk, etc. silently drop out of the final ranking.
  const moveStrategicBonuses = new Map<Move, number>();
  {
    const goalPositionsRoot = getGoalPositionsForState(state, player);
    const goalCenterRoot = centroid(goalPositionsRoot);
    const goalKeySetRoot = new Set(goalPositionsRoot.map(g => coordKey(g)));
    const hasBigOpportunityRoot = !state.isCustomLayout && checkBigJumpOpportunity(moves, goalCenterRoot);
    const threatsRoot = (difficulty !== 'easy' && (personality === 'defensive' || personality === 'generalist'))
      ? findOpponentJumpThreats(state, player)
      : undefined;
    const ctx: StrategicMoveContext = {
      inEndgame: isEndgame(state, player),
      inLateEndgame: isLateEndgame(state, player),
      goalCenter: goalCenterRoot,
      goalKeySet: goalKeySetRoot,
      hasBigOpportunity: hasBigOpportunityRoot,
      threats: threatsRoot,
      currentForwardJumps: computeCurrentForwardJumps(state, player, goalCenterRoot),
      bestForwardGainBySource: computeBestForwardGainBySource(state, player, goalCenterRoot),
    };
    for (const move of moves) {
      const next = applyMove(state, move);
      moveStrategicBonuses.set(move, computeStrategicMoveBonus(state, move, next, player, personality, difficulty, ctx));
    }
  }

  // Iterative deepening: search depth 1, then 2, ... up to maxDepth.
  // Each iteration overwrites the previous result, so even if we abort
  // mid-iteration we still have the previous depth's best move.
  let bestScoredMoves: Array<{ move: Move; score: number }> = moves.map(m => ({
    move: m,
    score: -(movePenalties.get(m) ?? 0) + (moveStrategicBonuses.get(m) ?? 0),
  }));
  let depthReached = 0;

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
      const strategicBonus = moveStrategicBonuses.get(move) ?? 0;
      const next = applyMove(state, move);
      let score: number;

      if (is2Player) {
        score = minimax(next, depth - 1, -Infinity, Infinity, player, personality, difficulty);
      } else {
        score = maxn(next, depth - 1, player, personality, difficulty);
      }

      score -= penalty;
      score += strategicBonus;
      iterationScores.push({ move, score });
    }

    // Only commit this iteration's results if it completed fully
    if (!aborted && iterationScores.length === moves.length) {
      bestScoredMoves = iterationScores;
      depthReached = depth;
      // Reorder moves by score so the next depth searches the best-looking move
      // first — significantly improves alpha-beta pruning at deeper depths.
      const sortedThisDepth = [...iterationScores].sort((a, b) => b.score - a.score);
      moves = sortedThisDepth.map((s) => s.move);
    } else {
      break;
    }
  }

  bestScoredMoves.sort((a, b) => b.score - a.score);

  const pickedMove = selectMoveWithVariance(bestScoredMoves, difficulty);
  pickedMove.debug = buildDebugInfo(state, player, bestScoredMoves, pickedMove, difficulty, personality, depthReached);
  return pickedMove;
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
  const goalKeySetForBonus = new Set(goalPositionsForBonus.map(g => coordKey(g)));
  const hasBigOpportunity = !state.isCustomLayout && checkBigJumpOpportunity(moves, goalCenterForBonus);
  const currentFwdJumpsLocal = computeCurrentForwardJumps(state, player, goalCenterForBonus);
  const bestFwdGainBySrcLocal = computeBestForwardGainBySource(state, player, goalCenterForBonus);

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

    // Pre-filter must see the same sidestep penalties the root sort sees, or
    // bad lateral chains slip into the top 8 protected by `selectBestChainStop`.
    score += scoreFrontPieceSidestepPenalty(state, move, player, goalCenterForBonus, currentFwdJumpsLocal);
    score += scoreInGoalLateralPenalty(state, move, player, goalCenterForBonus, currentFwdJumpsLocal);
    score += scoreSamePieceMissedForwardPenalty(state, move, player, goalCenterForBonus, bestFwdGainBySrcLocal);
    score += scoreLateralReachableByForwardPenalty(state, move, player, goalCenterForBonus);
    score += scoreShallowGoalEntryPenalty(state, move, player);

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
      score += scoreResidualTrajectory(state, move, player, goalCenterForBonus);
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

    // Goal-entry chain stop bonus: match the one in getTopMoves (see above).
    if (move.isJump && !state.isCustomLayout && goalKeySetForBonus.has(coordKey(move.to))) {
      const depthBonus = cubeDistance(move.to, { q: 0, r: 0, s: 0 });
      const chainLenBonus = (move.jumpPath?.length ?? 1) * 60;
      score += 100 + depthBonus * 8 + chainLenBonus;
    }

    // Source-dominance bonus (match getTopMoves)
    score += scoreSourceDominance(state, move, player);
    score += scoreCreatesOpponentJump(state, move, player);
    score += scoreBackPieceChainSetup(state, move, player);
    score += scoreBackPiecePriority(state, move, player)
      * backPriorityPersonalityFactor(personality, countPiecesInGoal(state, player));
    score += scoreLateralCohesion(state, move, player);
    score += scoreChainExtension(state, move, player) * proactiveJumpFactor(personality);
    score += scoreMakeRoomSetup(state, move, player);
    score += scoreInGoalRegression(state, move, player);
    score += scoreChainEndpointSetup(state, move, player);
    score += scoreChainBackwardHop(state, move, player);
    score += scoreLandingLateralDrift(state, move, player, personality);

    // Prioritize large chain jumps when available (transition timing heuristic).
    // Personality-scaled (defensive 1.0, generalist 1.3, aggressive 1.6).
    score += computeBigJumpOpportunityBonus(move, goalCenterForBonus, hasBigOpportunity)
      * proactiveJumpFactor(personality);

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

    // Step-move next-turn jump potential: which step direction sets up the
    // best follow-up jump? Considers full chain stops so a "lateral that
    // unlocks a double jump" (Flag 5/7) beats a "forward step that dead-ends".
    if (!move.isJump && !state.isCustomLayout) {
      // Personality-scaled: generalist/aggressive favor setup steps that unlock
      // bigger follow-up jumps (proactiveJumpFactor: 1.0 / 1.3 / 1.6).
      score += bestStepChainGain(next, move.to, goalCenterForBonus) * 8 * proactiveJumpFactor(personality);
    }

    return { move, score };
  });

  const deduped = selectBestChainStop(scored);
  deduped.sort((a, b) => b.score - a.score);
  return keepGoalEntryJumps(deduped, goalKeySetForBonus, limit, state).map((s) => s.move);
}

