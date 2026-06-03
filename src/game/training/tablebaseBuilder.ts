import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { Genome } from '@/types/training';
import { DEFAULT_BOARD_LAYOUT } from '../defaultLayout';
import { createGame, createGameFromLayout } from '../setup';
import { getGoalPositionsForState, isGameFullyOver, applyMove } from '../state';
import { cubeDistance, centroid, coordKey } from '../coordinates';
import { findBestMoveWithGenome } from './evaluate';
import { makeTablebaseKey, saveTablebase } from '@/game/ai/tablebase';
import type { TablebaseEntry } from '@/game/ai/tablebase';

const PLAYER: PlayerIndex = 0;
const MAX_DIST_FROM_GOAL = 8;
// Solve depths: deep enough to find good moves, not so deep as to time out
const SOLVE_DEPTH_1 = 6;
const SOLVE_DEPTH_2 = 4;
const SOLVE_MOVE_LIMIT = 6;

/** Get the standard goal positions for player 0 in a 2-player game. */
function getStandardGoalPositions(): CubeCoord[] {
  const tempState = createGame(2);
  return getGoalPositionsForState(tempState, PLAYER);
}

/** Get all non-goal board cells from the standard layout. */
function getNonGoalBoardCells(goalSet: Set<string>): CubeCoord[] {
  const cells: CubeCoord[] = [];
  for (const key of DEFAULT_BOARD_LAYOUT.cells) {
    if (goalSet.has(key)) continue;
    const [q, r] = key.split(',').map(Number);
    cells.push({ q, r, s: -q - r });
  }
  return cells;
}

export interface EndgamePosition {
  outsidePieces: CubeCoord[];
  emptyGoals: CubeCoord[];
}

/**
 * Enumerate all reachable 1 or 2-piece endgame positions within distance
 * MAX_DIST_FROM_GOAL of the goal centroid.
 */
export function enumerateEndgamePositions(numOutside: 1 | 2): EndgamePosition[] {
  const goalPositions = getStandardGoalPositions();
  const goalSet = new Set(goalPositions.map(g => coordKey(g)));
  const goalCenter = centroid(goalPositions);

  const nearbyCells = getNonGoalBoardCells(goalSet)
    .filter(c => cubeDistance(c, goalCenter) <= MAX_DIST_FROM_GOAL);

  const positions: EndgamePosition[] = [];

  if (numOutside === 1) {
    for (const outside of nearbyCells) {
      for (const emptyGoal of goalPositions) {
        positions.push({ outsidePieces: [outside], emptyGoals: [emptyGoal] });
      }
    }
  } else {
    for (let i = 0; i < nearbyCells.length; i++) {
      for (let j = i + 1; j < nearbyCells.length; j++) {
        for (let a = 0; a < goalPositions.length; a++) {
          for (let b = a + 1; b < goalPositions.length; b++) {
            positions.push({
              outsidePieces: [nearbyCells[i], nearbyCells[j]],
              emptyGoals: [goalPositions[a], goalPositions[b]],
            });
          }
        }
      }
    }
  }

  return positions;
}

function buildPieceStrings(
  outsidePieces: CubeCoord[],
  goalPositions: CubeCoord[],
  emptyGoals: CubeCoord[]
): string[] {
  const emptySet = new Set(emptyGoals.map(g => coordKey(g)));
  const inGoal = goalPositions
    .filter(g => !emptySet.has(coordKey(g)))
    .map(g => `${g.q},${g.r}`);
  const outside = outsidePieces.map(p => `${p.q},${p.r}`);
  return [...inGoal, ...outside];
}

function solvePosition(
  position: EndgamePosition,
  goalPositions: CubeCoord[],
  genome: Genome,
  depth: number
): TablebaseEntry | null {
  const goalStrings = goalPositions.map(g => `${g.q},${g.r}`);
  const pieceStrings = buildPieceStrings(position.outsidePieces, goalPositions, position.emptyGoals);

  const layout = {
    id: 'tablebase-solve',
    name: 'Tablebase',
    cells: DEFAULT_BOARD_LAYOUT.cells,
    startingPositions: { [PLAYER]: pieceStrings } as Record<PlayerIndex, string[]>,
    goalPositions: { [PLAYER]: goalStrings } as Record<PlayerIndex, string[]>,
    createdAt: 0,
  };

  const state = createGameFromLayout(layout);
  const firstMove = findBestMoveWithGenome(state, genome, depth, SOLVE_MOVE_LIMIT);
  if (!firstMove) return null;

  // Play forward to count turns
  let current = state;
  let turnsUsed = 0;
  const maxTurns = position.outsidePieces.length * 8;

  while (!isGameFullyOver(current) && turnsUsed < maxTurns) {
    const move = findBestMoveWithGenome(current, genome, Math.min(depth, 4), SOLVE_MOVE_LIMIT);
    if (!move) break;
    current = applyMove(current, move);
    turnsUsed++;
  }

  if (!isGameFullyOver(current)) return null;

  return {
    from: { q: firstMove.from.q, r: firstMove.from.r },
    to: { q: firstMove.to.q, r: firstMove.to.r },
    solvedIn: turnsUsed,
  };
}

export interface BuildOptions {
  maxPiecesOutside?: 1 | 2;
  /** Override solve depth (used in tests to keep runtime short). */
  solveDepth1?: number;
  solveDepth2?: number;
  /** Limit total positions processed (used in tests only). */
  maxPositions?: number;
}

/**
 * Enumerate and solve all 1 (and optionally 2) piece endgame positions.
 * Saves the solved table to localStorage via saveTablebase.
 */
export async function buildEndgameTablebase(
  genome: Genome,
  onProgress: (solved: number, total: number, sizeBytes: number) => void,
  options: BuildOptions = {}
): Promise<void> {
  const maxOutside = options.maxPiecesOutside ?? 2;
  const d1 = options.solveDepth1 ?? SOLVE_DEPTH_1;
  const d2 = options.solveDepth2 ?? SOLVE_DEPTH_2;
  const goalPositions = getStandardGoalPositions();

  const positions1 = enumerateEndgamePositions(1);
  const positions2 = maxOutside >= 2 ? enumerateEndgamePositions(2) : [];
  const allPositions: Array<{ pos: EndgamePosition; depth: number }> = [
    ...positions1.map(pos => ({ pos, depth: d1 })),
    ...positions2.map(pos => ({ pos, depth: d2 })),
  ];

  const cappedPositions = options.maxPositions
    ? allPositions.slice(0, options.maxPositions)
    : allPositions;
  const total = cappedPositions.length;
  const entries: Record<string, TablebaseEntry> = {};
  let solved = 0;

  for (const { pos, depth } of cappedPositions) {
    const entry = solvePosition(pos, goalPositions, genome, depth);
    if (entry) {
      const key = makeTablebaseKey(pos.outsidePieces, pos.emptyGoals);
      entries[key] = entry;
    }
    solved++;

    if (solved % 50 === 0 || solved === total) {
      saveTablebase(entries);
      const sizeBytes = JSON.stringify(entries).length;
      onProgress(solved, total, sizeBytes);
      // Yield to keep browser responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  saveTablebase(entries);
  onProgress(total, total, JSON.stringify(entries).length);
}
