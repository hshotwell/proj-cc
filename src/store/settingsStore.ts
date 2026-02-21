'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyncableSettings } from '@/services/storage';
import {
  localSettingsStorage,
  cloudSettingsStorage,
} from '@/services/storage';

interface SettingsStore {
  // Settings menu visibility (not persisted)
  settingsMenuOpen: boolean;

  // Syncable settings
  showAllMoves: boolean;
  animateMoves: boolean;
  rotateBoard: boolean;
  showTriangleLines: boolean;
  showLastMoves: boolean;
  showCoordinates: boolean;
  autoConfirm: boolean;
  showPlayerProgress: boolean;
  darkMode: boolean;

  // Sync state
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;

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
  toggleDarkMode: () => void;

  // Sync actions
  syncFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<void>;
  setSyncError: (error: string | null) => void;
}

// Helper to get syncable settings from state
function getSyncableSettings(state: SettingsStore): SyncableSettings {
  return {
    showAllMoves: state.showAllMoves,
    animateMoves: state.animateMoves,
    rotateBoard: state.rotateBoard,
    showTriangleLines: state.showTriangleLines,
    showLastMoves: state.showLastMoves,
    showCoordinates: state.showCoordinates,
    autoConfirm: state.autoConfirm,
    showPlayerProgress: state.showPlayerProgress,
    darkMode: state.darkMode,
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Not persisted (reset on page load)
      settingsMenuOpen: false,

      showAllMoves: false,
      animateMoves: true,
      rotateBoard: true,
      showTriangleLines: true,
      showLastMoves: true,
      showCoordinates: false,
      autoConfirm: false,
      showPlayerProgress: true,
      darkMode: false,

      // Sync state
      isSyncing: false,
      lastSyncedAt: null,
      syncError: null,

      openSettingsMenu: () => set({ settingsMenuOpen: true }),
      closeSettingsMenu: () => set({ settingsMenuOpen: false }),
      toggleSettingsMenu: () => set((state) => ({ settingsMenuOpen: !state.settingsMenuOpen })),

      setShowAllMoves: (value) => {
        set({ showAllMoves: value });
        get().syncToCloud();
      },
      setAnimateMoves: (value) => {
        set({ animateMoves: value });
        get().syncToCloud();
      },
      toggleShowAllMoves: () => {
        set((state) => ({ showAllMoves: !state.showAllMoves }));
        get().syncToCloud();
      },
      toggleAnimateMoves: () => {
        set((state) => ({ animateMoves: !state.animateMoves }));
        get().syncToCloud();
      },
      toggleRotateBoard: () => {
        set((state) => ({ rotateBoard: !state.rotateBoard }));
        get().syncToCloud();
      },
      toggleTriangleLines: () => {
        set((state) => ({ showTriangleLines: !state.showTriangleLines }));
        get().syncToCloud();
      },
      toggleShowLastMoves: () => {
        set((state) => ({ showLastMoves: !state.showLastMoves }));
        get().syncToCloud();
      },
      toggleShowCoordinates: () => {
        set((state) => ({ showCoordinates: !state.showCoordinates }));
        get().syncToCloud();
      },
      toggleAutoConfirm: () => {
        set((state) => ({ autoConfirm: !state.autoConfirm }));
        get().syncToCloud();
      },
      toggleShowPlayerProgress: () => {
        set((state) => ({ showPlayerProgress: !state.showPlayerProgress }));
        get().syncToCloud();
      },
      toggleDarkMode: () => {
        set((state) => {
          const newDark = !state.darkMode;
          document.documentElement.classList.toggle('dark', newDark);
          return { darkMode: newDark };
        });
        get().syncToCloud();
      },

      // Sync from cloud (called on sign-in)
      syncFromCloud: async () => {
        set({ isSyncing: true, syncError: null });
        try {
          const cloudSettings = await cloudSettingsStorage.load();
          if (cloudSettings) {
            set({
              ...cloudSettings,
              isSyncing: false,
              lastSyncedAt: Date.now(),
            });
            // Also update localStorage
            await localSettingsStorage.save(cloudSettings);
          } else {
            // No cloud settings, push local to cloud
            const localSettings = getSyncableSettings(get());
            await cloudSettingsStorage.save(localSettings);
            set({ isSyncing: false, lastSyncedAt: Date.now() });
          }
        } catch (e) {
          console.error('Error syncing settings from cloud:', e);
          set({
            isSyncing: false,
            syncError: 'Failed to sync settings',
          });
        }
      },

      // Sync to cloud (called on setting change when authenticated)
      syncToCloud: async () => {
        // Debounce: don't sync if already syncing
        if (get().isSyncing) return;

        try {
          const settings = getSyncableSettings(get());
          // Fire and forget - don't block UI
          cloudSettingsStorage.save(settings).catch((e) => {
            console.error('Background sync failed:', e);
          });
        } catch (e) {
          console.error('Error preparing settings sync:', e);
        }
      },

      setSyncError: (error) => set({ syncError: error }),
    }),
    {
      name: 'chinese-checkers-settings',
      partialize: (state) => ({
        // Only persist these settings, not settingsMenuOpen or sync state
        showAllMoves: state.showAllMoves,
        animateMoves: state.animateMoves,
        rotateBoard: state.rotateBoard,
        showTriangleLines: state.showTriangleLines,
        showLastMoves: state.showLastMoves,
        showCoordinates: state.showCoordinates,
        autoConfirm: state.autoConfirm,
        showPlayerProgress: state.showPlayerProgress,
        darkMode: state.darkMode,
      }),
    }
  )
);
