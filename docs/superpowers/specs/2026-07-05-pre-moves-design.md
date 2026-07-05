# Pre-Moves Feature — Design

Date: 2026-07-05
Status: Approved (pending final review)

## Summary

Add a "Pre-moves" gameplay option that lets a player queue up to 6 planned turns while it's not their turn. Each pre-move names one origin piece and one final destination. When the player's turn arrives, the first queued pre-move fires as a single legal turn if a valid step/chain-jump path exists on the actual board; otherwise the whole queue is cleared and the player moves manually. Pre-moves respect the auto-confirm setting, so with auto-confirm off, each fired pre-move waits for Confirm/Undo before the next one runs.

Primary motivation: reduce dead time during opponent turns in online multiplayer and against AI, letting the player plan ahead instead of waiting.

## Terminology

- **Local user** — the human on this device. In online games, the player index they own. In local vs-AI games, the single human player.
- **Local user's turn** — `gameState.currentPlayer === localPlayer`.
- **Virtual board** — the board state derived from `gameState.board` after applying every queued pre-move in FIFO order.
- **Pre-move** / **queued move** — a `{ from, to }` pair sitting in the queue, awaiting the local user's turn.
- **Fire** — execute a queued pre-move as an actual turn.

## Setting & availability

New toggle in `SettingsPopup.tsx` gameplay tab:
- Label: **Pre-moves**
- Description: on → *"Queue up to 6 moves while opponents take their turns"*; off → *"Play only when it's your turn"*
- Persisted in `settingsStore` as `preMoves: boolean`, default `true`
- Added to `partialize`, `getSyncableSettings`, and `SyncableSettings` type
- Added `togglePreMoves()` action

Availability rule — pre-move queueing UI is active when **all** hold:
1. `settingsStore.preMoves === true`
2. Game is not fully over
3. `gameState.currentPlayer !== localPlayer` (not the local user's turn)
4. Game mode qualifies:
   - **Online (`/online/[id]`):** always qualifies during opponent turns
   - **Local:** only if the game has exactly **one** human player (multi-human hotseat games do not enable pre-moves — would confuse who's queuing)
5. The local user has not finished (all-pieces-in-goal completes their game)

Pre-move queueing is **allowed during animation**. As soon as the opponent's move confirms and turn advances, the local user can start planning even while the opponent's piece is still animating. The queueing UI does not block on `animatingPiece`.

Pre-move **firing** still waits for animation to complete before starting the first queued sequence.

Derived value: `preMovesAllowed: boolean` computed in `GameContainer.tsx` (offline) and `/app/online/[id]/page.tsx` (online) and passed into `Board.tsx`.

## Data model

New state in `gameStore`:

```ts
interface QueuedMove {
  from: CubeCoord;  // origin on the virtual board
  to: CubeCoord;    // final destination the local user picked
}

// gameStore additions
preMoves: QueuedMove[];               // FIFO, max length 6
preMoveSelectedFrom: CubeCoord | null; // piece picked, waiting for destination
```

**Virtual board** — derived, not stored. Selector `getVirtualBoard()` in `gameStore`:
```ts
function getVirtualBoard(): Map<string, BoardCell> {
  let board = new Map(gameState.board);
  for (const pm of preMoves) {
    const piece = board.get(coordKey(pm.from));
    if (!piece || piece.type !== 'piece') continue; // defensive
    board.set(coordKey(pm.from), { type: 'empty' });
    board.set(coordKey(pm.to), piece);
  }
  return board;
}
```

Because queued moves apply in FIFO order, the "vacate a spot with an earlier pre-move so a later pre-move can land there" pattern the user described just works — the earlier pre-move already emptied the origin cell on the virtual board.

**No queue-time legality check** other than:
- `from` must contain the local user's piece on the virtual board
- `to` must be a cell on the board and must not be a wall on the virtual board

Empty cells and opponent pieces are both permitted destinations (opponent pieces represent "I bet they'll move that piece"). Full step/chain-jump legality is verified only at fire time.

## Click routing

While `preMovesAllowed` is true, `Board.tsx` diverts cell/piece clicks into `handlePreMoveClick(coord)` instead of the normal `selectPiece`/`makeMove`/`clearSelection` flow.

**Left-click on a cell** (contents evaluated against the virtual board):

| Cell contents | `preMoveSelectedFrom` | Action |
|---|---|---|
| Local user's piece | none | Set `preMoveSelectedFrom = coord` (select origin) |
| Local user's piece, same coord as selection | selected | Cancel selection |
| Local user's piece, different coord | selected | Replace: set `preMoveSelectedFrom = coord` |
| Empty **or** opponent piece | selected | Queue `{ from: preMoveSelectedFrom, to: coord }`; clear selection; enforce cap of 6 |
| Empty or opponent piece | none | No-op |
| Wall (custom boards) | any | No-op |

**Right-click on a cell:**
- If that coord equals the `to` of some queued pre-move at index `i`, drop `preMoves[i..end]` (cancel that pre-move and every one after it).
- Otherwise: no-op.
- `event.preventDefault()` is called unconditionally in the Board's SVG-level context-menu handler so the browser context menu never appears over the board while pre-move mode is active.

**Click on empty SVG area (outside any cell):**
- If `preMoveSelectedFrom` is set → clear it.
- Otherwise no-op.
- Implemented in the SVG-level click handler using the same mechanism as the existing touch-forgiveness logic (`moveHandledRef` to detect whether a child cell handler already fired).

**Queue cap:** at 6 queued pre-moves, further destination clicks are silently ignored. The clear-all button is the only way to make room.

## Firing

New pathfinding helper in `src/game/pathfinding.ts`:

```ts
findMovePath(
  state: GameState,
  from: CubeCoord,
  to: CubeCoord,
  player: PlayerIndex
): Move[] | null
```

Returns the sequence of `Move` objects that get `from → to` in one legal turn, or `null`:
1. If `to` is a step-adjacent empty cell reachable in one step-move by `player` → return `[stepMove]`.
2. Otherwise BFS the jump graph starting from `from`. Neighbors: for each of the six directions, compute `getJumpDestination`; require the jumped-over cell to satisfy `canJumpOver(state, over, player)` and the landing cell to be empty. Track parent pointers so a reached target can be reconstructed into a sequence of jump `Move`s.
3. Return the shortest such sequence (BFS guarantee).
4. Steps and jumps never mix in a single turn, matching existing rules.
5. Returns `null` if neither path exists.

Notes:
- Reuses `getJumpDestination` from `coordinates.ts` and `canJumpOver` from `moves.ts`.
- Turbo-jump and ghost-jump variants are out of scope for v1 (they use special piece types on custom boards; if a piece has one of those variants the base BFS still finds normal jumps).

New hook `usePreMoveFiring()` mounted in `GameContainer.tsx` alongside `usePlayerOpening`. Its job:

Preconditions to fire: `preMovesAllowed || wasAllowedLastTick` (see reset below), `gameState.currentPlayer === localPlayer`, `!animatingPiece`, `!pendingConfirmation`, `preMoves.length > 0`, `!isGameFullyOver(gameState)`.

On satisfied preconditions:

1. `pm = preMoves[0]`; do **not** pop yet.
2. `path = findMovePath(gameState, pm.from, pm.to, localPlayer)`.
3. **Path is `null`** → set `preMoves = []` (clear whole queue). Do nothing else. Player moves manually.
4. **Path exists** → pop `preMoves[0]`:
   - Call `selectPiece(pm.from)`.
   - After a short delay (`50ms` like `usePlayerOpening`), call `makeMove(path[0].to, animateMoves)`.
   - For chain jumps (path.length > 1): after each `makeMove` resolves and animation finishes, feed the next `path[i].to` into `makeMove`. This reuses the existing chain-jump handling in `gameStore.makeMove`, which sets `pendingConfirmation: true` (or auto-confirms) after the last hop.
5. After the last hop lands:
   - **`autoConfirm === true`** — `makeMove`'s auto-confirm branch already advanced the turn. Since each pre-move is a full turn, the turn is now on the next player. The hook is idle until the turn comes back to the local user, at which point it pops the next pre-move.
   - **`autoConfirm === false`** — `pendingConfirmation` is now true; the existing `MoveConfirmation` bar shows. If the user clicks **Confirm** → `confirmMove` advances the turn (same idle-until-turn-returns behavior as auto-confirm). If the user clicks **Undo** → `undoLastMove` also clears the entire `preMoves` queue (see below).

Undo integration: `undoLastMove` always clears `preMoves` and `preMoveSelectedFrom`. Rationale: an undo implies the plan is no longer valid. Safe in the non-pre-move cases too, since when the queue is empty the clear is a no-op.

Guardrails:
- If a pre-move fires and immediately wins/ends the game, subsequent pre-moves are dropped in the game-end reset path (see Lifecycle).
- The hook only reads store state; it never subscribes to shared refs across renders in a way that could cause double-fires. It uses the same `turnSnapshot`/`playerSnapshot` guard pattern from `usePlayerOpening`.

## Interaction with `usePlayerOpening`

- Opening auto-confirm (phase 2 of `usePlayerOpening`) currently uses a 200ms auto-confirm timer regardless of the `autoConfirm` setting. **Change:** gate that timer on `useSettingsStore.getState().autoConfirm`. If auto-confirm is off, the opening move sits in `pendingConfirmation` and the player must Confirm/Undo before the turn ends. Matches the user's original spec.
- If both an opening move AND a pre-move queue exist for the same turn, the opening runs first. In practice they don't overlap: openings run in the earliest turns before the queue can accumulate for that player.

## Confirm / Undo during animation

Reading `gameStore.confirmMove` and `gameStore.undoLastMove`, both already clear `animatingPiece`/`animationPath`/`animationStep` and don't gate on animation state. The `MoveConfirmation.tsx` keyboard handler (`c`/`u`) also doesn't check animation. So confirming/undoing mid-animation should already work: the animation snaps to done, and the turn advances or restores.

Verification step during implementation: start dev server, make a move with animation on and auto-confirm off, click Confirm mid-animation and Undo mid-animation. If either misbehaves, patch the offender. Add Vitest coverage:

```ts
test('confirmMove clears animation state and advances turn even when animatingPiece is set', ...);
test('undoLastMove clears animation state and restores stateBeforeMove even when animatingPiece is set', ...);
```

No new UI is required — the existing confirmation bar is already rendered when `pendingConfirmation` is true regardless of animation.

## Visuals

Reuse existing styles. In `Board.tsx`:

**Queued pre-move origins** — each `preMoves[i].from`:
- The piece at that coord gets the same **"last piece moved" discoloration** already applied to `lastMoveInfo.origin`.
- If the same piece is queued for multiple pre-moves (vacate-and-chain), the final virtual position gets the discoloration (that's where the piece appears on the virtual board).

**Queued pre-move destinations** — each `preMoves[i].to`:
- The cell gets the same **valid-move-destination highlight** shown to the current player when picking a destination. Same ring color, same fill.
- Shown for every queued destination (up to 6 simultaneous rings).

**Currently selected pre-move piece** — `preMoveSelectedFrom`:
- Piece gets the same **selected-piece spinning highlight ring** as normal selection.
- No destination highlights around it (per user clarification — would collide visually with queued destinations).

**Board rotation:** highlights are attached to board coords; existing rotation logic keeps them visually consistent.

**Clear-pre-moves button** — new sibling of `MoveConfirmation` in `GameContainer.tsx`:
- Visible only when `preMovesAllowed && preMoves.length > 0`.
- Styled to match the existing Undo button: `px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 border-2` with the local user's color as border.
- Label: `Clear pre-moves`.
- On click: sets `preMoves = []` and `preMoveSelectedFrom = null`.
- Component: `src/components/game/ClearPreMovesButton.tsx`.

## Lifecycle & edge cases

Queue and selection reset triggers:
- `startGame`, `startGameFromLayout`, `resetGame`, `loadGame` — clear `preMoves` and `preMoveSelectedFrom`.
- Game fully over → clear on the same tick the terminal state is written.
- Local user finishes (all pieces in goal, before game fully over) → clear queue.
- `preMoves` setting toggled off mid-game → clear queue.
- Online mode: game document resets (rematch accepted → new gameId, abandon) → cleared via `loadGame` path.

Undo also clears queue (see Firing).

Right-click cancel drops tail: cancelling pre-move at index `i` drops `preMoves[i..end]`. This is symmetric with the intuition that later pre-moves depend on earlier ones.

Interaction with existing mechanics:
- AI worker (`useAITurn`) runs independently on AI turns; pre-move queueing does not touch it.
- Board rotation: unchanged; pre-move visuals are in board space.
- `showAllMoves` setting: no effect during pre-move planning (no destination highlights shown then).
- `showLastMoves` / `lastMoveInfo`: unchanged. When a pre-move fires and lands, `lastMoveInfo` is populated as usual — the piece then has both the "last-moved" ring and (if further pre-moves are queued for it) the "queued origin" discoloration. That's the same treatment.
- `canUndoConfirmedMove` (last-player-remaining case): unaffected. Pre-moves are only queueable during opponent turns, which does not happen during the last-player-remaining state.

Persistence:
- Queue is in-memory only. Not saved to localStorage. Not synced to Convex.
- Losing tab focus keeps the queue (Zustand store lives in the browser tab).
- Page reload drops the queue — acceptable for v1.

## Files touched

- `src/store/settingsStore.ts` — add `preMoves` setting, `togglePreMoves` action, extend `partialize` + `getSyncableSettings` + `SyncableSettings` type.
- `src/services/storage.ts` — extend `SyncableSettings` type to include `preMoves`.
- `src/store/gameStore.ts` — add `preMoves` / `preMoveSelectedFrom` state, actions (`selectPreMovePiece`, `queuePreMove`, `cancelPreMoveSelection`, `cancelPreMoveAt`, `clearAllPreMoves`), `getVirtualBoard` selector; extend reset paths; clear queue in `undoLastMove`.
- `src/components/SettingsPopup.tsx` — new `ToggleOption` in gameplay tab.
- `src/components/board/Board.tsx` — new `preMovesAllowed`/`localPlayer` props; new `handlePreMoveClick` diverting cell/piece clicks; new right-click handler with `preventDefault`; SVG-outside handler clearing `preMoveSelectedFrom`; visual overlays for queued origins/destinations and selected origin.
- `src/components/game/GameContainer.tsx` — compute `preMovesAllowed` and `localPlayer`; mount `usePreMoveFiring`; render `<ClearPreMovesButton />`.
- `src/components/game/ClearPreMovesButton.tsx` — new component.
- `src/hooks/usePreMoveFiring.ts` — new hook orchestrating fire.
- `src/hooks/usePlayerOpening.ts` — gate phase-2 auto-confirm on `autoConfirm` setting.
- `src/game/pathfinding.ts` — new `findMovePath` function.
- `src/app/online/[id]/page.tsx` — pass `preMovesAllowed` and `localPlayer` into `Board`; mount `usePreMoveFiring`; render `<ClearPreMovesButton />`.
- Tests:
  - `tests/game/pathfinding-findMovePath.test.ts` — step, single jump, chain jump, unreachable.
  - `tests/store/gameStore.preMoves.test.ts` — queue ordering, cap 6, right-click cancels tail, undo clears queue, replace-selection, virtual board vacate-and-reuse.
  - `tests/store/gameStore.animation.test.ts` — confirm during animation, undo during animation.
  - `tests/hooks/usePreMoveFiring.test.ts` — pops queue in order, halts on unreachable pre-move, respects auto-confirm.

## Out of scope for v1

- Online multiplayer: pre-moves ARE included in v1 (per user's clarification — this is the primary motivation).
- Persistence across page reload.
- Pre-move planning against AI moves that haven't been made yet (we operate on the virtual board of queued moves only; the opponent's actual moves are unknown).
- Visualizing pre-move order with badges or arrows — not needed; queued destinations use uniform highlight.
- Pre-moves in hotseat multi-human local games — deliberately disabled.
