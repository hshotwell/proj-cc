# Online Hex Chess + End-Game Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hex chess playable in online games (lobby toggle, boards, AI, turn sync, rematch) and give hex chess the same end-game options as Sternhalma (Play Again / Watch Replay / Review Game / Rematch online).

**Architecture:** The Convex backend stays a trust-the-client turn relay. A `gameType` field on `onlineGames` switches the lobby and `/online/[id]` page between the existing Sternhalma flow and a new hex chess flow. Hex chess turns are single serialized moves replayed deterministically on every client via `legalMoves`/`applyMove`. A new `/hexchess/review/[id]` page adds the flagging workflow.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand, Convex, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-online-hexchess-design.md`.
- **Do NOT commit.** User preference is no auto-commit. Leave all changes in the working tree. (Ignore any "Commit" convention from process skills.)
- **Do NOT modify or stage** the user's in-progress files: `src/game/ai/hexchess/evaluate.ts`, `src/game/ai/hexchess/search.ts`, `src/hooks/useHexChessAITurn.ts`, `tests/game/ai/hexchess/evaluate.test.ts`, `tests/game/ai/hexchess/tacticalPuzzles.test.ts`, `tests/game/ai/hexchess/searchAllLinesLose.test.ts`.
- `tests/game/pathfinding.test.ts` has pre-existing TS errors — not yours.
- Run single test file: `npx vitest run tests/path/file.test.ts`. Full suite: `npm run test`. Types: `npm run build` (or `npx tsc --noEmit`).
- After editing `convex/schema.ts` or adding Convex functions, run `npx convex codegen` so `convex/_generated/api` picks them up (needed for typecheck). Deploying to the dev deployment (`npx convex dev --once`) is only needed for browser verification at the end.
- Path alias `@/*` → `./src/*`. Convex files import shared src code via relative paths (`../src/...`) — see `convex/trainingV2Actions.ts:22` for precedent.
- Amendment to spec: online hex chess with **no** board selected = the standard star board (`layoutPreset: 'v1-default'`, no layout — matches the play page), NOT the Traditional board. Traditional is a selectable built-in layout, tracked by a new `selectedBuiltinLayoutId` field. The spec's "default = Traditional" line is superseded by this.

---

### Task 1: Layout cloud-sync passthrough (pre-existing bug fix)

Hex chess fields are silently stripped when layouts sync to Convex. Add passthrough fields end to end.

**Files:**
- Modify: `convex/schema.ts` (boardLayouts table, ~line 39)
- Modify: `convex/layouts.ts` (listLayouts, saveLayout, updateLayout)
- Modify: `src/services/storage/cloudStorage.ts` (~line 49, `save`)

**Interfaces:**
- Produces: `boardLayouts` rows carry `gameMode`, `hexPieces`, `promotionPositions`, `promotionOptions`, `rotated30`, `defaultColors`, `playerCountConfig`, `pieceSpecialties`, `powerups`, `puzzleGoalMoves` (all optional `v.any()` except `gameMode`/`rotated30`/`puzzleGoalMoves` which can be typed). Task 3's `resolveGameStart` and `getLobbyBoards` read these.

- [ ] **Step 1: Extend the `boardLayouts` table** in `convex/schema.ts` — add after `isDefault: v.boolean(),`:

```ts
    // Mode & hex chess passthrough fields (see src/types/game.ts BoardLayout)
    gameMode: v.optional(v.union(v.literal("sternhalma"), v.literal("hexchess"))),
    hexPieces: v.optional(v.any()),
    promotionPositions: v.optional(v.any()),
    promotionOptions: v.optional(v.any()),
    rotated30: v.optional(v.boolean()),
    defaultColors: v.optional(v.any()),
    playerCountConfig: v.optional(v.any()),
    pieceSpecialties: v.optional(v.any()),
    powerups: v.optional(v.any()),
    puzzleGoalMoves: v.optional(v.number()),
```

- [ ] **Step 2: Thread the fields through `convex/layouts.ts`.**

Define once at the top of the file:

```ts
const LAYOUT_EXTRA_FIELDS = [
  "gameMode", "hexPieces", "promotionPositions", "promotionOptions",
  "rotated30", "defaultColors", "playerCountConfig", "pieceSpecialties",
  "powerups", "puzzleGoalMoves",
] as const;
```

1. `listLayouts` — in the returned `layouts.map((l) => ({...}))`, after `isDefault: l.isDefault,` add:
```ts
      ...Object.fromEntries(
        LAYOUT_EXTRA_FIELDS.filter((f) => (l as any)[f] !== undefined).map((f) => [f, (l as any)[f]])
      ),
```
2. `saveLayout` — add to `args` (all optional, matching the schema types above):
```ts
    gameMode: v.optional(v.union(v.literal("sternhalma"), v.literal("hexchess"))),
    hexPieces: v.optional(v.any()),
    promotionPositions: v.optional(v.any()),
    promotionOptions: v.optional(v.any()),
    rotated30: v.optional(v.boolean()),
    defaultColors: v.optional(v.any()),
    playerCountConfig: v.optional(v.any()),
    pieceSpecialties: v.optional(v.any()),
    powerups: v.optional(v.any()),
    puzzleGoalMoves: v.optional(v.number()),
```
Change the handler signature to `async (ctx, { layoutId, name, cells, startingPositions, goalPositions, walls, isDefault, ...extra })` and spread `...extra` into both the `ctx.db.patch(existing._id, {...})` and `ctx.db.insert("boardLayouts", {...})` objects.
3. `updateLayout` — add the same optional args; in the patch-building block add:
```ts
    for (const f of LAYOUT_EXTRA_FIELDS) {
      if ((updates as any)[f] !== undefined) patch[f] = (updates as any)[f];
    }
```

- [ ] **Step 3: Send the fields from the client.** In `src/services/storage/cloudStorage.ts` `save()`, after `isDefault: layout.isDefault ?? false,` add:

```ts
        ...(layout.gameMode !== undefined ? { gameMode: layout.gameMode } : {}),
        ...(layout.hexPieces !== undefined ? { hexPieces: layout.hexPieces } : {}),
        ...(layout.promotionPositions !== undefined ? { promotionPositions: layout.promotionPositions } : {}),
        ...(layout.promotionOptions !== undefined ? { promotionOptions: layout.promotionOptions } : {}),
        ...(layout.rotated30 !== undefined ? { rotated30: layout.rotated30 } : {}),
        ...(layout.defaultColors !== undefined ? { defaultColors: layout.defaultColors } : {}),
        ...(layout.playerCountConfig !== undefined ? { playerCountConfig: layout.playerCountConfig } : {}),
        ...(layout.pieceSpecialties !== undefined ? { pieceSpecialties: layout.pieceSpecialties } : {}),
        ...(layout.powerups !== undefined ? { powerups: layout.powerups } : {}),
        ...(layout.puzzleGoalMoves !== undefined ? { puzzleGoalMoves: layout.puzzleGoalMoves } : {}),
```

- [ ] **Step 4: Regenerate + typecheck.** Run `npx convex codegen`, then `npx tsc --noEmit`. Expected: no new errors (pathfinding.test.ts errors are pre-existing).

---

### Task 2: Shared online hex chess module (`src/game/hexchess/onlineState.ts`)

Pure serialization/reconstruction logic, fully unit-tested. Also extracts `applyResign` so the store and online replay share one implementation.

**Files:**
- Create: `src/game/hexchess/onlineState.ts`
- Modify: `src/store/hexChessStore.ts` (resign uses `applyResign`)
- Modify: `src/game/hexchess/index.ts` (re-export nothing new needed; import from the module path directly)
- Test: `tests/game/hexchess/onlineState.test.ts`

**Interfaces:**
- Consumes: `createInitialState`, `applyMove`, `confirmPromotion`, `legalMoves` from `@/game/hexchess`; `eliminatePlayer` from `@/game/hexchess/moves`; `nextLivingPlayer` from `@/game/hexchess/board`; `snapshotFromLayout`, `hexSeatsOfSnapshot` from `@/game/hexchess`; `TRADITIONAL_HEX_LAYOUT` from `@/game/hexchess/traditionalLayout`; `OnlinePlayerSlot` from `@/game/onlineState`; `coordKey` from `@/game/coordinates`.
- Produces (used by Tasks 3, 5, 6):
  - `BUILTIN_HEX_LAYOUTS: Record<string, BoardLayout>` (key `'builtin-traditional-hexchess'`)
  - `type OnlineHexTurnPayload = { kind: 'move'; pieceId: string; from: string; to: string; promotion: HexPieceType | null } | { kind: 'resign' }`
  - `interface OnlineHexTurn { playerIndex: number; moves: OnlineHexTurnPayload }`
  - `interface OnlineHexGameData { _id: string; hostId: string; status: 'lobby'|'playing'|'finished'|'abandoned'; playerCount: number; players: OnlinePlayerSlot[]; turns?: OnlineHexTurn[]; customLayout?: BoardLayout; selectedBuiltinLayoutId?: string; currentPlayerIndex?: number; gameType?: 'sternhalma'|'hexchess' }`
  - `buildHexConfigFromOnline(data: OnlineHexGameData): HexChessConfig`
  - `reconstructHexChessOnline(data: OnlineHexGameData): { config: HexChessConfig; state: HexChessState; lastMove: HexMove | null }`
  - `serializeHexMove(move: HexMove): OnlineHexTurnPayload & { kind: 'move' }`
  - `applyResign(state: HexChessState, seat: HexPlayerIndex): HexChessState`

- [ ] **Step 1: Write the failing tests** in `tests/game/hexchess/onlineState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildHexConfigFromOnline, reconstructHexChessOnline,
  serializeHexMove, applyResign,
  type OnlineHexGameData, type OnlineHexTurn,
} from '@/game/hexchess/onlineState';
import { createInitialState, applyMove, legalMoves, confirmPromotion } from '@/game/hexchess';
import type { HexChessConfig, HexMove } from '@/game/hexchess';
import type { OnlinePlayerSlot } from '@/game/onlineState';

function slots(n: number, aiSlots: number[] = []): OnlinePlayerSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i,
    type: aiSlots.includes(i) ? ('ai' as const) : ('human' as const),
    userId: aiSlots.includes(i) ? undefined : `user-${i}`,
    username: aiSlots.includes(i) ? undefined : `Player ${i}`,
    color: ['#ffffff', '#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#a855f7'][i],
    ...(aiSlots.includes(i) ? { aiConfig: { difficulty: 'medium', personality: 'generalist' } } : {}),
    isReady: true,
  }));
}

function baseData(n: number, aiSlots: number[] = []): OnlineHexGameData {
  return {
    _id: 'game123', hostId: 'user-0', status: 'playing',
    playerCount: n, players: slots(n, aiSlots), turns: [],
    gameType: 'hexchess', currentPlayerIndex: 0,
  };
}

// Deterministic move picker: first legal move sorted by (pieceId, to).
function pickMove(moves: HexMove[]): HexMove {
  return [...moves].sort((a, b) =>
    (a.pieceId + `|${a.to.q},${a.to.r}`).localeCompare(b.pieceId + `|${b.to.q},${b.to.r}`)
  )[0];
}

describe('buildHexConfigFromOnline', () => {
  it('maps slots to standard-board seats with colors, names, and AI', () => {
    const config = buildHexConfigFromOnline(baseData(2, [1]));
    expect(config.seats).toEqual([0, 2]);          // ACTIVE_PLAYERS[2]
    expect(config.players[0]!.name).toBe('Player 0');
    expect(config.players[0]!.color).toBe('#ffffff');
    expect(config.players[2]!.isAI).toBe(true);
    expect(config.ai).toEqual({ 2: 'medium' });
    expect(config.layout).toBeUndefined();
    expect(config.layoutPreset).toBe('v1-default');
  });

  it('uses the Traditional built-in board seats when selectedBuiltinLayoutId is set', () => {
    const config = buildHexConfigFromOnline({
      ...baseData(2), selectedBuiltinLayoutId: 'builtin-traditional-hexchess',
    });
    expect(config.seats).toEqual([0, 4]);          // Traditional armies
    expect(config.layout).toBeDefined();
    expect(config.layoutPreset).toBe('custom');
  });
});

describe('reconstructHexChessOnline', () => {
  it('round-trips a sequence of played moves', () => {
    const data = baseData(2);
    const config = buildHexConfigFromOnline(data);
    let local = createInitialState(config);
    const turns: OnlineHexTurn[] = [];
    for (let i = 0; i < 8; i++) {
      const move = pickMove(legalMoves(local));
      const slotIndex = config.seats.indexOf(move.player);
      local = applyMove(local, move);
      turns.push({ playerIndex: slotIndex, moves: serializeHexMove(move) });
    }
    const { state } = reconstructHexChessOnline({ ...data, turns });
    expect(state.moveHistory.length).toBe(8);
    expect(state.currentPlayer).toBe(local.currentPlayer);
    expect(state.pieces).toEqual(local.pieces);
    expect(state.result).toEqual(local.result);
  });

  it('applies recorded promotions during replay', () => {
    // Craft a position one step from promotion using the same layout-building
    // approach as tests/game/hexchess/promotion.test.ts, then: apply the
    // promoting move locally, confirmPromotion(state, 'queen'), serialize it
    // (serializeHexMove reads move.promotion from moveHistory after
    // confirmPromotion patches it), reconstruct, and assert the promoted
    // piece type is 'queen' and pendingPromotion is null.
  });

  it('throws on an illegal turn payload', () => {
    const data = baseData(2);
    expect(() => reconstructHexChessOnline({
      ...data,
      turns: [{ playerIndex: 0, moves: { kind: 'move', pieceId: 'nope', from: '0,0', to: '1,1', promotion: null } }],
    })).toThrow();
  });

  it('replays a resign turn (2p: resignation result)', () => {
    const data = baseData(2);
    const { state } = reconstructHexChessOnline({
      ...data, turns: [{ playerIndex: 1, moves: { kind: 'resign' } }],
    });
    expect(state.result).toEqual({ winner: 0, reason: 'resignation' });
  });

  it('replays a resign turn (3p: elimination, game continues)', () => {
    const data = baseData(3);
    const { state } = reconstructHexChessOnline({
      ...data, turns: [{ playerIndex: 1, moves: { kind: 'resign' } }],
    });
    // seats for 3p are ACTIVE_PLAYERS[3] = [0, 3, 1]; slot 1 = seat 3
    expect(state.eliminated).toEqual([3]);
    expect(state.result).toBeNull();
  });
});

describe('applyResign', () => {
  it('second resignation in 3p ends the game', () => {
    const config = buildHexConfigFromOnline(baseData(3));
    let state = createInitialState(config);
    state = applyResign(state, config.seats[1]);
    state = applyResign(state, config.seats[2]);
    expect(state.result?.winner).toBe(config.seats[0]);
  });
});
```

Fill in the promotion test body for real (the comment describes the approach; copy the minimal-layout scaffolding from `tests/game/hexchess/promotion.test.ts` and adapt).

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/game/hexchess/onlineState.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/hexchess/onlineState.ts`:**

```ts
import type { BoardLayout } from '@/types/game';
import type {
  HexChessConfig, HexChessState, HexMove, HexPieceType, HexPlayerIndex,
} from './state';
import { createInitialState } from './starting';   // adjust to the actual export site used by src/game/hexchess/index.ts
import { applyMove, legalMoves, confirmPromotion, eliminatePlayer } from './moves';
import { nextLivingPlayer } from './board';
import { snapshotFromLayout, hexSeatsOfSnapshot } from './geometry';
import { TRADITIONAL_HEX_LAYOUT } from './traditionalLayout';
import { coordKey } from '@/game/coordinates';
import { ACTIVE_PLAYERS } from '@/game/constants';
import type { OnlinePlayerSlot } from '@/game/onlineState';

export const BUILTIN_HEX_LAYOUTS: Record<string, BoardLayout> = {
  [TRADITIONAL_HEX_LAYOUT.id]: TRADITIONAL_HEX_LAYOUT,
};

export type OnlineHexTurnPayload =
  | { kind: 'move'; pieceId: string; from: string; to: string; promotion: HexPieceType | null }
  | { kind: 'resign' };

export interface OnlineHexTurn {
  playerIndex: number;
  moves: OnlineHexTurnPayload;
}

export interface OnlineHexGameData {
  _id: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  playerCount: number;
  players: OnlinePlayerSlot[];
  turns?: OnlineHexTurn[];
  customLayout?: BoardLayout;
  selectedBuiltinLayoutId?: string;
  currentPlayerIndex?: number;
  gameType?: 'sternhalma' | 'hexchess';
}

const HEX_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export function buildHexConfigFromOnline(data: OnlineHexGameData): HexChessConfig {
  const layoutSource = data.customLayout
    ?? (data.selectedBuiltinLayoutId ? BUILTIN_HEX_LAYOUTS[data.selectedBuiltinLayoutId] : undefined);
  const snapshot = layoutSource ? snapshotFromLayout(layoutSource) : undefined;
  const seats: HexPlayerIndex[] = snapshot
    ? hexSeatsOfSnapshot(snapshot)
    : (ACTIVE_PLAYERS[data.playerCount as 2 | 3 | 4 | 6] as HexPlayerIndex[]);

  const players: HexChessConfig['players'] = {};
  const aiMap: NonNullable<HexChessConfig['ai']> = {};
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const slot = data.players[i];
    if (!slot) continue;
    const difficulty = HEX_DIFFICULTIES.has(slot.aiConfig?.difficulty ?? '')
      ? (slot.aiConfig!.difficulty as 'easy' | 'medium' | 'hard')
      : 'medium';
    players[seat] = {
      color: slot.color,
      name: slot.username ?? (slot.type === 'ai' ? `AI (${difficulty})` : `Player ${i + 1}`),
      isAI: slot.type === 'ai',
    };
    if (slot.type === 'ai') aiMap[seat] = difficulty;
  }

  return {
    id: data._id,
    seats,
    players,
    layoutPreset: snapshot ? 'custom' : 'v1-default',
    ...(snapshot ? { layout: snapshot } : {}),
    ai: Object.keys(aiMap).length > 0 ? aiMap : null,
  };
}

export function serializeHexMove(move: HexMove): OnlineHexTurnPayload & { kind: 'move' } {
  return {
    kind: 'move',
    pieceId: move.pieceId,
    from: coordKey(move.from),
    to: coordKey(move.to),
    promotion: move.promotion,
  };
}

/** Resignation: 2p ends the game; 3+ eliminates the seat (game may continue). */
export function applyResign(state: HexChessState, seat: HexPlayerIndex): HexChessState {
  if (state.result !== null) return state;
  if (state.activePlayers.length === 2) {
    const winner = nextLivingPlayer(state, seat);
    return { ...state, result: { winner, reason: 'resignation' } };
  }
  return eliminatePlayer(state, seat);
}

export function reconstructHexChessOnline(
  data: OnlineHexGameData,
): { config: HexChessConfig; state: HexChessState; lastMove: HexMove | null } {
  const config = buildHexConfigFromOnline(data);
  let state = createInitialState(config);
  let lastMove: HexMove | null = null;

  for (const turn of data.turns ?? []) {
    const payload = turn.moves;
    if (payload.kind === 'resign') {
      const seat = config.seats[turn.playerIndex];
      if (seat === undefined) throw new Error(`[hexchess online] resign from unknown slot ${turn.playerIndex}`);
      state = applyResign(state, seat);
      continue;
    }
    const move = legalMoves(state).find(
      (m) => m.pieceId === payload.pieceId && coordKey(m.to) === payload.to,
    );
    if (!move) {
      throw new Error(`[hexchess online] illegal turn: ${payload.pieceId} -> ${payload.to}`);
    }
    state = applyMove(state, move);
    if (state.pendingPromotion !== null && payload.promotion) {
      state = confirmPromotion(state, payload.promotion);
    }
    lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  }

  return { config, state, lastMove };
}
```

Check the actual import sites: `src/game/hexchess/index.ts` re-exports `createInitialState`, `applyMove`, `legalMoves`, `confirmPromotion` — import from `'./index'`-equivalent internal modules the same way `hexChessStore.ts` does (it imports from `@/game/hexchess` and `@/game/hexchess/moves`/`board`). Match those exact paths.

- [ ] **Step 4: DRY the store.** In `src/store/hexChessStore.ts`, replace the body of `resign(seat)` with:

```ts
  resign(seat) {
    const { state, config } = get();
    if (!state || state.result !== null) return;
    const resigningSeat = seat ?? state.currentPlayer;
    const nextState = applyResign(state, resigningSeat);
    set({ state: nextState });
    if (config) saveHexChessGame(config, nextState);
  },
```

with `import { applyResign } from '@/game/hexchess/onlineState';` added, and remove the now-unused `eliminatePlayer` / `nextLivingPlayer` imports if nothing else uses them.

- [ ] **Step 5: Run tests.** `npx vitest run tests/game/hexchess/onlineState.test.ts` — Expected: PASS. Also run `npx vitest run tests/game/hexchess` to confirm no store/persistence regressions.

---

### Task 3: Convex backend — gameType, setGameType, setLayout builtin, resolveGameStart, submitTurn, rematch

**Files:**
- Modify: `convex/schema.ts` (onlineGames table)
- Modify: `convex/onlineGames.ts`

**Interfaces:**
- Consumes: `TRADITIONAL_HEX_LAYOUT` via `import { TRADITIONAL_HEX_LAYOUT } from "../src/game/hexchess/traditionalLayout";` and `import { COLOR_DISPLAY_ORDER, NEUTRAL_COLORS } from "../src/game/constants";` (relative-path convex imports, precedent at `convex/trainingV2Actions.ts:22`). If either module transitively imports browser-only code and breaks `npx convex codegen`, inline the needed data instead (list the 10+4 hex colors as a const; hardcode Traditional's id `'builtin-traditional-hexchess'` and seat count 2).
- Produces (used by Tasks 4–6):
  - `onlineGames.gameType?: 'sternhalma' | 'hexchess'`, `onlineGames.selectedBuiltinLayoutId?: string`
  - `api.onlineGames.setGameType({ gameId, gameType })`
  - `api.onlineGames.setLayout({ gameId, selectedLayoutId: Id | null, builtinLayoutId?: string })`
  - `api.onlineGames.submitTurn({ gameId, moves, playerFinished?, nextPlayerIndex?, result?, resign? })`
  - `getLobbyBoards` rows additionally carry `gameMode`, `hexPieces`, `promotionPositions`, `promotionOptions`, `rotated30`, `defaultColors`, `playerCountConfig`; for hex boards `playerCounts` = `[<army count>]`.

- [ ] **Step 1: Schema.** In `convex/schema.ts` `onlineGames`, after `selectedLayoutId`:

```ts
    gameType: v.optional(v.union(v.literal("sternhalma"), v.literal("hexchess"))),
    selectedBuiltinLayoutId: v.optional(v.string()),
```

- [ ] **Step 2: `setGameType` mutation.** Add to `convex/onlineGames.ts`:

```ts
// Plain colors allowed in hex chess (piece-skin rows are sternhalma-only).
const HEX_CHESS_COLORS = new Set(
  [...COLOR_DISPLAY_ORDER, ...NEUTRAL_COLORS].map((c) => c.toLowerCase())
);
const HEX_CHESS_2P_DEFAULTS = ["#ffffff", "#1a1a1a"];

export const setGameType = mutation({
  args: {
    gameId: v.id("onlineGames"),
    gameType: v.union(v.literal("sternhalma"), v.literal("hexchess")),
  },
  handler: async (ctx, { gameId, gameType }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can change the game type");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if ((game.gameType ?? "sternhalma") === gameType) return;

    const players = (game.players as any[]).map((p, i) => {
      let color = p.color;
      if (gameType === "hexchess" && !HEX_CHESS_COLORS.has(String(color).toLowerCase())) {
        color = SLOT_COLORS[i];
      }
      return { ...p, color, isReady: false };
    });
    // Classic chess defaults for a 2-player hex chess lobby, when both colors
    // are still slot defaults (don't clobber deliberate choices).
    if (gameType === "hexchess" && players.length === 2) {
      const bothDefault = players.every((p) => SLOT_COLORS.includes(p.color));
      if (bothDefault) {
        players[0] = { ...players[0], color: HEX_CHESS_2P_DEFAULTS[0] };
        players[1] = { ...players[1], color: HEX_CHESS_2P_DEFAULTS[1] };
      }
    }

    await ctx.db.patch(gameId, {
      gameType,
      players,
      selectedLayoutId: undefined,
      selectedBuiltinLayoutId: undefined,
      gameMode: "normal",
      teamMode: false,
    });
  },
});
```

- [ ] **Step 3: `setLayout` gains built-ins and hex slot rebuilding.** Replace the `setLayout` handler:

```ts
const BUILTIN_HEX_LAYOUT_IDS = new Set([TRADITIONAL_HEX_LAYOUT.id]);

function hexArmyCount(hexPieces: Record<string, { player: number }> | undefined): number {
  return new Set(Object.values(hexPieces ?? {}).map((p) => p.player)).size;
}

/** Rebuild slots for a new player count, preserving existing humans (same logic as updateBoardConfig). */
function rebuildSlots(existing: any[], playerCount: number): any[] {
  const humans = existing.filter((p: any) => p.type === "human" && p.userId);
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const human = humans[i];
    if (human) players.push({ ...human, slot: i, isReady: false });
    else players.push({ slot: i, type: "empty" as const, color: SLOT_COLORS[i], isReady: false });
  }
  return players;
}
```

In the handler, after the host/lobby guards:

```ts
    if (builtinLayoutId !== undefined && builtinLayoutId !== null) {
      if (!BUILTIN_HEX_LAYOUT_IDS.has(builtinLayoutId)) throw new Error("Unknown built-in board");
      const count = hexArmyCount(TRADITIONAL_HEX_LAYOUT.hexPieces as any);
      await ctx.db.patch(gameId, {
        selectedBuiltinLayoutId: builtinLayoutId,
        selectedLayoutId: undefined,
        playerCount: count,
        players: rebuildSlots(game.players as any[], count),
      });
      return;
    }

    if (selectedLayoutId === null) {
      await ctx.db.patch(gameId, { selectedLayoutId: undefined, selectedBuiltinLayoutId: undefined });
      return;
    }
```

Keep the existing custom-layout validation, then for the final patch: if the layout's `gameMode === "hexchess"`, validate it has `hexPieces` with ≥2 armies (instead of the startingPositions check) and set player count from armies:

```ts
    if ((layout as any).gameMode === "hexchess") {
      const count = hexArmyCount((layout as any).hexPieces);
      if (count < 2) throw new Error("Hex chess board needs at least two armies");
      await ctx.db.patch(gameId, {
        selectedLayoutId,
        selectedBuiltinLayoutId: undefined,
        playerCount: count,
        players: rebuildSlots(game.players as any[], count),
      });
      return;
    }
    await ctx.db.patch(gameId, { selectedLayoutId, selectedBuiltinLayoutId: undefined });
```

Also add `builtinLayoutId: v.optional(v.union(v.string(), v.null()))` to the args. Refactor `updateBoardConfig`'s inline slot-rebuild loop to call `rebuildSlots` (it's identical logic — keep its team-mode reset and invite cleanup).

- [ ] **Step 4: `resolveGameStart` carries hex layout fields.** In the `if (game.selectedLayoutId)` branch, extend `patch.customLayout` with the passthrough fields (they exist on the doc after Task 1):

```ts
      patch.customLayout = {
        id: layout.layoutId,
        name: layout.name,
        cells: layout.cells,
        startingPositions: layout.startingPositions,
        goalPositions: layout.goalPositions,
        walls: layout.walls,
        isDefault: layout.isDefault,
        gameMode: (layout as any).gameMode,
        hexPieces: (layout as any).hexPieces,
        promotionPositions: (layout as any).promotionPositions,
        promotionOptions: (layout as any).promotionOptions,
        rotated30: (layout as any).rotated30,
        defaultColors: (layout as any).defaultColors,
        playerCountConfig: (layout as any).playerCountConfig,
      };
```

(`selectedBuiltinLayoutId` is already on the doc and needs no start-time handling.)

- [ ] **Step 5: `submitTurn` hex chess extensions.** New args:

```ts
    nextPlayerIndex: v.optional(v.number()),
    result: v.optional(v.any()),
    resign: v.optional(v.boolean()),
```

Handler changes:

```ts
    let turnPlayerIndex = currentPlayerIndex;
    if (resign) {
      // Resignation is allowed from any participating human at any time
      // (the client only offers it to living seats).
      const slotIdx = players.findIndex((p: any) => p.userId === userId);
      if (slotIdx === -1) throw new Error("Not a participant");
      turnPlayerIndex = slotIdx;
    } else {
      // existing auth: current human player, or host for an AI seat
      const isCurrentPlayer = currentSlot.type === "human" && currentSlot.userId === userId;
      const isHostForAI = currentSlot.type === "ai" && game.hostId === userId;
      if (!isCurrentPlayer && !isHostForAI) throw new Error("Not your turn");
    }

    turns.push({ playerIndex: turnPlayerIndex, moves });
```

Advance/finish logic — hex chess games (`game.gameType === "hexchess"`) skip the sternhalma finishedPlayers flow entirely:

```ts
    if (game.gameType === "hexchess") {
      const finished = result != null;
      await ctx.db.patch(gameId, {
        turns,
        currentPlayerIndex: nextPlayerIndex ?? currentPlayerIndex,
        status: finished ? "finished" : game.status,
        winner: finished && typeof result.winner === "number" ? result.winner : game.winner,
      });
      return;
    }
    // ... existing sternhalma advance/finish logic unchanged ...
```

- [ ] **Step 6: Rematch carries game type.** In `acceptRematch`, add `gameType: game.gameType, selectedBuiltinLayoutId: game.selectedBuiltinLayoutId,` to the `ctx.db.insert("onlineGames", {...})`, and skip the finish-placement reordering for hex chess (keep original slot order):

```ts
      const orderedPlayers: any[] =
        game.gameType === "hexchess" ? [...players] : /* existing reorder logic */;
```

- [ ] **Step 7: `getLobbyBoards` returns hex fields.** In the returned `allLayouts.map((layout) => {...})`, compute counts per mode and add the passthrough fields:

```ts
      const isHex = (layout as any).gameMode === "hexchess";
      const counts = isHex
        ? [hexArmyCount((layout as any).hexPieces)]
        : Object.keys(layout.startingPositions ?? {}).map(Number);
      return {
        // ...existing fields...
        playerCounts: counts,
        gameMode: (layout as any).gameMode,
        hexPieces: (layout as any).hexPieces,
        promotionPositions: (layout as any).promotionPositions,
        promotionOptions: (layout as any).promotionOptions,
        rotated30: (layout as any).rotated30,
        defaultColors: (layout as any).defaultColors,
        playerCountConfig: (layout as any).playerCountConfig,
      };
```

- [ ] **Step 8: Guard `selectColor` for hex lobbies.** After the color-taken check:

```ts
    if ((game.gameType ?? "sternhalma") === "hexchess" && !HEX_CHESS_COLORS.has(color.toLowerCase())) {
      throw new Error("That color is not available in hex chess");
    }
```

- [ ] **Step 9: Regenerate + typecheck.** `npx convex codegen && npx tsc --noEmit` — Expected: clean. If the `../src/...` imports break codegen, apply the fallback from the Interfaces note (inline constants) and re-run.

---

### Task 4: Lobby UI — game toggle + hex chess adaptations

**Files:**
- Modify: `src/app/lobby/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.onlineGames.setGameType`, extended `setLayout`, `getLobbyBoards` hex fields (Task 3). `TRADITIONAL_HEX_LAYOUT` from `@/game/hexchess/traditionalLayout`.
- Produces: lobby UI parity; no exports.

All steps edit `src/app/lobby/[id]/page.tsx`. After the edits run `npx tsc --noEmit` and `npm run lint`.

- [ ] **Step 1: Wiring.** Add near the other mutations/queries:

```ts
  const setGameTypeMutation = useMutation(api.onlineGames.setGameType);
```

After `const game = useQuery(...)` derive (place after the null-guards where `game` is non-null, alongside `players`):

```ts
  const gameType = ((game as any).gameType ?? 'sternhalma') as 'sternhalma' | 'hexchess';
  const isHexChess = gameType === 'hexchess';
  const selectedBuiltinLayoutId = (game as any).selectedBuiltinLayoutId as string | undefined;
```

Add module-level constants (top of file, mirroring `src/app/play/page.tsx:32-36`):

```ts
const HEX_CHESS_COLOR_SET = new Set(
  [...COLOR_DISPLAY_ORDER, ...NEUTRAL_COLORS].map((c) => c.toLowerCase()),
);
const isHexChessColor = (color: string): boolean => HEX_CHESS_COLOR_SET.has(color.toLowerCase());
```

and `import { TRADITIONAL_HEX_LAYOUT } from '@/game/hexchess/traditionalLayout';`.

- [ ] **Step 2: Game toggle.** Insert at the top of the "Game Setup" card (before the Players row), rendered for everyone but only interactive for the host:

```tsx
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Game</label>
            <div className="flex gap-2">
              {([
                { value: 'sternhalma' as const, label: 'Sternhalma' },
                { value: 'hexchess' as const, label: 'Hex Chess' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  disabled={!isHost}
                  onClick={() => isHost && void setGameTypeMutation({ gameId, gameType: value }).catch(console.error)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                    gameType === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : isHost
                        ? 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        : 'border-gray-200 bg-white text-gray-400 cursor-default'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 3: Conditional sections.**
  - Game Mode row (normal/turbo/ghost/big): wrap in `{!isHexChess && ( ... )}`.
  - Team Mode checkbox: change condition to `{!isHexChess && (game.playerCount === 4 || game.playerCount === 6) && ( ... )}`.
  - Player Count row: render only when `isHost && (!isHexChess || (!selectedBuiltinLayoutId && !(game as any).selectedLayoutId))` — hex chess with a selected board has its count fixed by the board's armies.
  - AI settings: hide the personality `<select>` when `isHexChess` (difficulty select stays).

- [ ] **Step 4: Board picker.** In the board-selector dropdown:
  - Filter boards by mode before the owner grouping: `const modeBoards = (lobbyBoards ?? []).filter((b: any) => ((b.gameMode ?? 'sternhalma')) === gameType);` and use `modeBoards` everywhere `lobbyBoards` was used inside the selector (keep the existing `validateLayout` filter on top).
  - The "Standard Board" entry stays (both modes), calling `handleSetLayout(null)`; its subtitle for hex chess: `2–6 players · star board`.
  - For hex chess add a "Traditional Hex Chess" built-in entry directly under Standard:

```tsx
                {isHexChess && (
                  <button
                    onClick={() => void setLayoutMutation({ gameId, selectedLayoutId: null, builtinLayoutId: TRADITIONAL_HEX_LAYOUT.id }).then(() => setShowBoardSelector(false)).catch(console.error)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 ${
                      selectedBuiltinLayoutId === TRADITIONAL_HEX_LAYOUT.id
                        ? 'font-medium text-blue-700 bg-blue-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Traditional Hex Chess
                    <span className="ml-2 text-xs text-gray-400">2 players · 91 cells</span>
                  </button>
                )}
```

  - The current-board label line: show `'Traditional Hex Chess'` when `selectedBuiltinLayoutId` is set, else the existing custom/standard logic.
  - `handleSetLayout` passes `builtinLayoutId: null` explicitly so selecting a custom board or Standard clears the built-in.

- [ ] **Step 5: Color picker.** Wrap the metallic row, gem row, flower row, egg row, and the `<ColorPicker>` (custom-color widget) each in `{!isHexChess && ( ... )}` so hex chess lobbies show only the plain `DEFAULT_COLORS` and `NEUTRAL_COLORS` rows. In the favorite-color auto-select effect (top of `LobbyContent`), add a guard right after reading `favoriteColor`:

```ts
    if (((game as any).gameType ?? 'sternhalma') === 'hexchess' && !isHexChessColor(favoriteColor)) return;
```

- [ ] **Step 6: Verify.** `npx tsc --noEmit && npm run lint` — Expected: clean.

---

### Task 5: `useOnlineHexChess` hook

**Files:**
- Create: `src/hooks/useOnlineHexChess.ts`

**Interfaces:**
- Consumes: Task 2 module; `api.onlineGames.getLobby` / `submitTurn`; `useHexChessStore`.
- Produces (used by Task 6):
  `useOnlineHexChess(gameId: Id<'onlineGames'>): { onlineGame; isMyTurn: boolean; isHost: boolean; isAITurn: boolean; isSubmitting: boolean; mySlotIndex: number; mySeat: HexPlayerIndex | undefined; submitResign: () => Promise<void> }`

- [ ] **Step 1: Implement the hook:**

```ts
'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/authStore';
import { useHexChessStore } from '@/store/hexChessStore';
import {
  reconstructHexChessOnline, serializeHexMove, applyResign,
  type OnlineHexGameData,
} from '@/game/hexchess/onlineState';
import type { HexPlayerIndex } from '@/game/hexchess';
import { playStep, playCapture, playCheck, playCheckmate } from '@/audio/soundEffects';
import { isInCheck } from '@/game/hexchess';
import { livingPlayers } from '@/game/hexchess/board';

export function useOnlineHexChess(gameId: Id<'onlineGames'>) {
  const onlineGame = useQuery(api.onlineGames.getLobby, { gameId });
  const submitTurn = useMutation(api.onlineGames.submitTurn);
  const { user } = useAuthStore();

  const lastSyncedTurnCount = useRef(-1);
  const lastSyncedMoveCount = useRef(0);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const players = (onlineGame?.players as { userId?: string; type: string }[]) ?? [];
  const mySlotIndex = players.findIndex((p) => p.userId === user?.id);
  const isHost = onlineGame?.hostId === user?.id;
  const status = onlineGame?.status;

  const reconstructed = useMemo(() => {
    if (!onlineGame || (status !== 'playing' && status !== 'finished')) return null;
    try {
      return reconstructHexChessOnline(onlineGame as unknown as OnlineHexGameData);
    } catch (e) {
      console.error('[OnlineHexChess] Failed to reconstruct state:', e);
      return null;
    }
  }, [onlineGame, status]);

  // Sync server state into the store whenever the turn count changes.
  useEffect(() => {
    if (!reconstructed || !onlineGame) return;
    const turns = (onlineGame.turns as unknown[]) ?? [];
    if (turns.length === lastSyncedTurnCount.current) return;
    const isInitialLoad = lastSyncedTurnCount.current === -1;
    const lastTurn = turns[turns.length - 1] as { playerIndex: number } | undefined;
    lastSyncedTurnCount.current = turns.length;
    lastSyncedMoveCount.current = reconstructed.state.moveHistory.length;
    isSubmittingRef.current = false;
    setIsSubmitting(false);

    useHexChessStore.setState({
      state: reconstructed.state,
      gameId: String(gameId),
      config: reconstructed.config,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: reconstructed.lastMove,
      animatingCapture: null,
      captureTimeoutId: null,
      // preMoves intentionally preserved — they fire when it becomes our turn
    });

    // Sounds for opponent turns (own moves already played locally).
    if (!isInitialLoad && lastTurn && lastTurn.playerIndex !== mySlotIndex) {
      const st = reconstructed.state;
      const lm = reconstructed.lastMove;
      if (lm?.capture) playCapture(reconstructed.config.players[lm.player]?.color);
      else if (lm) playStep();
      if (st.result !== null) playCheckmate();
      else if (livingPlayers(st).some((s) => isInCheck(st, s))) playCheck();
    }
  }, [reconstructed, onlineGame, gameId, mySlotIndex]);

  const currentSlotIndex = onlineGame?.currentPlayerIndex ?? 0;
  const isMyTurn = status === 'playing' && currentSlotIndex === mySlotIndex;
  const isAITurn = status === 'playing' && players[currentSlotIndex]?.type === 'ai';
  const mySeat: HexPlayerIndex | undefined =
    mySlotIndex >= 0 ? reconstructed?.config.seats[mySlotIndex] : undefined;

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    const s = useHexChessStore.getState();
    if (!s.state || !s.config) return;
    const newMoves = s.state.moveHistory.slice(lastSyncedMoveCount.current);
    if (newMoves.length === 0) return;
    const move = newMoves[newMoves.length - 1]; // hex chess: one move per turn
    const nextPlayerIndex = s.config.seats.indexOf(s.state.currentPlayer);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTurn({
        gameId,
        moves: serializeHexMove(move),
        nextPlayerIndex: nextPlayerIndex >= 0 ? nextPlayerIndex : currentSlotIndex,
        result: s.state.result ?? undefined,
      });
    } catch (e) {
      console.error('[OnlineHexChess] Failed to submit turn:', e);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [gameId, submitTurn, currentSlotIndex]);

  // Watch the store for locally-applied moves (human click, promotion confirm,
  // pre-move firing, or the host-run AI) and push them to the server.
  useEffect(() => {
    const unsubscribe = useHexChessStore.subscribe((state, prevState) => {
      if (!state.state || state.state === prevState.state) return;
      if (state.state.pendingPromotion !== null) return; // wait for the choice
      if (state.state.moveHistory.length <= lastSyncedMoveCount.current) return;
      if (isMyTurn || (isHost && isAITurn)) void handleSubmit();
    });
    return unsubscribe;
  }, [isMyTurn, isHost, isAITurn, handleSubmit]);

  const submitResign = useCallback(async () => {
    const s = useHexChessStore.getState();
    if (!s.state || !s.config || mySeat === undefined || isSubmittingRef.current) return;
    const after = applyResign(s.state, mySeat);
    const nextPlayerIndex = s.config.seats.indexOf(after.currentPlayer);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTurn({
        gameId,
        moves: { kind: 'resign' },
        resign: true,
        nextPlayerIndex: nextPlayerIndex >= 0 ? nextPlayerIndex : currentSlotIndex,
        result: after.result ?? undefined,
      });
    } catch (e) {
      console.error('[OnlineHexChess] Failed to resign:', e);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [gameId, submitTurn, mySeat, currentSlotIndex]);

  return { onlineGame, isMyTurn, isHost, isAITurn, isSubmitting, mySlotIndex, mySeat, submitResign };
}
```

- [ ] **Step 2: Typecheck.** `npx tsc --noEmit` — Expected: clean. (Behavior is exercised in Task 6's page and the final browser verification; the deterministic replay core is already unit-tested in Task 2.)

---

### Task 6: Online hex chess container + `/online/[id]` branch

**Files:**
- Create: `src/components/hexchess/OnlineHexChessContainer.tsx`
- Modify: `src/app/online/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 5 hook; `useHexChessAITurn(enabled)` (existing, do not edit the file); `useHexChessPreMoveFiring(localPlayer, enabled)`; `selectHexChessBoardView`; `PromotionPicker`, `HexTurnIndicator`, `HexMoveIndicator`, `HexClearPreMovesButton`; rematch mutations (`requestRematch`/`acceptRematch`/`declineRematch`); `saveHexChessGame`.
- Produces: `OnlineHexChessContainer({ gameId }: { gameId: Id<'onlineGames'> })` (default-less named export).

- [ ] **Step 1: Build `OnlineHexChessContainer.tsx`.** Start from `HexGameContainer.tsx` (copy its click/right-click routing verbatim) with these differences:

1. Top of component:
```tsx
  const { onlineGame, isMyTurn, isHost, isAITurn, isSubmitting, mySlotIndex, mySeat, submitResign } =
    useOnlineHexChess(gameId);
  useHexChessAITurn(isHost && isAITurn);
  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);
  const router = useRouter();
  const abandonGame = useMutation(api.onlineGames.abandonGame);
```
2. `localPlayer` is `mySeat` (not the single-human heuristic). Pre-moves:
```tsx
  const preMovesAllowed = !!(
    preMovesSetting && mySeat !== undefined && store.state &&
    store.state.result === null && !isMyTurn &&
    store.state.pendingPromotion === null
  );
  useHexChessPreMoveFiring(mySeat, preMovesSetting && mySeat !== undefined);
```
3. Interaction gating in `handleCellClick`: after the pre-move branch, add `if (!isMyTurn || isSubmitting) return;` (replaces the local AI-turn guard).
4. Promotion picker: only render the real-turn picker when `isMyTurn` (opponent promotions arrive resolved).
5. Resign: `HexMoveIndicator`'s `onResign` calls `window.confirm('Really resign?') && void submitResign()`; `canResign` is `store.state.result === null && mySeat !== undefined && !store.state.eliminated.includes(mySeat)`.
6. Status banners (below the board, copied style from `src/app/online/[id]/page.tsx:323-335`): "Waiting for {username}..." when not my turn and not AI turn; "AI is thinking..." during AI turns.
7. Header: `← Back` link to `/profile`; "Abandon Game" button (calls `abandonGame({ gameId })` then `router.push('/profile')`) while not finished.
8. Redirects: `useEffect` — status `'abandoned'` → `router.replace('/profile')`; `'lobby'` → `router.replace(`/lobby/${gameId}`)`.
9. Save on finish (once):
```tsx
  const savedRef = useRef(false);
  useEffect(() => {
    if (onlineGame?.status === 'finished' && store.state && store.config && !savedRef.current) {
      savedRef.current = true;
      saveHexChessGame(store.config, store.state);
      playGameOver();
    }
  }, [onlineGame?.status, store.state, store.config]);
```
10. Render `<OnlineHexGameOverDialog ... />` — defined in Task 8 within this same file; for THIS task render nothing on game over yet (add a placeholder `{/* game-over dialog added in Task 8 */}`) OR implement Task 8 immediately after — the file must typecheck at each task boundary, so use the placeholder.
11. Loading state: spinner div (copy from `src/app/online/[id]/page.tsx:251-257`) while `!onlineGame || !store.state || !store.config`.

- [ ] **Step 2: Branch the page.** In `src/app/online/[id]/page.tsx`, replace the default export with:

```tsx
function OnlineGameRouter() {
  const params = useParams();
  const gameId = params.id as Id<'onlineGames'>;
  const onlineGame = useQuery(api.onlineGames.getLobby, { gameId });

  if (!onlineGame) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (((onlineGame as any).gameType ?? 'sternhalma') === 'hexchess') {
    return <OnlineHexChessContainer gameId={gameId} />;
  }
  return <OnlineGameContent />;
}

export default function OnlineGamePage() {
  return (
    <AuthGuard>
      <OnlineGameRouter />
    </AuthGuard>
  );
}
```

(`useQuery` import from `convex/react` already partially present; add what's missing. Convex dedupes the duplicate `getLobby` subscription inside `useOnlineGame`.)

- [ ] **Step 3: Verify.** `npx tsc --noEmit && npm run lint` — Expected: clean.

---

### Task 7: Local end-game options (HexGameOverDialog + Play Again)

**Files:**
- Modify: `src/components/hexchess/HexGameOverDialog.tsx`
- Modify: `src/components/hexchess/HexGameContainer.tsx`

**Interfaces:**
- Produces: `HexGameOverDialogProps` gains optional `onPlayAgain?: () => void; replayHref?: string; reviewHref?: string` (Task 8's online dialog is separate and does NOT use this component).

- [ ] **Step 1: Extend the dialog.** In `HexGameOverDialog.tsx` add the three optional props and replace the button row with:

```tsx
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
            onClick={onHome}
          >
            Home
          </button>
          {replayHref && (
            <Link href={replayHref} className="px-3 py-1 text-sm rounded bg-amber-500 text-white hover:bg-amber-400">
              Replay
            </Link>
          )}
          {reviewHref && (
            <Link href={reviewHref} className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
              Review
            </Link>
          )}
          {onPlayAgain && (
            <button
              type="button"
              className="px-3 py-1 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
              onClick={onPlayAgain}
            >
              Play Again
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={onNewGame}
          >
            New Game
          </button>
        </div>
```

(`import Link from 'next/link';`. When `onPlayAgain` is present, "New Game" remains the route-to-`/play` action per the spec.)

- [ ] **Step 2: Wire the local container.** In `HexGameContainer.tsx`:

```tsx
  const handlePlayAgain = () => {
    const s = useHexChessStore.getState();
    if (!s.config) return;
    const newId = Math.random().toString(36).substring(2, 10);
    s.createGame({ ...s.config, id: newId });
    window.location.href = `/hexchess/${newId}`;
  };
```

and pass to the dialog:

```tsx
      <HexGameOverDialog
        state={store.state}
        config={store.config}
        onNewGame={handleNewGame}
        onHome={handleHome}
        onPlayAgain={handlePlayAgain}
        replayHref={`/hexchess/replay/${store.config.id}`}
        reviewHref={`/hexchess/review/${store.config.id}`}
      />
```

(`window.location.href` matches the container's existing navigation style; the store's `createGame` already persists the new game so the destination page can load it.)

- [ ] **Step 3: Verify.** `npx tsc --noEmit` — Expected: clean. (The review route 404s until Task 9; acceptable inside this working session, Task 9 lands before verification.)

---

### Task 8: Online hex chess game-over dialog with rematch

**Files:**
- Modify: `src/components/hexchess/OnlineHexChessContainer.tsx`

**Interfaces:**
- Consumes: rematch mutations; `HexChessState`/`HexChessConfig` from the store; `onlineGame` doc fields `rematchRequestedBy`, `rematchAcceptedBy`, `rematchDeclinedBy`, `rematchGameId`.
- Produces: internal `OnlineHexGameOverDialog` component rendered by the container (replaces Task 6's placeholder).

- [ ] **Step 1: Implement `OnlineHexGameOverDialog`** in the same file. It reuses `HexGameOverDialog`'s visual pattern (compact top banner, winner line + finish order — copy that JSX) but with online actions. Skeleton:

```tsx
function OnlineHexGameOverDialog({ gameId, onlineGame }: {
  gameId: Id<'onlineGames'>;
  onlineGame: NonNullable<ReturnType<typeof useOnlineHexChess>['onlineGame']>;
}) {
  const { state, config } = useHexChessStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const requestRematch = useMutation(api.onlineGames.requestRematch);
  const acceptRematch = useMutation(api.onlineGames.acceptRematch);
  const declineRematch = useMutation(api.onlineGames.declineRematch);

  const rematchGameId = onlineGame.rematchGameId as Id<'onlineGames'> | undefined;
  useEffect(() => {
    if (rematchGameId) router.replace(`/online/${rematchGameId}`);
  }, [rematchGameId, router]);

  if (onlineGame.status !== 'finished' || !state?.result || !config) return null;
  // ...winner header + multiplayer finish order copied from HexGameOverDialog...
  // Rematch state machine copied from OnlineGameOverDialog in
  // src/app/online/[id]/page.tsx:82-169 (iRequested / iAlreadyAccepted /
  // declined banners, Accept/Decline buttons) — reuse that JSX with the
  // banner's compact styling.
  // Action row:
  //   [Rematch] (when no request outstanding) -> requestRematch({ gameId })
  //   [Replay]  -> Link to `/hexchess/replay/${config.id}`
  //   [Review]  -> Link to `/hexchess/review/${config.id}`
  //   [Profile] -> router.push('/profile')
}
```

Write the full JSX (no placeholders in the actual code): winner/finish-order block from `HexGameOverDialog.tsx:38-64`, rematch banners/buttons from `src/app/online/[id]/page.tsx:130-169` restyled to `text-sm` banner scale, and the four action buttons.

- [ ] **Step 2: Render it** in the container where Task 6 left the placeholder:

```tsx
      {onlineGame && <OnlineHexGameOverDialog gameId={gameId} onlineGame={onlineGame} />}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit && npm run lint` — Expected: clean.

---

### Task 9: Hex chess review — types, store, page

**Files:**
- Modify: `src/types/review.ts`
- Modify: `src/store/aiReviewStore.ts`
- Create: `src/components/hexchess/HexReviewContainer.tsx`
- Create: `src/app/hexchess/review/[id]/page.tsx`
- Test: `tests/store/aiReviewStore.hexFlags.test.ts`

**Interfaces:**
- Produces:
  - `types/review.ts`: `HexBoardAfterSnapshot { pieces: Record<string, { player: number; type: string }> }`; `FlaggedHexMove { id: string; gameId: string | null; moveIndex: number; turnNumber: number; seat: number; difficulty?: string; actualMove: { pieceType: string; from: { q: number; r: number }; to: { q: number; r: number }; capture: string | null; promotion: string | null }; suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } }; note: string; boardAfter: HexBoardAfterSnapshot; timestamp: number }`
  - store: `hexFlags: FlaggedHexMove[]`, `addHexFlag(flag: Omit<FlaggedHexMove, 'id' | 'timestamp'>)`, `updateHexFlag(id, patch: Partial<Pick<FlaggedHexMove, 'suggestedMove' | 'note'>>)`, `removeHexFlag(id)`, `exportHexText(gameId?: string): string`. Existing `captureMode`/`captureFrom`/`captureTo`/`startCapture`/`captureCell`/`cancelCapture` are shared.

- [ ] **Step 1: Failing store test** `tests/store/aiReviewStore.hexFlags.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAIReviewStore } from '@/store/aiReviewStore';

const sampleFlag = {
  gameId: 'g1',
  moveIndex: 4,
  turnNumber: 3,
  seat: 2,
  difficulty: 'hard',
  actualMove: { pieceType: 'knight', from: { q: 1, r: 2 }, to: { q: 2, r: 1 }, capture: 'pawn', promotion: null },
  suggestedMove: { from: { q: 0, r: 3 }, to: { q: 2, r: 1 } },
  note: 'hangs the knight',
  boardAfter: { pieces: { '2,1': { player: 2, type: 'knight' }, '0,0': { player: 0, type: 'king' } } },
};

describe('aiReviewStore hex flags', () => {
  beforeEach(() => {
    useAIReviewStore.setState({ flags: [], hexFlags: [] });
  });

  it('adds, updates, and removes hex flags', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    let flags = useAIReviewStore.getState().hexFlags;
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBeTruthy();
    useAIReviewStore.getState().updateHexFlag(flags[0].id, { note: 'better: fork' });
    expect(useAIReviewStore.getState().hexFlags[0].note).toBe('better: fork');
    useAIReviewStore.getState().removeHexFlag(flags[0].id);
    expect(useAIReviewStore.getState().hexFlags).toHaveLength(0);
  });

  it('exports hex flags with piece-typed board snapshot', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    const text = useAIReviewStore.getState().exportHexText('g1');
    expect(text).toContain('HEX CHESS');
    expect(text).toContain('knight (1,2) → (2,1) x pawn');
    expect(text).toContain('Suggested:');
    expect(text).toContain('(2,1): P2 knight');
    expect(text).toContain('hangs the knight');
  });

  it('does not mix hex flags into the sternhalma export', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    expect(useAIReviewStore.getState().exportText('g1')).toContain('(no flags recorded)');
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/store/aiReviewStore.hexFlags.test.ts` — Expected: FAIL (`addHexFlag` not a function).

- [ ] **Step 3: Implement types + store.** Add the two interfaces to `src/types/review.ts` exactly as in Interfaces above. In `src/store/aiReviewStore.ts` add to the store interface and implementation:

```ts
      hexFlags: [],

      addHexFlag: (flag) =>
        set((s) => ({
          hexFlags: [...s.hexFlags, { ...flag, id: crypto.randomUUID(), timestamp: Date.now() }],
        })),

      removeHexFlag: (id) =>
        set((s) => ({ hexFlags: s.hexFlags.filter((f) => f.id !== id) })),

      updateHexFlag: (id, patch) =>
        set((s) => ({
          hexFlags: s.hexFlags.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      exportHexText: (gameId?: string) => {
        const { hexFlags } = get();
        const filtered = gameId ? hexFlags.filter((f) => f.gameId === gameId) : hexFlags;
        if (filtered.length === 0) return '(no flags recorded)';
        const lines: string[] = [
          '=== HEX CHESS MOVE REVIEW EXPORT ===',
          `Exported: ${new Date().toISOString()}`,
          `Flags: ${filtered.length}`,
          '',
        ];
        for (let i = 0; i < filtered.length; i++) {
          const f = filtered[i];
          const cap = f.actualMove.capture ? ` x ${f.actualMove.capture}` : '';
          const promo = f.actualMove.promotion ? ` =${f.actualMove.promotion}` : '';
          lines.push(`--- Flag ${i + 1} ---`);
          lines.push(`Turn ${f.turnNumber} | Seat ${f.seat}${f.difficulty ? ` | ${f.difficulty} AI` : ''}`);
          lines.push(`Actual move:   ${f.actualMove.pieceType} (${f.actualMove.from.q},${f.actualMove.from.r}) → (${f.actualMove.to.q},${f.actualMove.to.r})${cap}${promo}`);
          if (f.suggestedMove) {
            lines.push(`Suggested:     (${f.suggestedMove.from.q},${f.suggestedMove.from.r}) → (${f.suggestedMove.to.q},${f.suggestedMove.to.r})`);
          }
          if (f.note) lines.push(`Note:          ${f.note}`);
          lines.push('Board after move:');
          for (const [cell, piece] of Object.entries(f.boardAfter.pieces)) {
            lines.push(`  (${cell}): P${piece.player} ${piece.type}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      },
```

Update `partialize` to `(s) => ({ flags: s.flags, hexFlags: s.hexFlags })`. Add the corresponding method signatures to the `AIReviewStore` interface, importing `FlaggedHexMove` from `@/types/review`.

- [ ] **Step 4: Run tests.** `npx vitest run tests/store/aiReviewStore.hexFlags.test.ts` — Expected: PASS.

- [ ] **Step 5: `HexReviewContainer`.** Create `src/components/hexchess/HexReviewContainer.tsx`, starting from `HexReplayContainer.tsx` (same `loadHexChessGame` + `states` memo + stepper) with these additions:

1. Layout: `max-w-5xl` two-column on `lg:` (board+stepper left, review panel right), single column stacked on mobile — mirror `ReviewContainer`'s `lg:grid lg:grid-cols-[1fr_320px]` if present, else a simple `flex flex-col lg:flex-row gap-4`.
2. Board click capture:
```tsx
  const { captureMode, captureFrom, captureTo, captureCell, startCapture, cancelCapture } = useAIReviewStore();
  const handleCellClick = (cell: CubeCoord) => {
    if (captureMode !== null) captureCell(cell);
  };
```
   pass `onCellClick={handleCellClick}` to `<Board>`.
3. Flag panel (right column), with local state `flagFormOpen: boolean`, `note: string`:
   - When `step > 0`, show the current move summary (`saved.moveHistory[step - 1]`: piece type from `states[step - 1]` lookup by `pieceId`, from/to, capture, promotion) and a "⚑ Flag this move" button opening the form.
   - Form: the suggested-move capture UI (Select piece… / click destination / captured pair display — copy the flow from `ReviewPanel.tsx:152-190` using the shared store fields) + a note `<textarea>` + Save/Cancel.
   - Save builds the flag:
```tsx
    const move = saved.moveHistory[step - 1];
    const stateAfter = states[step];
    const stateBefore = states[step - 1];
    const pieceType = stateBefore.pieces.find((p) => p.id === move.pieceId)?.type ?? 'unknown';
    const capturedType = move.capture
      ? stateBefore.pieces.find((p) => p.id === move.capture!.pieceId)?.type ?? null
      : null;
    addHexFlag({
      gameId: saved.id,
      moveIndex: step - 1,
      turnNumber: move.turnNumber,
      seat: move.player,
      difficulty: saved.config.ai?.[move.player],
      actualMove: {
        pieceType,
        from: { q: move.from.q, r: move.from.r },
        to: { q: move.to.q, r: move.to.r },
        capture: capturedType,
        promotion: move.promotion,
      },
      suggestedMove: captureFrom && captureTo
        ? { from: { q: captureFrom.q, r: captureFrom.r }, to: { q: captureTo.q, r: captureTo.r } }
        : undefined,
      note: note.trim(),
      boardAfter: {
        pieces: Object.fromEntries(
          stateAfter.pieces.map((p) => [coordKey(p.cell), { player: p.player, type: p.type }]),
        ),
      },
    });
```
   - Below the form: flag list for this game (`hexFlags.filter(f => f.gameId === saved.id)`) with per-flag remove (✕) and an Export button copying `exportHexText(saved.id)` to the clipboard with the same copied-state feedback as `ReviewPanel.tsx:113-123`.
4. Back link: `← Replays` to `/replays` plus the game id in a subtle header.

- [ ] **Step 6: Route.** Create `src/app/hexchess/review/[id]/page.tsx` matching the replay page pattern (`src/app/hexchess/replay/[id]/page.tsx` — read it and mirror; it presumably grabs `params.id` and renders the container):

```tsx
'use client';

import { useParams } from 'next/navigation';
import { HexReviewContainer } from '@/components/hexchess/HexReviewContainer';

export default function HexChessReviewPage() {
  const params = useParams();
  return <HexReviewContainer gameId={params.id as string} />;
}
```

- [ ] **Step 7: Verify.** `npx tsc --noEmit && npx vitest run tests/store tests/game/hexchess` — Expected: PASS/clean.

---

### Task 10: Full verification

- [ ] **Step 1: Full test suite.** `npm run test` — Expected: all pass except the pre-existing `tests/game/pathfinding.test.ts` TS issues (and any failures already present on `main` in the user's in-progress AI test files — compare against a stash-free baseline only if something unexpected fails).
- [ ] **Step 2: Lint + build.** `npm run lint && npm run build` — Expected: clean.
- [ ] **Step 3: Deploy backend to dev.** `npx convex dev --once` (deployment `dev:wary-hedgehog-316`).
- [ ] **Step 4: Browser verification** (see memory `browser-verification.md`: Playwright from `node_modules` + Firefox + local libasound extract; Playwright MCP is broken here). Drive:
  1. Sign in, create a lobby, toggle Game → Hex Chess: board resets, mode/team rows disappear, colors reset to white/black (2p), only plain color rows shown.
  2. Select Traditional Hex Chess: player count locks to 2.
  3. Add an AI (difficulty only) to slot 2, ready up → game starts, `/online/[id]` shows the hex board.
  4. Play a human move; watch the AI (host-run) reply arrive via server sync.
  5. Resign → game-over banner shows Rematch/Replay/Review/Profile; request rematch (single human: rematch with AI auto-accepts since all humans accepted) → redirected to the new game.
  6. Open `/hexchess/review/<id>` from the dialog, flag a move with a suggested move + note, export, confirm clipboard text.
  7. Local game sanity: finish a quick local hex game (or resign) → banner shows Play Again/Replay/Review/New Game; Play Again starts a fresh game with the same setup.
- [ ] **Step 5: Report.** Summarize results honestly, including anything not verified.

---

## Self-Review Notes

- Spec coverage: layout sync fix (T1), gameType/setGameType/setLayout/resolveGameStart/submitTurn/rematch (T3), lobby UI (T4), hook + page branch (T5–6), local end-game options (T7), online game-over + rematch (T8), review page/store (T9), tests+browser (T2, T9, T10). Spec amendment (standard-vs-Traditional default) recorded in Global Constraints.
- Type names cross-checked: `OnlineHexTurnPayload`/`OnlineHexGameData`/`serializeHexMove`/`applyResign`/`reconstructHexChessOnline` consistent across T2/T3/T5; `FlaggedHexMove`/`addHexFlag`/`exportHexText` consistent across T9 steps; `selectedBuiltinLayoutId`/`builtinLayoutId` consistent across T3/T4.
- Known intentional simplifications: no opponent capture fade animation online (sound only); online promotion picker only for the local player's turn; hex chess turns trust client-computed `nextPlayerIndex`/`result` (same trust model as sternhalma).
