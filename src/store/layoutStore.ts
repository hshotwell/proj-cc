'use client';

import { create } from 'zustand';
import type { BoardLayout, PlayerIndex } from '@/types/game';

const STORAGE_KEY = 'chinese-checkers-layouts';
const DEFAULT_LAYOUT_ID = 'default-standard';

interface LayoutStore {
  layouts: BoardLayout[];
  currentLayoutId: string | null;

  // Actions
  loadLayouts: () => void;
  saveLayout: (layout: BoardLayout) => void;
  deleteLayout: (id: string) => void;
  getLayout: (id: string) => BoardLayout | undefined;
  setCurrentLayout: (id: string | null) => void;
  getDefaultLayout: () => BoardLayout | undefined;
  setAsDefault: (id: string) => void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layouts: [],
  currentLayoutId: null,

  loadLayouts: () => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const layouts = JSON.parse(stored) as BoardLayout[];
        set({ layouts });
      }
    } catch (e) {
      console.error('Failed to load layouts:', e);
    }
  },

  saveLayout: (layout: BoardLayout) => {
    const { layouts } = get();
    const existingIndex = layouts.findIndex(l => l.id === layout.id);

    let newLayouts: BoardLayout[];
    if (existingIndex >= 0) {
      newLayouts = [...layouts];
      newLayouts[existingIndex] = layout;
    } else {
      newLayouts = [...layouts, layout];
    }

    set({ layouts: newLayouts });

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
    }
  },

  deleteLayout: (id: string) => {
    const { layouts } = get();
    const newLayouts = layouts.filter(l => l.id !== id);
    set({ layouts: newLayouts });

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
    }
  },

  getLayout: (id: string) => {
    const { layouts } = get();
    return layouts.find(l => l.id === id);
  },

  setCurrentLayout: (id: string | null) => {
    set({ currentLayoutId: id });
  },

  getDefaultLayout: () => {
    const { layouts } = get();
    return layouts.find(l => l.isDefault) || layouts.find(l => l.id === DEFAULT_LAYOUT_ID);
  },

  setAsDefault: (id: string) => {
    const { layouts } = get();
    const newLayouts = layouts.map(l => ({
      ...l,
      isDefault: l.id === id,
    }));
    set({ layouts: newLayouts });

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
    }
  },
}));
