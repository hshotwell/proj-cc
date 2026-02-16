import type { BoardLayout } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import type {
  SyncableSettings,
  SettingsStorageProvider,
  LayoutStorageProvider,
  GameStorageProvider,
} from './types';

const SETTINGS_KEY = 'chinese-checkers-settings';
const LAYOUTS_KEY = 'chinese-checkers-layouts';
const GAMES_INDEX_KEY = 'chinese-checkers-saved-games';
const GAME_DATA_PREFIX = 'chinese-checkers-game-';
const MAX_SAVED_GAMES = 20;

// LocalStorage provider for settings
export const localSettingsStorage: SettingsStorageProvider = {
  async load(): Promise<SyncableSettings | null> {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return null;

      const data = JSON.parse(stored);
      return {
        showAllMoves: data.state?.showAllMoves ?? true,
        animateMoves: data.state?.animateMoves ?? false,
        rotateBoard: data.state?.rotateBoard ?? true,
        showTriangleLines: data.state?.showTriangleLines ?? true,
        showLastMoves: data.state?.showLastMoves ?? false,
        showCoordinates: data.state?.showCoordinates ?? false,
        autoConfirm: data.state?.autoConfirm ?? false,
        showPlayerProgress: data.state?.showPlayerProgress ?? false,
        darkMode: data.state?.darkMode ?? false,
      };
    } catch {
      return null;
    }
  },

  async save(settings: SyncableSettings): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // zustand persist format
      const data = {
        state: settings,
        version: 0,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e);
    }
  },
};

// LocalStorage provider for layouts
export const localLayoutStorage: LayoutStorageProvider = {
  async loadAll(): Promise<BoardLayout[]> {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(LAYOUTS_KEY);
      if (!stored) return [];
      return JSON.parse(stored) as BoardLayout[];
    } catch {
      return [];
    }
  },

  async save(layout: BoardLayout): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const layouts = await this.loadAll();
      const existingIndex = layouts.findIndex((l) => l.id === layout.id);

      if (existingIndex >= 0) {
        layouts[existingIndex] = layout;
      } else {
        layouts.push(layout);
      }

      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
    } catch (e) {
      console.error('Failed to save layout to localStorage:', e);
    }
  },

  async delete(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const layouts = await this.loadAll();
      const filtered = layouts.filter((l) => l.id !== id);
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to delete layout from localStorage:', e);
    }
  },

  async setDefault(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const layouts = await this.loadAll();
      const updated = layouts.map((l) => ({
        ...l,
        isDefault: l.id === id,
      }));
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to set default layout in localStorage:', e);
    }
  },
};

// LocalStorage provider for games
export const localGameStorage: GameStorageProvider = {
  async loadList(): Promise<SavedGameSummary[]> {
    if (typeof window === 'undefined') return [];

    try {
      const raw = localStorage.getItem(GAMES_INDEX_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedGameSummary[];
    } catch {
      return [];
    }
  },

  async loadGame(id: string): Promise<SavedGameData | null> {
    if (typeof window === 'undefined') return null;

    try {
      const raw = localStorage.getItem(GAME_DATA_PREFIX + id);
      if (!raw) return null;
      const data = JSON.parse(raw) as SavedGameData;

      // Restore s coordinates for CubeCoords
      data.moves = data.moves.map((m) => ({
        ...m,
        from: { q: m.from.q, r: m.from.r, s: -m.from.q - m.from.r },
        to: { q: m.to.q, r: m.to.r, s: -m.to.q - m.to.r },
        ...(m.jumpPath
          ? {
              jumpPath: m.jumpPath.map((c) => ({
                q: c.q,
                r: c.r,
                s: -c.q - c.r,
              })),
            }
          : {}),
      }));

      return data;
    } catch {
      return null;
    }
  },

  async saveGame(
    id: string,
    data: SavedGameData,
    summary: SavedGameSummary
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(GAME_DATA_PREFIX + id, JSON.stringify(data));
    } catch {
      return;
    }

    // Update index
    try {
      const index = await this.loadList();
      const filtered = index.filter((g) => g.id !== id);
      filtered.unshift(summary);

      // Cap at MAX_SAVED_GAMES, evict oldest
      while (filtered.length > MAX_SAVED_GAMES) {
        const evicted = filtered.pop()!;
        try {
          localStorage.removeItem(GAME_DATA_PREFIX + evicted.id);
        } catch {
          // ignore
        }
      }

      localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  },

  async deleteGame(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(GAME_DATA_PREFIX + id);
    } catch {
      // ignore
    }

    try {
      const index = await this.loadList();
      const filtered = index.filter((g) => g.id !== id);
      localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  },
};
