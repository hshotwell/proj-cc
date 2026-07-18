'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { FlaggedMove, FlaggedHexMove } from '@/types/review';

interface AIReviewStore {
  captureMode: null | 'from' | 'to';
  captureFrom: CubeCoord | null;
  captureTo: CubeCoord | null;
  flags: FlaggedMove[];
  hexFlags: FlaggedHexMove[];
  activeGameId: string | null;

  startCapture: () => void;
  captureCell: (coord: CubeCoord) => void;
  cancelCapture: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  updateFlag: (id: string, patch: Partial<Pick<FlaggedMove, 'suggestedMove' | 'note'>>) => void;
  clearFlags: () => void;
  setActiveGameId: (id: string | null) => void;
  exportText: (gameId?: string) => string;
  addHexFlag: (flag: Omit<FlaggedHexMove, 'id' | 'timestamp'>) => void;
  removeHexFlag: (id: string) => void;
  updateHexFlag: (id: string, patch: Partial<Pick<FlaggedHexMove, 'suggestedMove' | 'note'>>) => void;
  exportHexText: (gameId?: string) => string;
}

export const useAIReviewStore = create<AIReviewStore>()(
  persist(
    (set, get) => ({
      captureMode: null,
      captureFrom: null,
      captureTo: null,
      flags: [],
      hexFlags: [],
      activeGameId: null,

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

      updateFlag: (id, patch) =>
        set((s) => ({
          flags: s.flags.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      clearFlags: () => set({ flags: [] }),

      setActiveGameId: (id) => set({ activeGameId: id }),

      exportText: (gameId?: string) => {
        const { flags } = get();
        const filtered = gameId ? flags.filter((f) => f.gameId === gameId) : flags;
        if (filtered.length === 0) return '(no flags recorded)';
        const lines: string[] = [
          '=== MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${filtered.length}`,
          '',
        ];
        for (let i = 0; i < filtered.length; i++) {
          const f = filtered[i];
          const from = `(${f.actualMove.from.q},${f.actualMove.from.r})`;
          const to = `(${f.actualMove.to.q},${f.actualMove.to.r})`;
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Player ${f.player}${f.difficulty && f.personality ? ` | ${f.difficulty}/${f.personality}` : ''} | ${f.piecesInGoal}/10 in goal`);
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

      addHexFlag: (flag) =>
        set((s) => ({
          hexFlags: [...s.hexFlags, { ...flag, id: crypto.randomUUID(), timestamp: Date.now() }],
        })),

      removeHexFlag: (id) =>
        set((s) => ({ hexFlags: s.hexFlags.filter((f) => f.id !== id) })),

      updateHexFlag: (id, patch) =>
        set((s) => ({
          hexFlags: s.hexFlags.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      exportHexText: (gameId?: string) => {
        const { hexFlags } = get();
        const filtered = gameId ? hexFlags.filter((f) => f.gameId === gameId) : hexFlags;
        if (filtered.length === 0) return '(no flags recorded)';
        const lines: string[] = [
          '=== HEX CHESS MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${filtered.length}`,
          '',
        ];
        for (let i = 0; i < filtered.length; i++) {
          const f = filtered[i];
          const cap = f.actualMove.capture ? ` x ${f.actualMove.capture}` : '';
          const promo = f.actualMove.promotion ? ` =${f.actualMove.promotion}` : '';
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Seat ${f.seat}${f.difficulty ? ` | ${f.difficulty} AI` : ''}`);
          lines.push(`Actual move:   ${f.actualMove.pieceType} (${f.actualMove.from.q},${f.actualMove.from.r}) → (${f.actualMove.to.q},${f.actualMove.to.r})${cap}${promo}`);
          if (f.suggestedMove) {
            lines.push(`Suggested:     (${f.suggestedMove.from.q},${f.suggestedMove.from.r}) → (${f.suggestedMove.to.q},${f.suggestedMove.to.r})`);
          }
          if (f.note) lines.push(`Note:          ${f.note}`);
          lines.push('Board after move:');
          for (const [cell, piece] of Object.entries(f.boardAfter.pieces)) {
            lines.push(`  (${cell}): P${piece.player} ${piece.type}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      },
    }),
    {
      name: 'chinese-checkers-ai-review',
      partialize: (s) => ({ flags: s.flags, hexFlags: s.hexFlags }),
    }
  )
);
