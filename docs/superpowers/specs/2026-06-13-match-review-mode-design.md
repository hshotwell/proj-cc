# Match Review Mode — Design Spec

**Date:** 2026-06-13  
**Status:** Approved for implementation

## Overview

Replace the live-game training panel with a post-game match review mode. After a game ends (or from the replays list), the user enters a dedicated review page where they can freely scrub through every move, flag questionable ones, suggest better alternatives by clicking the board, and add written reasoning. Exported flags feed back into AI improvement.

## Entry Points

Two ways to enter a review session:

1. **Game-over dialog** — a "Review Game" button added alongside the existing "Watch Replay" button. Routes to `/review/[id]`.
2. **Replays list** (`/replays`) — each saved game card gets a "Review" button next to the existing "Watch" button.

Both navigate to `/review/[gameId]`. The page loads the saved game via `replayStore.loadReplay(gameId)` and starts at move 0.

## Route

`/review/[id]` — new App Router page, parallel to `/replay/[id]`.

## Layout

### Desktop (≥ lg breakpoint)

Three-column layout:

```
┌─────────────────────────────────────────────────────┐
│  ← Home                                             │
├──────────────────┬────────────────┬─────────────────┤
│                  │  Move History  │  Review Panel   │
│                  │  ──────────── │  ─────────────  │
│     Board        │  1. P1 (0,1)→  │  [flag form or  │
│   (flex-1)       │  2. P2 (3,2)→  │   flag list]    │
│                  │  3. ⚑ P1 ...  │                  │
│                  │  4. P2 (1,4)→  │                  │
│                  │  (scrollable)  │                  │
├──────────────────┴────────────────┴─────────────────┤
│  |<   <   Move 4 of 32   [========]   >   >|        │
└─────────────────────────────────────────────────────┘
```

- **Board column** (`flex-1`): SVG board in a white card. Shows the board state after the selected move with last-move highlight arrows. When in suggestion-capture mode, receives cell clicks.
- **Move history column** (`w-56`): Scrollable list of all moves. Each row: turn index, player color swatch, coords (`from → to`), jump/swap badge, small flag button. Flagged rows display a red ⚑. Clicking a row calls `goToStep(index + 1)` and auto-scrolls current into view.
- **Review panel column** (`w-72`): Context-dependent — shows the annotation form when a flag is being created/edited, otherwise shows the saved flag list for this game with edit/remove/export controls.
- **Bottom bar**: `|< < Move N of M [scrubber] > >|` with keyboard arrow support. `ReviewContainer` renders its own bottom bar (not `ReplayControls` directly) so the close button can read "Close Review" and route to `/replays` rather than the replay viewer's default.

### Mobile (< lg)

- Board on top (full width).
- Tab strip below: **Moves** | **Review**.
- "Moves" tab shows the move list; "Review" tab shows the annotation panel.
- Scrubber bar pinned to the bottom of the screen.

## Flagging Flow

1. User navigates to any move (click in list, arrow keys, scrubber).
2. Clicks the flag button (⚑) on a move row in the history list.
3. The Review Panel switches to the **annotation form**:
   - Header: turn number, player color swatch, actual move coords.
   - **Suggested move**: "Select piece…" button → click board for `from` coord → click board for `to` coord (same two-step capture UX as the existing training panel). Captured coords display as `(q,r) → (q,r)` with a clear button.
   - **Note/reasoning**: textarea, placeholder "What should have happened and why?"
   - **Save flag** (red) and **Cancel** buttons.
4. On save:
   - Flag is written to `aiReviewStore.addFlag(...)` with the current `gameId`.
   - The move row in the history list shows a red ⚑.
   - The Review Panel returns to the flag list view.
5. Clicking an existing flag in the flag list:
   - Navigates to that move (`goToStep`).
   - Re-opens the annotation form in edit mode (pre-fills coords and note).

## Data & State

### `replayStore` — no changes

Used as-is for navigation: `loadReplay`, `stepForward`, `stepBackward`, `goToStep`, `states`, `moves`, `currentStep`.

The board receives `displayState` from `replayStore` (same as the regular replay viewer).

### `aiReviewStore` — minor changes

- Add `activeGameId: string | null` field — set when the review page mounts, cleared on unmount. Used to scope the flag list to the current game.
- Add `setActiveGameId(id: string | null)` action.
- Add `updateFlag(id: string, patch: Partial<Pick<FlaggedMove, 'suggestedMove' | 'note'>>)` action — used when editing an existing flag.
- Computed display list: `flags.filter(f => f.gameId === activeGameId)` — no restructuring of the flat array needed.
- `captureMode` / `captureFrom` / `captureTo` fields reused as-is for the suggestion-capture flow.
- `exportText()` accepts an optional `gameId` parameter; when provided, filters the output to flags matching that game. The Review Panel passes `activeGameId`.

### `FlaggedMove` type — minor change

`difficulty` and `personality` become optional (`string | undefined`) since any player's move (human or AI) can now be flagged. AI moves will still populate these from `gameState.aiPlayers`; human moves will leave them undefined.

```ts
export interface FlaggedMove {
  id: string;
  gameId: string | null;
  turnNumber: number;
  player: PlayerIndex;
  difficulty?: string;       // was required
  personality?: string;      // was required
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: BoardSnapshot;
  timestamp: number;
}
```

### Board interaction in capture mode

When `captureMode !== null`, the board's `onCellClick` prop is wired to `aiReviewStore.captureCell`. The selected `from` coord is highlighted via `highlightCoord`. This is identical to the existing `TrainingMatchContainer` pattern.

## Files

### New

| File | Purpose |
|------|---------|
| `src/app/review/[id]/page.tsx` | App Router page — loads replay, renders `ReviewContainer` |
| `src/components/review/ReviewContainer.tsx` | Three-column layout shell, bottom bar, mobile tabs |
| `src/components/review/ReviewMoveHistory.tsx` | Move list with per-row flag buttons; extends `ReplayMoveEntry` pattern |
| `src/components/review/ReviewPanel.tsx` | Right panel — flag form (create/edit) and flag list |

### Modified

| File | Change |
|------|--------|
| `src/types/review.ts` | Make `difficulty` and `personality` optional |
| `src/store/aiReviewStore.ts` | Add `activeGameId`, `setActiveGameId`; filter computed list by gameId |
| `src/components/game/GameOverDialog.tsx` | Add "Review Game" button |
| `src/app/replays/page.tsx` | Add "Review" button to each saved game card |

## What Happens to the Existing Training Mode

The live-game `TrainingMatchContainer` / `TrainingPanel` and the `aiReviewStore` flagging machinery remain in place for now. The "Training Mode" toggle on the play page still works. Once the review mode proves out, the live training panel can be simplified or removed in a follow-up — that's out of scope here.

## Export

The "Export" button in the Review Panel calls `aiReviewStore.exportText(activeGameId)`, which filters output to flags for the current game only. Format is unchanged from today (text/clipboard).
