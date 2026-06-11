'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, CubeCoord, PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

export type CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>;

interface AIReviewStore {
  isPaused: boolean;
  stateHistory: GameState[];
  pendingFlag: CapturedAIMove | null;
  captureMode: null | 'from' | 'to';
  captureFrom: CubeCoord | null;
  captureTo: CubeCoord | null;
  flags: FlaggedMove[];
  rewindSignal: number;

  togglePause: () => void;
  pushHistory: (state: GameState) => void;
  clearHistory: () => void;
  popHistory: () => GameState | null;
  setPendingFlag: (flag: CapturedAIMove | null) => void;
  startCapture: () => void;
  captureCell: (coord: CubeCoord) => void;
  cancelCapture: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  clearFlags: () => void;
  exportText: () => string;
}

export const useAIReviewStore = create<AIReviewStore>()(
  persist(
    (set, get) => ({
      isPaused: false,
      stateHistory: [],
      pendingFlag: null,
      captureMode: null,
      captureFrom: null,
      captureTo: null,
      flags: [],
      rewindSignal: 0,

      togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

      pushHistory: (state) =>
        set((s) => ({
          stateHistory: [...s.stateHistory, state].slice(-50),
        })),

      clearHistory: () => set({ stateHistory: [] }),

      popHistory: () => {
        const { stateHistory } = get();
        if (stateHistory.length === 0) return null;
        const prev = stateHistory[stateHistory.length - 1];
        set({ stateHistory: stateHistory.slice(0, -1), rewindSignal: get().rewindSignal + 1 });
        return prev;
      },

      setPendingFlag: (flag) =>
        set({ pendingFlag: flag, captureMode: null, captureFrom: null, captureTo: null }),

      startCapture: () => set({ captureMode: 'from', captureFrom: null, captureTo: null }),

      captureCell: (coord) => {
        const { captureMode } = get();
        if (captureMode === 'from') {
          set({ captureFrom: coord, captureMode: 'to', captureTo: null });
        } else if (captureMode === 'to') {
          set({ captureTo: coord, captureMode: null });
        }
      },

      cancelCapture: () => set({ captureMode: null, captureFrom: null, captureTo: null }),

      addFlag: (flag) => {
        const entry: FlaggedMove = {
          ...flag,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        set((s) => ({ flags: [...s.flags, entry] }));
      },

      removeFlag: (id) =>
        set((s) => ({ flags: s.flags.filter((f) => f.id !== id) })),

      clearFlags: () => set({ flags: [] }),

      exportText: () => {
        const { flags } = get();
        if (flags.length === 0) return '(no flags recorded)';
        const lines: string[] = [
          '=== AI MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${flags.length}`,
          '',
        ];
        for (let i = 0; i < flags.length; i++) {
          const f = flags[i];
          const from = `(${f.actualMove.from.q},${f.actualMove.from.r})`;
          const to = `(${f.actualMove.to.q},${f.actualMove.to.r})`;
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Player ${f.player} | ${f.difficulty}/${f.personality} | ${f.piecesInGoal}/10 in goal`);
          lines.push(`Actual move:   ${from} → ${to}`);
          if (f.suggestedMove) {
            const sf = `(${f.suggestedMove.from.q},${f.suggestedMove.from.r})`;
            const st = `(${f.suggestedMove.to.q},${f.suggestedMove.to.r})`;
            lines.push(`Suggested:     ${sf} → ${st}`);
          }
          if (f.note) lines.push(`Note:          ${f.note}`);
          lines.push('Board after move:');
          for (const [playerIdx, coords] of Object.entries(f.boardAfter.pieces)) {
            const posStr = (coords ?? []).map((c) => `(${c.q},${c.r})`).join(' ');
            lines.push(`  P${playerIdx}: ${posStr}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      },
    }),
    {
      name: 'chinese-checkers-ai-review',
      partialize: (s) => ({ flags: s.flags }),
    }
  )
);
