import type { GameState, PlayerIndex, CubeCoord } from '@/types/game';
import type { AIPersonality, AIDifficulty } from '@/types/ai';
import { getPlayerPieces } from '../setup';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { cubeDistance, centroid, coordKey } from '../coordinates';
import { getAllValidMoves } from '../moves';
import { computePlayerProgress } from '../progress';
import { getWorstAssignmentCost } from '../pathfinding';
import { loadEvolvedGenome } from '../training/persistence';
import { evaluateWithGenome } from '../training/evaluate';
import { getCachedLearnedWeights } from '../learning';

const PERSONALITY_WEIGHTS: Record<AIPersonality, {
  progress: number;
  distanceProgress: number;
  centerControl: number;
  blocking: number;
  jumpPotential: number;
}> = {
  generalist:  { progress: 3.0, distanceProgress: 3.5, centerControl: 1.0, blocking: 1.0, jumpPotential: 0.5 },
  defensive:   { progress: 2.0, distanceProgress: 3.0, centerControl: 0.5, blocking: 4.0, jumpPotential: 0.5 },
  aggressive:  { progress: 2.5, distanceProgress: 4.0, centerControl: 1.5, blocking: 0.0, jumpPotential: 3.0 },
};

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
    // For custom layouts, use path-based straggler detection
    // This accounts for actual move distances through board topology
    const worstMoveCost = getWorstAssignmentCost(state, pieces, goalPositions, false);
    stragglerScore = -(worstMoveCost * worstMoveCost) / 5;
  } else {
    // For standard layouts, use efficient distance-based calculation
    const distances = pieces.map((p) => cubeDistance(p, goalCenter));
    const maxPieceDist = distances.length > 0 ? Math.max(...distances) : 0;
    stragglerScore = -(maxPieceDist * maxPieceDist) / 5;
  }

  // Late endgame targeting: when 9+ pieces in goal, compute distance to
  // nearest *empty* goal position instead of centroid for remaining pieces,
  // and apply extra straggler penalty
  const lateEndgame = inGoal >= 9;
  if (lateEndgame) {
    const emptyGoals = goalPositions.filter((g) => {
      const content = state.board.get(coordKey(g));
      return !content || content.type === 'empty' || (content.type === 'piece' && content.player !== player);
    });
    if (emptyGoals.length > 0) {
      // For pieces NOT in goal, compute distance to nearest empty goal slot
      const goalKeySet = new Set(goalPositions.map((g) => coordKey(g)));
      const piecesOutside = pieces.filter((p) => !goalKeySet.has(coordKey(p)));
      if (piecesOutside.length > 0) {
        if (state.isCustomLayout) {
          // Use path-based assignment for custom layouts
          const worstMoveCost = getWorstAssignmentCost(state, piecesOutside, emptyGoals, false);
          stragglerScore = -(worstMoveCost * worstMoveCost) / 3;
        } else {
          const worstDist = Math.max(
            ...piecesOutside.map((p) =>
              Math.min(...emptyGoals.map((g) => cubeDistance(p, g)))
            )
          );
          // Override straggler with targeted empty-slot distance, amplified
          stragglerScore = -(worstDist * worstDist) / 3;
        }
      }
    }
  }

  // 4. Center control: pieces within distance 4 of origin (0-30ish)
  // Skip for custom layouts since the goal direction may not involve the center
  let centerControlScore = 0;
  if (!state.isCustomLayout) {
    const origin: CubeCoord = { q: 0, r: 0, s: 0 };
    const centerPieces = pieces.filter((p) => cubeDistance(p, origin) <= 4).length;
    centerControlScore = centerPieces * 3;
  }

  // 5. Blocking: AI pieces sitting on opponent goal positions
  // Skip for custom layouts since opponent goals may not be defined
  let blockingScore = 0;
  if (weights.blocking > 0 && !state.isCustomLayout) {
    for (const opponent of state.activePlayers) {
      if (opponent === player) continue;
      const opponentGoal = getGoalPositionsForState(state, opponent);
      const opponentInGoal = countPiecesInGoal(state, opponent);
      // Weight blocking more against the leader
      const leaderWeight = opponentInGoal > 5 ? 2 : 1;
      for (const goalPos of opponentGoal) {
        const occupied = pieces.some(
          (p) => p.q === goalPos.q && p.r === goalPos.r
        );
        if (occupied) {
          blockingScore += 5 * leaderWeight;
        }
      }
    }
  }

  // 6. Jump potential: count available jump moves (capped at 40)
  // DISABLED for custom layouts - causes random movement without progress
  let jumpPotentialScore = 0;
  if (weights.jumpPotential > 0 && !state.isCustomLayout) {
    const allMoves = getAllValidMoves(state, player);
    const jumpMoves = allMoves.filter((m) => m.isJump);
    jumpPotentialScore = Math.min(jumpMoves.length * 2, 40);
  }

  // Endgame focus: when nearing completion or after a player has already won,
  // stop caring about tactical factors and focus entirely on getting home.
  const endgame = inGoal >= 7 || state.winner !== null;
  let wProgress     = endgame ? weights.progress * 2         : weights.progress;
  let wDistProgress = endgame ? weights.distanceProgress * 2 : weights.distanceProgress;
  let wStraggler    = endgame ? 3.0                          : 1.5;
  const wCenter       = endgame ? 0                            : weights.centerControl;
  const wBlocking     = endgame ? 0                            : weights.blocking;
  const wJumpPotential = endgame ? 0                           : weights.jumpPotential;

  // Post-winner urgency: when someone has already won, further boost distance weight
  if (state.winner !== null) {
    wDistProgress *= 1.5;
  }

  // For custom layouts, progress is the ONLY thing that matters
  // Other heuristics don't apply well to arbitrary board shapes
  if (state.isCustomLayout) {
    wProgress *= 3;
    wDistProgress *= 4;
    wStraggler *= 2;
  }

  let score =
    wProgress * progressScore +
    wDistProgress * distanceProgressScore +
    wStraggler * stragglerScore +
    wCenter * centerControlScore +
    wBlocking * blockingScore +
    wJumpPotential * jumpPotentialScore;

  // Apply learned weights if available (for medium+ difficulty)
  if (difficulty !== 'easy') {
    const learnedWeights = getCachedLearnedWeights();
    if (learnedWeights.gamesAnalyzed > 0) {
      // Adjust score based on learned preferences
      // These are subtle modifiers, not complete overrides
      const learnedModifier =
        (distanceProgressScore * (learnedWeights.distanceWeight - 1) * 0.5) +
        (jumpPotentialScore * (learnedWeights.jumpPreference - 1) * 0.3);
      score += learnedModifier;
    }
  }

  // Easy difficulty adds random noise
  if (difficulty === 'easy') {
    score += Math.random() * 8;
  }

  return score;
}
