'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  // Settings menu visibility (not persisted)
  settingsMenuOpen: boolean;

  // Show all possible moves (including chain jumps) vs only immediate moves
  showAllMoves: boolean;
  // Animate pieces sliding along their path
  animateMoves: boolean;
  // Rotate board so active player's home triangle faces the bottom
  rotateBoard: boolean;
  // Show grid lines on triangles between cells
  showTriangleLines: boolean;
  // Show the last move path for each player
  showLastMoves: boolean;
  // Show cell coordinates on hover (for debugging)
  showCoordinates: boolean;
  // Automatically confirm moves without the undo/confirm step
  autoConfirm: boolean;
  // Show player progress (pieces in goal, percent) for current player
  showPlayerProgress: boolean;

  // Actions
  openSettingsMenu: () => void;
  closeSettingsMenu: () => void;
  toggleSettingsMenu: () => void;
  setShowAllMoves: (value: boolean) => void;
  setAnimateMoves: (value: boolean) => void;
  toggleShowAllMoves: () => void;
  toggleAnimateMoves: () => void;
  toggleRotateBoard: () => void;
  toggleTriangleLines: () => void;
  toggleShowLastMoves: () => void;
  toggleShowCoordinates: () => void;
  toggleAutoConfirm: () => void;
  toggleShowPlayerProgress: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Not persisted (reset on page load)
      settingsMenuOpen: false,

      showAllMoves: true,
      animateMoves: false,
      rotateBoard: true,
      showTriangleLines: true,
      showLastMoves: false,
      showCoordinates: false,
      autoConfirm: false,
      showPlayerProgress: false,

      openSettingsMenu: () => set({ settingsMenuOpen: true }),
      closeSettingsMenu: () => set({ settingsMenuOpen: false }),
      toggleSettingsMenu: () => set((state) => ({ settingsMenuOpen: !state.settingsMenuOpen })),
      setShowAllMoves: (value) => set({ showAllMoves: value }),
      setAnimateMoves: (value) => set({ animateMoves: value }),
      toggleShowAllMoves: () => set((state) => ({ showAllMoves: !state.showAllMoves })),
      toggleAnimateMoves: () => set((state) => ({ animateMoves: !state.animateMoves })),
      toggleRotateBoard: () => set((state) => ({ rotateBoard: !state.rotateBoard })),
      toggleTriangleLines: () => set((state) => ({ showTriangleLines: !state.showTriangleLines })),
      toggleShowLastMoves: () => set((state) => ({ showLastMoves: !state.showLastMoves })),
      toggleShowCoordinates: () => set((state) => ({ showCoordinates: !state.showCoordinates })),
      toggleAutoConfirm: () => set((state) => ({ autoConfirm: !state.autoConfirm })),
      toggleShowPlayerProgress: () => set((state) => ({ showPlayerProgress: !state.showPlayerProgress })),
    }),
    {
      name: 'chinese-checkers-settings',
      partialize: (state) => ({
        // Only persist these settings, not settingsMenuOpen
        showAllMoves: state.showAllMoves,
        animateMoves: state.animateMoves,
        rotateBoard: state.rotateBoard,
        showTriangleLines: state.showTriangleLines,
        showLastMoves: state.showLastMoves,
        showCoordinates: state.showCoordinates,
        autoConfirm: state.autoConfirm,
        showPlayerProgress: state.showPlayerProgress,
      }),
    }
  )
);
