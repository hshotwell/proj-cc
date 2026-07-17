# Multiplayer Hex Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3/4/6-player hex chess with king-capture elimination, grey dead armies, CC corner/color reuse, and Max^n AI, per `docs/superpowers/specs/2026-07-16-multiplayer-hexchess-design.md`.

**Architecture:** Generalize `src/game/hexchess/` in place. Seat indices become CC player indices 0–5 (seat = home triangle). All geometry derives from the canonical seat-0 arm rotated by `rotateCube` k steps (`ROTATION_STEPS = {0:0, 4:1, 3:2, 2:3, 1:4, 5:5}`; note `R^3` = negation, so seat 2 reproduces the old player-1 geometry exactly). 2-player games become seats `[0, 2]` — old fixtures/saves remap player 1 → seat 2 with no coordinate changes. Rules mode is derived: `state.activePlayers.length === 2 ? 'checkmate' : 'king-capture'`.

**Tech Stack:** TypeScript strict, Vitest, Zustand, existing Web Worker AI.

## Global Constraints

- 2-player hex chess behavior unchanged: checkmate/stalemate/insufficient-material rules, no-self-check filtering, white/black defaults, alpha-beta search.
- King-capture mode (3+): check advisory only (no legality filtering); elimination only by actual king capture; eliminated pieces immobile/grey/threat-less/capturable/blocking; last standing wins (`reason: 'king-capture'`); threefold repetition = draw; no stalemate/insufficient-material detection.
- Seats/turn order/colors from CC: `ACTIVE_PLAYERS`, `PLAYER_COLORS`, `ROTATION_FOR_PLAYER` (constants.ts).
- EP window stays `availableUntilTurn = turnNumber + 1` (immediate next living player only).
- Old saves (schemaVersion 1) must load and replay identically after 1→2 remap.
- No emoji anywhere. Do not commit without the user's go-ahead.

## Key Shared Interfaces (referenced by all tasks)

`src/game/hexchess/state.ts` after Task 1:

```ts
export type HexPlayerIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface HexChessPlayerConfig { color: PieceColor; name: string; isAI: boolean; }

export interface HexChessConfig {
  id: string;
  seats: HexPlayerIndex[];                  // turn order, from ACTIVE_PLAYERS[count]
  players: Partial<Record<HexPlayerIndex, HexChessPlayerConfig>>;  // keyed by seat
  layoutPreset: 'v1-default';
  soldierVariant: 'soldier' | 'pawn';
  ai: null | Partial<Record<HexPlayerIndex, HexChessDifficulty>>;
}

export type HexEndReason = 'checkmate' | 'stalemate' | 'repetition'
  | 'insufficient-material' | 'resignation' | 'king-capture';

export interface HexChessState {
  // ...existing fields...
  activePlayers: HexPlayerIndex[];   // copy of config.seats
  eliminated: HexPlayerIndex[];      // in elimination order
}

export function rulesModeOf(state: HexChessState): 'checkmate' | 'king-capture' {
  return state.activePlayers.length === 2 ? 'checkmate' : 'king-capture';
}
```

`src/game/hexchess/board.ts` after Task 1:

```ts
export function livingPlayers(state: HexChessState): HexPlayerIndex[];   // activePlayers minus eliminated
export function isEliminated(state: HexChessState, p: HexPlayerIndex): boolean;
export function nextLivingPlayer(state: HexChessState, after: HexPlayerIndex): HexPlayerIndex;
// otherPlayer(p) is DELETED; 2p callers use nextLivingPlayer.
```

`src/game/hexchess/starting.ts` after Task 1:

```ts
export const ROTATION_STEPS: Record<HexPlayerIndex, number> = { 0: 0, 4: 1, 3: 2, 2: 3, 1: 4, 5: 5 };
// armCellsForPlayer / armExtensionCellsForPlayer / startingCellsForPlayer /
// promotionCellsForPlayer keep signatures, accept any HexPlayerIndex 0-5.
```

`src/game/hexchess/check.ts` after Task 3:

```ts
export function isCellAttackedByEnemies(state, cell, ofPlayer): boolean; // attackers = living players != ofPlayer
export function isInCheck(state, player): boolean;                      // uses isCellAttackedByEnemies
```

---

### Task 1: Widen seat indices + rotation-based geometry

**Files:**
- Modify: `src/game/hexchess/state.ts` (types above; `HexMove`/`HexPiece` unchanged shapes)
- Modify: `src/game/hexchess/starting.ts`, `src/game/hexchess/directions.ts`, `src/game/hexchess/board.ts`
- Modify (compile fixes only, keep 2p semantics): `src/game/hexchess/moves.ts`, `promotion.ts`, `check.ts`
- Test: `tests/game/hexchess/starting.test.ts`, `tests/game/hexchess/directions.test.ts`

**Steps:**

- [ ] Write failing tests: for every seat in {0,1,2,3,4,5}, `armCellsForPlayer(seat)` as a coordKey set equals `DEFAULT_BOARD_LAYOUT.startingPositions[seat]`; `forwardDiagonal(seat)` equals `rotateCube({q:-1,r:2,s:-1}, ROTATION_STEPS[seat])`; `promotionCellsForPlayer(0)` unchanged from current snapshot and `promotionCellsForPlayer(2)` equals the old player-1 zone (`r <= -1`); seat 3's zone is `{cells where rotateCube(cell, 6-ROTATION_STEPS[3]) has r >= 1}`.
- [ ] Implement: canonical seat-0 generators (existing player-0 branches); all public geometry fns rotate canonical output via `rotateCube(cell, ROTATION_STEPS[seat])`; promotion zone tests cells via inverse rotation `rotateCube(cell, 6 - ROTATION_STEPS[seat])` then `r >= 1`. `forwardEdges` derivation loop unchanged.
- [ ] `createInitialState(config)`: loop `config.seats`, place `V1_LAYOUT` on `startingCellsForPlayer(seat)`, ids `${seat}-${type}-${i}`; init `currentPlayer: config.seats[0]`, `activePlayers: [...config.seats]`, `eliminated: []`.
- [ ] board.ts: add `livingPlayers`/`isEliminated`/`nextLivingPlayer` (walk `activePlayers` cyclically from the seat after `after`, skip eliminated; throw if none). Delete `otherPlayer`; fix imports in moves.ts (`currentPlayer: nextLivingPlayer(state, mover)`), promotion.ts, check.ts (`isInCheck` uses the single opponent for now via `nextLivingPlayer`), useHexChessAITurn.ts (temporary: `nextLivingPlayer`).
- [ ] Update existing test fixtures: mechanical `player: 1` → `player: 2`, `currentPlayer: 1` → `2`, config literals to the new `{seats: [0,2], players: {0: ..., 2: ...}}` shape, `ai: {1: ...}` → `{2: ...}`. Coordinates need NO changes (tri-2 geometry == old player-1). Add a shared helper `tests/game/hexchess/helpers.ts` `makeConfig(overrides?)` and `makeState(overrides?)` producing valid 2p `[0,2]` fixtures, and use it where fixtures repeat.
- [ ] Run `npx vitest tests/game/hexchess` until green; `npx tsc --noEmit` clean (store/UI/AI files may still error — fix compile-only issues there with minimal edits: `config.players[seat]` lookups, `[0,1]` literals → `config.seats`).

### Task 2: King-capture rules engine

**Files:**
- Modify: `src/game/hexchess/moves.ts`, `check.ts`, `promotion.ts`, `state.ts` (reason type already done)
- Test: `tests/game/hexchess/kingCapture.test.ts` (new), `tests/game/hexchess/draws.test.ts`

**Behavior (all gated on `rulesModeOf(state) === 'king-capture'`):**

- `filterLegal` returns pseudos unchanged in king-capture mode (self-check legal).
- Move generation: pieces of eliminated players produce no moves (guard in `legalMoves`; also `pseudoMovesForPiece` returns `[]` for eliminated owner as defense-in-depth).
- `applyMoveCore`: if `move.capture` is a king (look up captured piece type in pre-move `state.pieces`), append its owner to `eliminated` in the returned state. Turn advance uses `nextLivingPlayer` over the post-elimination set.
- `applyMove` king-capture mode result detection replaces the 2p chain: if `livingPlayers(next).length === 1` → `{winner: thatSeat, reason: 'king-capture'}`; else if `isThreefoldRepetition(next)` → draw/repetition. No checkmate/stalemate/insufficient-material calls.
- `check.ts`: rename/add `isCellAttackedByEnemies(state, cell, ofPlayer)` — iterate pieces where `piece.player !== ofPlayer && !isEliminated(state, piece.player)`. `isInCheck` uses it (correct in both modes; in 2p the only enemy is the other seat). `isInsufficientMaterial` generalized to partition by `state.activePlayers[0]/[1]` (2p-only caller).
- `confirmPromotion`: mirror the mode split for result detection (promotion move may have captured a king — elimination already recorded by `applyMoveCore`; last-standing check must run here too).
- Multiplayer resign (store wiring in Task 5, engine here): add `eliminatePlayer(state, seat): HexChessState` to moves.ts — appends to `eliminated`, advances `currentPlayer` via `nextLivingPlayer` if it was that seat's turn, sets last-standing result if one remains.

**Test cases (write first, watch fail, implement, re-run):** 3-seat game `[0,3,1]`: king capture eliminates seat 3 → `eliminated: [3]`, turn order 0→1→0, seat-3 pieces generate no moves, seat-3 piece capturable by seat 0, seat-3 rook does NOT give check; self-check move present in `legalMoves` for 3p but absent for 2p; two eliminations → winner + `king-capture`; repetition draw in 3p; `eliminatePlayer` on current player advances turn; 2p suite still green.

### Task 3: Zobrist + persistence v2 + migration

**Files:**
- Modify: `src/game/hexchess/zobrist.ts` (`NUM_PLAYERS = 6`; replace single `sideToMoveKey` with `sideKey: bigint[6]`, XOR `sideKey[currentPlayer]`; fold each eliminated seat via new `eliminatedKey: bigint[6]` so frozen-army positions differ from live ones)
- Modify: `src/game/hexchess/persistence.ts`
- Test: `tests/game/hexchess/zobrist.test.ts`, `tests/game/hexchess/persistence.test.ts`

**Persistence:**

- `SavedHexChessGame.schemaVersion: 2`; save always writes v2.
- `loadHexChessGame`: if `schemaVersion !== 2` run `migrateV1(record)`: config `players` array → `{0: players[0], 2: players[1]}`, add `seats: [0, 2]`, `ai` key `1` → `2`; state/moveHistory remap every `player`/`currentPlayer` `1 → 2` (fields only — piece id strings, cells, enPassantTarget untouched), add `activePlayers: [0, 2]`, `eliminated: []`. `positionHashes` kept as-is (hash scheme changed; stale counts merely delay repetition detection in old in-progress games — accepted).
- `buildResultSummary`/index summary: `config.players[winner]` record lookup; `players:` summary array = `config.seats.map(s => config.players[s]!)`.

**Tests:** hashes differ by side-to-move seat and by eliminated-set; a crafted v1 JSON record loads with seats `[0,2]`, remapped players, and replays its moveHistory to the same final piece positions as a pre-recorded expectation; v2 round-trips.

### Task 4: Max^n AI + hook generalization

**Files:**
- Create: `src/game/ai/hexchess/maxn.ts`
- Modify: `src/game/ai/hexchess/evaluate.ts`, `search.ts`, `worker.ts` (none needed if search routes internally), `src/hooks/useHexChessAITurn.ts`
- Test: `tests/game/ai/hexchess/maxn.test.ts`, existing AI tests stay green

**evaluate.ts:** keep 2p `evaluate` but replace hardcoded 0/1 with `state.activePlayers[0]/[1]` (kingSafety loop, tempo, winner sign). Add:

```ts
export function evaluateVector(state: HexChessState): Record<number, number>;
// per living seat: material + pstBonus + mobility*2 + kingSafety*5 (own pieces near own king)
// eliminated seat: -1_000_000; winner (result set): +1_000_000_000; draw: 0 for all.
// Eliminated players' pieces contribute to NOTHING (skip in all sums) except as blockers implicitly.
```

**maxn.ts:**

```ts
export function searchBestMoveMaxN(state: HexChessState, options: SearchOptions): SearchResult;
```

- Iterative deepening over plies up to `options.maxDepth * livingCount` capped by `budgetMs` (check clock each root move).
- Recursive `maxn(state, depth)`: returns score vector; terminal (result set or depth 0) → `evaluateVector`. Mover = `state.currentPlayer`; generate `legalMoves` (pseudo-legal in this mode), order with `orderMoves` (king captures rank top via existing MVV-LVA `PIECE_VALUE.king`); apply each (auto-queen pending promotions, as 2p search does), recurse, keep the child maximizing the mover's own component. Shallow pruning: if mover's component reaches `1_000_000_000` (found a win) stop scanning siblings. No TT, no quiescence in v1.
- `SearchResult.evalCp` = mover's own component of the chosen vector (keeps worker protocol unchanged).

**search.ts:** `searchBestMove` routes: `state.activePlayers.length > 2 ? searchBestMoveMaxN(state, options) : existing alpha-beta` (root maximizing = `state.currentPlayer === state.activePlayers[0]`).

**useHexChessAITurn.ts:** replace `otherPlayer`-based blunder helpers with enemy-agnostic ones: `movePutsPieceEnPrise`/`maxHangingOwnValue` use `isCellAttackedByEnemies`; defender check uses `isCellAttacked(state, cell, mover)` as today. Multiplayer: skip the `isCheckmate` guard, instead never blunder/shuffle away a move whose `capture` piece is a king; `givesCheck` = any living opponent newly in check. Difficulty budgets unchanged.

**Tests:** in a 3p position with a free adjacent enemy king, maxn at depth 1 returns the king capture; maxn returns some legal move for seats in 3/4/6 initial positions at depth 1-2 within budget; 2p `searchBestMove` still routes to alpha-beta (spy or behavior: known mate-in-1 test stays green).

### Task 5: Store, board view, sounds, resign

**Files:**
- Modify: `src/store/hexChessStore.ts`
- Test: `tests/store/hexChessStore.test.ts`, `tests/store/hexChessStore.selectBoardView.test.ts`

**Changes:**

- `resign()`: 2p → existing behavior generalized (`winner: nextLivingPlayer(state, currentSeat)`); multiplayer → `eliminatePlayer(state, resigningSeat)` (resigner = `state.currentPlayer` only if human's seat — keep current semantics: resign button acts for `currentPlayer` in hotseat, or the single local human seat when exactly one human; compute `resigningSeat = localHumanSeat ?? state.currentPlayer` passed in from container — add optional param `resign(seat?: HexPlayerIndex)`).
- `selectHexChessBoardView`:
  - piece color: `isEliminated(state, piece.player) ? '#8a8a8a' : config.players[piece.player]!.color` (grey flows through existing icon fill; no Piece.tsx changes).
  - check highlights: for every living seat whose king `isInCheck`, push `{kind:'check', cell}`.
  - rotation: `rotationForPlayer(seat)` → `ROTATION_FOR_PLAYER[seat]` from `@/game/constants`; initial focus = first human seat in `config.seats`, else `config.seats[0]`.
  - `playerColors`: `Object.fromEntries(config.seats.map(s => [s, config.players[s]!.color]))`.
  - `activePlayerColor/IsAI` via seat lookups.
- `attemptMove` sounds: capture of a king → `playCheckmate()` (elimination fanfare); otherwise existing logic with multiplayer check = any living player in check.
- `selectPiece`: unchanged logic already seat-safe.

**Tests:** eliminated seat's pieces come back grey `#8a8a8a` in view; two simultaneous check highlights possible; resign in 3p eliminates and game continues; resign in 2p ends game.

### Task 6: Game UI — turn indicator, game-over, container

**Files:**
- Modify: `src/components/hexchess/HexTurnIndicator.tsx`, `HexGameOverDialog.tsx`, `HexGameContainer.tsx`
- Test: `tests/components/hexchess/HexIndicators.test.tsx`

**HexTurnIndicator:** 2 seats → unchanged rendering. 3+ → horizontal seat list in turn order: swatch + name per seat; current seat gets the colored left-border card treatment; eliminated seats greyed (`opacity-50 line-through`) with grey swatch; append "in check" chip to any living seat in check. Result rendering: winner line (existing) — reason `king-capture` displays as "last player standing".
**HexGameOverDialog:** multiplayer adds finish order list under the winner: 1st = winner, then reverse `state.eliminated` (each with swatch + name).
**HexGameContainer:** `humanPlayers` from `config.seats.filter(s => !config.ai?.[s])`; `localPlayer` unchanged rule (exactly one human); resign passes `resign(localPlayer)` when defined; PromotionPicker colors via `config.players[seat]!`.

**Tests:** render 3p indicator with one eliminated seat (greyed) and current seat highlighted; game-over dialog shows finish order.

### Task 7: Play page setup

**Files:**
- Modify: `src/app/play/page.tsx`, `src/components/hexchess/HowToPlayHexChess.tsx`

**Changes:**

- Remove hexchess count lockout (`lockedOut` and the "only 2 players" note); all of 2/3/4/6 selectable.
- Mode-switch effect: entering hexchess stashes sternhalma colors; hexchess defaults now depend on count — extract `hexChessDefaultColors(count)`: count 2 → `{0: white, 2: black}`; 3+ → `{}` (falls back to `PLAYER_COLORS` CC defaults). Re-apply when `selectedCount` changes while in hexchess mode.
- `handleStartGame` hexchess branch: build from `configPlayers` (already CC seats):

```ts
const seats = ACTIVE_PLAYERS[selectedCount] as HexPlayerIndex[];
const players = Object.fromEntries(seats.map(s => [s, {
  color: getEffectiveColor(s), name: playerNames[s] ?? getDefaultName(s, seats), isAI: aiConfig[s] != null,
}]));
const ai = Object.fromEntries(seats.filter(s => aiConfig[s]).map(s => [s, aiConfig[s]!.difficulty ?? 'medium']));
const hexConfig: HexChessConfig = { id, seats, players, layoutPreset: 'v1-default', soldierVariant: 'soldier', ai: Object.keys(ai).length ? ai : null };
```

- HowToPlayHexChess: add a short "Multiplayer (3-6 players)" section: king capture eliminates, check is a warning only, grey armies block but can be captured, last player standing wins.

**Verify:** `npm run build` clean; manual flow (Task 8).

### Task 8: End-to-end verification

- [ ] `npm run test` — full suite green.
- [ ] `npm run build` — clean.
- [ ] Browser (per memory `browser-verification.md`: node_modules/playwright + Firefox): start a 3-player hexchess game with 2 AI seats on easy; verify corner placement/colors, AI moves for both seats, ignore-check move allowed, king capture greys an army and skips its turns, grey piece capturable, game-over on last standing; load an old-format 2p save if present; replay a finished multiplayer game.
- [ ] Update memory files (`hexchess-*.md`, MEMORY.md) with the multiplayer architecture.
