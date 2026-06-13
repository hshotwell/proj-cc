# Match Review Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/review/[id]` route where players can freely scrub through any saved game, flag questionable moves, suggest better alternatives by clicking the board, and export the flags for AI improvement.

**Architecture:** Reuses `replayStore` for navigation (it already reconstructs all game states and drives the Board via `isReplayActive`). Adds a `ReviewContainer` with a three-column layout (board | move list with flag buttons | annotation panel). The `aiReviewStore` gets three new fields (`activeGameId`, `updateFlag`, scoped `exportText`) to support per-game flag scoping and editing.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand, Tailwind CSS 4, Vitest

---

## File Map

**Create:**
- `src/app/review/[id]/page.tsx` — App Router page, mirrors `/replay/[id]/page.tsx`
- `src/components/review/ReviewContainer.tsx` — three-column layout, bottom scrubber bar, mobile tabs, keyboard nav
- `src/components/review/ReviewMoveHistory.tsx` — move list with per-row flag buttons
- `src/components/review/ReviewPanel.tsx` — flag form (create/edit) and flag list

**Modify:**
- `src/types/review.ts` — make `difficulty`/`personality` optional; add `moveIndex?: number`
- `src/store/aiReviewStore.ts` — add `activeGameId`, `setActiveGameId`, `updateFlag`; update `exportText` to accept optional `gameId`
- `tests/store/aiReviewStore.test.ts` — add tests for new store actions
- `src/components/game/GameOverDialog.tsx` — add "Review Game" button
- `src/app/replays/page.tsx` — add "Review" button to each game card

---

## Task 1: Update types and store

**Files:**
- Modify: `src/types/review.ts`
- Modify: `src/store/aiReviewStore.ts`
- Modify: `tests/store/aiReviewStore.test.ts`

- [ ] **Step 1: Write failing tests for new store actions**

Add these tests at the end of `tests/store/aiReviewStore.test.ts`:

```typescript
describe('activeGameId', () => {
  it('setActiveGameId sets and clears activeGameId', () => {
    useAIReviewStore.getState().setActiveGameId('game-abc');
    expect(useAIReviewStore.getState().activeGameId).toBe('game-abc');
    useAIReviewStore.getState().setActiveGameId(null);
    expect(useAIReviewStore.getState().activeGameId).toBeNull();
  });
});

describe('updateFlag', () => {
  it('patches note on an existing flag', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    useAIReviewStore.getState().updateFlag(id, { note: 'updated note' });
    expect(useAIReviewStore.getState().flags[0].note).toBe('updated note');
  });

  it('patches suggestedMove on an existing flag', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    const suggested = { from: { q: 1, r: -2 }, to: { q: 2, r: -3 } };
    useAIReviewStore.getState().updateFlag(id, { suggestedMove: suggested });
    expect(useAIReviewStore.getState().flags[0].suggestedMove).toEqual(suggested);
  });

  it('does nothing for unknown id', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().updateFlag('nonexistent', { note: 'x' });
    expect(useAIReviewStore.getState().flags[0].note).toBe('bad move');
  });
});

describe('exportText with gameId filter', () => {
  it('returns sentinel when no flags match gameId', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'other-game' });
    expect(useAIReviewStore.getState().exportText('g1')).toBe('(no flags recorded)');
  });

  it('filters to matching gameId only', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g1' });
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g2', note: 'other game' });
    const text = useAIReviewStore.getState().exportText('g1');
    expect(text).toContain('bad move');
    expect(text).not.toContain('other game');
  });

  it('exports all flags when no gameId provided (backward compat)', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g1' });
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g2', note: 'other' });
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('bad move');
    expect(text).toContain('other');
  });
});
```

Also add `activeGameId: null` to the `beforeEach` reset block:

```typescript
beforeEach(() => {
  useAIReviewStore.setState({
    isPaused: false,
    stateHistory: [],
    pendingFlag: null,
    captureMode: null,
    captureFrom: null,
    captureTo: null,
    flags: [],
    activeGameId: null,  // add this line
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/store/aiReviewStore.test.ts
```

Expected: new tests fail with "activeGameId is not a function" / "updateFlag is not a function".

- [ ] **Step 3: Update `src/types/review.ts`**

Replace the entire file:

```typescript
import type { PlayerIndex } from './game';

export interface BoardSnapshot {
  pieces: Partial<Record<PlayerIndex, Array<{ q: number; r: number }>>>;
}

export interface FlaggedMove {
  id: string;
  gameId: string | null;
  moveIndex?: number;
  turnNumber: number;
  player: PlayerIndex;
  difficulty?: string;
  personality?: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: BoardSnapshot;
  timestamp: number;
}
```

- [ ] **Step 4: Update `src/store/aiReviewStore.ts`**

Replace the entire file:

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
  rewindSignal: number;
  activeGameId: string | null;

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
  updateFlag: (id: string, patch: Partial<Pick<FlaggedMove, 'suggestedMove' | 'note'>>) => void;
  clearFlags: () => void;
  setActiveGameId: (id: string | null) => void;
  exportText: (gameId?: string) => string;
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
      rewindSignal: 0,
      activeGameId: null,

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
        set({ stateHistory: stateHistory.slice(0, -1), rewindSignal: get().rewindSignal + 1 });
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

      updateFlag: (id, patch) =>
        set((s) => ({
          flags: s.flags.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      clearFlags: () => set({ flags: [] }),

      setActiveGameId: (id) => set({ activeGameId: id }),

      exportText: (gameId?: string) => {
        const { flags } = get();
        const filtered = gameId ? flags.filter((f) => f.gameId === gameId) : flags;
        if (filtered.length === 0) return '(no flags recorded)';
        const lines: string[] = [
          '=== AI MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${filtered.length}`,
          '',
        ];
        for (let i = 0; i < filtered.length; i++) {
          const f = filtered[i];
          const from = `(${f.actualMove.from.q},${f.actualMove.from.r})`;
          const to = `(${f.actualMove.to.q},${f.actualMove.to.r})`;
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Player ${f.player}${f.difficulty ? ` | ${f.difficulty}/${f.personality}` : ''} | ${f.piecesInGoal}/10 in goal`);
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

- [ ] **Step 5: Run tests — all should pass**

```bash
npx vitest run tests/store/aiReviewStore.test.ts
```

Expected: all tests pass including new ones.

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
npm run test
```

Expected: pre-existing failures only (pathfinding.test.ts has known TS errors).

- [ ] **Step 7: Commit**

```bash
git add src/types/review.ts src/store/aiReviewStore.ts tests/store/aiReviewStore.test.ts
git commit -m "feat: extend aiReviewStore with activeGameId, updateFlag, and scoped exportText"
```

---

## Task 2: ReviewMoveHistory component

**Files:**
- Create: `src/components/review/ReviewMoveHistory.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';

import { useRef, useEffect } from 'react';
import type { PlayerIndex } from '@/types/game';
import { getPlayerColor } from '@/game/colors';
import { useReplayStore } from '@/store/replayStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

function formatCoord(coord: { q: number; r: number }): string {
  return `(${coord.q},${coord.r})`;
}

interface ReviewMoveHistoryProps {
  flaggedMoveIndices: Set<number>;
  editingMoveIndex: number | null;
  onFlagClick: (moveIndex: number) => void;
}

export function ReviewMoveHistory({ flaggedMoveIndices, editingMoveIndex, onFlagClick }: ReviewMoveHistoryProps) {
  const { moves, currentStep, displayState, goToStep, longestHopIndices } = useReplayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentEntryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentEntryRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const entry = currentEntryRef.current;
      const containerRect = container.getBoundingClientRect();
      const entryRect = entry.getBoundingClientRect();
      if (entryRect.top < containerRect.top || entryRect.bottom > containerRect.bottom) {
        entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [currentStep]);

  if (!displayState) return null;

  const { activePlayers, playerColors } = displayState;

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
        Move History
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border rounded-lg bg-white"
      >
        {moves.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">No moves</div>
        ) : (
          <div className="p-1">
            {moves.map((move, index) => {
              const player = (move.player ?? activePlayers[index % activePlayers.length]) as PlayerIndex;
              const color = getPlayerColor(player, playerColors);
              const isCurrent = index === currentStep - 1;
              const isFlagged = flaggedMoveIndices.has(index);
              const isEditing = editingMoveIndex === index;

              return (
                <div
                  key={index}
                  ref={isCurrent ? currentEntryRef : undefined}
                  className={`flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors ${
                    isEditing
                      ? 'bg-amber-50 border border-amber-300'
                      : isCurrent
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="text-gray-400 w-6 flex-shrink-0 cursor-pointer"
                    onClick={() => goToStep(index + 1)}
                  >
                    {index + 1}.
                  </span>
                  <ColorSwatch
                    color={color}
                    className="w-3 h-3 flex-shrink-0 cursor-pointer"
                    onClick={() => goToStep(index + 1)}
                  />
                  <span
                    className="font-mono flex-1 cursor-pointer"
                    onClick={() => goToStep(index + 1)}
                  >
                    {formatCoord(move.from)} → {formatCoord(move.to)}
                  </span>
                  {move.isJump && (
                    <span className="text-green-600 font-medium">
                      {move.jumpPath && move.jumpPath.length > 1 ? `×${move.jumpPath.length}` : 'jump'}
                    </span>
                  )}
                  {move.isSwap && (
                    <span className="text-amber-600 font-medium">swap</span>
                  )}
                  {longestHopIndices.has(index) && (
                    <span className="text-amber-500" title="Best hop">✶</span>
                  )}
                  <button
                    onClick={() => onFlagClick(index)}
                    title={isFlagged ? 'Edit flag' : 'Flag this move'}
                    className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                      isFlagged
                        ? 'text-red-500 hover:text-red-700'
                        : 'text-gray-300 hover:text-gray-500'
                    }`}
                  >
                    ⚑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check to verify no errors**

```bash
npm run build 2>&1 | head -40
```

Expected: no errors in the new file (there may be pre-existing errors elsewhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/review/ReviewMoveHistory.tsx
git commit -m "feat: add ReviewMoveHistory component with per-row flag buttons"
```

---

## Task 3: ReviewPanel component

**Files:**
- Create: `src/components/review/ReviewPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';

import { useState, useEffect } from 'react';
import type { PlayerIndex } from '@/types/game';
import type { GameState } from '@/types/game';
import type { BoardSnapshot } from '@/types/review';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

function buildBoardSnapshot(gameState: GameState): BoardSnapshot {
  const pieces: BoardSnapshot['pieces'] = {};
  for (const [key, cell] of gameState.board) {
    if (cell.type !== 'piece') continue;
    const p = cell.player as PlayerIndex;
    if (!pieces[p]) pieces[p] = [];
    const [q, r] = key.split(',').map(Number);
    pieces[p]!.push({ q, r });
  }
  return { pieces };
}

interface ReviewPanelProps {
  editingMoveIndex: number | null;
  editingFlagId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export function ReviewPanel({ editingMoveIndex, editingFlagId, onSave, onCancel }: ReviewPanelProps) {
  const { moves, states, displayState } = useReplayStore();
  const {
    flags, activeGameId,
    captureMode, captureFrom, captureTo,
    startCapture, cancelCapture,
    addFlag, updateFlag, removeFlag,
    exportText,
  } = useAIReviewStore();

  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const gameFlags = flags.filter((f) => f.gameId === activeGameId);

  // Pre-fill form when opening edit mode
  useEffect(() => {
    if (editingFlagId) {
      const flag = flags.find((f) => f.id === editingFlagId);
      setNote(flag?.note ?? '');
      if (flag?.suggestedMove) {
        const { from, to } = flag.suggestedMove;
        useAIReviewStore.setState({
          captureFrom: { q: from.q, r: from.r, s: -from.q - from.r },
          captureTo: { q: to.q, r: to.r, s: -to.q - to.r },
          captureMode: null,
        });
      } else {
        cancelCapture();
      }
    } else if (editingMoveIndex !== null) {
      // New flag — clear form
      setNote('');
      cancelCapture();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFlagId, editingMoveIndex]);

  function handleSave() {
    if (editingMoveIndex === null || !displayState) return;
    const move = moves[editingMoveIndex];
    const stateAfter = states[editingMoveIndex + 1];
    if (!move || !stateAfter) return;

    const activePlayers = displayState.activePlayers;
    const player = (move.player ?? activePlayers[editingMoveIndex % activePlayers.length]) as PlayerIndex;
    const aiConfig = stateAfter.aiPlayers?.[player];

    const suggestedMove =
      captureFrom && captureTo
        ? { from: { q: captureFrom.q, r: captureFrom.r }, to: { q: captureTo.q, r: captureTo.r } }
        : undefined;

    if (editingFlagId) {
      updateFlag(editingFlagId, { suggestedMove, note: note.trim() });
    } else {
      addFlag({
        gameId: activeGameId,
        moveIndex: editingMoveIndex,
        turnNumber: move.turnNumber ?? editingMoveIndex + 1,
        player,
        difficulty: aiConfig?.difficulty,
        personality: aiConfig?.personality,
        piecesInGoal: countPiecesInGoal(stateAfter, player),
        actualMove: { from: { q: move.from.q, r: move.from.r }, to: { q: move.to.q, r: move.to.r } },
        suggestedMove,
        note: note.trim(),
        boardAfter: buildBoardSnapshot(stateAfter),
      });
    }

    cancelCapture();
    onSave();
  }

  function handleCancel() {
    setNote('');
    cancelCapture();
    onCancel();
  }

  async function handleExport() {
    const text = exportText(activeGameId ?? undefined);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }

  // Flag form (create or edit)
  if (editingMoveIndex !== null && displayState) {
    const move = moves[editingMoveIndex];
    const activePlayers = displayState.activePlayers;
    const player = move
      ? ((move.player ?? activePlayers[editingMoveIndex % activePlayers.length]) as PlayerIndex)
      : activePlayers[0];
    const color = getPlayerColor(player, displayState.playerColors);
    const name = getPlayerDisplayName(player, activePlayers);

    return (
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ColorSwatch color={color} className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800">{name}</span>
          <span className="text-xs text-gray-400 ml-auto">
            Move {editingMoveIndex + 1}
          </span>
        </div>

        {move && (
          <div className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1">
            ({move.from.q},{move.from.r}) → ({move.to.q},{move.to.r})
            {move.isJump && <span className="ml-2 text-green-600">jump</span>}
          </div>
        )}

        {/* Suggested move capture */}
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
              <button onClick={cancelCapture} className="ml-2 text-gray-400 hover:text-gray-600">
                cancel
              </button>
            </div>
          )}
          {captureMode === 'to' && (
            <div className="text-xs text-blue-700 font-medium">
              From ({captureFrom?.q},{captureFrom?.r}) — click destination…
              <button onClick={cancelCapture} className="ml-2 text-gray-400 hover:text-gray-600">
                cancel
              </button>
            </div>
          )}
          {captureMode === null && captureFrom && captureTo && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
              ({captureFrom.q},{captureFrom.r}) → ({captureTo.q},{captureTo.r})
              <button onClick={cancelCapture} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
          )}
        </div>

        <textarea
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          rows={4}
          placeholder="What should have happened and why?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            ⚑ {editingFlagId ? 'Update flag' : 'Save flag'}
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Flag list view
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Review
        </h3>
        {gameFlags.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={handleExport}
              className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              {copied ? '✓ Copied' : '⎘ Export'}
            </button>
          </div>
        )}
      </div>

      {gameFlags.length === 0 ? (
        <p className="text-xs text-gray-400">
          Click ⚑ next to any move to flag it.
        </p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {gameFlags.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-1.5 text-xs text-gray-500 py-1.5 border-b border-gray-100 last:border-0"
            >
              <span className="text-red-400 mt-0.5 flex-shrink-0">⚑</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  Move {(f.moveIndex ?? 0) + 1}
                </span>{' '}
                ({f.actualMove.from.q},{f.actualMove.from.r})→({f.actualMove.to.q},{f.actualMove.to.r})
                {f.note && (
                  <div className="truncate italic text-gray-400 mt-0.5">"{f.note}"</div>
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
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep "review/ReviewPanel" | head -20
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/review/ReviewPanel.tsx
git commit -m "feat: add ReviewPanel component with flag form and flag list"
```

---

## Task 4: ReviewContainer and page route

**Files:**
- Create: `src/components/review/ReviewContainer.tsx`
- Create: `src/app/review/[id]/page.tsx`

- [ ] **Step 1: Create ReviewContainer**

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ReviewMoveHistory } from './ReviewMoveHistory';
import { ReviewPanel } from './ReviewPanel';
import type { CubeCoord } from '@/types/game';

export function ReviewContainer() {
  const router = useRouter();
  const {
    moves, currentStep, displayState,
    stepForward, stepBackward, goToStep, goToStart, goToEnd,
    closeReplay,
  } = useReplayStore();
  const { flags, activeGameId, captureMode, captureFrom, captureCell, setActiveGameId } = useAIReviewStore();

  const [editingMoveIndex, setEditingMoveIndex] = useState<number | null>(null);
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'moves' | 'review'>('moves');

  const totalMoves = moves.length;

  const gameFlags = flags.filter((f) => f.gameId === activeGameId);
  const flaggedMoveIndices = new Set(
    gameFlags
      .map((f) => f.moveIndex)
      .filter((i): i is number => i !== undefined)
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
        case 'Escape':
          if (editingMoveIndex !== null) {
            setEditingMoveIndex(null);
            setEditingFlagId(null);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward, goToStart, goToEnd, editingMoveIndex]);

  function handleFlagClick(moveIndex: number) {
    const existing = gameFlags.find((f) => f.moveIndex === moveIndex);
    goToStep(moveIndex + 1);
    setEditingMoveIndex(moveIndex);
    setEditingFlagId(existing?.id ?? null);
    setActiveTab('review');
  }

  function handleSave() {
    setEditingMoveIndex(null);
    setEditingFlagId(null);
  }

  function handleCancel() {
    setEditingMoveIndex(null);
    setEditingFlagId(null);
  }

  const handleCaptureClick: ((coord: CubeCoord) => void) | undefined =
    captureMode !== null ? (coord) => captureCell(coord) : undefined;

  const handleClose = () => {
    closeReplay();
    setActiveGameId(null);
    router.push('/replays');
  };

  const bottomBar = (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2 mt-2">
      <button
        onClick={goToStart}
        disabled={currentStep === 0}
        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="First move (Home)"
      >
        |&lt;
      </button>
      <button
        onClick={stepBackward}
        disabled={currentStep === 0}
        className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous (←)"
      >
        &lt;
      </button>
      <span className="text-xs text-gray-500 w-24 text-center flex-shrink-0">
        Move {currentStep} of {totalMoves}
      </span>
      <input
        type="range"
        min={0}
        max={totalMoves}
        value={currentStep}
        onChange={(e) => goToStep(Number(e.target.value))}
        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <button
        onClick={stepForward}
        disabled={currentStep >= totalMoves}
        className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Next (→)"
      >
        &gt;
      </button>
      <button
        onClick={goToEnd}
        disabled={currentStep >= totalMoves}
        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Last move (End)"
      >
        &gt;|
      </button>
      <button
        onClick={handleClose}
        className="ml-2 px-3 py-1 text-xs font-medium rounded bg-gray-900 text-white hover:bg-gray-800 transition-colors flex-shrink-0"
      >
        Close Review
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
        >
          ← Home
        </Link>

        {/* Desktop: three columns */}
        <div className="hidden lg:grid lg:grid-cols-[1fr_14rem_18rem] lg:gap-4 lg:items-start">
          {/* Board */}
          <div>
            <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board
                onCellClick={handleCaptureClick}
                highlightCoord={captureFrom ?? undefined}
              />
            </div>
            {bottomBar}
          </div>

          {/* Move history */}
          <div
            className="bg-white rounded-lg shadow p-2 sticky top-4 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <ReviewMoveHistory
              flaggedMoveIndices={flaggedMoveIndices}
              editingMoveIndex={editingMoveIndex}
              onFlagClick={handleFlagClick}
            />
          </div>

          {/* Review panel */}
          <div className="sticky top-4">
            <ReviewPanel
              editingMoveIndex={editingMoveIndex}
              editingFlagId={editingFlagId}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        </div>

        {/* Mobile: board + tabs */}
        <div className="lg:hidden space-y-2">
          <div className="relative w-full bg-white rounded-lg shadow-lg p-2">
            <SettingsButton />
            <Board
              onCellClick={handleCaptureClick}
              highlightCoord={captureFrom ?? undefined}
            />
          </div>

          {/* Tab strip */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
            {(['moves', 'review'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'moves' ? 'Moves' : `Review${gameFlags.length > 0 ? ` (${gameFlags.length})` : ''}`}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-b-lg shadow p-3">
            {activeTab === 'moves' ? (
              <ReviewMoveHistory
                flaggedMoveIndices={flaggedMoveIndices}
                editingMoveIndex={editingMoveIndex}
                onFlagClick={handleFlagClick}
              />
            ) : (
              <ReviewPanel
                editingMoveIndex={editingMoveIndex}
                editingFlagId={editingFlagId}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            )}
          </div>

          {bottomBar}
        </div>
      </div>

      <SettingsPopup mode="replay" />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/review/[id]/page.tsx`**

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ReviewContainer } from '@/components/review/ReviewContainer';

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { isReplayActive, loadReplay, closeReplay } = useReplayStore();
  const { setActiveGameId } = useAIReviewStore();

  useEffect(() => {
    if (!isReplayActive) {
      const id = params.id as string;
      const success = loadReplay(id);
      if (!success) {
        router.replace('/replays');
      } else {
        setActiveGameId(id);
      }
    }
  }, [isReplayActive, params.id, loadReplay, router, setActiveGameId]);

  useEffect(() => {
    return () => {
      closeReplay();
      setActiveGameId(null);
    };
  }, [closeReplay, setActiveGameId]);

  if (!isReplayActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading review…</div>
      </div>
    );
  }

  return <ReviewContainer />;
}
```

- [ ] **Step 3: Type-check**

```bash
npm run build 2>&1 | grep -E "review/Review|app/review" | head -30
```

Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/components/review/ReviewContainer.tsx src/app/review/[id]/page.tsx
git commit -m "feat: add ReviewContainer and /review/[id] route"
```

---

## Task 5: Entry points — game-over dialog and replays list

**Files:**
- Modify: `src/components/game/GameOverDialog.tsx`
- Modify: `src/app/replays/page.tsx`

- [ ] **Step 1: Add "Review Game" button to GameOverDialog**

In `src/components/game/GameOverDialog.tsx`, add a `handleReviewGame` handler after `handleWatchReplay`:

```typescript
const handleReviewGame = () => {
  if (!gameId) return;
  router.push(`/review/${gameId}`);
};
```

Then in the buttons section, add the Review Game button between "Watch Replay" and "New Game":

```typescript
<button
  onClick={handleReviewGame}
  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
>
  Review Game
</button>
```

The full buttons section should look like:

```typescript
<div className="flex flex-col gap-3">
  <button
    onClick={resetGame}
    className="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
  >
    Play Again
  </button>
  <button
    onClick={handleWatchReplay}
    className="w-full px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-400 transition-colors"
  >
    Watch Replay
  </button>
  <button
    onClick={handleReviewGame}
    className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
  >
    Review Game
  </button>
  <button
    onClick={() => {
      const isPuzzle = !!currentLayout;
      const isTutorial = tutorialGameId === gameId;
      router.push(isPuzzle || isTutorial ? '/practice' : '/play');
    }}
    className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
  >
    New Game
  </button>
</div>
```

- [ ] **Step 2: Add "Review" button to replays list**

In `src/app/replays/page.tsx`, the card's outer `<div>` `onClick` currently navigates to `/replay/${game.id}`. We need to add a "Review" button that navigates to `/review/${game.id}` without triggering the card click.

Change each game card to stop propagation from the Review button and add it alongside the delete button:

```typescript
return (
  <div
    key={game.id}
    onClick={() => router.push(`/replay/${game.id}`)}
    className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="w-5 h-5 rounded-full flex-shrink-0"
          style={{ backgroundColor: winnerColor }}
        />
        <div>
          <div className="font-medium text-gray-900">
            <span style={{ color: winnerColor }}>{winnerName}</span> won
          </div>
          <div className="text-xs text-gray-500">
            {game.playerCount} players &middot; {game.totalMoves} moves &middot; {dateStr}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {game.longestHop > 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
            ✶ {Math.round(game.longestHop)}%
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/review/${game.id}`); }}
          className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          title="Review this game"
        >
          Review
        </button>
        <button
          onClick={(e) => handleDelete(game.id, e)}
          className="text-gray-400 hover:text-red-500 transition-colors p-1"
          title="Delete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Type-check both modified files**

```bash
npm run build 2>&1 | grep -E "GameOverDialog|replays/page" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/GameOverDialog.tsx src/app/replays/page.tsx
git commit -m "feat: add Review Game entry points to game-over dialog and replays list"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify replays list entry point**

1. Open `http://localhost:3000/replays`
2. Confirm each game card has a "Review" button
3. Click "Review" on one game — should navigate to `/review/[id]`
4. Confirm the board loads with the game state at move 0
5. Confirm the move history list is visible with all moves
6. Confirm the Review panel is visible on the right

- [ ] **Step 3: Verify navigation**

1. Click any move in the move list — board should jump to that position
2. Press left/right arrow keys — board should step backward/forward
3. Drag the scrubber — board should jump to that move
4. Click `|<` and `>|` buttons — should go to first/last move

- [ ] **Step 4: Verify flagging flow**

1. Click ⚑ on any move in the list
2. Confirm the Review panel switches to the form, showing the move details
3. Click "Select piece…" then click a piece on the board, then click a destination
4. Confirm the suggested move coordinates appear in the panel
5. Type a note in the textarea
6. Click "Save flag" — confirm the move row now shows a red ⚑
7. Confirm the panel returns to the flag list showing the saved flag

- [ ] **Step 5: Verify edit flow**

1. Click ⚑ on a move that already has a flag
2. Confirm the form opens with the existing note pre-filled and suggested move pre-filled
3. Change the note and click "Update flag"
4. Confirm the flag list shows the updated note

- [ ] **Step 6: Verify export**

1. With at least one flag saved, click "Export" in the review panel
2. Paste into a text editor — confirm it shows only flags for the current game
3. Open a different game's review page — confirm the flag list is empty (flags are game-scoped)

- [ ] **Step 7: Verify game-over entry point**

1. Play a game to completion
2. Confirm the game-over dialog has "Review Game" button
3. Click it — should navigate to `/review/[id]` for the just-finished game

- [ ] **Step 8: Run full test suite**

```bash
npm run test
```

Expected: all tests pass (only pre-existing pathfinding.test.ts TS errors remain).

- [ ] **Step 9: Final commit (if any stray changes)**

```bash
git status
```

If clean, no commit needed. If there are small fixups, commit them:

```bash
git add -p
git commit -m "fix: review mode polish"
```
