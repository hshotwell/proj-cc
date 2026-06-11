/**
 * Endgame solver for Chinese Checkers.
 *
 * CRITICAL RULES:
 * 1. NEVER move a piece to a shallower goal position (unless enabling entry)
 * 2. NEVER move a piece OUT of goal unless it enables an immediate entry
 * 3. ALWAYS extend chain jumps to maximum distance toward deepest goal
 * 4. When pieces are stuck, look ahead to find the minimal shuffle sequence
 * 5. Identify and execute "make room" moves - move blocking pieces deeper
 */

import type { GameState, PlayerIndex, CubeCoord, Move } from '@/types/game';
import { coordKey, cubeEquals, cubeDistance } from '../coordinates';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { getPlayerPieces } from '../setup';
import { getAllValidMoves, canJumpOver } from '../moves';
import { applyMove } from '../state';
import { DIRECTIONS } from '../constants';
import { getCachedEndgameInsights } from '../learning';

/**
 * Check if we're in late endgame where finishing logic should take over.
 * Trigger at 7+ pieces to focus on finishing efficiently.
 */
export function isLateEndgame(state: GameState, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const pieces = getPlayerPieces(state, player);

  let inGoal = 0;
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) {
      inGoal++;
    }
  }

  // Late endgame: 7+ pieces in goal (3 or fewer remaining)
  return inGoal >= 7;
}

/**
 * Calculate the "depth" of a goal position.
 * Depth = distance from board center. Higher = deeper = should be filled first.
 */
export function getGoalPositionDepth(goalPos: CubeCoord): number {
  const boardCenter: CubeCoord = { q: 0, r: 0, s: 0 };
  return cubeDistance(goalPos, boardCenter);
}

/**
 * Get empty goal positions sorted by depth (deepest first).
 */
export function getEmptyGoalsByDepth(state: GameState, player: PlayerIndex): CubeCoord[] {
  const goalPositions = getGoalPositionsForState(state, player);
  const emptyGoals: Array<{ pos: CubeCoord; depth: number }> = [];

  for (const goal of goalPositions) {
    const content = state.board.get(coordKey(goal));
    if (content?.type === 'empty') {
      emptyGoals.push({ pos: goal, depth: getGoalPositionDepth(goal) });
    }
  }

  emptyGoals.sort((a, b) => b.depth - a.depth);
  return emptyGoals.map(g => g.pos);
}

/**
 * Find pieces NOT in goal positions.
 */
export function getPiecesOutsideGoal(state: GameState, player: PlayerIndex): CubeCoord[] {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const pieces = getPlayerPieces(state, player);
  return pieces.filter(p => !goalKeys.has(coordKey(p)));
}

/**
 * Check if a move places a piece directly into an empty goal from OUTSIDE.
 */
export function isDirectGoalEntry(state: GameState, move: Move, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  return goalKeys.has(coordKey(move.to)) && !goalKeys.has(coordKey(move.from));
}

/**
 * Check if an outside piece could enter a specific goal position via jump
 * if that position were empty.
 */
function couldEnterGoalIfEmpty(
  state: GameState,
  goalPos: CubeCoord,
  player: PlayerIndex,
  piecesOutside: CubeCoord[]
): CubeCoord | null {
  // For each direction, check if there's a piece that could jump INTO goalPos
  for (const dir of DIRECTIONS) {
    // The piece would need to be 2 steps away in the opposite direction
    const jumperPos: CubeCoord = {
      q: goalPos.q - dir.q * 2,
      r: goalPos.r - dir.r * 2,
      s: goalPos.s - dir.s * 2,
    };

    // Check if there's an outside piece there
    const outsidePiece = piecesOutside.find(p => cubeEquals(p, jumperPos));
    if (!outsidePiece) continue;

    // Check if there's a jumpable piece between the jumper and the goal
    const overPos: CubeCoord = {
      q: goalPos.q - dir.q,
      r: goalPos.r - dir.r,
      s: goalPos.s - dir.s,
    };
    if (canJumpOver(state, overPos, player)) {
      return outsidePiece; // This outside piece could jump in if goalPos were empty
    }
  }

  return null;
}

/**
 * Find the best endgame fast-path move.
 *
 * Only handles two provably-correct cases that require no lookahead:
 *   1. Direct goal entry — outside piece steps or jumps into an empty goal cell
 *   2. Move deeper within goal — piece advances to a deeper goal cell
 *
 * Everything else (shuffling, stepping stones, make-room) is removed and
 * handled by depth-scaled minimax in findBestMove.
 *
 * Returns null when neither case applies, signalling that the caller should
 * fall through to normal search.
 */
export function findEndgameMove(state: GameState, player: PlayerIndex): Move | null {
  const allMoves = getAllValidMoves(state, player);
  if (allMoves.length === 0) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // Priority 1: Direct goal entry — outside piece steps or jumps into an empty goal cell.
  // Always optimal; take deepest available.
  const directEntries = allMoves
    .filter(m => !goalKeys.has(coordKey(m.from)) && goalKeys.has(coordKey(m.to)))
    .map(m => ({
      move: m,
      depth: getGoalPositionDepth(m.to),
      jumpLen: m.jumpPath?.length ?? 0,
    }))
    .sort((a, b) => b.depth !== a.depth ? b.depth - a.depth : b.jumpLen - a.jumpLen);

  if (directEntries.length > 0) return directEntries[0].move;

  // Priority 2: Move deeper within goal — piece advances to a deeper goal cell.
  // Always a strict positional improvement; no search needed.
  const deeperMoves = allMoves
    .filter(m => {
      if (!goalKeys.has(coordKey(m.from)) || !goalKeys.has(coordKey(m.to))) return false;
      return getGoalPositionDepth(m.to) > getGoalPositionDepth(m.from);
    })
    .map(m => ({
      move: m,
      gain: getGoalPositionDepth(m.to) - getGoalPositionDepth(m.from),
    }))
    .sort((a, b) => b.gain - a.gain);

  if (deeperMoves.length > 0) return deeperMoves[0].move;

  return null;
}

// Cache: empty-goal-set key → per-cell step-distance to nearest empty goal.
// Keyed on goal configuration only (pieces are ignored — they can be jumped
// over, so topology is all that matters for approach routing).
const _bfsDistCache = new Map<string, Map<string, number>>();

/**
 * Multi-source BFS backward from all empty goal cells over board topology
 * (pieces ignored). Returns a Map<coordKey, steps> for every reachable cell.
 * Cached by the set of empty goal cells so repeated calls within a search
 * are O(1) after the first.
 */
function bfsDistancesToGoal(
  state: GameState,
  emptyGoals: CubeCoord[]
): Map<string, number> {
  const cacheKey = emptyGoals.map(g => coordKey(g)).sort().join('|');
  const cached = _bfsDistCache.get(cacheKey);
  if (cached) return cached;

  const dist = new Map<string, number>();
  const queue: Array<[CubeCoord, number]> = [];

  for (const goal of emptyGoals) {
    dist.set(coordKey(goal), 0);
    queue.push([goal, 0]);
  }

  let head = 0;
  while (head < queue.length) {
    const [pos, d] = queue[head++];
    for (const dir of DIRECTIONS) {
      const next: CubeCoord = { q: pos.q + dir.q, r: pos.r + dir.r, s: pos.s + dir.s };
      const nk = coordKey(next);
      if (dist.has(nk) || !state.board.has(nk)) continue;
      dist.set(nk, d + 1);
      queue.push([next, d + 1]);
    }
  }

  if (_bfsDistCache.size >= 32) _bfsDistCache.clear();
  _bfsDistCache.set(cacheKey, dist);
  return dist;
}

/**
 * Score a move for endgame purposes.
 * Used when findEndgameMove returns null but we're still in late endgame.
 * Scores are VERY large to dominate regular evaluation scores.
 */
export function scoreEndgameMove(state: GameState, move: Move, player: PlayerIndex): number {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const emptyGoals = getEmptyGoalsByDepth(state, player);
  const piecesOutside = getPiecesOutsideGoal(state, player);

  let score = 0;

  const fromInGoal = goalKeys.has(coordKey(move.from));
  const toInGoal = goalKeys.has(coordKey(move.to));

  // MASSIVE bonus for direct goal entry (outside -> inside)
  if (!fromInGoal && toInGoal) {
    const depth = getGoalPositionDepth(move.to);
    score += 50000 + depth * 1000;
    if (move.jumpPath) {
      score += move.jumpPath.length * 500;
    }
  }

  // Within goal: reward deeper, ABSOLUTE VETO for shallower
  if (fromInGoal && toInGoal) {
    const fromDepth = getGoalPositionDepth(move.from);
    const toDepth = getGoalPositionDepth(move.to);
    if (toDepth > fromDepth) {
      score += 10000 + (toDepth - fromDepth) * 2000;

      // Extra bonus if this "makes room" for an outside piece
      const blockedPiece = couldEnterGoalIfEmpty(state, move.from, player, piecesOutside);
      if (blockedPiece) {
        score += 15000; // Big bonus for unblocking an entry
      }
    } else if (toDepth < fromDepth) {
      score -= 100000;
    }
  }

  // ABSOLUTE VETO for leaving goal unless it enables immediate entry
  if (fromInGoal && !toInGoal) {
    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);
    const enablesEntry = nextMoves.some(m => isDirectGoalEntry(nextState, m, player));

    // Check if this creates a stepping stone for a jump into goal
    const createsSteppingStone = (() => {
      for (const emptyGoal of emptyGoals) {
        for (const dir of DIRECTIONS) {
          const stonePos: CubeCoord = {
            q: emptyGoal.q - dir.q,
            r: emptyGoal.r - dir.r,
            s: emptyGoal.s - dir.s,
          };
          if (cubeEquals(move.to, stonePos)) {
            // Check if there's an outside piece that could jump
            const jumperPos: CubeCoord = {
              q: emptyGoal.q - dir.q * 2,
              r: emptyGoal.r - dir.r * 2,
              s: emptyGoal.s - dir.s * 2,
            };
            if (piecesOutside.some(p => cubeEquals(p, jumperPos))) {
              return true;
            }
          }
        }
      }
      return false;
    })();

    if (enablesEntry) {
      score += 5000;
    } else if (createsSteppingStone) {
      score += 3000; // Leaving goal to be a stepping stone
    } else {
      score -= 100000;
    }
  }

  // Outside goal: reward moves that genuinely reduce steps to goal entry.
  // BFS over board topology gives accurate routing; pieces are ignored since
  // they act as stepping stones in endgame jump chains.
  if (!fromInGoal && !toInGoal && emptyGoals.length > 0) {
    const distMap = bfsDistancesToGoal(state, emptyGoals);
    const distBefore = distMap.get(coordKey(move.from)) ?? 999;
    const distAfter = distMap.get(coordKey(move.to)) ?? 999;
    score += (distBefore - distAfter) * 1000;

    if (move.jumpPath && move.jumpPath.length > 0) {
      score += move.jumpPath.length * 500;
    }

    // Straggler urgency: farther pieces score higher so they get moved first
    score += distBefore * 100;
  }

  // Check if this move enables goal entry next turn
  const nextState = applyMove(state, move);
  const nextMoves = getAllValidMoves(nextState, player);
  const enabledEntries = nextMoves.filter(m => isDirectGoalEntry(nextState, m, player));
  for (const entry of enabledEntries) {
    const depth = getGoalPositionDepth(entry.to);
    score += 3000 + depth * 500;
  }

  // Apply learned endgame adjustments
  const endgameInsights = getCachedEndgameInsights();
  if (endgameInsights && endgameInsights.gamesAnalyzed > 10) {
    const inGoal = countPiecesInGoal(state, player);

    // If winners fill deep-first, increase depth bonus for entries
    if (endgameInsights.optimalFillOrderScore > 0.6 && !fromInGoal && toInGoal) {
      const depth = getGoalPositionDepth(move.to);
      score += depth * 300;
    }

    // If winners rarely shuffle, reduce score for within-goal rearrangements
    if (endgameInsights.avgShuffleMoves < 3 && fromInGoal && toInGoal) {
      const depthGain = getGoalPositionDepth(move.to) - getGoalPositionDepth(move.from);
      if (depthGain <= 0) {
        score -= 500;
      }
    }

    // If winners finish fast from 9, boost direct entry even more at 9+
    if (inGoal >= 9 && endgameInsights.avgMovesFrom9 < 4 && !fromInGoal && toInGoal) {
      score += 10000;
    }
  }

  return score;
}
