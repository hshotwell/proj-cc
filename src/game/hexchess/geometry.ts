import type { CubeCoord, BoardLayout } from '@/types/game';
import { cubeToPixel, coordKey, parseCoordKey, cubeAdd, cubeEquals } from '@/game/coordinates';
import { getDefaultBoardCells } from '@/game/defaultLayout';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, forwardDiagonal, forwardEdges } from './directions';
import { promotionCellsForPlayer } from './starting';
import type { HexChessState, HexPieceType, HexPlayerIndex } from './state';

export type HexLayoutPieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type HexPromotionOption = 'knight' | 'bishop' | 'rook' | 'queen';

/**
 * Serializable snapshot of a custom hex chess board. Embedded in
 * HexChessConfig and HexChessState so saves, replays, and the AI worker are
 * self-contained (deleting/editing the source layout never breaks a game).
 */
export interface HexLayoutSnapshot {
  layoutId: string;
  layoutName: string;
  cells: string[];
  walls: string[];
  pieces: Record<string, { player: HexPlayerIndex; type: HexLayoutPieceType }>;
  promotionPositions: Partial<Record<HexPlayerIndex, string[]>>;
  promotionOptions: HexPromotionOption[];
  rotated30?: boolean;
}

export interface ForwardSpec {
  /** 'point' = diagonal forward (peon rules); 'edge' = edge forward (pawn rules). */
  kind: 'point' | 'edge';
  /** The snapped forward vector (a diagonal for 'point', an edge for 'edge'). */
  dir: CubeCoord;
  /**
   * The two edge directions a pawn/soldier of this army captures along:
   * the edges at +-30 degrees of a point forward, or +-60 degrees of an edge forward.
   */
  captureDirs: [CubeCoord, CubeCoord];
}

export interface HexBoardGeometry {
  /** All live cells (includes wall cells). */
  cells: Set<string>;
  /** Wall cells: on the board but impassable per the wall rules. */
  walls: Set<string>;
  forward: Partial<Record<HexPlayerIndex, ForwardSpec>>;
  promotionCells: Partial<Record<HexPlayerIndex, Set<string>>>;
  promotionOptions: HexPieceType[];
  /** Cells where each army's pawns start (double-step eligibility). */
  pawnStartCells: Partial<Record<HexPlayerIndex, Set<string>>>;
}

/** On the board and not a wall — the only cells a piece can occupy or enter. */
export function isOpenCell(geom: HexBoardGeometry, cell: CubeCoord): boolean {
  const key = coordKey(cell);
  return geom.cells.has(key) && !geom.walls.has(key);
}

/** The two EDGE_DIRECTIONS flanking an edge direction at +-60 degrees. */
function flankingEdgesOfEdge(edge: CubeCoord): [CubeCoord, CubeCoord] {
  const i = EDGE_DIRECTIONS.findIndex(e => cubeEquals(e, edge));
  if (i === -1) throw new Error(`flankingEdgesOfEdge: ${coordKey(edge)} is not an edge direction`);
  return [EDGE_DIRECTIONS[(i + 1) % 6], EDGE_DIRECTIONS[(i + 5) % 6]];
}

/** The two EDGE_DIRECTIONS summing to a diagonal (i.e. flanking it at +-30 degrees). */
function flankingEdgesOfDiagonal(diag: CubeCoord): [CubeCoord, CubeCoord] {
  for (let i = 0; i < EDGE_DIRECTIONS.length; i++) {
    for (let j = i + 1; j < EDGE_DIRECTIONS.length; j++) {
      if (cubeEquals(cubeAdd(EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]), diag)) {
        return [EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]];
      }
    }
  }
  throw new Error(`flankingEdgesOfDiagonal: ${coordKey(diag)} is not a diagonal direction`);
}

function forwardSpecFor(kind: 'point' | 'edge', dir: CubeCoord): ForwardSpec {
  return {
    kind,
    dir,
    captureDirs: kind === 'point' ? flankingEdgesOfDiagonal(dir) : flankingEdgesOfEdge(dir),
  };
}

/**
 * Derive an army's forward direction: centroid(promotion tiles) minus
 * centroid(the army's pieces), in pixel space, snapped to the nearest of the
 * 12 lattice directions. Exact ties snap to the point (diagonal).
 * Returns null when either set is empty or the centroids coincide.
 */
export function deriveForward(
  startCells: CubeCoord[],
  promoCells: CubeCoord[],
): ForwardSpec | null {
  if (startCells.length === 0 || promoCells.length === 0) return null;
  const centroid = (cs: CubeCoord[]) => {
    let x = 0, y = 0;
    for (const c of cs) { const p = cubeToPixel(c, 1); x += p.x; y += p.y; }
    return { x: x / cs.length, y: y / cs.length };
  };
  const a = centroid(startCells);
  const b = centroid(promoCells);
  const vx = b.x - a.x, vy = b.y - a.y;
  const vLen = Math.hypot(vx, vy);
  if (vLen < 1e-9) return null;

  let best: ForwardSpec | null = null;
  let bestScore = -Infinity;
  const EPS = 1e-9;
  // Diagonals FIRST: with strict improvement (score > bestScore + EPS) an
  // exactly-tied edge cannot displace a diagonal — the documented tie rule.
  const candidates: Array<{ kind: 'point' | 'edge'; dir: CubeCoord }> = [
    ...DIAGONAL_DIRECTIONS.map(d => ({ kind: 'point' as const, dir: d })),
    ...EDGE_DIRECTIONS.map(d => ({ kind: 'edge' as const, dir: d })),
  ];
  for (const cand of candidates) {
    const p = cubeToPixel(cand.dir, 1);
    const cLen = Math.hypot(p.x, p.y);
    const score = (vx * p.x + vy * p.y) / (vLen * cLen); // cosine similarity
    if (score > bestScore + EPS) {
      bestScore = score;
      best = forwardSpecFor(cand.kind, cand.dir);
    }
  }
  return best;
}

/**
 * The display rotation (degrees) that makes `dir` point straight up on
 * screen — used to orient a board so an army's forward direction faces away
 * from its player (army at the bottom). Normalized to (-180, 180].
 */
export function uprightRotationDeg(dir: CubeCoord): number {
  const p = cubeToPixel(dir, 1);
  const angle = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  let rot = -90 - angle;
  while (rot <= -180) rot += 360;
  while (rot > 180) rot -= 360;
  return Math.round(rot * 1000) / 1000;
}

/** Clockwise seat order used everywhere (matches ACTIVE_PLAYERS). */
const CLOCKWISE_SEATS: HexPlayerIndex[] = [0, 4, 3, 2, 1, 5];

export function hexSeatsOfSnapshot(snapshot: HexLayoutSnapshot): HexPlayerIndex[] {
  const present = new Set<HexPlayerIndex>();
  for (const pc of Object.values(snapshot.pieces)) present.add(pc.player);
  return CLOCKWISE_SEATS.filter(s => present.has(s));
}

export function buildGeometry(snapshot: HexLayoutSnapshot): HexBoardGeometry {
  const cells = new Set(snapshot.cells);
  const walls = new Set(snapshot.walls.filter(w => cells.has(w)));
  const forward: HexBoardGeometry['forward'] = {};
  const promotionCells: HexBoardGeometry['promotionCells'] = {};
  const pawnStartCells: HexBoardGeometry['pawnStartCells'] = {};

  const byArmy = new Map<HexPlayerIndex, { all: CubeCoord[]; pawns: string[] }>();
  for (const [key, pc] of Object.entries(snapshot.pieces)) {
    let entry = byArmy.get(pc.player);
    if (!entry) { entry = { all: [], pawns: [] }; byArmy.set(pc.player, entry); }
    entry.all.push(parseCoordKey(key));
    if (pc.type === 'pawn') entry.pawns.push(key);
  }

  for (const [seat, entry] of byArmy) {
    const promoKeys = (snapshot.promotionPositions[seat] ?? []).filter(k => cells.has(k) && !walls.has(k));
    promotionCells[seat] = new Set(promoKeys);
    pawnStartCells[seat] = new Set(entry.pawns);
    const fwd = deriveForward(entry.all, promoKeys.map(parseCoordKey));
    if (fwd) forward[seat] = fwd;
  }

  return {
    cells,
    walls,
    forward,
    promotionCells,
    promotionOptions: [...snapshot.promotionOptions] as HexPieceType[],
    pawnStartCells,
  };
}

let standardCache: HexBoardGeometry | null = null;

/** The classic 121-cell star as a geometry — the regression anchor. */
export function standardGeometry(): HexBoardGeometry {
  if (standardCache) return standardCache;
  const forward: HexBoardGeometry['forward'] = {};
  const promotionCells: HexBoardGeometry['promotionCells'] = {};
  const pawnStartCells: HexBoardGeometry['pawnStartCells'] = {};
  const seats: HexPlayerIndex[] = [0, 1, 2, 3, 4, 5];
  for (const seat of seats) {
    forward[seat] = { kind: 'point', dir: forwardDiagonal(seat), captureDirs: forwardEdges(seat) };
    promotionCells[seat] = promotionCellsForPlayer(seat);
    pawnStartCells[seat] = new Set<string>();
  }
  standardCache = {
    cells: getDefaultBoardCells(),
    walls: new Set<string>(),
    forward,
    promotionCells,
    promotionOptions: ['queen', 'rook', 'bishop', 'knight'],
    pawnStartCells,
  };
  return standardCache;
}

const geometryCache = new WeakMap<HexLayoutSnapshot, HexBoardGeometry>();

/** Memoized geometry for a state: custom snapshot when present, else standard. */
export function geometryOf(state: HexChessState): HexBoardGeometry {
  if (!state.layout) return standardGeometry();
  let g = geometryCache.get(state.layout);
  if (!g) { g = buildGeometry(state.layout); geometryCache.set(state.layout, g); }
  return g;
}

/** Extract the hex chess snapshot from an editor BoardLayout. */
export function snapshotFromLayout(layout: BoardLayout): HexLayoutSnapshot {
  return {
    layoutId: layout.id,
    layoutName: layout.name,
    cells: [...layout.cells],
    walls: [...(layout.walls ?? [])],
    pieces: Object.fromEntries(
      Object.entries(layout.hexPieces ?? {}).map(([k, v]) => [
        k, { player: v.player as HexPlayerIndex, type: v.type },
      ]),
    ),
    promotionPositions: (layout.promotionPositions ?? {}) as Partial<Record<HexPlayerIndex, string[]>>,
    promotionOptions: layout.promotionOptions ?? ['knight', 'bishop', 'rook', 'queen'],
    rotated30: layout.rotated30,
  };
}
