# AI Move Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game review mode where the user can pause AI vs AI games, flag suboptimal moves with notes and an optional suggested alternative, then export all flags as structured text for pasting into Claude for analysis.

**Architecture:** A `reviewStore` (Zustand + localStorage persist) holds pause state and accumulated flags. `ReviewControls` mounts inside `GameContainer` and watches `lastMoveInfo` to surface a "Flag" button after each AI move. `FlagMoveModal` captures the note and optional suggested move. `useAITurn` respects `isPaused`.

**Tech Stack:** Next.js App Router, React 19, Zustand (with persist middleware), Tailwind CSS 4, TypeScript strict

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/review.ts` | Create | `FlaggedMove` and `BoardSnapshot` types |
| `src/store/reviewStore.ts` | Create | Pause state, flags array, export logic; persisted to localStorage |
| `src/components/game/FlagMoveModal.tsx` | Create | Modal: note textarea + optional suggested-move coords + save/cancel |
| `src/components/game/ReviewControls.tsx` | Create | Pause button, "Flag last move" button, flags count + export button |
| `src/hooks/useAITurn.ts` | Modify | Check `isPaused` before firing AI think timer |
| `src/components/game/GameContainer.tsx` | Modify | Mount `<ReviewControls />` below `TurnIndicator` |

---

## Task 1: Types

**Files:**
- Create: `src/types/review.ts`

- [ ] **Write `src/types/review.ts`**

```typescript
import type { PlayerIndex } from './game';

export interface BoardSnapshot {
  pieces: Partial<Record<PlayerIndex, Array<{ q: number; r: number }>>>;
}

export interface FlaggedMove {
  id: string;
  gameId: string | null;
  turnNumber: number;
  player: PlayerIndex;
  difficulty: string;
  personality: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: BoardSnapshot;
  timestamp: number;
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: no output (clean).

- [ ] **Commit**

```bash
git add src/types/review.ts
git commit -m "feat: add FlaggedMove and BoardSnapshot types for AI review"
```

---

## Task 2: Review Store

**Files:**
- Create: `src/store/reviewStore.ts`

- [ ] **Write `src/store/reviewStore.ts`**

```typescript
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FlaggedMove } from '@/types/review';

interface ReviewStore {
  isPaused: boolean;
  flags: FlaggedMove[];
  togglePause: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  clearFlags: () => void;
  exportText: () => string;
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      isPaused: false,
      flags: [],

      togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

      addFlag: (flag) => {
        const entry: FlaggedMove = {
          ...flag,
          id: Math.random().toString(36).slice(2, 10),
          timestamp: Date.now(),
        };
        set((s) => ({ flags: [...s.flags, entry] }));
      },

      removeFlag: (id) =>
        set((s) => ({ flags: s.flags.filter((f) => f.id !== id) })),

      clearFlags: () => set({ flags: [] }),

      exportText: () => {
        const { flags } = get();
        if (flags.length === 0) return '(no flags recorded)';

        const lines: string[] = [
          '=== AI MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${flags.length}`,
          '',
        ];

        for (let i = 0; i < flags.length; i++) {
          const f = flags[i];
          const from = `(${f.actualMove.from.q},${f.actualMove.from.r})`;
          const to = `(${f.actualMove.to.q},${f.actualMove.to.r})`;
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Player ${f.player} | ${f.difficulty}/${f.personality} | ${f.piecesInGoal}/10 in goal`);
          lines.push(`Actual move:   ${from} → ${to}`);
          if (f.suggestedMove) {
            const sf = `(${f.suggestedMove.from.q},${f.suggestedMove.from.r})`;
            const st = `(${f.suggestedMove.to.q},${f.suggestedMove.to.r})`;
            lines.push(`Suggested:     ${sf} → ${st}`);
          }
          if (f.note) lines.push(`Note:          ${f.note}`);
          lines.push('Board after move:');
          for (const [playerIdx, coords] of Object.entries(f.boardAfter.pieces)) {
            const posStr = (coords ?? []).map((c) => `(${c.q},${c.r})`).join(' ');
            lines.push(`  P${playerIdx}: ${posStr}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      },
    }),
    {
      name: 'chinese-checkers-review',
      // Don't persist isPaused — always start unpaused
      partialize: (s) => ({ flags: s.flags }),
    }
  )
);
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Write store unit tests**

Create `tests/store/reviewStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useReviewStore } from '@/store/reviewStore';
import type { FlaggedMove } from '@/types/review';

const baseFlag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
  gameId: 'game1',
  turnNumber: 10,
  player: 1,
  difficulty: 'hard',
  personality: 'generalist',
  piecesInGoal: 9,
  actualMove: { from: { q: 3, r: -5 }, to: { q: 2, r: -5 } },
  note: 'should have gone deeper',
  boardAfter: { pieces: { 1: [{ q: 3, r: -5 }] } },
};

beforeEach(() => {
  useReviewStore.setState({ isPaused: false, flags: [] });
});

describe('reviewStore', () => {
  it('starts unpaused with no flags', () => {
    const { isPaused, flags } = useReviewStore.getState();
    expect(isPaused).toBe(false);
    expect(flags).toHaveLength(0);
  });

  it('togglePause flips isPaused', () => {
    useReviewStore.getState().togglePause();
    expect(useReviewStore.getState().isPaused).toBe(true);
    useReviewStore.getState().togglePause();
    expect(useReviewStore.getState().isPaused).toBe(false);
  });

  it('addFlag assigns id and timestamp', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const { flags } = useReviewStore.getState();
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toMatch(/^[a-z0-9]{8}$/);
    expect(flags[0].timestamp).toBeGreaterThan(0);
  });

  it('removeFlag removes by id', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const id = useReviewStore.getState().flags[0].id;
    useReviewStore.getState().removeFlag(id);
    expect(useReviewStore.getState().flags).toHaveLength(0);
  });

  it('clearFlags empties the list', () => {
    useReviewStore.getState().addFlag(baseFlag);
    useReviewStore.getState().addFlag(baseFlag);
    useReviewStore.getState().clearFlags();
    expect(useReviewStore.getState().flags).toHaveLength(0);
  });

  it('exportText returns "(no flags recorded)" when empty', () => {
    expect(useReviewStore.getState().exportText()).toBe('(no flags recorded)');
  });

  it('exportText includes move coords and note', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const text = useReviewStore.getState().exportText();
    expect(text).toContain('(3,-5) → (2,-5)');
    expect(text).toContain('should have gone deeper');
    expect(text).toContain('Turn 10');
    expect(text).toContain('9/10 in goal');
  });

  it('exportText includes suggested move when provided', () => {
    useReviewStore.getState().addFlag({
      ...baseFlag,
      suggestedMove: { from: { q: 3, r: -5 }, to: { q: 3, r: -6 } },
    });
    expect(useReviewStore.getState().exportText()).toContain('Suggested:');
    expect(useReviewStore.getState().exportText()).toContain('(3,-6)');
  });
});
```

- [ ] **Run tests**

```bash
npx vitest run tests/store/reviewStore.test.ts
```
Expected: all pass.

- [ ] **Commit**

```bash
git add src/store/reviewStore.ts tests/store/reviewStore.test.ts
git commit -m "feat: add reviewStore with pause, flag accumulation, and text export"
```

---

## Task 3: Pause integration in useAITurn

**Files:**
- Modify: `src/hooks/useAITurn.ts` — add `isPaused` check to `isAITurn`

- [ ] **Add isPaused import and check**

At the top of `useAITurn.ts`, add the import after the existing imports:

```typescript
import { useReviewStore } from '@/store/reviewStore';
```

Then inside `useAITurn`, add `isPaused` to the destructured values:

```typescript
const isPaused = useReviewStore((s) => s.isPaused);
```

Then extend `isAITurn`:

```typescript
const isAITurn =
  enabled &&
  !isPaused &&
  gameState != null &&
  !isGameFullyOver(gameState) &&
  gameState.aiPlayers?.[gameState.currentPlayer] != null;
```

Also add `isPaused` to the dependency array of both `useEffect` calls at the end:

```typescript
// Phase 1 effect deps:
}, [isAITurn, pendingConfirmation, animatingPiece, gameState?.currentPlayer, gameState?.turnNumber, isPaused]);

// Phase 2 effect deps:
}, [isAITurn, pendingConfirmation, animatingPiece, isPaused]);
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/hooks/useAITurn.ts
git commit -m "feat: pause AI think timer when reviewStore.isPaused is true"
```

---

## Task 4: FlagMoveModal component

**Files:**
- Create: `src/components/game/FlagMoveModal.tsx`

The modal receives the captured AI move info as props, lets the user add a note and optional suggested coords, and calls `onSave` or `onCancel`.

- [ ] **Write `src/components/game/FlagMoveModal.tsx`**

```typescript
'use client';

import { useState } from 'react';
import type { PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

interface CapturedMove {
  gameId: string | null;
  turnNumber: number;
  player: PlayerIndex;
  difficulty: string;
  personality: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  boardAfter: FlaggedMove['boardAfter'];
}

interface Props {
  captured: CapturedMove;
  onSave: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  onCancel: () => void;
}

function coordLabel(c: { q: number; r: number }) {
  return `(${c.q}, ${c.r})`;
}

export function FlagMoveModal({ captured, onSave, onCancel }: Props) {
  const [note, setNote] = useState('');
  const [sugFromQ, setSugFromQ] = useState('');
  const [sugFromR, setSugFromR] = useState('');
  const [sugToQ, setSugToQ] = useState('');
  const [sugToR, setSugToR] = useState('');

  const hasSuggested =
    sugFromQ !== '' && sugFromR !== '' && sugToQ !== '' && sugToR !== '';

  function handleSave() {
    const flag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
      ...captured,
      note: note.trim(),
      ...(hasSuggested && {
        suggestedMove: {
          from: { q: parseInt(sugFromQ, 10), r: parseInt(sugFromR, 10) },
          to: { q: parseInt(sugToQ, 10), r: parseInt(sugToR, 10) },
        },
      }),
    };
    onSave(flag);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Flag AI Move</h2>

        <div className="text-sm text-gray-600 space-y-1">
          <div>
            <span className="font-medium">Turn:</span> {captured.turnNumber} &nbsp;
            <span className="font-medium">Player:</span> {captured.player} &nbsp;
            <span className="font-medium">({captured.difficulty}/{captured.personality})</span>
          </div>
          <div>
            <span className="font-medium">Move:</span>{' '}
            {coordLabel(captured.actualMove.from)} → {coordLabel(captured.actualMove.to)}
          </div>
          <div>
            <span className="font-medium">Pieces in goal:</span> {captured.piecesInGoal}/10
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What should have happened? (note)
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={3}
            placeholder="e.g. should have moved (3,-5) deeper to (3,-6) to unblock entry"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            Suggested move coords <span className="text-gray-400 font-normal">(optional)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">From q, r</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="q"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugFromQ}
                  onChange={(e) => setSugFromQ(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="r"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugFromR}
                  onChange={(e) => setSugFromR(e.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">To q, r</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="q"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugToQ}
                  onChange={(e) => setSugToQ(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="r"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugToR}
                  onChange={(e) => setSugToR(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Save flag
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/components/game/FlagMoveModal.tsx
git commit -m "feat: add FlagMoveModal for capturing note and optional suggested coords"
```

---

## Task 5: ReviewControls component

**Files:**
- Create: `src/components/game/ReviewControls.tsx`

This component:
1. Detects when an AI move just completed by watching `lastMoveInfo` + `gameState.turnNumber`
2. Captures enough info for a flag (move, board snapshot, AI config) at that moment
3. Renders the pause/resume button, the "Flag last move" button (when a flaggable move exists), and the export/clear controls

- [ ] **Write `src/components/game/ReviewControls.tsx`**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useReviewStore } from '@/store/reviewStore';
import { countPiecesInGoal } from '@/game/state';
import { FlagMoveModal } from './FlagMoveModal';
import type { PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

type CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>;

function buildBoardSnapshot(gameState: NonNullable<ReturnType<typeof useGameStore.getState>['gameState']>) {
  const pieces: FlaggedMove['boardAfter']['pieces'] = {};
  for (const [key, cell] of gameState.board) {
    if (cell.type !== 'piece') continue;
    const p = cell.player as PlayerIndex;
    if (!pieces[p]) pieces[p] = [];
    const [q, r] = key.split(',').map(Number);
    pieces[p]!.push({ q, r });
  }
  return { pieces };
}

export function ReviewControls({ gameId }: { gameId: string | null }) {
  const { gameState, lastMoveInfo } = useGameStore();
  const { isPaused, togglePause, flags, addFlag, removeFlag, clearFlags, exportText } = useReviewStore();

  const [flaggable, setFlaggable] = useState<CapturedAIMove | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevTurnRef = useRef<number | null>(null);

  // Detect a completed AI move: lastMoveInfo changed, player was AI, and the turn advanced
  useEffect(() => {
    if (!gameState || !lastMoveInfo) return;
    const { player } = lastMoveInfo;
    const aiConfig = gameState.aiPlayers?.[player];
    if (!aiConfig) return;

    // Only capture once per turn (guard against re-renders)
    if (prevTurnRef.current === gameState.turnNumber) return;
    prevTurnRef.current = gameState.turnNumber;

    const captured: CapturedAIMove = {
      gameId,
      turnNumber: gameState.turnNumber - 1, // the turn that just finished
      player,
      difficulty: aiConfig.difficulty,
      personality: aiConfig.personality,
      piecesInGoal: countPiecesInGoal(gameState, player),
      actualMove: {
        from: { q: lastMoveInfo.origin.q, r: lastMoveInfo.origin.r },
        to: { q: lastMoveInfo.destination.q, r: lastMoveInfo.destination.r },
      },
      boardAfter: buildBoardSnapshot(gameState),
    };
    setFlaggable(captured);
  }, [lastMoveInfo, gameState?.turnNumber, gameState, gameId]);

  const hasAI = gameState != null &&
    gameState.activePlayers.some((p) => gameState.aiPlayers?.[p] != null);

  if (!hasAI) return null;

  async function handleExport() {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open in a new tab as plain text
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-2 px-1">
        {/* Pause / Resume */}
        <button
          onClick={togglePause}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            isPaused
              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>

        {/* Flag last move */}
        {flaggable && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            ⚑ Flag last move
          </button>
        )}

        {/* Flags count + export + clear */}
        {flags.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500">{flags.length} flag{flags.length !== 1 ? 's' : ''}</span>
            <button
              onClick={handleExport}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              {copied ? '✓ Copied' : '⎘ Copy export'}
            </button>
            <button
              onClick={() => { if (confirm('Clear all flags?')) clearFlags(); }}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Clear all flags"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Per-flag remove buttons (collapsed list) */}
      {flags.length > 0 && (
        <div className="mt-1 px-1 space-y-1">
          {flags.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-red-500">⚑</span>
              <span>Turn {f.turnNumber} — P{f.player} {f.actualMove.from.q},{f.actualMove.from.r} → {f.actualMove.to.q},{f.actualMove.to.r}</span>
              {f.note && <span className="truncate max-w-32 italic">"{f.note}"</span>}
              <button
                onClick={() => removeFlag(f.id)}
                className="ml-auto text-gray-300 hover:text-gray-500"
                title="Remove flag"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && flaggable && (
        <FlagMoveModal
          captured={flaggable}
          onSave={(flag) => {
            addFlag(flag);
            setFlaggable(null);
            setModalOpen(false);
          }}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/components/game/ReviewControls.tsx
git commit -m "feat: add ReviewControls with pause, flag-last-move, and export UI"
```

---

## Task 6: Wire into GameContainer

**Files:**
- Modify: `src/components/game/GameContainer.tsx`

- [ ] **Add ReviewControls to GameContainer**

Add the import at the top:
```typescript
import { ReviewControls } from './ReviewControls';
```

Add the `gameId` from the store:
```typescript
export function GameContainer() {
  useAITurn();
  usePlayerOpening();
  useLocalGameSync();
  const gameId = useGameStore((s) => s.gameId);
  // ... rest unchanged
```

Mount `<ReviewControls>` directly after the `TurnIndicator` div:
```tsx
        {/* Turn Indicator */}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>

        {/* AI Review Controls */}
        <ReviewControls gameId={gameId} />
```

Also add the `useGameStore` import if not already present (it isn't in current file):
```typescript
import { useGameStore } from '@/store/gameStore';
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Run all tests**

```bash
npx vitest run 2>&1 | tail -15
```
Expected: all pass.

- [ ] **Commit**

```bash
git add src/components/game/GameContainer.tsx
git commit -m "feat: mount ReviewControls in GameContainer for AI move annotation"
```

---

## Task 7: Manual smoke test

- [ ] **Start dev server**

```bash
npm run dev
```

- [ ] **Set up AI vs AI game**

Navigate to `/play`, configure both players as AI (hard/generalist), start game.

- [ ] **Verify pause works**

Click "⏸ Pause" — AI should stop making moves. Click "▶ Resume" — AI resumes.

- [ ] **Verify Flag button appears after AI moves**

Watch for the "⚑ Flag last move" button to appear after each AI move. It should disappear when the next turn starts.

- [ ] **Flag a move**

Click "⚑ Flag last move", fill in a note, optionally fill in suggested coords, click "Save flag". Verify the flag appears in the list below.

- [ ] **Export**

Click "⎘ Copy export". Paste into a text editor. Verify the output contains the turn number, move coords, note, and board positions for all players.

- [ ] **Reload page and verify persistence**

Refresh the page, start a new game, verify previously captured flags still appear in the list.

- [ ] **Push**

```bash
git push
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| AI vs AI game can be paused | Task 3 (useAITurn) + Task 5 (togglePause) |
| Flag a move mid-game | Task 5 (ReviewControls detects completed AI moves) |
| Capture note + optional better move | Task 4 (FlagMoveModal) |
| Board state snapshot per flag | Task 5 (buildBoardSnapshot) |
| Export all flags as structured text | Task 2 (exportText) + Task 5 (Copy export button) |
| Flags persist across reload | Task 2 (zustand persist) |
| Per-flag removal + clear all | Task 2 + Task 5 |

### Placeholder check

None found — all code blocks are complete and runnable.

### Type consistency

- `FlaggedMove` defined in Task 1, used in Tasks 2, 4, 5 — consistent throughout.
- `CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>` — matches what `buildBoardSnapshot` produces.
- `lastMoveInfo.origin` / `lastMoveInfo.destination` — matches `GameStore` definition (`{ origin: CubeCoord; destination: CubeCoord; player: PlayerIndex }`).
- `countPiecesInGoal(gameState, player)` — imported from `@/game/state`, signature matches existing usage in `TurnIndicator`.
