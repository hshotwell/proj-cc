'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FlaggedMove } from '@/types/review';

interface ReviewStore {
  isPaused: boolean;
  flags: FlaggedMove[];
  togglePause: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  clearFlags: () => void;
  exportText: () => string;
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      isPaused: false,
      flags: [],

      togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

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
      name: 'chinese-checkers-review',
      partialize: (s) => ({ flags: s.flags }),
    }
  )
);
