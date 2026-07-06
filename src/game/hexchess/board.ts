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

export function otherPlayer(player: HexPlayerIndex): HexPlayerIndex {
  return (1 - player) as HexPlayerIndex;
}
