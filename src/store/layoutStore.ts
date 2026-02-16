'use client';

import { create } from 'zustand';
import type { BoardLayout, PlayerIndex } from '@/types/game';
import {
  localLayoutStorage,
  cloudLayoutStorage,
} from '@/services/storage';

const STORAGE_KEY = 'chinese-checkers-layouts';
const DEFAULT_LAYOUT_ID = 'default-standard';

interface LayoutStore {
  layouts: BoardLayout[];
  currentLayoutId: string | null;

  // Sync state
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;

  // Actions
  loadLayouts: () => void;
  saveLayout: (layout: BoardLayout) => void;
  deleteLayout: (id: string) => void;
  getLayout: (id: string) => BoardLayout | undefined;
  setCurrentLayout: (id: string | null) => void;
  getDefaultLayout: () => BoardLayout | undefined;
  setAsDefault: (id: string) => void;

  // Sync actions
  syncFromCloud: () => Promise<void>;
  syncToCloud: (layout: BoardLayout) => Promise<void>;
  deleteFromCloud: (id: string) => Promise<void>;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layouts: [],
  currentLayoutId: null,

  // Sync state
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,

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

    // Sync to cloud in background
    get().syncToCloud(layout);
  },

  deleteLayout: (id: string) => {
    const { layouts } = get();
    const newLayouts = layouts.filter(l => l.id !== id);
    set({ layouts: newLayouts });

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
    }

    // Delete from cloud in background
    get().deleteFromCloud(id);
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

    // Sync default change to cloud
    cloudLayoutStorage.setDefault(id).catch((e) => {
      console.error('Failed to set default in cloud:', e);
    });
  },

  // Sync from cloud (called on sign-in)
  syncFromCloud: async () => {
    set({ isSyncing: true, syncError: null });
    try {
      const cloudLayouts = await cloudLayoutStorage.loadAll();
      if (cloudLayouts.length > 0) {
        // Merge cloud layouts with local
        const { layouts: localLayouts } = get();
        const merged = mergeLayouts(localLayouts, cloudLayouts);
        set({
          layouts: merged,
          isSyncing: false,
          lastSyncedAt: Date.now(),
        });
        // Update localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } else {
        // No cloud layouts, push local to cloud
        const { layouts } = get();
        for (const layout of layouts) {
          await cloudLayoutStorage.save(layout);
        }
        set({ isSyncing: false, lastSyncedAt: Date.now() });
      }
    } catch (e) {
      console.error('Error syncing layouts from cloud:', e);
      set({
        isSyncing: false,
        syncError: 'Failed to sync layouts',
      });
    }
  },

  // Sync single layout to cloud
  syncToCloud: async (layout: BoardLayout) => {
    try {
      await cloudLayoutStorage.save(layout);
    } catch (e) {
      console.error('Failed to sync layout to cloud:', e);
    }
  },

  // Delete from cloud
  deleteFromCloud: async (id: string) => {
    try {
      await cloudLayoutStorage.delete(id);
    } catch (e) {
      console.error('Failed to delete layout from cloud:', e);
    }
  },
}));

// Helper to merge local and cloud layouts
function mergeLayouts(local: BoardLayout[], cloud: BoardLayout[]): BoardLayout[] {
  const merged = new Map<string, BoardLayout>();

  // Add all cloud layouts first
  for (const layout of cloud) {
    merged.set(layout.id, layout);
  }

  // Add local layouts that don't exist in cloud (by id)
  for (const layout of local) {
    if (!merged.has(layout.id)) {
      merged.set(layout.id, layout);
    }
  }

  return Array.from(merged.values());
}
