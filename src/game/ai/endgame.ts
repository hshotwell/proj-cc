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
import { coordKey, cubeEquals, cubeDistance, centroid } from '../coordinates';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { getPlayerPieces } from '../setup';
import { getAllValidMoves } from '../moves';
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

    // Check if there's a piece to jump over (between jumper and goal)
    const overPos: CubeCoord = {
      q: goalPos.q - dir.q,
      r: goalPos.r - dir.r,
      s: goalPos.s - dir.s,
    };
    const overContent = state.board.get(coordKey(overPos));
    if (overContent?.type === 'piece') {
      return outsidePiece; // This outside piece could jump in if goalPos were empty
    }
  }

  return null;
}

/**
 * Find a "make room" move: a piece in a shallower goal position that can move
 * deeper, freeing up the shallow position for another piece to enter.
 */
function findMakeRoomMove(
  state: GameState,
  player: PlayerIndex,
  allMoves: Move[],
  goalKeys: Set<string>,
  piecesOutside: CubeCoord[]
): Move | null {
  const goalPositions = getGoalPositionsForState(state, player);

  // Find occupied shallow goal positions that block potential entries
  const blockingPieces: Array<{
    pos: CubeCoord;
    depth: number;
    blockedPiece: CubeCoord;
  }> = [];

  for (const goalPos of goalPositions) {
    const content = state.board.get(coordKey(goalPos));
    if (content?.type !== 'piece' || content.player !== player) continue;

    // Check if an outside piece could enter here if this were empty
    const blockedPiece = couldEnterGoalIfEmpty(state, goalPos, player, piecesOutside);
    if (blockedPiece) {
      blockingPieces.push({
        pos: goalPos,
        depth: getGoalPositionDepth(goalPos),
        blockedPiece,
      });
    }
  }

  // Sort by depth (shallowest first - those should move out of the way)
  blockingPieces.sort((a, b) => a.depth - b.depth);

  // For each blocking piece, see if it can move deeper
  for (const { pos: blockingPos } of blockingPieces) {
    // Find moves from this blocking piece that go deeper in goal
    const deeperMoves = allMoves
      .filter(m => {
        if (!cubeEquals(m.from, blockingPos)) return false;
        if (!goalKeys.has(coordKey(m.to))) return false;
        return getGoalPositionDepth(m.to) > getGoalPositionDepth(m.from);
      })
      .sort((a, b) => getGoalPositionDepth(b.to) - getGoalPositionDepth(a.to));

    if (deeperMoves.length > 0) {
      return deeperMoves[0];
    }
  }

  return null;
}

/**
 * Find a move that creates a stepping stone for an outside piece to jump into goal.
 */
function findSteppingStoneMove(
  state: GameState,
  player: PlayerIndex,
  allMoves: Move[],
  goalKeys: Set<string>,
  piecesOutside: CubeCoord[],
  emptyGoals: CubeCoord[]
): Move | null {
  if (emptyGoals.length === 0 || piecesOutside.length === 0) return null;

  // For each empty goal, check if placing a stepping stone would enable a jump in
  for (const emptyGoal of emptyGoals) {
    for (const dir of DIRECTIONS) {
      // Where would the jumping piece need to be?
      const jumperPos: CubeCoord = {
        q: emptyGoal.q - dir.q * 2,
        r: emptyGoal.r - dir.r * 2,
        s: emptyGoal.s - dir.s * 2,
      };

      // Is there an outside piece there?
      const outsidePiece = piecesOutside.find(p => cubeEquals(p, jumperPos));
      if (!outsidePiece) continue;

      // Where would the stepping stone need to be?
      const stonePos: CubeCoord = {
        q: emptyGoal.q - dir.q,
        r: emptyGoal.r - dir.r,
        s: emptyGoal.s - dir.s,
      };

      // Is that position empty and on the board?
      const stoneContent = state.board.get(coordKey(stonePos));
      if (stoneContent?.type !== 'empty') continue;

      // Find a move that places a piece at stonePos (from anywhere)
      const stoneMove = allMoves.find(m => cubeEquals(m.to, stonePos));
      if (stoneMove) {
        // Verify this doesn't leave goal (or if it does, the entry is worth it)
        const fromInGoal = goalKeys.has(coordKey(stoneMove.from));
        const toInGoal = goalKeys.has(coordKey(stoneMove.to));

        // If leaving goal, only do it if the resulting entry is to a deeper position
        if (fromInGoal && !toInGoal) {
          const fromDepth = getGoalPositionDepth(stoneMove.from);
          const entryDepth = getGoalPositionDepth(emptyGoal);
          if (entryDepth <= fromDepth) continue; // Not worth leaving goal
        }

        return stoneMove;
      }
    }
  }

  return null;
}

/**
 * Find the BEST endgame move. This should be the PRIMARY decision maker.
 * CRITICAL: This function should ALWAYS return a move if moves are available.
 * It uses a strict priority system to ensure optimal endgame play.
 */
export function findEndgameMove(state: GameState, player: PlayerIndex): Move | null {
  const allMoves = getAllValidMoves(state, player);
  if (allMoves.length === 0) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const piecesOutside = getPiecesOutsideGoal(state, player);
  const emptyGoals = getEmptyGoalsByDepth(state, player);

  // If no pieces outside goal AND no empty goals, game is won - any move is fine
  if (piecesOutside.length === 0 && emptyGoals.length === 0) {
    return allMoves[0];
  }

  // PRIORITY 1: Direct goal entry - ALWAYS take this if available
  // Prefer entries to DEEPER positions, then longer jumps
  const directEntries = allMoves
    .filter(m => isDirectGoalEntry(state, m, player))
    .map(m => ({
      move: m,
      depth: getGoalPositionDepth(m.to),
      jumpLen: m.jumpPath?.length || 0
    }))
    .sort((a, b) => {
      if (b.depth !== a.depth) return b.depth - a.depth;
      return b.jumpLen - a.jumpLen;
    });

  if (directEntries.length > 0) {
    return directEntries[0].move;
  }

  // PRIORITY 2: "Make room" - move a blocking piece deeper to enable entry
  const makeRoomMove = findMakeRoomMove(state, player, allMoves, goalKeys, piecesOutside);
  if (makeRoomMove) {
    return makeRoomMove;
  }

  // PRIORITY 3: Move pieces DEEPER within goal (consolidate at back)
  const deeperMoves = allMoves
    .filter(m => {
      if (!goalKeys.has(coordKey(m.from))) return false;
      if (!goalKeys.has(coordKey(m.to))) return false;
      const fromDepth = getGoalPositionDepth(m.from);
      const toDepth = getGoalPositionDepth(m.to);
      return toDepth > fromDepth;
    })
    .map(m => ({
      move: m,
      depthGain: getGoalPositionDepth(m.to) - getGoalPositionDepth(m.from)
    }))
    .sort((a, b) => b.depthGain - a.depthGain);

  if (deeperMoves.length > 0) {
    return deeperMoves[0].move;
  }

  // PRIORITY 4: Create stepping stone for goal entry
  const steppingStoneMove = findSteppingStoneMove(
    state, player, allMoves, goalKeys, piecesOutside, emptyGoals
  );
  if (steppingStoneMove) {
    return steppingStoneMove;
  }

  // PRIORITY 5: Shuffle within goal that IMMEDIATELY enables a goal entry
  const inGoalShuffles: Array<{ move: Move; enablesDepth: number }> = [];
  for (const move of allMoves) {
    if (!goalKeys.has(coordKey(move.from))) continue;
    if (!goalKeys.has(coordKey(move.to))) continue;

    const fromDepth = getGoalPositionDepth(move.from);
    const toDepth = getGoalPositionDepth(move.to);

    // Don't go shallower
    if (toDepth < fromDepth) continue;

    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);
    const enabledEntries = nextMoves
      .filter(m => isDirectGoalEntry(nextState, m, player))
      .map(m => getGoalPositionDepth(m.to));

    if (enabledEntries.length > 0) {
      inGoalShuffles.push({
        move,
        enablesDepth: Math.max(...enabledEntries)
      });
    }
  }

  if (inGoalShuffles.length > 0) {
    inGoalShuffles.sort((a, b) => b.enablesDepth - a.enablesDepth);
    return inGoalShuffles[0].move;
  }

  // PRIORITY 6: 2-4 move lookahead for shuffle/reposition sequences
  const shuffleSequence = findShuffleSequence(state, player, allMoves, goalKeys, 4);
  if (shuffleSequence) {
    return shuffleSequence;
  }

  // PRIORITY 7: Move outside pieces toward the deepest empty goal
  if (emptyGoals.length > 0 && piecesOutside.length > 0) {
    const targetGoal = emptyGoals[0];

    const outsideMoves: Array<{
      move: Move;
      pieceDistFromGoal: number;
      improvement: number;
      jumpLen: number;
    }> = [];

    for (const piece of piecesOutside) {
      const distToGoal = cubeDistance(piece, targetGoal);
      for (const move of allMoves) {
        if (!cubeEquals(move.from, piece)) continue;

        const newDist = cubeDistance(move.to, targetGoal);
        outsideMoves.push({
          move,
          pieceDistFromGoal: distToGoal,
          improvement: distToGoal - newDist,
          jumpLen: move.jumpPath?.length || 0
        });
      }
    }

    outsideMoves.sort((a, b) => {
      if (Math.abs(b.improvement - a.improvement) > 0.5) {
        return b.improvement - a.improvement;
      }
      if (Math.abs(b.pieceDistFromGoal - a.pieceDistFromGoal) > 0.5) {
        return b.pieceDistFromGoal - a.pieceDistFromGoal;
      }
      return b.jumpLen - a.jumpLen;
    });

    const goodMoves = outsideMoves.filter(m => m.improvement >= 0);
    if (goodMoves.length > 0) {
      return goodMoves[0].move;
    }

    if (outsideMoves.length > 0) {
      return outsideMoves[0].move;
    }
  }

  // PRIORITY 8: Any move that doesn't leave goal and doesn't go shallower
  const safeMoves = allMoves.filter(m => {
    const fromInGoal = goalKeys.has(coordKey(m.from));
    const toInGoal = goalKeys.has(coordKey(m.to));

    if (!fromInGoal && !toInGoal) return true;
    if (!fromInGoal && toInGoal) return true;
    if (fromInGoal && toInGoal) {
      return getGoalPositionDepth(m.to) >= getGoalPositionDepth(m.from);
    }
    return false;
  });

  if (safeMoves.length > 0) {
    const goalCenter = centroid(goalPositions);
    const scored = safeMoves.map(m => {
      const forward = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
      const jumpLen = m.jumpPath?.length || 0;
      const tiebreaker = Math.random() * 0.01;
      return { move: m, score: forward * 10 + jumpLen + tiebreaker };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  // PRIORITY 9: LAST RESORT - if we MUST leave goal, find the move that enables
  // the best opportunity next turn
  const leavingGoalMoves = allMoves
    .filter(m => goalKeys.has(coordKey(m.from)) && !goalKeys.has(coordKey(m.to)))
    .map(m => {
      const nextState = applyMove(state, m);
      const nextMoves = getAllValidMoves(nextState, player);
      const canEnterNext = nextMoves.some(nm => isDirectGoalEntry(nextState, nm, player));
      const forwardProgress = cubeDistance(m.from, centroid(goalPositions)) -
                              cubeDistance(m.to, centroid(goalPositions));
      return {
        move: m,
        canEnterNext,
        forwardProgress
      };
    })
    .sort((a, b) => {
      if (a.canEnterNext !== b.canEnterNext) {
        return a.canEnterNext ? -1 : 1;
      }
      return b.forwardProgress - a.forwardProgress;
    });

  if (leavingGoalMoves.length > 0) {
    return leavingGoalMoves[0].move;
  }

  return allMoves[0];
}

/**
 * Find a shuffle sequence up to `maxDepth` moves that enables a goal entry.
 * Enhanced to consider moves that reposition pieces to enable jumps.
 */
function findShuffleSequence(
  state: GameState,
  player: PlayerIndex,
  moves: Move[],
  goalKeys: Set<string>,
  maxDepth: number
): Move | null {
  if (maxDepth <= 0) return null;

  // Consider goal rearrangements that don't go shallower,
  // AND moves from outside that might position for a jump
  const validMoves = moves.filter(m => {
    const fromInGoal = goalKeys.has(coordKey(m.from));
    const toInGoal = goalKeys.has(coordKey(m.to));

    // Goal to goal: don't go shallower
    if (fromInGoal && toInGoal) {
      const fromDepth = getGoalPositionDepth(m.from);
      const toDepth = getGoalPositionDepth(m.to);
      return toDepth >= fromDepth;
    }

    // Outside to outside: allow (positioning moves)
    if (!fromInGoal && !toInGoal) {
      return true;
    }

    // Goal to outside: only in deeper search (may create stepping stone)
    if (fromInGoal && !toInGoal) {
      return maxDepth >= 3; // Allow in later stages of search
    }

    // Outside to goal: always good
    return true;
  });

  for (const move of validMoves) {
    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);

    // Check if this enables entry
    if (nextMoves.some(m => isDirectGoalEntry(nextState, m, player))) {
      return move;
    }

    // Recurse with reduced depth
    if (maxDepth > 1) {
      const deeper = findShuffleSequence(nextState, player, nextMoves, goalKeys, maxDepth - 1);
      if (deeper) {
        return move;
      }
    }
  }

  return null;
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
  const goalCenter = centroid(goalPositions);
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

  // Outside goal: bonus for approaching deepest empty goal
  if (!fromInGoal && !toInGoal && emptyGoals.length > 0) {
    const target = emptyGoals[0];
    const improvement = cubeDistance(move.from, target) - cubeDistance(move.to, target);
    score += improvement * 1000;

    if (move.jumpPath && move.jumpPath.length > 0) {
      score += move.jumpPath.length * 500;
    }

    const distFromGoal = cubeDistance(move.from, goalCenter);
    score += distFromGoal * 100;
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
