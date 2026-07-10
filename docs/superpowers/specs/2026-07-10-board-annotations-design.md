# Board Annotations (Right-Click Circles & Arrows) — Design

Date: 2026-07-10
Status: Approved (pending final review)

## Summary

Add Lichess/chess.com-style board annotations to both Chinese Checkers and hex
chess: right-click a node to circle it in your color; right-click, drag to
another node, and release to draw an arrow between them in your color.
Left-clicking anywhere clears every annotation. These are purely local,
client-side scratch marks — never synced to Convex, never visible to online
opponents. In Chinese Checkers, an arrow from an occupied node to a node that
piece could legally jump to bends to follow the actual jump path instead of
drawing straight. In hex chess, an arrow from a knight to a valid knight-leap
destination draws as an elbowed "two-forward-one-side" shape instead of
straight.

This works across all five surfaces that host `Board.tsx` today: Chinese
Checkers local play, Chinese Checkers online play, Chinese Checkers replay,
hex chess local play, and hex chess replay.

## Terminology

- **Local player** — the human on this device for a given game, when
  unambiguous. Mirrors the same `localPlayer` prop/computation the pre-moves
  feature already uses ("exactly one human seat"). `undefined` when there
  isn't a single unambiguous human (hotseat with 2+ humans, or a replay,
  which has no seat concept at all).
- **Annotation** — either a *circle* (`{ cell: CubeCoord, color: string }`)
  or an *arrow* (`{ id: string, from: CubeCoord, to: CubeCoord, color:
  string }`).
- **Drag** — a right-mouse-button press-hold-release sequence. A drag that
  ends on its own start cell is a *click* (produces a circle); a drag that
  ends elsewhere produces an arrow.

## Architecture

All new interaction and rendering lives in `Board.tsx`, in a new standalone
Zustand store (`annotationStore`), **not** wired through any container's
props beyond one small addition (`localPlayer` for hex chess's live
container — see Plumbing Gap below). This is deliberate: `Board.tsx` already
unifies live/replay state today (the Chinese Checkers `gameState` variable is
already `isReplayActive ? replayDisplayState : liveGameState`; hex chess
replay already constructs and passes the identical `BoardView` shape live hex
chess uses), and it already branches directly on `viewProp` presence for
plenty of other mode-specific rendering (tile colors, animation, etc.) rather
than staying a "pure" mode-agnostic renderer. Putting the two mode-specific
path-bending functions directly in `Board.tsx` matches that existing
convention. The alternative (threading annotation event props through all 5
containers, two of which — `ReplayContainer.tsx` and `HexReplayContainer.tsx`
— currently pass `Board` zero interaction props at all) would multiply the
integration surface for no behavioral benefit, since the generic
click/circle/arrow/clear behavior doesn't actually vary by mode — only the
bend computation does, and that only needs read access to state `Board.tsx`
already has in scope.

### Plumbing gap to close

Chinese Checkers containers (`GameContainer.tsx`, `/app/online/[id]/page.tsx`)
already pass `localPlayer` to `Board` (for pre-moves). Hex chess's
`HexGameContainer.tsx` does not yet — it computed `localPlayer` for the
pre-moves feature but never forwarded it as a `Board` prop. This design adds
that one pass-through (`<Board ... localPlayer={localPlayer} />` in
`HexGameContainer.tsx`). `HexReplayContainer.tsx` and `ReplayContainer.tsx`
intentionally continue to pass no `localPlayer` — replay has no seat concept,
which is exactly the "no unambiguous local player" case the color rule
already has to handle.

### New `BoardView` field: `playerColors`

Chinese Checkers already exposes a full `Record<PlayerIndex, string>` via
`gameState.playerColors`, which `Board.tsx` already reads (see the existing
`effectiveCustomColors` logic). Hex chess's `BoardView` currently only
exposes the *active* player's color (`activePlayerColor`), which isn't enough
to resolve "the fixed local human's color" during the AI's turn (when
`activePlayerColor` is the AI's color, not the human's). Add:

```ts
// src/types/boardView.ts, on BoardView
/** Maps every player index in the game to their CSS color. Used to resolve
 * a *specific* player's color (e.g. the local human's) independent of
 * whose turn it currently is. */
playerColors?: Record<number, string>;
```

`selectHexChessBoardView` populates it as
`{ 0: config.players[0].color, 1: config.players[1].color }`.

## Data model

New file `src/store/annotationStore.ts`:

```ts
export interface AnnotationArrow {
  id: string;          // `${fromKey}>${toKey}`, doubles as the toggle key
  from: CubeCoord;
  to: CubeCoord;
  color: string;        // CSS color, resolved at draw time
}

interface AnnotationStoreState {
  circles: Map<string, { cell: CubeCoord; color: string }>; // keyed by coordKey
  arrows: Map<string, AnnotationArrow>; // keyed by `${fromKey}>${toKey}`
  toggleCircle: (cell: CubeCoord, color: string) => void;
  toggleArrow: (from: CubeCoord, to: CubeCoord, color: string) => void;
  clearAll: () => void;
}
```

`toggleCircle`/`toggleArrow` remove the entry if it already exists at that
exact key (same cell for circles; same *directional* from→to pair for
arrows — drawing to→from is a distinct arrow, matching that direction is
part of what the arrow communicates), otherwise add it. The toggle key
ignores color: right-clicking an already-circled cell removes it regardless
of which color drew it (only matters in hotseat, where different turns may
resolve to different colors) — "click again removes it" is unconditional,
not scoped to "click again in the same color." This is a plain
reducer-style store with no dependency on game state, shared unmodified by
both game modes and all five surfaces.

Not keyed by `gameId` — a single flat current set, reset on identity change
(see Lifecycle) rather than accumulated per-game. In-memory only, matching
the pre-moves precedent; no localStorage, no Convex sync.

## Interaction: the pure decision function

Mirroring `resolvePreMoveFiring` from the pre-moves feature, the mouse-event
handlers in `Board.tsx` are thin wrappers around a pure, independently
testable function so the state machine itself doesn't require simulated DOM
events to test:

```ts
// src/game/annotations.ts
export type AnnotationDragResult =
  | { type: 'circle'; cell: CubeCoord }
  | { type: 'arrow'; from: CubeCoord; to: CubeCoord }
  | { type: 'none' }; // dragged off-board, no cell under the pointer at release

export function resolveAnnotationDrag(
  dragOrigin: CubeCoord,
  releaseCell: CubeCoord | null,
): AnnotationDragResult {
  if (releaseCell === null) return { type: 'none' };
  if (cubeEquals(dragOrigin, releaseCell)) return { type: 'circle', cell: dragOrigin };
  return { type: 'arrow', from: dragOrigin, to: releaseCell };
}
```

### Event wiring in `Board.tsx`

- Reuse and generalize the existing `hoveredCell` tracking (currently gated
  on `showCoordinates`, driven by each cell's `onMouseEnter`) so it always
  runs — it becomes the "nearest node" signal for both the coordinate
  tooltip (unchanged) and drag targeting (new). No new geometry/pixel-math is
  needed: hex tiling has no gaps, so whichever cell's `onMouseEnter` last
  fired is definitionally the nearest node to the pointer.
- `onMouseDown` (button `2`, right button) on a cell: `dragOriginRef.current
  = coord`. No store mutation yet.
- `onContextMenu` on the board is now **unconditionally**
  `e.preventDefault()`'d (previously only when `preMovesAllowed`) — the
  native context menu must never appear while annotations are active, which
  is always.
- `onMouseUp` (button `2`) at the SVG-root level (not per-cell, so a release
  outside every cell's hit area is still caught):
  1. **Pre-move-cancel priority, click-only.** If `dragOriginRef.current`
     equals `hoveredCell` (i.e. this was a plain right-click, not a drag —
     see Interaction with Pre-Moves below) **and** that cell is the `to` of
     a queued pre-move **and** `preMovesAllowed` is true, call the existing
     `cancelPreMoveAt`/equivalent instead of touching annotations, and stop.
     A drag that merely *ends* on a queued destination (started elsewhere)
     is not treated specially — it draws an arrow there, since the user
     evidently intended a drag gesture.
  2. Otherwise, call `resolveAnnotationDrag(dragOriginRef.current,
     hoveredCell)` and dispatch to `toggleCircle`/`toggleArrow` with the
     color from Color Resolution below.
  3. Clear `dragOriginRef.current`.
- A single `onClick` at the SVG root calls `annotationStore.clearAll()`
  unconditionally, before any existing left-click logic — covers piece
  selection, move clicks, empty-space clicks, and pre-move-queueing clicks
  uniformly, since any real left-click is a "start fresh" gesture for the
  scratchpad. This does not change any existing left-click *behavior*, it
  only adds the clear as a side effect.

### Interaction with pre-moves (the "layer them" resolution)

Right-click continues to mean "cancel this queued pre-move" **only** for the
narrow case it already covered: a plain click (mousedown and mouseup on the
same cell, no drag) landing exactly on a queued pre-move's destination cell,
while pre-moves are actively queueable. Every other right-click — including
during the pre-move-queueable window, and including drags that happen to end
on a queued destination — is annotation input. This preserves existing
pre-move-cancel behavior byte-for-byte for the one gesture it always
supported (a plain click), while giving drags full freedom.

## Mode-specific arrow bending

Both functions live in `src/game/annotations.ts` alongside
`resolveAnnotationDrag`, and both return a **waypoint list**
(`CubeCoord[]`, always starting with `from` and ending with `to`) that the
renderer draws as a polyline; a straight arrow is just a 2-element list.

### Chinese Checkers: `computeCheckersArrowPath`

```ts
export function computeCheckersArrowPath(
  state: GameState,
  from: CubeCoord,
  to: CubeCoord,
): CubeCoord[] {
  const content = state.board.get(coordKey(from));
  if (content?.type !== 'piece') return [from, to];
  const path = findMovePath(state, from, to, content.player); // already exists, built for pre-moves
  if (!path || !path.some(m => m.isJump)) return [from, to];
  return [from, ...path.map(m => m.to)];
}
```

Reuses `findMovePath` from `src/game/pathfinding.ts` verbatim — already
proven correct (it's the same function pre-moves uses to validate a queued
destination is reachable in one turn). A single-step result or "no path
found" both fall back to a straight line, since a single step has no bend to
show and an unreachable destination has no path to draw.

### Hex chess: `computeHexKnightArrowPath`

```ts
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
  return [from, cubeAdd(from, elbowFor(leap)), to];
}
```

This is pure geometry — no occupancy/legality check, since it's a visual
hint about shape, not a legality claim (matches your framing: "even if
occupied by another piece").

`elbowFor(leap)` is computed algorithmically, not via a hand-written
12-entry table, using the same decomposition pattern
`src/game/hexchess/directions.ts`'s existing `forwardEdges()` already uses
(it finds the two `EDGE_DIRECTIONS` that sum to a given diagonal — this is
the same idea, one level deeper): every `KNIGHT_LEAPS` vector `L` decomposes
uniquely as `2×e1 + e2` for some pair of `EDGE_DIRECTIONS` `(e1, e2)` (e.g.
leap `(1,-3)` = `2×(0,-1) + (1,-1)`). Find that pair by brute-force search
over the 6 edge directions (36 combinations, trivial), then the elbow
waypoint is `from + e1 + e1` (2 steps along the "long leg"), and the second
segment (`elbow → to`) is automatically the 1-step "short leg" since `elbow
+ e2 = to` by construction. This reads visually as exactly the "two
hex forward, one hex to the side" shape you described, and is fully
deterministic/derivable rather than requiring 12 hand-checked cases.

## Color resolution

```ts
function resolveAnnotationColor(): string {
  if (viewProp) {
    // hex chess
    const idx = localPlayer ?? viewProp.activePlayerIndex;
    const raw = viewProp.playerColors?.[idx] ?? viewProp.activePlayerColor;
    return getCSSColor(raw ?? 'gray');
  }
  // Chinese Checkers (live or replay — gameState is already unified above)
  const idx = localPlayer ?? gameState?.currentPlayer;
  return idx !== undefined ? getCSSColor(getPlayerColorFromState(idx, gameState)) : '#888888';
}
```

When `localPlayer` is defined (exactly one human seat), always use that
player's fixed color, regardless of whose turn it is — satisfies drawing in
your own color during the AI's turn. When undefined (hotseat with 2+ humans,
or any replay), fall back to whoever's turn it currently is.

## Rendering

New SVG layer in `Board.tsx`, rendered above pieces (so a circled/occupied
cell is still visible) with `pointer-events: none` on the whole layer
(matches every existing highlight layer):

- **Circle**: `<circle>`, `fill="none"`, `stroke={color}`, `strokeWidth={3}`,
  radius `pieceRadius + 4`, `opacity={0.85}` — visually distinct from the
  existing `check`/`legalMoveCapture` rings (different radius/weight, and
  always a *player* color rather than the fixed red/green semantic colors).
- **Arrow**: a `<polyline>` through the waypoint list (`fill="none"`,
  `stroke={color}`, `strokeWidth={4}`, `opacity={0.85}`), plus a manually
  computed filled `<polygon>` arrowhead (3 points) at the final waypoint,
  rotated to match the incoming segment's direction. Computed directly
  rather than via an SVG `<marker>` element — matches the codebase's
  existing convention of hand-computing piece/highlight geometry (e.g.
  `flameStarPath`, `eggPath` in `Piece.tsx`) rather than relying on
  browser-dependent SVG marker/`context-stroke` support.
- No settings toggle to disable the feature — it's a purely local, no-effect
  scratchpad, same category as "show coordinates," but simple enough (and
  consistent with Lichess/chess.com always-on annotations) not to warrant
  its own gameplay-settings entry. If this turns out to be wanted later it's
  a small addition, not a blocker now.

## Lifecycle

`annotationStore.clearAll()` is called:
- On every left click (see Interaction), the primary clearing mechanism.
- On game/replay identity change: new game started (`createGame` /
  `startGame` / `startGameFromLayout` in the relevant store), a different
  saved game loaded into a replay, or navigating to a different `gameId`.
  Implemented as a `useEffect` in `Board.tsx` keyed on the relevant identity
  value (`gameId` for live games, `saved.id` for replay) — consistent with
  how pre-moves resets on game-identity changes today, but scoped inside
  `Board.tsx` itself rather than each container, since `Board.tsx` already
  receives (or derives) that identity in every surface.

Explicitly **not** cleared by: turn changes, moves being made (yours,
AI's, or the opponent's), or stepping through replay — annotations persist
until an explicit left click, per your spec.

## Testing plan

- `src/store/annotationStore.ts`: unit tests for `toggleCircle` (add, then
  toggle-off), `toggleArrow` (add, toggle-off, directional distinctness —
  `A→B` and `B→A` coexist as separate entries), `clearAll`.
- `src/game/annotations.ts`: unit tests for `resolveAnnotationDrag` (same
  cell → circle, different cell → arrow, null release → none),
  `computeCheckersArrowPath` (straight line for a non-piece origin or a
  reachable-by-step destination; bent polyline for a genuine jump chain,
  using a constructed `GameState` fixture the same way existing pathfinding
  tests do), `computeHexKnightArrowPath` (straight line for a non-knight
  origin or a non-leap destination; elbowed path for a genuine knight leap,
  covering at least 2 of the 12 leap vectors to prove the elbow table isn't
  copy-paste-wrong).
- `Board.tsx` rendering: extend the existing
  `tests/components/board/highlights.test.tsx`-style approach with a new
  test file that seeds `annotationStore` state directly (via
  `useAnnotationStore.setState`) before rendering, and asserts the expected
  `<circle>`/`<polyline>`/`<polygon>` markup appears — the same
  `renderToStaticMarkup` + store-mocking pattern already established there,
  since annotations render from a Zustand store rather than the `view` prop.
- No test coverage is planned for the raw DOM mouse-event wiring itself
  (mousedown/mouseup/mouseenter) — consistent with how this session's
  `useHexChessPreMoveFiring` hook was tested (the pure decision function is
  tested; the thin effectful wrapper is not), and with the fact that this
  codebase has no existing pattern for simulating real pointer drags in
  tests. Manual browser verification is the intended check for the wiring
  itself.

## Out of scope for v1

- A settings toggle to disable annotations.
- Multiple annotation colors per player (e.g. shift/ctrl+drag for alternate
  colors, as Lichess supports) — single color per player, matching your
  spec exactly.
- Annotations in the board editor (`/editor`) — not a live game or replay
  surface, not requested.
- Persistence across page reload or across game/replay identity changes.
- Any cap on the number of simultaneous circles/arrows.
