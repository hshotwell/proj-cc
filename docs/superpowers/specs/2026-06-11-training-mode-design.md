# Training Mode Design

## Goal

Add a "Training Mode" toggle to the `/play` setup page. When enabled, AI vs AI games run inside a dedicated `TrainingMatchContainer` with a persistent side panel for pausing, rewinding, flagging suboptimal moves, and exporting annotations. Normal games are completely unaffected.

---

## Architecture

### Flag: `isTrainingMode` in `gameStore`

`gameStore` gains a single boolean `isTrainingMode` (default `false`). It is set by `startGame` / `startGameFromLayout` when the play page passes the flag, and cleared on reset. It is **not** persisted — refreshing a training game returns to normal mode.

The `/game/[id]` page reads `isTrainingMode` and renders either `GameContainer` (existing, unchanged) or `TrainingMatchContainer` (new).

### `reviewStore` retirement

The existing `src/store/reviewStore.ts` and `src/components/game/ReviewControls.tsx` / `FlagMoveModal.tsx` are deleted. `ReviewControls` is removed from `GameContainer`. The `FlaggedMove` / `BoardSnapshot` types in `src/types/review.ts` are kept.

### New store: `src/store/aiReviewStore.ts`

Owns all training-mode runtime state. **Not** persisted except `flags`.

```typescript
interface AIReviewStore {
  isPaused: boolean;
  stateHistory: GameState[];       // one snapshot per completed AI turn (pre-move state)
  pendingFlag: CapturedAIMove | null;   // move currently being annotated
  captureMode: null | 'from' | 'to';
  captureFrom: CubeCoord | null;
  flags: FlaggedMove[];            // persisted to localStorage

  togglePause: () => void;
  pushHistory: (state: GameState) => void;
  clearHistory: () => void;
  popHistory: () => GameState | null;
  setPendingFlag: (flag: CapturedAIMove | null) => void;
  startCapture: () => void;        // sets captureMode = 'from'
  captureCell: (coord: CubeCoord) => void;  // 'from' → stores coord, advances to 'to'; 'to' → completes
  cancelCapture: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  clearFlags: () => void;
  exportText: () => string;
}
```

`CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>` (same as before).

Persist: `{ flags }` only (via zustand `persist` + `partialize`).

---

## Play Page Changes

The `/play` setup page gets a "Training Mode" toggle (checkbox or small pill toggle) near the Start button. It is only enabled when at least one player is AI (training mode on a human-only game is meaningless — show it greyed out with a tooltip).

When the user starts the game with training mode on, the existing `startGame` / `startGameFromLayout` call receives `isTrainingMode: true`. The store sets the flag and routes to `/game/[id]` as normal.

---

## `/game/[id]` Page

```tsx
const isTrainingMode = useGameStore((s) => s.isTrainingMode);
return isTrainingMode ? <TrainingMatchContainer /> : <GameContainer />;
```

No other changes to the game page.

---

## `TrainingMatchContainer`

File: `src/components/training/TrainingMatchContainer.tsx`

Calls `useAITurn()`, `usePlayerOpening()`, `useLocalGameSync()`, and the new `useTrainingAITurn()` hook (see Pause Fix below).

**Layout:**

```
Desktop (md+):
┌──────────────────────┬───────────────┐
│  ← Home              │  TRAINING     │
│  [Board card]        │  PANEL        │
│  [MoveConfirmation]  │  (sidebar)    │
│  [TurnIndicator]     │               │
└──────────────────────┴───────────────┘

Mobile:
┌──────────────────────┐
│  ← Home              │
│  [Board card]        │
│  [MoveConfirmation]  │
│  [TurnIndicator]     │
│  [Training Panel ▼]  │  ← collapsible
└──────────────────────┘
```

Uses `md:grid md:grid-cols-[1fr_280px] md:gap-4` or similar. The panel is always rendered on desktop; on mobile it is collapsed by default with a toggle tab.

---

## `TrainingPanel`

File: `src/components/training/TrainingPanel.tsx`

Three zones stacked vertically inside a `bg-white rounded-lg shadow` card:

### Zone 1 — Controls

- **⏸ Pause / ▶ Resume** button (amber/gray, same styling as before)
- **← Back** button: rewinds one turn (disabled when `stateHistory` is empty)
- Turn counter: "Turn N" pulled from `gameState.turnNumber`

Clicking ← Back:
1. Calls `aiReviewStore.popHistory()` → returns previous `GameState`
2. If null (no history), does nothing
3. Otherwise: auto-pauses (`togglePause` if not already paused) and calls `useGameStore.setState({ gameState: prev, lastMoveInfo: null, selectedPiece: null, pendingConfirmation: false, animatingPiece: null, animationPath: null })`
4. Clears `pendingFlag` (the flaggable move is now stale)

### Zone 2 — Flag Zone

Appears when `pendingFlag` is not null (i.e., an AI move just completed).

Displays the captured move info (turn, player, move coords, pieces-in-goal) as read-only text.

**Suggested move capture**: a `[Click a piece to select]` / `[Now click destination]` prompt that activates `captureMode`. When in capture mode:
- `TrainingMatchContainer` passes `onCellClick={handleCaptureClick}` to `<Board />`
- `handleCaptureClick` calls `aiReviewStore.captureCell(coord)`
- First call (mode=`'from'`): stores coord, advances to `'to'`
- Second call (mode=`'to'`): stores the completed `suggestedMove` on the pending flag, exits capture mode
- The `captureFrom` coord is passed as a highlight to the board (see Board changes below)
- A **Cancel** link exits capture mode without storing coords

**Note field**: `<textarea>` for free-text annotation.

**Save flag** button: calls `addFlag({ ...pendingFlag, note, suggestedMove })`, clears `pendingFlag`.
**Dismiss** button: clears `pendingFlag` without saving.

### Zone 3 — Flag List

Shown when `flags.length > 0`:
- Compact one-line per flag: turn, player, coords, truncated note
- ✕ remove button per flag
- **⎘ Copy export** button (clipboard + new-tab fallback)
- **Clear all** button (confirm dialog)

---

## Board Changes

File: `src/components/board/Board.tsx`

Add one optional prop:

```typescript
onCellClick?: (coord: CubeCoord) => void;
```

In the existing `handleCellClick` and `handlePieceClick` functions, when `onCellClick` is provided, call it instead of `selectPiece`. The normal game selection logic is bypassed entirely.

Additionally, accept an optional `highlightCoord?: CubeCoord` prop. When provided, render that cell with the same "selected piece" highlight style. Used to show the captured `from` cell during suggestion capture.

---

## `gameStore` Changes

`startGame` and `startGameFromLayout` each gain an optional `isTrainingMode?: boolean` parameter. The flag is stored in the store (not in `GameState` — it's UI state, not game state). The store clears it on `resetGame`.

```typescript
isTrainingMode: boolean;  // new store field, default false
```

---

## Pause Fix

File: `src/hooks/useAITurn.ts`

Current gap: when the user pauses, the think timer may already be running. The worker response arrives and the AI executes a move before the pause takes effect.

Fix: add an optional `isPausedRef?: React.RefObject<boolean>` parameter to `useAITurn`. Inside `worker.onmessage`, after the existing stale-state guards, add:

```typescript
if (isPausedRef?.current) return;
```

This discards any result that arrives after the user paused.

`TrainingMatchContainer` creates a ref that mirrors `aiReviewStore.isPaused` (kept in sync via `useEffect`) and passes it to `useAITurn`. Normal `GameContainer` calls `useAITurn()` with no second argument — behaviour is unchanged. `useAITurn` gains no import dependency on any review store.

---

## Rewind

`aiReviewStore.stateHistory` is populated by a `useEffect` in `TrainingMatchContainer` that watches `isAITurn` (the boolean computed from `gameState.aiPlayers` and `currentPlayer`). When `isAITurn` becomes `true`, the current `gameState` is captured into a ref immediately — this is the state **before** the AI makes its move. When `turnNumber` subsequently advances (the move completed), that captured snapshot is pushed to `stateHistory`. `stateBeforeMove` in `gameStore` is not used here because it is cleared to `null` by `confirmMove` before `turnNumber` increments.

History is capped at 50 entries to avoid memory issues.

On rewind:
1. Auto-pause
2. Pop last entry from `stateHistory`  
3. Restore to `gameStore` via `setState`
4. Clear `pendingFlag`

The AI resumes from the restored state when the user clicks Resume.

---

## Cleanup

- Delete `src/store/reviewStore.ts`
- Delete `src/components/game/ReviewControls.tsx`
- Delete `src/components/game/FlagMoveModal.tsx`
- Remove `ReviewControls` import + usage from `GameContainer.tsx`
- Remove `useReviewStore` import from `useAITurn.ts`
- Keep `src/types/review.ts` (types still used by new store)

---

## File Map

| File | Action |
|---|---|
| `src/types/review.ts` | Keep (types unchanged) |
| `src/store/aiReviewStore.ts` | **Create** (replaces reviewStore) |
| `src/store/gameStore.ts` | **Modify** — add `isTrainingMode` flag |
| `src/components/board/Board.tsx` | **Modify** — add `onCellClick` + `highlightCoord` props |
| `src/hooks/useAITurn.ts` | **Modify** — add `isPausedRef` param for pause-discard |
| `src/components/training/TrainingMatchContainer.tsx` | **Create** |
| `src/components/training/TrainingPanel.tsx` | **Create** |
| `src/app/play/page.tsx` | **Modify** — add Training Mode toggle |
| `src/app/game/[id]/page.tsx` | **Modify** — conditional container render |
| `src/store/reviewStore.ts` | **Delete** |
| `src/components/game/ReviewControls.tsx` | **Delete** |
| `src/components/game/FlagMoveModal.tsx` | **Delete** |
| `src/components/game/GameContainer.tsx` | **Modify** — remove ReviewControls |

---

## Testing

- `aiReviewStore`: unit tests for `pushHistory`/`popHistory`, `captureCell` state machine, `exportText` format
- `Board.tsx`: snapshot/render test confirming `onCellClick` is called instead of `selectPiece` when provided
- Manual: toggle on play → AI vs AI game → pause → rewind → flag with click-capture → export
