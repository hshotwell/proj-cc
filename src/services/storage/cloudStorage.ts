import { getConvexClient } from '@/lib/convex';
import { api } from '../../../convex/_generated/api';
import type { BoardLayout } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import type {
  SyncableSettings,
  SettingsStorageProvider,
  LayoutStorageProvider,
  GameStorageProvider,
} from './types';

// Cloud storage provider for settings
export const cloudSettingsStorage: SettingsStorageProvider = {
  async load(): Promise<SyncableSettings | null> {
    try {
      const settings = await getConvexClient().query(api.users.getSettings);
      return settings;
    } catch (e) {
      console.error('Failed to load settings from cloud:', e);
      return null;
    }
  },

  async save(settings: SyncableSettings): Promise<void> {
    try {
      await getConvexClient().mutation(api.users.saveSettings, settings);
    } catch (e) {
      console.error('Failed to save settings to cloud:', e);
    }
  },
};

// Cloud storage provider for layouts
export const cloudLayoutStorage: LayoutStorageProvider = {
  async loadAll(): Promise<BoardLayout[]> {
    try {
      const layouts = await getConvexClient().query(api.layouts.listLayouts);
      return layouts as BoardLayout[];
    } catch (e) {
      console.error('Failed to load layouts from cloud:', e);
      return [];
    }
  },

  async save(layout: BoardLayout): Promise<void> {
    try {
      await getConvexClient().mutation(api.layouts.saveLayout, {
        layoutId: layout.id,
        name: layout.name,
        cells: layout.cells,
        startingPositions: layout.startingPositions,
        goalPositions: layout.goalPositions,
        walls: layout.walls,
        isDefault: layout.isDefault ?? false,
      });
    } catch (e) {
      console.error('Failed to save layout to cloud:', e);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await getConvexClient().mutation(api.layouts.deleteLayout, { layoutId: id });
    } catch (e) {
      console.error('Failed to delete layout from cloud:', e);
    }
  },

  async setDefault(id: string): Promise<void> {
    try {
      await getConvexClient().mutation(api.layouts.updateLayout, {
        layoutId: id,
        isDefault: true,
      });
    } catch (e) {
      console.error('Failed to set default layout in cloud:', e);
    }
  },
};

// Cloud storage provider for games
export const cloudGameStorage: GameStorageProvider = {
  async loadList(): Promise<SavedGameSummary[]> {
    try {
      const games = await getConvexClient().query(api.games.listGames);
      return games as SavedGameSummary[];
    } catch (e) {
      console.error('Failed to load games from cloud:', e);
      return [];
    }
  },

  async loadGame(id: string): Promise<SavedGameData | null> {
    try {
      const data = await getConvexClient().query(api.games.getGame, { gameId: id });
      if (!data) return null;

      // Restore s coordinates for CubeCoords
      data.moves = data.moves.map((m: SavedGameData['moves'][0]) => ({
        ...m,
        from: { q: m.from.q, r: m.from.r, s: -m.from.q - m.from.r },
        to: { q: m.to.q, r: m.to.r, s: -m.to.q - m.to.r },
        ...(m.jumpPath
          ? {
              jumpPath: m.jumpPath.map((c: { q: number; r: number }) => ({
                q: c.q,
                r: c.r,
                s: -c.q - c.r,
              })),
            }
          : {}),
      }));

      return data;
    } catch (e) {
      console.error('Failed to load game from cloud:', e);
      return null;
    }
  },

  async saveGame(
    id: string,
    data: SavedGameData,
    summary: SavedGameSummary
  ): Promise<void> {
    try {
      await getConvexClient().mutation(api.games.saveGame, {
        gameId: id,
        gameData: data,
        summary,
      });
    } catch (e) {
      console.error('Failed to save game to cloud:', e);
    }
  },

  async deleteGame(id: string): Promise<void> {
    try {
      await getConvexClient().mutation(api.games.deleteGame, { gameId: id });
    } catch (e) {
      console.error('Failed to delete game from cloud:', e);
    }
  },
};
