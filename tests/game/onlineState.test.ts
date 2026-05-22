import { describe, it, expect } from 'vitest';
import { reconstructGameState } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';

const BASE_GAME: OnlineGameData = {
  _id: 'test-id',
  hostId: 'user-0',
  status: 'playing',
  playerCount: 2,
  boardType: 'standard',
  players: [
    { slot: 0, type: 'human', userId: 'user-0', username: 'Alice', color: '#ef4444', isReady: true },
    { slot: 1, type: 'human', userId: 'user-1', username: 'Bob',   color: '#3b82f6', isReady: true },
  ],
  turns: [],
  currentPlayerIndex: 0,
  finishedPlayers: [],
};

describe('reconstructGameState', () => {
  it('applies no playerPieceTypes when gameMode is normal', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'normal' });
    expect(state.playerPieceTypes).toBeUndefined();
  });

  it('applies playerPieceTypes for all players when gameMode is turbo', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'turbo' });
    // 2-player standard game uses activePlayers [0, 2] (board triangle indices)
    expect(state.playerPieceTypes).toEqual({ 0: 'turbo', 2: 'turbo' });
  });

  it('applies playerPieceTypes for all players when gameMode is ghost', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'ghost' });
    expect(state.playerPieceTypes).toEqual({ 0: 'ghost', 2: 'ghost' });
  });

  it('applies playerPieceTypes for all players when gameMode is big', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'big' });
    expect(state.playerPieceTypes).toEqual({ 0: 'big', 2: 'big' });
  });

  it('applies teamMode when set', () => {
    const state = reconstructGameState({ ...BASE_GAME, teamMode: true });
    expect(state.teamMode).toBe(true);
  });
});
