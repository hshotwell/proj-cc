'use client';

import { create } from 'zustand';
import type { GameState, Move } from '@/types/game';
import type { SavedGameSummary } from '@/types/replay';
import { loadSavedGame } from '@/game/persistence';
import { normalizeMoveHistory, reconstructGameStates, findLongestHop } from '@/game/replay';

interface ReplayStore {
  // State
  isReplayActive: boolean;
  states: GameState[];
  moves: Move[];
  currentStep: number;
  displayState: GameState | null;
  longestHopIndex: number | null;
  longestHopLength: number;
  gameSummary: SavedGameSummary | null;

  // Actions
  loadReplay: (gameId: string) => boolean;
  loadReplayFromState: (state: GameState, gameId: string) => void;
  stepForward: () => void;
  stepBackward: () => void;
  goToStep: (n: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  closeReplay: () => void;
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  isReplayActive: false,
  states: [],
  moves: [],
  currentStep: 0,
  displayState: null,
  longestHopIndex: null,
  longestHopLength: 0,
  gameSummary: null,

  loadReplay: (gameId: string) => {
    const savedGame = loadSavedGame(gameId);
    if (!savedGame) return false;

    const states = reconstructGameStates(savedGame);
    const moves = savedGame.moves;
    const hop = findLongestHop(moves);

    // turnNumber from final state is incremented after the last move, so subtract 1
    const finalTurnNumber = states[states.length - 1]?.turnNumber ?? 1;
    const summary: SavedGameSummary = {
      id: savedGame.id,
      dateSaved: savedGame.dateSaved,
      playerCount: savedGame.initialConfig.playerCount,
      activePlayers: savedGame.initialConfig.activePlayers,
      winner: savedGame.finishedPlayers[0]?.player ?? savedGame.initialConfig.activePlayers[0],
      totalMoves: moves.length,
      totalTurns: Math.max(1, finalTurnNumber - 1),
      longestHop: hop?.jumpLength ?? 0,
      playerColors: savedGame.initialConfig.playerColors,
      aiPlayers: savedGame.initialConfig.aiPlayers,
      ...(savedGame.initialConfig.teamMode ? { teamMode: true } : {}),
    };

    set({
      isReplayActive: true,
      states,
      moves,
      currentStep: 0,
      displayState: states[0],
      longestHopIndex: hop?.moveIndex ?? null,
      longestHopLength: hop?.jumpLength ?? 0,
      gameSummary: summary,
    });

    return true;
  },

  loadReplayFromState: (finalState: GameState, gameId: string) => {
    const normalizedMoves = normalizeMoveHistory(finalState.moveHistory, finalState.activePlayers);
    const hop = findLongestHop(normalizedMoves);

    // Build custom layout data if this is a custom board
    const customLayoutData = finalState.isCustomLayout ? {
      isCustomLayout: true,
      customCells: Array.from(finalState.board.keys()),
      customStartingPositions: finalState.startingPositions,
      customGoalPositions: finalState.customGoalPositions,
      customWalls: Array.from(finalState.board.entries())
        .filter(([_, content]) => content.type === 'wall')
        .map(([key]) => key),
    } : {};

    // Build a SavedGameData-like structure for reconstruction
    const savedGame = {
      id: gameId,
      initialConfig: {
        playerCount: finalState.playerCount,
        activePlayers: finalState.activePlayers,
        playerColors: finalState.playerColors,
        aiPlayers: finalState.aiPlayers,
        ...customLayoutData,
        ...(finalState.teamMode ? { teamMode: true } : {}),
      },
      moves: normalizedMoves,
      finishedPlayers: finalState.finishedPlayers,
      dateSaved: Date.now(),
    };

    const states = reconstructGameStates(savedGame);

    const summary: SavedGameSummary = {
      id: gameId,
      dateSaved: savedGame.dateSaved,
      playerCount: finalState.playerCount,
      activePlayers: [...finalState.activePlayers],
      winner: finalState.winner ?? finalState.finishedPlayers[0]?.player ?? finalState.activePlayers[0],
      totalMoves: normalizedMoves.length,
      // turnNumber is incremented after the final move, so subtract 1 for actual turns played
      totalTurns: Math.max(1, finalState.turnNumber - 1),
      longestHop: hop?.jumpLength ?? 0,
      playerColors: finalState.playerColors,
      aiPlayers: finalState.aiPlayers,
      ...(finalState.teamMode ? { teamMode: true } : {}),
    };

    set({
      isReplayActive: true,
      states,
      moves: normalizedMoves,
      currentStep: 0,
      displayState: states[0],
      longestHopIndex: hop?.moveIndex ?? null,
      longestHopLength: hop?.jumpLength ?? 0,
      gameSummary: summary,
    });
  },

  stepForward: () => {
    const { currentStep, moves, states } = get();
    if (currentStep >= moves.length) return;
    const next = currentStep + 1;
    set({ currentStep: next, displayState: states[next] });
  },

  stepBackward: () => {
    const { currentStep, states } = get();
    if (currentStep <= 0) return;
    const prev = currentStep - 1;
    set({ currentStep: prev, displayState: states[prev] });
  },

  goToStep: (n: number) => {
    const { moves, states } = get();
    const clamped = Math.max(0, Math.min(n, moves.length));
    set({ currentStep: clamped, displayState: states[clamped] });
  },

  goToStart: () => {
    const { states } = get();
    set({ currentStep: 0, displayState: states[0] });
  },

  goToEnd: () => {
    const { moves, states } = get();
    set({ currentStep: moves.length, displayState: states[moves.length] });
  },

  closeReplay: () => {
    set({
      isReplayActive: false,
      states: [],
      moves: [],
      currentStep: 0,
      displayState: null,
      longestHopIndex: null,
      longestHopLength: 0,
      gameSummary: null,
    });
  },
}));
