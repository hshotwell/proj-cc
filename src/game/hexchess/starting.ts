import type { CubeCoord } from '@/types/game';
import { rotateCube } from '@/game/coordinates';
import { ROTATION_STEPS } from './directions';
import type {
  HexChessConfig,
  HexChessState,
  HexPiece,
  HexPlayerIndex,
  HexPieceType,
} from './state';

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
// All geometry is defined once for seat 0 (arm at triangle 0, apex {4,-8})
// and rotated clockwise by ROTATION_STEPS[seat] * 60 degrees for every other
// seat. Seat indices equal Chinese Checkers home-triangle indices, so the
// rotated arms land exactly on DEFAULT_BOARD_LAYOUT.startingPositions[seat].
//
// Each arm has 4 rows (1+2+3+4 = 10 cells) indexed apex→base:
//   index 0        — apex (row 1, 1 cell)
//   indices 1-2    — row 2 (2 cells)
//   indices 3-5    — row 3 (3 cells)
//   indices 6-9    — row 4 / base (4 cells)
//
// Canonical (seat 0) geometry formula (k = row index 0..3, j = cell within row 0..k):
//   { q: 4-k+j, r: -8+k }
// ---------------------------------------------------------------------------

function canonicalArmCells(): CubeCoord[] {
  const cells: CubeCoord[] = [];
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j <= k; j++) {
      const q = 4 - k + j;
      const r = -8 + k;
      cells.push({ q, r, s: -q - r });
    }
  }
  return cells;
}

/** Row 5 for seat 0 — the 5 cells just inside the central hexagon. */
function canonicalExtensionCells(): CubeCoord[] {
  const cells: CubeCoord[] = [];
  for (let j = 0; j < 5; j++) {
    const q = j;
    const r = -4;
    cells.push({ q, r, s: -q - r });
  }
  return cells;
}

/**
 * Returns the set of cell coordKeys that are promotion cells for `player`.
 * A soldier or pawn belonging to `player` that reaches any of these cells
 * must promote. The zone is the FAR HALF of the board — every cell past the
 * centerline perpendicular to the seat's forward direction (for seat 0:
 * r >= 1). Other seats use the same rule rotated to their corner.
 */
export function promotionCellsForPlayer(player: HexPlayerIndex): Set<string> {
  const inverseSteps = (6 - ROTATION_STEPS[player]) % 6;
  const cells: string[] = [];
  // Enumerate all cells on the standard 121-cell star. Using cube-distance
  // bounds |q|, |r|, |s| <= 8 covers every cell on the star; the play code
  // filters unreachable cells via isOnBoard elsewhere.
  for (let q = -8; q <= 8; q++) {
    for (let r = -8; r <= 8; r++) {
      const s = -q - r;
      if (Math.abs(s) > 8) continue;
      const canonical = rotateCube({ q, r, s }, inverseSteps);
      if (canonical.r >= 1) cells.push(`${q},${r}`);
    }
  }
  return new Set(cells);
}

export function armCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  return canonicalArmCells().map(c => rotateCube(c, ROTATION_STEPS[player]));
}

/**
 * Returns the 5 cells of row 5 — the first row into the central hexagon,
 * immediately in front of the arm's base row. Used for the extended v1
 * starting layout (3 peons + 2 knights in the front).
 */
export function armExtensionCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  return canonicalExtensionCells().map(c => rotateCube(c, ROTATION_STEPS[player]));
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
//   index 1-2:   rook x2                  (row 2, second furthest back)
//   index 3-5:   bishop x3                (row 3, all bishops middle)
//   index 6-9:   knight, soldier x2, knight  (row 4, knights on the flanks)
//   index 10-14: empty, soldier x3, empty (row 5, 3 peons in the middle)
// ---------------------------------------------------------------------------
//
// No queen — with promotions happening at the midline, peons have a viable
// path to becoming queens themselves. The third bishop keeps the bishop
// diagonals well-covered given the 3-color hex board.

const V1_LAYOUT: (HexPieceType | null)[] = [
  // row 1 — apex
  'king',
  // row 2 — rooks
  'rook', 'rook',
  // row 3 — three bishops across the middle
  'bishop', 'bishop', 'bishop',
  // row 4 — knights on the outer flanks, two peons in the middle
  'knight', 'soldier', 'soldier', 'knight',
  // row 5 — three peons in the middle; outer cells stay empty
  null, 'soldier', 'soldier', 'soldier', null,
];

export function createInitialState(config: HexChessConfig): HexChessState {
  const pieces: HexPiece[] = [];

  for (const seat of config.seats) {
    const cells = startingCellsForPlayer(seat);

    for (let i = 0; i < V1_LAYOUT.length; i++) {
      const type = V1_LAYOUT[i];
      if (type === null) continue;   // empty starting cell
      pieces.push({
        id: `${seat}-${type}-${i}`,
        player: seat,
        type,
        cell: cells[i],
        hasMoved: false,
      });
    }
  }

  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: config.seats[0],
    turnNumber: 1,
    activePlayers: [...config.seats],
    eliminated: [],
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
  };
}
