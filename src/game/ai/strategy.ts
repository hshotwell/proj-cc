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
import { coordKey, cubeDistance, centroid, cubeAdd, cubeEquals } from '../coordinates';
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

  // Consider it a straggler if gap is 2+ cells
  if (gap >= 2) {
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

  // jumpPath stores midpoints (the pieces jumped over), one per hop. For
  // ghost-variant jumps over multi-cell runs, the entry is a "virtual" midpoint
  // that may fall on a non-integer cell — skip those.
  let count = 0;
  for (const mid of move.jumpPath) {
    if (!Number.isInteger(mid.q) || !Number.isInteger(mid.r)) continue;
    const content = state.board.get(coordKey(mid));
    if (content?.type === 'piece' && content.player !== player) count++;
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
  // Consolidation weight decays as pieces enter the goal — in endgame, getting
  // pieces IN is more important than clustering near teammates. Without decay,
  // mid-chain stops score artificially high because they're surrounded by pieces.
  const piecesInGoalForConsolidation = countPiecesInGoal(state, player);
  const consolidationDecay = Math.max(0, 1 - piecesInGoalForConsolidation * 0.15);
  const consolidationWeight =
    personality === 'aggressive' ? 0.3 :
    personality === 'defensive'  ? 1.2 : 0.7;
  const consolidationScore = consolidation * consolidationWeight * consolidationDecay;

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

  // Component 4: Empty-goal approach alignment
  // For pieces OUTSIDE the goal, reward moves that bring the piece closer to a
  // specific empty goal cell (not just the centroid). This captures the "approach
  // corridor" concept: two moves with equal centroid-distance may be unequal in
  // alignment with available empty spots — one may need a lateral correction step
  // while the other can chain directly in. Only activates once 2+ pieces are in goal.
  const goalKeySet = new Set(goalPositions.map(g => coordKey(g)));
  let emptyGoalAlignScore = 0;
  const piecesInGoalNow = countPiecesInGoal(state, player);
  if (piecesInGoalNow >= 2 && !goalKeySet.has(coordKey(move.from))) {
    const emptyGoals = goalPositions.filter(g => {
      const c = state.board.get(coordKey(g));
      return c?.type === 'empty';
    });
    if (emptyGoals.length > 0) {
      let fromMin = Infinity;
      let toMin = Infinity;
      for (const g of emptyGoals) {
        const df = cubeDistance(move.from, g);
        const dt = cubeDistance(move.to, g);
        if (df < fromMin) fromMin = df;
        if (dt < toMin) toMin = dt;
      }
      // Positive = moved closer to nearest empty goal (approach improvement)
      emptyGoalAlignScore = (fromMin - toMin) * 1.5;
    }
  }

  const raw = corridorScore + consolidationScore + stragglerScore + emptyGoalAlignScore;
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
 * Urgency bonus for jumps that use opponent pieces as stepping stones.
 * The more backward the opponent's piece (= the more they want to move it),
 * the more urgent it is to jump over it NOW before it moves away.
 */
export function scoreEphemeralOpponentJump(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump || !move.jumpPath) return 0;

  // jumpPath stores midpoints (the jumped-over cells), one per hop. The most-
  // backward opponent pieces are the ones the opponent most wants to move
  // forward — jumping over them now, while they're still in place, is the
  // urgent play. Weight = 40 per cell of backwardness so a single hop over
  // the opponent's farthest piece (backwardness = 1.0) yields +40 — large
  // enough to push the AI past a same-piece forward step (Flags 5, 6).
  let urgency = 0;
  for (const mid of move.jumpPath) {
    if (!Number.isInteger(mid.q) || !Number.isInteger(mid.r)) continue;
    const content = state.board.get(coordKey(mid));
    if (content?.type === 'piece' && content.player !== player) {
      urgency += getPieceBackwardness(state, mid, content.player) * 40;
    }
  }

  return urgency;
}

/**
 * When two friendly pieces can both step to the same destination (the moving
 * piece and at least one adjacent teammate), check what forward jump the
 * alternative piece(s) could make OVER our moved piece at the destination.
 * A source that leaves a better-positioned jumper behind scores higher,
 * guiding the AI to pick the source that unlocks the strongest chain next turn.
 */
export function scoreResidualTrajectory(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord
): number {
  if (move.isJump) return 0;

  // Only score forward steps
  if (cubeDistance(move.from, goalCenter) <= cubeDistance(move.to, goalCenter)) return 0;

  const pieces = getPlayerPieces(state, player);

  // Is there another friendly piece adjacent to the destination?
  const hasAlternative = pieces.some(
    p => !(p.q === move.from.q && p.r === move.from.r) &&
         cubeDistance(p, move.to) === 1
  );
  if (!hasAlternative) return 0;

  // After moving to move.to, which adjacent alternative pieces can jump OVER
  // the newly placed piece at move.to to a forward position?
  // No board copy needed — check if the landing (move.to + delta) is empty.
  let bestResidualJump = 0;
  for (const piece of pieces) {
    if (piece.q === move.from.q && piece.r === move.from.r) continue;
    if (cubeDistance(piece, move.to) !== 1) continue;

    // The jump: piece hops over move.to, landing at move.to + (move.to − piece)
    const dq = move.to.q - piece.q;
    const dr = move.to.r - piece.r;
    const ds = move.to.s - piece.s;
    const land: CubeCoord = { q: move.to.q + dq, r: move.to.r + dr, s: move.to.s + ds };
    const landContent = state.board.get(coordKey(land));
    if (!landContent || landContent.type !== 'empty') continue;

    const gain = cubeDistance(piece, goalCenter) - cubeDistance(land, goalCenter);
    if (gain > bestResidualJump) bestResidualJump = gain;
  }

  return bestResidualJump * 2;
}

/**
 * Back-piece chain setup: detect when this STEP move creates a forward jump
 * opportunity for the most-back friendly piece. Even at 1 cell of jump gain,
 * setting up a back-piece chain is strategically much more valuable than a
 * direct step from a front piece (Flag 4 pattern). The bonus is gated on the
 * back piece NOT already having a jump of the same gain before this move.
 */
export function scoreBackPieceChainSetup(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (move.isJump) return 0;

  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);
  const pieces = getPlayerPieces(state, player);

  // Most-back piece (excluding the moving piece itself).
  let backPiece: CubeCoord | null = null;
  let backDist = -1;
  for (const p of pieces) {
    if (p.q === move.from.q && p.r === move.from.r) continue;
    const d = cubeDistance(p, goalCenter);
    if (d > backDist) {
      backDist = d;
      backPiece = p;
    }
  }
  if (!backPiece) return 0;

  // Simulate the post-move board (no need to copy beyond the two cells)
  const nextBoard = new Map(state.board);
  const fromContent = nextBoard.get(coordKey(move.from));
  nextBoard.set(coordKey(move.from), { type: 'empty' });
  nextBoard.set(coordKey(move.to), fromContent!);
  const nextState: GameState = { ...state, board: nextBoard };

  // Best forward jump available to the back piece AFTER the move
  let bestNewGain = 0;
  for (const dir of DIRECTIONS) {
    const over: CubeCoord = { q: backPiece.q + dir.q, r: backPiece.r + dir.r, s: backPiece.s + dir.s };
    const land: CubeCoord = { q: backPiece.q + dir.q * 2, r: backPiece.r + dir.r * 2, s: backPiece.s + dir.s * 2 };
    if (!canJumpOver(nextState, over, player)) continue;
    if (nextState.board.get(coordKey(land))?.type !== 'empty') continue;
    const gain = cubeDistance(backPiece, goalCenter) - cubeDistance(land, goalCenter);
    if (gain > bestNewGain) bestNewGain = gain;
  }
  if (bestNewGain === 0) return 0;

  // Same gain available BEFORE the move? Then no setup credit.
  for (const dir of DIRECTIONS) {
    const over: CubeCoord = { q: backPiece.q + dir.q, r: backPiece.r + dir.r, s: backPiece.s + dir.s };
    const land: CubeCoord = { q: backPiece.q + dir.q * 2, r: backPiece.r + dir.r * 2, s: backPiece.s + dir.s * 2 };
    if (!canJumpOver(state, over, player)) continue;
    if (state.board.get(coordKey(land))?.type !== 'empty') continue;
    const oldGain = cubeDistance(backPiece, goalCenter) - cubeDistance(land, goalCenter);
    if (oldGain >= bestNewGain) return 0;
  }

  return bestNewGain * 25;
}

/**
 * Source-dominance bonus: when a single-hop jump hops over a friendly piece to
 * a destination, that friendly piece could have *stepped* to the same destination
 * itself (jump-over-friendly means the friendly is adjacent to move.to). The jump
 * is then strictly dominant — it lands the same piece at the same spot, but
 * advances the back source instead of leaving the front piece exposed. Without
 * this, the AI sometimes picks the step from the front piece when both options
 * exist (Flag 2 pattern).
 */
/**
 * STRICT back-piece priority bonus.
 *
 * Per-move score that fires when:
 *   (a) at least 2 pieces are outside goal,
 *   (b) move.from is one of the back-most outside piece(s) (tied or alone),
 *   (c) the move strictly reduces distance to the goal centroid.
 *
 * Magnitude scales with:
 *   - improvement (how many cells closer to goal)
 *   - urgency (more pieces in goal ⇒ more urgent to advance stragglers)
 *   - isolation (bigger gap from back piece to next group ⇒ more outlier ⇒ more urgent)
 *
 * No piecesInGoal threshold: the principle "back piece first" applies at every
 * phase. In opening positions where all pieces are tied at max distance, the
 * isolation factor is 1 (mild signal), so the bonus is broad-based rather than
 * decisive. As gaps emerge, the bonus sharpens onto the actual back piece.
 */
export function scoreBackPiecePriority(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  const goalCenter = centroid(goalPositions);

  const outside = pieces.filter(p => !goalKeys.has(coordKey(p)));
  if (outside.length < 2) return 0;

  const distances = outside.map(p => ({ p, d: cubeDistance(p, goalCenter) }));
  distances.sort((a, b) => b.d - a.d);
  const maxDist = distances[0].d;

  // Sharp positionFactor drop: backmost pieces (within 0.5 cells of maxDist)
  // get full weight; 1-cell-behind pieces get a strongly damped factor; pieces
  // 2+ cells behind get zero. Previous 3-cell band let band pieces with bigger
  // single-move gains outscore the truly-backmost piece's modest forward step —
  // exactly the "back piece left behind" pattern flagged repeatedly.
  const fromDist = cubeDistance(move.from, goalCenter);
  const distBehind = maxDist - fromDist;
  if (distBehind > 1.5) return 0;
  const positionFactor = distBehind < 0.5 ? 1.0 : 0.25;

  const toDist = cubeDistance(move.to, goalCenter);
  const improvement = fromDist - toDist;
  if (improvement < 0.5) return 0;

  // Isolation: how big is the gap from the back to the rest?
  const firstBelow = distances.find(d => d.d < maxDist);
  const gap = firstBelow ? maxDist - firstBelow.d : 0;
  const isolation = 1 + gap;

  // Urgency: scales with how many pieces are home. In the opening (0 in goal)
  // the back piece isn't actually behind yet — formation development matters
  // more than "advance the back piece" — so we damp urgency below 1.
  const piecesInGoal = countPiecesInGoal(state, player);
  const urgency = piecesInGoal === 0 ? 0.5 : 1 + piecesInGoal * 0.4;

  // Cap raised 900 → 1500 so the sharper positionFactor differential between
  // backmost (1.0) and band pieces (0.25) is preserved at the cap — previously
  // both hit 900 in 4+/10-in-goal positions and the back-piece preference was
  // lost.
  return Math.min(improvement * 150 * urgency * isolation * positionFactor, 1500);
}

/**
 * Personality scaling for `scoreBackPiecePriority`.
 *
 * The raw back-priority bonus can reach +1500 — large enough to overwhelm
 * proactive signals like chainExtension (+125) and bigJumpOpportunity (+48).
 * For defensive play that's the desired bias, but generalist/aggressive
 * personalities should let big chain jumps and goal entries compete on merit.
 *
 * Returns a multiplier:
 *   - defensive:  always 1.0 (full back-piece bias)
 *   - generalist: 0.5 → 0.9 as endgame approaches (less bias when far from goal)
 *   - aggressive: 0.3 → 0.8 as endgame approaches (least bias)
 *
 * The endgame ramp matches the eval's endgameRatio (inGoal 3 → 8 maps to 0 → 1)
 * so back-piece priority recovers as the game shifts from "develop" to "finish".
 */
export function backPriorityPersonalityFactor(
  personality: AIPersonality,
  inGoal: number,
): number {
  if (personality === 'defensive') return 1.0;
  const endgameRatio = Math.max(0, Math.min(1, (inGoal - 3) / 5));
  if (personality === 'generalist') return 0.5 + endgameRatio * 0.4;
  return 0.3 + endgameRatio * 0.5;
}

/**
 * Proactive-jump boost: rewards `chainExtension` and `bigJumpOpportunity`
 * more strongly for non-defensive personalities. Pairs with the back-priority
 * damper above so the AI doesn't substitute one bias (back-piece tunneling)
 * for another — it actively prefers big chain jumps in midgame.
 *
 * Returns a multiplier:
 *   - defensive:  1.0  (no change — keeps it cautious)
 *   - generalist: 1.3  (modest preference for proactive jumps)
 *   - aggressive: 1.6  (strong preference for proactive jumps)
 */
export function proactiveJumpFactor(personality: AIPersonality): number {
  if (personality === 'defensive') return 1.0;
  if (personality === 'generalist') return 1.3;
  return 1.6;
}

/**
 * Backward-hop chain penalty: for jumps, reconstructs the chain's intermediate
 * landings and penalizes any move whose path visited a DEEPER cell than the
 * final landing. Catches the "chain ends with backward hop" pattern where the
 * BFS reaches a deep goal cell and then jumps back out to a shallower one —
 * the user has flagged this as "questionable, deeper would have been better."
 *
 * Penalty is `(maxIntermediate - finalDepth) × 100` so a 2-cell backward hop
 * subtracts 200, which is large enough to outweigh the +60 per-hop chainLen
 * bonus that would otherwise reward the longer-but-worse chain.
 */
export function scoreChainBackwardHop(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump || !move.jumpPath || move.jumpPath.length === 0) return 0;
  const origin = { q: 0, r: 0, s: 0 };
  const finalDepth = cubeDistance(move.to, origin);

  let prev = move.from;
  let maxIntermediate = 0;
  for (const over of move.jumpPath) {
    const landing: CubeCoord = {
      q: 2 * over.q - prev.q,
      r: 2 * over.r - prev.r,
      s: 2 * over.s - prev.s,
    };
    const depth = cubeDistance(landing, origin);
    if (depth > maxIntermediate) maxIntermediate = depth;
    prev = landing;
  }

  if (maxIntermediate > finalDepth + 0.01) {
    return -(maxIntermediate - finalDepth) * 100;
  }
  return 0;
}

/**
 * Chain-endpoint setup bonus: for jumps, evaluates the QUALITY of the landing
 * position beyond raw progress. Differentiates between chain stops that have
 * similar distance gain but differ in:
 *   1. Teammate-setup: friendly pieces that can now jump OVER our new position
 *      forward, using us as a stepping stone next turn.
 *   2. Opponent-blocking: opponent jumps that our landing now prevents because
 *      we occupy the would-be destination cell.
 *
 * Only fires for jumps. Magnitude tuned to differentiate similar-progress
 * landings (~20-40 points per benefit) without overriding bigger strategic
 * signals like back-piece priority or chain extension.
 */
export function scoreChainEndpointSetup(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump) return 0;
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);

  // Perpendicular-to-goal unit vector for lateral-drift comparisons.
  // A teammate that gains centroid distance but drifts further off the
  // axis-to-goal is not actually being "set up" — they're being pushed
  // sideways. Compute once per call.
  const gLen = Math.sqrt(goalCenter.q * goalCenter.q + goalCenter.r * goalCenter.r);
  const haveAxis = gLen > 0.01;
  const px = haveAxis ? -goalCenter.r / gLen : 0;
  const py = haveAxis ?  goalCenter.q / gLen : 0;
  const lateralDrift = (p: CubeCoord) =>
    haveAxis ? Math.abs(p.q * px + p.r * py) : 0;

  let score = 0;

  for (const dir of DIRECTIONS) {
    // 1. Teammate-setup: friendly piece at (to + dir) with empty (to - dir).
    //    Pattern: teammate at neighbor → jumps OVER us (at move.to) → lands
    //    at (to - dir) which must be empty. This uses us as a stepping stone.
    const neighbor: CubeCoord = {
      q: move.to.q + dir.q,
      r: move.to.r + dir.r,
      s: move.to.s + dir.s,
    };
    const dest: CubeCoord = {
      q: move.to.q - dir.q,
      r: move.to.r - dir.r,
      s: move.to.s - dir.s,
    };
    const neighborContent = state.board.get(coordKey(neighbor));
    const destContent = state.board.get(coordKey(dest));
    if (
      neighborContent?.type === 'piece' &&
      neighborContent.player === player &&
      destContent?.type === 'empty'
    ) {
      // Reward only if the jump would be FORWARD for the teammate AND not
      // push them further off the axis-to-goal. A "forward" hop that swings
      // a teammate from on-axis to off-axis pays the user back later — Flag
      // 1/2 pattern: chain endpoint (3,-3) used to score +16 here because
      // (3,-4) → (3,-2) registers as forward, but (3,-2) sits much further
      // off the goal-axis than (3,-4). The off-axis stop (1,-3) doesn't
      // unlock any teammate hop, so it lost the comparison.
      const teammateGain = cubeDistance(neighbor, goalCenter) - cubeDistance(dest, goalCenter);
      if (teammateGain >= 1) {
        const teammateLateralBefore = lateralDrift(neighbor);
        const teammateLateralAfter = lateralDrift(dest);
        // Small tolerance: a tiny lateral wobble is fine, but a clear push
        // off-axis voids the setup credit.
        if (teammateLateralAfter <= teammateLateralBefore + 0.25) {
          // Capped to avoid double-counting very long teammate chains.
          score += Math.min(teammateGain, 4) * 8;
        }
      }
    }

    // 2. Opponent-blocking: opponent piece at (to - 2*dir) with any piece at
    //    (to - dir) means that opponent could have jumped to our cell.
    //    Now we occupy it, blocking their jump.
    const oppSource: CubeCoord = {
      q: move.to.q - dir.q * 2,
      r: move.to.r - dir.r * 2,
      s: move.to.s - dir.s * 2,
    };
    const oppMid: CubeCoord = {
      q: move.to.q - dir.q,
      r: move.to.r - dir.r,
      s: move.to.s - dir.s,
    };
    const oppSourceContent = state.board.get(coordKey(oppSource));
    const oppMidContent = state.board.get(coordKey(oppMid));
    if (
      oppSourceContent?.type === 'piece' &&
      oppSourceContent.player !== player &&
      oppMidContent?.type === 'piece'
    ) {
      // Reward only if the jump would have been FORWARD for the opponent.
      const oppGoalPositions = getGoalPositionsForState(state, oppSourceContent.player);
      if (oppGoalPositions.length > 0) {
        const oppGoalCenter = centroid(oppGoalPositions);
        const oppGain = cubeDistance(oppSource, oppGoalCenter) - cubeDistance(move.to, oppGoalCenter);
        if (oppGain >= 1) {
          score += Math.min(oppGain, 4) * 8;
        }
      }
    }
  }

  return score;
}

/**
 * Chain-extension bonus: rewards jumps for progress, weighted so goal entries
 * beat comparable-distance non-goal landings.
 *
 * Three cases:
 *   1. Goal entry (move.from outside, move.to in goal):
 *      flat bonus + depth × 18 — entering goal is high-value, deeper cells better.
 *   2. In-goal-to-deeper (both in goal, toDepth > fromDepth):
 *      depthGain² × 12 — disambiguates between in-goal stops.
 *   3. Non-goal landing:
 *      improvement² × 5 — moderate; should not dominate goal entries.
 *
 * The centroid-distance metric for non-goal landings was previously × 10, which
 * could make a deep non-goal landing outrank a comparable goal entry — exactly
 * Flag 2's pattern. Reducing to × 5 + reweighting entries fixes it.
 */
export function scoreChainExtension(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump) return 0;
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  const origin = { q: 0, r: 0, s: 0 };

  const toInGoal = goalKeys.has(coordKey(move.to));
  const fromInGoal = goalKeys.has(coordKey(move.from));

  if (toInGoal) {
    const toDepth = cubeDistance(move.to, origin);
    if (!fromInGoal) {
      // Goal entry from outside — quadratic in depth so deeper landings
      // dominate decisively (gap of ~100 between depth 5 and depth 7).
      return 100 + toDepth * toDepth * 4;
    }
    // In-goal to in-goal — only reward deeper
    const fromDepth = cubeDistance(move.from, origin);
    const depthGain = toDepth - fromDepth;
    if (depthGain < 0.5) return 0;
    return depthGain * depthGain * 12;
  }

  // Non-goal landing — moderate reward by centroid improvement, CAPPED so
  // very-long non-goal chains can't out-score goal entries. Goal entries top
  // out at ~200 from this function; capping non-goal at min(improvement, 5)²
  // × 5 = 125 max ensures the goal-entry path always wins by ≥75 in chain
  // extension alone, plus the search.ts goal-entry bonus on top.
  const goalCenter = centroid(goalPositions);
  const improvement = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  if (improvement < 0.5) return 0;
  const cappedImp = Math.min(improvement, 5);
  return cappedImp * cappedImp * 5;
}

/**
 * In-goal regression penalty: heavily discourages moving an in-goal piece to
 * a shallower in-goal cell. The user has repeatedly flagged this — there is
 * almost never a strategic reason to "give back" depth that's already earned.
 *
 * -120 per cell of lost depth. Strong enough to overcome any other heuristic
 * that might be tempted to reward such a move (e.g., setup positioning).
 *
 * The endgame solver already filters most of these via its priority chain,
 * but the regular minimax (which controls at inGoal &lt; 6) does not — and
 * recent flags show backsteps slipping through at inGoal = 5.
 */
export function scoreInGoalRegression(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (!goalKeys.has(coordKey(move.from)) || !goalKeys.has(coordKey(move.to))) return 0;

  const origin = { q: 0, r: 0, s: 0 };
  const fromDepth = cubeDistance(move.from, origin);
  const toDepth = cubeDistance(move.to, origin);
  if (toDepth >= fromDepth) return 0;

  return -(fromDepth - toDepth) * 120;
}

/**
 * Make-room bonus: rewards in-goal-to-deeper-in-goal moves that vacate a cell
 * near an outside piece, enabling future stepping-stone chains.
 *
 * Triggers when:
 *   (a) move.from and move.to are both in goal,
 *   (b) move.to is deeper than move.from (further from board origin),
 *   (c) at least one outside piece is within 5 hex cells of the source.
 *
 * Magnitude scales with proximity of the nearest outside piece to the source,
 * and with inGoal urgency. Tuned to be substantial but not dominating: a
 * make-room move should beat an in-goal fiddle that does nothing, but lose
 * to an actual back-piece forward move.
 */
export function scoreMakeRoomSetup(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (!goalKeys.has(coordKey(move.from)) || !goalKeys.has(coordKey(move.to))) return 0;

  const origin = { q: 0, r: 0, s: 0 };
  const fromDepth = cubeDistance(move.from, origin);
  const toDepth = cubeDistance(move.to, origin);
  if (toDepth <= fromDepth) return 0;

  const pieces = getPlayerPieces(state, player);
  const outside = pieces.filter(p => !goalKeys.has(coordKey(p)));
  if (outside.length === 0) return 0;

  let minDist = Infinity;
  for (const p of outside) {
    const d = cubeDistance(p, move.from);
    if (d < minDist) minDist = d;
  }
  if (minDist > 5) return 0;

  const piecesInGoal = countPiecesInGoal(state, player);
  const urgency = 1 + Math.max(0, piecesInGoal - 4) * 0.5;

  return (6 - minDist) * 40 * urgency;
}

/**
 * Lateral cohesion bonus: rewards outside-piece STEPS whose destination is
 * closer to the centroid of the OTHER outside pieces than the source was.
 *
 * Restricted to step moves (not jumps). A chain jump's value comes from
 * progress, not lateral position — penalizing it for landing far from
 * teammates was over-counting and could outweigh a legitimate big chain
 * (Flag 1 from 2026-06-26 21:31 export). Steps are where lateral direction
 * actually matters, so this is where the cohesion bias belongs.
 *
 * Only fires for outside-piece moves; in-goal shuffles are governed by goal
 * depth, not lateral cohesion.
 */
export function scoreLateralCohesion(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (move.isJump) return 0;
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (goalKeys.has(coordKey(move.from))) return 0;

  const outside = pieces.filter(p => !goalKeys.has(coordKey(p)));
  const others = outside.filter(p => p.q !== move.from.q || p.r !== move.from.r);
  if (others.length < 2) return 0;

  const cq = others.reduce((s, p) => s + p.q, 0) / others.length;
  const cr = others.reduce((s, p) => s + p.r, 0) / others.length;
  const cs = others.reduce((s, p) => s + p.s, 0) / others.length;

  const distBefore = (Math.abs(move.from.q - cq) + Math.abs(move.from.r - cr) + Math.abs(move.from.s - cs)) / 2;
  const distAfter = (Math.abs(move.to.q - cq) + Math.abs(move.to.r - cr) + Math.abs(move.to.s - cs)) / 2;
  const gain = distBefore - distAfter;

  return gain * 70;
}

/**
 * Chain-enabling setup bonus: a forward or lateral move (step OR jump) whose
 * post-move state unlocks a bigger forward jump for a piece FURTHER BACK than
 * the moving piece.
 *
 * Two patterns this captures:
 *  (1) The setup piece was blocking part of a chain — moving it out of the way
 *      lets a back piece jump farther.
 *  (2) The setup plants a friendly piece somewhere new, creating a stepping
 *      stone a back piece can hop over.
 *
 * Hard guards (so we never reward the kind of "setup" that wastes tempo):
 *  - `setupGain >= -0.5` → forward or lateral only, never backward
 *  - source must be outside the goal → no walking out of the goal triangle
 *  - the beneficiary jump must originate from a piece strictly further from
 *    goal than the setup piece — without this, "setup" would credit any
 *    self-serving move that happens to enable its own next jump
 *
 * Comparison uses the BACK-piece best jump before vs after. Comparing against
 * the overall best jump would double-count progress moves that aren't really
 * setups (e.g. a back piece already had a great jump available — moving a
 * front piece doesn't deserve credit for not-blocking it).
 */
export function scoreChainEnablingStep(
  state: GameState,
  move: Move,
  next: GameState,
  player: PlayerIndex,
  goalCenter: CubeCoord,
  currentForwardJumps: Array<{ sourceDist: number; gain: number }>,
): number {
  const setupGain = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  const fromInGoal = goalKeys.has(coordKey(move.from));
  const toInGoal = goalKeys.has(coordKey(move.to));

  if (fromInGoal) {
    // In-goal source: only useful as a setup if the piece STAYS in goal AND
    // doesn't move shallower. Vacating a goal cell so a back piece can chain
    // into it is the user's "step deeper before jumping" pattern (Flags 2–5).
    // Leaving goal entirely is handled (and penalised) by other scorers.
    if (!toInGoal) return 0;
    const origin = { q: 0, r: 0, s: 0 };
    if (cubeDistance(move.to, origin) < cubeDistance(move.from, origin)) return 0;
  } else {
    // Outside source — original gates: steps must be strictly forward, jumps
    // may be lateral or forward.
    if (move.isJump) {
      if (setupGain < -0.5) return 0;
    } else {
      if (setupGain < 1) return 0;
    }
  }

  const setupDistFromGoal = cubeDistance(move.from, goalCenter);

  let bestBackJumpBefore = 0;
  for (const fj of currentForwardJumps) {
    if (fj.sourceDist < setupDistFromGoal + 0.5) continue;
    if (fj.gain > bestBackJumpBefore) bestBackJumpBefore = fj.gain;
  }

  const nextMoves = getAllValidMoves(next, player);
  let bestBackJumpAfter = 0;
  for (const m2 of nextMoves) {
    if (!m2.isJump) continue;
    const m2FromDist = cubeDistance(m2.from, goalCenter);
    if (m2FromDist < setupDistFromGoal + 0.5) continue;
    const g = m2FromDist - cubeDistance(m2.to, goalCenter);
    if (g > bestBackJumpAfter) bestBackJumpAfter = g;
  }

  // Require a substantial improvement before paying out. For in-goal setups
  // we relax the threshold to 1 cell — vacating a single goal slot for the
  // back piece to land in is the exact "step deeper" pattern the user flags,
  // and the improvement there is usually small (1–2 cells) but high-value.
  const improvement = bestBackJumpAfter - bestBackJumpBefore;
  const improvementThreshold = fromInGoal ? 1 : 2;
  if (improvement < improvementThreshold) return 0;

  // User principle: "this piece should ALWAYS move forward first so that the
  // back piece can double jump next turn." Magnitude 200 per cell (cap 1000)
  // for STEPS — the user's flagged pattern, where a small forward step unlocks
  // a big follow-up jump for a back piece.
  //
  // JUMPS that incidentally enable a back-piece jump get a much smaller credit
  // (60 per cell): the jump has already cashed in most of its value via
  // centroid gain and `scoreChainExtension`, so adding a large "vacates a
  // useful cell" bonus on top double-counts strategic value. Over-rewarding
  // this case pushed the AI to over-extend (the user-flagged "stopping sooner
  // would be much better" pattern, where a J4 wins over a strategically-better
  // J3 because the deeper landing happens to vacate a useful cell).
  const perCell = move.isJump ? 60 : 200;
  return Math.min(improvement, 5) * perCell;
}

/**
 * Penalty for a lateral (non-forward) step taken from a FRONT piece when a
 * piece further back has a clearly-forward jump available. The user has
 * repeatedly flagged this pattern: "a further back piece could have done the
 * same thing" / "stop sidestepping when good jumps are available".
 *
 * Strict gates: only applies to step moves (jumps and forward steps are fine),
 * only applies to outside pieces (in-goal shuffles handled elsewhere), and
 * only fires when there's a piece at least 1.5 cells further back with a
 * forward jump gaining ≥ 2 cells. Without those gates, this would over-fire
 * during routine cohesion moves where no good back-piece alternative exists.
 */
export function scoreFrontPieceSidestepPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord,
  currentForwardJumps: Array<{ sourceDist: number; gain: number }>,
): number {
  // Applies to STEPS AND JUMPS. Lateral jumps from front pieces were the
  // most common pattern in the latest flag dump — restricting to steps only
  // left half the bad sidesteps unpenalised.
  const gain = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  if (gain >= 1) return 0;

  // Don't penalise lateral development in the opening — no one's "behind" yet
  // when no pieces have entered the goal. The "front piece sidestep" pattern
  // is only a mistake once piece order across the formation matters.
  const piecesInGoal = countPiecesInGoal(state, player);
  if (piecesInGoal < 1) return 0;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (goalKeys.has(coordKey(move.from))) return 0;

  const fromDist = cubeDistance(move.from, goalCenter);

  // Back-piece forward jump available? (any gain ≥ 1)
  for (const fj of currentForwardJumps) {
    if (fj.sourceDist >= fromDist + 1.5 && fj.gain >= 1) {
      return -1200;
    }
  }

  // Back-piece forward STEP available? Without this branch, lateral
  // moves slip through whenever back pieces have no jumps — exactly the
  // mid-game pattern that produced the latest flag dump (e.g. back piece at
  // dist 7 with only step options, lateral picked anyway).
  const pieces = getPlayerPieces(state, player);
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) continue;
    const pieceDist = cubeDistance(piece, goalCenter);
    if (pieceDist < fromDist + 1.5) continue;
    for (const dir of DIRECTIONS) {
      const next: CubeCoord = { q: piece.q + dir.q, r: piece.r + dir.r, s: piece.s + dir.s };
      if (state.board.get(coordKey(next))?.type !== 'empty') continue;
      const nextDist = cubeDistance(next, goalCenter);
      if (pieceDist - nextDist >= 1) {
        return -1200;
      }
    }
  }

  return 0;
}

/**
 * Penalty for an in-goal piece moving sideways within the goal triangle while
 * outside pieces still have forward moves available. The latest flag dump
 * surfaced this distinct pattern (e.g. Flag 11 `(-3,7) → (-4,7)`, Flag 17
 * `(3,-7) → (4,-7)`) which `scoreFrontPieceSidestepPenalty` doesn't catch
 * because it skips in-goal sources.
 *
 * Gates:
 *  - source AND destination are in goal
 *  - depth same or shallower (deeper in-goal moves are already handled by
 *    `scoreMakeRoomSetup` / consolidation logic)
 *  - at least one outside piece has any forward move (step or jump, gain ≥ 1)
 */
export function scoreInGoalLateralPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord,
  currentForwardJumps: Array<{ sourceDist: number; gain: number }>,
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (!goalKeys.has(coordKey(move.from))) return 0;
  if (!goalKeys.has(coordKey(move.to))) return 0;

  const origin = { q: 0, r: 0, s: 0 };
  if (cubeDistance(move.to, origin) > cubeDistance(move.from, origin)) return 0;

  for (const fj of currentForwardJumps) {
    if (fj.gain >= 1) return -250;
  }

  const pieces = getPlayerPieces(state, player);
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) continue;
    const pieceDist = cubeDistance(piece, goalCenter);
    for (const dir of DIRECTIONS) {
      const next: CubeCoord = { q: piece.q + dir.q, r: piece.r + dir.r, s: piece.s + dir.s };
      if (state.board.get(coordKey(next))?.type !== 'empty') continue;
      const nextDist = cubeDistance(next, goalCenter);
      if (pieceDist - nextDist >= 1) return -250;
    }
  }

  return 0;
}

/**
 * Penalty for a goal-entry jump that stops at a shallower cell when the SAME
 * piece could chain to a deeper goal cell. User-flagged HIGH PRIORITY: AI
 * stops short of the deepest reachable end-zone cell "for no good reason".
 *
 * Only fires when the deeper alternative is strictly deeper (cube distance
 * to origin is larger). Magnitude tuned to outweigh the typical leaf-eval
 * preference for cells closer to goal centroid — the user's principle is
 * "fill back-to-front, deepest first" overrides positional centroid eval.
 */
export function scoreShallowGoalEntryPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
): number {
  if (!move.isJump) return 0;
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (goalKeys.has(coordKey(move.from))) return 0;

  const toInGoal = goalKeys.has(coordKey(move.to));
  if (toInGoal) {
    const origin = { q: 0, r: 0, s: 0 };
    const moveDepth = cubeDistance(move.to, origin);
    let bestDeeperDepth = moveDepth;
    for (const m of getValidMoves(state, move.from)) {
      if (!m.isJump) continue;
      if (!goalKeys.has(coordKey(m.to))) continue;
      const mDepth = cubeDistance(m.to, origin);
      if (mDepth > bestDeeperDepth) bestDeeperDepth = mDepth;
    }
    const shortfall = bestDeeperDepth - moveDepth;
    if (shortfall >= 0.5) return -150 * shortfall;

    // Same-depth tiebreaker (Flag 3): when same source has multiple goal
    // entries at the same depth, prefer the one HARDER for outside-goal
    // friendly pieces to reach. Filling those now leaves the easier cells
    // for stragglers, ending the game sooner.
    const piecesOutsideGoal = getPlayerPieces(state, player).filter(
      p => !goalKeys.has(coordKey(p)) && !cubeEquals(p, move.from)
    );
    if (piecesOutsideGoal.length === 0) return 0;
    const minDist = (pos: CubeCoord) =>
      Math.min(...piecesOutsideGoal.map(p => cubeDistance(pos, p)));
    const moveMinDist = minDist(move.to);
    let bestMinDist = moveMinDist;
    for (const m of getValidMoves(state, move.from)) {
      if (!m.isJump) continue;
      if (!goalKeys.has(coordKey(m.to))) continue;
      const mDepth = cubeDistance(m.to, origin);
      if (mDepth !== moveDepth) continue;
      const d = minDist(m.to);
      if (d > bestMinDist) bestMinDist = d;
    }
    const accessShortfall = bestMinDist - moveMinDist;
    if (accessShortfall < 0.5) return 0;
    return -100 * Math.min(accessShortfall, 4);
  }

  // Late-endgame staging branch (Flag 4): same source has a chain landing
  // strictly closer to goal centroid. User principle: "should jump one
  // further to the side here to clear space". Only fires once a chunk of
  // pieces are already in goal — earlier, "clear space" isn't load-bearing.
  if (countPiecesInGoal(state, player) < 4) return 0;
  const goalCenter = centroid(goalPositions);
  const moveDistToCenter = cubeDistance(move.to, goalCenter);
  let bestCloserDist = moveDistToCenter;
  for (const m of getValidMoves(state, move.from)) {
    if (!m.isJump) continue;
    const d = cubeDistance(m.to, goalCenter);
    if (d < bestCloserDist) bestCloserDist = d;
  }
  const stagingShortfall = moveDistToCenter - bestCloserDist;
  if (stagingShortfall < 1.5) return 0;
  return -100 * Math.min(stagingShortfall, 4);
}

/**
 * Penalty for a lateral move whose destination cell another piece could reach
 * via a FORWARD move. If two pieces can both land on the same setup square,
 * the one that gains progress doing so wins.
 *
 * User-stated principle: "rather than just looking at that piece's options,
 * look at what other pieces could potentially fill in the same spot as the
 * piece that was laterally stepping. If the same setup can be achieved by
 * another piece stepping or jumping forward, that should be considered a
 * much better move."
 *
 * Gated to outside source (in-goal handled elsewhere). Magnitude tuned to
 * meaningfully bias against the lateral without dominating other signals.
 */
export function scoreLateralReachableByForwardPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord,
): number {
  const gain = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  if (gain >= 1) return 0;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (goalKeys.has(coordKey(move.from))) return 0;

  for (const m of getAllValidMoves(state, player)) {
    if (m.from.q === move.from.q && m.from.r === move.from.r) continue;
    if (m.to.q !== move.to.q || m.to.r !== move.to.r) continue;
    const mGain = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
    if (mGain >= 1) return -400;
  }
  return 0;
}

/**
 * Penalty for a lateral move when the SAME piece has a strictly-better
 * forward move available. The Flag 3 / Flag 12 pattern: piece could have
 * jumped (or stepped) forward 2+ cells but the AI picked a lateral chain
 * from the same piece instead.
 *
 * Distinct from `scoreFrontPieceSidestepPenalty` (which checks for *other*,
 * back pieces' forward moves) — this fires on the move itself missing its
 * own piece's clearly-better option, no matter where the back of the
 * formation is.
 *
 * Gated to outside sources only; in-goal lateral is governed by
 * `scoreInGoalLateralPenalty`.
 */
export function scoreSamePieceMissedForwardPenalty(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  goalCenter: CubeCoord,
  bestForwardGainBySource: Map<string, number>,
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  if (goalKeys.has(coordKey(move.from))) return 0;

  const bestForward = bestForwardGainBySource.get(coordKey(move.from)) ?? 0;
  if (bestForward < 1) return 0;

  const gain = cubeDistance(move.from, goalCenter) - cubeDistance(move.to, goalCenter);
  // The chosen move already matches or beats the best forward — no penalty.
  if (gain >= bestForward) return 0;

  // Lateral / backward when a forward exists from the same piece.
  // Magnitudes need to beat the minimax-tree evaluation delta, which can
  // easily be 500-1000 in evaluatePosition for cohesion/alignment shifts.
  if (gain < 1) {
    if (bestForward >= 2) return -1000;
    return -500;
  }

  // Forward step from a piece that ALSO has a forward jump (gain ≥ 2) is a
  // partial miss — the step gains progress but burns the turn that the jump
  // would have advanced further. Flag 1: `(0,1) → (0,0)` step (gain 1) was
  // chosen over `(0,1) → (2,-1)` jump (gain 2). Only fires when the missed
  // option is a real jump (bestForward ≥ 2), so single-cell step-vs-step
  // direction calls are not punished here (they belong to the lane/leapfrog
  // signals). Magnitude ramps with the gain shortfall.
  if (bestForward >= 2 && !move.isJump) {
    return -(bestForward - gain) * 200;
  }

  return 0;
}

/**
 * Best forward gain (any move type) available from each piece in the current
 * state, keyed by source coord. Cached at root so the same-piece-missed-
 * forward penalty doesn't re-scan moves per candidate.
 */
export function computeBestForwardGainBySource(
  state: GameState,
  player: PlayerIndex,
  goalCenter: CubeCoord,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const m of getAllValidMoves(state, player)) {
    const gain = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
    if (gain <= 0) continue;
    const key = coordKey(m.from);
    const current = result.get(key) ?? 0;
    if (gain > current) result.set(key, gain);
  }
  return result;
}

/**
 * Snapshot of every forward jump available at the root, indexed by source
 * piece distance from goal. Cached once at root so scoreChainEnablingStep
 * can query "best forward jump from a piece farther than X" cheaply.
 */
export function computeCurrentForwardJumps(
  state: GameState,
  player: PlayerIndex,
  goalCenter: CubeCoord,
): Array<{ sourceDist: number; gain: number }> {
  const result: Array<{ sourceDist: number; gain: number }> = [];
  for (const m of getAllValidMoves(state, player)) {
    if (!m.isJump) continue;
    const sd = cubeDistance(m.from, goalCenter);
    const gain = sd - cubeDistance(m.to, goalCenter);
    if (gain <= 0) continue;
    result.push({ sourceDist: sd, gain });
  }
  return result;
}

/**
 * Cheap setup-risk discount for chain-enabling moves. If our setup piece (the
 * `to` cell) gets used by an opponent's 1-ply jump as a stepping-stone (they
 * jump OVER it), the "setup" also benefits the opponent and is likely to be
 * undone on their turn. Returns a multiplier in [0.3, 1.0].
 *
 * Only checked at root strategic eval (not in pre-filter / minimax leaf) to
 * keep cost bounded.
 */
export function chainEnablingRiskMultiplier(
  next: GameState,
  setupTo: CubeCoord,
  player: PlayerIndex,
): number {
  const opponents = next.activePlayers.filter(p => p !== player);
  const setupKey = coordKey(setupTo);
  for (const opp of opponents) {
    for (const om of getAllValidMoves(next, opp)) {
      if (!om.isJump) continue;
      // jumpPath stores midpoints (jumped-over cells) directly, one per hop.
      // If any of them is the cell our setup piece just landed on, the
      // opponent can hop through us — discount the chain-enabling bonus.
      for (const mid of om.jumpPath ?? []) {
        if (!Number.isInteger(mid.q) || !Number.isInteger(mid.r)) continue;
        if (coordKey(mid) === setupKey) return 0.3;
      }
      // Single-hop fallback when jumpPath is missing: the midpoint is
      // (from + to) / 2.
      if (!om.jumpPath || om.jumpPath.length === 0) {
        const mq = (om.from.q + om.to.q) / 2;
        const mr = (om.from.r + om.to.r) / 2;
        if (Number.isInteger(mq) && Number.isInteger(mr) && `${mq},${mr}` === setupKey) {
          return 0.3;
        }
      }
    }
  }
  return 1.0;
}

export function scoreSourceDominance(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  if (!move.isJump || !move.jumpPath || move.jumpPath.length !== 1) return 0;
  const midQ = (move.from.q + move.to.q) / 2;
  const midR = (move.from.r + move.to.r) / 2;
  if (!Number.isInteger(midQ) || !Number.isInteger(midR)) return 0;
  const mid: CubeCoord = { q: midQ, r: midR, s: -midQ - midR };
  const midContent = state.board.get(coordKey(mid));
  if (midContent?.type !== 'piece' || midContent.player !== player) return 0;
  // The friendly piece at mid could have stepped to move.to. The jump from a
  // back source is strictly better — bonus large enough to overcome the slight
  // landing-quality edge the step sometimes has.
  return 60;
}

/**
 * Penalty for step moves whose destination becomes the midpoint of a new
 * forward jump for an opponent. The step *gifts* the opponent a stepping
 * stone they didn't have before.
 *
 * Only fires for step moves: a jump move's destination is the moved piece's
 * landing, not a stepping stone the opponent would jump over (and a jump
 * that creates an immediate forward jump for the opponent is a separate,
 * far rarer pattern).
 *
 * The pre-move cell at move.to is empty (we stepped there), so the opponent
 * could not have jumped that line before. After the move it's our piece,
 * which any opponent can jump over (per canJumpOver semantics for normal
 * pieces) — so a free forward jump materialises.
 *
 * Magnitude is gain × 50 so a 2-cell gift (Flag 4) costs −100, comparable to
 * a missed-jump-from-same-piece penalty. Not catastrophic so genuinely better
 * advances can still go through.
 */
export function scoreCreatesOpponentJump(
  state: GameState,
  move: Move,
  player: PlayerIndex,
): number {
  if (move.isJump) return 0;

  // Best chain-jump gain available from `landPos` for `oppPlayer` in the post-
  // move board. Used after a first hop already landed there. Bounded depth so
  // a pathological chain doesn't blow up the per-move scoring budget (Flag 8:
  // the opponent's first hop can lead to a 2- or 3-hop continuation).
  const chainGainFrom = (
    landPos: CubeCoord,
    oppPlayer: PlayerIndex,
    oppGoalCenter: CubeCoord,
    visited: Set<string>,
    depthBudget: number,
  ): number => {
    if (depthBudget === 0) return 0;
    let best = 0;
    for (const dir of DIRECTIONS) {
      const over: CubeCoord = {
        q: landPos.q + dir.q, r: landPos.r + dir.r, s: landPos.s + dir.s,
      };
      const overContent = state.board.get(coordKey(over));
      // The opponent can chain over their own pieces freely; jumping over our
      // pieces is fine too — only opponent big pieces fully block.
      if (!overContent || overContent.type !== 'piece') continue;
      // Skip jumping over the cell our piece just vacated (it's now empty).
      if (over.q === move.from.q && over.r === move.from.r) continue;
      // Skip jumping over our just-placed piece — we already counted the
      // first hop from the caller's loop.
      if (over.q === move.to.q && over.r === move.to.r) continue;

      const nextLand: CubeCoord = {
        q: landPos.q + dir.q * 2, r: landPos.r + dir.r * 2, s: landPos.s + dir.s * 2,
      };
      const nextKey = coordKey(nextLand);
      if (visited.has(nextKey)) continue;
      const nextContent = state.board.get(coordKey(nextLand));
      const isEmpty =
        nextContent?.type === 'empty' ||
        (nextLand.q === move.from.q && nextLand.r === move.from.r);
      if (!isEmpty) continue;

      const hopGain = cubeDistance(landPos, oppGoalCenter) - cubeDistance(nextLand, oppGoalCenter);
      if (hopGain <= 0) continue;

      const newVisited = new Set(visited);
      newVisited.add(nextKey);
      const continuation = chainGainFrom(nextLand, oppPlayer, oppGoalCenter, newVisited, depthBudget - 1);
      const total = hopGain + continuation;
      if (total > best) best = total;
    }
    return best;
  };

  let worstOppGain = 0;
  for (const opponent of state.activePlayers) {
    if (opponent === player) continue;
    const oppGoalPositions = getGoalPositionsForState(state, opponent);
    if (oppGoalPositions.length === 0) continue;
    const oppGoalCenter = centroid(oppGoalPositions);

    for (const dir of DIRECTIONS) {
      const jumperPos: CubeCoord = {
        q: move.to.q + dir.q, r: move.to.r + dir.r, s: move.to.s + dir.s,
      };
      const jumperContent = state.board.get(coordKey(jumperPos));
      if (jumperContent?.type !== 'piece' || jumperContent.player !== opponent) continue;

      const landPos: CubeCoord = {
        q: move.to.q - dir.q, r: move.to.r - dir.r, s: move.to.s - dir.s,
      };
      const landContent = state.board.get(coordKey(landPos));
      const landIsEmptyPostMove =
        landContent?.type === 'empty' ||
        (landPos.q === move.from.q && landPos.r === move.from.r);
      if (!landIsEmptyPostMove) continue;

      const firstHopGain = cubeDistance(jumperPos, oppGoalCenter) - cubeDistance(landPos, oppGoalCenter);
      if (firstHopGain < 1) continue;

      const visited = new Set<string>();
      visited.add(coordKey(jumperPos));
      visited.add(coordKey(landPos));
      const chainExtras = chainGainFrom(landPos, opponent, oppGoalCenter, visited, 2);
      const total = firstHopGain + chainExtras;
      if (total > worstOppGain) worstOppGain = total;
    }
  }

  if (worstOppGain <= 0) return 0;
  return -worstOppGain * 50;
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
  // Bonus for jumping over opponent pieces that the opponent urgently wants to move
  ephemeralOpponentUrgency: number;
  // Penalty for moves that ignore the back piece while we're filling the goal
  backPieceNeglectPenalty: number;
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

  // Backwardness of the moving piece: quadratic so the most-backward piece
  // gets a strongly disproportionate bonus over middle pieces.
  // Gate on forward/lateral moves — backward steps must never be rewarded
  // for being behind, which would push the AI into regressive loops.
  const goalPositionsForBack = getGoalPositionsForState(state, player);
  const goalCenterForBack = centroid(goalPositionsForBack);
  const moveDistToGoal = cubeDistance(move.from, goalCenterForBack) - cubeDistance(move.to, goalCenterForBack);
  const isNotBackward = moveDistToGoal > -0.5; // forward or lateral (not a backward step)
  const backwardness = getPieceBackwardness(state, move.from, player);
  const backwardnessBonus = isNotBackward ? backwardness * backwardness * 35 : 0;

  // BIG bonus for moving a significant straggler.
  // Urgency scales with pieces already in goal — the further along we are,
  // the more critical it is to get the remaining outside pieces in quickly.
  // Same forward/lateral gate — never reward a backward step for being behind.
  const piecesInGoalForStraggler = countPiecesInGoal(state, player);
  // Steeper scaling once 5+ pieces are in goal — straggler urgency must
  // outpace the endgame goal-entry bonuses so back pieces aren't abandoned.
  const stragglerUrgencyScale = piecesInGoalForStraggler >= 5
    ? 1 + piecesInGoalForStraggler * 0.8
    : 1 + piecesInGoalForStraggler * 0.2;
  const { hasStraggler, stragglerPos, gap } = hasSignificantStraggler(state, player);
  const movingStraggler = isMovingStraggler(state, move, player);
  const stragglerBonus = (hasStraggler && movingStraggler && isNotBackward)
    ? gap * 10 * stragglerUrgencyScale
    : 0;

  // Back-piece neglect penalty: rewarding the straggler alone is not enough —
  // every OTHER move must also be punished so the search never settles for
  // endzone fiddling while a piece sits abandoned in the back. Triggers when
  // there's a clear back piece (gap ≥ 2) and 4+ pieces are already in goal.
  // Setup-style moves that bring the moving piece within 3 cells of the straggler
  // are exempt (they're helping it advance).
  let backPieceNeglectPenalty = 0;
  if (hasStraggler && stragglerPos && !movingStraggler && piecesInGoalForStraggler >= 4) {
    const landingNearStraggler = cubeDistance(move.to, stragglerPos) <= 3;
    if (!landingNearStraggler) {
      // Scales with how many pieces are home and how big the gap is.
      backPieceNeglectPenalty = (piecesInGoalForStraggler - 3) * gap * 5;
    }
  }

  // Midgame priority: prefer moving pieces still crossing the board.
  // Scales up sharply as pieces enter the goal — at 8+ in goal, the outside pieces
  // are the absolute top priority and should beat any inside fiddling.
  const movingPiecePhase = getPiecePhase(state, move.from, player);
  const midgamePriorityBonus = movingPiecePhase === 'midgame'
    ? 12 + Math.max(0, piecesInGoalForStraggler - 4) * 8
    : 0;

  // Opponent-gift: penalise moves that give opponent a large forward jump.
  // Aggressive personality ignores opponent threats; defensive/generalist don't.
  const opponentGiftPenalty =
    personality !== 'aggressive'
      ? computeOpponentGiftPenalty(state, move, player)
      : 0;

  // Opponent pieces used in jump
  const opponentPiecesUsed = countOpponentPiecesInJump(state, move, player);
  const opponentPieceBonus = opponentPiecesUsed * 3;

  // Ephemeral urgency: aggressive always uses opponent pieces opportunistically;
  // generalist and defensive get the explicit nudge when the window is closing.
  const ephemeralOpponentUrgency =
    personality !== 'aggressive'
      ? scoreEphemeralOpponentJump(state, move, player)
      : 0;

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
  const earlyGameStepMultiplier = piecesInGoalForStraggler < 4 ? 2.5 : piecesInGoalForStraggler < 7 ? 1.5 : 1.0;

  // Combine with weights
  const total =
    weights.steppingStone * steppingStoneValue * earlyGameStepMultiplier +
    weights.unblocking * unblockingValue +
    weights.backwardness * backwardnessBonus +
    weights.opponentPiece * opponentPieceBonus +
    ephemeralOpponentUrgency +
    weights.blockingOpponent * blockingOpponentValue +
    weights.straggler * stragglerBonus +
    midgamePriorityBonus -
    weights.pastOpponents * pastOpponentsPenalty -
    weights.blockingOpponent * opponentGiftPenalty -
    backPieceNeglectPenalty;

  return {
    steppingStoneValue,
    unblockingValue,
    backwardnessBonus,
    opponentPieceBonus,
    ephemeralOpponentUrgency,
    blockingOpponentValue,
    pastOpponentsPenalty,
    stragglerBonus,
    midgamePriorityBonus,
    opponentGiftPenalty,
    backPieceNeglectPenalty,
    total,
  };
}

/**
 * Detect and reward the "leapfrog" pattern: our move lands in a position that
 * enables a friendly piece to jump over us to a better position, AND after that
 * jump, we (still at ourNewPos) or the jumped piece can enable another hop.
 *
 * Returns a positive bonus; never negative.
 * Personality-weighted: aggressive values leapfrog chains most.
 */
export function scoreLeapfrogPotential(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality: AIPersonality
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  if (goalPositions.length === 0) return 0;
  const goalCenter = centroid(goalPositions);

  const ourNewPos = move.to;
  const ourNewDist = cubeDistance(ourNewPos, goalCenter);

  // Cell state reflecting the POST-move board: move.from becomes empty,
  // move.to becomes occupied by us. Pre-existing pieces are unchanged.
  // Returns 'empty' | 'us' | 'piece' | 'off-board'.
  const cellAfterMove = (pos: CubeCoord): 'empty' | 'us' | 'piece' | 'off-board' => {
    if (pos.q === move.from.q && pos.r === move.from.r) return 'empty';
    if (pos.q === move.to.q && pos.r === move.to.r) return 'us';
    const c = state.board.get(coordKey(pos));
    if (!c) return 'off-board';
    if (c.type !== 'piece') return 'empty';
    return c.player === player ? 'us' : 'piece';
  };

  let leapfrogValue = 0;

  // Check each direction: can a friendly piece jump over our landing position?
  for (const dir of DIRECTIONS) {
    // Jumping piece is 1 step BEHIND our landing in this direction
    const jumperPos: CubeCoord = {
      q: ourNewPos.q - dir.q,
      r: ourNewPos.r - dir.r,
      s: ourNewPos.s - dir.s,
    };
    // A friendly jumper at jumperPos AFTER our move
    if (cellAfterMove(jumperPos) !== 'us') continue;

    // Where the jumper would land (1 step PAST our landing)
    const hopLand: CubeCoord = {
      q: ourNewPos.q + dir.q,
      r: ourNewPos.r + dir.r,
      s: ourNewPos.s + dir.s,
    };
    if (cellAfterMove(hopLand) !== 'empty') continue;

    // Is this hop forward for the jumping piece?
    const jumperDist = cubeDistance(jumperPos, goalCenter);
    const hopLandDist = cubeDistance(hopLand, goalCenter);
    const firstHopGain = jumperDist - hopLandDist;
    if (firstHopGain <= 0) continue;

    leapfrogValue += firstHopGain;

    // Reciprocal check: after B jumps to hopLand, can A (at ourNewPos) jump over B
    // for a second hop? Check the cell 1 step PAST hopLand in the same direction.
    const secondHopLand: CubeCoord = {
      q: hopLand.q + dir.q,
      r: hopLand.r + dir.r,
      s: hopLand.s + dir.s,
    };
    if (cellAfterMove(secondHopLand) === 'empty') {
      const secondHopDist = cubeDistance(secondHopLand, goalCenter);
      const secondHopGain = ourNewDist - secondHopDist;
      if (secondHopGain > 0) {
        leapfrogValue += secondHopGain * 0.6; // Discounted: requires a future turn
      }
    }
  }

  if (leapfrogValue <= 0) return 0;

  const personalityMult =
    personality === 'aggressive' ? 2.0 :
    personality === 'generalist' ? 1.5 : 1.0;

  return leapfrogValue * personalityMult;
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
