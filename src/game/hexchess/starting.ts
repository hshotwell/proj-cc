import type { CubeCoord } from '@/types/game';
import { coordKey } from '@/game/coordinates';
import type {
  HexChessConfig,
  HexChessState,
  HexPiece,
  HexPlayerIndex,
  HexPieceType,
} from './state';
import { otherPlayer } from './board';

/**
 * Returns the set of cells (as coordKey strings) where pawns start for the given player.
 *
 * v1 default layout has no pawns, so this returns an empty set.
 * TODO(future editor): read from layout config to detect pawn-starting cells dynamically,
 * e.g. by filtering createInitialState(config).pieces for type === 'pawn'.
 */
export function pawnStartingCellsForPlayer(_player: HexPlayerIndex): Set<string> {
  return new Set<string>();
}

// ---------------------------------------------------------------------------
// Arm geometry
//
// The hexchess board is a 2-player variant played on the same 121-cell star.
// Player 0 starts at the south apex {q:4, r:-8} and moves north.
// Player 1 starts at the north apex {q:-4, r:8} and moves south.
//
// Each arm has 4 rows (1+2+3+4 = 10 cells) indexed apex→base:
//   index 0        — apex (row 1, 1 cell)
//   indices 1-2    — row 2 (2 cells)
//   indices 3-5    — row 3 (3 cells)
//   indices 6-9    — row 4 / base (4 cells)
//
// Geometry formula (k = row index 0..3, j = cell within row 0..k):
//   player 0: { q: 4-k+j, r: -8+k }
//   player 1: { q: -4+j, r:  8-k }
// ---------------------------------------------------------------------------

/**
 * Returns the set of cell coordKeys that are promotion cells for `player`.
 * A soldier or pawn belonging to `player` that reaches any of these cells
 * must promote. These are the cells in the opponent's arm.
 */
export function promotionCellsForPlayer(player: HexPlayerIndex): Set<string> {
  return new Set(armCellsForPlayer(otherPlayer(player)).map(coordKey));
}

export function armCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  const cells: CubeCoord[] = [];

  for (let k = 0; k < 4; k++) {
    for (let j = 0; j <= k; j++) {
      let q: number;
      let r: number;

      if (player === 0) {
        // South apex at (4,-8); rows advance toward center (r increases, q shifts left)
        q = 4 - k + j;
        r = -8 + k;
      } else {
        // North apex at (-4,8); rows advance toward center (r decreases, q shifts right)
        q = -4 + j;
        r = 8 - k;
      }

      cells.push({ q, r, s: -q - r });
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// V1 default layout — pieces ordered to match armCellsForPlayer indices
//   index 0:   king   (apex)
//   index 1-2: rook, rook
//   index 3-5: bishop, queen, bishop
//   index 6-9: soldier x4  (base row)
// ---------------------------------------------------------------------------

const V1_LAYOUT: HexPieceType[] = [
  // row 1 — apex
  'king',
  // row 2
  'rook', 'rook',
  // row 3
  'bishop', 'queen', 'bishop',
  // row 4 — base
  'soldier', 'soldier', 'soldier', 'soldier',
];

export function createInitialState(config: HexChessConfig): HexChessState {
  const pieces: HexPiece[] = [];

  for (const player of [0, 1] as const) {
    const cells = armCellsForPlayer(player);

    for (let i = 0; i < V1_LAYOUT.length; i++) {
      pieces.push({
        id: `${player}-${V1_LAYOUT[i]}-${i}`,
        player,
        type: V1_LAYOUT[i],
        cell: cells[i],
        hasMoved: false,
      });
    }
  }

  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: 0,
    turnNumber: 1,
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
  };
}
