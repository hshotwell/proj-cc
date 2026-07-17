# Hex Chess in the Board Editor — Design

Date: 2026-07-17
Status: approved (brainstormed with Henry; movement rules validated via diagrams)

## Goal

Add hex chess as a second editing mode in the board editor, with full playability:
custom hex chess boards can be created, saved, selected on /play, played against
AI or humans, saved mid-game, and replayed.

## Summary of decisions

- **Scope**: full — editor UI + engine generalization + play-page integration + persistence.
- **Architecture**: Approach A — one `BoardLayout` type with optional hexchess fields;
  one layout store; engine refactored around a derived `HexBoardGeometry` so the
  standard board and custom boards share a single rules path.
- **Unified pawn/peon**: one piece type in the editor (label: **Pawn**), one icon.
  The army's derived forward direction decides in-game behavior: point-forward
  (diagonal) → peon rules, edge-forward → pawn rules. The legacy standard-board
  `soldierVariant: 'pawn'` config option is retired for new games (old saves load).
- **Forward derivation**: per army, vector from centroid of its starting pieces to
  centroid of its promotion tiles (pixel space), snapped to the nearest of 12
  directions (6 edges + 6 diagonals/points). Exact tie snaps to the point (peon).
  Deterministic, recomputed — never stored.
- **Movement rules** (validated with diagrams):
  - *Peon (point-forward)*: non-capture move through the 1 forward point (slides
    between two cells); captures on the 2 adjacent edge cells flanking the point.
    Existing en passant mechanics unchanged (targets = 2 passed-between cells +
    vacated cell).
  - *Pawn (edge-forward)*: non-capture move 1 cell along the forward edge, plus a
    double-step from its starting cell (pass-through cell must be open); captures
    only on the 2 **adjacent** cells flanking the forward edge (±60°). Those same
    two cells are its en passant watch cells; a double-step creates an EP target
    on its pass-through cell.
  - Both piece kinds capture on adjacent edge cells flanking forward; only the
    non-capture move differs.
- **Walls in hex chess**: never landable; stop slider rays (rook/bishop/queen);
  block king/pawn/peon steps, captures, and the double-step pass-through cell.
  Knights leap over anything — only their destination must be an open cell. A
  peon's point-move sliding between two cells is NOT blocked by walls beside it.
- **Promotions**: per-player promotion tiles (drawn like goals, dashed outline in
  that player's color, visible only while that player is selected in the
  Promotions tab); promote-to options (knight/bishop/rook/queen) are **global per
  board**, default all four enabled.
- **Colors**: editor army palette = 9 colors (white, black, grey + 6 player
  colors). These already exist in the play-page picker; the change is making them
  army choices in the editor. Color precedence at game start: player's favorite
  color (settings) → board `defaultColors` → mode defaults (white/black for
  2-player hex chess; current defaults for sternhalma).
- **Grey clash**: eliminated armies in 3+ player hex chess stop rendering flat
  grey (`#8a8a8a`) and instead render as a faded/desaturated ghost of their
  owner's color, so a living grey army stays distinguishable.
- **30° rotation**: a toggle at the bottom of the symmetry section, both modes.
  Stored on the layout (`rotated30`); purely visual (cube coords and rules
  untouched); applied wherever the board renders — editor, play preview, in-game,
  replays. Visually turns pointy-top into flat-top hexes.
- **Mirror goals**: hidden in hex chess mode (no goal/piece relation).

## Data model

`BoardLayout` (src/types/game.ts) gains optional fields only — existing saved
layouts load unchanged (missing `gameMode` = sternhalma):

```ts
gameMode?: 'sternhalma' | 'hexchess';
rotated30?: boolean;                                      // both modes
defaultColors?: Partial<Record<PlayerIndex, PieceColor>>; // both modes
// hexchess-only:
hexPieces?: Record<string /* cellKey */, {
  player: PlayerIndex;
  type: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
}>;
promotionPositions?: Partial<Record<PlayerIndex, string[]>>;
promotionOptions?: ('knight' | 'bishop' | 'rook' | 'queen')[]; // default all 4
```

One store (`layoutStore`), one saved list, one import/export and cloud-sync path.
Sternhalma-only fields (`startingPositions`, `goalPositions`, `powerups`,
`pieceSpecialties`) are simply unused by hexchess layouts and vice versa.

**Color = army.** In the editor, painting with a color assigns pieces to that
color's seat. First use of a color claims the lowest free seat (max 6 armies from
9 colors; the UI shows "armies in use: N of 6"); erasing a color's last piece
frees its seat. The color→seat assignment is persisted via `defaultColors`.

## Engine: geometry-driven rules

New module concept `HexBoardGeometry`, derived once per game (memoized by layout
identity) from either the built-in standard board or a custom layout:

```ts
interface HexBoardGeometry {
  cells: Set<string>;              // live cells
  walls: Set<string>;              // subset of cells; impassable per wall rules
  forward: Partial<Record<HexPlayerIndex, ForwardSpec>>;
  promotionCells: Partial<Record<HexPlayerIndex, Set<string>>>;
  promotionOptions: HexPieceType[];
}
interface ForwardSpec {
  kind: 'point' | 'edge';
  dir: CubeCoord;                      // the snapped forward vector
  captureDirs: [CubeCoord, CubeCoord]; // flanking edge directions
}
```

- `board.ts` `isOnBoard` and `moves.ts`/`check.ts` consult geometry instead of the
  hardcoded 121-cell star (`getDefaultBoardCells`) and the hardcoded
  `forwardDiagonal` / `promotionCellsForPlayer` helpers. The standard board's
  geometry derives to exactly today's behavior — it is the regression test for
  the shared path.
- At game creation, each layout `'pawn'` becomes engine type `soldier`
  (point-forward army) or `pawn` (edge-forward army), so `moves.ts` keeps its
  type-based dispatch. Both render with the same icon.
- `pawnStartingCellsForPlayer` stub is replaced by reading the layout's pawn
  cells (double-step eligibility).
- `check.ts` attack detection generalizes pawn/peon attack cells from
  `captureDirs`. Rules mode unchanged: 2 armies = checkmate, 3+ = king-capture.
- Zobrist cell indexing widens from the 121-star to the editor's radius-10 hex
  (331 cells). Stored `positionHashes` in old saves go stale and are accepted
  (same precedent as the multiplayer migration).
- `HexChessState` embeds the layout snapshot so saves and replays are
  self-contained; deleting/editing a layout never breaks old games.
- AI: alpha-beta (2p) and Max^n (3+) structurally unchanged; evaluation reads
  promotion distance and board extent from geometry instead of the star.

## Editor UI

`src/app/editor/page.tsx` is 1613 lines; as part of this work the canvas and tab
panels are extracted into components under `src/components/editor/`.

- **Mode switch**: two big buttons above the board — Sternhalma (default) | Hex
  Chess. Switching swaps the tab set. Cells and walls carry across the toggle
  (the board shape is shared); mode-specific layers (starting/goals/special vs
  pieces/promotions) are kept in editor memory across toggles but only the
  active mode's layers are written when saving. A saved layout opens in its own
  `gameMode`. Loading a layout replaces both modes' in-memory layers.
- **Tabs in hexchess mode**: Cells | Pieces | Promotions (no Goals, no Special).
  Cells keeps the wall brush. Board renders as hex background tiles with the
  game's 3-shade coloring; sternhalma keeps nodes.
- **Pieces tab**: a 6×9 brush grid — rows: Pawn, Knight, Bishop, Rook, Queen,
  King; columns: the 9 colors. One click selects piece type + army together.
  Clicking a cell paints the selected piece; clicking an occupied cell with the
  same brush erases. No separate player selector.
- **Promotions tab**: army selector (only colors in use); painting draws that
  army's promotion tiles, shown as dashed outlines in the army's color and only
  while that army is selected (hidden in all other tabs/selections). Four global
  promote-to toggles (knight/bishop/rook/queen). A live "derived forward" readout
  per army shows the snapped direction and whether it plays as peon or pawn,
  updating as tiles are painted.
- **Symmetry column**: existing modes (none/x/y/xy/6way) apply to hexchess
  painting too; Mirror goals hidden in hexchess; new "Rotate board 30°" toggle at
  the bottom in both modes.

## Play page and game creation

- With Hex Chess selected on /play, a board picker lists the standard board plus
  valid `gameMode: 'hexchess'` layouts (invalid ones filtered, as sternhalma does
  today).
- Player count and seats come from which armies have pieces; turn order is the
  usual clockwise seat order filtered to those seats.
- `createHexGameFromLayout(layout, config)` builds the initial `HexChessState`
  (soldier/pawn assignment per derived forward, layout snapshot embedded).
- Colors pre-fill by the precedence chain (favorite → board default → mode
  default) and remain overridable in setup.

## Persistence

- Hex chess saves bump to `schemaVersion: 3`, adding the layout snapshot.
  v1/v2 saves migrate as standard-board games (existing migration retained).
- Replays reconstruct from the embedded snapshot; `rotated30` applies in replay
  rendering.

## Validation (hexchess layouts)

A hexchess layout is playable when all of:

1. At least 2 armies have pieces.
2. Every army with pieces has exactly one king.
3. Every army that has pawns also has at least one promotion tile (forward would
   otherwise be undefined).
4. If any army has pawns, at least one promote-to option is enabled.
5. All pieces and promotion tiles sit on live cells (in `cells`, not walls).

The play page filters invalid boards; the editor shows failing checks inline.

## Testing

- **Unit**: forward snapping (point, edge, exact tie → point); edge-forward pawn
  moves, double-step, captures, en passant (create + capture); wall interaction
  per piece type (slider stop, knight leap, blocked double-step, unblocked peon
  slide); promotion from custom tiles with restricted options; validation cases;
  v2→v3 save migration.
- **Regression**: standard board's derived geometry reproduces current engine
  behavior (moves, EP, promotion zone) move-for-move against the existing test
  expectations.
- **End-to-end** (browser): edit → save → select on /play → play (incl. AI turn)
  → save → replay a custom hex chess board; verify promotion outlines, 30°
  rotation, and eliminated-army ghost rendering.

## Out of scope

- Sternhalma rule changes of any kind (its editor gains only defaultColors,
  rotate-30°, and the white/black/grey army palette).
- Powerups/piece specialties in hex chess.
- Per-player promote-to options.
- Castling or other new chess rules.
