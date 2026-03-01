import type { BoardLayout } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';

// Settings structure that can be synced
export interface SyncableSettings {
  showAllMoves: boolean;
  animateMoves: boolean;
  rotateBoard: boolean;
  showTriangleLines: boolean;
  showLastMoves: boolean;
  showCoordinates: boolean;
  autoConfirm: boolean;
  showPlayerProgress: boolean;
  darkMode: boolean;
  woodenBoard: boolean;
  glassPieces: boolean;
  hopEffect: boolean;
}

// Storage provider interface for settings
export interface SettingsStorageProvider {
  load(): Promise<SyncableSettings | null>;
  save(settings: SyncableSettings): Promise<void>;
}

// Storage provider interface for layouts
export interface LayoutStorageProvider {
  loadAll(): Promise<BoardLayout[]>;
  save(layout: BoardLayout): Promise<void>;
  delete(id: string): Promise<void>;
  setDefault(id: string): Promise<void>;
}

// Storage provider interface for games
export interface GameStorageProvider {
  loadList(): Promise<SavedGameSummary[]>;
  loadGame(id: string): Promise<SavedGameData | null>;
  saveGame(id: string, data: SavedGameData, summary: SavedGameSummary): Promise<void>;
  deleteGame(id: string): Promise<void>;
}
