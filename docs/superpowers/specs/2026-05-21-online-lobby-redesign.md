# Online Lobby Redesign

**Date:** 2026-05-21
**Status:** Approved

## Overview

Redesign the online multiplayer entry point so that clicking "Online" from the home menu immediately creates a lobby and navigates to an all-in-one setup + waiting room at `/lobby/[id]`. This page is also where challenging a friend from the Friends tab lands — both entry points use the same page with zero redundancy. The difference is only that challenging a friend pre-populates their slot.

Also includes a Convex dependency update from 1.31.7 → 1.39.1 (and `@convex-dev/auth` 0.0.90 → 0.0.92).

---

## Entry Points

| Action | Behavior |
|--------|----------|
| Home → Online | Check auth → create empty lobby → navigate to `/lobby/{id}` |
| Profile → Friends → Challenge | Create lobby with `receiverId` pre-filled → navigate to `/lobby/{id}` |
| Both land on | Same `/lobby/[id]` page |

If user is not authenticated, the Online button routes to `/auth/signin` instead of creating a lobby. If user is at the 10-game limit, show an inline error on the home page (no navigation).

---

## Backend Changes (Convex)

### Schema — `onlineGames` table additions

```ts
gameMode: v.union(v.literal("normal"), v.literal("turbo"), v.literal("ghost"), v.literal("big"))  // default "normal"
teamMode: v.boolean()                   // default false
selectedLayoutId: v.union(v.id("boardLayouts"), v.null())  // null = standard board, default null
```

### Updated Mutations

**`createLobby`** — make `receiverId` optional (was required). When omitted, creates an empty lobby with only the host in slot 0.

### New Mutations (host-only, validated server-side)

**`setGameMode({ gameId, mode })`** — host sets game mode. Validates caller is host, game status is "lobby".

**`setTeamMode({ gameId, teamMode })`** — host toggles team mode. Validates caller is host, game status is "lobby", player count is 4 or 6.

**`setLayout({ gameId, selectedLayoutId })`** — host sets board layout. Validates:
- Caller is host, game status is "lobby"
- `selectedLayoutId` is null (standard) or is a `boardLayouts` document ID belonging to a current human player in the lobby
- Re-runs `validateLayout` server-side; rejects invalid boards

### New Query

**`getLobbyBoards({ gameId })`** — returns the board pool available for this lobby:
- Always includes standard board as first entry
- Union of verified/valid custom layouts (from the `boardLayouts` table) belonging to any current human player in the lobby
- Each layout entry includes: `_id` (boardLayouts doc ID), `layoutId` (string), `name`, `playerCount[]`, `ownerId`, `ownerUsername`
- Grouped by owner for display

### Board Reset on Player Leave

When a human player leaves the lobby (`leaveLobby` mutation), if the currently selected `layoutId` belonged to that player, reset `layoutId` to `null` (standard board). The lobby page surfaces this as an inline notice: "Board reset: {username} left the lobby."

---

## Frontend Changes

### Home Page (`src/app/home/page.tsx`)

Replace the Online button's `router.push('/profile')` behavior:
- If not authenticated: `router.push('/auth/signin')`
- If at game limit: show inline error, no navigation
- Otherwise: call `createLobby()` mutation, then `router.push('/lobby/{id}')`

Remove the `atGameLimit` redirect to `/profile?tab=current-games&limit=1`.

### Lobby Page (`src/app/lobby/[id]/page.tsx`) — Redesigned

**Back link:** "← Home" (was "← Profile")

**Page layout (top to bottom):**

#### 1. Board Selection (host-editable, guest read-only)
- Card showing current board preview SVG + board name
- Host: "Select Board" button opens dropdown
  - "Standard Board" at top
  - Custom boards grouped: "Your boards" section, then "{username}'s boards" per other player who has them
  - Each entry shows board name + compatible player counts
- Guest: same card but no button, board name/preview only

#### 2. Game Mode (host-editable, guest read-only)
- 4 buttons: Normal / Turbo / Spectral / Blockade
- Same style as local play page
- Guest: buttons visible but disabled/grayed

#### 3. Player Count + Team Mode (host-editable, guest read-only)
- Count buttons: 2 / 3 / 4 / 6 (same style as local play)
- Team mode checkbox appears only for player count 4 or 6
- Guest: read-only display

#### 4. Players (existing, unchanged logic)
- Host per slot: Invite friend / Add AI / Reorder / Remove
- Each slot shows: color swatch (read-only per that player's choice), username or "AI (difficulty)" or "Empty slot"
- Ready indicators per player

#### 5. Your Color (unchanged)
- Color picker applies only to the current user's own slot
- Other players' colors are shown in the Players section as read-only swatches

#### 6. Actions (unchanged)
- Ready Up / Leave buttons

**Guest view:** Sections 1–3 are visible but all controls disabled/grayed. Sections 4–6 are fully interactive for the guest's own slot.

---

## Color Ownership Rule

Each player picks only their own color. The Players section shows everyone's current color as a read-only `<ColorSwatch>`. The "Your Color" picker at the bottom applies only to the authenticated user's slot. No player can change another player's color.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Selected layout owner leaves lobby | `selectedLayoutId` reset to null (standard); inline notice shown to host |
| `createLobby` called unauthenticated | Home button routes to `/auth/signin` instead |
| User at 10-game limit | Inline error on home page, no lobby created |
| Host selects layout not owned by any lobby player | `setLayout` mutation rejects server-side |
| Layout fails `validateLayout` | `setLayout` mutation rejects server-side |
| Team mode selected with 2 or 3 players | `setTeamMode` mutation rejects server-side; button not shown in UI |

---

## Testing

- Unit tests for new/updated Convex mutations: auth guards, host-only enforcement, board ownership validation, board reset on player leave, `receiverId`-optional `createLobby`
- Unit test `getLobbyBoards`: correct union across lobby players, standard board always first, deduplication
- Existing lobby/game tests remain passing after schema migration
- Manual: full flow from home → lobby → invite friend → ready up → game start

---

## Convex Dependency Update

Update `convex` 1.31.7 → 1.39.1 and `@convex-dev/auth` 0.0.90 → 0.0.92. All existing backend data is preserved (Convex schema migrations are additive). Run `npx convex dev` after update to regenerate types and verify deployment.
