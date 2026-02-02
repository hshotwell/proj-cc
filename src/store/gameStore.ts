'use client';

import { create } from 'zustand';
import type { CubeCoord, Move, GameState, PlayerCount, PlayerIndex, BoardLayout, ColorMapping } from '@/types/game';
import type { AIPlayerMap } from '@/types/ai';
import { createGame, createGameFromLayout } from '@/game/setup';
import { getValidMoves } from '@/game/moves';
import { movePiece, advanceTurn, isGameFullyOver } from '@/game/state';
import { coordKey, cubeEquals, getMovePath } from '@/game/coordinates';
import { MOVE_ANIMATION_DURATION } from '@/game/constants';

interface GameStore {
  // State
  gameState: GameState | null;
  selectedPiece: CubeCoord | null;
  validMovesForSelected: Move[];
  gameId: string | null;
  // Pending move state - move made but not yet confirmed
  pendingConfirmation: boolean;
  stateBeforeMove: GameState | null;
  lastMoveDestination: CubeCoord | null;
  // Original position of piece at start of turn (for undo by clicking)
  originalPiecePosition: CubeCoord | null;
  // Animation state
  animatingPiece: CubeCoord | null; // The piece being animated (at its final position)
  animationPath: CubeCoord[] | null; // The full path for animation
  animationStep: number; // Current step in the animation (0 = at start)

  // Actions
  startGame: (playerCount: PlayerCount, selectedPlayers?: PlayerIndex[], playerColors?: ColorMapping, aiPlayers?: AIPlayerMap) => string;
  startGameFromLayout: (layout: BoardLayout) => string;
  selectPiece: (coord: CubeCoord) => void;
  makeMove: (to: CubeCoord, animate?: boolean) => boolean;
  clearSelection: () => void;
  confirmMove: () => void;
  undoLastMove: () => boolean;
  resetGame: () => void;
  loadGame: (gameId: string, state: GameState) => void;
  advanceAnimation: () => void;
  clearAnimation: () => void;
}

// Generate a simple game ID
function generateGameId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  gameState: null,
  selectedPiece: null,
  validMovesForSelected: [],
  gameId: null,
  pendingConfirmation: false,
  stateBeforeMove: null,
  lastMoveDestination: null,
  originalPiecePosition: null,
  animatingPiece: null,
  animationPath: null,
  animationStep: 0,

  // Start a new game with the specified number of players
  startGame: (playerCount: PlayerCount, selectedPlayers?: PlayerIndex[], playerColors?: ColorMapping, aiPlayers?: AIPlayerMap) => {
    const gameState = createGame(playerCount, selectedPlayers, playerColors, aiPlayers);
    const gameId = generateGameId();
    set({
      gameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveDestination: null,
      originalPiecePosition: null,
    });
    return gameId;
  },

  // Start a game from a custom board layout
  startGameFromLayout: (layout: BoardLayout) => {
    const gameState = createGameFromLayout(layout);
    const gameId = generateGameId();
    set({
      gameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveDestination: null,
      originalPiecePosition: null,
    });
    return gameId;
  },

  // Select a piece to move
  selectPiece: (coord: CubeCoord) => {
    const { gameState, selectedPiece, pendingConfirmation } = get();
    if (!gameState || isGameFullyOver(gameState)) return;

    // If there's a pending confirmation, confirm the move first
    if (pendingConfirmation) {
      get().confirmMove();
      return;
    }

    // Check if clicking on the same piece - toggle selection off
    if (selectedPiece && cubeEquals(selectedPiece, coord)) {
      set({ selectedPiece: null, validMovesForSelected: [] });
      return;
    }

    // Check if clicking on a valid piece for the current player
    const content = gameState.board.get(coordKey(coord));
    if (
      !content ||
      content.type !== 'piece' ||
      content.player !== gameState.currentPlayer
    ) {
      // Clicked on empty cell or opponent's piece - clear selection
      set({ selectedPiece: null, validMovesForSelected: [] });
      return;
    }

    // Get valid moves for this piece
    const validMoves = getValidMoves(gameState, coord);
    set({
      selectedPiece: coord,
      validMovesForSelected: validMoves,
    });
  },

  // Make a move to the specified destination
  makeMove: (to: CubeCoord, animate?: boolean) => {
    const { gameState, selectedPiece, validMovesForSelected, pendingConfirmation, stateBeforeMove: existingStateBeforeMove, originalPiecePosition: existingOriginalPosition } = get();
    if (!gameState || !selectedPiece || isGameFullyOver(gameState)) return false;

    // Find the move in valid moves
    const move = validMovesForSelected.find((m) => cubeEquals(m.to, to));
    if (!move) return false;

    // Store state and original position before first move of this turn
    // If already pending (continuing to move same piece), keep the originals
    const stateBeforeMove = pendingConfirmation && existingStateBeforeMove
      ? existingStateBeforeMove
      : gameState;
    const originalPiecePosition = pendingConfirmation && existingOriginalPosition
      ? existingOriginalPosition
      : selectedPiece;

    // Move the piece without advancing the turn (turn advances on confirm)
    const newState = movePiece(gameState, move);

    // After a step, no further moves are possible - steps end the turn.
    // After a jump, only further jumps are valid (no single steps).
    const newValidMoves = move.isJump
      ? getValidMoves(newState, to).filter((m) => m.isJump)
      : [];

    // Calculate animation path if animation is enabled
    const path = animate ? getMovePath(selectedPiece, to, move.jumpPath) : null;

    set({
      gameState: newState,
      selectedPiece: to,
      validMovesForSelected: newValidMoves,
      pendingConfirmation: true,
      stateBeforeMove,
      lastMoveDestination: to,
      originalPiecePosition,
      animatingPiece: animate && path && path.length > 1 ? to : null,
      animationPath: path,
      animationStep: 0,
    });

    return true;
  },

  // Clear the current selection (also confirms pending move if any)
  clearSelection: () => {
    const { pendingConfirmation } = get();
    if (pendingConfirmation) {
      get().confirmMove();
      return;
    }
    set({ selectedPiece: null, validMovesForSelected: [] });
  },

  // Confirm the pending move - advances the turn
  confirmMove: () => {
    const { gameState } = get();
    if (!gameState) return;

    // Advance turn to the next player
    const newState = advanceTurn(gameState);

    set({
      gameState: newState,
      pendingConfirmation: false,
      stateBeforeMove: null,
      selectedPiece: null,
      validMovesForSelected: [],
      lastMoveDestination: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
  },

  // Undo the last move - only works during pending confirmation phase
  undoLastMove: () => {
    const { pendingConfirmation, stateBeforeMove } = get();

    // Can only undo if there's a pending move to undo
    if (!pendingConfirmation || !stateBeforeMove) {
      return false;
    }

    // Restore the state before the move
    set({
      gameState: stateBeforeMove,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveDestination: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
    return true;
  },

  // Reset the game (start over with same player count)
  resetGame: () => {
    const { gameState } = get();
    if (!gameState) return;

    const newGameState = createGame(
      gameState.playerCount,
      undefined,
      gameState.playerColors,
      gameState.aiPlayers
    );
    const gameId = generateGameId();
    set({
      gameState: newGameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveDestination: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
  },

  // Load an existing game (for future multiplayer support)
  loadGame: (gameId: string, state: GameState) => {
    set({
      gameId,
      gameState: state,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveDestination: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
  },

  // Advance the animation to the next step
  advanceAnimation: () => {
    const { animationPath, animationStep } = get();
    if (!animationPath) return;

    const nextStep = animationStep + 1;
    if (nextStep >= animationPath.length) {
      // Past the end of the path - clear animation
      set({ animatingPiece: null, animationPath: null, animationStep: 0 });
    } else {
      set({ animationStep: nextStep });
    }
  },

  // Clear animation immediately
  clearAnimation: () => {
    set({ animatingPiece: null, animationPath: null, animationStep: 0 });
  },
}));
