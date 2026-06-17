import type { Genome } from '@/types/training';
import type { PlayerIndex, Move, GameState } from '@/types/game';
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

const BEAM_WIDTH = 3;
const BEAM_DEPTH = 3;

/** Score a single move from state; returns -Infinity for vetoed moves. */
function scoreMoveForBeam(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  genome: Genome
): number {
  const rPenalty = computeRegressionPenaltyWithGenome(state, move, player, genome);
  const repPenalty = computeRepetitionPenaltyWithGenome(state, move, player, genome);
  if (rPenalty === Infinity || repPenalty === Infinity) return -Infinity;
  const next = applyMove(state, move);
  return evaluateWithGenome(next, player, genome) - rPenalty - repPenalty;
}

/** One beam expansion step: expand all beam states, return top BEAM_WIDTH by score. */
function expandBeam(
  beamEntries: Array<{ state: GameState; firstMove: Move | null; solved: boolean }>,
  player: PlayerIndex,
  genome: Genome
): Array<{ state: GameState; firstMove: Move | null; solved: boolean }> {
  const candidates: Array<{ state: GameState; score: number; firstMove: Move | null; solved: boolean }> = [];

  for (const entry of beamEntries) {
    // Terminal winning state: propagate it with maximum score so it stays in beam
    if (entry.solved) {
      candidates.push({ ...entry, score: Infinity });
      continue;
    }

    const moves = getAllValidMoves(entry.state, player);
    for (const move of moves) {
      const score = scoreMoveForBeam(entry.state, move, player, genome);
      if (score === -Infinity) continue;
      const nextState = applyMove(entry.state, move);
      const solved = nextState.finishedPlayers.length > 0 || isGameFullyOver(nextState);
      // Winning move gets highest priority
      const effectiveScore = solved ? Infinity : score;
      candidates.push({
        state: nextState,
        score: effectiveScore,
        firstMove: entry.firstMove ?? move,
        solved,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.score === Infinity && b.score !== Infinity) return -1;
    if (b.score === Infinity && a.score !== Infinity) return 1;
    return b.score - a.score;
  });
  return candidates.slice(0, BEAM_WIDTH).map((c) => ({
    state: c.state,
    firstMove: c.firstMove,
    solved: c.solved,
  }));
}

/**
 * Run a single-player endgame puzzle with beam search (width=3, depth=3).
 * At each turn, look BEAM_DEPTH moves ahead before committing to the best one.
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

    // Single move — no search needed
    if (moves.length === 1) {
      state = applyMove(state, moves[0]);
      continue;
    }

    // Beam search: expand BEAM_DEPTH levels, pick the move from the best leaf
    let beam: Array<{ state: GameState; firstMove: Move | null; solved: boolean }> = [
      { state, firstMove: null, solved: false },
    ];

    for (let depth = 0; depth < BEAM_DEPTH; depth++) {
      const next = expandBeam(beam, player, genome);
      if (next.length === 0) break;
      beam = next;
      // If the top beam entry is a winning path, commit immediately
      if (beam[0]?.solved) break;
    }

    const bestFirstMove = beam[0]?.firstMove;
    if (!bestFirstMove) {
      // Fallback: greedy depth-0 if beam produced nothing
      let bestMove = moves[0];
      let bestScore = -Infinity;
      for (const move of moves) {
        const score = scoreMoveForBeam(state, move, player, genome);
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
      state = applyMove(state, bestMove);
    } else {
      state = applyMove(state, bestFirstMove);
    }
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
 * Score a single puzzle result.
 * - unsolved → 0
 * - solved > par → max(0, 100 − (turns − par) × 10)
 * - solved ≤ par → 100 × (par / turnsUsed)  [uncapped — ratio-based]
 */
export function scorePuzzleResult(
  solved: boolean,
  turnsUsed: number,
  par: number
): number {
  if (!solved) return 0;
  if (turnsUsed <= par) {
    return (par / Math.max(1, turnsUsed)) * 100;
  }
  return Math.max(0, 100 - (turnsUsed - par) * 10);
}

/**
 * Score a genome across a set of puzzles.
 * Returns the mean score across all puzzles.
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
    total += scorePuzzleResult(solved, turnsUsed, puzzle.par);
  }
  return total / puzzles.length;
}
