'use client';

import { create } from 'zustand';
import type { CubeCoord, Move, GameState, PlayerCount, PlayerIndex, BoardLayout, ColorMapping, PlayerNameMapping } from '@/types/game';
import type { AIPlayerMap } from '@/types/ai';
import { createGame, createGameFromLayout } from '@/game/setup';
import { getValidMoves } from '@/game/moves';
import { movePiece, advanceTurn, isGameFullyOver, undoMove } from '@/game/state';
import { coordKey, cubeEquals, getMovePath } from '@/game/coordinates';
import { MOVE_ANIMATION_DURATION } from '@/game/constants';
import { recordBoardState, clearStateHistory } from '@/game/ai/search';
import { clearPathfindingCache } from '@/game/pathfinding';
import { extractGamePatterns, createGameSummary, learnFromGame, clearWeightsCache } from '@/game/learning';
import { useSettingsStore } from './settingsStore';

interface GameStore {
  // State
  gameState: GameState | null;
  selectedPiece: CubeCoord | null;
  validMovesForSelected: Move[];
  gameId: string | null;
  // Pending move state - move made but not yet confirmed
  pendingConfirmation: boolean;
  stateBeforeMove: GameState | null;
  lastMoveInfo: { origin: CubeCoord; destination: CubeCoord; player: PlayerIndex; } | null;
  // Original position of piece at start of turn (for undo by clicking)
  originalPiecePosition: CubeCoord | null;
  // Animation state
  animatingPiece: CubeCoord | null; // The piece being animated (at its final position)
  animationPath: CubeCoord[] | null; // The full path for animation
  animationStep: number; // Current step in the animation (0 = at start)
  // Online: signals that a turn was just confirmed and needs server submission
  pendingServerSubmission: boolean;
  // Online: animation is playing and submission should happen after it finishes
  pendingAnimationSubmission: boolean;

  // Actions
  startGame: (playerCount: PlayerCount, selectedPlayers?: PlayerIndex[], playerColors?: ColorMapping, aiPlayers?: AIPlayerMap, playerNames?: PlayerNameMapping, teamMode?: boolean) => string;
  startGameFromLayout: (layout: BoardLayout, playerColors?: ColorMapping, aiPlayers?: AIPlayerMap, playerNames?: PlayerNameMapping, teamMode?: boolean) => string;
  selectPiece: (coord: CubeCoord) => void;
  makeMove: (to: CubeCoord, animate?: boolean) => boolean;
  clearSelection: () => void;
  confirmMove: () => void;
  undoLastMove: () => boolean;
  undoConfirmedMove: () => boolean;
  canUndoConfirmedMove: () => boolean;
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
  lastMoveInfo: null,
  originalPiecePosition: null,
  animatingPiece: null,
  animationPath: null,
  animationStep: 0,
  pendingServerSubmission: false,
  pendingAnimationSubmission: false,

  // Start a new game with the specified number of players
  startGame: (playerCount: PlayerCount, selectedPlayers?: PlayerIndex[], playerColors?: ColorMapping, aiPlayers?: AIPlayerMap, playerNames?: PlayerNameMapping, teamMode?: boolean) => {
    const gameState = createGame(playerCount, selectedPlayers, playerColors, aiPlayers, playerNames, teamMode);
    const gameId = generateGameId();
    // Clear AI tracking state for new game
    clearStateHistory();
    clearPathfindingCache();
    // Record initial state
    recordBoardState(gameState);
    set({
      gameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveInfo: null,
      originalPiecePosition: null,
    });
    return gameId;
  },

  // Start a game from a custom board layout
  startGameFromLayout: (layout: BoardLayout, playerColors?: ColorMapping, aiPlayers?: AIPlayerMap, playerNames?: PlayerNameMapping, teamMode?: boolean) => {
    const gameState = createGameFromLayout(layout, playerColors, aiPlayers, playerNames, teamMode);
    const gameId = generateGameId();
    // Clear AI tracking state for new game
    clearStateHistory();
    clearPathfindingCache();
    // Record initial state
    recordBoardState(gameState);
    set({
      gameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveInfo: null,
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

    // Check auto-confirm setting BEFORE setting state
    const { autoConfirm } = useSettingsStore.getState();

    if (autoConfirm) {
      // In auto-confirm mode, skip the pending state entirely and confirm immediately
      // Record the move info BEFORE advancing turn
      const confirmedMoveInfo = { origin: originalPiecePosition, destination: to, player: newState.currentPlayer };

      // Advance turn immediately
      const finalState = advanceTurn(newState);

      // Record this state for AI loop detection
      recordBoardState(finalState);

      // Check if game just ended - if so, learn from it
      const { gameId } = get();
      if (isGameFullyOver(finalState) && gameId) {
        try {
          const patterns = extractGamePatterns(finalState, gameId);
          const summary = createGameSummary(patterns);
          learnFromGame(summary);
          clearWeightsCache();
          console.log('[Learning] Learned from completed game:', gameId, 'Quality:', summary.qualityScore.toFixed(2));
        } catch (e) {
          console.error('[Learning] Failed to learn from game:', e);
        }
      }

      const isAnimatingMove = animate && path && path.length > 1;
      set({
        gameState: finalState,
        selectedPiece: null,
        validMovesForSelected: [],
        pendingConfirmation: false,
        stateBeforeMove: null,
        originalPiecePosition: null,
        lastMoveInfo: confirmedMoveInfo,
        animatingPiece: isAnimatingMove ? to : null,
        animationPath: path,
        animationStep: 0,
        // Delay server submission until animation finishes
        pendingServerSubmission: !isAnimatingMove,
        pendingAnimationSubmission: !!isAnimatingMove,
      });
    } else {
      // Normal mode - set pending confirmation state
      set({
        gameState: newState,
        selectedPiece: to,
        validMovesForSelected: newValidMoves,
        pendingConfirmation: true,
        stateBeforeMove,
        // Don't update lastMoveInfo here - keep showing previous player's last move until this turn is confirmed
        originalPiecePosition,
        animatingPiece: animate && path && path.length > 1 ? to : null,
        animationPath: path,
        animationStep: 0,
      });
    }

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
    const { gameState, selectedPiece, originalPiecePosition, gameId } = get();
    if (!gameState) return;

    // Record the just-confirmed move info BEFORE advancing turn
    const confirmedMoveInfo = selectedPiece && originalPiecePosition
      ? { origin: originalPiecePosition, destination: selectedPiece, player: gameState.currentPlayer }
      : null;

    // Advance turn to the next player
    const newState = advanceTurn(gameState);

    // Record this state for AI loop detection
    recordBoardState(newState);

    // Check if game just ended - if so, learn from it
    if (isGameFullyOver(newState) && gameId) {
      try {
        const patterns = extractGamePatterns(newState, gameId);
        const summary = createGameSummary(patterns);
        learnFromGame(summary);
        clearWeightsCache(); // Refresh cached weights
        console.log('[Learning] Learned from completed game:', gameId, 'Quality:', summary.qualityScore.toFixed(2));
      } catch (e) {
        console.error('[Learning] Failed to learn from game:', e);
      }
    }

    set({
      gameState: newState,
      pendingConfirmation: false,
      stateBeforeMove: null,
      selectedPiece: null,
      validMovesForSelected: [],
      lastMoveInfo: confirmedMoveInfo, // Record the just-confirmed move
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
      pendingServerSubmission: true,
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
      lastMoveInfo: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
    return true;
  },

  // Check if we can undo a confirmed move (only when one player remains)
  canUndoConfirmedMove: () => {
    const { gameState, pendingConfirmation } = get();
    if (!gameState || pendingConfirmation) return false;

    // Only allow when exactly one player hasn't finished
    const remainingPlayers = gameState.activePlayers.filter(
      (p) => !gameState.finishedPlayers.some((fp) => fp.player === p)
    );
    if (remainingPlayers.length !== 1) return false;

    // Check we have moves to undo
    if (gameState.moveHistory.length === 0) return false;

    // Find the move count when second-to-last player finished
    // (we can't undo past that point)
    const sortedFinished = [...gameState.finishedPlayers].sort(
      (a, b) => b.moveCount - a.moveCount
    );
    const lastFinishedMoveCount = sortedFinished[0]?.moveCount ?? 0;

    // Can only undo if we have moves after the last player finished
    return gameState.moveHistory.length > lastFinishedMoveCount;
  },

  // Undo a confirmed move (for last remaining player)
  undoConfirmedMove: () => {
    const { gameState } = get();
    if (!get().canUndoConfirmedMove() || !gameState) return false;

    const newState = undoMove(gameState);
    if (!newState) return false;

    set({
      gameState: newState,
      selectedPiece: null,
      validMovesForSelected: [],
      lastMoveInfo: null,
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
      gameState.aiPlayers,
      gameState.playerNames,
      gameState.teamMode
    );
    const gameId = generateGameId();
    // Clear AI tracking state for new game
    clearStateHistory();
    clearPathfindingCache();
    recordBoardState(newGameState);
    set({
      gameState: newGameState,
      gameId,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveInfo: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
  },

  // Load an existing game (for future multiplayer support)
  loadGame: (gameId: string, state: GameState) => {
    // Clear AI tracking state when loading a game
    clearStateHistory();
    clearPathfindingCache();
    recordBoardState(state);
    set({
      gameId,
      gameState: state,
      selectedPiece: null,
      validMovesForSelected: [],
      pendingConfirmation: false,
      stateBeforeMove: null,
      lastMoveInfo: null,
      originalPiecePosition: null,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
      pendingServerSubmission: false,
      pendingAnimationSubmission: false,
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
    const { pendingAnimationSubmission } = get();
    set({
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
      // If auto-confirm was waiting for animation, trigger submission now
      ...(pendingAnimationSubmission ? {
        pendingServerSubmission: true,
        pendingAnimationSubmission: false,
      } : {}),
    });
  },
}));
