import type { BoardLayout } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import type { SyncableSettings } from '@/services/storage';
import {
  localSettingsStorage,
  localLayoutStorage,
  localGameStorage,
  cloudSettingsStorage,
  cloudLayoutStorage,
  cloudGameStorage,
} from '@/services/storage';

const MIGRATION_KEY = 'chinese-checkers-migration-done';

export interface LocalDataSummary {
  hasSettings: boolean;
  settingsCount: number;
  layoutCount: number;
  gameCount: number;
  layouts: BoardLayout[];
  games: SavedGameSummary[];
}

// Check if there's local data that could be migrated
export async function checkLocalData(): Promise<LocalDataSummary> {
  const settings = await localSettingsStorage.load();
  const layouts = await localLayoutStorage.loadAll();
  const games = await localGameStorage.loadList();

  const hasSettings = settings !== null && Object.keys(settings).length > 0;
  const settingsCount = hasSettings ? 1 : 0;

  return {
    hasSettings,
    settingsCount,
    layoutCount: layouts.length,
    gameCount: games.length,
    layouts,
    games,
  };
}

// Check if migration has already been done
export function hasMigrated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MIGRATION_KEY) === 'true';
}

// Mark migration as done
export function markMigrated(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MIGRATION_KEY, 'true');
}

// Reset migration flag (for testing)
export function resetMigration(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MIGRATION_KEY);
}

export interface MigrationOptions {
  migrateSettings: boolean;
  migrateLayouts: boolean;
  migrateGames: boolean;
  // For conflicts: 'local' keeps local, 'cloud' keeps cloud, 'merge' adds both
  settingsConflict: 'local' | 'cloud';
  layoutConflict: 'merge';
  gameConflict: 'merge';
}

export interface MigrationResult {
  success: boolean;
  settingsMigrated: boolean;
  layoutsMigrated: number;
  gamesMigrated: number;
  errors: string[];
}

// Perform migration from localStorage to cloud
export async function migrateToCloud(options: MigrationOptions): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    settingsMigrated: false,
    layoutsMigrated: 0,
    gamesMigrated: 0,
    errors: [],
  };

  // Migrate settings
  if (options.migrateSettings) {
    try {
      const localSettings = await localSettingsStorage.load();
      const cloudSettings = await cloudSettingsStorage.load();

      if (localSettings) {
        if (!cloudSettings || options.settingsConflict === 'local') {
          await cloudSettingsStorage.save(localSettings);
          result.settingsMigrated = true;
        }
        // If cloud exists and conflict is 'cloud', we keep cloud (do nothing)
      }
    } catch (e) {
      result.errors.push(`Settings migration failed: ${e}`);
    }
  }

  // Migrate layouts
  if (options.migrateLayouts) {
    try {
      const localLayouts = await localLayoutStorage.loadAll();
      const cloudLayouts = await cloudLayoutStorage.loadAll();
      const cloudIds = new Set(cloudLayouts.map((l) => l.id));

      for (const layout of localLayouts) {
        if (!cloudIds.has(layout.id)) {
          await cloudLayoutStorage.save(layout);
          result.layoutsMigrated++;
        }
        // For merge strategy, we only add new ones, don't overwrite existing
      }
    } catch (e) {
      result.errors.push(`Layouts migration failed: ${e}`);
    }
  }

  // Migrate games
  if (options.migrateGames) {
    try {
      const localGames = await localGameStorage.loadList();
      const cloudGames = await cloudGameStorage.loadList();
      const cloudIds = new Set(cloudGames.map((g) => g.id));

      for (const gameSummary of localGames) {
        if (!cloudIds.has(gameSummary.id)) {
          const gameData = await localGameStorage.loadGame(gameSummary.id);
          if (gameData) {
            await cloudGameStorage.saveGame(gameSummary.id, gameData, gameSummary);
            result.gamesMigrated++;
          }
        }
      }
    } catch (e) {
      result.errors.push(`Games migration failed: ${e}`);
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  // Mark as migrated
  markMigrated();

  return result;
}

// Skip migration and mark as done
export function skipMigration(): void {
  markMigrated();
}
