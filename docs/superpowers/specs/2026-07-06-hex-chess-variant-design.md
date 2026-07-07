# Hex Chess Variant — Design

**Status:** Design approved, ready for implementation planning.
**Author:** Henry (with Claude)
**Date:** 2026-07-06

## Overview

A new "Hex Chess" game mode inspired by Gliński's hexagonal chess, playable alongside Chinese Checkers on the standard 121-cell Sternhalma star board. Win by checkmate. Pieces move by Gliński conventions. A new piece type — the Soldier — replaces the classical Pawn as v1's front-line piece because its forward-diagonal move aligns with the Sternhalma arm axis, meaning no board rotation is needed.

**v1 scope: 2-player only.** 3–6 player and team modes are deferred to a follow-up spec.

## Board geometry, piece types, movement

**Board.** The standard 121-cell Sternhalma star, unchanged from Chinese Checkers. No rotation.

**Player arms.** Two players occupy opposite arms along the pointy-up corner axis. Each player's "forward" direction is the diagonal from their arm's apex toward the opposing arm's apex.

**Starting layout (each player, 10 pieces):**

```
       K              row 1 (apex — safest)
      R R             row 2
     B Q B            row 3
    S S S S           row 4 (front — 4 Soldiers, closest to center)
```

Roster: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 4 Soldiers. No Knights or Pawns in the v1 default layout, but both remain fully implemented in the engine and are available for editor layouts in follow-up specs.

**Piece movement (all Gliński conventions):**

| Piece   | Movement |
|---------|----------|
| King    | 1 step in any of 12 directions (6 edges + 6 diagonals). Cannot move into check. |
| Queen   | Slide any distance along 6 edges or 6 diagonals. Blocked by pieces (captures on last enemy square). |
| Rook    | Slide along 6 edge directions. |
| Bishop  | Slide along 6 diagonal (corner) directions, 2-hex steps. Each bishop is stuck to one of 3 hex colors. |
| Knight  | 1 leap to any of up to 12 nearest hexes not reachable by a Queen in one step. Jumps over pieces. |
| Soldier | Move: 1 step through forward diagonal. Capture: 1 step through either forward edge. |
| Pawn    | Move: 1 step through forward edge; +2 first move if on a pawn-starting cell. Capture: 1 step through either forward diagonal; classical en passant. |

Both Soldier and Pawn are forward-only. Both promote on reaching any cell of the opposing arm — player picks Q / R / B / N.

**Pawn double-step retention.** A pawn is eligible for its 2-step first move whenever it currently sits on any pawn-starting cell of its side (not just its original cell). A pawn that captures diagonally into another pawn-starting cell retains double-step eligibility.

**Soldier en passant.** When Soldier A completes a forward-diagonal move from X to Y, the two cells edge-adjacent to both X and Y are the "passed-through" cells. If an enemy Soldier B could reach one of those passed-through cells by its own normal forward-diagonal move, B may perform that move on its immediately-following turn as an en passant capture; A is removed. Geometrically this only works when B's forward-diagonal aligns with the passed-through cell — a narrow window matching classical en passant.

## Rules engine

**Location:** `src/game/hexchess/`. Independent of Sternhalma rules code.

**State kernel** (`state.ts`):

```ts
type HexPieceType = 'king'|'queen'|'rook'|'bishop'|'knight'|'pawn'|'soldier';
type HexPlayerIndex = 0 | 1;

interface HexPiece {
  id: string;
  player: HexPlayerIndex;
  type: HexPieceType;
  cell: CubeCoord;
  hasMoved: boolean;
}

interface HexChessState {
  mode: 'hexchess';
  pieces: HexPiece[];
  currentPlayer: HexPlayerIndex;
  turnNumber: number;
  forwardAxis: [CubeVec, CubeVec];         // per-player forward diagonal
  enPassantTarget: null | {
    capturedPieceId: string;
    targetCells: CubeCoord[];              // cells the capturer must land on
    availableUntilTurn: number;
  };
  pendingPromotion: null | {
    pieceId: string;
    targetCell: CubeCoord;
    options: HexPieceType[];               // ['queen','rook','bishop','knight']
  };
  moveHistory: HexMove[];
  positionHashes: Record<string, number>;  // Zobrist hex-string counts for threefold repetition (Record so it serializes)
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}

type HexEndReason = 'checkmate'|'stalemate'|'repetition'|'insufficient-material'|'resignation';

interface HexMove {
  pieceId: string;
  from: CubeCoord;
  to: CubeCoord;
  capture: null | { pieceId: string; cell: CubeCoord };  // cell differs from `to` only for en passant
  promotion: null | HexPieceType;
  isEnPassant: boolean;
  isDoubleStep: boolean;
  player: HexPlayerIndex;
  turnNumber: number;
}
```

**Move generation** (`moves.ts`):

- `legalMovesForPiece(state, pieceId)` — pseudo-legal moves filtered by "would this leave own king in check?"
- `legalMoves(state)` — flat list for current player.
- Per piece type, a `pseudoMoves` function generates candidates:
  - Sliders (Q/R/B): walk each direction until off-board, own piece (stop), or enemy piece (stop including).
  - Steppers (K, N): one step per direction, filter self-occupied.
  - Soldier: forward diagonal if empty; forward-edge steps only if enemy occupies. Includes en passant target when available.
  - Pawn: forward edge if empty; +2 if on pawn-starting cell and both intermediate cells empty; forward-diagonals only if enemy occupies; en passant target if available.

**Check detection** (`check.ts`):

- `isCellAttacked(state, cell, byPlayer)` — generate pseudo-moves for `byPlayer` and check if any lands on `cell`. Soldiers and Pawns only "attack" their capture cells, not their forward-move cells.
- `isInCheck(state, player)` — `isCellAttacked(state, kingOf(player).cell, other(player))`.
- `filterLegal(state, pseudoMoves)` — for each move, simulate on scratch state and reject if own king is in check afterwards.

**End-of-turn evaluation:**

1. Apply move → new state.
2. Update `enPassantTarget` (set if move was a soldier-forward-diagonal or pawn-double-step; cleared otherwise).
3. Increment Zobrist repetition counter for the new position hash.
4. Check for game end (in order):
   - No legal moves for next player: `isInCheck` → checkmate (current player wins); else stalemate (draw).
   - Repetition count for current hash ≥ 3 → draw.
   - Insufficient material → draw. Sets: K vs K, K+B vs K, K+N vs K, K+B vs K+B on same hex color.
5. Advance `currentPlayer`.

**Promotion mechanics:**

- Soldier/Pawn move that lands on any of the 10 cells of the opponent's arm sets `pendingPromotion` on state.
- Turn does NOT advance and no other moves are legal until `confirmPromotion(state, choice)` finalizes.
- Player picks Q/R/B/N; the piece is replaced in place and end-of-turn evaluation runs.

**Zobrist hashing** (`zobrist.ts`):

- Random 64-bit table per (piece type × player × cell) plus side-to-move key and en-passant-target key.
- Rehashed incrementally on each move for cheap repetition detection and reuse in AI transposition table.

**Notes:**

- No undo mid-turn (chess has no chain-move pending phase like Sternhalma).
- No corridors / pathfinding / longest-hop concepts carry over from Sternhalma.
- Coord system (`CubeCoord`) and board geometry (`src/game/coordinates.ts`, `src/game/triangles.ts`) reused unchanged.

## Store and page routing

**New store** (`src/store/hexChessStore.ts`) — Zustand, parallel to `gameStore`. Never touches `gameStore`.

```ts
interface HexChessStore {
  state: HexChessState | null;
  selectedPieceId: string | null;
  legalMoveTargets: CubeCoord[];         // memoized for selected piece
  animatingMove: null | { move: HexMove; startedAt: number };

  createGame(config: HexChessConfig): void;
  selectPiece(pieceId: string): void;
  makeMove(target: CubeCoord): void;      // sets pendingPromotion if needed
  confirmPromotion(choice: HexPieceType): void;
  resign(): void;
  loadGame(id: string): void;
  clearGame(): void;
}

interface HexChessPlayerConfig {
  color: PieceColor;                       // reused from Sternhalma color system
  name: string;
  isAI: boolean;
}

type HexChessDifficulty = 'easy' | 'medium' | 'hard';

interface HexChessConfig {
  id: string;
  players: [HexChessPlayerConfig, HexChessPlayerConfig];
  layoutPreset: 'v1-default';              // K + Q + 2R + 2B + 4 Soldiers (see "Starting layout")
  soldierVariant: 'soldier';               // 'soldier' | 'pawn' (locked to soldier in v1)
  ai: null | { forPlayer: HexPlayerIndex; difficulty: HexChessDifficulty };
}
```

Chess has no chain-move phase, so there's no `pendingConfirmation` and no `undoLastMove`. Move commits immediately (or after promotion choice).

**Route structure:**

- `/hexchess/[id]` — live game.
- `/hexchess/replay/[id]` — replay viewer.
- Setup lives inside the existing `/play` lobby (see "Play lobby integration" below).

**Persistence keys:**

- `hexchess-game-{id}` — full state snapshot on each move.
- `hexchess-saved-games` — index. Same 20-cap / oldest-evicted policy as Sternhalma. Summary includes `mode: 'hexchess'`.

**Web Worker:**

- New worker entry `src/game/ai/hexchess/worker.ts` — same postMessage protocol as existing worker.
- `useHexChessAITurn()` hook parallels `useAITurn`; fires the worker on `currentPlayer` change if that seat is AI, applies the returned move via `makeMove` + `confirmPromotion`.

**Global services reused as-is:** sound (with additions in "Rendering" below), settings store, layout store (untouched in v1).

## Rendering

**BoardView interface.** Extract a mode-agnostic view-model shape and rewire `Board.tsx` to consume it as props:

```ts
interface BoardView {
  cells: CubeCoord[];                            // playable cells
  homeZones: Map<PlayerIndex, CubeCoord[]>;      // per-player promotion (hex chess) / goal (sternhalma) zone
  pieces: BoardPiece[];                          // color + optional type + optional badge
  highlights: BoardHighlight[];                  // selection, legal moves, last-move, check ring
  animatingMove: null | BoardMoveAnimation;
  rotation: number;
  activePlayerIndex: number;
}

interface BoardPiece {
  id: string;
  cell: CubeCoord;
  color: PieceColor;                             // reused system
  pieceType?: HexPieceType;                      // undefined for sternhalma marbles
  faded?: boolean;
}

interface BoardMoveAnimation {
  from: CubeCoord;
  to: CubeCoord;
  separateCaptureCell?: CubeCoord;               // for en passant
}
```

Both stores expose a `selectBoardView()` selector. `Board.tsx` never branches on mode.

**Piece icon overlay.** When `pieceType` is set, `Piece.tsx` renders the marble (existing gradients / skins / glass mode) with an SVG glyph on top:

- K, Q, R, B, N glyphs — simple silhouettes, contrast-colored against the marble base (dark on light, light on dark).
- Soldier and Pawn: no glyph — plain marble. Every other glyph tells you the piece is special.
- Icon size = ~60% of piece radius, centered.
- Glass mode: glyph rendered slightly translucent with a soft shadow so the marble interior still shows through.
- Icons live in `src/components/board/pieceIcons/` as small React SVG components.

**Highlight types (chess-specific additions):**

- `selection` — cyan ring (reuses Sternhalma style).
- `legalMoveEmpty` — small dot on empty target.
- `legalMoveCapture` — hollow ring around a capturable enemy piece.
- `lastMove` — from/to soft glow (reused).
- `check` — pulsing red ring around a checked king.

**Home-zone shimmer.** The rainbow shimmer effect currently applied to Sternhalma goal zones is applied to each player's promotion zone (the opponent's arm) in hex chess. Visual reuse is 1:1; only the source zone is different.

**Capture animation.** Two-phase:

1. Attacker slides from `from` → `to` using existing move-tween machinery (`animate moves` setting respected).
2. On arrival, the captured piece fades out with a slight scale-down (~180ms). If sound is on, a "capture" sound fires.
3. En passant: attacker slides to the passed-through cell; captured Soldier/Pawn (one hex away) fades out simultaneously. The captured piece's cell is different from the attacker's landing cell — represented by `BoardMoveAnimation.separateCaptureCell`.

**Promotion UI.** When `state.pendingPromotion` is set, `Board.tsx` renders a floating `PromotionPicker` anchored near the promoting piece's cell: 4 large hex-styled buttons showing Q/R/B/N glyphs on the player's color. Click to confirm. Board interaction disabled until choice made. No keyboard shortcut in v1.

**Check indicator.** Whenever `isInCheck(state, player)` is true for either side, that king gets the pulsing red ring highlight. Distinct from selection/last-move so it's readable when combined.

**Sound additions.** All existing global click / move / jump sounds fire in hex chess. New:

- `capture.play(color)` — lightly percussive variant of the marble-collision sound; plays as captured piece begins fading.
- `check.play()` — short chime played when a move puts the enemy king in check.
- `checkmate.play()` — longer resolution sound on game end via mate. Draws use the existing game-end sound.

**What's NOT reused in chess mode:** corridor visualization and progress arc (not applicable). Chinese Checkers–specific overlays remain gated behind Sternhalma mode.

## AI

**Location:** `src/game/ai/hexchess/`. Fully separate from `src/game/ai/*` (default, ricefish, ricefish-plus, endgame).

**Search** (`search.ts`) — iterative-deepening alpha-beta:

- Iterative deepening from depth 1 up to `maxDepth`. Each iteration seeds move ordering from the previous.
- Alpha-beta with fail-soft returns.
- Quiescence at the leaves: extend on captures, checks, and promotions until the position is quiet.
- Move ordering (priority): TT best move → promotions → MVV-LVA captures → killer moves → history heuristic → remaining.
- Transposition table keyed by Zobrist hash — stores best move, evaluation, depth, and flag (exact/lower/upper).
- Time-based abort with depth cap as safety net.

**Evaluation** (`evaluate.ts`):

```
score = material + pieceSquare + mobility + kingSafety + soldierStructure + tempoBonus
```

- **Material** (starting values, tunable): Q=900, R=500, B=340, N=320, P/Soldier=100, K not counted.
- **Piece-square tables** per piece type, mirrored per side. Soldiers get graduated bonuses for advancing; knights favor central hexes; bishops favor long diagonals; kings get safety bonus in own back rows.
- **Mobility** — legal-move count per side, weighted by piece type.
- **King safety** — friendly pieces within 2 hexes of own king vs enemy attackers on same; back-rank apex bonus.
- **Soldier structure** — small bonus for connected soldier chains; penalty for isolated exposed soldiers.
- **Tempo** — small side-to-move bonus.

**Difficulty presets:**

| Level  | Time budget | Depth cap | Quiescence | TT size |
|--------|-------------|-----------|------------|---------|
| Easy   | 300ms       | 2         | shallow    | 64K     |
| Medium | 2s          | 4         | full       | 256K    |
| Hard   | 8s          | 6         | full       | 1M      |

**Worker** (`worker.ts`) — postMessage protocol:

```
inbound:  { type: 'analyze'; state: HexChessState; options: { budgetMs, maxDepth } }
outbound: { type: 'result'; move: HexMove; stats: { nodes, depth, evalCp } }
          { type: 'progress'; depth; currentBestMove; evalCp }
```

`useHexChessAITurn()` parallels `useAITurn`.

**Opening book:** deferred. Hex chess opening theory for this board doesn't exist yet.

**No engine dropdown in v1.** Ships with one engine. Follow-up spec can add a dropdown if multiple engines emerge.

## Play lobby integration

The play lobby (`/play`) gets a new top-level "Game Mode" section. Order (top to bottom):

1. **Game Mode** — new radio/segmented control:
   - Chinese Checkers (default)
   - Hex Chess

   Selection determines what's available in the sections below. Changing it resets board selection to that mode's default and clears incompatible variant-rule toggles.

2. **Board** — the existing board selector, filtered by game mode:
   - Chinese Checkers → standard board + all custom layouts (unchanged).
   - Hex Chess → only the standard 121-cell board in v1.

3. **Player count / seats** — filtered:
   - Chinese Checkers → unchanged (2, 3, 4, 6).
   - Hex Chess → locked to 2-player in v1.

4. **Colors** — existing color picker rows, identical for both modes.

5. **Variant Rules** (renamed from current "Game Mode"):
   - Chinese Checkers → shows piece variant (normal / turbo / ghost) + Team Mode checkbox.
   - Hex Chess → v1 has no variant toggles. Inline note: "No variants available yet for Hex Chess." Follow-up specs can add hex-chess-specific variants (Pawn vs Soldier front row, alternate starting layouts, custom rulesets).

6. **AI configuration** — reused; difficulty selector applies to both modes. Engine dropdown remains Sternhalma-only in v1.

**Start button.** Dispatches based on game mode:

- Chinese Checkers → creates game in `gameStore`, navigates to `/game/[id]`.
- Hex Chess → creates game in `hexChessStore`, navigates to `/hexchess/[id]`.

**Play page state change.** Add `const [gameMode, setGameMode] = useState<'sternhalma'|'hexchess'>('sternhalma')`. Rename existing `gameMode` state (piece variant) to `pieceVariant`. Team mode state and checkbox move into the "Variant Rules" section next to the piece variant selector.

**No home-page tile.** Home page unchanged.

**Game page (`/hexchess/[id]`).** Same top-level structure as `GameContainer.tsx`:

1. `← Home` link.
2. Board card with `<SettingsButton />`, `<Board />` (BoardView-driven), and `<PromotionPicker />` (visible only when `pendingPromotion` is set).
3. `<HexMoveIndicator />` — compact last-move summary in algebraic-style notation with hex coords (e.g., "R b2→c3"), plus resign button. No confirm/undo (chess has no chain moves).
4. `<HexTurnIndicator />` — current player color + name + "in check" badge + result banner on game end.
5. Modals: `<HexGameOverDialog />`, `<SettingsPopup mode="hexchess" />`.

`useHexChessAITurn()` called at the top like `useAITurn`. No `usePlayerOpening` in v1.

**Settings popup.** Shared `SettingsPopup` takes a `mode` prop; in hex chess mode, hide Sternhalma-specific settings (rotate board, corridor visualization, chain-jump animation speed) and expose only settings that apply. Sound, glass pieces, animate moves, show last moves, color/skin picker all shared.

**Replay list (`/replays`)** — extended to list both modes with a mode badge on each row, routing to the correct viewer.

**Global keyboard shortcuts** (`GlobalShortcuts.tsx`) — extend to work in hex chess routes for shortcuts that make sense (Esc to deselect).

**Static "How to play" modal** accessible from setup and settings popup: piece movement diagrams, promotion explanation, en passant explanation, win condition. No interactive walkthrough in v1.

## Persistence

`hexchess-game-{id}` — one JSON blob per game:

```ts
interface SavedHexChessGame {
  schemaVersion: 1;
  mode: 'hexchess';
  id: string;
  createdAt: number;
  updatedAt: number;
  config: HexChessConfig;
  state: HexChessState;                                    // current live state (positionHashes is a Record, so JSON-clean)
  moveHistory: HexMove[];
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}
```

`hexchess-saved-games` — index of `{ id, createdAt, updatedAt, players, result, mode: 'hexchess' }` entries. Same 20-cap / oldest-evicted policy.

Replay reconstruction: apply `moveHistory` from `config`-derived initial state, producing one `HexChessState` per move. Cleaner than Sternhalma's chain-jump merging because chess has no pending-confirmation state.

**Unified replay list.** Shared summary shape used by `/replays`:

```ts
interface SavedGameSummary {
  id: string;
  mode: 'sternhalma' | 'hexchess';
  createdAt: number;
  updatedAt: number;
  players: { color: PieceColor; name: string; isAI: boolean }[];
  result: null | { winnerLabel: string; reason: string };
}
```

`/replays` merges both indexes into a single time-sorted list and routes clicks to the correct viewer.

## Testing strategy

**Rules engine (`src/game/hexchess/*`):**

- **Perft-style tests.** For ~6 canonical positions (starting position, several tactical positions), assert the exact count of legal-move leaves at depth 1–3. Gold standard for chess move-generation correctness.
- **Piece movement unit tests** — one file per piece type covering blocked slides, capture-vs-move distinction, board-edge cases.
- **Check/mate tests** — hand-crafted positions asserting `isInCheck`, mate, stalemate, and pinned-piece move filtering.
- **Promotion tests** — Soldier landing on each of the 10 opponent-arm cells triggers `pendingPromotion` with all 4 options; each choice produces a valid new state.
- **En passant tests.**
  - Soldier: narrow-window geometry works from valid B positions, unavailable from invalid ones, expires after one turn.
  - Pawn: classical en passant plus double-step retention on any pawn-starting cell.
- **Draw tests** — threefold repetition via Zobrist counting; insufficient material for K-vs-K, K+B-vs-K, K+N-vs-K, K+B-vs-K+B on same hex color.

**AI (`src/game/ai/hexchess/*`):**

- **Tactical puzzle suite** — ~30 hand-crafted positions with a single known-best move. At each difficulty, engine must find the correct move. Runs in CI at a fixed budget.
- **Perft correctness** for any duplicated pseudo-move generation in search.
- No engine strength regression tests in v1; eval tunes iteratively based on play testing.

**Store & UI:**

- Store tests for `hexChessStore` — createGame, selectPiece, makeMove (legal + illegal), confirmPromotion, resign, loadGame.
- BoardView selector snapshot tests for both `gameStore` and `hexChessStore` on canonical positions.
- Component tests for `PromotionPicker`, chess piece icon rendering, capture animation trigger.

## Implementation phasing

Sequenced to keep risk low; Sternhalma remains stable throughout.

1. **Rendering refactor.** Extract `BoardView` prop shape. Rewire `Board.tsx`, `BoardCell.tsx`, `Piece.tsx` to consume props. `gameStore` gains `selectBoardView()`. Landmark: Sternhalma passes all existing tests through the new interface.
2. **Hex chess coordinates & starting position.** Define arm axis, forward direction per player, starting layout constant. No move generation yet.
3. **Move generation piece-by-piece.** Rook → Bishop → Queen → King → Knight → Soldier → Pawn. Perft tests at each step.
4. **Check, checkmate, stalemate, draws.** Includes Zobrist.
5. **Promotion + en passant** (soldier and pawn).
6. **`hexChessStore` + save/load/replay.**
7. **UI: piece icons, promotion picker, capture animation, check ring, sound additions.**
8. **Setup UI: play lobby restructure with game mode selector.**
9. **Routes: `/hexchess/[id]`, `/hexchess/replay/[id]`.**
10. **AI: eval + search + worker + `useHexChessAITurn`.**
11. **Testing pass: perft, tactical puzzles, integration flow.**
12. **Static "How to play" modal.**

Each step is independently reviewable and doesn't break Sternhalma. No feature flag — the code doesn't destabilize existing paths.

## File inventory

**New files:**

```
src/game/hexchess/
  state.ts            piece types, HexChessState, HexPiece
  setup.ts            createInitialState(config)
  moves.ts            pseudo + legal move generation, applyMove
  check.ts            isCellAttacked, isInCheck, mate/stalemate detection
  promotion.ts        promotion detection and application
  enPassant.ts        soldier + pawn en passant tracking
  draws.ts            repetition, insufficient material
  zobrist.ts          hash tables and incremental hashing
  index.ts            public API surface
src/game/ai/hexchess/
  evaluate.ts         material + PST + mobility + king safety + soldier structure
  search.ts           iterative-deepening alpha-beta with quiescence
  moveOrdering.ts     MVV-LVA, killers, history
  transposition.ts    TT keyed on Zobrist
  worker.ts           postMessage entry
  workerClient.ts     main-thread wrapper
  index.ts
src/store/
  hexChessStore.ts    Zustand store
src/hooks/
  useHexChessAITurn.ts
src/components/board/pieceIcons/
  King.tsx  Queen.tsx  Rook.tsx  Bishop.tsx  Knight.tsx  index.ts
src/components/hexchess/
  PromotionPicker.tsx
  HexGameContainer.tsx
  HexTurnIndicator.tsx
  HexMoveIndicator.tsx
  HexGameOverDialog.tsx
  HowToPlayHexChess.tsx
src/app/hexchess/
  [id]/page.tsx       live game
  replay/[id]/page.tsx
src/types/
  hexchess.ts         shared types
tests/game/hexchess/
  perft.test.ts  moves.test.ts  check.test.ts  promotion.test.ts
  enPassant.test.ts  draws.test.ts  zobrist.test.ts
tests/game/ai/hexchess/
  evaluate.test.ts  tacticalPuzzles.test.ts
tests/store/
  hexChessStore.test.ts
```

**Touched (refactor only, no behavior change to Sternhalma):**

```
src/components/board/Board.tsx        BoardView-prop-driven
src/components/board/BoardCell.tsx    optional promotion-zone shimmer via prop
src/components/board/Piece.tsx        optional pieceType icon overlay
src/store/gameStore.ts                add selectBoardView()
src/app/play/page.tsx                 game-mode selector + section reordering; rename gameMode→pieceVariant
src/app/replays/page.tsx              merge saved-game indexes across modes
src/components/SettingsPopup.tsx      mode prop filters visible options
src/game/persistence.ts               shared summary shape
src/components/GlobalShortcuts.tsx    extend to hexchess routes
```

Estimated ~30 new files + ~9 touched.

## Explicitly deferred (follow-up specs)

- Editor support for chess pieces / custom hex chess layouts.
- 3–6 player + team hex chess.
- Interactive tutorial.
- Opening book / engine dropdown.
- Puzzle / endgame training modes for hex chess.
- Online multiplayer for hex chess.
- Rating system for hex chess.
