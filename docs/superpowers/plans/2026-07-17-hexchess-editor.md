# Hex Chess Board Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hex chess as a second mode in the board editor with full playability: edit, save, validate, select on /play, play (incl. AI), save mid-game, and replay custom hex chess boards.

**Architecture:** One `BoardLayout` type gains optional hexchess fields. The hex chess engine is refactored around a derived `HexBoardGeometry` (cells, walls, per-army forward direction, promotion cells/options) so the standard board and custom boards share a single rules path. The state embeds a serializable layout snapshot, so persistence, replays, and the AI Web Worker need no protocol changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand, Vitest, SVG board rendering.

**Spec:** `docs/superpowers/specs/2026-07-17-hexchess-editor-design.md` — read it before starting any task.

## Global Constraints

- TypeScript strict mode; path alias `@/*` → `./src/*`.
- No emoji anywhere in code or UI copy.
- Run single test files with `npx vitest run tests/game/hexchess/<file>.test.ts`.
- `tests/game/pathfinding.test.ts` has pre-existing TS errors — ignore it; never "fix" it in this plan.
- `npm run build` must pass at the end of every task (it type-checks).
- Commit per task as written (plan-approved); do NOT push.
- The standard board's behavior must not change: `tests/game/hexchess/perft.test.ts` and all soldier/EP tests must pass untouched in every task.
- Unified movement rules (validated with the user via diagrams):
  - Army forward = centroid(promotion tiles) − centroid(army's pieces), pixel space, snapped to nearest of 12 directions (6 edges + 6 diagonals). Exact tie → diagonal ("point").
  - Point-forward army → layout pawns become engine `soldier`: move 1 forward diagonal (non-capture), capture on the 2 edge cells flanking that diagonal (±30°). EP mechanics unchanged.
  - Edge-forward army → layout pawns become engine `pawn`: move 1 cell along the forward edge (+ double-step from a starting cell), capture ONLY on the 2 **adjacent** edge cells flanking the forward edge (±60°). Those same 2 cells are its EP watch cells; its double-step creates an EP target on the passed-through cell.
- Walls: never landable; stop slider rays; block king/pawn/soldier steps, captures, and the double-step pass-through; knights leap anything (destination must be an open cell); a soldier's between-cells slide is NOT blocked by adjacent walls.
- Editor army palette (9 colors, in order): `#ffffff` (White), `#1a1a1a` (Black), `#888888` (Grey), then `PLAYER_COLORS` in display order `[0, 4, 3, 2, 1, 5]` (Red, Yellow, Green, Cyan, Blue, Purple). White/black/grey values match the existing `NEUTRAL_COLORS` in `src/game/constants.ts:49-52`.
- Seat order convention everywhere: clockwise `[0, 4, 3, 2, 1, 5]` filtered to armies present (matches `ACTIVE_PLAYERS`: 2p → `[0, 2]`, 3p → `[0, 3, 1]`).

---

### Task 1: Layout types + geometry module

**Files:**
- Modify: `src/types/game.ts` (BoardLayout, after line 193)
- Modify: `src/game/hexchess/state.ts`
- Create: `src/game/hexchess/geometry.ts`
- Modify: `src/game/hexchess/index.ts`
- Test: `tests/game/hexchess/geometry.test.ts`

**Interfaces:**
- Consumes: `EDGE_DIRECTIONS`, `DIAGONAL_DIRECTIONS`, `forwardDiagonal`, `forwardEdges` from `./directions`; `promotionCellsForPlayer`, `startingCellsForPlayer` from `./starting`; `getDefaultBoardCells` from `@/game/defaultLayout`; `cubeToPixel`, `coordKey`, `parseCoordKey`, `cubeAdd`, `cubeEquals` from `@/game/coordinates`.
- Produces (used by every later task):
  - `HexLayoutPieceType`, `HexPromotionOption`, `HexLayoutSnapshot`, `ForwardSpec`, `HexBoardGeometry`
  - `deriveForward(startCells: CubeCoord[], promoCells: CubeCoord[]): ForwardSpec | null`
  - `buildGeometry(snapshot: HexLayoutSnapshot): HexBoardGeometry`
  - `standardGeometry(): HexBoardGeometry`
  - `geometryOf(state: HexChessState): HexBoardGeometry`
  - `isOpenCell(geom: HexBoardGeometry, cell: CubeCoord): boolean`
  - `snapshotFromLayout(layout: BoardLayout): HexLayoutSnapshot`
  - `hexSeatsOfSnapshot(snapshot: HexLayoutSnapshot): HexPlayerIndex[]`
  - `HexChessState.layout?: HexLayoutSnapshot`, `HexChessConfig.layout?: HexLayoutSnapshot`

- [ ] **Step 1: Extend `BoardLayout` in `src/types/game.ts`**

Append inside the `BoardLayout` interface (after `puzzleGoalMoves?: number;`):

```ts
  // --- Mode & shared display fields ---
  // undefined = 'sternhalma' (backward compatible with all existing saves)
  gameMode?: 'sternhalma' | 'hexchess';
  // Display-only 30-degree board rotation (pointy-top -> flat-top). Both modes.
  rotated30?: boolean;
  // Board default colors per seat; play setup pre-fills from these.
  defaultColors?: Partial<Record<PlayerIndex, string>>;
  // --- Hex chess fields (gameMode === 'hexchess' only) ---
  // cellKey -> piece. 'pawn' is the unified pawn/peon; engine decides behavior.
  hexPieces?: Record<string, { player: PlayerIndex; type: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' }>;
  // Per-army promotion tiles (drawn like goals in the editor).
  promotionPositions?: Partial<Record<PlayerIndex, string[]>>;
  // Global promote-to options; undefined = all four.
  promotionOptions?: ('knight' | 'bishop' | 'rook' | 'queen')[];
```

- [ ] **Step 2: Extend hexchess state types in `src/game/hexchess/state.ts`**

Add at top: `import type { HexLayoutSnapshot } from './geometry';` (type-only import; the cycle with geometry.ts is type-only and fine).

In `HexChessConfig`: change `layoutPreset: 'v1-default';` to `layoutPreset: 'v1-default' | 'custom';`, change `soldierVariant: 'soldier' | 'pawn';` to `soldierVariant?: 'soldier' | 'pawn'; // legacy; ignored by new games`, and add `layout?: HexLayoutSnapshot;`.

In `HexChessState` add (after `result`): `layout?: HexLayoutSnapshot; // absent = standard v1 board`.

Fix the one construction site that must compile: `createInitialState` in `starting.ts` needs no change (optional fields). The play page (`src/app/play/page.tsx:249`) sets `soldierVariant: 'soldier'` — leave it for now; Task 12 removes it.

- [ ] **Step 3: Write the failing test**

Create `tests/game/hexchess/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey, cubeEquals } from '@/game/coordinates';
import {
  deriveForward, buildGeometry, standardGeometry, isOpenCell,
  type HexLayoutSnapshot,
} from '@/game/hexchess/geometry';
import { forwardDiagonal, forwardEdges } from '@/game/hexchess/directions';
import { promotionCellsForPlayer, startingCellsForPlayer } from '@/game/hexchess/starting';
import type { HexPlayerIndex } from '@/game/hexchess/state';

function snap(partial: Partial<HexLayoutSnapshot>): HexLayoutSnapshot {
  return {
    layoutId: 'test', layoutName: 'Test',
    cells: [], walls: [], pieces: {},
    promotionPositions: {}, promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
    ...partial,
  };
}

describe('deriveForward', () => {
  it('snaps an exactly-vertical vector to the straight-up diagonal (point)', () => {
    // (2,-2) - (0,2) = (2,-4) = 2 x (1,-2): exactly along the straight-up
    // diagonal in pixel space — a point forward. (Note: (0,-3)-(0,3) would be
    // the EDGE (0,-1), not a diagonal — cube axes are not pixel-vertical.)
    const fwd = deriveForward([cubeCoord(0, 2)], [cubeCoord(2, -2)]);
    expect(fwd).not.toBeNull();
    expect(fwd!.kind).toBe('point');
    // Straight up in pixel space is the diagonal (1,-2)
    expect(cubeEquals(fwd!.dir, cubeCoord(1, -2))).toBe(true);
    // capture dirs are the two edges summing to the diagonal
    const [a, b] = fwd!.captureDirs;
    expect(cubeEquals(cubeCoord(a.q + b.q, a.r + b.r, a.s + b.s), fwd!.dir)).toBe(true);
  });

  it('snaps a horizontal vector to the right edge', () => {
    const fwd = deriveForward([cubeCoord(-3, 0)], [cubeCoord(3, 0)]);
    expect(fwd!.kind).toBe('edge');
    expect(cubeEquals(fwd!.dir, cubeCoord(1, 0))).toBe(true);
    // flanking edges at +-60 degrees: (1,-1) and (0,1)
    const keys = fwd!.captureDirs.map(coordKey).sort();
    expect(keys).toEqual(['0,1', '1,-1']);
  });

  it('prefers the point (diagonal) on an exact tie', () => {
    // A vector exactly between edge (1,0) and diagonal (2,-1) does not exist on
    // the 30-degree lattice; instead test the documented tie rule directly: a
    // vector exactly along a diagonal must stay a point even though two edges
    // are equally close at 30 degrees (cos matches the diagonal exactly = 1).
    const fwd = deriveForward([cubeCoord(0, 0)], [cubeCoord(2, -1)]);
    expect(fwd!.kind).toBe('point');
  });

  it('returns null when either centroid set is empty', () => {
    expect(deriveForward([], [cubeCoord(0, 0)])).toBeNull();
    expect(deriveForward([cubeCoord(0, 0)], [])).toBeNull();
  });
});

describe('standardGeometry', () => {
  it('reproduces the hardcoded star helpers for every seat', () => {
    const geom = standardGeometry();
    const seats: HexPlayerIndex[] = [0, 1, 2, 3, 4, 5];
    for (const seat of seats) {
      const fwd = geom.forward[seat]!;
      expect(fwd.kind).toBe('point');
      expect(cubeEquals(fwd.dir, forwardDiagonal(seat))).toBe(true);
      const expectEdges = forwardEdges(seat).map(coordKey).sort();
      expect(fwd.captureDirs.map(coordKey).sort()).toEqual(expectEdges);
      expect(geom.promotionCells[seat]).toEqual(promotionCellsForPlayer(seat));
    }
    // 121-cell star, no walls
    expect(geom.cells.size).toBe(121);
    expect(geom.walls.size).toBe(0);
    // every standard starting cell is open
    for (const c of startingCellsForPlayer(0)) {
      expect(isOpenCell(geom, c)).toBe(true);
    }
  });
});

describe('buildGeometry', () => {
  it('builds cells/walls/forward/pawn-start sets from a snapshot', () => {
    const cells: string[] = [];
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
      if (Math.abs(-q - r) <= 3) cells.push(`${q},${r}`);
    }
    const s = snap({
      cells,
      walls: ['0,0'],
      pieces: {
        '-3,0': { player: 0, type: 'king' },
        '-2,0': { player: 0, type: 'pawn' },
        '3,0': { player: 2, type: 'king' },
        '2,0': { player: 2, type: 'pawn' },
      },
      promotionPositions: { 0: ['3,-1', '3,0'], 2: ['-3,0', '-3,1'] },
      promotionOptions: ['queen'],
    });
    const geom = buildGeometry(s);
    expect(geom.cells.has('0,0')).toBe(true);
    expect(geom.walls.has('0,0')).toBe(true);
    expect(isOpenCell(geom, cubeCoord(0, 0))).toBe(false);
    expect(isOpenCell(geom, cubeCoord(1, 0))).toBe(true);
    expect(isOpenCell(geom, cubeCoord(9, 9))).toBe(false); // off board
    // player 0 faces right (edge), player 2 faces left (edge)
    expect(geom.forward[0]!.kind).toBe('edge');
    expect(cubeEquals(geom.forward[0]!.dir, cubeCoord(1, 0))).toBe(true);
    expect(cubeEquals(geom.forward[2]!.dir, cubeCoord(-1, 0))).toBe(true);
    // pawn start cells recorded per army
    expect(geom.pawnStartCells[0]!.has('-2,0')).toBe(true);
    expect(geom.pawnStartCells[2]!.has('2,0')).toBe(true);
    expect(geom.promotionOptions).toEqual(['queen']);
    expect(geom.promotionCells[0]!.has('3,0')).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/game/hexchess/geometry.test.ts`
Expected: FAIL — `Cannot find module '@/game/hexchess/geometry'`.

- [ ] **Step 5: Implement `src/game/hexchess/geometry.ts`**

```ts
import type { CubeCoord, BoardLayout, PlayerIndex } from '@/types/game';
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
```

Note the unused import warning risk: `PlayerIndex` is unused — do not import it. Double-check imports compile.

- [ ] **Step 6: Export from `src/game/hexchess/index.ts`**

Add:

```ts
export {
  deriveForward, buildGeometry, standardGeometry, geometryOf, isOpenCell,
  snapshotFromLayout, hexSeatsOfSnapshot,
} from './geometry';
export type { HexLayoutSnapshot, HexLayoutPieceType, HexPromotionOption, ForwardSpec, HexBoardGeometry } from './geometry';
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/game/hexchess/geometry.test.ts` — expected PASS.
Run: `npm run build` — expected clean.

- [ ] **Step 8: Commit**

```bash
git add src/types/game.ts src/game/hexchess/state.ts src/game/hexchess/geometry.ts src/game/hexchess/index.ts tests/game/hexchess/geometry.test.ts
git commit -m "feat(hexchess): board geometry module with derived forward directions"
```

---

### Task 2: Geometry-aware board, sliders, steppers, and walls

**Files:**
- Modify: `src/game/hexchess/board.ts` (remove star-only `isOnBoard`)
- Modify: `src/game/hexchess/moves.ts` (sliding/step/knight/king move gen)
- Modify: `src/game/hexchess/check.ts` (attack cells)
- Test: `tests/game/hexchess/walls.test.ts` (new)

**Interfaces:**
- Consumes: `geometryOf`, `isOpenCell` from `./geometry` (Task 1).
- Produces: `slidingMoves(state, piece, dirs)` unchanged signature but wall/board-aware; all piece move generators respect walls. `board.ts` no longer exports `isOnBoard`.

- [ ] **Step 1: Write the failing test**

Create `tests/game/hexchess/walls.test.ts`. Build states with a custom snapshot via a small helper (this helper is reused by later tasks — keep it in this file and copy it where needed; do not create a shared test-util module unless one already exists):

```ts
import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';
import { rookMoves, bishopMoves, knightMoves, kingMoves, pseudoMovesForPiece } from '@/game/hexchess/moves';

/** Hexagonal board radius 4 with optional walls; two kings parked far apart. */
function customState(opts: {
  pieces: HexPiece[];
  walls?: string[];
  promo?: Partial<Record<number, string[]>>;
}): HexChessState {
  const cells: string[] = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
  }
  const layout: HexLayoutSnapshot = {
    layoutId: 't', layoutName: 't', cells, walls: opts.walls ?? [],
    pieces: Object.fromEntries(opts.pieces.map(p => [coordKey(p.cell), { player: p.player, type: (p.type === 'soldier' ? 'pawn' : p.type) as never }])),
    promotionPositions: (opts.promo ?? {}) as HexLayoutSnapshot['promotionPositions'],
    promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
  };
  return {
    mode: 'hexchess', pieces: opts.pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2], eliminated: [], enPassantTarget: null,
    pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
    layout,
  };
}

const king = (player: 0 | 2, q: number, r: number): HexPiece =>
  ({ id: `${player}-king-0`, player, type: 'king', cell: cubeCoord(q, r), hasMoved: false });

describe('walls in hex chess', () => {
  it('stop a rook ray and are never landable', () => {
    const rook: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(-3, 0), hasMoved: false };
    const st = customState({ pieces: [rook, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0'] });
    const targets = rookMoves(st, rook).map(coordKey);
    expect(targets).toContain('-2,0');
    expect(targets).toContain('-1,0');
    expect(targets).not.toContain('0,0');  // the wall itself
    expect(targets).not.toContain('1,0');  // beyond the wall
  });

  it('stop a bishop ray the same way', () => {
    const bishop: HexPiece = { id: '0-bishop-0', player: 0, type: 'bishop', cell: cubeCoord(-4, 2), hasMoved: false };
    // bishop slides along diagonal (2,-1): -4,2 -> -2,1 -> 0,0 -> 2,-1
    const st = customState({ pieces: [bishop, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0'] });
    const targets = bishopMoves(st, bishop).map(coordKey);
    expect(targets).toContain('-2,1');
    expect(targets).not.toContain('0,0');
    expect(targets).not.toContain('2,-1');
  });

  it('kings cannot step onto walls', () => {
    const k = king(0, 1, 0);
    const st = customState({ pieces: [k, king(2, 4, 0)], walls: ['0,0'] });
    const targets = kingMoves(st, k).map(coordKey);
    expect(targets).not.toContain('0,0');
  });

  it('knights leap over walls but cannot land on them', () => {
    const knight: HexPiece = { id: '0-knight-0', player: 0, type: 'knight', cell: cubeCoord(0, 1), hasMoved: false };
    // Leap (1,-3): 0,1 -> 1,-2 passes "over" wall territory; landing must be allowed.
    const st = customState({ pieces: [knight, king(0, -4, 0), king(2, 4, 0)], walls: ['0,0', '1,-1', '0,-1', '1,0'] });
    const targets = knightMoves(st, knight).map(coordKey);
    expect(targets).toContain('1,-2');    // leap over surrounded terrain
    expect(targets).not.toContain('1,-1'); // wall cell is in KNIGHT_LEAPS distance for other leaps? it is not a leap target from 0,1 — assert none of the wall cells appear
    for (const w of ['0,0', '1,-1', '0,-1', '1,0']) expect(targets).not.toContain(w);
  });

  it('moves never leave the custom board shape', () => {
    const rook: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(4, 0), hasMoved: false };
    const st = customState({ pieces: [rook, king(0, -4, 0), king(2, 0, 4)] });
    const targets = rookMoves(st, rook).map(coordKey);
    expect(targets).not.toContain('5,0'); // radius-4 board; 5,0 is off-board (would be on the 121 star)
  });

  it('pseudoMovesForPiece returns [] for a pawn-army with no derived forward', () => {
    const soldier: HexPiece = { id: '0-soldier-0', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const st = customState({ pieces: [soldier, king(0, -4, 0), king(2, 4, 0)] }); // no promotion tiles -> no forward
    expect(pseudoMovesForPiece(st, soldier)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/hexchess/walls.test.ts`
Expected: FAIL — moves ignore walls/custom cells (rook reaches `0,0`, etc.). The last test also fails until Task 3.

- [ ] **Step 3: Implement**

In `src/game/hexchess/board.ts`:
- Delete the `boardCellSet` / `boardCells()` / `isOnBoard` block (lines 6-16) and the `getDefaultBoardCells` import.
- Everything else stays.

In `src/game/hexchess/moves.ts`:
- Replace the import of `isOnBoard` with `import { geometryOf, isOpenCell } from './geometry';` (keep the other `./board` imports).
- `slidingMoves`: compute `const geom = geometryOf(state);` at the top; loop condition becomes `while (isOpenCell(geom, cell))`. (A wall or off-board cell ends the ray; a wall is not pushed as a target because the loop never enters it.)
- `stepMoves`: add `const geom = geometryOf(state);`; replace `if (!isOnBoard(cell)) continue;` with `if (!isOpenCell(geom, cell)) continue;`. This covers king and knight (knights leap by construction — only the destination is checked).
- `soldierMoves` / `pawnMoves` / `applyMoveCore`: replace every `isOnBoard(x)` with `isOpenCell(geom, x)` after adding `const geom = geometryOf(state);` at the top of each function (full rewrite of these two generators lands in Task 3 — for this task, a minimal mechanical substitution keeps the standard-board tests green; the forward helpers stay as-is until Task 3).

In `src/game/hexchess/check.ts`:
- Replace `isOnBoard` import with `import { geometryOf, isOpenCell } from './geometry';`.
- `slidingAttackCells`: same loop-condition change as `slidingMoves` (add `const geom = geometryOf(state);`).
- `attackCellsForPiece`: knight/king/soldier/pawn branches use `.filter(c => isOpenCell(geometryOf(state), c))` — hoist `const geom = geometryOf(state);` at the function top and filter with `c => isOpenCell(geom, c)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/game/hexchess/walls.test.ts` — expected: all PASS except the final "no derived forward" test (still red until Task 3 — mark it `it.skip` for this commit with a `// un-skipped in Task 3` comment IF it fails; if the mechanical substitution already makes it pass, leave it).
Run: `npx vitest run tests/game/hexchess` — expected: all existing tests PASS (standard geometry is identical).

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/board.ts src/game/hexchess/moves.ts src/game/hexchess/check.ts tests/game/hexchess/walls.test.ts
git commit -m "feat(hexchess): geometry-aware move generation with wall rules"
```

---

### Task 3: Unified pawn/soldier rules from geometry

**Files:**
- Modify: `src/game/hexchess/moves.ts` (`soldierMoves`, `pawnMoves`, `applyMoveCore`)
- Modify: `src/game/hexchess/check.ts` (soldier/pawn attack cells)
- Modify: `src/game/hexchess/starting.ts` (delete `pawnStartingCellsForPlayer`)
- Modify: `src/game/hexchess/index.ts` (drop that export)
- Test: rewrite `tests/game/hexchess/pawn.test.ts`, `tests/game/hexchess/pawnDoubleStep.test.ts`, `tests/game/hexchess/pawnEnPassant.test.ts`
- Audit: `src/game/ai/hexchess/moveOrdering.ts`, `src/game/ai/hexchess/search.ts` for imports of `forwardDiagonal` / `promotionCellsForPlayer` / `pawnStartingCellsForPlayer` — update to geometry equivalents if present.

**Interfaces:**
- Consumes: `ForwardSpec`, `geometryOf`, `isOpenCell` (Task 1); `customState` test-helper pattern (Task 2).
- Produces: `pawnMoves(state, piece): PawnPseudoMove[]` (the `options` parameter and `PawnMovesOptions` are DELETED); `soldierMoves(state, piece)` unchanged signature. `applyMoveCore` reads promotion cells/options and EP directions from geometry.

**Rules recap (from Global Constraints):** soldier = move 1 along `fwd.dir` (a diagonal), capture on `fwd.captureDirs`; EP target creation on its non-capture move = both passed-between cells + the vacated cell (existing behavior, directions now from geometry). Pawn = move 1 along `fwd.dir` (an edge), double-step when on a `pawnStartCells` cell (both cells open+empty), capture on `fwd.captureDirs` (adjacent flanking edges), EP watch on those same cells; double-step creates EP target at the passed-through midpoint cell.

- [ ] **Step 1: Rewrite the three pawn test files (failing first)**

Replace the CONTENTS of `tests/game/hexchess/pawn.test.ts` entirely. Use the `customState` helper from Task 2 (copy it into each file), with a horizontal board: player 0 pieces on the left, promotion tiles on the right column, so player 0's forward is edge `(1,0)` with captures `(1,-1)` and `(0,1)`; player 2 mirrored.

```ts
import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';
import { pawnMoves } from '@/game/hexchess/moves';

function customState(opts: {
  pieces: HexPiece[];
  walls?: string[];
}): HexChessState {
  const cells: string[] = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
  }
  const layout: HexLayoutSnapshot = {
    layoutId: 't', layoutName: 't', cells, walls: opts.walls ?? [],
    pieces: Object.fromEntries(opts.pieces.map(p => [
      coordKey(p.cell),
      { player: p.player, type: (p.type === 'pawn' || p.type === 'soldier' ? 'pawn' : p.type) as never },
    ])),
    // Player 0 promotes on the right edge column, player 2 on the left:
    // forward(0) snaps to edge (1,0); forward(2) snaps to edge (-1,0).
    promotionPositions: { 0: ['4,-2', '4,-1', '4,0'], 2: ['-4,0', '-4,1', '-4,2'] },
    promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
  };
  return {
    mode: 'hexchess', pieces: opts.pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2], eliminated: [], enPassantTarget: null,
    pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
    layout,
  };
}

// IMPORTANT: kings sit on r=0 so each army's centroid stays near the r=0 axis
// and the derived forward reliably snaps to the horizontal EDGE (1,0)/(-1,0).
// (A king at e.g. (-4,3) drags the centroid enough that the diagonal (2,-1)
// wins the snap and every assertion below breaks.)
const kings: HexPiece[] = [
  { id: '0-king-0', player: 0, type: 'king', cell: cubeCoord(-4, 0), hasMoved: false },
  { id: '2-king-0', player: 2, type: 'king', cell: cubeCoord(4, 0), hasMoved: false },
];
const pawn = (q: number, r: number, player: 0 | 2 = 0): HexPiece =>
  ({ id: `${player}-pawn-0`, player, type: 'pawn', cell: cubeCoord(q, r), hasMoved: false });

describe('edge-forward pawn', () => {
  it('moves exactly 1 cell along the forward edge when empty', () => {
    const p = pawn(0, 0);
    const st = customState({ pieces: [p, ...kings] });
    const nonCaptures = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(nonCaptures.map(m => coordKey(m.to))).toEqual(['1,0']);
  });

  it('cannot move forward onto ANY piece (no capture straight ahead)', () => {
    const p = pawn(0, 0);
    const enemy: HexPiece = { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(1, 0), hasMoved: false };
    const st = customState({ pieces: [p, enemy, ...kings] });
    expect(pawnMoves(st, p).filter(m => !m.isCapture)).toHaveLength(0);
    // and the straight-ahead enemy is NOT capturable
    expect(pawnMoves(st, p).some(m => coordKey(m.to) === '1,0')).toBe(false);
  });

  it('captures only on the two adjacent flanking cells', () => {
    const p = pawn(0, 0);
    const e1: HexPiece = { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(1, -1), hasMoved: false };
    const e2: HexPiece = { id: '2-rook-1', player: 2, type: 'rook', cell: cubeCoord(0, 1), hasMoved: false };
    const st = customState({ pieces: [p, e1, e2, ...kings] });
    const captures = pawnMoves(st, p).filter(m => m.isCapture);
    expect(captures.map(m => coordKey(m.to)).sort()).toEqual(['0,1', '1,-1']);
  });

  it('does not capture own pieces on flanking cells', () => {
    const p = pawn(0, 0);
    const own: HexPiece = { id: '0-rook-0', player: 0, type: 'rook', cell: cubeCoord(1, -1), hasMoved: false };
    const st = customState({ pieces: [p, own, ...kings] });
    expect(pawnMoves(st, p).filter(m => m.isCapture)).toHaveLength(0);
  });

  it('mirrored army: player 2 pawn moves along (-1,0) and captures on (-1,1)/(0,-1)', () => {
    const p = pawn(0, 0, 2);
    const st = customState({ pieces: [p, ...kings] });
    st.currentPlayer = 2;
    const nonCaptures = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(nonCaptures.map(m => coordKey(m.to))).toEqual(['-1,0']);
  });
});
```

Replace `tests/game/hexchess/pawnDoubleStep.test.ts` (same helper + `applyMove` import):

```ts
// same imports + customState + kings + pawn helpers as pawn.test.ts, plus:
import { applyMove, pseudoMovesForPiece } from '@/game/hexchess/moves';

describe('edge-forward pawn double-step', () => {
  it('offers the double-step only from a layout starting cell', () => {
    const p = pawn(-2, 0);            // -2,0 IS its snapshot cell -> a start cell
    const st = customState({ pieces: [p, ...kings] });
    const moves = pawnMoves(st, p).filter(m => !m.isCapture);
    expect(moves.map(m => coordKey(m.to)).sort()).toEqual(['-1,0', '0,0']);
    expect(moves.find(m => coordKey(m.to) === '0,0')!.isDoubleStep).toBe(true);
  });

  it('no double-step once the pawn is off its start cell', () => {
    const p = pawn(-2, 0);
    const st = customState({ pieces: [p, ...kings] });
    const dbl = pseudoMovesForPiece(st, p).find(m => m.isDoubleStep)!;
    const next = applyMove(st, dbl);
    const moved = next.pieces.find(pc => pc.id === p.id)!;
    const later = pawnMoves(next, moved).filter(m => !m.isCapture);
    expect(later.every(m => !m.isDoubleStep)).toBe(true);
  });

  it('double-step blocked when the pass-through or landing cell is occupied or a wall', () => {
    const p = pawn(-2, 0);
    const blockAt = (key: string, walls?: string[]) => {
      const blocker: HexPiece | null = walls ? null :
        { id: '2-rook-0', player: 2, type: 'rook', cell: cubeCoord(...key.split(',').map(Number) as [number, number]), hasMoved: false };
      return customState({ pieces: blocker ? [p, blocker, ...kings] : [p, ...kings], walls });
    };
    // pass-through occupied
    expect(pawnMoves(blockAt('-1,0'), p).some(m => m.isDoubleStep)).toBe(false);
    // landing occupied
    expect(pawnMoves(blockAt('0,0'), p).some(m => m.isDoubleStep)).toBe(false);
    // pass-through is a wall
    expect(pawnMoves(blockAt('-1,0', ['-1,0']), p).some(m => m.isDoubleStep)).toBe(false);
  });

  it('double-step records an EP target on the passed-through cell', () => {
    const p = pawn(-2, 0);
    const st = customState({ pieces: [p, ...kings] });
    const dbl = pseudoMovesForPiece(st, p).find(m => m.isDoubleStep)!;
    const next = applyMove(st, dbl);
    expect(next.enPassantTarget).not.toBeNull();
    expect(next.enPassantTarget!.targetCells.map(coordKey)).toEqual(['-1,0']);
    expect(next.enPassantTarget!.availableUntilTurn).toBe(next.turnNumber);
  });
});
```

Replace `tests/game/hexchess/pawnEnPassant.test.ts`:

```ts
// same customState/kings/pawn helpers; import applyMove, pseudoMovesForPiece, pawnMoves

describe('edge-forward pawn en passant', () => {
  it('captures a double-stepping enemy pawn via a flanking cell', () => {
    // White pawn at its start -2,0 double-steps to 0,0 passing through -1,0.
    // Black pawn sits at -1,-1: its capture dirs are (-1,1) and (0,-1)... choose
    // instead a black pawn at 0,-1 whose flanking capture cells include -1,0:
    // black forward is (-1,0); captureDirs are (-1,1) and (0,-1).
    // From cell 0,-1: 0,-1 + (-1,1) = -1,0  -> watches the passed-through cell.
    const white = pawn(-2, 0);
    const black = pawn(0, -1, 2);
    const st = customState({ pieces: [white, black, ...kings] });
    const dbl = pseudoMovesForPiece(st, white).find(m => m.isDoubleStep)!;
    const afterDouble = applyMove(st, dbl);           // black to move
    const ep = pawnMoves(afterDouble, black).filter(m => m.isEnPassant);
    expect(ep).toHaveLength(1);
    expect(coordKey(ep[0].to)).toBe('-1,0');
    expect(coordKey(ep[0].epCapturedCell!)).toBe('0,0'); // the double-stepper's cell
  });

  it('EP expires after one turn', () => {
    const white = pawn(-2, 0);
    const black = pawn(0, -1, 2);
    const farWhite = { ...pawn(-2, 2), id: '0-pawn-1' };
    const st = customState({ pieces: [white, black, farWhite, ...kings] });
    const dbl = pseudoMovesForPiece(st, white).find(m => m.isDoubleStep)!;
    let s = applyMove(st, dbl);
    // black plays something else (its own single step)
    const other = pseudoMovesForPiece(s, s.pieces.find(p => p.id === black.id)!)
      .find(m => !m.isEnPassant)!;
    s = applyMove(s, other);
    // white moves, then black no longer has EP
    const w2 = pseudoMovesForPiece(s, s.pieces.find(p => p.id === farWhite.id)!)[0];
    s = applyMove(s, w2);
    const blackNow = s.pieces.find(p => p.id === black.id)!;
    expect(pawnMoves(s, blackNow).filter(m => m.isEnPassant)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/game/hexchess/pawn.test.ts tests/game/hexchess/pawnDoubleStep.test.ts tests/game/hexchess/pawnEnPassant.test.ts`
Expected: FAIL (legacy pawn rules still in place).

- [ ] **Step 3: Implement the generators**

In `src/game/hexchess/moves.ts` replace `soldierMoves` and `pawnMoves` bodies:

```ts
export function soldierMoves(state: HexChessState, piece: HexPiece): SoldierPseudoMove[] {
  const geom = geometryOf(state);
  const fwd = geom.forward[piece.player];
  if (!fwd) return [];
  const out: SoldierPseudoMove[] = [];
  const forwardCell = cubeAdd(piece.cell, fwd.dir);
  if (isOpenCell(geom, forwardCell) && pieceAt(state, forwardCell) === null) {
    out.push({ to: forwardCell, isCapture: false });
  }
  for (const e of fwd.captureDirs) {
    const cell = cubeAdd(piece.cell, e);
    if (!isOpenCell(geom, cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player !== piece.player) {
      out.push({ to: cell, isCapture: true });
    }
  }
  // En passant: unchanged semantics; capture directions now come from geometry.
  const ep = state.enPassantTarget;
  if (ep && ep.availableUntilTurn === state.turnNumber) {
    const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
    // No type check on the captured piece — a promoted peon is still capturable
    // en passant if the enemy had already committed to the double-step response.
    if (capturedPiece && capturedPiece.player !== piece.player) {
      for (const e of fwd.captureDirs) {
        const edgeCell = cubeAdd(piece.cell, e);
        if (!isOpenCell(geom, edgeCell)) continue;
        if (pieceAt(state, edgeCell) !== null) continue;
        for (const targetCell of ep.targetCells) {
          if (edgeCell.q === targetCell.q && edgeCell.r === targetCell.r) {
            out.push({ to: edgeCell, isCapture: true, isEnPassant: true, epCapturedCell: capturedPiece.cell });
          }
        }
      }
    }
  }
  return out;
}

export function pawnMoves(state: HexChessState, piece: HexPiece): PawnPseudoMove[] {
  const geom = geometryOf(state);
  const fwd = geom.forward[piece.player];
  if (!fwd) return [];
  const onStart = geom.pawnStartCells[piece.player]?.has(coordKey(piece.cell)) ?? false;
  const out: PawnPseudoMove[] = [];
  // Move: 1 step along the forward direction; double-step from a start cell.
  const c1 = cubeAdd(piece.cell, fwd.dir);
  if (isOpenCell(geom, c1) && pieceAt(state, c1) === null) {
    out.push({ to: c1, isCapture: false });
    if (onStart) {
      const c2 = cubeAdd(c1, fwd.dir);
      if (isOpenCell(geom, c2) && pieceAt(state, c2) === null) {
        out.push({ to: c2, isCapture: false, isDoubleStep: true });
      }
    }
  }
  // Capture: the two adjacent flanking cells only.
  for (const d of fwd.captureDirs) {
    const cell = cubeAdd(piece.cell, d);
    if (!isOpenCell(geom, cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player !== piece.player) out.push({ to: cell, isCapture: true });
  }
  // En passant: a flanking cell that is empty AND an active EP target.
  const ep = state.enPassantTarget;
  if (ep && ep.availableUntilTurn === state.turnNumber) {
    const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
    if (capturedPiece && capturedPiece.player !== piece.player) {
      for (const d of fwd.captureDirs) {
        const cell = cubeAdd(piece.cell, d);
        if (!isOpenCell(geom, cell)) continue;
        if (pieceAt(state, cell) !== null) continue;
        for (const targetCell of ep.targetCells) {
          if (cell.q === targetCell.q && cell.r === targetCell.r) {
            out.push({ to: cell, isCapture: true, isEnPassant: true, epCapturedCell: capturedPiece.cell });
          }
        }
      }
    }
  }
  return out;
}
```

Delete `PawnMovesOptions` and the `options` parameter. Delete `pawnStartingCellsForPlayer` from `starting.ts` and its export in `index.ts` (grep first: `grep -rn pawnStartingCellsForPlayer src tests` — update `tests/game/hexchess/starting.test.ts` if it references it: delete that assertion).

In `applyMoveCore`:
- Promotion detection: replace the `promotionCellsForPlayer(...)` call with geometry:

```ts
  const geom = geometryOf(state);
  const isPromotionCell =
    isPromotingType &&
    movingPiece !== undefined &&
    (geom.promotionCells[movingPiece.player]?.has(coordKey(move.to)) ?? false);
  const promotionOptions = geom.promotionOptions;
  const pendingPromotion = isPromotionCell && movingPiece !== undefined && promotionOptions.length > 0
    ? { pieceId: move.pieceId, targetCell: move.to, options: [...promotionOptions] }
    : null;
```

Remove the `promotionCellsForPlayer` import from moves.ts.
- Soldier EP-creation branch: replace `forwardEdges(movingPiece.player)` with `geom.forward[movingPiece.player]!.captureDirs` (guard: wrap the whole soldier branch in `const fwd = geom.forward[movingPiece.player]; if (fwd) { ... }`). Remove the now-unused `forwardEdges`/`forwardDiagonal` imports if nothing else uses them.
- Pawn double-step EP midpoint: unchanged (midpoint of an edge double-step is a real cell).

In `src/game/hexchess/check.ts` `attackCellsForPiece`, replace the soldier and pawn branches:

```ts
    case 'soldier':
    case 'pawn': {
      // Both capture on their geometry captureDirs — attack cells are exactly those.
      const fwd = geometryOf(state).forward[piece.player];
      if (!fwd) return [];
      const geom = geometryOf(state);
      return fwd.captureDirs.map(e => cubeAdd(piece.cell, e)).filter(c => isOpenCell(geom, c));
    }
```

Remove the `forwardDiagonal`/`forwardEdges` imports from check.ts if now unused.

In `promotion.ts` `confirmPromotion`: the `VALID_PROMOTION_TYPES` guard stays as a safety net; no change needed (options flow from `pendingPromotion.options`).

Audit: `grep -rn "promotionCellsForPlayer\|forwardDiagonal\|forwardEdges" src/game/ai/hexchess/` — if `moveOrdering.ts` or `search.ts` use them, switch to `geometryOf(state)` equivalents (`geom.promotionCells[player]`, `geom.forward[player]`). If they don't, no change.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/game/hexchess` — expected: ALL pass, including `perft.test.ts`, `soldier*.test.ts` (standard geometry produces identical soldier behavior) and the rewritten pawn suite. Un-skip the Task 2 skipped test if it was skipped.
Run: `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add -A src/game/hexchess src/game/ai/hexchess tests/game/hexchess
git commit -m "feat(hexchess): unified pawn/peon rules driven by derived forward direction"
```

---

### Task 4: Game creation from a custom layout

**Files:**
- Modify: `src/game/hexchess/starting.ts` (`createInitialState`)
- Test: `tests/game/hexchess/customSetup.test.ts` (new)

**Interfaces:**
- Consumes: `buildGeometry`, `hexSeatsOfSnapshot`, `HexLayoutSnapshot` (Task 1).
- Produces: `createInitialState(config)` handles `config.layout`; piece ids are `${seat}-${engineType}-${n}` with `n` counting per (seat, engineType) over cell keys sorted lexicographically (deterministic → replays reconstruct identically).

- [ ] **Step 1: Write the failing test**

`tests/game/hexchess/customSetup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';

function makeConfig(layout: HexLayoutSnapshot, seats: HexChessConfig['seats']): HexChessConfig {
  return {
    id: 'g1', seats,
    players: Object.fromEntries(seats.map((s, i) => [s, { color: i === 0 ? '#ffffff' : '#1a1a1a', name: `P${i}`, isAI: false }])),
    layoutPreset: 'custom', ai: null, layout,
  };
}

const cells: string[] = [];
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
}

describe('createInitialState from custom layout', () => {
  it('assigns engine type soldier for point-forward and pawn for edge-forward armies', () => {
    const layout: HexLayoutSnapshot = {
      layoutId: 'L', layoutName: 'L', cells, walls: [],
      pieces: {
        // Army 0: promotes to the RIGHT (edge forward) -> pawns
        '-3,0': { player: 0, type: 'king' },
        '-2,0': { player: 0, type: 'pawn' },
        // Army 2: centroid (1,2) -> promo centroid (3,-2): delta (2,-4) is
        // EXACTLY 2 x diagonal (1,-2) -> point forward -> soldiers.
        '0,2': { player: 2, type: 'king' },
        '2,2': { player: 2, type: 'pawn' },
      },
      promotionPositions: { 0: ['4,-2', '4,0'], 2: ['2,-2', '4,-2'] },
      promotionOptions: ['queen', 'rook'],
    };
    const st = createInitialState(makeConfig(layout, [0, 2]));
    const p0 = st.pieces.find(p => p.player === 0 && p.type !== 'king')!;
    const p2 = st.pieces.find(p => p.player === 2 && p.type !== 'king')!;
    expect(p0.type).toBe('pawn');
    expect(p2.type).toBe('soldier');
    expect(st.layout).toBe(layout);
    expect(st.activePlayers).toEqual([0, 2]);
    expect(st.currentPlayer).toBe(0);
  });

  it('produces deterministic piece ids (per-seat, per-type counters over sorted cell keys)', () => {
    const layout: HexLayoutSnapshot = {
      layoutId: 'L', layoutName: 'L', cells, walls: [],
      pieces: {
        '0,3': { player: 0, type: 'king' },
        '1,2': { player: 0, type: 'rook' },
        '-1,3': { player: 0, type: 'rook' },
        '0,-3': { player: 2, type: 'king' },
      },
      promotionPositions: {}, promotionOptions: ['queen'],
    };
    const a = createInitialState(makeConfig(layout, [0, 2]));
    const b = createInitialState(makeConfig(layout, [0, 2]));
    expect(a.pieces.map(p => p.id).sort()).toEqual(b.pieces.map(p => p.id).sort());
    expect(a.pieces.filter(p => p.type === 'rook').map(p => p.id).sort()).toEqual(['0-rook-0', '0-rook-1']);
  });

  it('standard config (no layout) is unchanged', () => {
    const cfg: HexChessConfig = {
      id: 'g2', seats: [0, 2],
      players: { 0: { color: '#fff', name: 'a', isAI: false }, 2: { color: '#000', name: 'b', isAI: false } },
      layoutPreset: 'v1-default', ai: null,
    };
    const st = createInitialState(cfg);
    expect(st.pieces).toHaveLength(26); // 13 per seat in v1
    expect(st.layout).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/game/hexchess/customSetup.test.ts` — FAIL (layout ignored).

- [ ] **Step 3: Implement in `starting.ts`**

Add imports: `import { buildGeometry } from './geometry';`, `import { parseCoordKey } from '@/game/coordinates';` (extend the existing coordinates import).

In `createInitialState`, at the top:

```ts
export function createInitialState(config: HexChessConfig): HexChessState {
  if (config.layout) return createInitialStateFromLayout(config);
  // ... existing v1 body unchanged ...
}

function createInitialStateFromLayout(config: HexChessConfig): HexChessState {
  const snapshot = config.layout!;
  const geom = buildGeometry(snapshot);
  const seats = config.seats;
  const seatSet = new Set(seats);
  // Sort cell keys lexicographically for a deterministic, replay-stable order.
  const entries = Object.entries(snapshot.pieces).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const counters = new Map<string, number>();
  const pieces: HexPiece[] = [];
  for (const [key, pc] of entries) {
    if (!seatSet.has(pc.player)) continue;
    const fwd = geom.forward[pc.player];
    const engineType: HexPieceType = pc.type === 'pawn'
      ? (fwd?.kind === 'edge' ? 'pawn' : 'soldier')
      : pc.type;
    const counterKey = `${pc.player}-${engineType}`;
    const n = counters.get(counterKey) ?? 0;
    counters.set(counterKey, n + 1);
    pieces.push({ id: `${pc.player}-${engineType}-${n}`, player: pc.player, type: engineType, cell: parseCoordKey(key), hasMoved: false });
  }
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: seats[0],
    turnNumber: 1,
    activePlayers: [...seats],
    eliminated: [],
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
    layout: snapshot,
  };
}
```

- [ ] **Step 4: Run tests + build; commit**

Run: `npx vitest run tests/game/hexchess` then `npm run build`.

```bash
git add src/game/hexchess/starting.ts tests/game/hexchess/customSetup.test.ts
git commit -m "feat(hexchess): create games from custom layout snapshots"
```

---

### Task 5: Zobrist over the radius-10 grid

**Files:**
- Modify: `src/game/hexchess/zobrist.ts`
- Test: extend `tests/game/hexchess/zobrist.test.ts`

**Interfaces:** public API unchanged (`hashState`, `updateHash`, `initZobristTable`). Cell indexing switches from the 121-star to the radius-10 hex (331 cells, matching the editor's `GRID_RADIUS = 10`).

- [ ] **Step 1: Write the failing test**

Append to `tests/game/hexchess/zobrist.test.ts`:

```ts
import { cubeCoord as cc } from '@/game/coordinates';

describe('zobrist on custom boards', () => {
  it('hashes pieces on cells outside the 121-star without throwing', () => {
    // (9,0) is outside the star (|q|<=8 there) but inside radius 10.
    const st: HexChessState = {
      mode: 'hexchess',
      pieces: [
        { id: '0-king-0', player: 0, type: 'king', cell: cc(9, 0), hasMoved: false },
        { id: '2-king-0', player: 2, type: 'king', cell: cc(-9, 0), hasMoved: false },
      ],
      currentPlayer: 0, turnNumber: 1, activePlayers: [0, 2], eliminated: [],
      enPassantTarget: null, pendingPromotion: null, moveHistory: [],
      positionHashes: {}, result: null,
    };
    const h1 = hashState(st);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    const moved = { ...st, pieces: [{ ...st.pieces[0], cell: cc(9, -1) }, st.pieces[1]] };
    expect(hashState(moved)).not.toBe(h1);
  });
});
```

(Reuse the file's existing imports/state helpers; adapt names to what the file already uses.)

- [ ] **Step 2: Run to verify it fails** — the star-based cell index lookup misses `9,0` (throws or collides).

- [ ] **Step 3: Implement**

In `zobrist.ts`, replace the cell enumeration source. Where the table init builds its cell index from `getDefaultBoardCells()`, substitute a radius-10 enumeration:

```ts
const ZOBRIST_RADIUS = 10; // matches the editor grid; every layout cell fits

function allZobristCellKeys(): string[] {
  const keys: string[] = [];
  for (let q = -ZOBRIST_RADIUS; q <= ZOBRIST_RADIUS; q++) {
    for (let r = -ZOBRIST_RADIUS; r <= ZOBRIST_RADIUS; r++) {
      if (Math.abs(-q - r) <= ZOBRIST_RADIUS) keys.push(`${q},${r}`);
    }
  }
  return keys;
}
```

Use `allZobristCellKeys()` wherever the table sizes/indexes cells (piece keys and EP keys); remove the `getDefaultBoardCells` import. Read the current implementation (lines 60-165) and keep its structure — only the cell universe changes. Old saves' stored `positionHashes` become stale; that is accepted (documented precedent from the multiplayer migration) — repetition counts restart, nothing crashes.

- [ ] **Step 4: Run tests + build; commit**

Run: `npx vitest run tests/game/hexchess/zobrist.test.ts tests/game/hexchess/perft.test.ts` then the full hexchess dir, then `npm run build`.

```bash
git add src/game/hexchess/zobrist.ts tests/game/hexchess/zobrist.test.ts
git commit -m "feat(hexchess): widen zobrist cell space to radius-10 grid"
```

---

### Task 6: Persistence schemaVersion 3

**Files:**
- Modify: `src/game/hexchess/persistence.ts`
- Test: extend `tests/game/hexchess/persistence.test.ts`

**Interfaces:** `SavedHexChessGame.schemaVersion: 3`. Loader accepts 3 (as-is), 2 (stamp to 3 — shape is compatible; `config.layout`/`state.layout` simply absent), and v1 (existing migration, then stamp 3).

- [ ] **Step 1: Write the failing test**

Append to `tests/game/hexchess/persistence.test.ts` (reuse its existing save/load fixtures):

```ts
it('writes schemaVersion 3 and loads v2 records as standard-board games', () => {
  // Save via the normal path; assert version 3 on the stored record.
  saveHexChessGame(config, state);   // use the file's existing config/state fixture
  const raw = JSON.parse(localStorage.getItem(`hexchess-game-${config.id}`)!);
  expect(raw.schemaVersion).toBe(3);

  // Hand-craft a v2 record: same shape, schemaVersion 2, no layout fields.
  raw.schemaVersion = 2;
  delete raw.state.layout;
  delete raw.config.layout;
  localStorage.setItem(`hexchess-game-${config.id}`, JSON.stringify(raw));
  const loaded = loadHexChessGame(config.id);
  expect(loaded).not.toBeNull();
  expect(loaded!.schemaVersion).toBe(3);
  expect(loaded!.state.layout).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails** — stored records still say `schemaVersion: 2`.

- [ ] **Step 3: Implement**

In `persistence.ts`:
- `SavedHexChessGame.schemaVersion: 2` → `3`.
- In `saveHexChessGame` the record literal: `schemaVersion: 3`.
- In `migrateV1`'s returned object: `schemaVersion: 3`.
- In `loadHexChessGame` replace the version check:

```ts
    const version = (parsed as { schemaVersion: number }).schemaVersion;
    if (version === 3) return parsed;
    if (version === 2) return { ...parsed, schemaVersion: 3 };
    return migrateV1(parsed);
```

- [ ] **Step 4: Run tests + build; commit**

```bash
git add src/game/hexchess/persistence.ts tests/game/hexchess/persistence.test.ts
git commit -m "feat(hexchess): schemaVersion 3 saves with embedded layout snapshots"
```

---

### Task 7: Hex chess layout validation

**Files:**
- Modify: `src/game/layoutValidation.ts`
- Test: `tests/game/hexchessLayoutValidation.test.ts` (new)

**Interfaces:**
- Produces: `validateLayout(layout)` dispatches on `layout.gameMode === 'hexchess'` to a new `validateHexChessLayout(layout): LayoutValidationResult` (also exported).

Rules (spec): (1) at least 2 armies with pieces; (2) exactly one king per army; (3) every army with pawns has at least one promotion tile on a live non-wall cell; (4) at least one promote-to option enabled if any army has pawns; (5) all pieces and promotion tiles on live non-wall cells.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { validateLayout } from '@/game/layoutValidation';
import type { BoardLayout } from '@/types/game';

function hexLayout(over: Partial<BoardLayout>): BoardLayout {
  const cells: string[] = [];
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (Math.abs(-q - r) <= 3) cells.push(`${q},${r}`);
  }
  return {
    id: 'h1', name: 'Hex', cells, startingPositions: {}, createdAt: 0,
    gameMode: 'hexchess',
    hexPieces: {
      '-3,0': { player: 0, type: 'king' }, '-2,0': { player: 0, type: 'pawn' },
      '3,0': { player: 2, type: 'king' }, '2,0': { player: 2, type: 'pawn' },
    },
    promotionPositions: { 0: ['3,-1'], 2: ['-3,1'] },
    promotionOptions: ['queen'],
    ...over,
  };
}

describe('validateHexChessLayout (via validateLayout dispatch)', () => {
  it('accepts a well-formed layout', () => {
    expect(validateLayout(hexLayout({})).valid).toBe(true);
  });
  it('rejects fewer than 2 armies', () => {
    const r = validateLayout(hexLayout({ hexPieces: { '0,0': { player: 0, type: 'king' } } }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/2 armies/i);
  });
  it('rejects an army with zero or two kings', () => {
    const noKing = hexLayout({});
    delete noKing.hexPieces!['-3,0'];
    noKing.hexPieces!['-3,1'] = { player: 0, type: 'rook' };
    expect(validateLayout(noKing).valid).toBe(false);
    const twoKings = hexLayout({});
    twoKings.hexPieces!['-3,1'] = { player: 0, type: 'king' };
    expect(validateLayout(twoKings).valid).toBe(false);
  });
  it('rejects pawns without promotion tiles', () => {
    expect(validateLayout(hexLayout({ promotionPositions: { 2: ['-3,1'] } })).valid).toBe(false);
  });
  it('rejects when all promote-to options are off and pawns exist', () => {
    expect(validateLayout(hexLayout({ promotionOptions: [] })).valid).toBe(false);
  });
  it('rejects pieces or promotion tiles on walls / off-board cells', () => {
    expect(validateLayout(hexLayout({ walls: ['-2,0'] })).valid).toBe(false);
    expect(validateLayout(hexLayout({ promotionPositions: { 0: ['9,9'], 2: ['-3,1'] } })).valid).toBe(false);
  });
  it('does not disturb sternhalma validation', () => {
    const stern: BoardLayout = {
      id: 's', name: 's', cells: ['0,0', '1,0'], createdAt: 0,
      startingPositions: { 0: ['0,0'] }, goalPositions: { 0: ['1,0'] },
    };
    expect(validateLayout(stern).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — hexchess layouts fall into the sternhalma path ("No pieces on the board.").

- [ ] **Step 3: Implement in `layoutValidation.ts`**

```ts
export function validateLayout(layout: BoardLayout): LayoutValidationResult {
  if (layout.gameMode === 'hexchess') return validateHexChessLayout(layout);
  // ... existing body unchanged ...
}

export function validateHexChessLayout(layout: BoardLayout): LayoutValidationResult {
  const errors: string[] = [];
  const cellSet = new Set(layout.cells);
  const wallSet = new Set(layout.walls ?? []);
  const live = (k: string) => cellSet.has(k) && !wallSet.has(k);
  const pieces = layout.hexPieces ?? {};

  const armies = new Map<PlayerIndex, { kings: number; pawns: number; total: number }>();
  for (const [key, pc] of Object.entries(pieces)) {
    if (!live(key)) errors.push(`A piece sits on a wall or missing cell (${key}).`);
    const a = armies.get(pc.player) ?? { kings: 0, pawns: 0, total: 0 };
    a.total += 1;
    if (pc.type === 'king') a.kings += 1;
    if (pc.type === 'pawn') a.pawns += 1;
    armies.set(pc.player, a);
  }

  if (armies.size < 2) {
    errors.push('Hex chess needs at least 2 armies with pieces.');
    return { valid: false, errors };
  }

  let anyPawns = false;
  let armyNumber = 0;
  for (const [player, a] of armies) {
    armyNumber += 1;
    const label = `Army ${armyNumber}`;
    if (a.kings !== 1) errors.push(`${label} must have exactly one king (has ${a.kings}).`);
    if (a.pawns > 0) {
      anyPawns = true;
      const promo = (layout.promotionPositions?.[player] ?? []).filter(live);
      if (promo.length === 0) {
        errors.push(`${label} has pawns but no promotion tiles — the pawns' forward direction is undefined.`);
      }
    }
  }

  for (const [player, tiles] of Object.entries(layout.promotionPositions ?? {})) {
    for (const t of tiles ?? []) {
      if (!live(t)) errors.push(`A promotion tile for player ${Number(player) + 1} is on a wall or missing cell (${t}).`);
    }
  }

  const options = layout.promotionOptions ?? ['knight', 'bishop', 'rook', 'queen'];
  if (anyPawns && options.length === 0) {
    errors.push('At least one promote-to option must be enabled when the board has pawns.');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests + build; commit**

Run: `npx vitest run tests/game/hexchessLayoutValidation.test.ts` and the full `tests/game` dir (skip the known-broken pathfinding file if it errors — pre-existing).

```bash
git add src/game/layoutValidation.ts tests/game/hexchessLayoutValidation.test.ts
git commit -m "feat(editor): hex chess layout validation"
```

---

### Task 8: Rendering — eliminated ghosts, walls, 30-degree offset, custom cells, unified icon

**Files:**
- Modify: `src/types/boardView.ts`
- Modify: `src/store/hexChessStore.ts` (`selectHexChessBoardView`)
- Modify: `src/components/board/Board.tsx`
- Modify: `src/components/board/pieceIcons/index.tsx` (or wherever `pieceType` → icon is mapped; find with `grep -rn "soldier" src/components/board`)
- Test: `npx vitest run tests/store tests/components` (existing suites keep passing); visual checks land in Task 13.

**Interfaces:**
- `BoardPiece` gains `eliminated?: boolean`.
- `BoardView` gains `walls?: CubeCoord[]` and `rotationOffset?: number` (degrees, added to the board's display rotation; the piece counter-rotation uses the same total so pieces stay upright).

- [ ] **Step 1: Types** — add to `src/types/boardView.ts`:

```ts
// in BoardPiece:
  /** Render as a faded ghost of its color (eliminated army in 3+ player hex chess). */
  eliminated?: boolean;
// in BoardView:
  /** Wall cells to render as impassable terrain (custom layouts). */
  walls?: CubeCoord[];
  /** Extra display rotation in degrees (30 for rotated30 layouts). Purely visual. */
  rotationOffset?: number;
```

- [ ] **Step 2: `selectHexChessBoardView` in `src/store/hexChessStore.ts`**

- Import `geometryOf` from `@/game/hexchess`.
- Replace the cells derivation (`getDefaultBoardCells()`, line ~363) with:

```ts
  const geom = geometryOf(state);
  const cells: CubeCoord[] = Array.from(geom.cells).map(parseCoordKey);
```

- Replace `colorForSeat` so living color is always the owner's color, and mark eliminated pieces:

```ts
  const colorForSeat = (seat: HexPlayerIndex): string => config.players[seat]!.color;
```

and in the pieces mapping add `eliminated: isEliminated(state, piece.player)`; same for the `animatingCapture` overlay piece (`eliminated: isEliminated(state, cp.player)`).
- Delete the `ELIMINATED_GREY` usage; remove the exported constant only if `grep -rn ELIMINATED_GREY src tests` shows no other references (update any test that asserts grey to assert `eliminated: true` instead).
- Add to the returned view: `walls: Array.from(geom.walls).map(parseCoordKey)`, `rotationOffset: state.layout?.rotated30 ? 30 : 0`.

- [ ] **Step 3: `Board.tsx`**

- Rotation offset: define near the rotation state, `const rotationOffset = viewProp?.rotationOffset ?? 0;`. Find every render-time use of `cumulativeRotation` (`grep -n "cumulativeRotation" src/components/board/Board.tsx`, look for `rotate(` template usages, both the board group and the per-piece counter-rotation) and use `cumulativeRotation + rotationOffset` there. Do NOT touch the state-update logic (deltas stay in un-offset space).
- Eliminated ghost: where `view.pieces` render (the `BoardPiece` loop feeding `Piece`/piece-icon rendering), wrap the rendered piece in:

```tsx
  <g style={bp.eliminated ? { filter: 'grayscale(0.75) brightness(0.85)', opacity: 0.65 } : undefined}>
    {/* existing piece rendering */}
  </g>
```

- Walls: after the cell layer (inside the same rotated group so walls rotate with the board), render for `viewProp?.walls ?? []`:

```tsx
  {(viewProp?.walls ?? []).map((w) => {
    const { x, y } = cubeToPixel(w, HEX_SIZE);
    const hexSize = HEX_SIZE * 0.7;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      return `${x + hexSize * Math.cos(angle)},${y + hexSize * Math.sin(angle)}`;
    }).join(' ');
    return <polygon key={`wall-${w.q},${w.r}`} points={pts} fill="#6b7280" stroke="#374151" strokeWidth={2} />;
  })}
```

- [ ] **Step 4: Unified icon** — find the `pieceType` → icon mapping (`grep -rn "soldier\|Peon" src/components/board`). Point BOTH `'soldier'` and `'pawn'` at the icon currently used for `'soldier'` (the Peon icon). Keep `Pawn.tsx` on disk (unused import removal only where needed).

- [ ] **Step 5: Run + commit**

Run: `npx vitest run tests/store tests/components` and `npm run build`.

```bash
git add src/types/boardView.ts src/store/hexChessStore.ts src/components/board
git commit -m "feat(hexchess): custom-board rendering — ghost eliminated armies, walls, 30-degree offset, unified pawn icon"
```

---

### Task 9: Editor — mode switch, hexchess canvas, save/load of new fields

**Files:**
- Modify: `src/app/editor/page.tsx`
- Create: `src/components/board/hexChessTiles.ts` (move `hexChessTileColor` out of Board.tsx so the editor can reuse it)
- Modify: `src/components/board/Board.tsx` (import from the new module)

**Interfaces:**
- Produces (consumed by Tasks 10-11): editor state `editorGameMode`, `hexPieces: Map<string, { player: PlayerIndex; type: HexLayoutPieceType }>`, `promotionPositions: Record<number, Set<string>>`, `promotionOptions: Set<HexPromotionOption>`, `rotated30: boolean`, `armyColors: Partial<Record<PlayerIndex, string>>`, `hexMode: 'cells' | 'pieces' | 'promotions'`; constant `EDITOR_ARMY_COLORS`.

- [ ] **Step 1: Extract the tile color helper**

Create `src/components/board/hexChessTiles.ts` with the `HEX_CHESS_TILE_COLORS_LIGHT/DARK` constants and `hexChessTileColor(cell, darkMode)` moved verbatim from `Board.tsx:2009-2018`; export the function. Update `Board.tsx` to import it. Run `npm run build`.

- [ ] **Step 2: Editor state + mode buttons**

In `src/app/editor/page.tsx` add:

```ts
import type { HexLayoutPieceType, HexPromotionOption } from '@/game/hexchess';
import { hexChessTileColor } from '@/components/board/hexChessTiles';

type EditorGameMode = 'sternhalma' | 'hexchess';
type HexEditorMode = 'cells' | 'pieces' | 'promotions';

// 9 army colors: chess classics first, then CC player colors in display order.
export const EDITOR_ARMY_COLORS: string[] = [
  '#ffffff', '#1a1a1a', '#888888',
  PLAYER_COLORS[0], PLAYER_COLORS[4], PLAYER_COLORS[3],
  PLAYER_COLORS[2], PLAYER_COLORS[1], PLAYER_COLORS[5],
];
```

State (near the existing useState block):

```ts
  const [editorGameMode, setEditorGameMode] = useState<EditorGameMode>('sternhalma');
  const [hexMode, setHexMode] = useState<HexEditorMode>('cells');
  const [hexPieces, setHexPieces] = useState<Map<string, { player: PlayerIndex; type: HexLayoutPieceType }>>(new Map());
  const [promotionPositions, setPromotionPositions] = useState<Record<number, Set<string>>>({
    0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(),
  });
  const [promotionOptions, setPromotionOptions] = useState<Set<HexPromotionOption>>(
    () => new Set<HexPromotionOption>(['knight', 'bishop', 'rook', 'queen']));
  const [rotated30, setRotated30] = useState(false);
  // seat -> chosen color, for both modes (saved as layout.defaultColors)
  const [armyColors, setArmyColors] = useState<Partial<Record<PlayerIndex, string>>>({});
```

Mode buttons render ABOVE the board card (`before the div.rounded-lg.shadow` at line ~756):

```tsx
  <div className="flex gap-2 mb-2">
    {(['sternhalma', 'hexchess'] as EditorGameMode[]).map((m) => (
      <button
        key={m}
        onClick={() => setEditorGameMode(m)}
        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
          editorGameMode === m
            ? 'bg-blue-600 text-white shadow'
            : dm('bg-gray-800 text-gray-300 hover:bg-gray-700', 'bg-white text-gray-600 hover:bg-gray-50 shadow')
        }`}
      >
        {m === 'sternhalma' ? 'Sternhalma' : 'Hex Chess'}
      </button>
    ))}
  </div>
```

Cells and walls are shared across the toggle; the mode-specific layers stay in memory (spec: only the active mode's layers are written on save).

- [ ] **Step 3: Hexchess canvas rendering**

In the cells render loop (line ~954), branch on `editorGameMode === 'hexchess'` for ACTIVE cells: instead of `<BoardCell .../>` render a full hex tile:

```tsx
  {isActive ? (
    editorGameMode === 'hexchess' ? (
      <polygon
        points={Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 180) * (60 * i - 30);
          return `${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`;
        }).join(' ')}
        fill={hexChessTileColor(cubeCoord(q, r), darkMode)}
        stroke={darkMode ? '#2a2018' : '#a89878'}
        strokeWidth={0.8}
      />
    ) : (
      <BoardCell ... existing ... />
    )
  ) : ( ... existing inactive rendering ... )}
```

In hexchess mode also SKIP: triangle fills, border edges, goal rings, sternhalma `Piece` rendering, powerup/specialty badges (wrap those blocks in `editorGameMode === 'sternhalma' &&`). Wall rendering stays for both modes. The 30-degree rotation: wrap the whole cell/piece/wall layer in `<g transform={rotated30 ? 'rotate(30)' : undefined}>` (viewBox is origin-centered) — piece glyphs get a counter-rotation in Task 10.

- [ ] **Step 4: Save / load / clear**

`handleSave` builds the layout with the new fields:

```ts
    const layout: BoardLayout = {
      id: layoutId,
      name: layoutName,
      cells: Array.from(activeCells),
      walls: Array.from(walls),
      createdAt: Date.now(),
      gameMode: editorGameMode,
      rotated30: rotated30 || undefined,
      defaultColors: Object.keys(armyColors).length > 0 ? armyColors : undefined,
      ...(editorGameMode === 'hexchess'
        ? {
            startingPositions: {},
            hexPieces: Object.fromEntries(hexPieces),
            promotionPositions: Object.fromEntries(
              ALL_PLAYERS.filter(p => promotionPositions[p].size > 0)
                .map(p => [p, Array.from(promotionPositions[p])]),
            ) as BoardLayout['promotionPositions'],
            promotionOptions: Array.from(promotionOptions),
          }
        : {
            startingPositions: Object.fromEntries(
              ALL_PLAYERS.map((p) => [p, Array.from(startingPositions[p])]),
            ) as Record<PlayerIndex, string[]>,
            goalPositions: Object.fromEntries(
              ALL_PLAYERS.map((p) => [p, Array.from(goalPositions[p])]),
            ) as Record<PlayerIndex, string[]>,
            powerups: editorPowerups.size > 0 ? Object.fromEntries(editorPowerups) : undefined,
            pieceSpecialties: pieceSpecialties.size > 0 ? Object.fromEntries(pieceSpecialties) : undefined,
            playerCountConfig: Object.keys(playerCountConfig).length > 0 ? playerCountConfig : undefined,
          }),
    };
```

`handleLoad` (non-default-star branch): additionally `setEditorGameMode(layout.gameMode ?? 'sternhalma')`, `setRotated30(!!layout.rotated30)`, `setArmyColors(layout.defaultColors ?? {})`, `setHexPieces(new Map(Object.entries(layout.hexPieces ?? {})))`, `setPromotionPositions(Object.fromEntries(ALL_PLAYERS.map(p => [p, new Set(layout.promotionPositions?.[p] ?? [])])) as Record<number, Set<string>>)`, `setPromotionOptions(new Set(layout.promotionOptions ?? ['knight','bishop','rook','queen']))`. `handleClear` and `handleExport` mirror `handleSave`'s field logic; `handleClear` resets all new state.

Saved-layout list rows: prefix hexchess layouts with a small label `HC` (`{layout.gameMode === 'hexchess' && <span className="text-[10px] font-bold text-amber-600 shrink-0">HC</span>}`).

`applyActionToCell` cells-mode removal must also clear hexchess layers at removed keys (`hexPieces.delete(symKey)`, each `promotionPositions[p].delete(symKey)`), same as it clears starting/goal positions today.

- [ ] **Step 5: Verify + commit**

`npm run build`; `npm run dev` and manually confirm: mode buttons toggle, hexchess mode shows 3-shade tiles for active cells, cells/walls paint in both modes, saving in each mode round-trips through the saved-layouts list.

```bash
git add src/app/editor/page.tsx src/components/board/hexChessTiles.ts src/components/board/Board.tsx
git commit -m "feat(editor): hex chess editing mode with tile canvas and layout persistence"
```

---

### Task 10: Editor — Pieces tab (9-color grid, color-as-army)

**Files:**
- Create: `src/components/editor/HexPieceGrid.tsx`
- Modify: `src/app/editor/page.tsx`

**Interfaces:**
- Produces: `<HexPieceGrid brush={hexBrush} onSelect={(b) => setHexBrush(b)} armyColors={armyColors} darkMode={darkMode} />` where `hexBrush: { type: HexLayoutPieceType; color: string }`.
- Seat assignment helpers in page.tsx (consumed by Task 11): `seatForColor(color): PlayerIndex | null` and `claimSeatForColor(color): PlayerIndex | null`.

- [ ] **Step 1: Create `src/components/editor/HexPieceGrid.tsx`**

```tsx
'use client';

import { KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon, PeonIcon } from '@/components/board/pieceIcons';
import type { HexLayoutPieceType } from '@/game/hexchess';

// NOTE: confirm actual icon export names with:
//   grep -n "export" src/components/board/pieceIcons/index.tsx
// The unified pawn/peon uses the Peon glyph (the piece players know from games).

const ROWS: { type: HexLayoutPieceType; label: string; Icon: typeof PeonIcon }[] = [
  { type: 'pawn', label: 'Pawn', Icon: PeonIcon },
  { type: 'knight', label: 'Knight', Icon: KnightIcon },
  { type: 'bishop', label: 'Bishop', Icon: BishopIcon },
  { type: 'rook', label: 'Rook', Icon: RookIcon },
  { type: 'queen', label: 'Queen', Icon: QueenIcon },
  { type: 'king', label: 'King', Icon: KingIcon },
];

export interface HexBrush { type: HexLayoutPieceType; color: string }

export function HexPieceGrid({
  colors, brush, onSelect, usedColors, darkMode,
}: {
  colors: string[];
  brush: HexBrush;
  onSelect: (b: HexBrush) => void;
  /** Colors currently assigned to an army (shown with a subtle underline). */
  usedColors: Set<string>;
  darkMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {ROWS.map(({ type, label, Icon }) => (
        <div key={type} className="flex items-center gap-0.5">
          {colors.map((color) => {
            const selected = brush.type === type && brush.color === color;
            return (
              <button
                key={color}
                onClick={() => onSelect({ type, color })}
                title={`${label} (${color})`}
                className={`p-0.5 rounded transition-all ${
                  selected
                    ? `ring-2 ring-blue-500 ${darkMode ? 'ring-offset-gray-800' : ''} ring-offset-1`
                    : 'hover:scale-110'
                } ${usedColors.has(color) ? 'border-b-2 border-blue-400' : 'border-b-2 border-transparent'}`}
              >
                <Icon size={20} fill={color} outlined />
              </button>
            );
          })}
          <span className={`text-[10px] ml-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}
```

If icon components lack an `outlined` prop or `fill` prop, adapt to the actual props found in `pieceIcons/index.tsx` (the play page uses `<PawnIcon size={44} fill={color} outlined />`, so the pattern exists — mirror the Peon component's props).

- [ ] **Step 2: Wire the tab + painting into `page.tsx`**

Add brush state: `const [hexBrush, setHexBrush] = useState<HexBrush>({ type: 'pawn', color: '#ffffff' });`

Seat assignment (color = army):

```ts
  // A color IS an army. First use claims the lowest free seat in display order.
  const seatForColor = (color: string): PlayerIndex | null => {
    for (const [seat, c] of Object.entries(armyColors)) {
      if (c === color) return Number(seat) as PlayerIndex;
    }
    return null;
  };
  const usedSeats = useMemo(() => {
    const s = new Set<PlayerIndex>();
    for (const pc of hexPieces.values()) s.add(pc.player);
    return s;
  }, [hexPieces]);
  const claimSeatForColor = (color: string): PlayerIndex | null => {
    const existing = seatForColor(color);
    if (existing !== null) return existing;
    const free = PLAYER_DISPLAY_ORDER.find(p => !usedSeats.has(p) && armyColors[p] === undefined);
    if (free === undefined) return null; // 6 armies already
    setArmyColors(prev => ({ ...prev, [free]: color }));
    return free;
  };
```

Extend `applyActionToCell` with a hexchess-pieces branch (guard the whole existing body with `if (editorGameMode === 'sternhalma') { ...existing modes... } else { ...hex branch... }`; the shared `cells` mode continues to run for both — restructure so `mode === 'cells'` handling is shared and the rest branches):

```ts
    // hexchess 'pieces' painting
    if (editorGameMode === 'hexchess' && hexMode === 'pieces') {
      if (!activeCells.has(key) || walls.has(key)) return;
      const seat = action === 'add' ? claimSeatForColor(hexBrush.color) : seatForColor(hexBrush.color);
      if (action === 'add' && seat === null) { alert('Maximum of 6 armies.'); return; }
      setHexPieces(prev => {
        const next = new Map(prev);
        for (const symKey of symmetricKeys) {
          if (!activeCells.has(symKey) || walls.has(symKey)) continue;
          if (action === 'remove') next.delete(symKey);
          else if (seat !== null) next.set(symKey, { player: seat, type: hexBrush.type });
        }
        return next;
      });
      return;
    }
```

`getCellState` for this mode: `return hexPieces.has(key);` (so first click on an occupied cell removes, matching the drag-paint model). Free a seat's color when its last piece is erased: add a `useEffect` watching `hexPieces` that removes `armyColors[seat]` entries for seats not in `usedSeats` AND not referenced by promotion tiles (`promotionPositions[seat].size === 0`).

Piece glyph rendering on the canvas (hexchess mode, inside the cell loop after the tile): if `hexPieces.has(key)`, render the same icon set used by `HexPieceGrid`:

```tsx
  {editorGameMode === 'hexchess' && hexPieces.has(key) && (() => {
    const pc = hexPieces.get(key)!;
    const color = armyColors[pc.player] ?? PLAYER_COLORS[pc.player];
    const Icon = HEX_PIECE_ICONS[pc.type]; // same mapping as HexPieceGrid ROWS; export it from HexPieceGrid.tsx
    const s = HEX_SIZE * 1.5;
    return (
      <g transform={rotated30 ? `rotate(-30 ${x} ${y})` : undefined}>
        <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ overflow: 'visible' }}>
          <Icon size={s} fill={color} outlined />
        </svg>
      </g>
    );
  })()}
```

Export `HEX_PIECE_ICONS: Record<HexLayoutPieceType, ComponentType>` from `HexPieceGrid.tsx` (derived from `ROWS`). The counter-rotation keeps glyphs upright when the board is rotated 30 degrees.

Tab bar: when `editorGameMode === 'hexchess'` render tabs from `['cells', 'pieces', 'promotions']` bound to `hexMode` (labels: Cells, Pieces, Promotions) instead of the sternhalma `mode` tabs; the cells tab reuses the existing cells controls (Nodes brush label reads "Tiles" in hexchess). `getCellState`/`applyActionToCell` route on `editorGameMode`/`hexMode` accordingly. Stats row in hexchess mode: `Cells / Pieces (hexPieces.size) / Walls / Armies (usedSeats.size)/6`.

- [ ] **Step 3: Verify + commit**

`npm run build`; manual dev-server check: select white pawn, paint; select black king, paint; grey rook claims third army; erase all grey pieces frees the army; symmetry painting mirrors pieces of the same army.

```bash
git add src/components/editor/HexPieceGrid.tsx src/app/editor/page.tsx
git commit -m "feat(editor): hex chess pieces tab with 9-color army grid"
```

---

### Task 11: Editor — Promotions tab, forward readout, rotate toggle, sternhalma colors

**Files:**
- Create: `src/components/editor/HexPromotionsPanel.tsx`
- Modify: `src/app/editor/page.tsx`

**Interfaces:**
- Consumes: `deriveForward` from `@/game/hexchess`; `parseCoordKey`, `cubeToPixel`.
- Produces: `<HexPromotionsPanel ... />` controlling `promoArmy`, `promotionOptions`; canvas promotion outlines; forward readout.

- [ ] **Step 1: Create `src/components/editor/HexPromotionsPanel.tsx`**

```tsx
'use client';

import type { PlayerIndex } from '@/types/game';
import type { HexPromotionOption, ForwardSpec } from '@/game/hexchess';
import { cubeToPixel } from '@/game/coordinates';

const OPTION_LABELS: Record<HexPromotionOption, string> = {
  knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen',
};

export function HexPromotionsPanel({
  armies, armyColors, promoArmy, onSelectArmy,
  options, onToggleOption, forwards, darkMode,
}: {
  armies: PlayerIndex[];
  armyColors: Partial<Record<PlayerIndex, string>>;
  promoArmy: PlayerIndex | null;
  onSelectArmy: (p: PlayerIndex) => void;
  options: Set<HexPromotionOption>;
  onToggleOption: (o: HexPromotionOption) => void;
  /** Derived forward per army; null = promotion tiles missing/ambiguous. */
  forwards: Partial<Record<PlayerIndex, ForwardSpec | null>>;
  darkMode: boolean;
}) {
  const dm = (d: string, l: string) => (darkMode ? d : l);
  return (
    <div className="flex flex-col gap-2">
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Draw promotion tiles for</div>
      <div className="flex gap-1.5 flex-wrap">
        {armies.map((p) => (
          <button
            key={p}
            onClick={() => onSelectArmy(p)}
            className={`w-6 h-6 rounded-full transition-all ${
              promoArmy === p ? `ring-2 ring-blue-500 ${dm('ring-offset-gray-800', '')} ring-offset-1` : 'hover:scale-110'
            }`}
            style={{ backgroundColor: armyColors[p], border: '1.5px solid rgba(0,0,0,0.3)' }}
          />
        ))}
        {armies.length === 0 && (
          <span className={`text-xs ${dm('text-gray-500', 'text-gray-400')}`}>Place pieces first.</span>
        )}
      </div>
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Can promote to</div>
      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(OPTION_LABELS) as HexPromotionOption[]).map((o) => (
          <button
            key={o}
            onClick={() => onToggleOption(o)}
            className={`px-2 py-1 text-xs rounded transition-all ${
              options.has(o)
                ? 'bg-blue-600 text-white'
                : dm('bg-gray-700 text-gray-400', 'bg-gray-100 text-gray-400 line-through')
            }`}
          >
            {OPTION_LABELS[o]}
          </button>
        ))}
      </div>
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Derived forward</div>
      <div className="flex flex-col gap-1">
        {armies.map((p) => {
          const fwd = forwards[p];
          const px = fwd ? cubeToPixel(fwd.dir, 10) : null;
          const angle = px ? (Math.atan2(px.y, px.x) * 180) / Math.PI : 0;
          return (
            <div key={p} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: armyColors[p], border: '1px solid rgba(0,0,0,0.3)' }} />
              {fwd ? (
                <>
                  <svg width="14" height="14" viewBox="-7 -7 14 14" className="shrink-0">
                    <g transform={`rotate(${angle})`}>
                      <line x1={-5} y1={0} x2={3} y2={0} stroke="currentColor" strokeWidth={1.5} />
                      <path d="M2,-3 L6,0 L2,3 z" fill="currentColor" />
                    </g>
                  </svg>
                  <span>{fwd.kind === 'point' ? 'point — plays as peon' : 'edge — plays as pawn'}</span>
                </>
              ) : (
                <span className={dm('text-yellow-400', 'text-yellow-600')}>place promotion tiles to set direction</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

State: `const [promoArmy, setPromoArmy] = useState<PlayerIndex | null>(null);`

Forwards memo:

```ts
  const armyForwards = useMemo(() => {
    const out: Partial<Record<PlayerIndex, ForwardSpec | null>> = {};
    for (const seat of PLAYER_DISPLAY_ORDER) {
      const pieceCells = [...hexPieces.entries()].filter(([, pc]) => pc.player === seat).map(([k]) => parseCoordKey(k));
      if (pieceCells.length === 0) continue;
      const promoCells = [...promotionPositions[seat]].map(parseCoordKey);
      out[seat] = deriveForward(pieceCells, promoCells);
    }
    return out;
  }, [hexPieces, promotionPositions]);
```

Painting branch in `applyActionToCell`:

```ts
    if (editorGameMode === 'hexchess' && hexMode === 'promotions') {
      if (promoArmy === null) return;
      if (!activeCells.has(key) || walls.has(key)) return;
      setPromotionPositions(prev => {
        const next = { ...prev };
        const set = new Set(next[promoArmy]);
        for (const symKey of symmetricKeys) {
          if (!activeCells.has(symKey) || walls.has(symKey)) continue;
          if (action === 'remove') set.delete(symKey);
          else set.add(symKey);
        }
        next[promoArmy] = set;
        return next;
      });
      return;
    }
```

`getCellState` for this mode: `return promoArmy !== null && promotionPositions[promoArmy].has(key);`

Canvas outlines — only while the promotions tab is active AND for the selected army (spec: hidden everywhere else):

```tsx
  {editorGameMode === 'hexchess' && hexMode === 'promotions' && promoArmy !== null &&
    promotionPositions[promoArmy].has(key) && (
    <polygon
      points={Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return `${x + (HEX_SIZE - 2.5) * Math.cos(angle)},${y + (HEX_SIZE - 2.5) * Math.sin(angle)}`;
      }).join(' ')}
      fill="none"
      stroke={armyColors[promoArmy] ?? PLAYER_COLORS[promoArmy]}
      strokeWidth={2.2}
      strokeDasharray="4,2.5"
      style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.5))' }}
    />
  )}
```

Render `<HexPromotionsPanel armies={[...usedSeats in display order]} ... forwards={armyForwards} />` as the hexchess promotions tab content. Auto-select the first army when the tab opens and `promoArmy` is null or no longer used.

- [ ] **Step 3: Rotate toggle + mirror-goals hiding + sternhalma color row**

Symmetry column (line ~1536): below the mirror-goals label add (both modes):

```tsx
  <label className="flex items-center gap-2 cursor-pointer group">
    <div className="relative shrink-0">
      <input type="checkbox" checked={rotated30} onChange={() => setRotated30(v => !v)} className="sr-only" />
      <div className={`w-8 h-4 rounded-full transition-colors ${rotated30 ? 'bg-blue-500' : dm('bg-gray-600', 'bg-gray-200')}`} />
      <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${rotated30 ? 'translate-x-4' : ''}`} />
    </div>
    <div>
      <div className={`text-xs font-medium ${dm('text-gray-300 group-hover:text-gray-100', 'text-gray-700 group-hover:text-gray-900')}`}>Rotate board 30&deg;</div>
      <div className={`text-xs ${dm('text-gray-500', 'text-gray-500')}`}>Saved with the layout</div>
    </div>
  </label>
```

Mirror-goals toggle: wrap its render condition to `symmetry !== 'none' && editorGameMode === 'sternhalma'`.

Sternhalma player-color row: in the starting/goals player selector block (line ~1352), under the player buttons add a 9-swatch row assigning `armyColors[selectedPlayer]` (skipping colors already assigned to other players):

```tsx
  <div className="flex gap-1 flex-wrap items-center">
    <span className={`text-xs ${dm('text-gray-400', 'text-gray-500')}`}>Color:</span>
    {EDITOR_ARMY_COLORS.map((c) => {
      const takenByOther = Object.entries(armyColors).some(([p, ac]) => Number(p) !== selectedPlayer && ac === c);
      const isCurrent = (armyColors[selectedPlayer] ?? PLAYER_COLORS[selectedPlayer]) === c;
      return (
        <button
          key={c}
          disabled={takenByOther}
          onClick={() => setArmyColors(prev => ({ ...prev, [selectedPlayer]: c }))}
          className={`w-4 h-4 rounded-full transition-all ${takenByOther ? 'opacity-25 cursor-not-allowed' : 'hover:scale-110'} ${isCurrent ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          style={{ backgroundColor: c, border: '1px solid rgba(0,0,0,0.3)' }}
        />
      );
    })}
  </div>
```

Where the sternhalma editor renders player pieces / goal rings / selector dots with `PLAYER_COLORS[player]`, use `armyColors[player] ?? PLAYER_COLORS[player]` instead (grep `PLAYER_COLORS[` within page.tsx and update the display sites — NOT the `EDITOR_ARMY_COLORS` definition).

Validation display: the saved-layouts checkmark already calls `validateLayout` (dispatches per mode after Task 7). Additionally show current in-editor errors in hexchess mode: build a temp layout object (same as `handleSave`'s) in a `useMemo` and list `validateLayout(temp).errors` under the stats row in amber text.

- [ ] **Step 4: Verify + commit**

`npm run build`; dev-server manual pass: draw promotion tiles for white — dashed white outlines appear only in that tab with white selected; readout flips between "peon"/"pawn" as tiles move; toggling all four promote-to options off shows a validation error; rotate toggle tilts the canvas 30 degrees with upright glyphs; sternhalma mode offers the 9-color row and hides nothing else.

```bash
git add src/components/editor/HexPromotionsPanel.tsx src/app/editor/page.tsx
git commit -m "feat(editor): promotions tab, forward readout, 30-degree toggle, editor color choices"
```

---

### Task 12: Play page — custom hex chess boards

**Files:**
- Modify: `src/app/play/page.tsx`

**Interfaces:**
- Consumes: `snapshotFromLayout`, `hexSeatsOfSnapshot`, `validateLayout`.
- Produces: hex chess games with `layoutPreset: 'custom'` and `config.layout` set; `soldierVariant` removed from new configs.

- [ ] **Step 1: Board picker for hex chess**

Remove the hexchess board lock: in the `gameMode` effect (line ~125-139) delete `setSelectedLayout(null); setShowBoardSelector(false);` and instead reset `setSelectedLayout(null)` ONLY when the previously selected layout's mode does not match the new gameMode. Compute:

```ts
  const validLayouts = layouts.filter(l => (l.gameMode ?? 'sternhalma') === gameMode && validateLayout(l).valid);
```

(The existing `validLayouts` at line ~361 gains the mode filter.) The existing board-selector UI now works for both modes; "Standard board" remains `selectedLayout === null`.

- [ ] **Step 2: Seats/colors/config for a custom hex board**

```ts
  const hexSnapshot = gameMode === 'hexchess' && selectedLayout ? snapshotFromLayout(selectedLayout) : null;
  const hexSeats: HexPlayerIndex[] = hexSnapshot
    ? hexSeatsOfSnapshot(hexSnapshot)
    : (ACTIVE_PLAYERS[selectedCount] as HexPlayerIndex[]);
```

- Hide the player-count selector when `hexSnapshot` is non-null (army count is fixed by the board); show "N armies" instead.
- `configPlayers` for hexchess = `hexSeats` (drive the player rows from it).
- Color seeding effect when the selected hex layout changes: for each seat, `layout.defaultColors?.[seat] ?? PLAYER_COLORS[seat]`; then apply `favoriteColor` to the first human seat if it does not collide (`areTooSimilar`) with another seat's color — precedence: favorite > board default > fallback.

- [ ] **Step 3: Start config**

In `handleStartGame`'s hexchess branch:

```ts
      const seats = hexSeats;
      // ... players/aiMap loop unchanged, iterating `seats` ...
      const hexConfig: HexChessConfig = {
        id: hexGameId,
        seats,
        players,
        layoutPreset: hexSnapshot ? 'custom' : 'v1-default',
        ...(hexSnapshot ? { layout: hexSnapshot } : {}),
        ai: Object.keys(aiMap).length > 0 ? aiMap : null,
      };
```

Delete the `soldierVariant: 'soldier'` line (field is now optional/legacy).

- [ ] **Step 4: Verify + commit**

`npm run build`. Dev-server: create a hexchess board in the editor (2 armies, kings + pawns + promotion tiles), see it listed under Hex Chess on /play, start a game vs AI, confirm the custom shape renders with walls and the AI moves.

```bash
git add src/app/play/page.tsx
git commit -m "feat(play): select and start custom hex chess boards"
```

---

### Task 13: Full verification

**Files:** none new (fixes only, committed under `fix:` as needed).

- [ ] **Step 1: Test suite** — `npm run test`. Expected: all pass except the pre-existing `tests/game/pathfinding.test.ts` type errors (unchanged files only).
- [ ] **Step 2: Build + lint** — `npm run build` and `npm run lint` clean.
- [ ] **Step 3: Browser end-to-end** (use the project's Playwright setup per memory `browser-verification.md`: `node_modules/playwright` + Firefox + local libasound extract; Playwright MCP is broken here):
  1. Editor: switch to Hex Chess, draw a small board, place white and black armies (kings, pawns, one rook each), draw promotion tiles for both, confirm the forward readout, save.
  2. Editor regression: sternhalma mode still paints cells/starting/goals/special; mirror goals works; rotate-30 tilts both modes.
  3. Play: select the saved board, start vs AI (black = AI), make a pawn move, watch the AI reply.
  4. In-game: pawn reaches a promotion tile → picker shows only the enabled options; walls render; 30-degree rotation applied if toggled.
  5. Reload mid-game (`/hexchess/{id}`) → game restores from the v3 save.
  6. Replays page: finish or resign the game, open its replay, step through.
  7. Standard hex chess game (no custom board) plays exactly as before, including 3-player elimination showing ghost-faded armies instead of flat grey.
- [ ] **Step 4: Update memory** — update `MEMORY.md` hexchess entries per the memory instructions (new geometry module, unified pawn rules, schemaVersion 3).
- [ ] **Step 5: Final commit** of any fixes: `git add -A && git commit -m "fix(hexchess): editor/play integration polish from e2e verification"` (only if changes exist).

---

## Self-Review Notes (resolved during planning)

- Spec coverage: mode switch (T9), pieces grid (T10), promotions tab + outlines + toggles + forward readout (T11), cells/walls in hexchess (T9 + T2 rules), white/black/grey + color-as-army + sternhalma color row (T10/T11), hexchess 2p defaults + precedence (T12), no goals/special in hexchess + mirror-goals hidden (T9/T11), tile background (T9), rotate-30 both modes (T8/T9/T11), engine geometry (T1-T5), validation (T7), play integration (T12), persistence v3 (T6), eliminated ghost (T8), unified icon (T8), soldierVariant retirement (T12), e2e (T13).
- The Task 2 knight test cell `1,-2`: verify `(1,-3)` is a `KNIGHT_LEAPS` entry from `0,1` → `0+1, 1-3 = 1,-2`. Yes (`KNIGHT_LEAPS[0]` is `(1,-3)`).
- Type consistency: `HexLayoutSnapshot` field names (`pieces`, `promotionPositions`, `promotionOptions`, `rotated30`) are used identically in Tasks 1, 4, 7, 9, 12; `ForwardSpec.captureDirs` in Tasks 1, 3, 8; editor state names in Tasks 9-11 match.
