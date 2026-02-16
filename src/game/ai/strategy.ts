/**
 * Strategic AI heuristics based on proven gameplay principles.
 *
 * Key principles:
 * 1. Stepping stones: Move blockers to enable longer jumps
 * 2. Back pieces first: Prioritize lagging pieces over leaders
 * 3. Use opponent pieces: They may move, so use them now
 * 4. Defensive blocking: Prevent opponent's planned jumps
 */

import type { GameState, PlayerIndex, CubeCoord, Move } from '@/types/game';
import { coordKey, cubeDistance, centroid, cubeAdd } from '../coordinates';
import { getGoalPositionsForState } from '../state';
import { getPlayerPieces } from '../setup';
import { getAllValidMoves, getValidMoves } from '../moves';
import { DIRECTIONS } from '../constants';

/**
 * Check if a piece is blocking a potential longer jump for its own team.
 * Returns info about what jump it's blocking.
 */
export function findBlockedJumpPotential(
  state: GameState,
  piecePos: CubeCoord,
  player: PlayerIndex
): { isBlocking: boolean; blockedPiece: CubeCoord | null; potentialGain: number } {
  const posKey = coordKey(piecePos);

  // Check each direction: is there a friendly piece that could jump over
  // something to reach this position, and continue further if we weren't here?
  for (const dir of DIRECTIONS) {
    // Position before this piece (where a jumper might be)
    const beforePos: CubeCoord = {
      q: piecePos.q - dir.q * 2,
      r: piecePos.r - dir.r * 2,
      s: piecePos.s - dir.s * 2,
    };
    const middlePos: CubeCoord = {
      q: piecePos.q - dir.q,
      r: piecePos.r - dir.r,
      s: piecePos.s - dir.s,
    };

    const beforeContent = state.board.get(coordKey(beforePos));
    const middleContent = state.board.get(coordKey(middlePos));

    // Is there a friendly piece that could jump here?
    if (beforeContent?.type !== 'piece' || beforeContent.player !== player) continue;
    if (middleContent?.type !== 'piece') continue; // Need something to jump over

    // Position after this piece (where they could continue to)
    const afterPos: CubeCoord = {
      q: piecePos.q + dir.q,
      r: piecePos.r + dir.r,
      s: piecePos.s + dir.s,
    };
    const landingPos: CubeCoord = {
      q: piecePos.q + dir.q * 2,
      r: piecePos.r + dir.r * 2,
      s: piecePos.s + dir.s * 2,
    };

    const afterContent = state.board.get(coordKey(afterPos));
    const landingContent = state.board.get(coordKey(landingPos));

    // Could they continue jumping if this piece moved?
    if (afterContent?.type === 'piece' && landingContent?.type === 'empty') {
      // This piece IS blocking a continuation!
      const goalPositions = getGoalPositionsForState(state, player);
      const goalCenter = centroid(goalPositions);

      // Calculate how much distance the blocked piece could gain
      const currentDist = cubeDistance(beforePos, goalCenter);
      const potentialDist = cubeDistance(landingPos, goalCenter);
      const potentialGain = currentDist - potentialDist;

      if (potentialGain > 0) {
        return {
          isBlocking: true,
          blockedPiece: beforePos,
          potentialGain,
        };
      }
    }
  }

  return { isBlocking: false, blockedPiece: null, potentialGain: 0 };
}

/**
 * Calculate how far "back" a piece is relative to other pieces.
 * Returns a value from 0 (most forward) to 1 (most backward).
 */
export function getPieceBackwardness(
  state: GameState,
  piecePos: CubeCoord,
  player: PlayerIndex
): number {
  const pieces = getPlayerPieces(state, player);
  if (pieces.length <= 1) return 0.5;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);

  const distances = pieces.map(p => cubeDistance(p, goalCenter));
  const pieceDistance = cubeDistance(piecePos, goalCenter);

  const minDist = Math.min(...distances);
  const maxDist = Math.max(...distances);

  if (maxDist === minDist) return 0.5;

  // 0 = closest to goal (forward), 1 = farthest from goal (backward)
  return (pieceDistance - minDist) / (maxDist - minDist);
}

/**
 * Check if there's a significant straggler that needs priority attention.
 * A straggler is a piece that is much farther from goal than others.
 */
export function hasSignificantStraggler(
  state: GameState,
  player: PlayerIndex
): { hasStraggler: boolean; stragglerPos: CubeCoord | null; gap: number } {
  const pieces = getPlayerPieces(state, player);
  if (pieces.length <= 1) return { hasStraggler: false, stragglerPos: null, gap: 0 };

  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);

  const distances = pieces.map(p => ({
    piece: p,
    dist: cubeDistance(p, goalCenter)
  }));
  distances.sort((a, b) => b.dist - a.dist); // Farthest first

  const farthest = distances[0];
  const secondFarthest = distances[1];

  // A significant gap is when the farthest piece is much farther than the second
  const gap = farthest.dist - secondFarthest.dist;

  // Consider it a straggler if gap is 3+ cells
  if (gap >= 3) {
    return { hasStraggler: true, stragglerPos: farthest.piece, gap };
  }

  return { hasStraggler: false, stragglerPos: null, gap };
}

/**
 * Check if a move is moving the straggler.
 */
export function isMovingStraggler(
  state: GameState,
  move: Move,
  player: PlayerIndex
): boolean {
  const { hasStraggler, stragglerPos } = hasSignificantStraggler(state, player);
  if (!hasStraggler || !stragglerPos) return false;

  return move.from.q === stragglerPos.q && move.from.r === stragglerPos.r;
}

/**
 * Check if a piece is "past" all opponent pieces (no opponents between it and goal).
 */
export function isPiecePastOpponents(
  state: GameState,
  piecePos: CubeCoord,
  player: PlayerIndex
): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const pieceToGoal = cubeDistance(piecePos, goalCenter);

  // Check all opponents
  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player === player) continue;

    const [q, r] = key.split(',').map(Number);
    const opponentPos: CubeCoord = { q, r, s: -q - r };
    const opponentToGoal = cubeDistance(opponentPos, goalCenter);

    // If any opponent is closer to our goal than this piece, piece is not past
    if (opponentToGoal < pieceToGoal) {
      return false;
    }
  }

  return true;
}

/**
 * Count how many opponent pieces are used in a jump path.
 */
export function countOpponentPiecesInJump(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump || !move.jumpPath) return 0;

  let count = 0;
  let currentPos = move.from;

  for (const nextPos of move.jumpPath) {
    // The middle position (jumped over)
    const middlePos: CubeCoord = {
      q: (currentPos.q + nextPos.q) / 2,
      r: (currentPos.r + nextPos.r) / 2,
      s: (currentPos.s + nextPos.s) / 2,
    };

    // Check if it's an integer position (valid middle)
    if (Number.isInteger(middlePos.q) && Number.isInteger(middlePos.r)) {
      const content = state.board.get(coordKey(middlePos));
      if (content?.type === 'piece' && content.player !== player) {
        count++;
      }
    }

    currentPos = nextPos;
  }

  return count;
}

/**
 * Detect opponent's potential big jumps that could be blocked.
 * Returns positions where placing a piece would block opponent jumps.
 */
export function findOpponentJumpThreats(
  state: GameState,
  player: PlayerIndex
): Array<{ blockPosition: CubeCoord; threatLevel: number; opponentMove: Move }> {
  const threats: Array<{ blockPosition: CubeCoord; threatLevel: number; opponentMove: Move }> = [];

  // Check each opponent
  for (const opponent of state.activePlayers) {
    if (opponent === player) continue;

    const opponentMoves = getAllValidMoves(state, opponent);
    const goalPositions = getGoalPositionsForState(state, opponent);
    const goalCenter = centroid(goalPositions);

    for (const move of opponentMoves) {
      if (!move.isJump) continue;

      // Calculate how much this jump gains for opponent
      const distBefore = cubeDistance(move.from, goalCenter);
      const distAfter = cubeDistance(move.to, goalCenter);
      const gain = distBefore - distAfter;

      // Only consider significant jumps (gain > 3)
      if (gain <= 3) continue;

      // Find positions along the jump path that we could block
      if (move.jumpPath) {
        for (const pathPos of move.jumpPath) {
          // The landing positions are the threat
          const content = state.board.get(coordKey(pathPos));
          if (content?.type === 'empty') {
            threats.push({
              blockPosition: pathPos,
              threatLevel: gain,
              opponentMove: move,
            });
          }
        }
      }
    }
  }

  // Sort by threat level (highest first)
  threats.sort((a, b) => b.threatLevel - a.threatLevel);

  return threats;
}

/**
 * Check if a move sets up a stepping stone for future jumps.
 * Returns the potential value of jumps it enables.
 */
export function evaluateSteppingStoneSetup(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  // Apply the move
  const newBoard = new Map(state.board);
  const fromContent = newBoard.get(coordKey(move.from));
  newBoard.set(coordKey(move.from), { type: 'empty' });
  newBoard.set(coordKey(move.to), fromContent!);

  const newState: GameState = { ...state, board: newBoard };

  // Check what jumps are now available that weren't before
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);

  let steppingStoneValue = 0;

  // For each friendly piece, check if new jumps are available
  for (const [key, content] of newState.board) {
    if (content.type !== 'piece' || content.player !== player) continue;

    const [q, r] = key.split(',').map(Number);
    const piecePos: CubeCoord = { q, r, s: -q - r };

    // Skip the piece that just moved
    if (q === move.to.q && r === move.to.r) continue;

    // Check if this piece can now jump over the moved piece
    for (const dir of DIRECTIONS) {
      const overPos: CubeCoord = {
        q: piecePos.q + dir.q,
        r: piecePos.r + dir.r,
        s: piecePos.s + dir.s,
      };
      const landPos: CubeCoord = {
        q: piecePos.q + dir.q * 2,
        r: piecePos.r + dir.r * 2,
        s: piecePos.s + dir.s * 2,
      };

      // Is the moved piece now in the "over" position?
      if (overPos.q === move.to.q && overPos.r === move.to.r) {
        const landContent = newState.board.get(coordKey(landPos));
        if (landContent?.type === 'empty') {
          // Calculate value of this enabled jump
          const currentDist = cubeDistance(piecePos, goalCenter);
          const newDist = cubeDistance(landPos, goalCenter);
          const gain = currentDist - newDist;

          if (gain > 0) {
            steppingStoneValue += gain;
          }
        }
      }
    }
  }

  return steppingStoneValue;
}

/**
 * Score a move based on all strategic principles.
 */
export interface StrategicScore {
  // Stepping stone: does this move set up future jumps?
  steppingStoneValue: number;
  // Is this piece blocking friendly jumps?
  unblockingValue: number;
  // Backwardness: prioritize back pieces
  backwardnessBonus: number;
  // Uses opponent pieces (ephemeral stepping stones)
  opponentPieceBonus: number;
  // Blocks opponent's planned jumps
  blockingOpponentValue: number;
  // Penalty for moving pieces past all opponents (low priority)
  pastOpponentsPenalty: number;
  // Bonus for moving a significant straggler
  stragglerBonus: number;
  // Total combined score
  total: number;
}

export function computeStrategicScore(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: 'aggressive' | 'defensive' | 'generalist'
): StrategicScore {
  // Personality weights
  const weights = {
    aggressive: {
      steppingStone: 3.0,
      unblocking: 2.5,
      backwardness: 2.0,
      opponentPiece: 2.0,
      blockingOpponent: 0.5,
      pastOpponents: 0.8,
      straggler: 4.0,
    },
    defensive: {
      steppingStone: 1.5,
      unblocking: 1.5,
      backwardness: 2.5,
      opponentPiece: 1.5,
      blockingOpponent: 3.0,
      pastOpponents: 1.0,
      straggler: 5.0,
    },
    generalist: {
      steppingStone: 2.0,
      unblocking: 2.0,
      backwardness: 2.0,
      opponentPiece: 1.5,
      blockingOpponent: 1.5,
      pastOpponents: 0.8,
      straggler: 4.5,
    },
  }[personality];

  // Calculate each component
  const steppingStoneValue = evaluateSteppingStoneSetup(state, move, player);

  // Check if this piece was blocking a jump
  const blockInfo = findBlockedJumpPotential(state, move.from, player);
  const unblockingValue = blockInfo.isBlocking ? blockInfo.potentialGain : 0;

  // Backwardness of the moving piece
  const backwardness = getPieceBackwardness(state, move.from, player);
  const backwardnessBonus = backwardness * 8; // Up to 8 points for most backward piece

  // BIG bonus for moving a significant straggler
  const { hasStraggler, gap } = hasSignificantStraggler(state, player);
  const movingStraggler = isMovingStraggler(state, move, player);
  const stragglerBonus = (hasStraggler && movingStraggler) ? gap * 3 : 0; // Scale with how far behind they are

  // Opponent pieces used in jump
  const opponentPiecesUsed = countOpponentPiecesInJump(state, move, player);
  const opponentPieceBonus = opponentPiecesUsed * 3;

  // Check if this move blocks opponent jumps
  let blockingOpponentValue = 0;
  if (personality === 'defensive' || personality === 'generalist') {
    const threats = findOpponentJumpThreats(state, player);
    for (const threat of threats.slice(0, 3)) { // Check top 3 threats
      if (coordKey(move.to) === coordKey(threat.blockPosition)) {
        blockingOpponentValue += threat.threatLevel;
      }
    }
  }

  // Penalty for moving pieces that are already past opponents
  const isPastOpponents = isPiecePastOpponents(state, move.from, player);
  // Only penalize if not a significant forward move AND not moving a straggler
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  const distGain = distBefore - distAfter;
  const pastOpponentsPenalty = (isPastOpponents && distGain < 3 && !movingStraggler) ? 5 : 0;

  // Combine with weights
  const total =
    weights.steppingStone * steppingStoneValue +
    weights.unblocking * unblockingValue +
    weights.backwardness * backwardnessBonus +
    weights.opponentPiece * opponentPieceBonus +
    weights.blockingOpponent * blockingOpponentValue +
    weights.straggler * stragglerBonus -
    weights.pastOpponents * pastOpponentsPenalty;

  return {
    steppingStoneValue,
    unblockingValue,
    backwardnessBonus,
    opponentPieceBonus,
    blockingOpponentValue,
    pastOpponentsPenalty,
    stragglerBonus,
    total,
  };
}

/**
 * Check if we're in endgame (many pieces in goal).
 * Stepping stone logic becomes MORE important in endgame.
 */
export function isEndgame(state: GameState, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const pieces = getPlayerPieces(state, player);

  let inGoal = 0;
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) {
      inGoal++;
    }
  }

  return inGoal >= 6; // 6+ of 10 pieces in goal
}
