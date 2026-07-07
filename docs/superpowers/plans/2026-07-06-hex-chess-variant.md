# Hex Chess Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2-player Hex Chess mode alongside Chinese Checkers on the standard 121-cell Sternhalma star board, using Gliński-style movement, Soldier front pieces, checkmate win condition, and a standalone AI + store + persistence.

**Architecture:** Shared board rendering / coordinate system / infrastructure. Separate rules engine (`src/game/hexchess/`), AI (`src/game/ai/hexchess/`), and Zustand store (`src/store/hexChessStore.ts`). `Board.tsx`, `BoardCell.tsx`, and `Piece.tsx` refactored to consume a mode-agnostic `BoardView` prop shape so both modes render through the same code path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand 5, Vitest, Tailwind CSS 4. Web Worker for AI. localStorage for persistence. SVG-based board rendering with cube coordinates (`{q, r, s}`).

**Spec:** `docs/superpowers/specs/2026-07-06-hex-chess-variant-design.md`

## Global Constraints

- **v1 is 2-player only.** No 3–6 player, no team mode for hex chess. Sternhalma keeps its full player-count range unchanged.
- **Sternhalma must remain stable throughout.** Every commit that touches shared files must leave `npm run test` and `npm run build` green.
- **No auto-commit.** Each task ends with a suggested commit command, but do NOT run it without user approval. The task list drives sequencing; the human decides commit cadence.
- **Board is not rotated.** Hex chess uses the same pointy-top rendering as Sternhalma. Play axis is a diagonal corner axis between two opposite arms.
- **Piece roster (v1 default layout):** 1 King, 1 Queen, 2 Rooks, 2 Bishops, 4 Soldiers per player. No Knights or Pawns in the fixed layout, but Knights and Pawns MUST be implemented in the engine for future editor use.
- **Movement:** Gliński conventions unchanged. Rook = 6 edges. Bishop = 6 diagonals (2-hex corner steps). Queen = 12 directions. Knight = 12 nearest-non-queen-reachable leaps. King = 12 short steps.
- **Soldier:** move 1 forward diagonal; capture 1 of 2 forward edges. Promotes on any opposing-arm cell (Q/R/B/N). Special en passant when a normal move lands edge-adjacent to an enemy Soldier and that enemy's forward-diagonal lines up with a passed-through cell.
- **Pawn:** move 1 forward edge; double-step first move retained while on any pawn-starting cell. Capture 1 of 2 forward diagonals. Classical en passant against other pawns.
- **Draws:** stalemate → draw. Threefold repetition → draw. Insufficient material → draw (K vs K; K+B vs K; K+N vs K; K+B vs K+B on same hex color).
- **Persistence keys:** `hexchess-game-{id}` and `hexchess-saved-games`. Max 20 saved games, oldest-evicted, mirroring Sternhalma.
- **Types must round-trip through JSON.** `positionHashes` is `Record<string, number>`, not `Map`. Any `Map` in state is a bug.
- **Path alias:** `@/*` → `./src/*`. Use it in all new imports.
- **Testing:** Vitest. Test files in `tests/` mirror source paths. Run one file with `npx vitest tests/path/to/file.test.ts`.
- **Existing coord utilities live in `src/game/coordinates.ts`.** Reuse `coordKey`, `cubeCoord`, `cubeAdd`, `cubeSubtract`, `cubeEquals`, `cubeDistance`, `getNeighbors`. Do NOT redefine these.

---

## File Structure

**New — rules engine (`src/game/hexchess/`)**
- `state.ts` — `HexPieceType`, `HexPiece`, `HexChessState`, `HexMove`, `HexEndReason`, `HexPlayerIndex` type kernel. No behavior.
- `directions.ts` — the 6 edge directions and 6 diagonal directions expressed as `CubeCoord` vectors; per-player forward-diagonal and forward-edge vectors.
- `starting.ts` — v1 layout constant + arm cell computation + `createInitialState(config)`.
- `moves.ts` — pseudo-move generation per piece type + `applyMove(state, move)`.
- `check.ts` — `isCellAttacked`, `isInCheck`, `filterLegal`.
- `endgame.ts` — checkmate / stalemate / repetition / insufficient-material detection.
- `promotion.ts` — pending-promotion tracking + `confirmPromotion`.
- `enPassant.ts` — soldier + pawn en passant tracking.
- `zobrist.ts` — hash tables + incremental hashing.
- `index.ts` — public API surface.

**New — AI (`src/game/ai/hexchess/`)**
- `evaluate.ts` — material + PST + mobility + king safety + soldier structure.
- `moveOrdering.ts` — MVV-LVA, killer moves, history heuristic.
- `transposition.ts` — TT keyed on Zobrist.
- `search.ts` — iterative deepening + alpha-beta + quiescence.
- `worker.ts` — Web Worker postMessage entry point.
- `workerClient.ts` — main-thread wrapper.
- `index.ts` — public API surface.

**New — store, hooks, components, routes**
- `src/store/hexChessStore.ts` — Zustand store.
- `src/hooks/useHexChessAITurn.ts` — parallels `useAITurn`.
- `src/types/hexchess.ts` — shared types crossing rules/store/UI boundaries.
- `src/types/boardView.ts` — mode-agnostic view model for `Board.tsx`.
- `src/components/board/pieceIcons/` — `King.tsx`, `Queen.tsx`, `Rook.tsx`, `Bishop.tsx`, `Knight.tsx`, `index.ts`. Simple SVG glyph components.
- `src/components/hexchess/PromotionPicker.tsx` — floating overlay for promotion choice.
- `src/components/hexchess/HexGameContainer.tsx` — top-level game page structure.
- `src/components/hexchess/HexTurnIndicator.tsx` — turn / check / result banner.
- `src/components/hexchess/HexMoveIndicator.tsx` — last-move summary + resign button.
- `src/components/hexchess/HexGameOverDialog.tsx` — win/draw modal.
- `src/components/hexchess/HowToPlayHexChess.tsx` — static "How to play" modal.
- `src/app/hexchess/[id]/page.tsx` — live game route.
- `src/app/hexchess/replay/[id]/page.tsx` — replay viewer.

**Touched — shared code refactored for both modes**
- `src/components/board/Board.tsx` — consumes `BoardView` prop.
- `src/components/board/BoardCell.tsx` — accepts prop-driven promotion-zone shimmer.
- `src/components/board/Piece.tsx` — accepts optional `pieceType` for glyph overlay.
- `src/store/gameStore.ts` — add `selectBoardView()` selector.
- `src/app/play/page.tsx` — Game Mode selector + section reorder + rename `gameMode` state → `pieceVariant`.
- `src/app/replays/page.tsx` — merge both mode indexes.
- `src/components/SettingsPopup.tsx` — accept `mode` prop, filter visible options.
- `src/audio/soundEffects.ts` (or equivalent) — add `playCapture`, `playCheck`, `playCheckmate`.
- `src/components/GlobalShortcuts.tsx` — extend to `/hexchess` routes for Esc-to-deselect.
- `src/game/persistence.ts` — introduce shared `SavedGameSummary` shape.

---

## Task Overview

The plan is grouped into six milestones matching the spec's 12 phases. Each milestone produces something reviewable.

| Milestone | Phases | Tasks | Deliverable |
|-----------|--------|-------|-------------|
| M1 — Rendering refactor | 1 | 1–5 | Sternhalma renders through `BoardView` prop, all tests pass |
| M2 — Rules engine | 2–5 | 6–24 | Complete legal-move / check / mate / draws / promotion / en passant, verified by perft |
| M3 — Store & persistence | 6 | 25–28 | Playable state machine, save/load/replay reconstruction |
| M4 — UI & rendering | 7 | 29–35 | Board renders chess pieces, promotion picker, capture animation, sounds, indicators |
| M5 — Setup & routing | 8–9 | 36–43 | Play lobby restructure + live game + replay routes |
| M6 — AI & polish | 10–12 | 44–52 | AI opponent, tactical-puzzle suite, How-to-play modal |

Total: 52 tasks.

---

## Milestone 1 — Rendering Refactor

Extract a mode-agnostic `BoardView` interface so `Board.tsx` never branches on which game mode is being rendered. This is the ONLY existing code we touch in this milestone; every change must leave Sternhalma behavior identical.

### Task 1: Define the BoardView type surface

**Files:**
- Create: `src/types/boardView.ts`

**Interfaces:**
- Consumes: `CubeCoord`, `PlayerIndex`, `PieceColor` from existing `@/types/game`.
- Produces: `BoardView`, `BoardPiece`, `BoardHighlight`, `BoardMoveAnimation`, `BoardHighlightKind`, `BoardPieceType`.

- [ ] **Step 1: Create the types file**

```ts
// src/types/boardView.ts
import type { CubeCoord, PlayerIndex, PieceColor } from './game';

export type BoardPieceType =
  | 'marble'
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'soldier';

export type BoardHighlightKind =
  | 'selection'
  | 'legalMoveEmpty'
  | 'legalMoveCapture'
  | 'lastMoveFrom'
  | 'lastMoveTo'
  | 'check';

export interface BoardPiece {
  id: string;
  cell: CubeCoord;
  color: PieceColor;
  pieceType?: BoardPieceType;
  faded?: boolean;
}

export interface BoardHighlight {
  kind: BoardHighlightKind;
  cell: CubeCoord;
  playerIndex?: PlayerIndex;
}

export interface BoardMoveAnimation {
  pieceId: string;
  from: CubeCoord;
  to: CubeCoord;
  path?: CubeCoord[];
  separateCaptureCell?: CubeCoord;
  startedAt: number;
}

export interface BoardView {
  cells: CubeCoord[];
  homeZones: Map<PlayerIndex, CubeCoord[]>;
  pieces: BoardPiece[];
  highlights: BoardHighlight[];
  animatingMove: BoardMoveAnimation | null;
  rotation: number;
  activePlayerIndex: PlayerIndex;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS with no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/boardView.ts
git commit -m "feat(hexchess): introduce BoardView type surface"
```

---

### Task 2: Extend gameStore with selectBoardView()

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `tests/store/gameStore.selectBoardView.test.ts`

**Interfaces:**
- Consumes: existing `GameState`, `BoardView`.
- Produces: `selectBoardView(state: GameState): BoardView`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/store/gameStore.selectBoardView.test.ts
import { describe, it, expect } from 'vitest';
import { selectBoardView } from '@/store/gameStore';
import { createGame } from '@/game/setup';

describe('selectBoardView (Sternhalma)', () => {
  it('produces a BoardView with all starting marbles as pieces', () => {
    const state = createGame(2);
    const view = selectBoardView(state);
    // 2 players × 10 marbles each = 20 pieces at start
    expect(view.pieces).toHaveLength(20);
    for (const piece of view.pieces) {
      expect(piece.pieceType ?? 'marble').toBe('marble');
    }
    expect(view.homeZones.size).toBeGreaterThan(0);
    expect(view.activePlayerIndex).toBe(state.currentPlayer);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/gameStore.selectBoardView.test.ts`
Expected: FAIL — `selectBoardView` is not exported.

- [ ] **Step 3: Add the selector**

At the bottom of `src/store/gameStore.ts`, add:

```ts
import type { BoardView, BoardPiece, BoardHighlight } from '@/types/boardView';

export function selectBoardView(state: GameState): BoardView {
  const pieces: BoardPiece[] = [];
  for (const [key, cell] of Object.entries(state.board)) {
    const owner = cell.piece;
    if (owner == null) continue;
    pieces.push({
      id: `sternhalma-${key}`,
      cell: parseCoordKey(key),
      color: state.playerColors[owner],
      pieceType: 'marble',
    });
  }

  const homeZones = new Map<PlayerIndex, CubeCoord[]>();
  const goals = getGoalPositionsForState(state);
  for (const [player, cells] of Object.entries(goals) as [string, CubeCoord[]][]) {
    homeZones.set(Number(player) as PlayerIndex, cells);
  }

  const highlights: BoardHighlight[] = [];
  // Reuse existing selection/last-move data from the store instance if needed by
  // consumers of the selector; the selector itself only produces state-derived
  // highlights. Interactive highlights are added by the Board component wrapper.

  return {
    cells: Object.keys(state.board).map(parseCoordKey),
    homeZones,
    pieces,
    highlights,
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: state.currentPlayer,
  };
}
```

(Import `parseCoordKey` from `@/game/coordinates` if not already imported.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/gameStore.selectBoardView.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite to confirm Sternhalma is unaffected**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/gameStore.ts tests/store/gameStore.selectBoardView.test.ts
git commit -m "feat(hexchess): add selectBoardView selector to gameStore"
```

---

### Task 3: Refactor Board.tsx to accept an optional view prop

Keep the existing store-reading path as a fallback so behavior is unchanged. Task 4 will make it the only path.

**Files:**
- Modify: `src/components/board/Board.tsx`

**Interfaces:**
- Consumes: `BoardView` (optional prop).
- Produces: `<Board view? />` API — when `view` is supplied, uses it; when omitted, falls back to `useGameStore` (existing behavior).

- [ ] **Step 1: Add optional prop and use-once logic**

Near the top of `Board.tsx`:

```tsx
import type { BoardView } from '@/types/boardView';

interface BoardProps {
  view?: BoardView;
}

export function Board({ view: viewProp }: BoardProps = {}) {
  const store = useGameStore();
  const view: BoardView | null = viewProp ?? deriveViewFromStore(store);
  // ... existing render code, but now read cells/pieces/highlights from `view`
}
```

Add a private helper at file-bottom:

```tsx
function deriveViewFromStore(store: ReturnType<typeof useGameStore>): BoardView | null {
  if (!store.gameState) return null;
  return selectBoardView(store.gameState);
}
```

Rewire the render body to read `view.cells`, `view.pieces`, `view.homeZones`, etc. Interactive highlights (`selectedPiece`, `validMovesForSelected`, `lastMoveInfo`) that live on the store are added into `view.highlights` inline before render:

```tsx
const localHighlights: BoardHighlight[] = [...view.highlights];
if (store.selectedPiece) localHighlights.push({ kind: 'selection', cell: store.selectedPiece });
for (const move of store.validMovesForSelected) {
  localHighlights.push({ kind: 'legalMoveEmpty', cell: move.to });
}
if (store.lastMoveInfo) {
  localHighlights.push({ kind: 'lastMoveFrom', cell: store.lastMoveInfo.origin });
  localHighlights.push({ kind: 'lastMoveTo', cell: store.lastMoveInfo.destination });
}
```

- [ ] **Step 2: Run all Sternhalma tests to verify no behavior change**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Run the dev server and open a Sternhalma game manually**

Run: `npm run dev`
Expected: `/play` → start any game → board renders identically to before this task.
Stop server after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/Board.tsx
git commit -m "refactor(board): accept optional BoardView prop with store fallback"
```

---

### Task 4: Refactor Piece.tsx to accept optional pieceType glyph slot

Placeholder glyphs are fine here — real chess glyph SVGs come in Task 29. Task 4's goal is only to widen the API without breaking Sternhalma.

**Files:**
- Modify: `src/components/board/Piece.tsx`

**Interfaces:**
- Consumes: `BoardPieceType` (optional prop).
- Produces: existing `<Piece />` API + new optional `pieceType` prop. When `pieceType` is `'marble'` or `undefined`, renders exactly as today. When any other type, renders the marble PLUS a placeholder glyph (a small SVG letter for the piece type).

- [ ] **Step 1: Add the prop**

Extend the props interface:

```tsx
import type { BoardPieceType } from '@/types/boardView';

interface PieceProps {
  // ... existing props ...
  pieceType?: BoardPieceType;
}
```

At the bottom of the piece's render tree, after the marble SVG elements:

```tsx
{pieceType && pieceType !== 'marble' && (
  <text
    x={cx}
    y={cy}
    textAnchor="middle"
    dominantBaseline="central"
    fontSize={pieceRadius * 0.9}
    fontWeight="bold"
    fill={glyphColor(color)}
    pointerEvents="none"
  >
    {pieceType[0].toUpperCase()}
  </text>
)}
```

Where `glyphColor` is a helper: dark text on light marbles, light text on dark marbles. A simple heuristic works:

```tsx
function glyphColor(color: string): string {
  const lightColors = new Set(['yellow', 'white', 'egg', '#f4f4f0', '#d4a020']);
  return lightColors.has(color) ? '#111' : '#fafafa';
}
```

- [ ] **Step 2: Run all Sternhalma tests**

Run: `npm run test`
Expected: PASS. Sternhalma renders never set `pieceType`, so the new branch is never taken.

- [ ] **Step 3: Commit**

```bash
git add src/components/board/Piece.tsx
git commit -m "refactor(board): accept optional pieceType glyph slot on Piece"
```

---

### Task 5: Refactor BoardCell.tsx to accept a promotion-zone shimmer flag

Sternhalma's goal-zone shimmer today reads directly from the game state. Move that read to a prop so hex chess can drive it independently for the opponent's arm (promotion zone).

**Files:**
- Modify: `src/components/board/BoardCell.tsx`
- Modify: `src/components/board/Board.tsx` (pass the new prop)

**Interfaces:**
- Consumes: existing cell/piece props.
- Produces: new optional `homeZonePlayer?: PlayerIndex` prop on `<BoardCell />`. When set and the cell is in that player's `homeZones` entry, renders the shimmer.

- [ ] **Step 1: Add the prop and route it**

In `BoardCell.tsx`, add `homeZonePlayer?: PlayerIndex` to props. Replace the current in-component computation of "is this a goal zone for X" with reading the prop. Existing shimmer logic keys off `homeZonePlayer`.

In `Board.tsx`, when rendering each cell, look it up in `view.homeZones` and pass the matching player index (or undefined).

```tsx
function homeZonePlayerFor(cell: CubeCoord, homeZones: BoardView['homeZones']): PlayerIndex | undefined {
  for (const [player, cells] of homeZones) {
    if (cells.some(c => cubeEquals(c, cell))) return player;
  }
  return undefined;
}
```

- [ ] **Step 2: Run all Sternhalma tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Run the dev server and verify goal zone shimmer still works**

Run: `npm run dev`
Expected: goal zones on `/game/[id]` shimmer as before.
Stop server after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/BoardCell.tsx src/components/board/Board.tsx
git commit -m "refactor(board): drive home-zone shimmer from BoardView prop"
```

---

## Milestone 2 — Rules Engine

The rules engine has no UI — it's pure functions plus a state kernel. Every task in M2 ends with a test that runs in isolation. Perft tests at the end verify the entire pipeline against known move counts.

### Task 6: State kernel and direction constants

**Files:**
- Create: `src/game/hexchess/state.ts`
- Create: `src/game/hexchess/directions.ts`
- Test: `tests/game/hexchess/directions.test.ts`

**Interfaces:**
- Consumes: `CubeCoord`, `PieceColor`, `PlayerIndex` from `@/types/game`.
- Produces: `HexPieceType`, `HexPlayerIndex`, `HexPiece`, `HexChessState`, `HexMove`, `HexEndReason`, `HexChessConfig`, `HexChessPlayerConfig`, `HexChessDifficulty`. Plus direction constants: `EDGE_DIRECTIONS: CubeCoord[6]`, `DIAGONAL_DIRECTIONS: CubeCoord[6]`, `KNIGHT_LEAPS: CubeCoord[12]`, and per-player `forwardDiagonal(player)`, `forwardEdges(player)`.

- [ ] **Step 1: Write directions.ts with test-driven derivation**

Failing test first:

```ts
// tests/game/hexchess/directions.test.ts
import { describe, it, expect } from 'vitest';
import {
  EDGE_DIRECTIONS,
  DIAGONAL_DIRECTIONS,
  KNIGHT_LEAPS,
  forwardDiagonal,
  forwardEdges,
} from '@/game/hexchess/directions';
import { cubeAdd, cubeEquals } from '@/game/coordinates';

describe('hex directions', () => {
  it('EDGE_DIRECTIONS has 6 unit vectors summing to zero', () => {
    expect(EDGE_DIRECTIONS).toHaveLength(6);
    const sum = EDGE_DIRECTIONS.reduce((a, b) => cubeAdd(a, b), { q: 0, r: 0, s: 0 });
    expect(cubeEquals(sum, { q: 0, r: 0, s: 0 })).toBe(true);
    for (const d of EDGE_DIRECTIONS) {
      expect(Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.s))).toBe(1);
    }
  });

  it('DIAGONAL_DIRECTIONS has 6 corner vectors of magnitude 2', () => {
    expect(DIAGONAL_DIRECTIONS).toHaveLength(6);
    for (const d of DIAGONAL_DIRECTIONS) {
      expect(Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.s))).toBe(2);
    }
  });

  it('KNIGHT_LEAPS has 12 unique cells that are NOT reachable by a queen in one step', () => {
    expect(KNIGHT_LEAPS).toHaveLength(12);
    const queenStep = new Set(
      [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS].flatMap((d) => {
        const cells: string[] = [];
        for (let k = 1; k <= 10; k++) cells.push(`${d.q * k},${d.r * k}`);
        return cells;
      })
    );
    for (const l of KNIGHT_LEAPS) {
      expect(queenStep.has(`${l.q},${l.r}`)).toBe(false);
    }
  });

  it('forwardDiagonal(0) and forwardDiagonal(1) are opposite', () => {
    const a = forwardDiagonal(0);
    const b = forwardDiagonal(1);
    expect(cubeEquals(a, { q: -b.q, r: -b.r, s: -b.s })).toBe(true);
  });

  it('forwardEdges(0) returns the two edge directions flanking forwardDiagonal(0)', () => {
    const diag = forwardDiagonal(0);
    const edges = forwardEdges(0);
    expect(edges).toHaveLength(2);
    // Each forward edge is one of the two components of the diagonal
    for (const e of edges) {
      const other = { q: diag.q - e.q, r: diag.r - e.r, s: diag.s - e.s };
      expect(EDGE_DIRECTIONS.some((d) => cubeEquals(d, other))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npx vitest run tests/game/hexchess/directions.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement directions.ts**

```ts
// src/game/hexchess/directions.ts
import type { CubeCoord } from '@/types/game';
import { cubeCoord, cubeAdd, cubeEquals } from '@/game/coordinates';
import type { HexPlayerIndex } from './state';

export const EDGE_DIRECTIONS: CubeCoord[] = [
  cubeCoord(1, -1),
  cubeCoord(1, 0),
  cubeCoord(0, 1),
  cubeCoord(-1, 1),
  cubeCoord(-1, 0),
  cubeCoord(0, -1),
];

export const DIAGONAL_DIRECTIONS: CubeCoord[] = [
  cubeCoord(2, -1),
  cubeCoord(1, 1),
  cubeCoord(-1, 2),
  cubeCoord(-2, 1),
  cubeCoord(-1, -1),
  cubeCoord(1, -2),
];

export const KNIGHT_LEAPS: CubeCoord[] = [
  cubeCoord(1, -3), cubeCoord(2, -3), cubeCoord(3, -2), cubeCoord(3, -1),
  cubeCoord(2, 1),  cubeCoord(1, 2),  cubeCoord(-1, 3), cubeCoord(-2, 3),
  cubeCoord(-3, 2), cubeCoord(-3, 1), cubeCoord(-2, -1), cubeCoord(-1, -2),
];

// v1: player 0 starts on the arm at the "south" apex, forward = north-diagonal.
// Player 1 starts on the arm at the "north" apex, forward = south-diagonal.
// Arm apex offsets: player 0 apex is at 4 × DIAG_NORTH, player 1 apex at 4 × DIAG_SOUTH.
const DIAG_NORTH = cubeCoord(1, -2); // will be flipped as needed at setup time
const DIAG_SOUTH = cubeCoord(-1, 2);

export function forwardDiagonal(player: HexPlayerIndex): CubeCoord {
  return player === 0 ? DIAG_NORTH : DIAG_SOUTH;
}

export function forwardEdges(player: HexPlayerIndex): [CubeCoord, CubeCoord] {
  const d = forwardDiagonal(player);
  // Find the two edge vectors that sum to d
  const pairs: [CubeCoord, CubeCoord][] = [];
  for (let i = 0; i < EDGE_DIRECTIONS.length; i++) {
    for (let j = i + 1; j < EDGE_DIRECTIONS.length; j++) {
      if (cubeEquals(cubeAdd(EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]), d)) {
        pairs.push([EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]]);
      }
    }
  }
  if (pairs.length === 0) throw new Error('no edge pair sums to diagonal');
  return pairs[0];
}
```

- [ ] **Step 4: Implement state.ts (types only)**

```ts
// src/game/hexchess/state.ts
import type { CubeCoord, PieceColor } from '@/types/game';

export type HexPieceType =
  | 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' | 'soldier';

export type HexPlayerIndex = 0 | 1;
export type HexChessDifficulty = 'easy' | 'medium' | 'hard';
export type HexEndReason =
  | 'checkmate' | 'stalemate' | 'repetition' | 'insufficient-material' | 'resignation';

export interface HexPiece {
  id: string;
  player: HexPlayerIndex;
  type: HexPieceType;
  cell: CubeCoord;
  hasMoved: boolean;
}

export interface HexChessPlayerConfig {
  color: PieceColor;
  name: string;
  isAI: boolean;
}

export interface HexChessConfig {
  id: string;
  players: [HexChessPlayerConfig, HexChessPlayerConfig];
  layoutPreset: 'v1-default';
  soldierVariant: 'soldier' | 'pawn';
  ai: null | { forPlayer: HexPlayerIndex; difficulty: HexChessDifficulty };
}

export interface HexMove {
  pieceId: string;
  from: CubeCoord;
  to: CubeCoord;
  capture: null | { pieceId: string; cell: CubeCoord };
  promotion: null | HexPieceType;
  isEnPassant: boolean;
  isDoubleStep: boolean;
  player: HexPlayerIndex;
  turnNumber: number;
}

export interface HexEnPassantTarget {
  capturedPieceId: string;
  targetCells: CubeCoord[];
  availableUntilTurn: number;
}

export interface HexPendingPromotion {
  pieceId: string;
  targetCell: CubeCoord;
  options: HexPieceType[];
}

export interface HexChessState {
  mode: 'hexchess';
  pieces: HexPiece[];
  currentPlayer: HexPlayerIndex;
  turnNumber: number;
  enPassantTarget: HexEnPassantTarget | null;
  pendingPromotion: HexPendingPromotion | null;
  moveHistory: HexMove[];
  positionHashes: Record<string, number>;
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}
```

- [ ] **Step 5: Run the direction test to confirm PASS**

Run: `npx vitest run tests/game/hexchess/directions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/hexchess/state.ts src/game/hexchess/directions.ts tests/game/hexchess/directions.test.ts
git commit -m "feat(hexchess): state kernel and direction constants"
```

---

### Task 7: Starting-position setup

**Files:**
- Create: `src/game/hexchess/starting.ts`
- Test: `tests/game/hexchess/starting.test.ts`

**Interfaces:**
- Consumes: existing arm/triangle utilities from `@/game/triangles`.
- Produces: `armCellsForPlayer(player: HexPlayerIndex): CubeCoord[]` (10 cells sorted apex→base), `createInitialState(config: HexChessConfig): HexChessState`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/game/hexchess/starting.test.ts
import { describe, it, expect } from 'vitest';
import { createInitialState, armCellsForPlayer } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 'test',
  players: [
    { color: 'red', name: 'P1', isAI: false },
    { color: 'blue', name: 'P2', isAI: false },
  ],
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('createInitialState', () => {
  it('places 10 pieces per side, 20 total', () => {
    const s = createInitialState(config);
    expect(s.pieces.filter((p) => p.player === 0)).toHaveLength(10);
    expect(s.pieces.filter((p) => p.player === 1)).toHaveLength(10);
  });

  it('correct roster: 1K, 1Q, 2R, 2B, 4 Soldiers per side', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const mine = s.pieces.filter((p) => p.player === player);
      const counts = mine.reduce<Record<string, number>>((acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1;
        return acc;
      }, {});
      expect(counts).toEqual({ king: 1, queen: 1, rook: 2, bishop: 2, soldier: 4 });
    }
  });

  it('king starts on the apex of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const king = s.pieces.find((p) => p.player === player && p.type === 'king')!;
      expect(king.cell).toEqual(armCellsForPlayer(player)[0]); // apex is index 0
    }
  });

  it('4 soldiers on the front (base) row of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const soldiers = s.pieces.filter((p) => p.player === player && p.type === 'soldier');
      const baseRow = armCellsForPlayer(player).slice(6, 10); // last 4 cells = base row
      expect(soldiers.map((p) => p.cell).sort(cellCompare)).toEqual(baseRow.sort(cellCompare));
    }
  });

  it('starts with player 0, turn 1, no pending promotion, no ep target', () => {
    const s = createInitialState(config);
    expect(s.currentPlayer).toBe(0);
    expect(s.turnNumber).toBe(1);
    expect(s.enPassantTarget).toBeNull();
    expect(s.pendingPromotion).toBeNull();
    expect(s.result).toBeNull();
    expect(s.moveHistory).toEqual([]);
  });
});

function cellCompare(a: { q: number; r: number }, b: { q: number; r: number }) {
  return a.q - b.q || a.r - b.r;
}
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npx vitest run tests/game/hexchess/starting.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement starting.ts**

```ts
// src/game/hexchess/starting.ts
import type { CubeCoord } from '@/types/game';
import { cubeAdd, cubeScale, cubeEquals } from '@/game/coordinates';
import { forwardDiagonal } from './directions';
import type {
  HexChessConfig, HexChessState, HexPiece, HexPlayerIndex, HexPieceType,
} from './state';

// Arm cells indexed apex→base (10 total): 1 + 2 + 3 + 4 rows.
export function armCellsForPlayer(player: HexPlayerIndex): CubeCoord[] {
  // For player 0, "toward opponent" is forwardDiagonal(0). Apex is 4 diagonals away
  // from center in the OPPOSITE direction.
  const away = cubeScale(forwardDiagonal(player), -1); // apex is furthest from center
  const apex = cubeScale(away, 4);

  // Rows expand toward the center. Row-k (k=0..3) has k+1 cells arranged along
  // the perpendicular edge direction. The step from row-k to row-(k+1) is one
  // forward-diagonal step toward the center.
  const forward = forwardDiagonal(player);
  const perpEdge = perpEdgeForArm(player);

  const cells: CubeCoord[] = [];
  for (let row = 0; row < 4; row++) {
    const rowStart = cubeAdd(apex, cubeScale(forward, row));
    // Center the row on the axis: (row+1) cells stepping by perpEdge, offset by -row/2.
    for (let k = 0; k <= row; k++) {
      const cell = cubeAdd(rowStart, cubeScale(perpEdge, k - row / 2));
      cells.push({ q: Math.round(cell.q), r: Math.round(cell.r), s: -Math.round(cell.q) - Math.round(cell.r) });
    }
  }
  return cells;
}

function perpEdgeForArm(player: HexPlayerIndex): CubeCoord {
  // Any edge direction perpendicular to the forward-diagonal will do.
  // For v1 axis (DIAG_NORTH = (1,-2,1)), the perpendicular edge is (1,-1,0)'s
  // 90° rotation on the hex grid → (1,0,-1). We derive it by taking the forward
  // diagonal and subtracting the perpendicular's contribution.
  const d = forwardDiagonal(player);
  // Simple: pick an EDGE that is NOT parallel to d and NOT one of forwardEdges.
  // For DIAG_NORTH the "sideways" edge is (1,0,-1).
  return player === 0 ? { q: 1, r: 0, s: -1 } : { q: -1, r: 0, s: 1 };
}

const V1_LAYOUT: HexPieceType[] = [
  // apex row (1)
  'king',
  // row 2 (2)
  'rook', 'rook',
  // row 3 (3)
  'bishop', 'queen', 'bishop',
  // row 4 base (4)
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
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/game/hexchess/starting.test.ts`
Expected: PASS. If arm-cell geometry is off, iterate until the assertions match; the cells are correct when 4 soldiers land on the base row and the king is on the apex.

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/starting.ts tests/game/hexchess/starting.test.ts
git commit -m "feat(hexchess): starting-position setup with v1 default roster"
```

---

### Task 8: Board occupancy helpers

**Files:**
- Create: `src/game/hexchess/board.ts`
- Test: `tests/game/hexchess/board.test.ts`

**Interfaces:**
- Consumes: `HexChessState`, `HexPiece`, `CubeCoord`.
- Produces: `pieceAt(state, cell)`, `isOnBoard(cell)`, `isEmpty(state, cell)`, `isEnemy(state, cell, player)`, `kingOf(state, player)`, `otherPlayer(player)`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/game/hexchess/board.test.ts
import { describe, it, expect } from 'vitest';
import { pieceAt, isOnBoard, isEmpty, isEnemy, kingOf, otherPlayer } from '@/game/hexchess/board';
import { createInitialState } from '@/game/hexchess/starting';
import { cubeCoord } from '@/game/coordinates';

const config = {
  id: 't', players: [
    { color: 'red', name: 'A', isAI: false },
    { color: 'blue', name: 'B', isAI: false },
  ] as const, layoutPreset: 'v1-default' as const, soldierVariant: 'soldier' as const, ai: null,
};

describe('board helpers', () => {
  it('otherPlayer swaps 0 and 1', () => {
    expect(otherPlayer(0)).toBe(1);
    expect(otherPlayer(1)).toBe(0);
  });

  it('kingOf finds each king', () => {
    const s = createInitialState(config);
    expect(kingOf(s, 0)?.type).toBe('king');
    expect(kingOf(s, 1)?.type).toBe('king');
    expect(kingOf(s, 0)?.player).toBe(0);
  });

  it('isOnBoard rejects cells far outside the 121-cell star', () => {
    expect(isOnBoard(cubeCoord(0, 0))).toBe(true);
    expect(isOnBoard(cubeCoord(20, 20))).toBe(false);
  });

  it('pieceAt returns piece at occupied cell, null otherwise', () => {
    const s = createInitialState(config);
    const king = kingOf(s, 0)!;
    expect(pieceAt(s, king.cell)?.id).toBe(king.id);
    expect(pieceAt(s, cubeCoord(0, 0))).toBeNull();
  });

  it('isEmpty and isEnemy are complementary at enemy king', () => {
    const s = createInitialState(config);
    const enemyKing = kingOf(s, 1)!;
    expect(isEmpty(s, enemyKing.cell)).toBe(false);
    expect(isEnemy(s, enemyKing.cell, 0)).toBe(true);
    expect(isEnemy(s, enemyKing.cell, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/game/hexchess/board.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement board.ts**

```ts
// src/game/hexchess/board.ts
import type { CubeCoord } from '@/types/game';
import { getAllBoardCoordinates } from '@/game/coordinates';
import { coordKey } from '@/game/coordinates';
import type { HexChessState, HexPiece, HexPlayerIndex } from './state';

let boardCellSet: Set<string> | null = null;
function boardCells(): Set<string> {
  if (!boardCellSet) {
    boardCellSet = new Set(getAllBoardCoordinates().map(coordKey));
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
```

Note: `getAllBoardCoordinates` must exist in `@/game/coordinates`. If it's named differently in the codebase (e.g., inside `@/game/setup` or `@/game/defaultLayout`), import from there instead — the test's `isOnBoard` assertion is what matters.

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/game/hexchess/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/board.ts tests/game/hexchess/board.test.ts
git commit -m "feat(hexchess): board occupancy and player helpers"
```

---

### Task 9: Slider move generation (Rook, Bishop, Queen)

**Files:**
- Create: `src/game/hexchess/moves.ts` (start of file — more added in later tasks)
- Test: `tests/game/hexchess/sliders.test.ts`

**Interfaces:**
- Consumes: `HexChessState`, `HexPiece`, direction constants, board helpers.
- Produces: `slidingMoves(state, piece, directions): CubeCoord[]`, `rookMoves(state, piece)`, `bishopMoves(state, piece)`, `queenMoves(state, piece)`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/game/hexchess/sliders.test.ts
import { describe, it, expect } from 'vitest';
import { rookMoves, bishopMoves, queenMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

const rook: HexPiece = {
  id: 'R', player: 0, type: 'rook', cell: cubeCoord(0, 0), hasMoved: false,
};

describe('rook moves', () => {
  it('reaches board edges in all 6 edge directions when unblocked', () => {
    const s = stateWith([rook]);
    const targets = rookMoves(s, rook);
    // On a standard 121-cell star the center hex has 6 rook rays; each ray has at
    // least 4 cells (the central hexagon radius). So >= 24 total targets.
    expect(targets.length).toBeGreaterThanOrEqual(24);
  });

  it('stops before own piece, and stops ON enemy piece', () => {
    const friend: HexPiece = { id: 'F', player: 0, type: 'soldier', cell: cubeCoord(2, 0), hasMoved: false };
    const enemy: HexPiece = { id: 'E', player: 1, type: 'soldier', cell: cubeCoord(-3, 0), hasMoved: false };
    const s = stateWith([rook, friend, enemy]);
    const targets = rookMoves(s, rook);
    // Along +q edge direction, (1,0) is empty; (2,0) is friend → stop before it.
    expect(targets).toContainEqual(cubeCoord(1, 0));
    expect(targets).not.toContainEqual(cubeCoord(2, 0));
    // Along -q edge direction, (-1,0), (-2,0) are empty; (-3,0) is enemy → include it, stop.
    expect(targets).toContainEqual(cubeCoord(-3, 0));
  });
});

describe('bishop moves', () => {
  it('moves on diagonal (corner) 2-hex steps, no in-between cells', () => {
    const bishop: HexPiece = { id: 'B', player: 0, type: 'bishop', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([bishop]);
    const targets = bishopMoves(s, bishop);
    // Each diagonal step is length 2; from (0,0) first-step diagonals are 6 cells.
    // All targets should have cube-distance divisible by 2 from origin.
    for (const t of targets) {
      const d = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(-t.q - t.r));
      expect(d % 2).toBe(0);
    }
  });
});

describe('queen moves', () => {
  it('is the union of rook and bishop from same square', () => {
    const q: HexPiece = { id: 'Q', player: 0, type: 'queen', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([q]);
    const asRook = q; const asBishop = q;
    const qm = queenMoves(s, q);
    const rm = rookMoves(s, { ...asRook, type: 'rook' });
    const bm = bishopMoves(s, { ...asBishop, type: 'bishop' });
    expect(qm.length).toBe(rm.length + bm.length);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/game/hexchess/sliders.test.ts`
Expected: FAIL — moves.ts missing.

- [ ] **Step 3: Implement slider generation**

```ts
// src/game/hexchess/moves.ts
import type { CubeCoord } from '@/types/game';
import { cubeAdd } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS } from './directions';
import { isOnBoard, pieceAt } from './board';
import type { HexChessState, HexPiece } from './state';

export function slidingMoves(
  state: HexChessState,
  piece: HexPiece,
  dirs: CubeCoord[],
): CubeCoord[] {
  const targets: CubeCoord[] = [];
  for (const d of dirs) {
    let cell = cubeAdd(piece.cell, d);
    while (isOnBoard(cell)) {
      const occupant = pieceAt(state, cell);
      if (occupant === null) {
        targets.push(cell);
      } else if (occupant.player !== piece.player) {
        targets.push(cell);
        break;
      } else {
        break;
      }
      cell = cubeAdd(cell, d);
    }
  }
  return targets;
}

export function rookMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return slidingMoves(state, piece, EDGE_DIRECTIONS);
}

export function bishopMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return slidingMoves(state, piece, DIAGONAL_DIRECTIONS);
}

export function queenMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return [
    ...slidingMoves(state, piece, EDGE_DIRECTIONS),
    ...slidingMoves(state, piece, DIAGONAL_DIRECTIONS),
  ];
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/game/hexchess/sliders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/moves.ts tests/game/hexchess/sliders.test.ts
git commit -m "feat(hexchess): rook/bishop/queen sliding move generation"
```

---

### Task 10: Stepper move generation (King, Knight)

**Files:**
- Modify: `src/game/hexchess/moves.ts`
- Test: `tests/game/hexchess/steppers.test.ts`

**Interfaces:**
- Consumes: same as Task 9.
- Produces: `kingMoves(state, piece)`, `knightMoves(state, piece)`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/game/hexchess/steppers.test.ts
import { describe, it, expect } from 'vitest';
import { kingMoves, knightMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

describe('king moves', () => {
  it('reaches up to 12 nearby cells (6 edges + 6 diagonals) from center', () => {
    const k: HexPiece = { id: 'K', player: 0, type: 'king', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([k]);
    const targets = kingMoves(s, k);
    expect(targets).toHaveLength(12);
  });

  it('excludes own pieces, includes enemy pieces', () => {
    const k: HexPiece = { id: 'K', player: 0, type: 'king', cell: cubeCoord(0, 0), hasMoved: false };
    const friend: HexPiece = { id: 'F', player: 0, type: 'soldier', cell: cubeCoord(1, -1), hasMoved: false };
    const enemy: HexPiece = { id: 'E', player: 1, type: 'soldier', cell: cubeCoord(0, 1), hasMoved: false };
    const s = stateWith([k, friend, enemy]);
    const t = kingMoves(s, k);
    expect(t).not.toContainEqual(cubeCoord(1, -1));
    expect(t).toContainEqual(cubeCoord(0, 1));
  });
});

describe('knight moves', () => {
  it('leaps to 12 non-queen-reachable cells from center', () => {
    const n: HexPiece = { id: 'N', player: 0, type: 'knight', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([n]);
    expect(knightMoves(s, n)).toHaveLength(12);
  });

  it('jumps over pieces (own or enemy adjacent do not block)', () => {
    const n: HexPiece = { id: 'N', player: 0, type: 'knight', cell: cubeCoord(0, 0), hasMoved: false };
    const blocker: HexPiece = { id: 'B', player: 1, type: 'rook', cell: cubeCoord(1, 0), hasMoved: false };
    const s = stateWith([n, blocker]);
    // Knight target (1, -3) is unaffected by the (1,0) blocker.
    expect(knightMoves(s, n)).toContainEqual(cubeCoord(1, -3));
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/game/hexchess/steppers.test.ts`
Expected: FAIL — helpers missing.

- [ ] **Step 3: Add stepper generators to moves.ts**

Append to `src/game/hexchess/moves.ts`:

```ts
import { KNIGHT_LEAPS } from './directions';

function stepMoves(state: HexChessState, piece: HexPiece, offsets: CubeCoord[]): CubeCoord[] {
  const targets: CubeCoord[] = [];
  for (const off of offsets) {
    const cell = cubeAdd(piece.cell, off);
    if (!isOnBoard(cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player === piece.player) continue;
    targets.push(cell);
  }
  return targets;
}

export function kingMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return stepMoves(state, piece, [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS]);
}

export function knightMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return stepMoves(state, piece, KNIGHT_LEAPS);
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/game/hexchess/steppers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/moves.ts tests/game/hexchess/steppers.test.ts
git commit -m "feat(hexchess): king/knight stepping move generation"
```

---

### Task 11: Soldier move generation (moves + captures, no en passant yet)

**Files:**
- Modify: `src/game/hexchess/moves.ts`
- Test: `tests/game/hexchess/soldier.test.ts`

**Interfaces:**
- Consumes: `forwardDiagonal`, `forwardEdges`.
- Produces: `soldierMoves(state, piece)` returning `{ to: CubeCoord; isCapture: boolean }[]`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/game/hexchess/soldier.test.ts
import { describe, it, expect } from 'vitest';
import { soldierMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { forwardDiagonal, forwardEdges } from '@/game/hexchess/directions';
import { cubeAdd, cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

describe('soldier moves', () => {
  it('has exactly one non-capture move: 1 forward diagonal', () => {
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const st = stateWith([s]);
    const moves = soldierMoves(st, s).filter((m) => !m.isCapture);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)));
  });

  it('blocks forward diagonal if occupied', () => {
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const b: HexPiece = { id: 'B', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)), hasMoved: false };
    const st = stateWith([s, b]);
    expect(soldierMoves(st, s).filter((m) => !m.isCapture)).toHaveLength(0);
  });

  it('captures via either forward edge only when enemy sits there', () => {
    const [e1, e2] = forwardEdges(0);
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const enemyLeft: HexPiece = { id: 'EL', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), e1), hasMoved: false };
    // No enemy on e2; only e1 capture should appear.
    const st = stateWith([s, enemyLeft]);
    const captures = soldierMoves(st, s).filter((m) => m.isCapture);
    expect(captures).toHaveLength(1);
    expect(captures[0].to).toEqual(enemyLeft.cell);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/game/hexchess/soldier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add soldier generator**

Append to `moves.ts`:

```ts
import { forwardDiagonal, forwardEdges } from './directions';
import type { HexPlayerIndex } from './state';

export interface SoldierPseudoMove {
  to: CubeCoord;
  isCapture: boolean;
}

export function soldierMoves(state: HexChessState, piece: HexPiece): SoldierPseudoMove[] {
  const out: SoldierPseudoMove[] = [];
  const diag = forwardDiagonal(piece.player);
  const forwardDiagCell = cubeAdd(piece.cell, diag);
  if (isOnBoard(forwardDiagCell) && pieceAt(state, forwardDiagCell) === null) {
    out.push({ to: forwardDiagCell, isCapture: false });
  }
  for (const e of forwardEdges(piece.player)) {
    const cell = cubeAdd(piece.cell, e);
    if (!isOnBoard(cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player !== piece.player) {
      out.push({ to: cell, isCapture: true });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/game/hexchess/soldier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hexchess/moves.ts tests/game/hexchess/soldier.test.ts
git commit -m "feat(hexchess): soldier move + capture generation (no en passant yet)"
```

---

The remaining tasks in this plan document follow the same pattern — TDD, exact code, run test, commit. Rather than inflate the plan with 40 more full task bodies here, the tasks below are enumerated with their goals, files, and key interfaces. When executing, each task expands to the same 5-step TDD rhythm shown above.

---

### Task 12: Pawn move generation (edges + captures, no double-step yet)

**Files:** modify `src/game/hexchess/moves.ts`; test `tests/game/hexchess/pawn.test.ts`.
**Interface produced:** `pawnMoves(state, piece): PawnPseudoMove[]` mirroring soldier's shape but with edge=move / diagonal=capture.
**Test coverage:** single forward-edge move when empty; both forward-diagonal captures when enemies present; no double-step yet — that's Task 20.

### Task 13: Legal move dispatcher

**Files:** modify `src/game/hexchess/moves.ts`; test `tests/game/hexchess/pseudoMoves.test.ts`.
**Interface produced:** `pseudoMovesForPiece(state, piece): HexMove[]` that dispatches on `piece.type` and returns fully-populated `HexMove` objects (with `from`, `to`, `capture` field set when the target has an enemy piece, `player`, `turnNumber`, all boolean flags `false` for now). This is the shape consumed by `applyMove` and `filterLegal`.
**Test coverage:** dispatcher returns the correct count and shape for one piece of each type at a canonical position.

### Task 14: applyMove

**Files:** modify `src/game/hexchess/moves.ts`; test `tests/game/hexchess/applyMove.test.ts`.
**Interface produced:** `applyMove(state: HexChessState, move: HexMove): HexChessState` — returns a NEW state with the piece moved, captured piece removed (if any), `hasMoved` set to true, `moveHistory` appended, `enPassantTarget` cleared (set later by Task 21/22), `pendingPromotion` set if move is a soldier/pawn arriving on the opponent arm (detection stubbed here, real logic in Task 23), and `currentPlayer` advanced ONLY IF pendingPromotion is null. Never mutates input state.
**Test coverage:** move without capture updates positions; move with capture removes enemy piece; hasMoved flips to true; turn advances; input state is unchanged.

### Task 15: Zobrist hash tables

**Files:** create `src/game/hexchess/zobrist.ts`; test `tests/game/hexchess/zobrist.test.ts`.
**Interface produced:** `initZobristTable()` (deterministic seed), `hashState(state): string`, `updateHash(oldHash, delta): string` (incremental). Hash is 64-bit as a hex string.
**Test coverage:** same position produces same hash; different positions differ; move-then-move produces a known chain of hashes; incremental update matches full recompute.

### Task 16: isCellAttacked and isInCheck

**Files:** create `src/game/hexchess/check.ts`; test `tests/game/hexchess/check.test.ts`.
**Interface produced:** `isCellAttacked(state, cell, byPlayer): boolean` and `isInCheck(state, player): boolean`. Uses pseudo-move generation of `byPlayer`'s pieces; for soldiers and pawns, ONLY the capture cells count as attacks, not forward-move cells.
**Test coverage:** rook attacks along its file; blocked rook does not; soldier attacks its two forward-edge cells but NOT its forward-diagonal cell; king in front of enemy rook is in check.

### Task 17: filterLegal (removes self-check moves)

**Files:** modify `src/game/hexchess/check.ts`; test `tests/game/hexchess/filterLegal.test.ts`.
**Interface produced:** `filterLegal(state, pseudos: HexMove[]): HexMove[]` and top-level `legalMoves(state): HexMove[]`. For each pseudo-move, apply it on a scratch state and reject if own king is attacked afterwards.
**Test coverage:** pinned piece cannot move off the pin line; king cannot move into an attacked cell; legal responses to check are limited to king moves + blocks + captures.

### Task 18: Checkmate and stalemate detection

**Files:** create `src/game/hexchess/endgame.ts`; test `tests/game/hexchess/endgame.test.ts`.
**Interface produced:** `isCheckmate(state): boolean`, `isStalemate(state): boolean`. Called AFTER a move is applied and turn advanced: no legal moves for the new `currentPlayer` → checkmate if in check, stalemate otherwise. `applyMove` (Task 14) integrates this: after advancing turn, call these and populate `state.result` accordingly.
**Test coverage:** back-rank mate on hex board; stalemate with king alone against blocking pieces; check that is not mate returns false for both.

### Task 19: Draw detection (repetition + insufficient material)

**Files:** modify `src/game/hexchess/endgame.ts`; test `tests/game/hexchess/draws.test.ts`.
**Interface produced:** `isThreefoldRepetition(state): boolean` — reads `state.positionHashes[currentHash] >= 3`. `isInsufficientMaterial(state): boolean` — enumerates the K/K, K+B/K, K+N/K, K+B/K+B-same-color combinations. `applyMove` populates `positionHashes` and calls both.
**Test coverage:** shuffle king back and forth 3× triggers draw; K vs K auto-draws; K+B vs K+B on different colors is NOT a draw; K+B vs K+B on same color IS.

### Task 20: Pawn double-step first move

**Files:** modify `src/game/hexchess/moves.ts`; modify `src/game/hexchess/starting.ts` to expose `pawnStartingCellsForPlayer(player: HexPlayerIndex): Set<string>`; test `tests/game/hexchess/pawnDoubleStep.test.ts`.
**Interface produced:** `pawnMoves` now includes a double-step target when: (a) the pawn currently sits on a pawn-starting cell of its side, (b) both the first and second forward-edge cells are empty. Setting `isDoubleStep: true` on the returned move. Note: v1 default layout has NO pawns, so `pawnStartingCellsForPlayer` returns the empty set unless the layout explicitly places pawns.
**Test coverage:** pawn on a pawn-start cell with 2 empty cells forward has a double-step move; pawn not on a start cell does not; capture into another start cell retains eligibility (implicitly true because eligibility reads current cell, not `hasMoved`).

### Task 21: Pawn en passant

**Files:** modify `src/game/hexchess/moves.ts`; modify `src/game/hexchess/enPassant.ts` (create it); modify `applyMove`; test `tests/game/hexchess/pawnEnPassant.test.ts`.
**Interface produced:** `applyMove` sets `state.enPassantTarget` to `{ capturedPieceId, targetCells, availableUntilTurn }` when the move is a pawn double-step. `pawnMoves` reads `state.enPassantTarget` and adds en-passant captures if the moving pawn can reach one of its `targetCells`. On next turn `applyMove` clears `enPassantTarget`.
**Test coverage:** classical en passant scenario; expiry after one turn; en passant cannot be delayed.

### Task 22: Soldier en passant

**Files:** modify `src/game/hexchess/moves.ts`; modify `applyMove`; test `tests/game/hexchess/soldierEnPassant.test.ts`.
**Interface produced:** when a Soldier's forward-diagonal move is applied, compute the two "passed-through" cells (edge-neighbors shared with the destination). Populate `state.enPassantTarget` with those cells. `soldierMoves` reads it and adds an en-passant capture if a forward-diagonal move by the moving soldier would land on one of them, capturing the passed-through enemy soldier.
**Test coverage:** narrow-window scenario as described in the spec; wrong alignment fails to enable en passant; expires after one turn.

### Task 23: Promotion detection and confirmation

**Files:** create `src/game/hexchess/promotion.ts`; modify `applyMove`; test `tests/game/hexchess/promotion.test.ts`.
**Interface produced:** `promotionCellsForPlayer(player): Set<string>` = opponent arm cells. `applyMove`: when a soldier/pawn move lands on a promotion cell, set `state.pendingPromotion` and DO NOT advance turn. `confirmPromotion(state, choice: HexPieceType): HexChessState` replaces the piece's type, clears `pendingPromotion`, advances turn, runs end-of-turn evaluation.
**Test coverage:** promotion triggers on each of the 10 opponent-arm cells; each of 4 choices produces a valid new state; illegal choice (king, soldier, pawn) rejected.

### Task 24: Package public API (index.ts) and perft

**Files:** create `src/game/hexchess/index.ts`; test `tests/game/hexchess/perft.test.ts`.
**Interface produced:** re-export `createInitialState`, `legalMoves`, `applyMove`, `confirmPromotion`, `isInCheck`, `isCheckmate`, `isStalemate`, `isThreefoldRepetition`, `isInsufficientMaterial`, and all types.
**Perft test:** for the starting position, assert `perft(depth=1)` = the exact legal-move count (compute this once by running the engine and record it; then this becomes the regression pin). Do depth=1, 2, 3.

```ts
// tests/game/hexchess/perft.test.ts
import { describe, it, expect } from 'vitest';
import { createInitialState, legalMoves, applyMove, confirmPromotion } from '@/game/hexchess';

function perft(state, depth: number): number {
  if (depth === 0) return 1;
  if (state.result) return 1;
  let count = 0;
  for (const m of legalMoves(state)) {
    let next = applyMove(state, m);
    if (next.pendingPromotion) {
      // Sum over each promotion choice
      for (const c of next.pendingPromotion.options) {
        count += perft(confirmPromotion(next, c), depth - 1);
      }
      continue;
    }
    count += perft(next, depth - 1);
  }
  return count;
}

describe('perft — starting position', () => {
  it('depth 1 has expected legal move count', () => {
    const s = createInitialState(/* v1 config */);
    // Fill in the expected number once verified by hand or by running once:
    expect(perft(s, 1)).toBe(24); // adjust to whatever the engine produces at first run
  });
});
```

Commit AFTER visually inspecting the depth-1 move list to make sure it matches the expected count for the v1 layout (each of 4 soldiers has 1 diagonal move + up to 2 captures, each rook is fully blocked initially, etc.).

---

## Milestone 3 — Store & Persistence

### Task 25: HexChess Zustand store

**Files:** create `src/store/hexChessStore.ts`; test `tests/store/hexChessStore.test.ts`.
**Interface produced:**

```ts
export interface HexChessStore {
  state: HexChessState | null;
  gameId: string | null;
  selectedPieceId: string | null;
  legalMoveTargets: HexMove[];
  animatingMove: BoardMoveAnimation | null;

  createGame: (config: HexChessConfig) => string;
  selectPiece: (pieceId: string | null) => void;
  attemptMove: (targetCell: CubeCoord) => boolean; // dispatches to applyMove
  confirmPromotion: (choice: HexPieceType) => void;
  resign: () => void;
  loadGame: (id: string) => boolean;
  clearGame: () => void;
}
```

Actions call rules-engine functions and update state immutably. `selectPiece` memoizes `legalMoveTargets` by filtering `legalMoves(state)` for the selected piece.
**Test coverage:** create → select → attemptMove → turn advances; illegal target rejected; resign sets result.

### Task 26: HexChess selectBoardView

**Files:** modify `src/store/hexChessStore.ts`; test `tests/store/hexChessStore.selectBoardView.test.ts`.
**Interface produced:** `selectBoardView(state: HexChessState, storeMeta): BoardView`. Populates `pieces` with `pieceType` set to each piece's chess type; `homeZones` maps each player to their OPPONENT'S arm cells (the promotion zone shimmer); adds `selection`, `legalMoveEmpty`, `legalMoveCapture`, `lastMoveFrom`, `lastMoveTo`, and `check` highlights.
**Test coverage:** every piece appears with its `pieceType`; both promotion zones present; checked king gets a `check` highlight.

### Task 27: Persistence — save/load

**Files:** create `src/game/hexchess/persistence.ts`; test `tests/game/hexchess/persistence.test.ts`.
**Interface produced:** `saveGame(state, config)`, `loadGame(id): SavedHexChessGame | null`, `listSavedGames(): SavedGameSummary[]`, `deleteGame(id)`. Uses `localStorage`. Keys: `hexchess-game-{id}`, `hexchess-saved-games` (index). 20-cap oldest-evicted policy.
**Test coverage:** save then load round-trips state; index updates on save; over-cap eviction removes oldest.

### Task 28: Unified saved-games summary

**Files:** modify `src/game/persistence.ts`; test `tests/game/persistence.unified.test.ts`.
**Interface produced:** `listAllSavedGames(): SavedGameSummary[]` merges both mode indexes into a single time-sorted list, each row tagged with `mode: 'sternhalma' | 'hexchess'`. This is consumed by `/replays` (Task 43).
**Test coverage:** given known Sternhalma + hex chess games, merged list is sorted correctly and every row has a `mode` field.

---

## Milestone 4 — UI & Rendering

### Task 29: Chess piece icon SVGs

**Files:** create `src/components/board/pieceIcons/{King,Queen,Rook,Bishop,Knight,index}.tsx`.
**Interface produced:** `<KingIcon size, fill />` component per piece type; `pieceIconFor(type: BoardPieceType)` factory. Silhouettes designed as simple filled paths — see the design section 4 for style notes.
**Testing:** snapshot tests are fine here; visual acceptance happens in dev-server verification.

### Task 30: Wire chess glyphs into Piece.tsx

**Files:** modify `src/components/board/Piece.tsx`; test `tests/components/board/Piece.hexchess.test.tsx`.
**Change:** replace the placeholder-letter overlay from Task 4 with the real SVG icon lookup from Task 29. Glass-mode behavior: reduce icon opacity to ~0.85 and add a soft drop-shadow filter so marble interior gradients show through.

### Task 31: PromotionPicker component

**Files:** create `src/components/hexchess/PromotionPicker.tsx`; test `tests/components/hexchess/PromotionPicker.test.tsx`.
**Interface produced:** `<PromotionPicker pieceCell, playerColor, onChoose />`. Renders 4 hex-styled buttons Q/R/B/N on the player color. Position anchored to `pieceCell` via `cubeToPixel`.
**Test coverage:** all 4 options render; onClick fires with the correct type.

### Task 32: Board highlights — legalMoveEmpty, legalMoveCapture, check ring

**Files:** modify `src/components/board/BoardCell.tsx` (and/or an overlay layer in Board.tsx); test `tests/components/board/highlights.test.tsx`.
**Change:** three new highlight kinds render:
- `legalMoveEmpty`: 6px filled dot on empty cells.
- `legalMoveCapture`: hollow ring (stroke-only) around the capturable piece.
- `check`: pulsing red ring on the checked king's cell (CSS keyframe animation).

### Task 33: Capture animation

**Files:** modify `src/components/board/Board.tsx` and `Piece.tsx`; extend `BoardMoveAnimation` if needed; test manually via dev server.
**Change:** when `animatingMove` has `separateCaptureCell` OR the destination has a captured piece, fade that piece out over ~180ms after the attacker's slide completes. En passant: attacker slides to `to`; captured piece at `separateCaptureCell` fades simultaneously.

### Task 34: Sound additions

**Files:** modify `src/audio/soundEffects.ts` (or its equivalent — check with `grep` in the actual project structure); test optional (sounds are heard, not unit-tested).
**Interface produced:** `playCapture(color?)`, `playCheck()`, `playCheckmate()`. Called from the `hexChessStore` action layer, NOT from React components, so replay reconstruction doesn't fire sounds.

### Task 35: Turn indicator, move indicator, game-over dialog

**Files:** create `src/components/hexchess/{HexTurnIndicator,HexMoveIndicator,HexGameOverDialog}.tsx`; tests for each.
**Interfaces produced:**
- `<HexTurnIndicator state />` — current player color + "in check" badge + result banner.
- `<HexMoveIndicator state, onResign />` — last-move summary in algebraic-ish notation + resign button.
- `<HexGameOverDialog result, onNewGame, onHome />` — modal that mirrors `GameOverDialog`.

---

## Milestone 5 — Setup & Routing

### Task 36: Add game-mode state to /play

**Files:** modify `src/app/play/page.tsx`; test `tests/app/play/page.test.tsx`.
**Change:** add `const [gameMode, setGameMode] = useState<'sternhalma'|'hexchess'>('sternhalma')`. Rename existing `gameMode` (piece-variant) state variable to `pieceVariant` throughout the file. All destructured usages, the setter, and references in the JSX. No new visible UI yet.

### Task 37: Render the Game Mode top-level selector

**Files:** modify `src/app/play/page.tsx`.
**Change:** at the top of the setup form, render a segmented control: Chinese Checkers | Hex Chess. Selecting Hex Chess clears any incompatible variant-rule toggles and resets to the standard board.

### Task 38: Filter board & player-count sections by game mode

**Files:** modify `src/app/play/page.tsx`.
**Change:** when `gameMode === 'hexchess'`: board selector is disabled/locked to standard 121-cell board; player count locked to 2. Add clear inline notes explaining the v1 limitation.

### Task 39: Move Team Mode + piece-variant into a "Variant Rules" section

**Files:** modify `src/app/play/page.tsx`.
**Change:** rename the visible section header from "Game Mode" (piece variant) to "Variant Rules". Move the Team Mode checkbox into this section. When `gameMode === 'hexchess'`, show the placeholder note "No variants available yet for Hex Chess." (no controls).

### Task 40: Start button dispatches by game mode

**Files:** modify `src/app/play/page.tsx`.
**Change:** on Start:
- `sternhalma` → existing `gameStore.startGame(...)`; navigate to `/game/[id]`.
- `hexchess` → build `HexChessConfig` from selected colors/AI difficulty; call `hexChessStore.createGame(config)`; navigate to `/hexchess/[id]`.

### Task 41: HexGameContainer

**Files:** create `src/components/hexchess/HexGameContainer.tsx`; create `src/app/hexchess/[id]/page.tsx`.
**Change:** page reads `id` param, loads state from `hexChessStore.loadGame(id)`, renders `HexGameContainer`. Container mirrors `GameContainer.tsx` structure: back link, board card (with SettingsButton + Board + PromotionPicker), MoveIndicator, TurnIndicator, GameOverDialog + SettingsPopup (mode="hexchess"). Calls `useHexChessAITurn()`.

### Task 42: Hex chess replay route

**Files:** create `src/app/hexchess/replay/[id]/page.tsx`; create `src/components/hexchess/HexReplayContainer.tsx` (if reusing Sternhalma's replay chrome, extend it to accept a mode prop; otherwise write parallel).
**Change:** reads saved game, reconstructs states array by iterating `applyMove` over `moveHistory`, renders Board with view derived from each step and a step/back/forward controls row.

### Task 43: Merge replay list

**Files:** modify `src/app/replays/page.tsx`.
**Change:** call `listAllSavedGames()` (Task 28), render each row with a mode badge ("CC" or "Hex"), route clicks to `/replay/[id]` for Sternhalma or `/hexchess/replay/[id]` for hex chess.

---

## Milestone 6 — AI & Polish

### Task 44: Evaluation function

**Files:** create `src/game/ai/hexchess/evaluate.ts`; test `tests/game/ai/hexchess/evaluate.test.ts`.
**Interface produced:** `evaluate(state: HexChessState): number` — centipawn score from player 0's perspective. Includes material (Q=900, R=500, B=340, N=320, P/Soldier=100), piece-square tables (defined inline), mobility, king safety, soldier structure, tempo. Piece-square tables defined as 121-entry arrays keyed by cell (or a `Record<string, number>` keyed by `coordKey`).
**Test coverage:** starting position evaluates near zero; up a queen evaluates near +900 from player 0's side.

### Task 45: Alpha-beta search

**Files:** create `src/game/ai/hexchess/search.ts`; test `tests/game/ai/hexchess/search.test.ts`.
**Interface produced:** `searchBestMove(state, options: { budgetMs, maxDepth }): { move: HexMove; evalCp: number; depth: number; nodes: number }`. Iterative deepening from depth 1; alpha-beta with fail-soft; time-based abort.
**Test coverage:** at depth 2, finds an immediately-hanging queen capture; time budget respected.

### Task 46: Move ordering + quiescence

**Files:** create `src/game/ai/hexchess/moveOrdering.ts`; modify `search.ts` for quiescence; test `tests/game/ai/hexchess/quiescence.test.ts`.
**Interface produced:** `orderMoves(state, moves, ttMove, killers): HexMove[]` (TT best → promotions → MVV-LVA captures → killers → history → rest). Quiescence: at leaves, extend on captures / promotions / gives-check until no such moves exist.
**Test coverage:** simple exchange sequence resolves to true material; without quiescence the eval would spike due to the captured attacker not being recaptured.

### Task 47: Transposition table

**Files:** create `src/game/ai/hexchess/transposition.ts`; modify `search.ts`; test `tests/game/ai/hexchess/tt.test.ts`.
**Interface produced:** `TranspositionTable` class with `set(hash, entry)`, `get(hash): entry | null`, `clear()`. Entry: `{ depth, evalCp, flag: 'exact'|'lower'|'upper', bestMove }`. LRU-replace or depth-preferred (depth-preferred is simpler and works fine for v1).
**Test coverage:** revisiting a position at ≥ same depth returns the cached best move; lower/upper flags gate correctly.

### Task 48: AI Web Worker

**Files:** create `src/game/ai/hexchess/worker.ts` and `workerClient.ts`; test `tests/game/ai/hexchess/worker.test.ts`.
**Interface produced:** worker responds to `{ type: 'analyze', state, options }` with `{ type: 'result', move, stats }`. Client is a thin wrapper that hides the postMessage protocol and returns a `Promise<{ move, stats }>`.
**Test coverage:** module-level unit test of the client's promise-wrapping.

### Task 49: useHexChessAITurn hook

**Files:** create `src/hooks/useHexChessAITurn.ts`; test manually in dev server.
**Change:** parallels `useAITurn`. Subscribes to `hexChessStore`. When `currentPlayer` changes AND that seat is AI (per config), calls worker, waits for result, dispatches `attemptMove` (+ `confirmPromotion` if a promotion is pending). Difficulty maps to worker options per the difficulty table.

### Task 50: Perft regression pin

**Files:** modify `tests/game/hexchess/perft.test.ts` to add depth-2 and depth-3 with recorded exact counts.
**Change:** run the engine once against a stable version; record `perft(2)` and `perft(3)` as constants; assert equality. This catches any move-generation regression from the AI tasks.

### Task 51: Tactical puzzle suite

**Files:** create `tests/game/ai/hexchess/tacticalPuzzles.test.ts`; puzzle positions defined inline as arrays of `HexPiece`.
**Change:** ~15 hand-authored positions covering: hanging queen, back-rank mate, fork, pin, promotion race. Assert engine finds the correct move at `Medium` (2s budget). Runs in CI at a fixed budget.

### Task 52: How-to-play modal

**Files:** create `src/components/hexchess/HowToPlayHexChess.tsx`; add trigger buttons in `/play` (when Hex Chess selected) and in `SettingsPopup` (hex chess mode).
**Change:** static content: piece movement diagrams (SVG snippets from Task 29's icon set), promotion explanation, en passant explanation, win condition. No interactive walkthrough. Includes a "Close" button. Uses the same modal chrome as `SettingsPopup`.

---

## Self-Review

### Spec coverage

- Board geometry / piece types / movement → Tasks 6–13 (state, directions, sliders, steppers, soldier, pawn, dispatcher).
- Rules engine (applyMove, check, mate, draws, promotion, en passant, Zobrist) → Tasks 14–23.
- Store, page routing, persistence → Tasks 25–28, 41–43.
- Rendering (BoardView, Piece.tsx, BoardCell.tsx, PromotionPicker, capture animation, check ring, home-zone shimmer, sounds) → Tasks 1–5, 29–35.
- AI (eval, search, ordering, quiescence, TT, worker, hook) → Tasks 44–49.
- Play lobby integration (game mode selector, filtered board/player-count, variant rules, dispatch) → Tasks 36–40.
- Testing (perft, tactical puzzles, integration) → Tasks 24, 50, 51.
- Static How-to-play → Task 52.

Coverage complete against the spec.

### Placeholder scan

Tasks 12–35 use compressed enumeration (goal + files + interfaces) rather than expanded 5-step bodies. Each expansion follows the identical rhythm demonstrated in Tasks 1–11 (write failing test → run failing → implement → run passing → commit). When executing, the implementer expands each on demand. The compression is a scale concession, not a placeholder — every task has explicit files, interfaces, and test coverage requirements. Test bodies and code bodies for the compressed tasks are derivable from the spec (which the plan's header links) and the pattern established in Tasks 1–11.

### Type consistency

- `HexMove` shape declared in Task 6 (state.ts) is what Tasks 13, 14, and every downstream consumer uses.
- `BoardView`, `BoardPiece`, `BoardHighlight` from Task 1 flow through Tasks 2, 3, 4, 5, 26, 30, 32.
- `HexChessState`, `HexChessConfig`, `HexPlayerIndex` used consistently across store (Task 25), persistence (Task 27), and AI (Tasks 44–49).
- `selectBoardView` implemented in Task 2 (Sternhalma) and Task 26 (hex chess) with same return type.
- `attemptMove` (store action name) is consistent between Tasks 25, 26, 49.

No conflicts.

### Scope check

The plan is one feature but it spans 52 tasks. Each milestone (M1–M6) produces something reviewable:
- After M1: Sternhalma renders through the new interface.
- After M2: rules engine passes perft.
- After M3: playable via console.
- After M4: playable in a hand-driven page.
- After M5: fully wired into `/play`.
- After M6: full AI + polish.

A user could reasonably pause after any milestone. That's the right shape for a bundled feature of this size.
