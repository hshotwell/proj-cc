import type { CubeCoord, Move, GameState, PlayerIndex } from '@/types/game';
import { DIRECTIONS } from './constants';
import {
  coordKey,
  cubeAdd,
  cubeEquals,
  getJumpDestination,
} from './coordinates';
import { getHomePositions, getGoalPositions } from './state';

// Check if a position is empty on the board
function isEmpty(state: GameState, coord: CubeCoord): boolean {
  const content = state.board.get(coordKey(coord));
  return content?.type === 'empty';
}

// Check if a position has a piece
function hasPiece(state: GameState, coord: CubeCoord): boolean {
  const content = state.board.get(coordKey(coord));
  return content?.type === 'piece';
}

// Check if a position is valid (on the board)
// Uses the game state's board which contains the correct cells for both
// default and custom layouts.
function isOnBoard(state: GameState, coord: CubeCoord): boolean {
  return state.board.has(coordKey(coord));
}

// Get all valid step moves (moving to an adjacent empty cell)
function getStepMoves(state: GameState, from: CubeCoord): Move[] {
  const moves: Move[] = [];

  for (const dir of DIRECTIONS) {
    const to = cubeAdd(from, dir);

    // Must be on board and empty
    if (isOnBoard(state, to) && isEmpty(state, to)) {
      moves.push({
        from,
        to,
        isJump: false,
      });
    }
  }

  return moves;
}

// Get all valid jump moves using BFS for chain jumps
function getJumpMoves(state: GameState, from: CubeCoord): Move[] {
  const moves: Move[] = [];
  const visited = new Set<string>();
  visited.add(coordKey(from));

  // BFS queue: [current position, path of jumps]
  const queue: Array<{ pos: CubeCoord; path: CubeCoord[] }> = [
    { pos: from, path: [] },
  ];

  while (queue.length > 0) {
    const { pos: current, path } = queue.shift()!;

    // Try jumping in each direction
    for (const dir of DIRECTIONS) {
      const over = cubeAdd(current, dir);
      const landing = getJumpDestination(current, over);

      // Jump is valid if:
      // 1. There's a piece to jump over
      // 2. Landing spot is on the board
      // 3. Landing spot is empty
      // 4. Haven't visited this landing spot yet
      if (
        hasPiece(state, over) &&
        isOnBoard(state, landing) &&
        isEmpty(state, landing) &&
        !visited.has(coordKey(landing))
      ) {
        visited.add(coordKey(landing));
        const newPath = [...path, over];

        // Add this as a valid move
        moves.push({
          from,
          to: landing,
          isJump: true,
          jumpPath: newPath,
        });

        // Continue BFS from this position for chain jumps
        queue.push({ pos: landing, path: newPath });
      }
    }
  }

  return moves;
}

// Check if a player has moved ALL their pieces out of their home/starting positions
function hasPlayerLeftHome(state: GameState, player: PlayerIndex): boolean {
  // For custom layouts, use startingPositions from state
  if (state.isCustomLayout && state.startingPositions?.[player]) {
    for (const key of state.startingPositions[player]!) {
      const content = state.board.get(key);
      if (content?.type === 'piece' && content.player === player) {
        return false;
      }
    }
    return true;
  }

  // For standard layouts, use default home positions
  const homePositions = getHomePositions(player);
  for (const pos of homePositions) {
    const content = state.board.get(coordKey(pos));
    if (content?.type === 'piece' && content.player === player) {
      return false;
    }
  }
  return true;
}

// Get swap moves: single-step onto adjacent goal cell occupied by opponent
function getSwapMoves(state: GameState, from: CubeCoord, player: PlayerIndex): Move[] {
  if (!hasPlayerLeftHome(state, player)) return [];

  // Get goal positions - use custom goals for custom layouts, default otherwise
  let goalKeys: Set<string>;
  if (state.isCustomLayout && state.customGoalPositions?.[player]) {
    goalKeys = new Set(state.customGoalPositions[player]!);
  } else if (state.isCustomLayout) {
    // Custom layout but no goals defined for this player - no swaps possible
    return [];
  } else {
    const goalPositions = getGoalPositions(player);
    goalKeys = new Set(goalPositions.map(coordKey));
  }

  const moves: Move[] = [];

  for (const dir of DIRECTIONS) {
    const to = cubeAdd(from, dir);
    const toKey = coordKey(to);

    // Must be a goal cell for this player
    if (!goalKeys.has(toKey)) continue;

    // Must hold an opponent's piece
    const content = state.board.get(toKey);
    if (!content || content.type !== 'piece' || content.player === player) continue;

    moves.push({ from, to, isJump: false, isSwap: true });
  }

  return moves;
}

// Get all valid moves for a piece at the given position
export function getValidMoves(state: GameState, from: CubeCoord): Move[] {
  // Verify there's a piece at this position
  const content = state.board.get(coordKey(from));
  if (!content || content.type !== 'piece') {
    return [];
  }

  // Combine step moves, jump moves, and swap moves
  const stepMoves = getStepMoves(state, from);
  const jumpMoves = getJumpMoves(state, from);
  const swapMoves = getSwapMoves(state, from, content.player);

  return [...stepMoves, ...jumpMoves, ...swapMoves];
}

// Get all valid moves for a player
export function getAllValidMoves(
  state: GameState,
  player: PlayerIndex
): Move[] {
  const allMoves: Move[] = [];

  // Find all pieces belonging to this player
  for (const [key, content] of state.board) {
    if (content.type === 'piece' && content.player === player) {
      const [q, r] = key.split(',').map(Number);
      const from = { q, r, s: -q - r };
      const moves = getValidMoves(state, from);
      allMoves.push(...moves);
    }
  }

  return allMoves;
}

// Check if a move is valid
export function isValidMove(
  state: GameState,
  move: Move,
  player: PlayerIndex
): boolean {
  // Check if there's a piece at the from position belonging to this player
  const content = state.board.get(coordKey(move.from));
  if (!content || content.type !== 'piece' || content.player !== player) {
    return false;
  }

  // Get all valid moves and check if this move is among them
  const validMoves = getValidMoves(state, move.from);
  return validMoves.some(
    (m) => cubeEquals(m.from, move.from) && cubeEquals(m.to, move.to)
  );
}
