# Training Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Training Mode" toggle to the `/play` page; when enabled, AI vs AI games open inside a dedicated two-column layout with a persistent side panel for pausing, rewinding, flagging suboptimal moves by clicking the board, and exporting annotations. Normal games are completely unaffected.

**Architecture:** `isTrainingMode` boolean lives in `gameStore`. `/game/[id]` conditionally renders `TrainingMatchContainer` (new) vs `GameContainer` (unchanged). A new `aiReviewStore` owns pause, rewind history, capture state, and flags. The old `reviewStore` and its components are deleted entirely.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand (persist middleware), Tailwind CSS 4, Vitest. Path alias `@/*` → `./src/*`.

---

## File Map

| File | Action |
|---|---|
| `src/types/review.ts` | Keep — types unchanged |
| `src/store/reviewStore.ts` | **Delete** |
| `src/components/game/ReviewControls.tsx` | **Delete** |
| `src/components/game/FlagMoveModal.tsx` | **Delete** |
| `tests/store/reviewStore.test.ts` | **Delete** |
| `src/components/game/GameContainer.tsx` | Modify — remove ReviewControls |
| `src/hooks/useAITurn.ts` | Modify — remove reviewStore dep; add `isPaused` + `isPausedRef` params |
| `src/store/gameStore.ts` | Modify — add `isTrainingMode` field |
| `src/store/aiReviewStore.ts` | **Create** |
| `tests/store/aiReviewStore.test.ts` | **Create** |
| `src/components/board/Board.tsx` | Modify — add `onCellClick` + `highlightCoord` props |
| `src/components/training/TrainingPanel.tsx` | **Create** |
| `src/components/training/TrainingMatchContainer.tsx` | **Create** |
| `src/app/play/page.tsx` | Modify — add Training Mode toggle |
| `src/app/game/[id]/page.tsx` | Modify — conditional container |

---

## Task 1: Cleanup — delete old review components and scrub their references

**Files:**
- Delete: `src/store/reviewStore.ts`
- Delete: `src/components/game/ReviewControls.tsx`
- Delete: `src/components/game/FlagMoveModal.tsx`
- Delete: `tests/store/reviewStore.test.ts`
- Modify: `src/components/game/GameContainer.tsx`
- Modify: `src/hooks/useAITurn.ts`

- [ ] **Delete the four old files**

```bash
rm src/store/reviewStore.ts \
   src/components/game/ReviewControls.tsx \
   src/components/game/FlagMoveModal.tsx \
   tests/store/reviewStore.test.ts
```

- [ ] **Update GameContainer.tsx — remove ReviewControls**

Replace the entire file content with:

```tsx
'use client';

import Link from 'next/link';
import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from './TurnIndicator';
import { GameOverDialog } from './GameOverDialog';
import { MoveConfirmation } from './MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';
import { usePlayerOpening } from '@/hooks/usePlayerOpening';
import { useLocalGameSync } from '@/hooks/useLocalGameSync';
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';

export function GameContainer() {
  useAITurn();
  usePlayerOpening();
  useLocalGameSync();

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link href="/home" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors">
          ← Home
        </Link>
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <Board />
          <TutorialOverlay />
        </div>
        <MoveConfirmation />
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>
      </div>
      <GameOverDialog />
      <SettingsPopup mode="game" />
    </div>
  );
}
```

- [ ] **Update useAITurn.ts — remove reviewStore, add params**

Replace the file with:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTutorialStore } from '@/store/tutorialStore';
import { isGameFullyOver } from '@/game/state';
import { AI_THINK_DELAY } from '@/types/ai';
import { serializeGameState } from '@/game/ai/workerClient';
import type { WorkerResponse } from '@/game/ai/workerClient';
import { getValidMoves } from '@/game/moves';
import { coordKey } from '@/game/coordinates';
import { useOpeningStore } from '@/store/openingStore';
import { AI_STANDARD_MOVES, AI_STANDARD_MIRROR_MOVES, getMovesForOpening } from '@/game/ai/openingBook';
import { lookupTablebase } from '@/game/ai/tablebase';
import { getPiecesOutsideGoal, getEmptyGoalsByDepth } from '@/game/ai/endgame';
import { getSerializedPatternCache } from '@/game/training/patternCache';

/**
 * @param enabled     Set false to disable AI entirely (e.g. during tutorial).
 * @param isPaused    Reactive pause flag — prevents new think timers when true.
 * @param isPausedRef Ref mirror of isPaused — checked inside worker.onmessage to
 *                    discard results that arrive after the user paused mid-flight.
 */
export function useAITurn(
  enabled: boolean = true,
  isPaused: boolean = false,
  isPausedRef?: React.RefObject<boolean>,
) {
  const {
    gameState,
    pendingConfirmation,
    animatingPiece,
  } = useGameStore();

  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const openingVariantRef = useRef<'standard' | 'standard-mirror' | null>(null);
  const prevTurnRef = useRef<number>(Infinity);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../game/ai/worker.ts', import.meta.url)
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const isAITurn =
    enabled &&
    !isPaused &&
    gameState != null &&
    !isGameFullyOver(gameState) &&
    gameState.aiPlayers?.[gameState.currentPlayer] != null;

  useEffect(() => {
    if (!isAITurn || pendingConfirmation || animatingPiece) return;
    if (!gameState) return;

    const turnSnapshot = gameState.turnNumber;
    const playerSnapshot = gameState.currentPlayer;

    thinkTimerRef.current = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;

      const current = useGameStore.getState();
      if (
        !current.gameState ||
        current.pendingConfirmation ||
        current.animatingPiece ||
        isGameFullyOver(current.gameState)
      ) {
        return;
      }

      const currentAI = current.gameState.aiPlayers?.[current.gameState.currentPlayer];
      if (!currentAI) return;

      const serialized = serializeGameState(current.gameState);

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        let { move } = e.data;
        if (!move) return;

        // Discard result if user paused after this think was dispatched
        if (isPausedRef?.current) return;

        const latest = useGameStore.getState();
        if (
          !latest.gameState ||
          latest.gameState.turnNumber !== turnSnapshot ||
          latest.gameState.currentPlayer !== playerSnapshot ||
          latest.pendingConfirmation ||
          latest.animatingPiece ||
          isGameFullyOver(latest.gameState)
        ) {
          return;
        }

        const blockedKey = useTutorialStore.getState().blockedPieceKey;
        if (blockedKey && coordKey(move.from) === blockedKey) {
          const gs = latest.gameState;
          const aiPlayer = gs.currentPlayer;
          const altMoves: typeof move[] = [];
          for (const [key, content] of gs.board) {
            if (content.type !== 'piece' || content.player !== aiPlayer || key === blockedKey) continue;
            const parts = key.split(',').map(Number);
            const coord = { q: parts[0], r: parts[1], s: -parts[0] - parts[1] };
            altMoves.push(...getValidMoves(gs, coord));
          }
          if (altMoves.length > 0) {
            move = altMoves[Math.floor(Math.random() * altMoves.length)];
          }
        }

        latest.selectPiece(move.from);
        setTimeout(() => {
          const animate = useSettingsStore.getState().animateMoves;
          useGameStore.getState().makeMove(move.to, animate);
        }, 50);
      };

      const turn = current.gameState.turnNumber;
      if (openingVariantRef.current === null || turn < prevTurnRef.current) {
        openingVariantRef.current = Math.random() < 0.5 ? 'standard' : 'standard-mirror';
      }
      prevTurnRef.current = turn;

      const variant = current.gameState.playerPieceTypes?.[current.gameState.currentPlayer] ?? 'normal';
      const { customOpenings } = useOpeningStore.getState();
      const matching = customOpenings.filter((o) => (o.gameMode ?? 'normal') === variant);
      let openingMoves;
      if (matching.length > 0) {
        const chosen = matching[Math.floor(Math.random() * matching.length)];
        openingMoves = getMovesForOpening(chosen.id, customOpenings);
      } else if (variant === 'normal') {
        openingMoves = openingVariantRef.current === 'standard-mirror'
          ? AI_STANDARD_MIRROR_MOVES
          : AI_STANDARD_MOVES;
      }

      const tbPlayer = current.gameState.currentPlayer;
      const outsidePieces = getPiecesOutsideGoal(current.gameState, tbPlayer);
      if (outsidePieces.length >= 1 && outsidePieces.length <= 2) {
        const emptyGoals = getEmptyGoalsByDepth(current.gameState, tbPlayer);
        const tbEntry = lookupTablebase(outsidePieces, emptyGoals);
        if (tbEntry) {
          const fromCoord = { q: tbEntry.from.q, r: tbEntry.from.r, s: -tbEntry.from.q - tbEntry.from.r };
          const tbMoves = getValidMoves(current.gameState, fromCoord);
          const tbMove = tbMoves.find(m => m.to.q === tbEntry.to.q && m.to.r === tbEntry.to.r);
          if (tbMove) {
            if (isPausedRef?.current) return;
            useGameStore.getState().selectPiece(tbMove.from);
            setTimeout(() => {
              const animate = useSettingsStore.getState().animateMoves;
              useGameStore.getState().makeMove(tbMove.to, animate);
            }, 50);
            return;
          }
        }
      }

      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
        openingMoves,
        patternCache: getSerializedPatternCache(),
      });
    }, AI_THINK_DELAY);

    return () => {
      if (thinkTimerRef.current) {
        clearTimeout(thinkTimerRef.current);
        thinkTimerRef.current = null;
      }
    };
  }, [isAITurn, pendingConfirmation, animatingPiece, gameState?.currentPlayer, gameState?.turnNumber, isPaused]);

  useEffect(() => {
    if (!isAITurn || !pendingConfirmation || animatingPiece) return;

    confirmTimerRef.current = setTimeout(() => {
      const current = useGameStore.getState();
      if (current.pendingConfirmation && !current.animatingPiece) {
        current.confirmMove();
      }
    }, 200);

    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, [isAITurn, pendingConfirmation, animatingPiece, isPaused]);

  return { isAITurn };
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add -A
git commit -m "refactor: remove reviewStore and ReviewControls from normal game flow"
```

---

## Task 2: Add `isTrainingMode` to gameStore

**Files:**
- Modify: `src/store/gameStore.ts`

- [ ] **Add `isTrainingMode` to the interface**

In the `GameStore` interface (after `isSwapAnimation`), add:

```typescript
  isTrainingMode: boolean;
```

Add these actions to the interface (after `clearAnimation`):

```typescript
  setTrainingMode: (v: boolean) => void;
```

- [ ] **Add initial value and action**

In the `create<GameStore>` call, after `isSwapAnimation: false,`, add:

```typescript
  isTrainingMode: false,
```

After the `clearAnimation` implementation, add:

```typescript
  setTrainingMode: (v) => set({ isTrainingMode: v }),
```

- [ ] **Clear on resetGame**

In the `resetGame` action's `set({...})` call, add:

```typescript
  isTrainingMode: false,
```

- [ ] **Pass through startGame and startGameFromLayout**

In `startGame`, add `isTrainingMode?: boolean` as a final parameter (after `playerPieceTypes`). In the `set({...})` call inside `startGame`, add:

```typescript
  isTrainingMode: isTrainingMode ?? false,
```

Do the same for `startGameFromLayout`.

Update the interface signatures to match (add the optional `isTrainingMode?: boolean` param to both).

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/store/gameStore.ts
git commit -m "feat: add isTrainingMode flag to gameStore"
```

---

## Task 3: Create `aiReviewStore` with tests

**Files:**
- Create: `src/store/aiReviewStore.ts`
- Create: `tests/store/aiReviewStore.test.ts`

- [ ] **Write `src/store/aiReviewStore.ts`**

```typescript
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, CubeCoord, PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

export type CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>;

interface AIReviewStore {
  isPaused: boolean;
  stateHistory: GameState[];
  pendingFlag: CapturedAIMove | null;
  captureMode: null | 'from' | 'to';
  captureFrom: CubeCoord | null;
  captureTo: CubeCoord | null;
  flags: FlaggedMove[];

  togglePause: () => void;
  pushHistory: (state: GameState) => void;
  clearHistory: () => void;
  popHistory: () => GameState | null;
  setPendingFlag: (flag: CapturedAIMove | null) => void;
  startCapture: () => void;
  captureCell: (coord: CubeCoord) => void;
  cancelCapture: () => void;
  addFlag: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  removeFlag: (id: string) => void;
  clearFlags: () => void;
  exportText: () => string;
}

export const useAIReviewStore = create<AIReviewStore>()(
  persist(
    (set, get) => ({
      isPaused: false,
      stateHistory: [],
      pendingFlag: null,
      captureMode: null,
      captureFrom: null,
      captureTo: null,
      flags: [],

      togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

      pushHistory: (state) =>
        set((s) => ({
          stateHistory: [...s.stateHistory, state].slice(-50),
        })),

      clearHistory: () => set({ stateHistory: [] }),

      popHistory: () => {
        const { stateHistory } = get();
        if (stateHistory.length === 0) return null;
        const prev = stateHistory[stateHistory.length - 1];
        set({ stateHistory: stateHistory.slice(0, -1) });
        return prev;
      },

      setPendingFlag: (flag) =>
        set({ pendingFlag: flag, captureMode: null, captureFrom: null, captureTo: null }),

      startCapture: () => set({ captureMode: 'from', captureFrom: null, captureTo: null }),

      captureCell: (coord) => {
        const { captureMode } = get();
        if (captureMode === 'from') {
          set({ captureFrom: coord, captureMode: 'to', captureTo: null });
        } else if (captureMode === 'to') {
          set({ captureTo: coord, captureMode: null });
        }
      },

      cancelCapture: () => set({ captureMode: null, captureFrom: null, captureTo: null }),

      addFlag: (flag) => {
        const entry: FlaggedMove = {
          ...flag,
          id: crypto.randomUUID(),
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
      name: 'chinese-checkers-ai-review',
      partialize: (s) => ({ flags: s.flags }),
    }
  )
);
```

- [ ] **Write `tests/store/aiReviewStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useAIReviewStore } from '@/store/aiReviewStore';
import type { FlaggedMove } from '@/types/review';
import type { GameState } from '@/types/game';

const baseFlag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
  gameId: 'g1',
  turnNumber: 10,
  player: 1,
  difficulty: 'hard',
  personality: 'generalist',
  piecesInGoal: 9,
  actualMove: { from: { q: 3, r: -5 }, to: { q: 2, r: -5 } },
  note: 'bad move',
  boardAfter: { pieces: { 1: [{ q: 3, r: -5 }] } },
};

beforeEach(() => {
  useAIReviewStore.setState({
    isPaused: false,
    stateHistory: [],
    pendingFlag: null,
    captureMode: null,
    captureFrom: null,
    captureTo: null,
    flags: [],
  });
});

describe('togglePause', () => {
  it('flips isPaused', () => {
    useAIReviewStore.getState().togglePause();
    expect(useAIReviewStore.getState().isPaused).toBe(true);
    useAIReviewStore.getState().togglePause();
    expect(useAIReviewStore.getState().isPaused).toBe(false);
  });
});

describe('stateHistory', () => {
  it('pushHistory adds state and popHistory returns it', () => {
    const s = { turnNumber: 5 } as GameState;
    useAIReviewStore.getState().pushHistory(s);
    expect(useAIReviewStore.getState().stateHistory).toHaveLength(1);
    const popped = useAIReviewStore.getState().popHistory();
    expect(popped?.turnNumber).toBe(5);
    expect(useAIReviewStore.getState().stateHistory).toHaveLength(0);
  });

  it('popHistory returns null when empty', () => {
    expect(useAIReviewStore.getState().popHistory()).toBeNull();
  });

  it('caps stateHistory at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      useAIReviewStore.getState().pushHistory({ turnNumber: i } as GameState);
    }
    expect(useAIReviewStore.getState().stateHistory).toHaveLength(50);
    expect(useAIReviewStore.getState().stateHistory[0].turnNumber).toBe(5);
  });
});

describe('captureCell state machine', () => {
  it('startCapture → captureCell(from) → captureCell(to) → done', () => {
    const store = useAIReviewStore.getState();
    store.startCapture();
    expect(useAIReviewStore.getState().captureMode).toBe('from');

    const c1 = { q: 1, r: -2, s: 1 };
    useAIReviewStore.getState().captureCell(c1);
    expect(useAIReviewStore.getState().captureMode).toBe('to');
    expect(useAIReviewStore.getState().captureFrom).toEqual(c1);

    const c2 = { q: 2, r: -3, s: 1 };
    useAIReviewStore.getState().captureCell(c2);
    expect(useAIReviewStore.getState().captureMode).toBeNull();
    expect(useAIReviewStore.getState().captureTo).toEqual(c2);
  });

  it('captureCell does nothing when captureMode is null', () => {
    useAIReviewStore.getState().captureCell({ q: 0, r: 0, s: 0 });
    expect(useAIReviewStore.getState().captureFrom).toBeNull();
  });

  it('cancelCapture resets all capture state', () => {
    useAIReviewStore.getState().startCapture();
    useAIReviewStore.getState().captureCell({ q: 1, r: 0, s: -1 });
    useAIReviewStore.getState().cancelCapture();
    const s = useAIReviewStore.getState();
    expect(s.captureMode).toBeNull();
    expect(s.captureFrom).toBeNull();
    expect(s.captureTo).toBeNull();
  });
});

describe('flags', () => {
  it('addFlag assigns id (UUID) and timestamp', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const { flags } = useAIReviewStore.getState();
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('removeFlag removes by id', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    useAIReviewStore.getState().removeFlag(id);
    expect(useAIReviewStore.getState().flags).toHaveLength(0);
  });

  it('clearFlags empties list', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().clearFlags();
    expect(useAIReviewStore.getState().flags).toHaveLength(0);
  });
});

describe('exportText', () => {
  it('returns sentinel when no flags', () => {
    expect(useAIReviewStore.getState().exportText()).toBe('(no flags recorded)');
  });

  it('includes move coords and note', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('(3,-5) → (2,-5)');
    expect(text).toContain('bad move');
    expect(text).toContain('Turn 10');
    expect(text).toContain('9/10 in goal');
  });

  it('includes suggested move when present', () => {
    useAIReviewStore.getState().addFlag({
      ...baseFlag,
      suggestedMove: { from: { q: 3, r: -5 }, to: { q: 3, r: -6 } },
    });
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('Suggested:');
    expect(text).toContain('(3,-6)');
  });
});
```

- [ ] **Run tests**

```bash
npx vitest run tests/store/aiReviewStore.test.ts
```
Expected: all 12 tests pass.

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/store/aiReviewStore.ts tests/store/aiReviewStore.test.ts
git commit -m "feat: add aiReviewStore with pause, history, capture state, and flag export"
```

---

## Task 4: Add `onCellClick` and `highlightCoord` props to Board

**Files:**
- Modify: `src/components/board/Board.tsx`

Board.tsx is a large file (~1400 lines). Make three targeted edits only.

- [ ] **Edit 1 — extend BoardProps interface** (currently at line ~51)

Find:
```typescript
interface BoardProps {
  /** When set, lock board rotation to this player's perspective (for online games) */
  fixedRotationPlayer?: PlayerIndex;
  /** When false, suppress spinning highlights on pieces (online: not your turn) */
  isLocalPlayerTurn?: boolean;
}
```

Replace with:
```typescript
interface BoardProps {
  /** When set, lock board rotation to this player's perspective (for online games) */
  fixedRotationPlayer?: PlayerIndex;
  /** When false, suppress spinning highlights on pieces (online: not your turn) */
  isLocalPlayerTurn?: boolean;
  /** When provided, all cell/piece clicks call this instead of the game selectPiece flow. */
  onCellClick?: (coord: CubeCoord) => void;
  /** When provided, render this cell with the selected-piece highlight style. */
  highlightCoord?: CubeCoord;
}
```

- [ ] **Edit 2 — destructure new props in function signature** (line ~58)

Find:
```typescript
export function Board({ fixedRotationPlayer, isLocalPlayerTurn }: BoardProps = {}) {
```

Replace with:
```typescript
export function Board({ fixedRotationPlayer, isLocalPlayerTurn, onCellClick, highlightCoord }: BoardProps = {}) {
```

- [ ] **Edit 3 — intercept clicks in handleCellClick** (line ~626)

Find the very start of `handleCellClick`:
```typescript
  const handleCellClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
```

Replace with:
```typescript
  const handleCellClick = (coord: CubeCoord) => {
    if (onCellClick) { onCellClick(coord); return; }
    if (isReplayActive) return;
```

- [ ] **Edit 4 — intercept clicks in handlePieceClick** (line ~686)

Find the very start of `handlePieceClick`:
```typescript
  const handlePieceClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
```

Replace with:
```typescript
  const handlePieceClick = (coord: CubeCoord) => {
    if (onCellClick) { onCellClick(coord); return; }
    if (isReplayActive) return;
```

- [ ] **Edit 5 — add highlightCoord to isSelected** (line ~1354)

Find:
```typescript
                isSelected={
                  !isReplayActive && !isAITurn && selectedPiece !== null && cubeEquals(selectedPiece, coord)
                }
```

Replace with:
```typescript
                isSelected={
                  (!isReplayActive && !isAITurn && selectedPiece !== null && cubeEquals(selectedPiece, coord)) ||
                  (highlightCoord != null && cubeEquals(highlightCoord, coord))
                }
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/components/board/Board.tsx
git commit -m "feat: add onCellClick and highlightCoord props to Board for training capture mode"
```

---

## Task 5: Create TrainingPanel component

**Files:**
- Create: `src/components/training/TrainingPanel.tsx`

- [ ] **Create directory and write the file**

```bash
mkdir -p src/components/training
```

Write `src/components/training/TrainingPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useAIReviewStore } from '@/store/aiReviewStore';

export function TrainingPanel() {
  const { gameState } = useGameStore();
  const {
    isPaused, togglePause,
    stateHistory,
    pendingFlag, setPendingFlag,
    captureMode, captureFrom, captureTo,
    startCapture, cancelCapture,
    flags, addFlag, removeFlag, clearFlags,
    exportText,
  } = useAIReviewStore();

  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleRewind() {
    const prev = useAIReviewStore.getState().popHistory();
    if (!prev) return;
    if (!isPaused) togglePause();
    useGameStore.setState({
      gameState: prev,
      lastMoveInfo: null,
      selectedPiece: null,
      pendingConfirmation: false,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
    setPendingFlag(null);
  }

  function handleSaveFlag() {
    if (!pendingFlag) return;
    const suggestedMove =
      captureFrom && captureTo
        ? {
            from: { q: captureFrom.q, r: captureFrom.r },
            to: { q: captureTo.q, r: captureTo.r },
          }
        : undefined;
    addFlag({ ...pendingFlag, note: note.trim(), suggestedMove });
    setNote('');
    setPendingFlag(null);
  }

  function handleDismiss() {
    setPendingFlag(null);
    setNote('');
  }

  async function handleExport() {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }

  const panelContent = (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {/* Zone 1: Controls */}
      <div className="flex items-center gap-2 flex-wrap">
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
        <button
          onClick={handleRewind}
          disabled={stateHistory.length === 0}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Back
        </button>
        <span className="ml-auto text-xs text-gray-400">
          Turn {gameState?.turnNumber ?? 1}
        </span>
      </div>

      {/* Zone 2: Flag Zone */}
      {pendingFlag && (
        <div className="border border-red-200 rounded-lg p-3 space-y-3 bg-red-50/30">
          <div className="text-xs text-gray-600 space-y-0.5">
            <div className="font-medium text-gray-800 text-sm">Flag this move?</div>
            <div>
              Turn {pendingFlag.turnNumber} · P{pendingFlag.player} ·{' '}
              {pendingFlag.difficulty}/{pendingFlag.personality}
            </div>
            <div>
              Move: ({pendingFlag.actualMove.from.q},{pendingFlag.actualMove.from.r}) →{' '}
              ({pendingFlag.actualMove.to.q},{pendingFlag.actualMove.to.r})
            </div>
            <div>{pendingFlag.piecesInGoal}/10 in goal</div>
          </div>

          {/* Click-capture for suggested move */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-700">
              Better move{' '}
              <span className="text-gray-400 font-normal">(click board)</span>
            </div>
            {captureMode === null && !captureTo && (
              <button
                onClick={startCapture}
                className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Select piece…
              </button>
            )}
            {captureMode === 'from' && (
              <div className="text-xs text-blue-700 font-medium">
                Click the piece that should move…
                <button
                  onClick={cancelCapture}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  cancel
                </button>
              </div>
            )}
            {captureMode === 'to' && (
              <div className="text-xs text-blue-700 font-medium">
                From ({captureFrom?.q},{captureFrom?.r}) — click destination…
                <button
                  onClick={cancelCapture}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  cancel
                </button>
              </div>
            )}
            {captureMode === null && captureFrom && captureTo && (
              <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                ({captureFrom.q},{captureFrom.r}) → ({captureTo.q},{captureTo.r})
                <button
                  onClick={cancelCapture}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <textarea
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            rows={3}
            placeholder="What should have happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSaveFlag}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              ⚑ Save flag
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Zone 3: Saved flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">
              {flags.length} flag{flags.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-1">
              <button
                onClick={handleExport}
                className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {copied ? '✓ Copied' : '⎘ Export'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Clear all flags?')) clearFlags();
                }}
                className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {flags.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-1.5 text-xs text-gray-500 py-1 border-b border-gray-100 last:border-0"
              >
                <span className="text-red-400 mt-0.5 flex-shrink-0">⚑</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">T{f.turnNumber} P{f.player}</span>
                  {' '}({f.actualMove.from.q},{f.actualMove.from.r})→(
                  {f.actualMove.to.q},{f.actualMove.to.r})
                  {f.note && (
                    <div className="truncate italic text-gray-400">"{f.note}"</div>
                  )}
                </div>
                <button
                  onClick={() => removeFlag(f.id)}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                  title="Remove flag"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block">{panelContent}</div>

      {/* Mobile collapsible */}
      <div className="md:hidden mt-2">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2 bg-white rounded-lg shadow text-sm font-medium text-gray-700"
        >
          <span>
            Training{flags.length > 0 ? ` (${flags.length} flags)` : ''}
          </span>
          <span>{mobileOpen ? '▲' : '▼'}</span>
        </button>
        {mobileOpen && <div className="mt-1">{panelContent}</div>}
      </div>
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
git add src/components/training/TrainingPanel.tsx
git commit -m "feat: add TrainingPanel with pause, rewind, flag zone, and export"
```

---

## Task 6: Create TrainingMatchContainer

**Files:**
- Create: `src/components/training/TrainingMatchContainer.tsx`

- [ ] **Write `src/components/training/TrainingMatchContainer.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { GameOverDialog } from '@/components/game/GameOverDialog';
import { MoveConfirmation } from '@/components/game/MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';
import { usePlayerOpening } from '@/hooks/usePlayerOpening';
import { useLocalGameSync } from '@/hooks/useLocalGameSync';
import { useGameStore } from '@/store/gameStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { TrainingPanel } from './TrainingPanel';
import { countPiecesInGoal } from '@/game/state';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

type CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>;

function buildBoardSnapshot(
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>['gameState']>
): FlaggedMove['boardAfter'] {
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

export function TrainingMatchContainer() {
  const { gameState, lastMoveInfo, gameId } = useGameStore();
  const {
    isPaused,
    pushHistory,
    setPendingFlag,
    captureMode,
    captureFrom,
    captureCell,
  } = useAIReviewStore();

  // Ref mirror of isPaused — checked inside worker.onmessage to discard
  // results that arrive after the user paused mid-flight.
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const { isAITurn } = useAITurn(true, isPaused, isPausedRef);
  usePlayerOpening();
  useLocalGameSync();

  // Capture pre-move game state when AI turn starts (before the move executes).
  // Stored in a ref so the turnNumber effect can access it without re-running.
  const preMoveRef = useRef<typeof gameState>(null);
  useEffect(() => {
    if (isAITurn && gameState) {
      preMoveRef.current = gameState;
    }
  }, [isAITurn, gameState]);

  // When turnNumber advances the AI's move completed — push the pre-move snapshot.
  useEffect(() => {
    if (preMoveRef.current) {
      pushHistory(preMoveRef.current);
      preMoveRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.turnNumber]);

  // Detect completed AI moves and surface them as pending flags.
  const prevTurnRef = useRef<number | null>(null);
  useEffect(() => {
    if (!gameState || !lastMoveInfo) return;
    const { player } = lastMoveInfo;
    const aiConfig = gameState.aiPlayers?.[player];
    if (!aiConfig) return;
    if (prevTurnRef.current === gameState.turnNumber) return;
    prevTurnRef.current = gameState.turnNumber;

    const captured: CapturedAIMove = {
      gameId,
      turnNumber: gameState.turnNumber - 1,
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
    setPendingFlag(captured);
  }, [lastMoveInfo, gameState?.turnNumber, gameId]);

  // Route board clicks to capture store when in capture mode.
  const handleCaptureClick: ((coord: CubeCoord) => void) | undefined =
    captureMode !== null ? (coord) => captureCell(coord) : undefined;

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
        >
          ← Home
        </Link>

        <div className="md:grid md:grid-cols-[1fr_288px] md:gap-4 md:items-start">
          {/* Game column */}
          <div>
            <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board
                onCellClick={handleCaptureClick}
                highlightCoord={captureFrom ?? undefined}
              />
            </div>
            <MoveConfirmation />
            <div className="mt-2 sm:mt-4">
              <TurnIndicator />
            </div>
          </div>

          {/* Training panel column */}
          <TrainingPanel />
        </div>
      </div>

      <GameOverDialog />
      <SettingsPopup mode="game" />
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
git add src/components/training/TrainingMatchContainer.tsx
git commit -m "feat: add TrainingMatchContainer with two-column layout and review hooks"
```

---

## Task 7: Add Training Mode toggle to play page

**Files:**
- Modify: `src/app/play/page.tsx`

- [ ] **Add `trainingMode` state**

In `PlayPage`, after the existing `useState` declarations (near line 96), add:

```typescript
  const [trainingMode, setTrainingMode] = useState(false);
```

- [ ] **Pass `trainingMode` to startGame calls**

In `handleStartGame`, the two `startGame`/`startGameFromLayout` calls currently end with `effectivePieceTypes`. Add `trainingMode` as the final argument to both:

For `startGameFromLayout` (line ~184):
```typescript
      gameId = startGameFromLayout(
        trimmedLayout,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined,
        effectiveTeamMode,
        effectivePieceTypes,
        trainingMode,
      );
```

For `startGame` (line ~193):
```typescript
      gameId = startGame(
        selectedCount,
        undefined,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined,
        effectiveTeamMode,
        effectivePieceTypes,
        trainingMode,
      );
```

- [ ] **Add toggle UI before the start button**

Find the JSX section that contains the start button (search for `handleStartGame` in the JSX). Just before the start button, add a Training Mode toggle row:

```tsx
{/* Training Mode toggle — only meaningful when at least one player is AI */}
{(() => {
  const hasAnyAI = Object.keys(aiConfig).length > 0;
  return (
    <div className={`flex items-center gap-3 py-2 ${!hasAnyAI ? 'opacity-40 pointer-events-none' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={trainingMode}
        onClick={() => setTrainingMode((v) => !v)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
          trainingMode ? 'bg-blue-600' : 'bg-gray-300'
        }`}
        title={hasAnyAI ? undefined : 'Add an AI player to enable training mode'}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            trainingMode ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">Training Mode</span>
      {trainingMode && (
        <span className="text-xs text-blue-600">Pause · rewind · flag moves</span>
      )}
    </div>
  );
})()}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Commit**

```bash
git add src/app/play/page.tsx
git commit -m "feat: add Training Mode toggle to play page"
```

---

## Task 8: Conditionally render TrainingMatchContainer in game page

**Files:**
- Modify: `src/app/game/[id]/page.tsx`

- [ ] **Add import and conditional render**

Add import at the top of the file (after the existing `GameContainer` import):

```typescript
import { TrainingMatchContainer } from '@/components/training/TrainingMatchContainer';
```

Replace the final render (line ~80):
```tsx
  return <GameContainer />;
```

With:
```tsx
  const isTrainingMode = useGameStore((s) => s.isTrainingMode);
  return isTrainingMode ? <TrainingMatchContainer /> : <GameContainer />;
```

Note: `useGameStore` is already imported in this file (line 8).

- [ ] **Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```
Expected: same pass/fail count as before this feature (training.test.ts and tablebaseBuilder.test.ts have pre-existing failures unrelated to this work).

- [ ] **Commit**

```bash
git add src/app/game/[id]/page.tsx
git commit -m "feat: conditionally render TrainingMatchContainer when isTrainingMode is set"
```

---

## Task 9: Final check and push

- [ ] **Full type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pathfinding.test"
```
Expected: clean.

- [ ] **Full test suite**

```bash
npx vitest run 2>&1 | tail -10
```
Expected: aiReviewStore.test.ts passes (12 tests). Pre-existing failures unchanged.

- [ ] **Push**

```bash
git push
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Training Mode toggle on /play (disabled when no AI) | Task 7 |
| `isTrainingMode` in gameStore, cleared on reset | Task 2 |
| `/game/[id]` renders TrainingMatchContainer when flag set | Task 8 |
| Normal GameContainer unchanged | Task 1 |
| `aiReviewStore` with pause, history, capture, flags, export | Task 3 |
| `reviewStore` / ReviewControls / FlagMoveModal deleted | Task 1 |
| Two-column desktop layout, collapsible mobile panel | Task 6 |
| Pause/Resume button in panel | Task 5 |
| ← Back rewind button (restores pre-move state) | Task 5 |
| Pause fix: mid-flight worker result discarded when paused | Task 1 (useAITurn `isPausedRef`) |
| Flag zone appears after each AI move | Task 6 |
| Click board to select suggested from/to | Tasks 4 + 5 |
| `highlightCoord` shows captured from-cell on board | Task 4 |
| Note textarea inline (no modal) | Task 5 |
| Save flag / Dismiss without saving | Task 5 |
| Export copies to clipboard with fallback | Task 5 |
| Flags persist across reload | Task 3 (persist middleware) |
| Per-flag remove + clear all | Task 5 |

### Placeholder scan

None found — all code blocks are complete.

### Type consistency

- `CapturedAIMove` defined in Task 3 (`aiReviewStore.ts`) and imported by name in Task 6 (`TrainingMatchContainer`) — consistent.
- `useAITurn(true, isPaused, isPausedRef)` signature in Task 1 matches call sites in Tasks 1 (`GameContainer` uses `useAITurn()` defaults) and Task 6 (`TrainingMatchContainer` passes all three).
- `startGame(..., trainingMode)` — 8th param added in both the interface (Task 2) and the call site (Task 7).
- `useGameStore.setState({ gameState, lastMoveInfo, selectedPiece, pendingConfirmation, animatingPiece, animationPath, animationStep })` in Task 5 — all keys exist in the `GameStore` interface verified in Task 2 context reading.
