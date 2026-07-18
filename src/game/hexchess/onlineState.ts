import type { BoardLayout } from '@/types/game';
import type {
  HexChessConfig, HexChessState, HexMove, HexPieceType, HexPlayerIndex,
} from './state';
import { createInitialState } from './starting';
import { applyMove, eliminatePlayer } from './moves';
import { legalMoves } from './check';
import { confirmPromotion } from './promotion';
import { nextLivingPlayer } from './board';
import { snapshotFromLayout, hexSeatsOfSnapshot } from './geometry';
import { TRADITIONAL_HEX_LAYOUT } from './traditionalLayout';
import { coordKey } from '@/game/coordinates';
import { ACTIVE_PLAYERS } from '@/game/constants';
import type { OnlinePlayerSlot } from '@/game/onlineState';

export const BUILTIN_HEX_LAYOUTS: Record<string, BoardLayout> = {
  [TRADITIONAL_HEX_LAYOUT.id]: TRADITIONAL_HEX_LAYOUT,
};

export type OnlineHexTurnPayload =
  | { kind: 'move'; pieceId: string; from: string; to: string; promotion: HexPieceType | null }
  | { kind: 'resign' };

export interface OnlineHexTurn {
  playerIndex: number;
  moves: OnlineHexTurnPayload;
}

export interface OnlineHexGameData {
  _id: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  playerCount: number;
  players: OnlinePlayerSlot[];
  turns?: OnlineHexTurn[];
  customLayout?: BoardLayout;
  selectedBuiltinLayoutId?: string;
  currentPlayerIndex?: number;
  gameType?: 'sternhalma' | 'hexchess';
}

const HEX_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/** Build a HexChessConfig from the lobby data shared by all clients. */
export function buildHexConfigFromOnline(data: OnlineHexGameData): HexChessConfig {
  const layoutSource = data.customLayout
    ?? (data.selectedBuiltinLayoutId ? BUILTIN_HEX_LAYOUTS[data.selectedBuiltinLayoutId] : undefined);
  const snapshot = layoutSource ? snapshotFromLayout(layoutSource) : undefined;
  const seats: HexPlayerIndex[] = snapshot
    ? hexSeatsOfSnapshot(snapshot)
    : (ACTIVE_PLAYERS[data.playerCount as 2 | 3 | 4 | 6] as HexPlayerIndex[]);

  const players: HexChessConfig['players'] = {};
  const aiMap: NonNullable<HexChessConfig['ai']> = {};
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const slot = data.players[i];
    if (!slot) continue;
    const difficulty = HEX_DIFFICULTIES.has(slot.aiConfig?.difficulty ?? '')
      ? (slot.aiConfig!.difficulty as 'easy' | 'medium' | 'hard')
      : 'medium';
    players[seat] = {
      color: slot.color,
      name: slot.username ?? (slot.type === 'ai' ? `AI (${difficulty})` : `Player ${i + 1}`),
      isAI: slot.type === 'ai',
    };
    if (slot.type === 'ai') aiMap[seat] = difficulty;
  }

  return {
    id: data._id,
    seats,
    players,
    layoutPreset: snapshot ? 'custom' : 'v1-default',
    ...(snapshot ? { layout: snapshot } : {}),
    ai: Object.keys(aiMap).length > 0 ? aiMap : null,
  };
}

export function serializeHexMove(move: HexMove): OnlineHexTurnPayload & { kind: 'move' } {
  return {
    kind: 'move',
    pieceId: move.pieceId,
    from: coordKey(move.from),
    to: coordKey(move.to),
    promotion: move.promotion,
  };
}

/** Resignation: 2p ends the game; 3+ eliminates the seat (game may continue). */
export function applyResign(state: HexChessState, seat: HexPlayerIndex): HexChessState {
  if (state.result !== null) return state;
  if (state.activePlayers.length === 2) {
    const winner = nextLivingPlayer(state, seat);
    return { ...state, result: { winner, reason: 'resignation' } };
  }
  return eliminatePlayer(state, seat);
}

/**
 * Deterministically rebuild the full game from the server's turn list.
 * Each move turn is matched against the legal moves of the replayed position,
 * so every client arrives at an identical state (including hashes and ids).
 */
export function reconstructHexChessOnline(
  data: OnlineHexGameData,
): { config: HexChessConfig; state: HexChessState; lastMove: HexMove | null } {
  const config = buildHexConfigFromOnline(data);
  let state = createInitialState(config);
  let lastMove: HexMove | null = null;

  for (const turn of data.turns ?? []) {
    const payload = turn.moves;
    if (payload.kind === 'resign') {
      const seat = config.seats[turn.playerIndex];
      if (seat === undefined) {
        throw new Error(`[hexchess online] resign from unknown slot ${turn.playerIndex}`);
      }
      state = applyResign(state, seat);
      continue;
    }
    const move = legalMoves(state).find(
      (m) => m.pieceId === payload.pieceId && coordKey(m.to) === payload.to,
    );
    if (!move) {
      throw new Error(`[hexchess online] illegal turn: ${payload.pieceId} -> ${payload.to}`);
    }
    state = applyMove(state, move);
    if (state.pendingPromotion !== null && payload.promotion) {
      state = confirmPromotion(state, payload.promotion);
    }
    lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  }

  return { config, state, lastMove };
}
