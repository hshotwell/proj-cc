# Online Lobby Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign online multiplayer so the home "Online" button immediately creates a lobby and opens an all-in-one setup+waiting room at `/lobby/[id]`, with board selection, game mode, team mode, and friend invites — all editable by the host in real time.

**Architecture:** Update Convex schema to store `gameMode`, `teamMode`, and `selectedLayoutId` on `onlineGames`. Make `createLobby`'s `receiverId` optional. Add three host-only mutations (`setGameMode`, `setTeamMode`, `setLayout`) plus a `getLobbyBoards` query. Update `onlineState.ts` to reconstruct game mode into `playerPieceTypes`. Redesign the lobby page UI to include the new config panels above the existing player-slots section.

**Tech Stack:** Convex 1.39.1, @convex-dev/auth 0.0.92, Next.js 16, React 19, TypeScript, Zustand, Tailwind CSS 4

---

## File Map

**Modified:**
- `package.json` — bump `convex` and `@convex-dev/auth` versions
- `convex/schema.ts` — add `gameMode`, `teamMode`, `selectedLayoutId` to `onlineGames`
- `convex/onlineGames.ts` — update `createLobby`, `updateBoardConfig`, `toggleReady`, `startGame`, `leaveLobby`; add `setGameMode`, `setTeamMode`, `setLayout`, `getLobbyBoards`
- `src/game/onlineState.ts` — add `gameMode` to `OnlineGameData`; apply `playerPieceTypes` in `reconstructGameState`
- `src/app/home/page.tsx` — replace Online button routing with `createLobby` + navigate
- `src/app/lobby/[id]/page.tsx` — add board selection, game mode, team mode panels; update back link

**Not modified:** All other files (game logic, stores, other pages) remain unchanged.

---

## Task 1: Update Convex packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install updated packages**

```bash
npm install convex@1.39.1 @convex-dev/auth@0.0.92
```

Expected: packages update, no peer dependency errors.

- [ ] **Step 2: Verify Convex dev still starts**

```bash
npx convex dev --once
```

Expected: exits 0. If it asks to login or re-link, follow the prompts. Do not proceed if Convex fails.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade convex to 1.39.1 and @convex-dev/auth to 0.0.92"
```

---

## Task 2: Schema additions + `createLobby` optional receiver

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/onlineGames.ts`

- [ ] **Step 1: Add fields to `onlineGames` schema**

In `convex/schema.ts`, inside the `onlineGames` `defineTable({...})` block, add three optional fields after the existing `createdAt` field:

```ts
    gameMode: v.optional(v.union(
      v.literal("normal"), v.literal("turbo"),
      v.literal("ghost"), v.literal("big")
    )),
    teamMode: v.optional(v.boolean()),
    selectedLayoutId: v.optional(v.id("boardLayouts")),
```

- [ ] **Step 2: Make `receiverId` optional in `createLobby`**

In `convex/onlineGames.ts`, replace the `createLobby` args and handler with:

```ts
export const createLobby = mutation({
  args: {
    playerCount: v.optional(v.number()),
    receiverId: v.optional(v.id("users")),
  },
  handler: async (ctx, { playerCount: rawPlayerCount, receiverId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const host = await ctx.db.get(userId);
    if (!host) throw new Error("User not found");

    const activeCount = await countActiveGamesForUser(ctx, userId);
    if (activeCount >= MAX_ACTIVE_GAMES) {
      throw new Error(`You already have ${MAX_ACTIVE_GAMES} active games. Finish one before starting a new one.`);
    }

    const playerCount = rawPlayerCount ?? 2;

    // Look up host favorite color
    const hostSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const hostFavColor = hostSettings?.favoriteColor || null;
    const hostColor = hostFavColor || SLOT_COLORS[0];

    // Build initial player slots
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === 0) {
        players.push({
          slot: i,
          type: "human" as const,
          userId,
          username: host.username || host.name || "Host",
          color: hostColor,
          isReady: false,
        });
      } else if (i === 1 && receiverId) {
        const receiver = await ctx.db.get(receiverId);
        if (!receiver) throw new Error("Receiver not found");
        const receiverSettings = await ctx.db
          .query("userSettings")
          .withIndex("by_userId", (q) => q.eq("userId", receiverId))
          .first();
        const receiverFavColor = receiverSettings?.favoriteColor || null;
        let receiverColor = SLOT_COLORS[1];
        if (receiverFavColor && receiverFavColor !== hostColor) {
          receiverColor = receiverFavColor;
        }
        players.push({
          slot: i,
          type: "human" as const,
          userId: receiverId,
          username: receiver.username || receiver.name || "Guest",
          color: receiverColor,
          isReady: false,
        });
      } else {
        players.push({
          slot: i,
          type: "empty" as const,
          color: SLOT_COLORS[i],
          isReady: false,
        });
      }
    }

    const gameId = await ctx.db.insert("onlineGames", {
      hostId: userId,
      status: "lobby",
      playerCount,
      boardType: "standard",
      players,
      createdAt: Date.now(),
      gameMode: "normal",
      teamMode: false,
      selectedLayoutId: undefined,
    });

    // Create invite for receiver if provided
    if (receiverId) {
      await ctx.db.insert("gameInvites", {
        gameId,
        senderId: userId,
        receiverId,
        status: "pending",
        createdAt: Date.now(),
      });
    }

    return gameId;
  },
});
```

- [ ] **Step 3: Run type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new TypeScript errors (pre-existing errors are OK — the project has a known issue in `tests/game/pathfinding.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/onlineGames.ts
git commit -m "feat: add gameMode/teamMode/selectedLayoutId to schema, make createLobby receiverId optional"
```

---

## Task 3: New host-only mutations — `setGameMode`, `setTeamMode`, `setLayout` + update `leaveLobby`

**Files:**
- Modify: `convex/onlineGames.ts`

- [ ] **Step 1: Add `setGameMode` mutation**

Append to `convex/onlineGames.ts` (before the closing of the file):

```ts
export const setGameMode = mutation({
  args: {
    gameId: v.id("onlineGames"),
    mode: v.union(
      v.literal("normal"), v.literal("turbo"),
      v.literal("ghost"), v.literal("big")
    ),
  },
  handler: async (ctx, { gameId, mode }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can change game mode");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    await ctx.db.patch(gameId, { gameMode: mode });
  },
});

export const setTeamMode = mutation({
  args: {
    gameId: v.id("onlineGames"),
    teamMode: v.boolean(),
  },
  handler: async (ctx, { gameId, teamMode }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can change team mode");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (teamMode && game.playerCount !== 4 && game.playerCount !== 6) {
      throw new Error("Team mode requires 4 or 6 players");
    }
    await ctx.db.patch(gameId, { teamMode });
  },
});

export const setLayout = mutation({
  args: {
    gameId: v.id("onlineGames"),
    selectedLayoutId: v.union(v.id("boardLayouts"), v.null()),
  },
  handler: async (ctx, { gameId, selectedLayoutId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can change the board");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    if (selectedLayoutId === null) {
      await ctx.db.patch(gameId, { selectedLayoutId: undefined });
      return;
    }

    // Validate layout belongs to a current human player in the lobby
    const layout = await ctx.db.get(selectedLayoutId);
    if (!layout) throw new Error("Layout not found");

    const players = game.players as any[];
    const humanUserIds = new Set(
      players
        .filter((p: any) => p.type === "human" && p.userId)
        .map((p: any) => p.userId)
    );
    if (!humanUserIds.has(layout.userId)) {
      throw new Error("Layout must belong to a player in the lobby");
    }

    await ctx.db.patch(gameId, { selectedLayoutId });
  },
});
```

- [ ] **Step 2: Update `leaveLobby` to reset layout when owner leaves**

In `convex/onlineGames.ts`, replace the guest-leave branch of `leaveLobby` (the `else` block starting at the comment `// Guest leaves`) with:

```ts
    } else {
      // Guest leaves -> remove from players, delete their invite
      const players = game.players as any[];
      const leavingPlayer = players.find((p: any) => p.userId === userId);
      const updated = players.map((p: any) =>
        p.userId === userId
          ? { slot: p.slot, type: "empty", color: p.color, isReady: false }
          : p
      );

      // Reset layout if the leaving player owns the selected layout
      let patch: Record<string, any> = { players: updated };
      if (game.selectedLayoutId) {
        const layout = await ctx.db.get(game.selectedLayoutId);
        if (layout && leavingPlayer && layout.userId === leavingPlayer.userId) {
          patch = { ...patch, selectedLayoutId: undefined };
        }
      }
      await ctx.db.patch(gameId, patch);

      // Delete invite
      const invite = await ctx.db
        .query("gameInvites")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .filter((q) => q.eq(q.field("receiverId"), userId))
        .first();
      if (invite) {
        await ctx.db.delete(invite._id);
      }
    }
```

- [ ] **Step 3: Run type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add convex/onlineGames.ts
git commit -m "feat: add setGameMode, setTeamMode, setLayout mutations; reset layout when owner leaves"
```

---

## Task 4: `getLobbyBoards` query

**Files:**
- Modify: `convex/onlineGames.ts`

- [ ] **Step 1: Add the query**

Append to `convex/onlineGames.ts`:

```ts
export const getLobbyBoards = query({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return [];

    // Collect unique human user IDs in the lobby
    const players = game.players as any[];
    const humanUserIds = [
      ...new Set(
        players
          .filter((p: any) => p.type === "human" && p.userId)
          .map((p: any) => p.userId as string)
      ),
    ];

    // Fetch all layouts for these users
    const allLayouts: any[] = [];
    for (const uid of humanUserIds) {
      const layouts = await ctx.db
        .query("boardLayouts")
        .withIndex("by_userId", (q) => q.eq("userId", uid))
        .collect();
      allLayouts.push(...layouts);
    }

    // Get usernames for grouping
    const userMap = new Map<string, string>();
    for (const uid of humanUserIds) {
      const user = await ctx.db.get(uid);
      userMap.set(uid, user?.username || user?.name || "Unknown");
    }

    // Determine valid player counts from each layout's startingPositions keys
    return allLayouts.map((layout) => {
      const counts = Object.keys(layout.startingPositions ?? {}).map(Number);
      return {
        _id: layout._id,
        layoutId: layout.layoutId,
        name: layout.name,
        playerCounts: counts,
        ownerId: layout.userId,
        ownerUsername: userMap.get(layout.userId) ?? "Unknown",
        cells: layout.cells,
        startingPositions: layout.startingPositions,
        goalPositions: layout.goalPositions,
        walls: layout.walls,
        isDefault: layout.isDefault,
      };
    });
  },
});
```

- [ ] **Step 2: Run type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add convex/onlineGames.ts
git commit -m "feat: add getLobbyBoards query returning verified layouts from all lobby players"
```

---

## Task 5: Wire layout + gameMode into game start

**Files:**
- Modify: `convex/onlineGames.ts`

The `toggleReady` auto-start and `startGame` both write `status: "playing"`. At that point we need to fetch the selected layout (if any) and store it as `customLayout` / update `boardType`, and also ensure `gameMode` and `teamMode` are persisted.

- [ ] **Step 1: Add a helper function `resolveGameStart`**

Add this helper function near the top of `convex/onlineGames.ts`, after `countActiveGamesForUser`:

```ts
async function resolveGameStart(ctx: any, game: any): Promise<Record<string, any>> {
  const patch: Record<string, any> = {
    status: "playing",
    turns: [],
    currentPlayerIndex: 0,
    finishedPlayers: [],
  };

  if (game.selectedLayoutId) {
    const layout = await ctx.db.get(game.selectedLayoutId);
    if (layout) {
      patch.boardType = "custom";
      patch.customLayout = {
        id: layout.layoutId,
        name: layout.name,
        cells: layout.cells,
        startingPositions: layout.startingPositions,
        goalPositions: layout.goalPositions,
        walls: layout.walls,
      };
    }
  } else {
    patch.boardType = "standard";
    patch.customLayout = undefined;
  }

  return patch;
}
```

- [ ] **Step 2: Update `toggleReady` to use `resolveGameStart`**

In the `toggleReady` handler, replace:

```ts
    if (!hasEmpty && allHumansReady) {
      await ctx.db.patch(gameId, {
        players: updated,
        status: "playing",
        turns: [],
        currentPlayerIndex: 0,
        finishedPlayers: [],
      });
    } else {
```

with:

```ts
    if (!hasEmpty && allHumansReady) {
      const startPatch = await resolveGameStart(ctx, game);
      await ctx.db.patch(gameId, { players: updated, ...startPatch });
    } else {
```

- [ ] **Step 3: Update `startGame` to use `resolveGameStart`**

In the `startGame` handler, replace:

```ts
    await ctx.db.patch(gameId, {
      status: "playing",
      turns: [],
      currentPlayerIndex: 0,
      finishedPlayers: [],
    });
```

with:

```ts
    const startPatch = await resolveGameStart(ctx, game);
    await ctx.db.patch(gameId, startPatch);
```

- [ ] **Step 4: Run type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add convex/onlineGames.ts
git commit -m "feat: resolve selected layout and store as customLayout when game starts"
```

---

## Task 6: `onlineState.ts` — game mode support + unit test

**Files:**
- Modify: `src/game/onlineState.ts`
- Test: `tests/game/onlineState.test.ts`

- [ ] **Step 1: Write a failing test**

Create `tests/game/onlineState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reconstructGameState } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';

const BASE_GAME: OnlineGameData = {
  _id: 'test-id',
  hostId: 'user-0',
  status: 'playing',
  playerCount: 2,
  boardType: 'standard',
  players: [
    { slot: 0, type: 'human', userId: 'user-0', username: 'Alice', color: '#ef4444', isReady: true },
    { slot: 1, type: 'human', userId: 'user-1', username: 'Bob',   color: '#3b82f6', isReady: true },
  ],
  turns: [],
  currentPlayerIndex: 0,
  finishedPlayers: [],
};

describe('reconstructGameState', () => {
  it('applies no playerPieceTypes when gameMode is normal', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'normal' });
    expect(state.playerPieceTypes).toBeUndefined();
  });

  it('applies playerPieceTypes for all players when gameMode is turbo', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'turbo' });
    expect(state.playerPieceTypes).toEqual({ 0: 'turbo', 1: 'turbo' });
  });

  it('applies playerPieceTypes for all players when gameMode is ghost', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'ghost' });
    expect(state.playerPieceTypes).toEqual({ 0: 'ghost', 1: 'ghost' });
  });

  it('applies playerPieceTypes for all players when gameMode is big', () => {
    const state = reconstructGameState({ ...BASE_GAME, gameMode: 'big' });
    expect(state.playerPieceTypes).toEqual({ 0: 'big', 1: 'big' });
  });

  it('applies teamMode when set', () => {
    const state = reconstructGameState({ ...BASE_GAME, teamMode: true });
    expect(state.teamMode).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest tests/game/onlineState.test.ts --run 2>&1 | tail -20
```

Expected: fails because `gameMode` is not yet on `OnlineGameData` and `reconstructGameState` doesn't apply it.

- [ ] **Step 3: Add `gameMode` to `OnlineGameData` and wire it in `reconstructGameState`**

In `src/game/onlineState.ts`, update the `OnlineGameData` interface to add `gameMode`:

```ts
export interface OnlineGameData {
  _id: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  playerCount: number;
  boardType: 'standard' | 'custom';
  customLayout?: BoardLayout;
  players: OnlinePlayerSlot[];
  turns?: OnlineTurn[];
  currentPlayerIndex?: number;
  winner?: number;
  finishedPlayers?: number[];
  teamMode?: boolean;
  gameMode?: 'normal' | 'turbo' | 'ghost' | 'big';
}
```

Then in `reconstructGameState`, after the `state = createGame(...)` / `createGameFromLayout(...)` calls and before replaying turns, add:

```ts
  // Apply game mode to all players
  if (onlineGame.gameMode && onlineGame.gameMode !== 'normal') {
    const activePlayers = state.activePlayers;
    const pieceTypes: Partial<Record<number, 'normal' | 'turbo' | 'ghost' | 'big'>> = {};
    for (const p of activePlayers) {
      pieceTypes[p] = onlineGame.gameMode;
    }
    state = { ...state, playerPieceTypes: pieceTypes as any };
  }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest tests/game/onlineState.test.ts --run 2>&1 | tail -20
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npm run test 2>&1 | tail -30
```

Expected: same pass/fail ratio as before (pathfinding.test.ts has pre-existing errors — ignore those).

- [ ] **Step 6: Commit**

```bash
git add src/game/onlineState.ts tests/game/onlineState.test.ts
git commit -m "feat: add gameMode to OnlineGameData and apply playerPieceTypes in reconstructGameState"
```

---

## Task 7: Home page — Online button creates lobby

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: Add `useMutation` import and `createLobby` mutation hook**

The file already imports `useQuery` from `convex/react` and `api`. Add `useMutation` to that import, and add the mutation hook inside `HomePage` alongside the existing `activeGamesData` query:

Find this block in `HomePage`:

```ts
  const activeGamesData = useQuery(
    api.onlineGames.listMyActiveGames,
    isAuthenticated ? {} : 'skip'
  );
  const atGameLimit = activeGamesData?.atLimit ?? false;
```

Replace with:

```ts
  const activeGamesData = useQuery(
    api.onlineGames.listMyActiveGames,
    isAuthenticated ? {} : 'skip'
  );
  const atGameLimit = activeGamesData?.atLimit ?? false;
  const createLobby = useMutation(api.onlineGames.createLobby);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [creatingLobby, setCreatingLobby] = useState(false);
```

Also add `useMutation` to the convex/react import at the top of the file:

```ts
import { useQuery, useMutation } from 'convex/react';
```

- [ ] **Step 2: Add `handleOnlinePlay` handler**

Inside `HomePage`, after the state declarations, add:

```ts
  const handleOnlinePlay = async () => {
    if (!isAuthenticated) {
      router.push('/auth/signin');
      return;
    }
    if (atGameLimit) {
      setLobbyError('You have 10 active games. Finish or abandon one to start a new one.');
      return;
    }
    setCreatingLobby(true);
    setLobbyError(null);
    try {
      const gameId = await createLobby({});
      router.push(`/lobby/${gameId}`);
    } catch (e: any) {
      setLobbyError(e.message ?? 'Failed to create lobby.');
      setCreatingLobby(false);
    }
  };
```

- [ ] **Step 3: Replace the Online button**

Find the Online button in the JSX:

```tsx
                    <button
                      onClick={() => router.push(atGameLimit ? '/profile?tab=current-games&limit=1' : '/profile')}
                      className={`w-full px-12 py-3 text-lg rounded-full transition-colors ${
                        atGameLimit ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Online
                    </button>
```

Replace with:

```tsx
                    <button
                      onClick={() => void handleOnlinePlay()}
                      disabled={creatingLobby}
                      className="w-full px-12 py-3 text-lg text-gray-700 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingLobby ? 'Creating...' : 'Online'}
                    </button>
                    {lobbyError && (
                      <p className="text-sm text-red-500 text-center px-4">{lobbyError}</p>
                    )}
```

- [ ] **Step 4: Remove now-unused `atGameLimit` styling (the variable is still used in `handleOnlinePlay`, so keep the query)**

No further cleanup needed — `atGameLimit` is still used in `handleOnlinePlay`.

- [ ] **Step 5: Type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat: online button creates lobby immediately and navigates to /lobby/[id]"
```

---

## Task 8: Lobby page redesign — game mode, team mode, board selection, back link

**Files:**
- Modify: `src/app/lobby/[id]/page.tsx`

This is the largest task. Read the full current file before making changes.

- [ ] **Step 1: Add new mutation/query hooks**

At the top of `LobbyContent`, after the existing `useMutation`/`useQuery` hooks, add:

```ts
  const setGameModeMutation = useMutation(api.onlineGames.setGameMode);
  const setTeamModeMutation = useMutation(api.onlineGames.setTeamMode);
  const setLayoutMutation = useMutation(api.onlineGames.setLayout);
  const lobbyBoards = useQuery(
    api.onlineGames.getLobbyBoards,
    game ? { gameId } : 'skip'
  );
```

Also add state for the board selector and a layout-reset notice:

```ts
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  const [layoutResetNotice, setLayoutResetNotice] = useState(false);
```

- [ ] **Step 2: Detect layout reset (board owner left)**

Add a `useEffect` after the other effects in `LobbyContent` to detect when `selectedLayoutId` clears unexpectedly (i.e., the host had a layout selected, and now it's gone):

```ts
  const prevSelectedLayoutId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!game) return;
    const current = (game as any).selectedLayoutId ?? undefined;
    if (prevSelectedLayoutId.current !== undefined && current === undefined && prevSelectedLayoutId.current !== undefined) {
      setLayoutResetNotice(true);
    }
    prevSelectedLayoutId.current = current;
  }, [(game as any)?.selectedLayoutId]);
```

- [ ] **Step 3: Add handler functions for the new mutations**

Inside `LobbyContent`, before the `return` statement, add:

```ts
  const handleSetGameMode = async (mode: 'normal' | 'turbo' | 'ghost' | 'big') => {
    try { await setGameModeMutation({ gameId, mode }); }
    catch (e) { console.error('Failed to set game mode:', e); }
  };

  const handleSetTeamMode = async (teamMode: boolean) => {
    try { await setTeamModeMutation({ gameId, teamMode }); }
    catch (e) { console.error('Failed to set team mode:', e); }
  };

  const handleSetLayout = async (selectedLayoutId: string | null) => {
    try {
      await setLayoutMutation({ gameId, selectedLayoutId: selectedLayoutId as any });
      setShowBoardSelector(false);
      setLayoutResetNotice(false);
    }
    catch (e) { console.error('Failed to set layout:', e); }
  };
```

- [ ] **Step 4: Update `handleLeave` to navigate to `/home` instead of `/profile`**

Replace:

```ts
      router.push('/profile');
```

with:

```ts
      router.push('/home');
```

- [ ] **Step 5: Replace back link and abandoned state link**

Find:

```tsx
        <div className="mb-6">
          <Link href="/profile" className="text-blue-600 hover:underline text-sm">
            &larr; Back to Profile
          </Link>
        </div>
```

Replace with:

```tsx
        <div className="mb-6">
          <Link href="/home" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            &larr; Home
          </Link>
        </div>
```

Also find the abandoned-state back link:

```tsx
          <Link href="/profile" className="text-blue-600 hover:underline">Back to Profile</Link>
```

Replace with:

```tsx
          <Link href="/home" className="text-blue-600 hover:underline">Back to Home</Link>
```

- [ ] **Step 6: Add Game Mode and Team Mode panels**

The existing "Board Config (host only)" section renders a card with player count and AI settings. Replace the entire `{/* Board Config (host only) */}` section (the `{isHost && (...)}` block) with a new section visible to all, but with controls only for the host:

```tsx
        {/* Game Config */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Setup</h2>

          {/* Player Count (host only) */}
          {isHost && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Players</label>
              <div className="flex gap-2">
                {PLAYER_COUNT_OPTIONS.map(({ count, label }) => (
                  <button
                    key={count}
                    onClick={() => void handlePlayerCountChange(count)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      game.playerCount === count
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Game Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Game Mode</label>
            <div className="flex gap-2">
              {([
                { value: 'normal', label: 'Normal',   desc: 'Standard movement rules' },
                { value: 'turbo',  label: 'Turbo',    desc: 'Pieces scan past empty cells and hop the same distance on the other side' },
                { value: 'ghost',  label: 'Spectral',  desc: 'Hop over an entire adjacent run, land in the first open cell after the run' },
                { value: 'big',    label: 'Blockade', desc: 'Opponents cannot jump over your pieces' },
              ] as { value: 'normal' | 'turbo' | 'ghost' | 'big'; label: string; desc: string }[]).map(({ value, label, desc }) => (
                <button
                  key={value}
                  disabled={!isHost}
                  onClick={() => isHost && void handleSetGameMode(value)}
                  title={desc}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                    ((game as any).gameMode ?? 'normal') === value
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

          {/* Team Mode (4 or 6 players only) */}
          {(game.playerCount === 4 || game.playerCount === 6) && (
            <div className="mb-4 flex items-center gap-2">
              <input
                id="teamMode"
                type="checkbox"
                disabled={!isHost}
                checked={(game as any).teamMode ?? false}
                onChange={(e) => isHost && void handleSetTeamMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 disabled:opacity-50"
              />
              <label htmlFor="teamMode" className={`text-sm font-medium ${isHost ? 'text-gray-700 cursor-pointer' : 'text-gray-400'}`}>
                Team mode — opposite players are teammates, both must finish to win
              </label>
            </div>
          )}

          {/* Board Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Board</label>
            {layoutResetNotice && isHost && (
              <p className="text-xs text-amber-600 mb-2">Board reset — the player who owned that layout left the lobby.</p>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">
                {(game as any).selectedLayoutId
                  ? (lobbyBoards ?? []).find((b: any) => b._id === (game as any).selectedLayoutId)?.name ?? 'Custom Board'
                  : 'Standard Board'}
              </span>
              {isHost && (
                <button
                  onClick={() => setShowBoardSelector(!showBoardSelector)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {showBoardSelector ? 'Close' : 'Select Board'}
                </button>
              )}
            </div>
            {showBoardSelector && isHost && (
              <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => void handleSetLayout(null)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 ${
                    !(game as any).selectedLayoutId ? 'font-medium text-blue-700 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  Standard Board
                  <span className="ml-2 text-xs text-gray-400">2–6 players · 121 cells</span>
                </button>
                {(lobbyBoards ?? []).length > 0 && (() => {
                  // Group by owner
                  const boards = lobbyBoards ?? [];
                  const byOwner = new Map<string, { ownerUsername: string; boards: typeof boards }>();
                  for (const b of boards) {
                    const entry = byOwner.get(b.ownerId) ?? { ownerUsername: b.ownerUsername, boards: [] };
                    entry.boards.push(b);
                    byOwner.set(b.ownerId, entry);
                  }
                  return [...byOwner.entries()].map(([ownerId, { ownerUsername, boards: ownerBoards }]) => (
                    <div key={ownerId}>
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
                        {ownerUsername}&apos;s boards
                      </div>
                      {ownerBoards.map((board: any) => (
                        <button
                          key={board._id}
                          onClick={() => void handleSetLayout(board._id)}
                          className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 ${
                            (game as any).selectedLayoutId === board._id
                              ? 'font-medium text-blue-700 bg-blue-50'
                              : 'text-gray-700'
                          }`}
                        >
                          {board.name}
                          <span className="ml-2 text-xs text-gray-400">
                            {board.playerCounts.join('/') || '?'} players
                          </span>
                        </button>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* AI Config for adding to empty slots (host only) */}
          {isHost && hasEmptySlots && (
            <div className="border-t pt-4 mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Settings (for empty slots)</label>
              <div className="flex gap-4 mb-2">
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="px-3 py-1.5 border rounded-lg text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select
                  value={aiPersonality}
                  onChange={(e) => setAiPersonality(e.target.value)}
                  className="px-3 py-1.5 border rounded-lg text-sm"
                >
                  <option value="generalist">Generalist</option>
                  <option value="defensive">Defensive</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
            </div>
          )}
        </div>
```

- [ ] **Step 7: Remove the old `{/* Board Config (host only) */}` block**

Delete the old `{isHost && (...)}` block for game setup (player count + AI config) that was at lines ~257–307, since it's now fully replaced by the new "Game Config" card above.

- [ ] **Step 8: Type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new TypeScript errors.

- [ ] **Step 9: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: same results as before (onlineState tests pass, pathfinding pre-existing errors unchanged).

- [ ] **Step 10: Commit**

```bash
git add src/app/lobby/[id]/page.tsx
git commit -m "feat: redesign lobby with game mode, team mode, board selection, and home back link"
```

---

## Task 9: Profile page — update Challenge call

**Files:**
- Modify: `src/app/profile/page.tsx`

The `handleChallenge` function in `FriendsList` calls `createLobby({ playerCount: 2, receiverId: friendId })`. Since `playerCount` is now optional (defaults to 2), and `receiverId` is also optional, this call is still valid. However `playerCount: 2` is now redundant — remove it for clarity.

- [ ] **Step 1: Update the challenge call**

Find in `src/app/profile/page.tsx`:

```ts
      const gameId = await createLobby({ playerCount: 2, receiverId: friendId });
```

Replace with:

```ts
      const gameId = await createLobby({ receiverId: friendId });
```

- [ ] **Step 2: Type check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "refactor: remove redundant playerCount from createLobby challenge call"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Online button creates lobby immediately, no pre-steps | Task 7 |
| Same lobby page from home and from Friends challenge | Tasks 2, 7, 9 (same route) |
| `receiverId` optional in `createLobby` | Task 2 |
| Board selection (standard + players' verified boards) | Tasks 4, 8 |
| Game mode (Normal/Turbo/Spectral/Blockade) | Tasks 3, 6, 8 |
| Team mode (4/6 players only) | Tasks 3, 8 |
| Host-only config editing, guests read-only | Task 8 |
| Each player picks only their own color | Unchanged (existing behavior) |
| Board reset when layout owner leaves | Task 3 |
| Auth check on home button | Task 7 |
| Game limit inline error on home | Task 7 |
| `setLayout` rejects non-player-owned boards | Task 3 |
| Layout stored as `customLayout` on game start | Task 5 |
| `gameMode` applied as `playerPieceTypes` in reconstruction | Task 6 |
| Convex 1.39.1 update | Task 1 |
| Back link changed to Home | Task 8 |
| Unit test for `gameMode` reconstruction | Task 6 |

All spec requirements are covered.

### Placeholder scan

No TBD, TODO, or incomplete steps found. All code blocks are complete.

### Type consistency

- `setGameMode` mutation arg `mode` → matches `handleSetGameMode(mode: 'normal' | 'turbo' | 'ghost' | 'big')` ✓
- `setLayout` mutation arg `selectedLayoutId: v.union(v.id("boardLayouts"), v.null())` → `handleSetLayout(selectedLayoutId: string | null)` with `as any` cast ✓
- `getLobbyBoards` returns `_id`, `layoutId`, `name`, `playerCounts`, `ownerId`, `ownerUsername` → lobby page accesses `b._id`, `b.name`, `b.ownerId`, `b.ownerUsername`, `b.playerCounts` ✓
- `resolveGameStart` returns `Record<string, any>` spread into `ctx.db.patch` ✓
- `OnlineGameData.gameMode` added → `reconstructGameState` reads `onlineGame.gameMode` ✓
