import type { GameState, PlayerIndex, CubeCoord } from '@/types/game';
import type { AIPersonality, AIDifficulty } from '@/types/ai';
import { getPlayerPieces } from '../setup';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { cubeDistance, centroid, coordKey, cubeAdd } from '../coordinates';
import { DIRECTIONS } from '../constants';
import { canJumpOver } from '../moves';
import { computePlayerProgress } from '../progress';
import { getWorstAssignmentCost } from '../pathfinding';
import { loadEvolvedGenome } from '../training/persistence';
import { evaluateWithGenome } from '../training/evaluate';
import { getCachedLearnedWeights, getCachedEndgameInsights } from '../learning';

const PERSONALITY_WEIGHTS: Record<AIPersonality, {
  progress: number;
  distanceProgress: number;
  alignment: number;
  chainReach: number;
  cohesion: number;
}> = {
  //                          progress  distProg  align  chain  cohesion
  generalist: { progress: 3.0, distanceProgress: 3.5, alignment: 0.4, chainReach: 2.0, cohesion: 1.0 },
  defensive:  { progress: 2.0, distanceProgress: 3.0, alignment: 0.3, chainReach: 1.0, cohesion: 2.5 },
  aggressive: { progress: 2.5, distanceProgress: 4.0, alignment: 0.3, chainReach: 3.5, cohesion: 1.5 },
};

/**
 * Directional alignment: measures how well pieces stay in the corridor toward
 * their goal (avoiding wasteful lateral drift off-axis).
 * Returns a negative value — closer to 0 is better.
 */
function computeDirectionalAlignment(
  pieces: CubeCoord[],
  goalCenter: CubeCoord
): number {
  const gLen = Math.sqrt(goalCenter.q * goalCenter.q + goalCenter.r * goalCenter.r);
  if (gLen < 0.01) return 0;

  // Perpendicular unit vector to the goal direction
  const px = -goalCenter.r / gLen;
  const py =  goalCenter.q / gLen;

  let lateralTotal = 0;
  for (const piece of pieces) {
    const lateral = Math.abs(piece.q * px + piece.r * py);
    lateralTotal += lateral;
  }
  return -lateralTotal; // Penalty (more negative = more lateral drift)
}

/**
 * Chain reach: for each piece, find the maximum forward distance achievable
 * via a single immediate jump (proxy for path-planning potential).
 * Aggressive personalities reward large individual jumps; others reward total.
 * Respects big-piece blocking: opponent big pieces cannot be jumped over.
 */
function computeChainReachScore(
  state: GameState,
  player: PlayerIndex,
  pieces: CubeCoord[],
  goalCenter: CubeCoord
): number {
  let totalReach = 0;
  for (const piece of pieces) {
    const startDist = cubeDistance(piece, goalCenter);
    let maxJump = 0;
    for (const dir of DIRECTIONS) {
      const over = cubeAdd(piece, dir);
      const land: CubeCoord = {
        q: piece.q + dir.q * 2,
        r: piece.r + dir.r * 2,
        s: piece.s + dir.s * 2,
      };
      if (canJumpOver(state, over, player) &&
          state.board.get(coordKey(land))?.type === 'empty') {
        const reach = startDist - cubeDistance(land, goalCenter);
        if (reach > maxJump) maxJump = reach;
      }
    }
    totalReach += maxJump;
  }
  return Math.min(totalReach, 100);
}

/**
 * Blockade score: rewards the player for placing big pieces in positions that
 * block opponent forward jumps. Only relevant when player uses big pieces.
 * For each opponent piece adjacent to a player big piece where the jump would
 * be forward (toward opponent's goal), count the blocked distance gain.
 */
function computeBlockadeScore(
  state: GameState,
  player: PlayerIndex
): number {
  // Check if player has any big pieces (player-level or individual via pieceVariants)
  const playerLevelBig = (state.playerPieceTypes?.[player] ?? 'normal') === 'big';
  const hasAnyBig = playerLevelBig || (state.pieceVariants !== undefined && Array.from(state.board.entries()).some(
    ([k, c]) => c.type === 'piece' && c.player === player && state.pieceVariants!.get(k) === 'big'
  ));
  if (!hasAnyBig) return 0;

  let score = 0;

  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player !== player) continue;
    // Only big pieces create blockades
    const pieceVariant = state.pieceVariants?.get(key) ?? state.playerPieceTypes?.[player] ?? 'normal';
    if (pieceVariant !== 'big') continue;
    const [q, r] = key.split(',').map(Number);
    const bigPiecePos: CubeCoord = { q, r, s: -q - r };

    for (const dir of DIRECTIONS) {
      // Opponent piece on the approach side (big piece is between opp and landing)
      const oppPos: CubeCoord = {
        q: bigPiecePos.q - dir.q,
        r: bigPiecePos.r - dir.r,
        s: bigPiecePos.s - dir.s,
      };
      const oppContent = state.board.get(coordKey(oppPos));
      if (!oppContent || oppContent.type !== 'piece' || oppContent.player === player) continue;

      const opp = oppContent.player;
      const oppGoalPositions = getGoalPositionsForState(state, opp);
      if (oppGoalPositions.length === 0) continue;

      const oppGoalCenter = centroid(oppGoalPositions);

      // Where the opponent would land if they could jump over our big piece
      const landing: CubeCoord = {
        q: bigPiecePos.q + dir.q,
        r: bigPiecePos.r + dir.r,
        s: bigPiecePos.s + dir.s,
      };
      if (!state.board.has(coordKey(landing))) continue;
      const landingContent = state.board.get(coordKey(landing));
      if (!landingContent || landingContent.type !== 'empty') continue;

      // Reward if this jump would have been forward for the opponent
      const oppDistNow = cubeDistance(oppPos, oppGoalCenter);
      const oppDistLanding = cubeDistance(landing, oppGoalCenter);
      if (oppDistLanding < oppDistNow) {
        score += (oppDistNow - oppDistLanding) * 2;
      }
    }
  }

  return Math.min(score, 80);
}

/**
 * Piece cohesion: rewards formations matching personality.
 * Aggressive: evenly-spaced pairs (distance 2 = stepping-stone chains).
 * Defensive: tight clusters (distance 1).
 * Generalist: moderate — any close pair counts.
 */
function computePieceCohesion(
  pieces: CubeCoord[],
  personality: AIPersonality
): number {
  let score = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const dist = cubeDistance(pieces[i], pieces[j]);
      if (personality === 'aggressive') {
        if (dist === 2) score += 3; // Stepping-stone chain spacing
        else if (dist === 1) score += 1;
      } else if (personality === 'defensive') {
        if (dist === 1) score += 3; // Tight cluster
        else if (dist === 2) score += 1;
      } else { // generalist
        if (dist <= 2) score += 2;
      }
    }
  }
  return Math.min(score, 60);
}

/**
 * Power-up proximity bonus: rewards pieces that are near uncollected power-up cells.
 * Picking up a power-up grants a piece variant (turbo/ghost/big), which is very
 * valuable, so the AI should steer pieces toward them.
 * Only applies when power-ups are present on the board (custom layouts).
 */
function computePowerupProximityBonus(
  state: GameState,
  pieces: CubeCoord[]
): number {
  if (!state.powerups || state.powerups.size === 0) return 0;
  let bonus = 0;
  for (const [key] of state.powerups) {
    const [q, r] = key.split(',').map(Number);
    const powerupPos: CubeCoord = { q, r, s: -q - r };
    let minDist = Infinity;
    for (const piece of pieces) {
      const d = cubeDistance(piece, powerupPos);
      if (d < minDist) minDist = d;
    }
    // +15 at distance 1, +10 at 2, +5 at 3, nothing beyond
    if (minDist <= 3) bonus += Math.max(0, 4 - minDist) * 5;
  }
  return Math.min(bonus, 60);
}

export function evaluatePosition(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty = 'hard'
): number {
  // Delegate to genome-based evaluation for evolved difficulty
  if (difficulty === 'evolved') {
    const genome = loadEvolvedGenome();
    if (genome) {
      return evaluateWithGenome(state, player, genome);
    }
    // Fall back to hard/generalist if no genome saved
  }

  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);

  // Early out for custom layouts with no goal positions
  if (goalPositions.length === 0) return 0;
  const weights = PERSONALITY_WEIGHTS[personality];

  // 1. Progress score: pieces already in goal (0-100)
  const inGoal = countPiecesInGoal(state, player);
  const progressScore = inGoal * 10;

  // 2. Calibrated distance progress score (0-100)
  const distanceProgressScore = computePlayerProgress(state, player);

  // 3. Straggler penalty: penalize the farthest piece from goal so the AI
  //    doesn't leave 1-2 pieces behind while advancing the rest (0 to -48)
  let stragglerScore: number;

  if (state.isCustomLayout) {
    const worstMoveCost = getWorstAssignmentCost(state, pieces, goalPositions, false);
    stragglerScore = -(worstMoveCost * worstMoveCost) / 5;
  } else {
    const distances = pieces.map((p) => cubeDistance(p, goalCenter));
    const maxPieceDist = distances.length > 0 ? Math.max(...distances) : 0;
    stragglerScore = -(maxPieceDist * maxPieceDist) / 5;
  }

  // Late endgame targeting: when 9+ pieces in goal, focus on nearest empty goal
  const lateEndgame = inGoal >= 9;
  if (lateEndgame) {
    const emptyGoals = goalPositions.filter((g) => {
      const content = state.board.get(coordKey(g));
      return !content || content.type === 'empty' || (content.type === 'piece' && content.player !== player);
    });
    if (emptyGoals.length > 0) {
      const goalKeySet = new Set(goalPositions.map((g) => coordKey(g)));
      const piecesOutside = pieces.filter((p) => !goalKeySet.has(coordKey(p)));
      if (piecesOutside.length > 0) {
        if (state.isCustomLayout) {
          const worstMoveCost = getWorstAssignmentCost(state, piecesOutside, emptyGoals, false);
          stragglerScore = -(worstMoveCost * worstMoveCost) / 3;
        } else {
          const worstDist = Math.max(
            ...piecesOutside.map((p) =>
              Math.min(...emptyGoals.map((g) => cubeDistance(p, g)))
            )
          );
          stragglerScore = -(worstDist * worstDist) / 3;
        }
      }
    }
  }

  // 4. Directional alignment: penalize pieces that have drifted laterally off
  //    the goal corridor. Skip for custom layouts (goal direction may vary).
  let alignmentScore = 0;
  if (!state.isCustomLayout) {
    alignmentScore = computeDirectionalAlignment(pieces, goalCenter);
  }

  // 5. Chain reach: sum of maximum immediate-jump distances across all pieces.
  //    This is the primary path-planning signal — a piece that can leap far
  //    next turn is more valuable than one stuck with no jump options.
  let chainReachScore = 0;
  if (!state.isCustomLayout) {
    chainReachScore = computeChainReachScore(state, player, pieces, goalCenter);
  }

  // 6. Piece cohesion: rewards formations that support path-planning chains.
  //    Formation preference differs by personality.
  let cohesionScore = 0;
  if (!state.isCustomLayout) {
    cohesionScore = computePieceCohesion(pieces, personality);
  }

  // 7. Blockade score: rewards big pieces positioned to block opponent forward jumps.
  const blockadeScore = computeBlockadeScore(state, player);

  // 8. Power-up proximity bonus: incentivise moving pieces toward uncollected power-ups.
  //    Only meaningful on custom boards that define power-up cells.
  const powerupBonus = computePowerupProximityBonus(state, pieces);

  // Endgame focus: boost progress metrics, drop tactical factors
  const endgame = inGoal >= 7 || state.winner !== null;
  let wProgress     = endgame ? weights.progress * 2         : weights.progress;
  let wDistProgress = endgame ? weights.distanceProgress * 2 : weights.distanceProgress;
  let wStraggler    = endgame ? 3.0                          : 1.5;
  const wAlignment    = endgame ? 0                            : weights.alignment;
  const wChainReach   = endgame ? weights.chainReach * 0.5     : weights.chainReach;
  const wCohesion     = endgame ? 0                            : weights.cohesion;

  // Post-winner urgency: when someone has already won, further boost distance weight
  if (state.winner !== null) {
    wDistProgress *= 1.5;
  }

  // Apply learned endgame insights (for medium+ difficulty in endgame)
  if (endgame && difficulty !== 'easy') {
    const endgameInsights = getCachedEndgameInsights();
    if (endgameInsights && endgameInsights.gamesAnalyzed > 10) {
      if (endgameInsights.avgMovesFrom7 < 15) {
        wStraggler *= 1.3;
      }
      if (endgameInsights.avgShuffleMoves < 3) {
        wDistProgress *= 1.2;
      }
    }
  }

  // For custom layouts, progress is the ONLY thing that matters
  if (state.isCustomLayout) {
    wProgress *= 3;
    wDistProgress *= 4;
    wStraggler *= 2;
  }

  const wBlockade = (state.playerPieceTypes?.[player] ?? 'normal') === 'big' ? 1.5 : 0;
  // Power-up bonus is always active when power-ups exist; drop to 0 in late endgame
  // (no point chasing power-ups when you're almost done)
  const wPowerup = !endgame && state.powerups && state.powerups.size > 0 ? 1.5 : 0;

  let score =
    wProgress     * progressScore +
    wDistProgress * distanceProgressScore +
    wStraggler    * stragglerScore +
    wAlignment    * alignmentScore +
    wChainReach   * chainReachScore +
    wCohesion     * cohesionScore +
    wBlockade     * blockadeScore +
    wPowerup      * powerupBonus;

  // Apply learned weights if available (for medium+ difficulty)
  if (difficulty !== 'easy') {
    const learnedWeights = getCachedLearnedWeights();
    if (learnedWeights.gamesAnalyzed > 0) {
      const learnedModifier =
        (distanceProgressScore * (learnedWeights.distanceWeight - 1) * 0.5) +
        (chainReachScore * (learnedWeights.jumpPreference - 1) * 0.3);
      score += learnedModifier;
    }
  }

  // Easy difficulty adds random noise
  if (difficulty === 'easy') {
    score += Math.random() * 8;
  }

  return score;
}
