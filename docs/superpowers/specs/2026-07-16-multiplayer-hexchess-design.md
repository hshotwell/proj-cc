# Multiplayer Hex Chess (3/4/6 Players) — Design

Date: 2026-07-16
Status: Approved by Henry (conversation), pending spec review

## Summary

Extend hex chess from 2 players to 3, 4, and 6 players on the same 121-cell star,
using the same corner assignments, turn order, and default colors as Chinese
Checkers. Multiplayer games use **king-capture rules** instead of checkmate:
check is advisory only, and a player is eliminated when another player actually
captures their king. Eliminated armies stay on the board as immobile dull-grey
obstacles that anyone may capture. Last player standing wins. AI opponents are
supported at launch via a Max^n search for 3+ players.

2-player hex chess is unchanged: same checkmate/stalemate rules, same
white/black defaults, same alpha-beta AI.

## Rules

### Seats, corners, colors, turn order

- Player indices, home triangles, clockwise turn order, and per-count seat sets
  reuse Chinese Checkers exactly (`ACTIVE_PLAYERS` in `src/game/constants.ts`):
  - 2 → [0, 2] (existing hexchess seats; unchanged)
  - 3 → [0, 3, 1] (Red, Green, Blue)
  - 4 → [4, 3, 1, 5] (Yellow, Green, Blue, Purple)
  - 6 → [0, 4, 3, 2, 1, 5] (all, clockwise)
- Default colors for 3+ hexchess are the CC defaults (Red/Blue/Cyan/Green/
  Yellow/Purple per seat); players can change them in setup like CC. 2-player
  hexchess keeps its white/black defaults (`HEX_CHESS_DEFAULT_COLORS`).
- Each seat gets the same V1 army layout (king at apex, 2 rooks, 3 bishops,
  knight/peon/peon/knight, 3 peons in the extension row) placed in its own
  corner.

### Geometry generalization

- Current player-0 geometry (arm at triangle 0, apex `{4,-8}`) is the canonical
  form. Every other seat's arm cells, extension cells, forward diagonal, and
  promotion zone are produced by rotating the canonical form by k clockwise
  60° steps, where the cube rotation is `R(q,r,s) = (-r,-s,-q)` and
  k per triangle is: tri0→0, tri4→1, tri3→2, tri2→3, tri1→4, tri5→5.
  (Verified: `R^3` maps apex `{4,-8}` to `{-4,8}`, the current player-1 apex.)
- `forwardDiagonal(player)` = rotation of the current player-0 forward diagonal
  `(-1,2)` by that seat's k. `forwardEdges` derives from it as today.
- **Promotion zone** ("far half"): a cell is a promotion cell for seat p iff
  rotating it by the inverse of p's rotation yields `r >= 1` — the exact
  2-player rule, rotated. Existing 2-player zones are reproduced identically.

### King-capture mode (3+ players only)

- **Check is advisory.** No legality filtering against self-check: all
  pseudo-legal moves are legal, including moving your king into an attacked
  cell and ignoring an existing check. Check highlighting stays: any living
  king currently attacked by a living player's piece is highlighted, and only
  living pieces count as attackers.
- **Elimination.** When a move captures a king, that king's owner is
  eliminated immediately: appended to `eliminated` (order preserved), skipped
  in turn order forever. Their remaining pieces stay on the board:
  - rendered in a fixed dull grey (single grey for all eliminated armies),
  - never move,
  - give no check threats,
  - block sliding pieces and occupy cells exactly like live pieces (knights
    leap over anything, as they already do),
  - are capturable by any living player (they count as enemies to everyone).
- **Win.** When only one living player remains, they win
  (`reason: 'king-capture'`, a new `HexEndReason`). Finish order = reverse
  elimination order.
- **Draws.** Threefold repetition of the full position still ends the game as
  a draw among the surviving players (safety valve against endless shuffling,
  especially between AIs). Checkmate, stalemate, and insufficient-material
  detection are disabled in multiplayer — since moving into check is legal, a
  player always has a move in practice.
- **En passant** rules are unchanged (peon slide-past + pawn double-step).
  The EP window is one move (`availableUntilTurn = next turn number`), so in
  multiplayer only the immediately-next living player can capture en passant.
- **Pending promotion** still pauses the turn until resolved, same as today.

## Architecture

Generalize the existing `src/game/hexchess/` module in place (no fork).
`HexChessConfig` gains the seat list; a derived `rulesMode` distinguishes
`'checkmate'` (exactly 2 players) from `'king-capture'` (3+).

### Type/state changes (`state.ts`)

- `HexPlayerIndex` widens from `0 | 1` to `0 | 1 | 2 | 3 | 4 | 5`.
- `HexChessConfig.players` becomes an array of 2–6 seat configs, each carrying
  its CC player index (corner), color, name, and optional AI difficulty.
- `HexChessState` gains:
  - `activePlayers: HexPlayerIndex[]` (turn order, from `ACTIVE_PLAYERS`),
  - `eliminated: HexPlayerIndex[]` (in elimination order).
- `result.winner` stays `HexPlayerIndex | 'draw'`; new reason `'king-capture'`.

### Rules changes

- `board.ts`: `otherPlayer()` replaced by `nextLivingPlayer(state)` which walks
  `activePlayers` clockwise skipping `eliminated`. Helpers `isEliminated`,
  `livingPlayers`.
- `starting.ts`: canonical arm/extension/promotion geometry + `rotateCube` /
  per-seat k; `createInitialState` loops over the config's seats.
- `moves.ts`:
  - `applyMoveCore` advances to the next living player; on king capture,
    appends the victim to `eliminated` before computing the next player.
  - `applyMove` in king-capture mode: skip checkmate/stalemate/insufficient-
    material; detect last-standing win and threefold repetition only.
  - Move generation for an eliminated player's piece returns nothing;
    eliminated pieces are enemies to all in `isEnemy`.
- `check.ts`: `filterLegal` becomes a no-op (identity) in king-capture mode;
  `attackersOf(king)` only considers living players' pieces. `isInCheck`
  exported per player for UI highlighting.
- `zobrist.ts`: piece-player dimension widens to 6 and the side-to-move
  component covers all 6 seats; table sizes grow accordingly.
- `persistence.ts`: save format version bump. Seat indices are unified with
  CC player indices (0–5): 2-player hexchess uses seats [0, 2], matching the
  existing geometry (current player 1 sits at triangle 2's apex `{-4,8}`).
  v1 saves migrate on load by remapping player 1 → seat 2 in `player` fields,
  `currentPlayer`, and move history; piece id strings are opaque and stay
  unchanged. Old saves and replays must load and replay identically.

### AI (`src/game/ai/hexchess/`)

- 2 players: existing alpha-beta, untouched.
- 3+ players: **Max^n** search in the same worker. Each node the mover picks
  the child maximizing their own component of an N-vector evaluation.
  Evaluation reuses the existing material/position terms computed per living
  player; add a king-danger term (attackers on own king) since check is
  advisory and the search must be taught to defend/attack kings; capturing a
  king scores as an enormous material swing (eliminates the victim's whole
  vector component).
- Difficulty still maps to depth (easy=1, medium=2, hard=3 mover-rounds).
- Move ordering: captures first (king captures highest); transposition table
  keyed on the widened zobrist.

### UI

- `/play` setup, hexchess mode: player count picker (2/3/4/6), per-seat
  color swatches (CC defaults for 3+) and AI toggle + difficulty, mirroring
  the CC setup patterns. Skin rows stay hidden in hexchess mode.
- `Piece.tsx` hexchess branch: pieces of eliminated players render with a
  fixed dull grey fill (`#8a8a8a` family) regardless of the seat's color, in
  both simple and detailed (glass) modes.
- Check highlighting: every living king in check is highlighted (can be more
  than one at once).
- `HexTurnIndicator`: shows all seats in turn order, marks the current player,
  greys out eliminated seats with an "eliminated" state.
- `HexGameOverDialog`: multiplayer shows winner + finish order (reverse
  elimination order); 2-player display unchanged.
- Board rotation: hex chess already rotates to face the first human seat
  (and follows turns when the rotate-board setting is on); this generalizes
  via the shared `ROTATION_FOR_PLAYER` map since seats now equal CC corners.
- Replay (`HexReplayContainer`) handles N players, including grey rendering
  from the elimination move onward.
- Pre-move firing (`useHexChessPreMoveFiring`) keeps working: pre-moves are
  validated against pseudo-legal moves at fire time, same as now.

## Testing

- Geometry: rotated arms land exactly on the CC starting-position cell sets
  for all 6 triangles; forward diagonals point apex→center; rotated promotion
  zones match the existing 2-player zones for seats 0/2.
- Rules: king capture eliminates (turn skips, pieces frozen/grey-flagged,
  capturable, blocking); moving into check is legal in multiplayer and still
  illegal in 2-player; check detection ignores eliminated armies; last-
  standing win; threefold repetition draw; EP window = immediate next player;
  promotion pauses turn in multiplayer.
- AI: Max^n returns a legal move for 3/4/6 seats at each depth; prefers a free
  king capture over any other move; worker round-trips multiplayer states.
- Persistence/replay: v1 2-player saves load and replay identically;
  multiplayer games save/load/replay including eliminations.

## Out of scope

- Custom hexchess layouts / board editor integration.
- Teams or alliances.
- Rating/opening-book work for the multiplayer AI beyond Max^n + eval reuse.
