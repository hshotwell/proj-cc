# Board Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click circles and arrows on the board (Lichess/chess.com style), shared across Chinese Checkers and hex chess, local-only (never synced online), with mode-specific arrow bending for checkers jump chains and hex chess knight leaps.

**Architecture:** A new standalone Zustand store (`annotationStore`) holds circles/arrows as plain endpoints. `Board.tsx` owns all new interaction (a right-button mousedown/mouseup state machine, reusing its existing per-cell hover tracking for "nearest node" targeting) and all new rendering (a new SVG layer that recomputes mode-specific bent paths at render time from two new pure functions). This works across all five surfaces (Chinese Checkers local/online/replay, hex chess local/replay) because `Board.tsx` already unifies live/replay state today.

**Tech Stack:** Zustand, React, TypeScript, Vitest.

## Global Constraints

- Annotations are in-memory only — no localStorage, no Convex sync, not part of any synced `GameState`/`HexChessState`.
- Annotations persist across moves/turns/replay-steps. They are cleared only by: an explicit left click anywhere on the board, or the underlying game/replay identity changing (new game started, different saved game loaded).
- Color is resolved and stored **at draw time**, not recomputed live: if there's exactly one human seat (`localPlayer` defined), always use that player's fixed color, even during the AI's turn. Otherwise (hotseat 2+ humans, or any replay) use whoever's turn it currently is.
- Circle toggle key is the cell only (ignores color) — right-clicking an already-circled cell removes it regardless of which color drew it. Arrow toggle key is the directional `(from, to)` pair — `A→B` and `B→A` are distinct entries.
- Right-click continues to mean "cancel this queued pre-move" **only** for a plain click (mousedown and mouseup on the same cell, no drag) landing exactly on a queued pre-move destination, while pre-moves are actively queueable. Every other right-click (including drags that end on such a cell) is annotation input.
- Mode-specific arrow bending is pure geometry computed fresh at render time from current game state — no legality/occupancy checks beyond what's specified (Chinese Checkers: real jump-chain reachability via the existing `findMovePath`; hex chess: pure knight-leap-vector geometry, no occupancy check at all).
- No automated test coverage for raw DOM mouse-event wiring (mousedown/mouseup/mouseenter) — pure decision/computation functions get unit tests; the thin effectful wrapper in `Board.tsx` does not, matching this session's established precedent (`resolvePreMoveFiring` in the pre-moves feature). Manual browser verification is the intended check for the wiring itself.
- No settings toggle to disable the feature.

---

### Task 1: `annotationStore` — circles/arrows state

**Files:**
- Create: `src/store/annotationStore.ts`
- Test: `tests/store/annotationStore.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5 and 6):
  - `export interface AnnotationCircle { cell: CubeCoord; color: string; }`
  - `export interface AnnotationArrow { id: string; from: CubeCoord; to: CubeCoord; color: string; }`
  - `export function useAnnotationStore(): { circles: Map<string, AnnotationCircle>; arrows: Map<string, AnnotationArrow>; toggleCircle: (cell: CubeCoord, color: string) => void; toggleArrow: (from: CubeCoord, to: CubeCoord, color: string) => void; clearAll: () => void; }` (a Zustand hook, also usable as `useAnnotationStore.getState()`)

- [ ] **Step 1: Write the failing test file**

Create `tests/store/annotationStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/store/annotationStore';
import { cubeCoord, coordKey } from '@/game/coordinates';

function reset() {
  useAnnotationStore.getState().clearAll();
}

describe('annotationStore', () => {
  beforeEach(reset);

  it('starts empty', () => {
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(0);
    expect(s.arrows.size).toBe(0);
  });

  it('toggleCircle adds a circle keyed by cell', () => {
    const cell = cubeCoord(1, -1);
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(1);
    expect(s.circles.get(coordKey(cell))).toEqual({ cell, color: '#ff0000' });
  });

  it('toggleCircle removes an existing circle regardless of the color passed', () => {
    const cell = cubeCoord(1, -1);
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    useAnnotationStore.getState().toggleCircle(cell, '#0000ff'); // different color, still removes
    expect(useAnnotationStore.getState().circles.size).toBe(0);
  });

  it('toggleArrow adds an arrow keyed by the directional (from, to) pair', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    const s = useAnnotationStore.getState();
    expect(s.arrows.size).toBe(1);
    const key = `${coordKey(from)}>${coordKey(to)}`;
    expect(s.arrows.get(key)).toEqual({ id: key, from, to, color: '#22c55e' });
  });

  it('toggleArrow removes an existing arrow on repeat with the same direction', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    expect(useAnnotationStore.getState().arrows.size).toBe(0);
  });

  it('A→B and B→A are distinct arrows', () => {
    const a = cubeCoord(0, 0);
    const b = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(a, b, '#22c55e');
    useAnnotationStore.getState().toggleArrow(b, a, '#22c55e');
    expect(useAnnotationStore.getState().arrows.size).toBe(2);
  });

  it('clearAll empties both circles and arrows', () => {
    useAnnotationStore.getState().toggleCircle(cubeCoord(0, 0), '#ff0000');
    useAnnotationStore.getState().toggleArrow(cubeCoord(0, 0), cubeCoord(1, 0), '#ff0000');
    useAnnotationStore.getState().clearAll();
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(0);
    expect(s.arrows.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/annotationStore.test.ts`
Expected: FAIL — `@/store/annotationStore` doesn't exist yet.

- [ ] **Step 3: Implement the store**

Create `src/store/annotationStore.ts`:

```ts
'use client';

import { create } from 'zustand';
import type { CubeCoord } from '@/types/game';
import { coordKey } from '@/game/coordinates';

export interface AnnotationCircle {
  cell: CubeCoord;
  color: string;
}

export interface AnnotationArrow {
  id: string;
  from: CubeCoord;
  to: CubeCoord;
  color: string;
}

interface AnnotationStoreState {
  circles: Map<string, AnnotationCircle>;
  arrows: Map<string, AnnotationArrow>;
  toggleCircle: (cell: CubeCoord, color: string) => void;
  toggleArrow: (from: CubeCoord, to: CubeCoord, color: string) => void;
  clearAll: () => void;
}

export const useAnnotationStore = create<AnnotationStoreState>((set, get) => ({
  circles: new Map(),
  arrows: new Map(),

  toggleCircle(cell, color) {
    const key = coordKey(cell);
    const next = new Map(get().circles);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { cell, color });
    }
    set({ circles: next });
  },

  toggleArrow(from, to, color) {
    const key = `${coordKey(from)}>${coordKey(to)}`;
    const next = new Map(get().arrows);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { id: key, from, to, color });
    }
    set({ arrows: next });
  },

  clearAll() {
    set({ circles: new Map(), arrows: new Map() });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/annotationStore.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store/annotationStore.ts tests/store/annotationStore.test.ts
git commit -m "feat(annotations): add annotationStore for board circles and arrows"
```

---

### Task 2: `src/game/annotations.ts` — pure drag/path-bending functions

**Files:**
- Create: `src/game/annotations.ts`
- Test: `tests/game/annotations.test.ts`

**Interfaces:**
- Consumes: `findMovePath` from `src/game/pathfinding.ts` (existing), `EDGE_DIRECTIONS`/`KNIGHT_LEAPS` from `src/game/hexchess/directions.ts` (existing), `cubeAdd`/`cubeSubtract`/`cubeEquals` from `src/game/coordinates.ts` (existing)
- Produces (consumed by Task 6 for `resolveAnnotationDrag`, and Task 5 for the two path functions):
  - `export type AnnotationDragResult = { type: 'circle'; cell: CubeCoord } | { type: 'arrow'; from: CubeCoord; to: CubeCoord } | { type: 'none' };`
  - `export function resolveAnnotationDrag(dragOrigin: CubeCoord, releaseCell: CubeCoord | null): AnnotationDragResult`
  - `export function computeCheckersArrowPath(state: GameState, from: CubeCoord, to: CubeCoord): CubeCoord[]`
  - `export function computeHexKnightArrowPath(pieces: BoardPiece[], from: CubeCoord, to: CubeCoord): CubeCoord[]`

- [ ] **Step 1: Write the failing test file**

Create `tests/game/annotations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveAnnotationDrag,
  computeCheckersArrowPath,
  computeHexKnightArrowPath,
} from '@/game/annotations';
import { cubeCoord, coordKey } from '@/game/coordinates';
import { createGame, cloneGameState } from '@/game/setup';
import type { GameState } from '@/types/game';
import type { BoardPiece } from '@/types/boardView';

// ---- resolveAnnotationDrag ----

describe('resolveAnnotationDrag', () => {
  it('returns a circle when release is the same cell as the origin', () => {
    const cell = cubeCoord(0, 0);
    expect(resolveAnnotationDrag(cell, cell)).toEqual({ type: 'circle', cell });
  });

  it('returns an arrow when release differs from the origin', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    expect(resolveAnnotationDrag(from, to)).toEqual({ type: 'arrow', from, to });
  });

  it('returns none when release is null (dragged off the board)', () => {
    expect(resolveAnnotationDrag(cubeCoord(0, 0), null)).toEqual({ type: 'none' });
  });
});

// ---- computeCheckersArrowPath ----

function isolatedState(): GameState {
  const state = cloneGameState(createGame(2));
  for (const key of state.board.keys()) {
    state.board.set(key, { type: 'empty' });
  }
  return state;
}

describe('computeCheckersArrowPath', () => {
  it('returns a straight 2-point line when the origin has no piece', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, 0);
    const state = isolatedState();
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line for a single-step reachable destination', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 0);
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when no jump path exists', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(5, 5); // nothing set up to reach here
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    expect(computeCheckersArrowPath(state, from, to)).toEqual([from, to]);
  });

  it('returns a bent polyline through the jump chain when the destination is a real multi-hop jump', () => {
    // Piece at (0,0), obstacles at (1,0) and (3,0) -> chain jump lands at (2,0) then (4,0).
    const from = cubeCoord(0, 0);
    const state = isolatedState();
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    state.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    state.board.set(coordKey(cubeCoord(3, 0)), { type: 'piece', player: 1 });
    const to = cubeCoord(4, 0);
    const path = computeCheckersArrowPath(state, from, to);
    expect(path).toEqual([from, cubeCoord(2, 0), cubeCoord(4, 0)]);
  });
});

// ---- computeHexKnightArrowPath ----

function knightPiece(cell = cubeCoord(0, 0)): BoardPiece {
  return { id: 'k1', cell, color: 'red', pieceType: 'knight' };
}

describe('computeHexKnightArrowPath', () => {
  it('returns a straight 2-point line when there is no piece at the origin', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    expect(computeHexKnightArrowPath([], from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when the origin piece is not a knight', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    const pieces: BoardPiece[] = [{ id: 'r1', cell: from, color: 'red', pieceType: 'rook' }];
    expect(computeHexKnightArrowPath(pieces, from, to)).toEqual([from, to]);
  });

  it('returns a straight 2-point line when the destination is not a knight-leap vector', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 1); // not in KNIGHT_LEAPS
    expect(computeHexKnightArrowPath([knightPiece(from)], from, to)).toEqual([from, to]);
  });

  it('returns a 3-point elbowed path for leap vector (1,-3): elbow at (0,-2)', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, -3);
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(0, -2), to]);
  });

  it('returns a 3-point elbowed path for leap vector (2,1): elbow at (2,0)', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, 1);
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(2, 0), to]);
  });

  it('works from a non-origin starting cell', () => {
    const from = cubeCoord(4, -8);
    const to = cubeCoord(5, -11); // from + (1,-3)
    const path = computeHexKnightArrowPath([knightPiece(from)], from, to);
    expect(path).toEqual([from, cubeCoord(4, -10), to]);
  });
});
```

The elbow expectations above are derived from this verified decomposition table (each `KNIGHT_LEAPS` vector `L` = `2×e1 + e2` for exactly one `(e1, e2)` pair of `EDGE_DIRECTIONS`, confirmed by brute-force search during plan authoring — this is not something the implementer needs to re-derive):

| leap `(q,r)` | `e1` | elbow offset (`2×e1`) |
|---|---|---|
| `(1,-3)` | `(0,-1)` | `(0,-2)` |
| `(2,-3)` | `(1,-1)` | `(2,-2)` |
| `(3,-2)` | `(1,-1)` | `(2,-2)` |
| `(3,-1)` | `(1,0)` | `(2,0)` |
| `(2,1)` | `(1,0)` | `(2,0)` |
| `(1,2)` | `(0,1)` | `(0,2)` |
| `(-1,3)` | `(0,1)` | `(0,2)` |
| `(-2,3)` | `(-1,1)` | `(-2,2)` |
| `(-3,2)` | `(-1,1)` | `(-2,2)` |
| `(-3,1)` | `(-1,0)` | `(-2,0)` |
| `(-2,-1)` | `(-1,0)` | `(-2,0)` |
| `(-1,-2)` | `(0,-1)` | `(0,-2)` |

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/annotations.test.ts`
Expected: FAIL — `@/game/annotations` doesn't exist yet.

- [ ] **Step 3: Implement the pure functions**

Create `src/game/annotations.ts`:

```ts
import type { CubeCoord, GameState } from '@/types/game';
import type { BoardPiece } from '@/types/boardView';
import { cubeAdd, cubeSubtract, cubeEquals, coordKey } from '@/game/coordinates';
import { findMovePath } from '@/game/pathfinding';
import { EDGE_DIRECTIONS, KNIGHT_LEAPS } from '@/game/hexchess/directions';

// ---------------------------------------------------------------------------
// Drag → circle/arrow/none decision
// ---------------------------------------------------------------------------

export type AnnotationDragResult =
  | { type: 'circle'; cell: CubeCoord }
  | { type: 'arrow'; from: CubeCoord; to: CubeCoord }
  | { type: 'none' };

export function resolveAnnotationDrag(
  dragOrigin: CubeCoord,
  releaseCell: CubeCoord | null,
): AnnotationDragResult {
  if (releaseCell === null) return { type: 'none' };
  if (cubeEquals(dragOrigin, releaseCell)) return { type: 'circle', cell: dragOrigin };
  return { type: 'arrow', from: dragOrigin, to: releaseCell };
}

// ---------------------------------------------------------------------------
// Chinese Checkers: bend the arrow through a real jump chain
// ---------------------------------------------------------------------------

export function computeCheckersArrowPath(
  state: GameState,
  from: CubeCoord,
  to: CubeCoord,
): CubeCoord[] {
  const content = state.board.get(coordKey(from));
  if (!content || content.type !== 'piece') return [from, to];

  const path = findMovePath(state, from, to, content.player);
  if (!path || !path.some(m => m.isJump)) return [from, to];

  return [from, ...path.map(m => m.to)];
}

// ---------------------------------------------------------------------------
// Hex chess: bend the arrow into a knight-leap elbow
// ---------------------------------------------------------------------------

// Every KNIGHT_LEAPS vector decomposes uniquely as 2*e1 + e2 for some pair
// of EDGE_DIRECTIONS (e1, e2) — mirrors the same idea forwardEdges() uses
// one level down (finding the two edges that sum to a diagonal). Brute
// force over the 6 edge directions (36 combinations) is intentionally fine
// here: this only ever runs when actually rendering a knight annotation
// arrow, not in any hot path.
function findElbowOffset(leap: CubeCoord): CubeCoord | null {
  for (const e1 of EDGE_DIRECTIONS) {
    for (const e2 of EDGE_DIRECTIONS) {
      const candidate = cubeAdd(cubeAdd(e1, e1), e2);
      if (cubeEquals(candidate, leap)) {
        return cubeAdd(e1, e1);
      }
    }
  }
  return null;
}

export function computeHexKnightArrowPath(
  pieces: BoardPiece[],
  from: CubeCoord,
  to: CubeCoord,
): CubeCoord[] {
  const mover = pieces.find(p => cubeEquals(p.cell, from));
  if (mover?.pieceType !== 'knight') return [from, to];

  const delta = cubeSubtract(to, from);
  const leap = KNIGHT_LEAPS.find(l => cubeEquals(l, delta));
  if (!leap) return [from, to];

  const elbowOffset = findElbowOffset(leap);
  if (!elbowOffset) return [from, to]; // defensive — every KNIGHT_LEAPS vector has a decomposition

  return [from, cubeAdd(from, elbowOffset), to];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/annotations.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "game/annotations"`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/game/annotations.ts tests/game/annotations.test.ts
git commit -m "feat(annotations): add pure drag-resolution and arrow-bending functions"
```

---

### Task 3: `BoardView.playerColors` + `BoardView.gameId`

**Files:**
- Modify: `src/types/boardView.ts`
- Modify: `src/store/hexChessStore.ts`
- Test: `tests/store/hexChessStore.selectBoardView.test.ts`

**Interfaces:**
- Produces (consumed by Task 6): `BoardView.playerColors?: Record<number, string>`, `BoardView.gameId?: string`

- [ ] **Step 1: Write the failing tests**

Add to `tests/store/hexChessStore.selectBoardView.test.ts`, inside the existing `describe('selectHexChessBoardView', ...)` block:

```ts
  it('includes a playerColors map keyed by player index', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view!.playerColors).toEqual({ 0: '#ff0000', 1: '#0000ff' });
  });

  it('includes gameId from the config', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    } as never);

    expect(view!.gameId).toBe('test-game');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/hexChessStore.selectBoardView.test.ts`
Expected: FAIL — `playerColors`/`gameId` are `undefined` on the returned view.

- [ ] **Step 3: Add the fields**

In `src/types/boardView.ts`, add two new optional fields to the `BoardView` interface (after the existing `activePlayerIsAI?: boolean;` line):

```ts
  /** Maps every player index in the game to their CSS color. Used to resolve
   * a *specific* player's color (e.g. the local human's) independent of
   * whose turn it currently is. */
  playerColors?: Record<number, string>;
  /** Stable identity for the current game/replay, used to reset local-only
   * UI state (e.g. board annotations) when it changes. */
  gameId?: string;
```

In `src/store/hexChessStore.ts`, in `selectHexChessBoardView`, add both fields to the returned object (the function currently returns an object literal ending with `captureBurst,`  — add these two lines right after it):

```ts
    captureBurst,
    playerColors: { 0: config.players[0].color, 1: config.players[1].color },
    gameId: config.id,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/hexChessStore.selectBoardView.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "boardView\|hexChessStore"`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/types/boardView.ts src/store/hexChessStore.ts tests/store/hexChessStore.selectBoardView.test.ts
git commit -m "feat(annotations): expose playerColors and gameId on hex chess BoardView"
```

---

### Task 4: `onCellRightClick` contract change + thread `localPlayer` to hex chess's `<Board>`

**Files:**
- Modify: `src/components/board/Board.tsx`
- Modify: `src/components/hexchess/HexGameContainer.tsx`

**Interfaces:**
- Produces (consumed by Task 6): `BoardProps.onCellRightClick?: (coord: CubeCoord) => boolean` — return `true` if the click was consumed by pre-move-cancel logic (Board.tsx must not also draw an annotation), `false`/`undefined` if not consumed (Board.tsx should proceed to annotation handling). Also: hex chess's `<Board>` call now receives `localPlayer`, so Task 6's `resolveAnnotationColor` can resolve it there the same way it already can for Chinese Checkers.

**Context for this task:** the pre-moves feature (already shipped, same session) added `onCellRightClick` as a `void`-returning callback so hex chess's `HexGameContainer` could own its own pre-move-cancel logic without `Board.tsx` needing to import the hex chess store. Task 6 (below) needs to know whether that callback actually cancelled something, so it can decide whether to *also* draw a circle/arrow at that cell — a `void` return gives no way to know. This task changes the contract to return a `boolean` and updates the one real implementation of it (`HexGameContainer.tsx`'s `handleCellRightClick`). This task does **not** change any call site inside `Board.tsx` yet — that happens in Task 6, since Task 6 is what actually restructures how right-clicks are routed. This task only needs to make the type and the one implementation correct and self-consistent; existing call sites keep compiling because `(coord) => boolean` is still callable as `(coord) => void` from TypeScript's perspective at the two current `Board.tsx` call sites (a function returning `boolean` is assignable wherever a void-returning callback is expected).

- [ ] **Step 1: Update the prop type**

In `src/components/board/Board.tsx`, find:

```ts
  /** When provided, right-clicks call this instead of the Chinese Checkers pre-move cancel flow. */
  onCellRightClick?: (coord: CubeCoord) => void;
```

Change to:

```ts
  /** When provided, right-clicks call this instead of the Chinese Checkers pre-move cancel flow.
   * Returns true if the click was consumed (e.g. cancelled a queued pre-move) — the caller should
   * not also treat the click as annotation input. Returns false/undefined if not consumed. */
  onCellRightClick?: (coord: CubeCoord) => boolean;
```

- [ ] **Step 2: Update `HexGameContainer.tsx`'s implementation**

In `src/components/hexchess/HexGameContainer.tsx`, find `handleCellRightClick`:

```tsx
  const handleCellRightClick = (cell: CubeCoord) => {
    if (!preMovesAllowed) return;
    const s = useHexChessStore.getState();

    const idx = s.preMoves.findIndex((pm) => cubeEquals(pm.to, cell));
    if (idx >= 0) {
      s.cancelPreMoveAt(idx);
      return;
    }

    if (s.preMoveSelectedPieceId !== null) {
      const virtualPieces = s.getVirtualPieces();
      const selected = virtualPieces.find((p) => p.id === s.preMoveSelectedPieceId);
      if (selected && cubeEquals(selected.cell, cell)) {
        s.selectPreMovePiece(null);
      }
    }
  };
```

Replace with (adds explicit `boolean` return type and returns `true`/`false` at every path):

```tsx
  const handleCellRightClick = (cell: CubeCoord): boolean => {
    if (!preMovesAllowed) return false;
    const s = useHexChessStore.getState();

    const idx = s.preMoves.findIndex((pm) => cubeEquals(pm.to, cell));
    if (idx >= 0) {
      s.cancelPreMoveAt(idx);
      return true;
    }

    if (s.preMoveSelectedPieceId !== null) {
      const virtualPieces = s.getVirtualPieces();
      const selected = virtualPieces.find((p) => p.id === s.preMoveSelectedPieceId);
      if (selected && cubeEquals(selected.cell, cell)) {
        s.selectPreMovePiece(null);
        return true;
      }
    }

    return false;
  };
```

The one added behavior: right-clicking the currently-selected (not yet queued) pre-move piece to deselect it now also counts as "consumed" (previously it had no return value to signal this at all). This is correct: the user was interacting with pre-move UI, not drawing an annotation, so no circle should also appear at that cell.

- [ ] **Step 3: Thread `localPlayer` into hex chess's `<Board>` call**

`HexGameContainer.tsx` already computes `localPlayer` (for pre-moves) but
never forwards it as a prop to `<Board>` — Chinese Checkers containers
already do this (it's how pre-moves resolved *their* local player there),
but hex chess never needed it until now. Task 6's color-resolution rule ("a
single human always uses their own color, even during the AI's turn")
depends on this prop actually arriving. Find:

```tsx
            <Board
              view={view}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
            />
```

Replace with:

```tsx
            <Board
              view={view}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
              localPlayer={localPlayer}
            />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Board.tsx\|HexGameContainer"`
Expected: no output

- [ ] **Step 5: Run the existing hex chess test suite for regressions**

Run: `npx vitest run tests/store/hexChessStore.test.ts tests/store/hexChessStore.preMoves.test.ts tests/hooks/useHexChessPreMoveFiring.test.ts`
Expected: PASS (unaffected — this task only touches a UI callback and a prop pass-through, not any tested store/hook logic)

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Board.tsx src/components/hexchess/HexGameContainer.tsx
git commit -m "feat(annotations): thread localPlayer to hex chess Board and make onCellRightClick report consumption"
```

---

### Task 5: Board.tsx — annotation rendering layer

**Files:**
- Modify: `src/components/board/Board.tsx`
- Test: `tests/components/board/annotations.test.tsx`

**Interfaces:**
- Consumes: `useAnnotationStore` (Task 1), `computeCheckersArrowPath`/`computeHexKnightArrowPath` (Task 2)
- Produces: nothing new for later tasks — this is the rendering half; Task 6 is the interaction half that populates the store this task reads from.

**Context:** this task only adds the SVG rendering for whatever is currently in `annotationStore` — it does not add any mouse-event handling (that's Task 6). This split exists because rendering has an independent, meaningfully testable behavior (does the right markup appear for given store state) that doesn't require simulating real mouse drags, matching the same testing approach already used for `tests/components/board/highlights.test.tsx`.

- [ ] **Step 1: Write the failing test file**

Create `tests/components/board/annotations.test.tsx`, following the exact mocking pattern already established in `tests/components/board/highlights.test.tsx` (same store mocks, same `renderBoard`/`makeView` style), but additionally seeding `annotationStore`:

```tsx
/**
 * Tests for Board.tsx rendering of board annotations (circles/arrows) from
 * annotationStore state. Mirrors tests/components/board/highlights.test.tsx's
 * store-mocking approach.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BoardView } from '@/types/boardView';
import type { CubeCoord } from '@/types/game';
import { createGame } from '@/game/setup';
import { useAnnotationStore } from '@/store/annotationStore';

const minimalGameState = createGame(2);

vi.mock('@/store/replayStore', () => ({
  useReplayStore: () => ({
    isReplayActive: false,
    displayState: null,
    states: [],
    currentStep: 0,
    moves: [],
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    showAllMoves: true,
    animateMoves: false,
    rotateBoard: false,
    showTriangleLines: false,
    showLastMoves: false,
    showCoordinates: false,
    darkMode: false,
    woodenBoard: false,
    glassPieces: false,
    hopEffect: false,
    hexCells: false,
    activePlayerRing: false,
  }),
}));

const gameStoreState = {
  gameState: minimalGameState,
  selectedPiece: null,
  validMovesForSelected: [],
  pendingConfirmation: false,
  stateBeforeMove: null,
  originalPiecePosition: null,
  animatingPiece: null,
  animationPath: null,
  animationStep: 0,
  isSwapAnimation: false,
  lastMoveInfo: null,
  selectPiece: () => {},
  makeMove: () => {},
  clearSelection: () => {},
  confirmMove: () => {},
  undoLastMove: () => {},
  preMoves: [],
  preMoveSelectedFrom: null,
  selectPreMovePiece: () => {},
  queuePreMove: () => {},
  cancelPreMoveSelection: () => {},
  cancelPreMoveAt: () => {},
  getVirtualBoard: () => new Map(),
  clearAnimation: () => {},
  advanceAnimation: () => {},
};

vi.mock('@/store/gameStore', () => ({
  useGameStore: Object.assign(() => gameStoreState, {
    getState: () => gameStoreState,
  }),
  selectBoardView: () => ({
    cells: [],
    homeZones: new Map(),
    pieces: [],
    highlights: [],
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: 0,
  }),
}));

import { Board } from '@/components/board/Board';

function makeView(overrides: Partial<BoardView> = {}): BoardView {
  return {
    cells: [],
    homeZones: new Map(),
    pieces: [],
    highlights: [],
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: 0,
    ...overrides,
  };
}

function renderBoard(view: BoardView): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(React.createElement(Board as any, { view }));
}

const cell: CubeCoord = { q: 0, r: 0, s: 0 };
const other: CubeCoord = { q: 2, r: -1, s: -1 };

describe('Board annotation rendering', () => {
  beforeEach(() => {
    useAnnotationStore.getState().clearAll();
  });

  it('renders nothing extra when there are no annotations', () => {
    const html = renderBoard(makeView());
    expect(html).not.toContain('annotation-circle');
    expect(html).not.toContain('annotation-arrow');
  });

  it('renders a circle for a queued annotation', () => {
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    const html = renderBoard(makeView());
    expect(html).toContain('annotation-circle');
    expect(html).toMatch(/stroke="#ff0000"/);
  });

  it('renders a straight arrow (polyline + arrowhead) when no bending applies', () => {
    useAnnotationStore.getState().toggleArrow(cell, other, '#22c55e');
    const html = renderBoard(makeView());
    expect(html).toContain('annotation-arrow');
    expect(html).toContain('annotation-arrowhead');
    expect(html).toMatch(/stroke="#22c55e"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/board/annotations.test.tsx`
Expected: FAIL — no `annotation-circle`/`annotation-arrow` markup exists yet.

- [ ] **Step 3: Implement the rendering layer**

In `src/components/board/Board.tsx`, add the new store import near the top (alongside the existing store imports):

```ts
import { useAnnotationStore } from '@/store/annotationStore';
import { computeCheckersArrowPath, computeHexKnightArrowPath } from '@/game/annotations';
```

Inside the `Board` function body, add a subscription to the annotation store (place it near the other `useXStore()` calls, e.g. right after the `useSettingsStore()` destructure around line 111):

```ts
  const { circles: annotationCircles, arrows: annotationArrows } = useAnnotationStore();
```

Find this exact two-line sequence (the hop-particles layer immediately followed
by the rotation group's closing tag):

```tsx
      {hopParticles.length > 0 && <HopParticles particles={hopParticles} />}
      </g>
```

Replace it with (this inserts the new layer between the two original lines,
and the closing `</g>` at the end of this replacement is the *same* rotation-group
close that was already there — do not leave a second `</g>` behind):

```tsx
      {hopParticles.length > 0 && <HopParticles particles={hopParticles} />}

      {/* Layer 5: Board annotations (circles/arrows) — local-only, never synced */}
      {(annotationCircles.size > 0 || annotationArrows.size > 0) && (() => {
        const pieceRadius = HEX_SIZE * 0.45;

        function arrowheadPoints(from: { x: number; y: number }, to: { x: number; y: number }): string {
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const size = 12;
          const spread = Math.PI / 7;
          const p1 = {
            x: to.x + size * Math.cos(angle + Math.PI - spread),
            y: to.y + size * Math.sin(angle + Math.PI - spread),
          };
          const p2 = {
            x: to.x + size * Math.cos(angle + Math.PI + spread),
            y: to.y + size * Math.sin(angle + Math.PI + spread),
          };
          return `${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
        }

        return (
          <g style={{ pointerEvents: 'none' }}>
            {Array.from(annotationCircles.values()).map((c) => {
              const { x, y } = cubeToPixel(c.cell, HEX_SIZE);
              return (
                <circle
                  key={`annotation-circle-${coordKey(c.cell)}`}
                  className="annotation-circle"
                  cx={x}
                  cy={y}
                  r={pieceRadius + 4}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={3}
                  opacity={0.85}
                />
              );
            })}
            {Array.from(annotationArrows.values()).map((a) => {
              const waypoints = viewProp
                ? computeHexKnightArrowPath(viewProp.pieces, a.from, a.to)
                : (gameState ? computeCheckersArrowPath(gameState, a.from, a.to) : [a.from, a.to]);
              const pixelPoints = waypoints.map((w) => cubeToPixel(w, HEX_SIZE));
              const pointsAttr = pixelPoints.map((p) => `${p.x},${p.y}`).join(' ');
              const last = pixelPoints[pixelPoints.length - 1];
              const secondLast = pixelPoints[pixelPoints.length - 2];
              return (
                <g key={`annotation-arrow-${a.id}`} className="annotation-arrow">
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={4}
                    opacity={0.85}
                  />
                  <polygon
                    className="annotation-arrowhead"
                    points={arrowheadPoints(secondLast, last)}
                    fill={a.color}
                    opacity={0.85}
                  />
                </g>
              );
            })}
          </g>
        );
      })()}
      </g>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/board/annotations.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full board component test directory and type-check**

Run: `npx vitest run tests/components/board`
Expected: PASS (all files, including the pre-existing `highlights.test.tsx` and `Piece.hexchess.test.tsx`)

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Board.tsx"`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Board.tsx tests/components/board/annotations.test.tsx
git commit -m "feat(annotations): render circles and arrows from annotationStore in Board.tsx"
```

---

### Task 6: Board.tsx — interaction wiring, color resolution, lifecycle

**Files:**
- Modify: `src/components/board/Board.tsx`

**Interfaces:**
- Consumes: `annotationStore` (Task 1), `resolveAnnotationDrag` (Task 2), `BoardView.playerColors`/`gameId` (Task 3), `onCellRightClick` returning `boolean` (Task 4), the rendering layer (Task 5, so this task's manual verification has something to look at)

**Context:** this is the last task — it wires real mouse events into everything the previous five tasks built. There is no dedicated automated test for this task (see Global Constraints); verification is a full-suite regression run plus a manual browser pass, exactly like the pre-moves feature's final integration task.

- [ ] **Step 1: Add a drag-origin ref**

In `src/components/board/Board.tsx`, near the existing `const moveHandledRef = useRef(false);` (around line 124), add:

```ts
  // Tracks the cell a right-button press started on, for the annotation
  // circle-vs-arrow decision made on release. Cleared on every mouseup.
  const annotationDragOriginRef = useRef<CubeCoord | null>(null);
```

- [ ] **Step 2: Make hover tracking always-on**

There are two occurrences of hover-tracking handlers gated on
`showCoordinates` — one in the background-cells layer, one in the pieces
layer. They are **not** identically indented (12 spaces vs. 14 spaces), so
they need two separate replacements, not one `replace_all`.

Background-cells layer — find:

```tsx
            onMouseEnter={showCoordinates ? () => setHoveredCell(coord) : undefined}
            onMouseLeave={showCoordinates ? () => setHoveredCell(null) : undefined}
```

Replace with:

```tsx
            onMouseEnter={() => setHoveredCell(coord)}
            onMouseLeave={() => setHoveredCell(null)}
```

Pieces layer — find (note the deeper indentation):

```tsx
              onMouseEnter={showCoordinates ? () => setHoveredCell(coord) : undefined}
              onMouseLeave={showCoordinates ? () => setHoveredCell(null) : undefined}
```

Replace with:

```tsx
              onMouseEnter={() => setHoveredCell(coord)}
              onMouseLeave={() => setHoveredCell(null)}
```

In both cases this is unconditional now — the existing coordinate-tooltip
*render* is unaffected, since that's still separately gated on
`showCoordinates && hoveredCell` where the tooltip JSX is built; only the
*tracking* becomes unconditional.

(Two of the four occurrences use 12-space indentation in the background-cells layer and 14-space indentation in the pieces layer — match each occurrence's existing indentation exactly; do not reformat surrounding code.)

- [ ] **Step 3: Add mousedown tracking to both cell layers**

Background-cells layer: this `<g>` element has `onClick` directly on itself.
Find:

```tsx
            onClick={() => handleCellClick(coord)}
```

Replace with (adds a new prop on the line above; `onClick` itself is
unchanged):

```tsx
            onMouseDown={(e) => { if (e.button === 2) annotationDragOriginRef.current = coord; }}
            onClick={() => handleCellClick(coord)}
```

Pieces layer: here `onClick` lives on the nested `<Piece>` component, not on
the wrapping `<g>` — `onMouseDown` needs to go on the wrapping `<g>` instead
(a plain SVG element), since `<Piece>` has no generic DOM-event passthrough
prop. Find (the wrapping `<g>`'s `style` prop, the line immediately before
its closing `>`):

```tsx
              style={pieceFaded ? { opacity: 0, animation: 'fadeOut 0.4s ease-out forwards' } : undefined}
            >
```

Replace with:

```tsx
              style={pieceFaded ? { opacity: 0, animation: 'fadeOut 0.4s ease-out forwards' } : undefined}
              onMouseDown={(e) => { if (e.button === 2) annotationDragOriginRef.current = coord; }}
            >
```

- [ ] **Step 4: Simplify both `onContextMenu` handlers to a bare preventDefault**

There are two occurrences, indented differently (12 spaces in the
background-cells layer, 14 spaces in the pieces layer — same as Step 2
above), so this also needs two separate replacements.

Background-cells layer — find:

```tsx
            onContextMenu={
              onCellRightClick
                ? (e) => { e.preventDefault(); onCellRightClick(coord); }
                : (preMovesAllowed ? (e) => { e.preventDefault(); handlePreMoveRightClick(coord); } : undefined)
            }
```

Replace with:

```tsx
            onContextMenu={(e) => e.preventDefault()}
```

Pieces layer — find:

```tsx
              onContextMenu={
                onCellRightClick
                  ? (e) => { e.preventDefault(); onCellRightClick(coord); }
                  : (preMovesAllowed ? (e) => { e.preventDefault(); handlePreMoveRightClick(coord); } : undefined)
              }
```

Replace with:

```tsx
              onContextMenu={(e) => e.preventDefault()}
```

Right-click decision-making moves entirely to the new mouseup handler (Step 6) — `onContextMenu` now only ever needs to suppress the native browser menu, unconditionally, everywhere.

- [ ] **Step 5: Remove the now-unused `handlePreMoveRightClick` function**

Find and delete:

```tsx
  const handlePreMoveRightClick = (coord: CubeCoord) => {
    // Cancel any queued pre-move whose destination is this coord (and everything after it).
    const idx = preMoves.findIndex((pm) => cubeEquals(pm.to, coord));
    if (idx >= 0) {
      cancelPreMoveAt(idx);
      moveHandledRef.current = true;
    }
  };
```

Its logic is inlined directly into the new `handleAnnotationMouseUp` in Step 6 below (the `moveHandledRef.current = true` line is dropped — it was set from `onContextMenu`, which never triggers a `click` event in browsers, so nothing downstream ever read it in this code path).

- [ ] **Step 6: Add the color-resolution helper and the mouseup handler**

Find:

```tsx
  const handleCellClick = (coord: CubeCoord) => {
```

Insert both new functions immediately before this line (i.e. in the gap Step 5 left behind after removing `handlePreMoveRightClick`):

```tsx
  // Resolves the color to draw a new annotation in. If there's exactly one
  // human seat (localPlayer defined), always use that player's fixed color,
  // even during the AI's turn. Otherwise (hotseat 2+ humans, or replay,
  // which has no seat concept) use whoever's turn it currently is.
  const resolveAnnotationColor = (): string => {
    if (viewProp) {
      const idx = localPlayer ?? viewProp.activePlayerIndex;
      const raw = viewProp.playerColors?.[idx] ?? viewProp.activePlayerColor;
      return raw ?? '#888888';
    }
    const idx = localPlayer ?? gameState?.currentPlayer;
    return idx !== undefined ? getPlayerColorFromState(idx, gameState) : '#888888';
  };

  const handleAnnotationMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 2) return;
    const origin = annotationDragOriginRef.current;
    annotationDragOriginRef.current = null;
    if (!origin) return;

    const release = hoveredCell;

    // Pre-move-cancel priority, click-only: origin === release means this was
    // a plain right-click (no drag). A drag that merely ends on a queued
    // pre-move destination draws an arrow there instead.
    if (release && cubeEquals(origin, release)) {
      if (viewProp) {
        if (onCellRightClick?.(release)) return;
      } else if (preMovesAllowed) {
        const idx = preMoves.findIndex((pm) => cubeEquals(pm.to, release));
        if (idx >= 0) {
          cancelPreMoveAt(idx);
          return;
        }
      }
    }

    const result = resolveAnnotationDrag(origin, release);
    if (result.type === 'none') return;
    const color = resolveAnnotationColor();
    if (result.type === 'circle') {
      useAnnotationStore.getState().toggleCircle(result.cell, color);
    } else {
      useAnnotationStore.getState().toggleArrow(result.from, result.to, color);
    }
  };
```

Add the import for `resolveAnnotationDrag` alongside the existing Task 5 import of `computeCheckersArrowPath`/`computeHexKnightArrowPath` from `@/game/annotations` (extend that same import line rather than adding a second one):

```ts
import { computeCheckersArrowPath, computeHexKnightArrowPath, resolveAnnotationDrag } from '@/game/annotations';
```

- [ ] **Step 7: Wire the mouseup handler and clear-on-left-click onto the root `<svg>`**

Find the root `<svg>` element's `onContextMenu`:

```tsx
      onClick={handleSVGClick}
      onContextMenu={(e) => {
        // Only intercept right-click when pre-move mode is active
        if (!preMovesAllowed) return;
        e.preventDefault();
      }}
```

Replace with (unconditional preventDefault as a catch-all for right-clicks that release outside any single cell's hit area, plus the new mouseup wiring):

```tsx
      onClick={handleSVGClick}
      onMouseUp={handleAnnotationMouseUp}
      onContextMenu={(e) => e.preventDefault()}
```

In `handleSVGClick` (the existing function, currently starting with the `moveHandledRef.current` check), add the annotation clear as the very first line so it fires on every left click reaching the board, before any other logic:

```tsx
  const handleSVGClick = (e: React.MouseEvent<SVGSVGElement>) => {
    useAnnotationStore.getState().clearAll();
    // If a child handler already called makeMove, skip and reset the flag.
    if (moveHandledRef.current) {
```

(Only the first line is new — everything after `// If a child handler...` is the existing function body, unchanged.)

- [ ] **Step 8: Add the identity-change reset effect**

`Board.tsx` already calls `useGameStore()` once at the top of the component
for its large destructure — do not add a second call. Find:

```ts
      const {
      gameState: liveGameState,
      selectedPiece: liveSelectedPiece,
```

Add `gameId` as a new destructured field in that same block (insert it right
after the opening, before `gameState: liveGameState`):

```ts
      const {
      gameId,
      gameState: liveGameState,
      selectedPiece: liveSelectedPiece,
```

Then, near the other `useEffect` calls in `Board.tsx` (there are several
already, for animation/rotation state), add:

```ts
  // Clear annotations when the underlying game/replay identity changes.
  // Not keyed by gameId (no per-game accumulation) — just reset on change.
  const annotationIdentity = viewProp ? viewProp.gameId : gameId;
  useEffect(() => {
    useAnnotationStore.getState().clearAll();
  }, [annotationIdentity]);
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Board.tsx"`
Expected: no output

- [ ] **Step 10: Run the full test suite for regressions**

Run: `npx vitest run`
Expected: PASS on everything except any pre-existing, unrelated failures already documented in project memory. If any board/annotation/pre-move test fails, stop and fix before proceeding.

- [ ] **Step 11: Manual verification in the browser**

Run: `npm run dev` (or use the project's `/run` skill if available)

1. Start a Chinese Checkers game (human vs AI). During the AI's turn, right-click a cell — confirm a circle appears in your color. Right-click it again — confirm it disappears.
2. Right-click-drag from one of your pieces to an empty cell several hops away — confirm a straight arrow with an arrowhead appears.
3. Right-click-drag from a piece to a cell it could actually chain-jump to (set up a capture scenario) — confirm the arrow bends through the jump chain instead of drawing straight.
4. With pre-moves enabled and a pre-move queued, right-click (plain click, no drag) exactly on the queued destination — confirm it cancels the pre-move as before, and does *not* also draw a circle there.
5. Right-click-drag *ending* on that same queued destination (starting from a different cell) — confirm it draws an arrow instead of cancelling the pre-move.
6. Left-click anywhere (select a piece, make a move, or click empty space) — confirm all circles/arrows disappear immediately.
7. Draw a circle/arrow, then let the AI make a move (or make one yourself) — confirm the annotation is still there afterward (does not auto-clear on moves).
8. Start a new game — confirm annotations from the previous game are gone.
9. Repeat steps 1-3 and 6-8 in a hex chess game. For step 3's equivalent: right-click-drag from a knight to a cell it could actually leap to — confirm the arrow draws as an elbowed "two forward, one to the side" shape instead of straight.
10. In hex chess, confirm a single human player's annotations stay in their own color even while it's the AI's turn (queue an annotation, watch the AI move, confirm the color didn't change).
11. Open a replay (either mode) and confirm right-click circles/arrows work there too, in the current-replay-turn player's color (there's no "local player" in replay).

If any of these misbehave, fix before committing.

- [ ] **Step 12: Commit**

```bash
git add src/components/board/Board.tsx
git commit -m "feat(annotations): wire right-click drag interaction and lifecycle reset in Board.tsx"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec maps to a task above — data model (Task 1), pure drag/bend functions (Task 2), the `BoardView` plumbing gap (Task 3), the `onCellRightClick` contract fix needed to make the "layer them" mutual-exclusivity actually work for hex chess (Task 4, discovered during plan authoring — the spec described the *outcome* but not this specific mechanism), rendering (Task 5), and interaction/color/lifecycle (Task 6).
- **Deviation from spec, called out explicitly:** the spec said Board.tsx would "call the existing `cancelPreMoveAt`/equivalent" for the pre-move-cancel-priority case without specifying how hex chess's *delegated* (container-owned) pre-move-cancel logic would report back whether it consumed the click. Task 4 resolves this by changing `onCellRightClick`'s return type from `void` to `boolean`. This is a small, mechanical extension of the already-approved "layer them" decision (mutual exclusivity was already agreed; this is just the plumbing to actually implement it for hex chess specifically), not a new design axis — implemented directly rather than re-opening brainstorming. Also found during plan authoring: `HexGameContainer.tsx` never actually forwards `localPlayer` to `<Board>` (Chinese Checkers containers already do, hex chess never needed it before this feature) — added as Task 4 Step 3, since Task 6's color rule depends on it.
- **Type consistency check:** `AnnotationCircle`/`AnnotationArrow` (Task 1) are used identically in Task 5 (rendering) and Task 6 (writing via `toggleCircle`/`toggleArrow`). `AnnotationDragResult`'s three variants (`circle`/`arrow`/`none`) are consumed exactly as defined in Task 6's `handleAnnotationMouseUp`. `computeCheckersArrowPath`/`computeHexKnightArrowPath` (Task 2) return `CubeCoord[]` consumed identically in Task 5's polyline rendering. `onCellRightClick`'s new `boolean` return (Task 4) is consumed in Task 6's `if (onCellRightClick?.(release)) return;`.
