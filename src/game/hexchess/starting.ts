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

/**
 * Returns the 5 cells of row 5 — the first row into the central hexagon,
 * immediately in front of the arm's base row. Used for the extended v1
 * starting layout (3 peons + 2 knights in the front).
 */
export function armExtensionCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  const cells: CubeCoord[] = [];
  // Row 5, k=4, j=0..4
  for (let j = 0; j < 5; j++) {
    const q = player === 0 ? j : -4 + j;
    const r = player === 0 ? -4 : 4;
    cells.push({ q, r, s: -q - r });
  }
  return cells;
}

/**
 * All 15 starting-position cells: the 10 arm cells + 5 extension cells.
 * The extension cells are one row into the central hexagon.
 */
export function startingCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  return [...armCellsForPlayer(player), ...armExtensionCellsForPlayer(player)];
}

// ---------------------------------------------------------------------------
// V1 default layout — pieces ordered to match startingCellsForPlayer indices
//   index 0:     king                     (row 1, apex)
//   index 1-2:   bishop x2                (row 2)
//   index 3-5:   rook, queen, rook        (row 3)
//   index 6-9:   knight, soldier x2, knight  (row 4, knights on the flanks)
//   index 10-14: empty, soldier x3, empty (row 5, 3 peons in the middle)
// ---------------------------------------------------------------------------

const V1_LAYOUT: (HexPieceType | null)[] = [
  // row 1 — apex
  'king',
  // row 2 — bishops
  'bishop', 'bishop',
  // row 3 — rooks flanking the queen
  'rook', 'queen', 'rook',
  // row 4 — knights on the outer flanks, two peons in the middle
  'knight', 'soldier', 'soldier', 'knight',
  // row 5 — three peons in the middle; outer cells stay empty
  null, 'soldier', 'soldier', 'soldier', null,
];

export function createInitialState(config: HexChessConfig): HexChessState {
  const pieces: HexPiece[] = [];

  for (const player of [0, 1] as const) {
    const cells = startingCellsForPlayer(player);

    for (let i = 0; i < V1_LAYOUT.length; i++) {
      const type = V1_LAYOUT[i];
      if (type === null) continue;   // empty starting cell
      pieces.push({
        id: `${player}-${type}-${i}`,
        player,
        type,
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
