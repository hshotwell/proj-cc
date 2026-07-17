import type { CubeCoord } from '@/types/game';
import { getDefaultBoardCells } from '@/game/defaultLayout';
import { coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece, HexPlayerIndex } from './state';

let boardCellSet: Set<string> | null = null;
function boardCells(): Set<string> {
  if (!boardCellSet) {
    boardCellSet = getDefaultBoardCells();
  }
  return boardCellSet;
}

export function isOnBoard(cell: CubeCoord): boolean {
  return boardCells().has(coordKey(cell));
}

export function pieceAt(state: HexChessState, cell: CubeCoord): HexPiece | null {
  const key = coordKey(cell);
  return state.pieces.find((p) => coordKey(p.cell) === key) ?? null;
}

export function isEmpty(state: HexChessState, cell: CubeCoord): boolean {
  return pieceAt(state, cell) === null;
}

export function isEnemy(state: HexChessState, cell: CubeCoord, player: HexPlayerIndex): boolean {
  const p = pieceAt(state, cell);
  return p !== null && p.player !== player;
}

export function kingOf(state: HexChessState, player: HexPlayerIndex): HexPiece | null {
  return state.pieces.find((p) => p.player === player && p.type === 'king') ?? null;
}

export function isEliminated(state: HexChessState, player: HexPlayerIndex): boolean {
  return state.eliminated.includes(player);
}

/** Seats still in the game, in turn order. */
export function livingPlayers(state: HexChessState): HexPlayerIndex[] {
  return state.activePlayers.filter((p) => !state.eliminated.includes(p));
}

/**
 * The next living seat after `after` in turn order (cyclic).
 * In a 2-player game this is simply the opponent.
 * Throws if no living seat exists other than possibly `after` itself
 * being dead too — callers detect last-standing before advancing.
 */
export function nextLivingPlayer(state: HexChessState, after: HexPlayerIndex): HexPlayerIndex {
  const order = state.activePlayers;
  const idx = order.indexOf(after);
  if (idx === -1) throw new Error(`nextLivingPlayer: seat ${after} not in activePlayers`);
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(idx + step) % order.length];
    if (!state.eliminated.includes(candidate)) return candidate;
  }
  throw new Error('nextLivingPlayer: no living players remain');
}
