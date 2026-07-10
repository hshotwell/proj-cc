# Hex Chess Pre-Moves — Design

Date: 2026-07-10
Status: Approved (pending final review)

## Summary

Port the existing Chinese Checkers "pre-moves" feature (see
`2026-07-05-pre-moves-design.md`) to hex chess. A player queues up to 3 planned
moves while it isn't their turn; when their turn arrives, the first queued
move fires automatically if it's still legal on the real board, otherwise the
whole queue is dropped and the player moves manually.

Hex chess moves are atomic (no chain-jump / pending-confirmation phase like
Chinese Checkers), and hex chess pieces carry a stable `id` across moves and
promotions. Both of these make the hex chess port *simpler* than the
Chinese Checkers original: no virtual-board-of-coordinates reconstruction is
needed for firing (only for UI selection), and there's no auto-confirm /
pending-confirmation interaction to account for.

The one genuinely new wrinkle chess adds is promotion: a queued pre-move that
lands a soldier/pawn on the promotion zone must have its promotion choice
locked in before it can sit in the queue (see below).

## Terminology

- **Local user** — the human player, only defined when the hex chess game has
  exactly one human seat (`config.ai` has an entry for exactly one of the two
  players).
- **Virtual pieces** — `state.pieces` with each queued pre-move's effect
  applied in order (piece moved to its queued destination, any piece
  currently occupying that destination removed). Used only to resolve clicks
  during queueing — never used for firing legality.
- **Pre-move** / **queued move** — a `{ pieceId, to, promotion }` entry in the
  queue.
- **Fire** — execute a queued pre-move as a real turn via `attemptMove`.

## Setting & availability

Reuse the existing global `settingsStore.preMoves` boolean and
`togglePreMoves()` action — no new setting. Only the `SettingsPopup` copy
changes to be mode-aware:

- `mode === 'game'` (Chinese Checkers): *"Queue up to 6 moves while opponents
  take their turns"*
- `mode === 'hexchess'`: *"Queue up to 3 moves while your opponent thinks"*

Availability rule — pre-move queueing UI is active when **all** hold:
1. `settingsStore.preMoves === true`
2. `state.result === null` (game not over)
3. Exactly one side is human: `localPlayer` is defined, where
   `humanPlayers = [0, 1].filter(p => !config.ai?.[p])` and
   `localPlayer = humanPlayers.length === 1 ? humanPlayers[0] : undefined`
   (mirrors the Chinese Checkers "no hotseat pre-moves" rule; also
   correctly disables pre-moves for AI-vs-AI spectator games)
4. `state.currentPlayer !== localPlayer` (not the local user's turn)
5. `state.pendingPromotion === null` (a *real*, already-in-flight promotion
   always takes priority over pre-move UI)

Derived value `preMovesAllowed: boolean` computed in `HexGameContainer.tsx`.

Pre-move queueing is allowed at any time the above hold, including while the
opponent's last move is mid-animation (hex chess piece slides are pure
per-`Piece` RAF state, not store-driven, so there's nothing to block on).
Firing itself waits for `animatingCapture === null` (see Firing).

## Data model

New state in `hexChessStore`:

```ts
export interface QueuedHexPreMove {
  pieceId: string;
  to: CubeCoord;
  promotion: HexPieceType | null; // locked in at queue time if applicable
}

export const HEX_MAX_PRE_MOVES = 3;

// hexChessStore additions
preMoves: QueuedHexPreMove[];                 // FIFO, max length 3
preMoveSelectedPieceId: string | null;         // piece picked, awaiting destination
pendingPreMovePromotion: { pieceId: string; to: CubeCoord } | null; // promotion picker open, not yet queued
```

**Virtual pieces** — derived, not stored. `getVirtualPieces()`:

```ts
function getVirtualPieces(): HexPiece[] {
  const { state, preMoves } = get();
  if (!state) return [];
  let pieces = state.pieces.map(p => ({ ...p }));
  for (const pm of preMoves) {
    pieces = pieces
      .filter(p => !(cubeEquals(p.cell, pm.to) && p.id !== pm.pieceId)) // simulate capture
      .map(p => p.id === pm.pieceId ? { ...p, cell: pm.to } : p);
  }
  return pieces;
}
```

Used only to answer "what's virtually at this cell" when routing a click
during queueing (e.g. so queuing two moves for the same advancing soldier in
a row selects it from its post-first-pre-move square). Firing never consults
this — it always re-derives legality from the real `state.pieces`.

**No queue-time legality check**, matching Chinese Checkers, with one
exception: promotion detection (see below) needs to know if the piece is a
`soldier`/`pawn` and whether `to` is in `promotionCellsForPlayer(piece.player)`
— a plain set-membership check, independent of full move legality.

## Click routing

Lives entirely in `HexGameContainer.handleCellClick` (not `Board.tsx` — hex
chess already supplies its own `onCellClick`, which Board.tsx's Chinese
Checkers-specific pre-move code never sees). While `preMovesAllowed`:

| Click target (on virtual pieces) | `preMoveSelectedPieceId` | Action |
|---|---|---|
| Local user's piece | none | Select as origin |
| Same piece again | selected | Deselect |
| Different own piece | selected | Replace selection |
| Empty or opponent cell, piece is soldier/pawn, cell in that player's promotion zone | selected | Open `PromotionPicker` (`pendingPreMovePromotion = { pieceId, to }`); do not queue yet |
| Empty or opponent cell, otherwise | selected | Queue `{ pieceId, to, promotion: null }` (cap 3, silently ignored beyond) |
| Empty or opponent cell | none | No-op |

`PromotionPicker.onChoose(choice)` → push `{ pieceId, to, promotion: choice }`
onto `preMoves`, clear `pendingPreMovePromotion` and `preMoveSelectedPieceId`.
`PromotionPicker.onCancel` → clear `pendingPreMovePromotion` only, restoring
`preMoveSelectedPieceId` so the player can pick a different destination.

**Right-click on a cell:** if it equals the `to` of queued entry `i`, drop
`preMoves[i..end]` (`cancelPreMoveAt`). Otherwise no-op.

`Board.tsx` has no existing escape hatch for right-clicks (only `onCellClick`
bypasses its internal Chinese-Checkers-only logic) — its `onContextMenu`
handler is wired directly to its own `handlePreMoveRightClick`, gated on its
own `preMovesAllowed` prop, neither of which hex chess uses. This needs one
small additive change: a new optional `onCellRightClick?: (coord: CubeCoord)
=> void` prop on `BoardProps`, checked first in the `onContextMenu` handler
(same pattern as the existing `onCellClick` escape hatch) so it calls
`e.preventDefault()` and delegates instead of touching the Chinese Checkers
path at all.

**Queue cap:** 3. The clear-all button is the only way to make room short of
waiting for entries to fire or be invalidated.

## Firing

New hook `useHexChessPreMoveFiring(localPlayer, active)`, mounted in
`HexGameContainer.tsx` alongside `useHexChessAITurn()`.

Preconditions: `active`, `localPlayer` defined, `state` exists, `state.result
=== null`, `state.currentPlayer === localPlayer`, `state.pendingPromotion ===
null`, `animatingCapture === null`, not already firing (ref guard, same
pattern as `usePreMoveFiring`).

If `preMoves.length === 0`:
- If `preMoveSelectedPieceId` is still set (player queued a selection but no
  destination before their turn arrived), promote it into the real
  `selectedPieceId` via `store.selectPiece(id)` so they don't have to
  reselect. Guarded by the firing ref so this doesn't re-trigger on the
  re-render right after popping the queue.
- Otherwise no-op.

If `preMoves.length > 0`:
1. `pm = preMoves[0]`.
2. Recompute `legalMoves(state)` fresh against the **real** current state,
   filtered by `pieceId === pm.pieceId`.
3. If no entry matches `pm.to` → the position changed since queueing (the
   piece was captured, pinned, or the destination is no longer reachable) —
   clear the **entire** remaining queue (`preMoves = []`,
   `preMoveSelectedPieceId = null`) and stop. The player moves manually.
4. If a match is found → `store.selectPiece(pm.pieceId)` then
   `store.attemptMove(pm.to)`. `attemptMove` already resets
   `selectedPieceId`/`legalMoveTargets` to empty on completion (no extra
   cleanup needed, unlike Chinese Checkers). Pop `preMoves[0]` off the queue.
5. If the resulting `state.pendingPromotion !== null` → immediately
   `store.confirmPromotion(pm.promotion ?? 'queen')`. The `?? 'queen'`
   fallback should be unreachable in practice (promotion is always locked in
   at queue time per the click-routing rule above) but keeps the hook safe if
   that invariant is ever violated.

Only one pre-move fires per real turn — `attemptMove` flips `currentPlayer`
to the opponent, which makes the precondition `state.currentPlayer ===
localPlayer` false again until the opponent replies. No explicit "already
fired this turn" guard is needed beyond the existing ref (which exists purely
to avoid a double-fire within the same synchronous effect re-entry).

## Visuals

Two new `BoardHighlightKind` values: `'preMoveFrom'`, `'preMoveTo'`.

`selectHexChessBoardView` pushes, in addition to existing highlights:
- One `{ kind: 'preMoveFrom', cell }` per queued entry — cell is the piece's
  **virtual** position at the time that entry was queued (i.e. `pm.to` of the
  *previous* queued entry for the same piece if one exists, else its real
  current cell). In practice this is just: walk the queue in order, tracking
  a `pieceId -> cell` map seeded from real piece positions, and emit
  `preMoveFrom` at the current mapped cell for `pm.pieceId` before applying
  `pm.to` to the map.
- One `{ kind: 'preMoveTo', cell: pm.to }` per queued entry.
- If `preMoveSelectedPieceId` is set, `{ kind: 'preMoveFrom', cell }` at its
  virtual position (selection ring, no destination dots — there's no
  destination yet).

`Board.tsx` additions (purely additive — the Chinese-Checkers-only branches
of `Board.tsx` are untouched since hex chess always supplies `viewProp`):
- Add `'preMoveFrom'` and `'preMoveTo'` to the `newKindHighlights` filter in
  the existing highlight-rendering block (~line 1675).
- Add a `case 'preMoveFrom'` and `case 'preMoveTo'` to the same `switch`:
  dashed violet ring (`stroke="#8b5cf6"`, `strokeDasharray`) distinct from
  the existing green (legal-move), red (capture/check), and yellow
  (last-move) colors already in use.

**Clear pre-moves button** — new component
`src/components/hexchess/HexClearPreMovesButton.tsx` (not a reuse of the
Chinese-Checkers-coupled `ClearPreMovesButton.tsx`, which reads `useGameStore`
directly). Same visual treatment (bordered pill button, local player's color
border), reading `useHexChessStore` instead. Rendered in `HexGameContainer.tsx`
next to `HexMoveIndicator` when `preMovesAllowed && preMoves.length > 0`.

## Lifecycle & edge cases

Queue and selection reset triggers:
- `createGame`, `loadGame`, `clearGame` — clear `preMoves`,
  `preMoveSelectedPieceId`, `pendingPreMovePromotion`.
- `state.result` becomes non-null (game ends, including via a fired
  pre-move, or via `resign()`) — a small `useEffect` in `HexGameContainer`
  keyed on `state.result` clears `preMoves` / `preMoveSelectedPieceId` /
  `pendingPreMovePromotion` as soon as it goes non-null. (The firing hook's
  own precondition already prevents firing into a finished game regardless —
  this effect is purely so stale queued highlights don't linger visually
  over the game-over dialog.)
- `preMoves` setting toggled off mid-game → clear queue (small `useEffect` in
  `HexGameContainer`, mirroring `GameContainer`'s existing reset-on-toggle
  effect).

Right-click cancel drops tail (`preMoves[i..end]`), matching Chinese
Checkers — later entries may have been planned assuming the cancelled one's
piece placement.

Interaction with existing mechanics:
- `useHexChessAITurn` is unaffected — it only ever fires on AI seats, and
  pre-moves are only queueable/fireable for the local human seat.
- Board rotation, capture-burst particles, check highlighting: unaffected,
  all keyed off real `state`/`lastMove`, not the pre-move queue.
- Resignation while pre-moves are queued: `resign()` should also clear the
  queue (nothing to fire into a finished game).

Persistence: in-memory only, not saved via `saveHexChessGame`. Page reload
drops the queue — same as Chinese Checkers v1.

## Files touched

- `src/store/hexChessStore.ts` — add `preMoves` / `preMoveSelectedPieceId` /
  `pendingPreMovePromotion` state; actions `selectPreMovePiece`,
  `queuePreMove` (handles the promotion-detection branch),
  `confirmPreMovePromotion`, `cancelPreMoveSelection`, `cancelPreMoveAt`,
  `clearAllPreMoves`; `getVirtualPieces()` selector; extend `createGame` /
  `loadGame` / `clearGame` / `resign` reset paths; extend
  `selectHexChessBoardView` with `preMoveFrom`/`preMoveTo` highlights.
- `src/types/boardView.ts` — add `'preMoveFrom'` / `'preMoveTo'` to
  `BoardHighlightKind`.
- `src/components/board/Board.tsx` — additive highlight-rendering cases;
  new optional `onCellRightClick` prop on `BoardProps`, checked first in the
  `onContextMenu` handler (mirrors the existing `onCellClick` escape hatch).
- `src/components/hexchess/HexGameContainer.tsx` — compute `preMovesAllowed`
  / `localPlayer`; route premove clicks in `handleCellClick`; mount
  `useHexChessPreMoveFiring`; render the promotion picker for
  `pendingPreMovePromotion` (reusing `PromotionPicker`); render
  `<HexClearPreMovesButton />`; reset-on-toggle effect.
- `src/components/hexchess/HexClearPreMovesButton.tsx` — new component.
- `src/hooks/useHexChessPreMoveFiring.ts` — new hook.
- `src/components/SettingsPopup.tsx` — mode-aware "Pre-moves" description.
- Tests:
  - `tests/store/hexChessStore.preMoves.test.ts` — queue ordering, cap 3,
    right-click-equivalent (`cancelPreMoveAt`) drops tail,
    `clearAllPreMoves`, promotion-detection branch (queuing a soldier move
    into the promotion zone sets `pendingPreMovePromotion` instead of
    queuing directly), `getVirtualPieces` simulates capture and multi-hop
    reselection correctly.
  - `tests/hooks/useHexChessPreMoveFiring.test.ts` — fires in order, halts
    and clears the whole queue on an invalidated entry, auto-confirms a
    queued promotion choice, promotes a lingering selection into the real
    selection when the queue is empty.

## Out of scope for v1

- Persistence across page reload.
- Planning against opponent moves that haven't happened yet — the virtual
  pieces map only ever reflects the local player's own queued intentions.
- Any cap other than 3.
- Reusing/generalizing the Chinese Checkers `Board.tsx` pre-move click
  handlers or `ClearPreMovesButton.tsx` — kept as parallel, independent
  implementations to avoid touching working Chinese Checkers code paths.
