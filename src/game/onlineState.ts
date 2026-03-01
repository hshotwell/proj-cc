import type { GameState, CubeCoord, PlayerIndex, PlayerCount, ColorMapping, PlayerNameMapping, BoardLayout } from '@/types/game';
import type { AIPlayerMap, AIConfig } from '@/types/ai';
import { createGame, createGameFromLayout } from './setup';
import { movePiece, advanceTurn, getGoalPositionsForState } from './state';
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
  moves: Array<{ from: string; to: string; jumpPath?: string[] }>;
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
  teamMode?: boolean;
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
 * Check if an adjacent move is a swap: destination has an opponent piece
 * in the current player's goal area.
 */
function isSwapMove(state: GameState, from: CubeCoord, to: CubeCoord): boolean {
  const toContent = state.board.get(coordKey(to));
  if (!toContent || toContent.type !== 'piece') return false;

  // The piece at "from" is the current player's piece
  const fromContent = state.board.get(coordKey(from));
  if (!fromContent || fromContent.type !== 'piece') return false;

  // Must be an opponent's piece at destination
  if (toContent.player === fromContent.player) return false;

  // Destination must be in the current player's goal
  const goalPositions = getGoalPositionsForState(state, fromContent.player);
  const toKey = coordKey(to);
  return goalPositions.some(g => coordKey(g) === toKey);
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
    state = createGameFromLayout(onlineGame.customLayout, playerColors, aiPlayers, playerNames, onlineGame.teamMode);
  } else {
    state = createGame(playerCount, undefined, playerColors, aiPlayers, playerNames, onlineGame.teamMode);
  }

  // 2. Replay each confirmed turn
  const turns = onlineGame.turns || [];
  for (const turn of turns) {
    for (const move of turn.moves) {
      const from = parseCoordKey(move.from);
      const to = parseCoordKey(move.to);
      const isJump = isJumpMove(move.from, move.to);
      const jumpPath = move.jumpPath?.map(parseCoordKey);

      // Detect swap: adjacent move onto an opponent's piece in a goal cell
      const isSwap = !isJump && isSwapMove(state, from, to);

      state = movePiece(state, {
        from,
        to,
        isJump,
        jumpPath,
        isSwap,
      });
    }
    state = advanceTurn(state);
  }

  return state;
}

/**
 * Serialize moves from a GameState's moveHistory for submission to the server.
 * Takes moves from startIndex onward. Preserves jumpPath for animation.
 */
export function serializeMoves(state: GameState, startIndex: number): Array<{ from: string; to: string; jumpPath?: string[] }> {
  return state.moveHistory.slice(startIndex).map((move) => ({
    from: coordKey(move.from),
    to: coordKey(move.to),
    ...(move.jumpPath && move.jumpPath.length > 0
      ? { jumpPath: move.jumpPath.map(c => coordKey(c)) }
      : {}),
  }));
}
