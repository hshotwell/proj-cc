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
import type { AIPersonality, AIDifficulty } from '@/types/ai';
import { coordKey, cubeDistance, centroid, cubeAdd } from '../coordinates';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { getPlayerPieces } from '../setup';
import { getAllValidMoves, getValidMoves, canJumpOver } from '../moves';
import { DIRECTIONS } from '../constants';
import { getPiecePhase } from './endgame';

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
    if (!canJumpOver(state, middlePos, player)) continue; // Need something jumpable

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
 * Check if hopperPos can hop over newStonePos toward goal.
 * Returns distance gain, or 0 if not possible.
 */
function checkHopOver(
  board: Map<string, { type: string; player?: number }>,
  hopperPos: CubeCoord,
  newStonePos: CubeCoord,
  goalCenter: CubeCoord
): number {
  for (const dir of DIRECTIONS) {
    if (hopperPos.q + dir.q === newStonePos.q &&
        hopperPos.r + dir.r === newStonePos.r) {
      const landPos = cubeAdd(newStonePos, dir);
      const landContent = board.get(coordKey(landPos));
      if (landContent?.type === 'empty') {
        const gain = cubeDistance(hopperPos, goalCenter) - cubeDistance(landPos, goalCenter);
        if (gain > 0) return gain;
      }
    }
  }
  return 0;
}

/**
 * After a hop is discovered (hopper jumps over stone to landPos),
 * check if the stone can then advance past the hopper to set up another hop.
 * Returns discounted bonus.
 */
function evaluateLeapfrogContinuation(
  board: Map<string, { type: string; player?: number }>,
  stonePos: CubeCoord,
  hopperOrigPos: CubeCoord,
  hopperLandPos: CubeCoord,
  goalCenter: CubeCoord
): number {
  // Temporarily simulate the hop
  const hopperContent = board.get(coordKey(hopperOrigPos));
  board.set(coordKey(hopperOrigPos), { type: 'empty' });
  board.set(coordKey(hopperLandPos), hopperContent!);

  const stoneDist = cubeDistance(stonePos, goalCenter);
  let bestContinuation = 0;

  for (const dir of DIRECTIONS) {
    // Stone STEP forward
    const stepTarget = cubeAdd(stonePos, dir);
    if (board.get(coordKey(stepTarget))?.type === 'empty' &&
        cubeDistance(stepTarget, goalCenter) < stoneDist) {
      const bonus = checkHopOver(board, hopperLandPos, stepTarget, goalCenter);
      if (bonus > bestContinuation) bestContinuation = bonus;
    }

    // Stone HOP forward
    const overPos = cubeAdd(stonePos, dir);
    const hopLand: CubeCoord = { q: stonePos.q + dir.q * 2, r: stonePos.r + dir.r * 2, s: stonePos.s + dir.s * 2 };
    if (board.get(coordKey(overPos))?.type === 'piece' &&
        board.get(coordKey(hopLand))?.type === 'empty' &&
        cubeDistance(hopLand, goalCenter) < stoneDist) {
      const bonus = checkHopOver(board, hopperLandPos, hopLand, goalCenter);
      if (bonus > bestContinuation) bestContinuation = bonus;
    }
  }

  // Restore board
  board.set(coordKey(hopperOrigPos), hopperContent!);
  board.set(coordKey(hopperLandPos), { type: 'empty' });

  return bestContinuation * 0.5; // Discounted — requires a future turn
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

            // Leapfrog continuation: can the stone advance past the hopper for another hop?
            steppingStoneValue += evaluateLeapfrogContinuation(
              newBoard, move.to, piecePos, landPos, goalCenter
            );
          }
        }
      }
    }
  }

  return steppingStoneValue;
}

/**
 * Penalise moves that hand an opponent a large forward jump.
 * Simulates our move and checks opponent jump gains (up to 5 pieces checked).
 */
function computeOpponentGiftPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  // Simulate our move
  const nextBoard = new Map(state.board);
  const fromContent = nextBoard.get(coordKey(move.from));
  nextBoard.set(coordKey(move.from), { type: 'empty' });
  nextBoard.set(coordKey(move.to), fromContent!);
  const nextState: GameState = { ...state, board: nextBoard };

  let maxGift = 0;

  for (const opponent of state.activePlayers) {
    if (opponent === player) continue;
    const oppGoalPositions = getGoalPositionsForState(state, opponent);
    const oppGoalCenter = centroid(oppGoalPositions);

    let checked = 0;  // Reset counter for each opponent
    for (const [key, content] of nextState.board) {
      if (content.type !== 'piece' || content.player !== opponent) continue;
      const [q, r] = key.split(',').map(Number);
      const from: CubeCoord = { q, r, s: -q - r };

      for (const dir of DIRECTIONS) {
        const over: CubeCoord = { q: from.q + dir.q, r: from.r + dir.r, s: from.s + dir.s };
        const land: CubeCoord = { q: from.q + dir.q * 2, r: from.r + dir.r * 2, s: from.s + dir.s * 2 };
        if (!nextState.board.has(coordKey(land))) continue;
        if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
        if (!canJumpOver(nextState, over, opponent)) continue;

        const gain = cubeDistance(from, oppGoalCenter) - cubeDistance(land, oppGoalCenter);
        if (gain > maxGift) maxGift = gain;
      }

      checked++;
      if (checked >= 5) break;
    }
  }

  return maxGift >= 3 ? maxGift * 2 : 0;
}

/**
 * Evaluate the quality of a move's landing position across three components:
 * 1. Corridor alignment — how well the move vector aligns with the goal direction
 * 2. Consolidation — friendly pieces within 2 cells of landing
 * 3. Straggler connectivity — does landing help bridge the furthest-back piece
 * Scaled by difficulty: hard=1.0, medium=0.6, easy=0.2
 */
export function scoreLandingQuality(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);

  // Component 1: Corridor alignment
  // Measures how well the move vector aligns with the goal direction.
  const gLen = Math.sqrt(goalCenter.q * goalCenter.q + goalCenter.r * goalCenter.r);
  let corridorScore = 0;
  if (gLen > 0.01) {
    const gq = goalCenter.q / gLen;
    const gr = goalCenter.r / gLen;
    const dq = move.to.q - move.from.q;
    const dr = move.to.r - move.from.r;
    corridorScore = (dq * gq + dr * gr) * 2;
  }

  // Component 2: Consolidation
  // Only count pieces that are at least as close to the goal as the landing position,
  // so clustering with lagging pieces in the start zone is not rewarded.
  const pieces = getPlayerPieces(state, player);
  const landingGoalDist = cubeDistance(move.to, goalCenter);
  let consolidation = 0;
  for (const piece of pieces) {
    if (piece.q === move.from.q && piece.r === move.from.r) continue;
    if (cubeDistance(piece, move.to) <= 2 && cubeDistance(piece, goalCenter) <= landingGoalDist) {
      consolidation++;
    }
  }
  const consolidationWeight =
    personality === 'aggressive' ? 0.5 :
    personality === 'defensive'  ? 2.0 : 1.2;
  const consolidationScore = consolidation * consolidationWeight;

  // Component 3: Straggler connectivity
  let stragglerScore = 0;
  const { hasStraggler, stragglerPos } = hasSignificantStraggler(state, player);
  if (hasStraggler && stragglerPos) {
    const distToStraggler = cubeDistance(move.to, stragglerPos);
    if (distToStraggler <= 3) {
      stragglerScore = 4;
    } else {
      let nearestPackDist = Infinity;
      let nearestPackPiece: CubeCoord | null = null;
      for (const piece of pieces) {
        if (piece.q === move.from.q && piece.r === move.from.r) continue;
        if (piece.q === stragglerPos.q && piece.r === stragglerPos.r) continue;
        const d = cubeDistance(piece, stragglerPos);
        if (d < nearestPackDist) { nearestPackDist = d; nearestPackPiece = piece; }
      }
      if (nearestPackPiece && nearestPackDist < Infinity) {
        const distToPack = cubeDistance(move.to, nearestPackPiece);
        if (distToStraggler + distToPack < nearestPackDist) {
          stragglerScore = 2;
        }
      }
    }
    const distFromBefore = cubeDistance(move.from, stragglerPos);
    if (distToStraggler > distFromBefore && distToStraggler > 4) {
      stragglerScore -= 2;
    }
  }

  const raw = corridorScore + consolidationScore + stragglerScore;
  const diffMult =
    difficulty === 'hard'   ? 1.0 :
    difficulty === 'medium' ? 0.6 : 0.2;
  return raw * diffMult;
}

/**
 * Score a move based on how it responds to the opponent's most recent move.
 * Sub-component 1: Block a jump threat set up by the opponent's last move.
 * Sub-component 2: Exploit the square the opponent just vacated.
 * Easy difficulty: always returns 0.
 * Personality-weighted: defensive values blocking, aggressive ignores it.
 */
export function scoreLastMoveResponse(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty
): number {
  if (difficulty === 'easy') return 0;

  const history = state.moveHistory;
  if (history.length === 0) return 0;

  // Find the most recent move by a non-player opponent
  let lastOpponentMove: Move | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].player !== player) {
      lastOpponentMove = history[i];
      break;
    }
  }
  if (!lastOpponentMove || lastOpponentMove.player === undefined) return 0;

  const opponentPlayer = lastOpponentMove.player;
  const oppGoalPositions = getGoalPositionsForState(state, opponentPlayer);
  if (oppGoalPositions.length === 0) return 0;
  const oppGoalCenter = centroid(oppGoalPositions);

  let score = 0;

  // Sub-component 1: Threat amplification — block a jump set up by opponent's last move
  const lastMovedTo = lastOpponentMove.to;
  for (const dir of DIRECTIONS) {
    const over: CubeCoord = {
      q: lastMovedTo.q + dir.q,
      r: lastMovedTo.r + dir.r,
      s: lastMovedTo.s + dir.s,
    };
    const land: CubeCoord = {
      q: lastMovedTo.q + dir.q * 2,
      r: lastMovedTo.r + dir.r * 2,
      s: lastMovedTo.s + dir.s * 2,
    };

    if (!state.board.has(coordKey(land))) continue;
    if (state.board.get(coordKey(land))?.type !== 'empty') continue;
    if (!canJumpOver(state, over, opponentPlayer)) continue;

    const gain = cubeDistance(lastMovedTo, oppGoalCenter) - cubeDistance(land, oppGoalCenter);
    if (gain < 2) continue; // Only react to meaningful threats (min 2-cell gain for opponent)

    const blockingWeight =
      personality === 'defensive'  ? 3.0 :
      personality === 'generalist' ? 1.5 : 0;

    if (coordKey(move.to) === coordKey(land) || coordKey(move.to) === coordKey(over)) {
      score += gain * blockingWeight;
    }
  }

  // Sub-component 2: Opportunity from vacated square — land where opponent just was
  const vacatedPos = lastOpponentMove.from;
  const myGoalPositions = getGoalPositionsForState(state, player);
  const myGoalCenter = centroid(myGoalPositions);
  const distFromBefore = cubeDistance(move.from, myGoalCenter);
  const distLanding = cubeDistance(move.to, myGoalCenter);

  if (coordKey(move.to) === coordKey(vacatedPos) && distLanding < distFromBefore) {
    const opportunityWeight =
      personality === 'aggressive' ? 2.0 :
      personality === 'generalist' ? 1.0 : 0.5;
    const gain = distFromBefore - distLanding;
    score += gain * opportunityWeight;
  }

  const diffMult = difficulty === 'medium' ? 0.6 : 1.0;
  return score * diffMult;
}

/**
 * Penalise setup moves whose enabled chain can be disrupted by one opponent move.
 *
 * Type 1 — Fill block: opponent can reach an intended chain landing in one move.
 * Type 2 — Removal block: an opponent piece used as a stepping-stone can be moved.
 *
 * Returns a negative score (penalty). Returns 0 for non-setup moves or easy difficulty.
 * personalityMult: defensive=2.0, generalist=1.0, aggressive=0.3
 */
export function scoreSetupBlockRisk(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty,
  steppingStoneValue: number
): number {
  if (difficulty === 'easy') return 0;
  if (steppingStoneValue <= 0) return 0;

  // Simulate our setup move on a shallow-copied board
  const nextBoard = new Map(state.board);
  const fromContent = nextBoard.get(coordKey(move.from));
  nextBoard.set(coordKey(move.from), { type: 'empty' });
  nextBoard.set(coordKey(move.to), fromContent!);
  const nextState: GameState = { ...state, board: nextBoard };

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);
  const pieces = getPlayerPieces(nextState, player);

  let totalRisk = 0;

  for (const piece of pieces) {
    if (piece.q === move.to.q && piece.r === move.to.r) continue; // skip the moved piece

    for (const dir of DIRECTIONS) {
      const over: CubeCoord = {
        q: piece.q + dir.q,
        r: piece.r + dir.r,
        s: piece.s + dir.s,
      };
      const land: CubeCoord = {
        q: piece.q + dir.q * 2,
        r: piece.r + dir.r * 2,
        s: piece.s + dir.s * 2,
      };

      if (!nextState.board.has(coordKey(land))) continue;
      if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
      if (!canJumpOver(nextState, over, player)) continue;

      const jumpGain = cubeDistance(piece, goalCenter) - cubeDistance(land, goalCenter);
      if (jumpGain <= 0) continue; // Only forward chains matter

      // TYPE 1: Fill block — can any opponent reach `land` in one move (step or jump)?
      let fillRisk = 0;
      outer: for (const opponent of state.activePlayers) {
        if (opponent === player) continue;
        for (const [oppKey, oppContent] of nextState.board) {
          if (oppContent.type !== 'piece' || oppContent.player !== opponent) continue;
          const [oq, or_] = oppKey.split(',').map(Number);
          const oppPos: CubeCoord = { q: oq, r: or_, s: -oq - or_ };

          // Can opponent step to land?
          if (cubeDistance(oppPos, land) === 1) { fillRisk = 1.0; break outer; }

          // Can opponent jump to land?
          for (const od of DIRECTIONS) {
            const oppOver: CubeCoord = {
              q: oppPos.q + od.q, r: oppPos.r + od.r, s: oppPos.s + od.s,
            };
            const oppLand: CubeCoord = {
              q: oppPos.q + od.q * 2, r: oppPos.r + od.r * 2, s: oppPos.s + od.s * 2,
            };
            if (coordKey(oppLand) !== coordKey(land)) continue;
            if (!canJumpOver(nextState, oppOver, opponent)) continue;
            fillRisk = 1.0;
            break outer;
          }
        }
      }

      // TYPE 2: Removal block — is `over` an opponent piece (they can move it)?
      let removalRisk = 0;
      const overContent = nextState.board.get(coordKey(over));
      if (overContent?.type === 'piece' && overContent.player !== player) {
        removalRisk = 0.6;
      }

      totalRisk += jumpGain * (fillRisk + removalRisk);
    }
  }

  if (totalRisk <= 0) return 0;

  const personalityMult =
    personality === 'defensive'  ? 2.0 :
    personality === 'generalist' ? 1.0 : 0.3;
  const diffMult = difficulty === 'medium' ? 0.6 : 1.0;

  return -(totalRisk * personalityMult * diffMult);
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
  // Midgame priority: prefer moving pieces still crossing the board
  midgamePriorityBonus: number;
  // Penalty for moves that hand an opponent a large forward jump
  opponentGiftPenalty: number;
  // Total combined score
  total: number;
}

export function computeStrategicScore(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: 'aggressive' | 'defensive' | 'generalist',
  cachedThreats?: Array<{ blockPosition: CubeCoord; threatLevel: number; opponentMove: Move }>
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

  // Midgame priority: prefer moving pieces still crossing the board.
  // Endgame pieces should only be chosen when the endgame solver picks them
  // or an exceptional opportunity (deep entry, blocking) exists.
  const movingPiecePhase = getPiecePhase(state, move.from, player);
  const midgamePriorityBonus = movingPiecePhase === 'midgame' ? 12 : 0;

  // Opponent-gift: penalise moves that give opponent a large forward jump.
  // Aggressive personality ignores opponent threats; defensive/generalist don't.
  const opponentGiftPenalty =
    personality !== 'aggressive'
      ? computeOpponentGiftPenalty(state, move, player)
      : 0;

  // Opponent pieces used in jump
  const opponentPiecesUsed = countOpponentPiecesInJump(state, move, player);
  const opponentPieceBonus = opponentPiecesUsed * 3;

  // Check if this move blocks opponent jumps
  let blockingOpponentValue = 0;
  if (personality === 'defensive' || personality === 'generalist') {
    const threats = cachedThreats ?? findOpponentJumpThreats(state, player);
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

  // Early-game amplifier: stepping stone chains matter most before pieces converge.
  // With few pieces in goal the AI should prioritise setting up multi-hop chains
  // over making a single big leap. Scales down as pieces arrive in the goal zone.
  const piecesInGoal = countPiecesInGoal(state, player);
  const earlyGameStepMultiplier = piecesInGoal < 4 ? 2.5 : piecesInGoal < 7 ? 1.5 : 1.0;

  // Combine with weights
  const total =
    weights.steppingStone * steppingStoneValue * earlyGameStepMultiplier +
    weights.unblocking * unblockingValue +
    weights.backwardness * backwardnessBonus +
    weights.opponentPiece * opponentPieceBonus +
    weights.blockingOpponent * blockingOpponentValue +
    weights.straggler * stragglerBonus +
    midgamePriorityBonus -
    weights.pastOpponents * pastOpponentsPenalty -
    weights.blockingOpponent * opponentGiftPenalty;

  return {
    steppingStoneValue,
    unblockingValue,
    backwardnessBonus,
    opponentPieceBonus,
    blockingOpponentValue,
    pastOpponentsPenalty,
    stragglerBonus,
    midgamePriorityBonus,
    opponentGiftPenalty,
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
