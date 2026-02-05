import type { CubeCoord, Move, GameState, PlayerIndex } from '@/types/game';
import { coordKey, cubeEquals, parseCoordKey } from './coordinates';
import { cloneGameState, getPlayerPieces } from './setup';
import { getDefaultStartingPositions } from './defaultLayout';

// Map each player to their opposite player (whose starting area is this player's goal)
export const OPPOSITE_PLAYER: Record<PlayerIndex, PlayerIndex> = {
  0: 2,  // Red's goal is Blue's home (and vice versa)
  2: 0,
  1: 4,  // Green's goal is Purple's home (and vice versa)
  4: 1,
  3: 5,  // Orange's goal is Yellow's home (and vice versa)
  5: 3,
};

// Apply a move to the game state, returning a new immutable state
export function applyMove(state: GameState, move: Move): GameState {
  const newState = cloneGameState(state);
  const fromKey = coordKey(move.from);
  const toKey = coordKey(move.to);

  // Get the piece being moved
  const piece = state.board.get(fromKey);
  if (!piece || piece.type !== 'piece') {
    throw new Error('No piece at move origin');
  }

  // Move the piece (swap: displaced opponent goes to `from`)
  if (move.isSwap) {
    const displaced = state.board.get(toKey);
    newState.board.set(fromKey, displaced && displaced.type === 'piece' ? displaced : { type: 'empty' });
  } else {
    newState.board.set(fromKey, { type: 'empty' });
  }
  newState.board.set(toKey, piece);

  // Record the move
  newState.moveHistory.push(move);

  // Check if the moving player just finished
  const movingPlayer = piece.player;
  const alreadyFinished = newState.finishedPlayers.some((fp) => fp.player === movingPlayer);
  if (!alreadyFinished && hasPlayerWon(newState, movingPlayer)) {
    newState.finishedPlayers.push({ player: movingPlayer, moveCount: newState.moveHistory.length });
    if (newState.winner === null) {
      newState.winner = movingPlayer;
    }
  }

  // Advance to next player, skipping finished players
  const finishedSet = new Set(newState.finishedPlayers.map((fp) => fp.player));
  const currentIndex = newState.activePlayers.indexOf(state.currentPlayer);
  const numPlayers = newState.activePlayers.length;

  let nextIndex = (currentIndex + 1) % numPlayers;
  for (let i = 0; i < numPlayers; i++) {
    if (!finishedSet.has(newState.activePlayers[nextIndex])) break;
    nextIndex = (nextIndex + 1) % numPlayers;
  }
  newState.currentPlayer = newState.activePlayers[nextIndex];

  // Increment turn number when we wrap past the start
  if (nextIndex <= currentIndex) {
    newState.turnNumber++;
  }

  return newState;
}

// Move a piece on the board WITHOUT advancing the turn.
// Used during chain hops where the turn only advances on confirmation.
export function movePiece(state: GameState, move: Move): GameState {
  const newState = cloneGameState(state);
  const fromKey = coordKey(move.from);
  const toKey = coordKey(move.to);

  const piece = state.board.get(fromKey);
  if (!piece || piece.type !== 'piece') {
    throw new Error('No piece at move origin');
  }

  if (move.isSwap) {
    const displaced = state.board.get(toKey);
    newState.board.set(fromKey, displaced && displaced.type === 'piece' ? displaced : { type: 'empty' });
  } else {
    newState.board.set(fromKey, { type: 'empty' });
  }
  newState.board.set(toKey, piece);
  // Store move with player info for history tracking
  newState.moveHistory.push({ ...move, player: piece.player });

  // Check if the current player just finished
  const player = piece.player;
  const alreadyFinished = newState.finishedPlayers.some((fp) => fp.player === player);
  if (!alreadyFinished && hasPlayerWon(newState, player)) {
    newState.finishedPlayers.push({ player, moveCount: newState.moveHistory.length });
    if (newState.winner === null) {
      newState.winner = player;
    }
  }

  return newState;
}

// Advance the turn to the next player, skipping players who have finished
export function advanceTurn(state: GameState): GameState {
  const newState = cloneGameState(state);
  const finishedSet = new Set(newState.finishedPlayers.map((fp) => fp.player));
  const currentIndex = newState.activePlayers.indexOf(state.currentPlayer);
  const numPlayers = newState.activePlayers.length;

  let nextIndex = (currentIndex + 1) % numPlayers;
  // Skip finished players (loop at most once around)
  for (let i = 0; i < numPlayers; i++) {
    if (!finishedSet.has(newState.activePlayers[nextIndex])) break;
    nextIndex = (nextIndex + 1) % numPlayers;
  }

  newState.currentPlayer = newState.activePlayers[nextIndex];

  // Increment turn number when we wrap past the start
  if (nextIndex <= currentIndex) {
    newState.turnNumber++;
  }

  return newState;
}

// Undo the last move, returning a new state
export function undoMove(state: GameState): GameState | null {
  if (state.moveHistory.length === 0) {
    return null;
  }

  const newState = cloneGameState(state);
  const lastMove = newState.moveHistory.pop()!;

  // Get the piece at the destination
  const piece = state.board.get(coordKey(lastMove.to));
  if (!piece || piece.type !== 'piece') {
    throw new Error('No piece at move destination');
  }

  // Move piece back (swap: restore displaced opponent to `to`)
  if (lastMove.isSwap) {
    const displaced = state.board.get(coordKey(lastMove.from));
    newState.board.set(coordKey(lastMove.to), displaced && displaced.type === 'piece' ? displaced : { type: 'empty' });
  } else {
    newState.board.set(coordKey(lastMove.to), { type: 'empty' });
  }
  newState.board.set(coordKey(lastMove.from), piece);

  // Revert current player to the one who made this move
  newState.currentPlayer = piece.player;

  // Remove the player from finishedPlayers if they were just added
  newState.finishedPlayers = newState.finishedPlayers.filter(
    (fp) => fp.player !== piece.player || hasPlayerWon(newState, piece.player)
  );

  // Clear winner if no one has finished
  if (newState.finishedPlayers.length === 0) {
    newState.winner = null;
  }

  // Adjust turn number if needed
  const currentIndex = newState.activePlayers.indexOf(piece.player);
  if (currentIndex === 0 && newState.turnNumber > 1) {
    newState.turnNumber--;
  }

  return newState;
}

// Check if a player has won (all pieces in goal triangle)
export function checkWinner(state: GameState): PlayerIndex | null {
  for (const player of state.activePlayers) {
    if (hasPlayerWon(state, player)) {
      return player;
    }
  }
  return null;
}

// Check if a specific player has won
export function hasPlayerWon(state: GameState, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const playerPieces = getPlayerPieces(state, player);

  // Player wins if all their pieces are in goal positions
  // (piece count may vary for custom layouts)
  if (playerPieces.length === 0 || goalPositions.length === 0) {
    return false;
  }

  // Check that every player piece is in a goal position
  for (const piece of playerPieces) {
    const isInGoal = goalPositions.some((goalPos) =>
      cubeEquals(piece, goalPos)
    );
    if (!isInGoal) {
      return false;
    }
  }

  return true;
}

// Get the goal positions for a player (opposite player's starting area)
// For standard layouts only - use getGoalPositionsForState for custom layout support
export function getGoalPositions(player: PlayerIndex): CubeCoord[] {
  const oppositePlayer = OPPOSITE_PLAYER[player];
  const positions = getDefaultStartingPositions(oppositePlayer);
  return positions.map(parseCoordKey);
}

// Get the goal positions for a player, supporting custom layouts
export function getGoalPositionsForState(state: GameState, player: PlayerIndex): CubeCoord[] {
  if (state.isCustomLayout && state.customGoalPositions?.[player]) {
    return state.customGoalPositions[player]!.map(parseCoordKey);
  }
  return getGoalPositions(player);
}

// Get the home/starting positions for a player
// For standard layouts only - use getHomePositionsForState for custom layout support
export function getHomePositions(player: PlayerIndex): CubeCoord[] {
  const positions = getDefaultStartingPositions(player);
  return positions.map(parseCoordKey);
}

// Get the home/starting positions for a player, supporting custom layouts
export function getHomePositionsForState(state: GameState, player: PlayerIndex): CubeCoord[] {
  if (state.isCustomLayout && state.startingPositions?.[player]) {
    return state.startingPositions[player]!.map(parseCoordKey);
  }
  return getHomePositions(player);
}

// Count how many pieces a player has in their goal triangle
export function countPiecesInGoal(
  state: GameState,
  player: PlayerIndex
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  let count = 0;

  for (const pos of goalPositions) {
    const content = state.board.get(coordKey(pos));
    if (content?.type === 'piece' && content.player === player) {
      count++;
    }
  }

  return count;
}

// Get current player
export function getCurrentPlayer(state: GameState): PlayerIndex {
  return state.currentPlayer;
}

// Check if game is fully over (all players have finished)
export function isGameFullyOver(state: GameState): boolean {
  return state.finishedPlayers.length >= state.activePlayers.length;
}

// Check if game is over (kept for backward compatibility)
export function isGameOver(state: GameState): boolean {
  return state.winner !== null;
}
