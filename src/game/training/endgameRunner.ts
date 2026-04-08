import type { Genome } from '@/types/training';
import type { PlayerIndex } from '@/types/game';
import { DEFAULT_BOARD_LAYOUT } from '../defaultLayout';
import { createGameFromLayout } from '../setup';
import { applyMove, isGameFullyOver } from '../state';
import {
  evaluateWithGenome,
  computeRegressionPenaltyWithGenome,
  computeRepetitionPenaltyWithGenome,
} from './evaluate';
import { getAllValidMoves } from '../moves';

export interface PuzzleResult {
  solved: boolean;
  turnsUsed: number;
}

/**
 * Run a single-player endgame puzzle with the given genome using greedy
 * (depth-0) evaluation: pick the best-scoring immediate move each turn.
 *
 * The player is always placed at index 0. maxTurns defaults to par × 3,
 * giving generous headroom while still distinguishing bad genomes from good.
 */
export function runEndgamePuzzle(
  positions: string[],
  goalPositions: string[],
  par: number,
  genome: Genome
): PuzzleResult {
  const maxTurns = par * 3;
  const player: PlayerIndex = 0;

  const layout = {
    id: 'endgame-training',
    name: 'Endgame Training',
    cells: DEFAULT_BOARD_LAYOUT.cells,
    startingPositions: { [player]: positions } as Record<PlayerIndex, string[]>,
    goalPositions: { [player]: goalPositions } as Record<PlayerIndex, string[]>,
    createdAt: 0,
  };

  let state = createGameFromLayout(layout);

  while (!isGameFullyOver(state) && state.turnNumber - 1 < maxTurns) {
    const moves = getAllValidMoves(state, player);
    if (moves.length === 0) break;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const next = applyMove(state, move);
      let score = evaluateWithGenome(next, player, genome);
      score -= computeRegressionPenaltyWithGenome(state, move, player, genome);
      score -= computeRepetitionPenaltyWithGenome(state, move, player, genome);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    state = applyMove(state, bestMove);
  }

  // turnNumber starts at 1; each applyMove in a 1-player game increments it.
  return {
    solved: state.finishedPlayers.length > 0 || isGameFullyOver(state),
    turnsUsed: state.turnNumber - 1,
  };
}

export interface StoredPuzzle {
  positions: string[];
  goalPositions: string[];
  par: number;
}

/**
 * Score a genome across a set of puzzles.
 *
 * Per-puzzle scoring:
 *   solved ≤ par  → 100 + (par − turns) × 5   (bonus for beating par)
 *   solved > par  → max(0, 100 − (turns − par) × 15)
 *   unsolved      → 0
 *
 * Returns the mean score across all puzzles (0–125 range per puzzle).
 */
export function scoreGenomeOnPuzzles(
  genome: Genome,
  puzzles: StoredPuzzle[]
): number {
  if (puzzles.length === 0) return 0;

  let total = 0;
  for (const puzzle of puzzles) {
    const { solved, turnsUsed } = runEndgamePuzzle(
      puzzle.positions,
      puzzle.goalPositions,
      puzzle.par,
      genome
    );
    if (!solved) {
      total += 0;
    } else if (turnsUsed <= puzzle.par) {
      total += 100 + (puzzle.par - turnsUsed) * 5;
    } else {
      total += Math.max(0, 100 - (turnsUsed - puzzle.par) * 15);
    }
  }
  return total / puzzles.length;
}
