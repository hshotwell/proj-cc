import type { GameState, PlayerIndex, PlayerCount, ColorMapping, PlayerNameMapping, BoardLayout } from '@/types/game';
import type { AIPlayerMap, AIConfig } from '@/types/ai';
import { createGame, createGameFromLayout } from './setup';
import { movePiece, advanceTurn } from './state';
import { parseCoordKey, cubeDistance, coordKey } from './coordinates';
import { ACTIVE_PLAYERS } from './constants';

export interface OnlinePlayerSlot {
  slot: number;
  type: 'human' | 'ai' | 'empty';
  userId?: string;
  username?: string;
  color: string;
  aiConfig?: { difficulty: string; personality: string };
  isReady: boolean;
}

export interface OnlineTurn {
  playerIndex: number;
  moves: Array<{ from: string; to: string }>;
}

export interface OnlineGameData {
  _id: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  playerCount: number;
  boardType: 'standard' | 'custom';
  customLayout?: BoardLayout;
  players: OnlinePlayerSlot[];
  turns?: OnlineTurn[];
  currentPlayerIndex?: number;
  winner?: number;
  finishedPlayers?: number[];
}

/**
 * Check if a move is a jump (distance > 1) vs a step (distance = 1)
 */
function isJumpMove(fromKey: string, toKey: string): boolean {
  const from = parseCoordKey(fromKey);
  const to = parseCoordKey(toKey);
  return cubeDistance(from, to) > 1;
}

/**
 * Build color, AI, and name mappings from online player slots
 */
function buildMappings(players: OnlinePlayerSlot[], activePlayers: PlayerIndex[]) {
  const playerColors: ColorMapping = {};
  const aiPlayers: AIPlayerMap = {};
  const playerNames: PlayerNameMapping = {};

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const playerIndex = activePlayers[i];
    if (playerIndex === undefined) continue;

    playerColors[playerIndex] = p.color;

    if (p.type === 'ai' && p.aiConfig) {
      aiPlayers[playerIndex] = p.aiConfig as AIConfig;
    }

    if (p.username) {
      playerNames[playerIndex] = p.username;
    } else if (p.type === 'ai') {
      playerNames[playerIndex] = `AI (${p.aiConfig?.difficulty || 'medium'})`;
    }
  }

  return { playerColors, aiPlayers, playerNames };
}

/**
 * Reconstruct a full GameState from online game data by replaying turns.
 */
export function reconstructGameState(onlineGame: OnlineGameData): GameState {
  const playerCount = onlineGame.playerCount as PlayerCount;
  const activePlayers = ACTIVE_PLAYERS[playerCount] as PlayerIndex[];
  const { playerColors, aiPlayers, playerNames } = buildMappings(onlineGame.players, activePlayers);

  // 1. Create initial state
  let state: GameState;
  if (onlineGame.boardType === 'custom' && onlineGame.customLayout) {
    state = createGameFromLayout(onlineGame.customLayout, playerColors, aiPlayers, playerNames);
  } else {
    state = createGame(playerCount, undefined, playerColors, aiPlayers, playerNames);
  }

  // 2. Replay each confirmed turn
  const turns = onlineGame.turns || [];
  for (const turn of turns) {
    for (const move of turn.moves) {
      const from = parseCoordKey(move.from);
      const to = parseCoordKey(move.to);
      state = movePiece(state, {
        from,
        to,
        isJump: isJumpMove(move.from, move.to),
      });
    }
    state = advanceTurn(state);
  }

  return state;
}

/**
 * Serialize moves from a GameState's moveHistory for submission to the server.
 * Takes moves from startIndex onward.
 */
export function serializeMoves(state: GameState, startIndex: number): Array<{ from: string; to: string }> {
  return state.moveHistory.slice(startIndex).map((move) => ({
    from: coordKey(move.from),
    to: coordKey(move.to),
  }));
}
