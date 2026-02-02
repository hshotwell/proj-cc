'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  // Show all possible moves (including chain jumps) vs only immediate moves
  showAllMoves: boolean;
  // Animate pieces sliding along their path
  animateMoves: boolean;
  // Rotate board so active player's home triangle faces the bottom
  rotateBoard: boolean;

  // Actions
  setShowAllMoves: (value: boolean) => void;
  setAnimateMoves: (value: boolean) => void;
  toggleShowAllMoves: () => void;
  toggleAnimateMoves: () => void;
  toggleRotateBoard: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      showAllMoves: true,
      animateMoves: false,
      rotateBoard: true,

      setShowAllMoves: (value) => set({ showAllMoves: value }),
      setAnimateMoves: (value) => set({ animateMoves: value }),
      toggleShowAllMoves: () => set((state) => ({ showAllMoves: !state.showAllMoves })),
      toggleAnimateMoves: () => set((state) => ({ animateMoves: !state.animateMoves })),
      toggleRotateBoard: () => set((state) => ({ rotateBoard: !state.rotateBoard })),
    }),
    {
      name: 'chinese-checkers-settings',
    }
  )
);
