# Online Hex Chess + End-Game Parity — Design

Date: 2026-07-18
Status: Approved design, pending implementation plan

## Goal

1. Hex chess is playable in online games with full parity to the local play page:
   the online lobby offers the same game-type toggle, boards (Traditional +
   custom hex chess layouts), player counts, colors, and AI options.
2. Hex chess games (local and online) end with the same options Sternhalma has:
   Play Again, Watch Replay, Review Game, New Game — plus Rematch in online games.

## Non-goals

- Server-side move validation (online play keeps the existing trust-the-client
  relay model used for Sternhalma).
- Engine-eval-per-move analysis in the review page (Sternhalma review is a
  manual flagging tool; hex chess review matches that).
- Spectators, clocks/time controls, matchmaking.

## Part 1 — Backend (Convex)

### `onlineGames` schema

- Add `gameType: v.optional(v.union(v.literal('sternhalma'), v.literal('hexchess')))`.
  Absent = `'sternhalma'` (all existing rows keep working).
- No other schema changes: `customLayout`, `turns`, `players`, `winner`,
  `finishedPlayers` are already `v.any()`/generic.

### `setGameType` mutation (new, host-only, lobby-only)

Switching type resets what doesn't carry over:
- `selectedLayoutId → undefined` (hex chess default = built-in Traditional board;
  sternhalma default = standard board).
- `gameMode → 'normal'`, `teamMode → false` (sternhalma-only settings).
- All human `isReady → false`.
- Player colors: on switch to hexchess, any color outside the plain set
  (`COLOR_DISPLAY_ORDER` + `NEUTRAL_COLORS`, same rule as the play page's
  `isHexChessColor`) resets to its slot default; for a 2-player lobby the host
  gets white `#ffffff` and slot 1 gets black `#1a1a1a` when their colors are
  still slot defaults. Switching back to sternhalma keeps current colors.

### Board resolution (`resolveGameStart`)

- Hex chess + `selectedLayoutId == null` → nothing stored; clients use
  `TRADITIONAL_HEX_LAYOUT` from the bundle (mirrors how "standard" works today).
  The server never needs hex chess rules or the Traditional layout.
- Hex chess + custom layout → snapshot the full `boardLayouts` row into
  `customLayout`, now including the hex fields (see layout sync below).

### Layout cloud sync fix (`boardLayouts` + `layouts.ts` + `getLobbyBoards`)

Today `saveLayout`/`updateLayout`/`listLayouts` and `getLobbyBoards` only carry
`cells/startingPositions/goalPositions/walls`, silently stripping hex chess
fields — custom hex boards do not round-trip through cloud sync (pre-existing
bug). Fix by carrying the remaining `BoardLayout` fields as optional `v.any()`
passthroughs on the table and through all four functions:

- `gameMode`, `hexPieces`, `promotionPositions`, `promotionOptions`,
  `rotated30`, `defaultColors`, `playerCountConfig`, `pieceSpecialties`,
  `powerups`, `puzzleGoalMoves`.

`getLobbyBoards` also returns `gameMode` so the lobby can filter boards by the
lobby's game type, and computes `playerCounts` for hex boards from the armies
present in `hexPieces` (seats), not `startingPositions`.

### `submitTurn` generalization

Hex chess turns reuse the existing `turns` array and mutation with new optional
args (ignored for sternhalma):

- `moves`: for hexchess, a single serialized move
  `{ pieceId, from, to, promotion }` (coord keys), or `{ resign: true }`.
- `nextPlayerIndex: v.optional(v.number())` — client-computed next seat
  (hexchess skips eliminated seats; server can't know without rules).
  When provided, the server uses it instead of its own advance logic.
- `result: v.optional(v.any())` — client-computed
  `{ winner: seat | 'draw', reason }` when the game ended; server sets
  `status: 'finished'` and `winner` from it.

Turn-order auth is unchanged: current human player, or host for AI seats.
Exception: a `{ resign: true }` turn is accepted from any living participant
(or the host for an AI seat), not just the seat to move; the resigner's slot
index is recorded as the turn's `playerIndex`.

### Rematch

`acceptRematch` copies `gameType` (plus the existing `customLayout` /
`selectedLayoutId`). For hexchess, keep the same player order (no
finish-placement reordering — that's a Sternhalma concept).

## Part 2 — Lobby page (`/lobby/[id]`)

Mirrors the play page's hex chess behavior:

- Host-only **Game** toggle (Sternhalma | Hex Chess) at the top of Game Setup,
  calling `setGameType`.
- When hexchess:
  - Hide the game-mode row (normal/turbo/ghost/big) and team-mode checkbox.
  - Board picker lists "Traditional Hex Chess" (the `null` layout option)
    plus lobby members' custom layouts filtered to `gameMode === 'hexchess'`;
    sternhalma lobbies filter those out. Hex boards are validated client-side
    (snapshot builds + has armies) the same way the play page does.
  - Player-count buttons limited to counts supported by the selected board
    (Traditional: 2/3/4/6; custom: derived from `hexSeatsOfSnapshot`).
  - Color picker shows only the plain rows (player colors + neutrals);
    metallic/gem/flower/egg rows hidden. Favorite-color auto-select skipped
    when the favorite is not a hex chess color (same as commit 709ea004).
  - AI settings show difficulty only (easy/medium/hard); no personality.
    Slot `aiConfig` stores `{ difficulty }` for hexchess slots.

## Part 3 — Online hex chess game (`/online/[id]`)

The page branches on `onlineGame.gameType`: existing content for sternhalma,
new `OnlineHexChessContent` for hexchess, reusing the local hexchess components
(`Board` via `selectHexChessBoardView`, `HexTurnIndicator`, `PromotionPicker`,
pre-move UI, resign button).

### `useOnlineHexChess(gameId)` hook (mirrors `useOnlineGame`)

- **Config**: built from lobby data — seats from `ACTIVE_PLAYERS[playerCount]`
  (or the custom snapshot's seats), per-seat `{ name: username|'AI', color }`,
  `ai` map from AI slots, layout snapshot from `customLayout` or
  `TRADITIONAL_HEX_LAYOUT`. `config.id = <convex gameId>`.
- **Reconstruction**: `createInitialState(config)`, then replay each turn:
  a move turn is matched against `legalMoves(state)` by `pieceId` + `to`
  (+ `promotion` applied via `confirmPromotion`); a resign turn applies the
  2p-resignation / `eliminatePlayer` logic from the store's `resign`.
  Result state is pushed into `hexChessStore` via `loadGame`-style atomic set,
  preserving `lastMove` for highlights and triggering the capture/opponent-move
  animation only for opponent turns after initial load (same pattern as
  `useOnlineGame`).
- **Submission**: watch the store for a completed local move (after promotion
  choice if pending); serialize and `submitTurn` with `nextPlayerIndex` from
  the post-move state's `currentPlayer` and `result` when `state.result` is
  set. Submission lock identical to sternhalma's (`isSubmitting`).
- **AI**: host's client gates `useHexChessAITurn` on
  `isHost && current seat is AI`; the AI's move flows through the same store →
  submit path.
- **Interaction gating**: board interactive only on your turn (or host during
  AI turns is *not* interactive — AI moves itself); pre-move planning allowed
  off-turn, firing on turn start via `useHexChessPreMoveFiring`.
- **Resign**: button visible to living participants at any time; calls
  `submitTurn` with `{ resign: true }`.
- **Persistence**: on finish, the reconstructed game saves via
  `saveHexChessGame` on every participant's client (enables replay/review).

## Part 4 — End-game options

### Local hex chess (`HexGameOverDialog`)

Keep the compact top-banner style (final position stays visible). Buttons:

- **Play Again** — new game, same `HexChessConfig` (board, seats, colors, AI)
  with a fresh id; replaces current game in the store, navigates to the new id.
- **Watch Replay** — `/hexchess/replay/[id]` (already exists).
- **Review Game** — `/hexchess/review/[id]` (new, below).
- **New Game** — `/play`.

### Online hex chess game-over dialog

Same compact banner style, with: **Rematch** (existing request/accept/decline flow, same
seats and order), **Review Game**, **Watch Replay**, **Back to Profile**.
Rematch redirect follows `rematchGameId` as today.

### Hex chess review page (`/hexchess/review/[id]`) — new

The `HexReplayContainer` stepper plus a flagging panel, matching the
Sternhalma review workflow:

- Flag any move; click-capture a suggested better move (from-cell → to-cell on
  the board); free-text note.
- A hex flag records: game id, move index, turn number, seat, difficulty (if AI),
  actual move (piece type, from, to, capture, promotion), suggested move,
  note, and a board-after snapshot of `cellKey → { player, type }` (piece
  identity matters in chess, unlike the Sternhalma snapshot).
- Export-as-text (clipboard) formats flags with the piece-typed board snapshot,
  for feeding into hex chess AI work.
- Storage: `aiReviewStore` gains a parallel `hexFlags: FlaggedHexMove[]` list
  (new type in `types/review.ts`), reusing the existing capture-mode state and
  persistence key.

## Testing

- Unit: hex turn serialize → replay round-trip (plain move, capture, promotion,
  en passant, double-step, resign in 2p and multiplayer, king-capture
  elimination, checkmate/stalemate result propagation).
- Unit: `setGameType` reset behavior (board/mode/ready/colors) and
  `submitTurn` hexchess args (nextPlayerIndex honored, resign auth,
  result → finished).
- Unit: layout sync round-trip preserves hex fields; `getLobbyBoards`
  playerCounts for hex boards.
- Unit: hex review flag add/export format.
- Browser: local Playwright + Firefox setup — lobby toggle, a 2p hexchess
  online game with one AI seat driven end-to-end, game-over buttons.

## Sequencing (for the implementation plan)

1. Layout sync passthrough fix (independent, fixes existing bug).
2. Backend: `gameType`, `setGameType`, `resolveGameStart`, `submitTurn`,
   rematch.
3. Lobby UI.
4. `useOnlineHexChess` + online game page branch.
5. End-game options: local dialog buttons + Play Again; review page + store;
   online game-over dialog with rematch.
