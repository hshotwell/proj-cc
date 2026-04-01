'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIPersonality } from '@/types/ai';
import type { PieceVariant } from '@/types/game';
import type { OpeningMove } from '@/game/ai/openingBook';
import { OPENING_LINES } from '@/game/ai/openingBook';

export interface CustomOpening {
  id: string;
  name: string;
  description?: string;
  moves: OpeningMove[]; // player-0 canonical coords
  gameMode?: PieceVariant; // which piece mode this opening is for (default 'normal')
  createdAt: number;
}

export const DEFAULT_PERSONALITY_OPENINGS: Record<AIPersonality, string | null> = {
  generalist: 'balanced',
  aggressive: 'right',
  defensive: 'left',
};

interface OpeningStore {
  customOpenings: CustomOpening[];
  personalityOpenings: Record<AIPersonality, string | null>;
  playerOpeningId: string | null;
  addOpening: (opening: Omit<CustomOpening, 'id' | 'createdAt'>) => CustomOpening;
  updateOpening: (id: string, updates: Partial<Omit<CustomOpening, 'id' | 'createdAt'>>) => void;
  deleteOpening: (id: string) => void;
  setPersonalityOpening: (personality: AIPersonality, openingId: string | null) => void;
  setPlayerOpeningId: (id: string | null) => void;
}

export const useOpeningStore = create<OpeningStore>()(
  persist(
    (set) => ({
      customOpenings: [],
      personalityOpenings: { ...DEFAULT_PERSONALITY_OPENINGS },
      playerOpeningId: null,

      addOpening: (opening) => {
        const newOpening: CustomOpening = {
          ...opening,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({ customOpenings: [...state.customOpenings, newOpening] }));
        return newOpening;
      },

      updateOpening: (id, updates) => {
        set((state) => ({
          customOpenings: state.customOpenings.map((o) =>
            o.id === id ? { ...o, ...updates } : o
          ),
        }));
      },

      deleteOpening: (id) => {
        set((state) => ({
          customOpenings: state.customOpenings.filter((o) => o.id !== id),
          // Clear personality assignments that referenced this opening
          personalityOpenings: Object.fromEntries(
            Object.entries(state.personalityOpenings).map(([p, oid]) => [
              p,
              oid === id ? null : oid,
            ])
          ) as Record<AIPersonality, string | null>,
          // Clear player's favored opening if it referenced this one
          playerOpeningId: state.playerOpeningId === id ? null : state.playerOpeningId,
        }));
      },

      setPlayerOpeningId: (id) => set({ playerOpeningId: id }),

      setPersonalityOpening: (personality, openingId) => {
        set((state) => ({
          personalityOpenings: {
            ...state.personalityOpenings,
            [personality]: openingId,
          },
        }));
      },
    }),
    {
      name: 'chinese-checkers-openings',
    }
  )
);

/**
 * Get the opening ID assigned to a personality.
 * Returns the stored value or the default if not set.
 * Main-thread only (reads from Zustand store).
 */
export function readPersonalityOpening(personality: AIPersonality): string | null {
  try {
    const state = useOpeningStore.getState();
    const id = state.personalityOpenings[personality];
    return id !== undefined ? id : DEFAULT_PERSONALITY_OPENINGS[personality];
  } catch {
    return DEFAULT_PERSONALITY_OPENINGS[personality];
  }
}

/**
 * Get moves for a custom opening by ID.
 * Returns null if not found.
 * Main-thread only (reads from Zustand store).
 */
export function readCustomOpeningMoves(id: string): OpeningMove[] | null {
  // Built-in ids handled by caller via OPENING_LINES
  const builtin = OPENING_LINES.find((l) => l.id === id);
  if (builtin) return builtin.moves;

  try {
    const state = useOpeningStore.getState();
    const opening = state.customOpenings.find((o) => o.id === id);
    return opening?.moves ?? null;
  } catch {
    return null;
  }
}
