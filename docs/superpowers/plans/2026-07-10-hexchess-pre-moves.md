# Hex Chess Pre-Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human player queue up to 3 planned moves in hex chess while it isn't their turn, mirroring the existing Chinese Checkers pre-move feature but adapted to chess's atomic-move model and piece-id-stable pieces.

**Architecture:** Pre-move state (`preMoves`, `preMoveSelectedPieceId`, `pendingPreMovePromotion`) lives directly in `hexChessStore` (same pattern as Chinese Checkers keeping its pre-move state in `gameStore`). Firing is a `useEffect`-based hook (`useHexChessPreMoveFiring`) whose actual decision logic is a pure, independently-tested function (`resolvePreMoveFiring`). Click routing lives in `HexGameContainer` (which already owns `onCellClick` — `Board.tsx`'s Chinese-Checkers-only pre-move code is never touched). Rendering reuses `Board.tsx`'s existing generic highlight-rendering switch via two new additive `BoardHighlightKind` values.

**Tech Stack:** Zustand (hexChessStore), React (`useEffect`/hooks), Vitest for tests, existing `PromotionPicker` component reused as-is.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-10-hexchess-pre-moves-design.md` — read it if any task instruction below seems to conflate with it; the spec is the source of truth for *why*, this plan is the source of truth for *exact steps*.
- Pre-move queue cap is exactly **3** (`HEX_MAX_PRE_MOVES`).
- Pre-moves are keyed by `pieceId`, never by raw coordinates.
- A queued pre-move that would promote a soldier/pawn must have its promotion choice locked in at queue time (via `PromotionPicker`), never deferred to fire time.
- Do not modify any Chinese Checkers pre-move code path (`src/store/gameStore.ts`, `src/hooks/usePreMoveFiring.ts`, `src/components/game/ClearPreMovesButton.tsx`) — hex chess gets its own parallel, independent implementation.
- `Board.tsx` changes must be purely additive (new optional prop, new `switch` cases, new filter entries) — no existing Chinese Checkers behavior may change.
- Run `npx tsc --noEmit -p tsconfig.json` after each task's implementation step and confirm no *new* errors appear (the repo has some pre-existing unrelated test-file errors — ignore those, listed already in project memory).

---

### Task 1: `hexChessStore` — pre-move state, actions, `getVirtualPieces`

**Files:**
- Modify: `src/store/hexChessStore.ts`
- Test: `tests/store/hexChessStore.preMoves.test.ts` (new)

**Interfaces:**
- Produces (consumed by Tasks 2, 4, 5):
  - `export interface QueuedHexPreMove { pieceId: string; to: CubeCoord; promotion: HexPieceType | null; }`
  - `export const HEX_MAX_PRE_MOVES = 3;`
  - New `HexChessStoreState` fields: `preMoves: QueuedHexPreMove[]`, `preMoveSelectedPieceId: string | null`, `pendingPreMovePromotion: { pieceId: string; to: CubeCoord } | null`
  - New actions: `selectPreMovePiece(pieceId: string | null): void`, `queuePreMove(to: CubeCoord): void`, `confirmPreMovePromotion(choice: HexPieceType): void`, `cancelPreMovePromotion(): void`, `cancelPreMoveAt(index: number): void`, `clearAllPreMoves(): void`, `getVirtualPieces(): HexPiece[]`

- [ ] **Step 1: Write the failing test file**

Create `tests/store/hexChessStore.preMoves.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const _lsStore: Record<string, string> = {};
const _localStorageMock = {
  getItem: (key: string) => _lsStore[key] ?? null,
  setItem: (key: string, value: string) => { _lsStore[key] = value; },
  removeItem: (key: string) => { delete _lsStore[key]; },
  clear: () => { Object.keys(_lsStore).forEach(k => delete _lsStore[k]); },
};
vi.stubGlobal('localStorage', _localStorageMock);
vi.stubGlobal('window', { localStorage: _localStorageMock });

import { useHexChessStore, HEX_MAX_PRE_MOVES } from '@/store/hexChessStore';
import type { HexChessConfig } from '@/game/hexchess';
import { cubeCoord } from '@/game/coordinates';

function makeConfig(id = 'premove-test'): HexChessConfig {
  return {
    id,
    players: [
      { color: '#ff0000', name: 'Alice', isAI: false },
      { color: '#0000ff', name: 'Bob', isAI: false },
    ],
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: null,
  };
}

function reset() {
  useHexChessStore.getState().clearGame();
  _localStorageMock.clear();
}

describe('hexChessStore pre-moves', () => {
  beforeEach(reset);

  it('selectPreMovePiece selects, toggles off on repeat, replaces on a different id', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const ownPieces = useHexChessStore.getState().state!.pieces.filter(p => p.player === 0);
    const [p0, p1] = ownPieces;

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBe(p0.id);

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBeNull();

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    useHexChessStore.getState().selectPreMovePiece(p1.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBe(p1.id);
  });

  it('queuePreMove pushes a non-promoting move and clears the selection', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(piece.id);

    useHexChessStore.getState().queuePreMove(cubeCoord(0, -6));

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([{ pieceId: piece.id, to: cubeCoord(0, -6), promotion: null }]);
    expect(s.preMoveSelectedPieceId).toBeNull();
  });

  it('caps the queue at HEX_MAX_PRE_MOVES', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    for (let i = 0; i < HEX_MAX_PRE_MOVES + 2; i++) {
      useHexChessStore.setState({ preMoveSelectedPieceId: piece.id });
      useHexChessStore.getState().queuePreMove(cubeCoord(i, -6));
    }
    expect(useHexChessStore.getState().preMoves).toHaveLength(HEX_MAX_PRE_MOVES);
  });

  it('queuing a soldier onto a promotion-zone cell opens the promotion picker instead of queuing directly', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);

    const promotionCell = cubeCoord(0, 1); // r >= 1 is player 0's promotion zone
    useHexChessStore.getState().queuePreMove(promotionCell);

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.pendingPreMovePromotion).toEqual({ pieceId: soldier.id, to: promotionCell });
    expect(s.preMoveSelectedPieceId).toBeNull();
  });

  it('confirmPreMovePromotion queues the move with the chosen piece type', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    const promotionCell = cubeCoord(0, 1);
    useHexChessStore.getState().queuePreMove(promotionCell);

    useHexChessStore.getState().confirmPreMovePromotion('rook');

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([{ pieceId: soldier.id, to: promotionCell, promotion: 'rook' }]);
    expect(s.pendingPreMovePromotion).toBeNull();
  });

  it('cancelPreMovePromotion clears the picker and restores the selection', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    const promotionCell = cubeCoord(0, 1);
    useHexChessStore.getState().queuePreMove(promotionCell);

    useHexChessStore.getState().cancelPreMovePromotion();

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.pendingPreMovePromotion).toBeNull();
    expect(s.preMoveSelectedPieceId).toBe(soldier.id);
  });

  it('cancelPreMoveAt drops the entry and everything after it', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    for (let i = 0; i < 3; i++) {
      useHexChessStore.setState({ preMoveSelectedPieceId: piece.id });
      useHexChessStore.getState().queuePreMove(cubeCoord(i, -6));
    }
    useHexChessStore.getState().cancelPreMoveAt(1);
    expect(useHexChessStore.getState().preMoves).toEqual([
      { pieceId: piece.id, to: cubeCoord(0, -6), promotion: null },
    ]);
  });

  it('clearAllPreMoves resets the queue, selection, and pending promotion', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    useHexChessStore.getState().queuePreMove(cubeCoord(0, 1));

    useHexChessStore.getState().clearAllPreMoves();

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.preMoveSelectedPieceId).toBeNull();
    expect(s.pendingPreMovePromotion).toBeNull();
  });

  it('getVirtualPieces applies queued moves in order and simulates capture', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const state = useHexChessStore.getState().state!;
    const mover = state.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    const victim = state.pieces.find(p => p.player === 1)!;

    useHexChessStore.getState().selectPreMovePiece(mover.id);
    useHexChessStore.getState().queuePreMove(victim.cell); // simulated capture, legality not checked

    const virtual = useHexChessStore.getState().getVirtualPieces();
    expect(virtual.find(p => p.id === victim.id)).toBeUndefined();
    expect(virtual.find(p => p.id === mover.id)!.cell).toEqual(victim.cell);
  });

  it('preMoves/preMoveSelectedPieceId/pendingPreMovePromotion reset on createGame/loadGame/clearGame', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    useHexChessStore.getState().queuePreMove(cubeCoord(0, 1));
    expect(useHexChessStore.getState().pendingPreMovePromotion).not.toBeNull();

    useHexChessStore.getState().createGame(makeConfig('second-game'));
    expect(useHexChessStore.getState().preMoves).toEqual([]);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBeNull();
    expect(useHexChessStore.getState().pendingPreMovePromotion).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/hexChessStore.preMoves.test.ts`
Expected: FAIL — `HEX_MAX_PRE_MOVES` / `preMoveSelectedPieceId` / `queuePreMove` etc. don't exist yet (TypeScript compile errors surfaced as test failures).

- [ ] **Step 3: Implement the store changes**

In `src/store/hexChessStore.ts`, update the imports at the top:

```ts
import { cubeEquals, parseCoordKey, coordKey } from '@/game/coordinates';
```

and:

```ts
import {
  createInitialState,
  applyMove,
  legalMoves,
  confirmPromotion as applyConfirmPromotion,
  isInCheck,
  promotionCellsForPlayer,
} from '@/game/hexchess';
```

Add the new type and constant right after the `AnimatingCapture` interface (before `interface HexChessStoreState`):

```ts
export interface QueuedHexPreMove {
  pieceId: string;
  to: CubeCoord;
  promotion: HexPieceType | null;
}

export const HEX_MAX_PRE_MOVES = 3;
```

Add fields to `HexChessStoreState` (after `captureTimeoutId: ReturnType<typeof setTimeout> | null;`):

```ts
  preMoves: QueuedHexPreMove[];
  preMoveSelectedPieceId: string | null;
  pendingPreMovePromotion: { pieceId: string; to: CubeCoord } | null;
```

Add method signatures to `HexChessStoreState` (after `clearGame: () => void;`):

```ts
  selectPreMovePiece: (pieceId: string | null) => void;
  queuePreMove: (to: CubeCoord) => void;
  confirmPreMovePromotion: (choice: HexPieceType) => void;
  cancelPreMovePromotion: () => void;
  cancelPreMoveAt: (index: number) => void;
  clearAllPreMoves: () => void;
  getVirtualPieces: () => HexPiece[];
```

Add initial values in the store's initial state object (after `captureTimeoutId: null,`):

```ts
  preMoves: [],
  preMoveSelectedPieceId: null,
  pendingPreMovePromotion: null,
```

In `createGame`, `loadGame`, and `clearGame`, add the same three fields to each of their `set({...})` calls (each currently resets `selectedPieceId`, `legalMoveTargets`, `lastMove`, `animatingCapture`, `captureTimeoutId` — add right after `captureTimeoutId: null,` in each):

```ts
      preMoves: [],
      preMoveSelectedPieceId: null,
      pendingPreMovePromotion: null,
```

Add the new actions after `clearGame()`'s closing `},` and before the final `}));`:

```ts
  // ---- Pre-moves ----

  selectPreMovePiece(pieceId) {
    const { preMoveSelectedPieceId } = get();
    if (pieceId === null || preMoveSelectedPieceId === pieceId) {
      set({ preMoveSelectedPieceId: null });
      return;
    }
    set({ preMoveSelectedPieceId: pieceId });
  },

  queuePreMove(to) {
    const { state, preMoveSelectedPieceId, preMoves } = get();
    if (!state || preMoveSelectedPieceId === null) return;
    if (preMoves.length >= HEX_MAX_PRE_MOVES) return;

    const piece = state.pieces.find(p => p.id === preMoveSelectedPieceId);
    if (!piece) {
      set({ preMoveSelectedPieceId: null });
      return;
    }

    const isPromotable = piece.type === 'soldier' || piece.type === 'pawn';
    if (isPromotable && promotionCellsForPlayer(piece.player).has(coordKey(to))) {
      set({
        pendingPreMovePromotion: { pieceId: piece.id, to },
        preMoveSelectedPieceId: null,
      });
      return;
    }

    set({
      preMoves: [...preMoves, { pieceId: piece.id, to, promotion: null }],
      preMoveSelectedPieceId: null,
    });
  },

  confirmPreMovePromotion(choice) {
    const { pendingPreMovePromotion, preMoves } = get();
    if (!pendingPreMovePromotion) return;
    set({
      preMoves: [...preMoves, {
        pieceId: pendingPreMovePromotion.pieceId,
        to: pendingPreMovePromotion.to,
        promotion: choice,
      }],
      pendingPreMovePromotion: null,
    });
  },

  cancelPreMovePromotion() {
    const { pendingPreMovePromotion } = get();
    if (!pendingPreMovePromotion) return;
    set({
      preMoveSelectedPieceId: pendingPreMovePromotion.pieceId,
      pendingPreMovePromotion: null,
    });
  },

  cancelPreMoveAt(index) {
    const { preMoves } = get();
    if (index < 0 || index >= preMoves.length) return;
    set({ preMoves: preMoves.slice(0, index) });
  },

  clearAllPreMoves() {
    set({ preMoves: [], preMoveSelectedPieceId: null, pendingPreMovePromotion: null });
  },

  getVirtualPieces() {
    const { state, preMoves } = get();
    if (!state) return [];
    let pieces = state.pieces.map(p => ({ ...p }));
    for (const pm of preMoves) {
      pieces = pieces
        .filter(p => !(cubeEquals(p.cell, pm.to) && p.id !== pm.pieceId))
        .map(p => (p.id === pm.pieceId ? { ...p, cell: pm.to } : p));
    }
    return pieces;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/hexChessStore.preMoves.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Run the full existing hexChessStore test suite to check for regressions**

Run: `npx vitest run tests/store/hexChessStore.test.ts tests/store/hexChessStore.captureAnimation.test.ts tests/store/hexChessStore.selectBoardView.test.ts`
Expected: PASS (unchanged — these don't touch pre-move fields yet; Task 2 updates `selectBoardView`)

- [ ] **Step 6: Commit**

```bash
git add src/store/hexChessStore.ts tests/store/hexChessStore.preMoves.test.ts
git commit -m "feat(hexchess): add pre-move queue state and actions to hexChessStore"
```

---

### Task 2: `selectHexChessBoardView` — pre-move highlights

**Files:**
- Modify: `src/types/boardView.ts`
- Modify: `src/store/hexChessStore.ts`
- Test: `tests/store/hexChessStore.selectBoardView.test.ts`

**Interfaces:**
- Consumes: `QueuedHexPreMove`, `HEX_MAX_PRE_MOVES` from Task 1 (not directly needed here, just the store fields `preMoves: QueuedHexPreMove[]` and `preMoveSelectedPieceId: string | null`)
- Produces: `BoardHighlightKind` gains `'preMoveFrom' | 'preMoveTo'` (consumed by Task 3); `selectHexChessBoardView` now emits these highlights (consumed by Task 3's visual tests and by the running app)

- [ ] **Step 1: Write the failing tests**

Add to `tests/store/hexChessStore.selectBoardView.test.ts` (append inside the existing `describe('selectHexChessBoardView', ...)` block, after the last existing `it(...)`):

```ts
  it('includes a preMoveFrom highlight for the currently selected (not yet queued) piece', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const mover = state.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      preMoves: [],
      preMoveSelectedPieceId: mover.id,
    } as never);

    expect(view!.highlights).toContainEqual({ kind: 'preMoveFrom', cell: mover.cell });
  });

  it('includes preMoveFrom/preMoveTo highlights for a queued pre-move', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const mover = state.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    const destination = { q: 0, r: -6, s: 6 };
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      preMoves: [{ pieceId: mover.id, to: destination, promotion: null }],
      preMoveSelectedPieceId: null,
    } as never);

    expect(view!.highlights).toContainEqual({ kind: 'preMoveFrom', cell: mover.cell });
    expect(view!.highlights).toContainEqual({ kind: 'preMoveTo', cell: destination });
  });

  it('chains preMoveFrom/preMoveTo across multiple queued moves for the same piece', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const mover = state.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    const mid = { q: 0, r: -6, s: 6 };
    const finalCell = { q: 0, r: -4, s: 4 };
    const view = selectHexChessBoardView({
      state,
      gameId: 'test-game',
      config: DEFAULT_CONFIG,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      preMoves: [
        { pieceId: mover.id, to: mid, promotion: null },
        { pieceId: mover.id, to: finalCell, promotion: null },
      ],
      preMoveSelectedPieceId: null,
    } as never);

    const froms = view!.highlights.filter(h => h.kind === 'preMoveFrom').map(h => h.cell);
    const tos = view!.highlights.filter(h => h.kind === 'preMoveTo').map(h => h.cell);
    expect(froms).toContainEqual(mover.cell);
    expect(froms).toContainEqual(mid);
    expect(tos).toContainEqual(mid);
    expect(tos).toContainEqual(finalCell);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/hexChessStore.selectBoardView.test.ts`
Expected: FAIL — `'preMoveFrom'`/`'preMoveTo'` highlights are never emitted yet (and `BoardHighlightKind` doesn't include them, so TS will also complain).

- [ ] **Step 3: Add the highlight kinds and implement the selector logic**

In `src/types/boardView.ts`, change:

```ts
export type BoardHighlightKind =
  | 'selection'
  | 'legalMoveEmpty'
  | 'legalMoveCapture'
  | 'lastMoveFrom'
  | 'lastMoveTo'
  | 'check';
```

to:

```ts
export type BoardHighlightKind =
  | 'selection'
  | 'legalMoveEmpty'
  | 'legalMoveCapture'
  | 'lastMoveFrom'
  | 'lastMoveTo'
  | 'check'
  | 'preMoveFrom'
  | 'preMoveTo';
```

In `src/store/hexChessStore.ts`, update the destructure at the top of `selectHexChessBoardView`:

```ts
export function selectHexChessBoardView(store: HexChessStoreState): BoardView | null {
  const { state, config, selectedPieceId, legalMoveTargets, lastMove } = store;
  // animatingCapture / pre-move fields may be absent in legacy test snapshots (passed via `as never`)
  const animatingCapture: AnimatingCapture | null = store.animatingCapture ?? null;
  const preMoves: QueuedHexPreMove[] = store.preMoves ?? [];
  const preMoveSelectedPieceId: string | null = store.preMoveSelectedPieceId ?? null;
```

Then, right after the existing "Check highlight on king" block (which ends with the closing `}` of the `if (isInCheck(...))` block, before the `// Hex chess rotation.` comment), add:

```ts
  // Pre-move highlights: walk the queue in order, tracking each pre-moved
  // piece's virtual cell so multi-hop plans for the same piece chain correctly.
  if (preMoves.length > 0 || preMoveSelectedPieceId !== null) {
    const virtualCellByPieceId = new Map<string, CubeCoord>(
      state.pieces.map(p => [p.id, p.cell] as const)
    );
    for (const pm of preMoves) {
      const fromCell = virtualCellByPieceId.get(pm.pieceId);
      if (fromCell) highlights.push({ kind: 'preMoveFrom', cell: fromCell });
      highlights.push({ kind: 'preMoveTo', cell: pm.to });
      virtualCellByPieceId.set(pm.pieceId, pm.to);
    }
    if (preMoveSelectedPieceId !== null) {
      const cell = virtualCellByPieceId.get(preMoveSelectedPieceId);
      if (cell) highlights.push({ kind: 'preMoveFrom', cell });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/hexChessStore.selectBoardView.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "boardView\|hexChessStore"`
Expected: no output (no new errors in these two files)

- [ ] **Step 6: Commit**

```bash
git add src/types/boardView.ts src/store/hexChessStore.ts tests/store/hexChessStore.selectBoardView.test.ts
git commit -m "feat(hexchess): compute pre-move highlights in selectHexChessBoardView"
```

---

### Task 3: `Board.tsx` — render pre-move highlights, add right-click escape hatch

**Files:**
- Modify: `src/components/board/Board.tsx`
- Test: `tests/components/board/highlights.test.tsx`

**Interfaces:**
- Consumes: `BoardHighlightKind` values `'preMoveFrom'` / `'preMoveTo'` from Task 2
- Produces: `BoardProps.onCellRightClick?: (coord: CubeCoord) => void` (consumed by Task 5)

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/board/highlights.test.tsx`, inside the existing `describe('Board highlight rendering', ...)` block, after the last `it(...)`:

```ts
  it('renders a dashed violet ring for preMoveFrom', () => {
    const html = renderBoard(makeView([{ kind: 'preMoveFrom', cell }]));
    expect(html).toMatch(/stroke="#8b5cf6"/);
    expect(html).toContain('<circle');
  });

  it('renders a dashed violet dot for preMoveTo', () => {
    const html = renderBoard(makeView([{ kind: 'preMoveTo', cell }]));
    expect(html).toMatch(/stroke="#8b5cf6"/);
    expect(html).toContain('<circle');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/board/highlights.test.tsx`
Expected: FAIL — the two new `it` blocks fail (no `#8b5cf6` stroke rendered for these highlight kinds yet).

- [ ] **Step 3: Implement the rendering + the new prop**

In `src/components/board/Board.tsx`, add the new prop to `BoardProps` (right after `onCellClick`):

```ts
interface BoardProps {
  fixedRotationPlayer?: PlayerIndex;
  isLocalPlayerTurn?: boolean;
  onCellClick?: (coord: CubeCoord) => void;
  /** When provided, right-clicks call this instead of the Chinese Checkers pre-move cancel flow. */
  onCellRightClick?: (coord: CubeCoord) => void;
  highlightCoord?: CubeCoord;
  preMovesAllowed?: boolean;
  localPlayer?: PlayerIndex;
  view?: BoardView;
}
```

Update the function signature to destructure it:

```ts
export function Board({ fixedRotationPlayer, isLocalPlayerTurn, onCellClick, onCellRightClick, highlightCoord, preMovesAllowed, localPlayer, view: viewProp }: BoardProps = {}) {
```

Update both existing `onContextMenu` attributes (search for `onContextMenu={preMovesAllowed ? (e) => { e.preventDefault(); handlePreMoveRightClick(coord); } : undefined}` — there are two occurrences, character-for-character identical: one in the background-cells layer, one in the pieces layer. If using a find/replace tool that requires a unique match, use its "replace all occurrences" option rather than trying to disambiguate them) to:

```tsx
            onContextMenu={
              onCellRightClick
                ? (e) => { e.preventDefault(); onCellRightClick(coord); }
                : (preMovesAllowed ? (e) => { e.preventDefault(); handlePreMoveRightClick(coord); } : undefined)
            }
```

In the highlight-rendering block (search for `const newKindHighlights = renderHighlights.filter(`), change:

```ts
        const newKindHighlights = renderHighlights.filter(
          h => h.kind === 'legalMoveEmpty' || h.kind === 'check' ||
               (h.kind === 'lastMoveFrom' && showLastMoves)
        );
```

to:

```ts
        const newKindHighlights = renderHighlights.filter(
          h => h.kind === 'legalMoveEmpty' || h.kind === 'check' ||
               h.kind === 'preMoveFrom' || h.kind === 'preMoveTo' ||
               (h.kind === 'lastMoveFrom' && showLastMoves)
        );
```

In the same block's `switch (h.kind)`, add two new cases right before the `default: return null;` case (after the existing `case 'lastMoveFrom':` case's `return (...)`):

```tsx
                case 'preMoveFrom':
                  return (
                    <circle
                      key={stableKey}
                      cx={px}
                      cy={py}
                      r={pieceRadius + 3}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      strokeDasharray="4 3"
                      pointerEvents="none"
                    />
                  );
                case 'preMoveTo':
                  return (
                    <circle
                      key={stableKey}
                      cx={px}
                      cy={py}
                      r={6}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      strokeDasharray="3 2"
                      pointerEvents="none"
                    />
                  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/board/highlights.test.tsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Type-check and run the full component test directory**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Board.tsx"`
Expected: no output

Run: `npx vitest run tests/components/board`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Board.tsx tests/components/board/highlights.test.tsx
git commit -m "feat(hexchess): render pre-move highlights and add onCellRightClick escape hatch to Board"
```

---

### Task 4: `useHexChessPreMoveFiring` hook

**Files:**
- Create: `src/hooks/useHexChessPreMoveFiring.ts`
- Test: `tests/hooks/useHexChessPreMoveFiring.test.ts` (new)

**Interfaces:**
- Consumes: `QueuedHexPreMove` type, `useHexChessStore` state/actions from Task 1 (`state`, `preMoves`, `preMoveSelectedPieceId`, `animatingCapture`, `selectPiece`, `attemptMove`, `confirmPromotion`)
- Produces:
  - `export function resolvePreMoveFiring(state: HexChessState, preMoves: QueuedHexPreMove[], preMoveSelectedPieceId: string | null): PreMoveFiringDecision` — pure decision function, unit tested directly
  - `export type PreMoveFiringDecision = { type: 'none' } | { type: 'promote-selection'; pieceId: string } | { type: 'fire'; pieceId: string; to: CubeCoord; promotion: HexPieceType | null } | { type: 'invalidate' }`
  - `export function useHexChessPreMoveFiring(localPlayer: PlayerIndex | undefined, active?: boolean): void` — the effectful hook, mounted in Task 5, not unit tested directly (matches this codebase's existing pattern of testing the pure logic extracted from `useHexChessAITurn.ts` rather than the `useEffect` itself, and the Chinese Checkers `usePreMoveFiring.ts` sibling also has no hook-level test)

- [ ] **Step 1: Write the failing test file**

Create `tests/hooks/useHexChessPreMoveFiring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePreMoveFiring } from '@/hooks/useHexChessPreMoveFiring';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[], currentPlayer: 0 | 1 = 0): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

function piece(id: string, player: 0 | 1, type: HexPiece['type'], q: number, r: number): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

describe('resolvePreMoveFiring', () => {
  it('returns none when nothing is queued and nothing is selected', () => {
    const state = stateWith([piece('k0', 0, 'king', 4, -8)]);
    expect(resolvePreMoveFiring(state, [], null)).toEqual({ type: 'none' });
  });

  it('returns promote-selection when the queue is empty but a piece is selected', () => {
    const state = stateWith([piece('k0', 0, 'king', 4, -8)]);
    expect(resolvePreMoveFiring(state, [], 'k0')).toEqual({ type: 'promote-selection', pieceId: 'k0' });
  });

  it('returns fire for a queued move that is still legal', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const state = stateWith([rook, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    const decision = resolvePreMoveFiring(state, [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }], null);
    expect(decision).toEqual({ type: 'fire', pieceId: 'r0', to: cubeCoord(3, 0), promotion: null });
  });

  it('returns invalidate when the queued destination is no longer reachable', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const blocker = piece('b1', 1, 'knight', 1, 0);
    const state = stateWith([rook, blocker, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    // blocker sits directly between the rook and (3,0), so that cell is no longer reachable
    const decision = resolvePreMoveFiring(state, [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }], null);
    expect(decision).toEqual({ type: 'invalidate' });
  });

  it('prioritizes the queued move over a lingering selection', () => {
    const rook = piece('r0', 0, 'rook', 0, 0);
    const state = stateWith([rook, piece('k0', 0, 'king', 4, -8), piece('k1', 1, 'king', -4, 8)]);
    const decision = resolvePreMoveFiring(
      state,
      [{ pieceId: 'r0', to: cubeCoord(3, 0), promotion: null }],
      'some-other-piece-id',
    );
    expect(decision.type).toBe('fire');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/useHexChessPreMoveFiring.test.ts`
Expected: FAIL — module `@/hooks/useHexChessPreMoveFiring` doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useHexChessPreMoveFiring.ts`:

```ts
'use client';

import { useEffect, useRef } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import type { QueuedHexPreMove } from '@/store/hexChessStore';
import { legalMoves } from '@/game/hexchess';
import type { HexChessState, HexPieceType } from '@/game/hexchess/state';
import { cubeEquals } from '@/game/coordinates';
import type { CubeCoord, PlayerIndex } from '@/types/game';

export type PreMoveFiringDecision =
  | { type: 'none' }
  | { type: 'promote-selection'; pieceId: string }
  | { type: 'fire'; pieceId: string; to: CubeCoord; promotion: HexPieceType | null }
  | { type: 'invalidate' };

/**
 * Pure decision function for what the pre-move firing hook should do, given
 * the real current state and the queue. Kept separate from the useEffect
 * below so it can be unit tested without mounting React.
 */
export function resolvePreMoveFiring(
  state: HexChessState,
  preMoves: QueuedHexPreMove[],
  preMoveSelectedPieceId: string | null,
): PreMoveFiringDecision {
  if (preMoves.length === 0) {
    if (preMoveSelectedPieceId !== null) {
      return { type: 'promote-selection', pieceId: preMoveSelectedPieceId };
    }
    return { type: 'none' };
  }

  const pm = preMoves[0];
  const legals = legalMoves(state).filter(m => m.pieceId === pm.pieceId);
  const target = legals.find(m => cubeEquals(m.to, pm.to));
  if (!target) return { type: 'invalidate' };

  return { type: 'fire', pieceId: pm.pieceId, to: pm.to, promotion: pm.promotion };
}

/**
 * Fires queued pre-moves when the local user's turn arrives in hex chess.
 * Only one pre-move fires per real turn — `attemptMove` flips `currentPlayer`
 * away from `localPlayer`, which stops the effect from firing again until
 * the opponent replies.
 */
export function useHexChessPreMoveFiring(localPlayer: PlayerIndex | undefined, active: boolean = true) {
  const state = useHexChessStore((s) => s.state);
  const preMoves = useHexChessStore((s) => s.preMoves);
  const preMoveSelectedPieceId = useHexChessStore((s) => s.preMoveSelectedPieceId);
  const animatingCapture = useHexChessStore((s) => s.animatingCapture);

  const firingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (localPlayer === undefined) return;
    if (!state) return;
    if (state.result !== null) return;
    if (state.currentPlayer !== localPlayer) return;
    if (state.pendingPromotion !== null) return;
    if (animatingCapture) return;
    if (firingRef.current) return;

    const decision = resolvePreMoveFiring(state, preMoves, preMoveSelectedPieceId);
    if (decision.type === 'none') return;

    firingRef.current = true;

    if (decision.type === 'promote-selection') {
      useHexChessStore.setState({ preMoveSelectedPieceId: null });
      useHexChessStore.getState().selectPiece(decision.pieceId);
      firingRef.current = false;
      return;
    }

    if (decision.type === 'invalidate') {
      useHexChessStore.setState({ preMoves: [], preMoveSelectedPieceId: null });
      firingRef.current = false;
      return;
    }

    // decision.type === 'fire'
    useHexChessStore.setState({ preMoves: preMoves.slice(1) });
    useHexChessStore.getState().selectPiece(decision.pieceId);
    useHexChessStore.getState().attemptMove(decision.to);
    const afterMove = useHexChessStore.getState().state;
    if (afterMove?.pendingPromotion) {
      useHexChessStore.getState().confirmPromotion(decision.promotion ?? 'queen');
    }
    firingRef.current = false;
  }, [active, localPlayer, state, preMoves, preMoveSelectedPieceId, animatingCapture]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hooks/useHexChessPreMoveFiring.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "useHexChessPreMoveFiring"`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useHexChessPreMoveFiring.ts tests/hooks/useHexChessPreMoveFiring.test.ts
git commit -m "feat(hexchess): add useHexChessPreMoveFiring hook with pure decision logic"
```

---

### Task 5: `HexClearPreMovesButton`, `HexGameContainer` wiring, `SettingsPopup` copy

**Files:**
- Create: `src/components/hexchess/HexClearPreMovesButton.tsx`
- Modify: `src/components/hexchess/HexGameContainer.tsx`
- Modify: `src/components/SettingsPopup.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4 (`hexChessStore` pre-move fields/actions, `Board`'s `onCellRightClick` prop, `useHexChessPreMoveFiring`)
- Produces: the complete, usable feature — verified manually in this task (no new automated test; see Step 5)

- [ ] **Step 1: Create `HexClearPreMovesButton`**

Create `src/components/hexchess/HexClearPreMovesButton.tsx`:

```tsx
'use client';

import { useHexChessStore } from '@/store/hexChessStore';
import { getCSSColor } from '@/game/constants';
import type { PlayerIndex } from '@/types/game';

interface HexClearPreMovesButtonProps {
  localPlayer: PlayerIndex | undefined;
}

export function HexClearPreMovesButton({ localPlayer }: HexClearPreMovesButtonProps) {
  const preMoves = useHexChessStore((s) => s.preMoves);
  const config = useHexChessStore((s) => s.config);
  const clearAllPreMoves = useHexChessStore((s) => s.clearAllPreMoves);

  if (preMoves.length === 0 || localPlayer === undefined || !config) return null;

  const color = getCSSColor(config.players[localPlayer].color);
  const label = preMoves.length === 1 ? 'Clear pre-move' : `Clear ${preMoves.length} pre-moves`;

  return (
    <div className="flex justify-center mt-2 sm:mt-3">
      <button
        onClick={clearAllPreMoves}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors border-2"
        style={{ borderColor: color }}
      >
        {label}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire pre-moves into `HexGameContainer.tsx`**

In `src/components/hexchess/HexGameContainer.tsx`, update the import block at the top from:

```tsx
'use client';

import Link from 'next/link';
import { useHexChessStore, selectHexChessBoardView } from '@/store/hexChessStore';
import { Board } from '@/components/board/Board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexGameOverDialog } from '@/components/hexchess/HexGameOverDialog';
import type { CubeCoord } from '@/types/game';
import { cubeEquals } from '@/game/coordinates';
import { useHexChessAITurn } from '@/hooks/useHexChessAITurn';
```

to:

```tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useHexChessStore, selectHexChessBoardView } from '@/store/hexChessStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Board } from '@/components/board/Board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexGameOverDialog } from '@/components/hexchess/HexGameOverDialog';
import { HexClearPreMovesButton } from '@/components/hexchess/HexClearPreMovesButton';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import { cubeEquals } from '@/game/coordinates';
import { useHexChessAITurn } from '@/hooks/useHexChessAITurn';
import { useHexChessPreMoveFiring } from '@/hooks/useHexChessPreMoveFiring';
```

Update the top of the component body from:

```tsx
export function HexGameContainer() {
  useHexChessAITurn();
  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);
```

to:

```tsx
export function HexGameContainer() {
  useHexChessAITurn();
  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);
  const preMovesSetting = useSettingsStore((s) => s.preMoves);

  const humanPlayers = store.config
    ? ([0, 1] as const).filter((p) => !store.config!.ai?.[p])
    : [];
  const localPlayer: PlayerIndex | undefined =
    humanPlayers.length === 1 ? (humanPlayers[0] as PlayerIndex) : undefined;
  const preMovesAllowed = !!(
    preMovesSetting &&
    localPlayer !== undefined &&
    store.state &&
    store.state.result === null &&
    store.state.currentPlayer !== localPlayer &&
    store.state.pendingPromotion === null
  );

  useHexChessPreMoveFiring(localPlayer, preMovesSetting && localPlayer !== undefined);

  // Drop any queued pre-moves if the setting is turned off mid-game, or the
  // game ends — stale queued highlights shouldn't linger over the game-over UI.
  useEffect(() => {
    if (!preMovesSetting) useHexChessStore.getState().clearAllPreMoves();
  }, [preMovesSetting]);
  useEffect(() => {
    if (store.state?.result) useHexChessStore.getState().clearAllPreMoves();
  }, [store.state?.result]);
```

Update `handleCellClick` from:

```tsx
  const handleCellClick = (cell: CubeCoord) => {
    // Always read the freshest store snapshot — the outer `store` closure captured
    // at render time can be stale between rapid clicks in the same frame.
    const s = useHexChessStore.getState();
    const state = s.state;
    if (!state) return;

    // Never let the human move on an AI player's turn. Prevents both accidental
    // input during the AI's think time and any lingering ability to nudge AI
    // pieces if the worker times out.
    if (s.config?.ai && s.config.ai[state.currentPlayer]) {
      return;
    }
```

to:

```tsx
  const handleCellClick = (cell: CubeCoord) => {
    // Always read the freshest store snapshot — the outer `store` closure captured
    // at render time can be stale between rapid clicks in the same frame.
    const s = useHexChessStore.getState();
    const state = s.state;
    if (!state) return;

    // Pre-move mode: divert clicks away from the normal move flow entirely,
    // including the AI-turn guard below (pre-moves are queued precisely
    // because it's the AI's turn).
    if (preMovesAllowed) {
      const virtualPieces = s.getVirtualPieces();
      const hit = virtualPieces.find((p) => cubeEquals(p.cell, cell));
      if (hit && localPlayer !== undefined && hit.player === localPlayer) {
        s.selectPreMovePiece(hit.id);
      } else if (s.preMoveSelectedPieceId !== null) {
        s.queuePreMove(cell);
      }
      return;
    }

    // Never let the human move on an AI player's turn. Prevents both accidental
    // input during the AI's think time and any lingering ability to nudge AI
    // pieces if the worker times out.
    if (s.config?.ai && s.config.ai[state.currentPlayer]) {
      return;
    }
```

Add a new `handleCellRightClick` function right after `handleCellClick`'s closing `};` (before `const handlePromote = ...`):

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

Update the `<Board>` element from:

```tsx
          {view && (
            <Board
              view={view}
              onCellClick={handleCellClick}
            />
          )}
          {store.state.pendingPromotion && (
            <PromotionPicker
              pieceCell={store.state.pendingPromotion.targetCell}
              playerColor={currentColor}
              onChoose={handlePromote}
            />
          )}
```

to:

```tsx
          {view && (
            <Board
              view={view}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
            />
          )}
          {store.state.pendingPromotion && (
            <PromotionPicker
              pieceCell={store.state.pendingPromotion.targetCell}
              playerColor={currentColor}
              onChoose={handlePromote}
            />
          )}
          {!store.state.pendingPromotion && store.pendingPreMovePromotion && localPlayer !== undefined && (
            <PromotionPicker
              pieceCell={store.pendingPreMovePromotion.to}
              playerColor={store.config.players[localPlayer].color}
              onChoose={(choice) => store.confirmPreMovePromotion(choice)}
              onCancel={() => store.cancelPreMovePromotion()}
            />
          )}
```

Update the "Last-move summary + resign" section to add the clear-pre-moves button right after it, from:

```tsx
        {/* Last-move summary + resign */}
        <div className="mt-2 sm:mt-3">
          <HexMoveIndicator
            lastMove={store.lastMove}
            canResign={store.state.result === null}
            onResign={handleResign}
          />
        </div>

        {/* Turn indicator */}
```

to:

```tsx
        {/* Last-move summary + resign */}
        <div className="mt-2 sm:mt-3">
          <HexMoveIndicator
            lastMove={store.lastMove}
            canResign={store.state.result === null}
            onResign={handleResign}
          />
        </div>

        {preMovesAllowed && <HexClearPreMovesButton localPlayer={localPlayer} />}

        {/* Turn indicator */}
```

- [ ] **Step 3: Mode-aware "Pre-moves" copy in `SettingsPopup.tsx`**

In `src/components/SettingsPopup.tsx`, change:

```tsx
              <ToggleOption
                label="Pre-moves"
                description={preMoves ? 'Queue up to 6 moves while opponents take their turns' : 'Play only when it\'s your turn'}
                checked={preMoves}
                onChange={togglePreMoves}
              />
```

to:

```tsx
              <ToggleOption
                label="Pre-moves"
                description={
                  preMoves
                    ? (mode === 'hexchess'
                        ? 'Queue up to 3 moves while your opponent thinks'
                        : 'Queue up to 6 moves while opponents take their turns')
                    : 'Play only when it\'s your turn'
                }
                checked={preMoves}
                onChange={togglePreMoves}
              />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "HexGameContainer\|HexClearPreMovesButton\|SettingsPopup"`
Expected: no output

- [ ] **Step 5: Run the full test suite for regressions**

Run: `npx vitest run`
Expected: PASS on everything except the pre-existing, unrelated failures already documented in project memory (`tests/game/pathfinding.test.ts` TS errors, and any known-flaky Sternhalma AI personality test). If any hex chess test fails, stop and fix before proceeding.

- [ ] **Step 6: Manual verification in the browser**

Run: `npm run dev` (or use the project's `/run` skill if available)

1. Go to `/play`, start a hex chess game as a human vs. an AI (any difficulty).
2. Open Settings → Gameplay tab, confirm "Pre-moves" now reads "Queue up to 3 moves while your opponent thinks" and is ON by default.
3. During the AI's turn, click one of your pieces, then click a destination cell — confirm a dashed violet ring appears on the piece's cell and a dashed violet dot appears on the destination.
4. Queue a second pre-move for a different piece — confirm it also renders, and a "Clear 2 pre-moves" button appears below the move indicator.
5. Right-click a queued destination — confirm it's removed (and if it was the only one, the Clear button disappears).
6. Queue a pre-move, wait for the AI to move, and confirm your queued move fires automatically once it becomes your turn (assuming it's still legal).
7. Queue a soldier's pre-move onto a cell in the opponent's half (past the midline) — confirm the promotion picker opens immediately (before the AI has even moved), pick a piece type, and confirm it queues; later when it fires, confirm the piece promotes to the chosen type without any further prompt.
8. Turn the "Pre-moves" setting off while a queue is pending — confirm the queue and any highlights disappear immediately.
9. Click "Clear pre-move(s)" — confirm the queue empties and highlights disappear.

If any of these misbehave, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add src/components/hexchess/HexClearPreMovesButton.tsx src/components/hexchess/HexGameContainer.tsx src/components/SettingsPopup.tsx
git commit -m "feat(hexchess): wire pre-moves into HexGameContainer, add clear button and settings copy"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec (data model, click routing incl. right-click plumbing, firing, visuals, settings, lifecycle resets) maps to a task above. `getVirtualPieces` (Task 1), `preMoveFrom`/`preMoveTo` highlights (Tasks 2–3), queue-time promotion picker (Tasks 1 and 5), `onCellRightClick` prop (Tasks 3 and 5), mode-aware settings copy (Task 5), reset-on-toggle-off and reset-on-game-over (Task 5) are all present.
- **Deviation from spec, called out explicitly:** the spec's file list mentioned a `cancelPreMoveSelection` action mirroring the Chinese Checkers API. This plan drops it as a separate action — `selectPreMovePiece(null)` already covers "deselect," and there was no real UI call site for a separate action (the spec's own click-routing table only ever needs toggle-off-on-repeat-click, which `selectPreMovePiece` already handles). `handleCellRightClick` in Task 5 uses `selectPreMovePiece(null)` directly for "right-click the currently selected piece to cancel its selection," a small addition beyond the spec's literal text but consistent with its intent (symmetric cancel gestures) and given a real call site.
- **Type consistency check:** `QueuedHexPreMove { pieceId, to, promotion }` (Task 1) is used identically in Task 2's highlight computation, Task 4's `resolvePreMoveFiring`, and Task 5's click routing — no renamed fields across tasks. `HEX_MAX_PRE_MOVES` is only referenced in Task 1.
