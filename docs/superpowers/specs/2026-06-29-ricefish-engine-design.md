# Ricefish AI Engine — Design

**Status:** approved
**Date:** 2026-06-29
**Author:** brainstormed in-session

## Goal

Add a second selectable AI "engine" — distinct from the existing default engine — based on the [Ricefish](https://github.com/bsamseth/Ricefish) Chinese checkers algorithm. The Ricefish bake-off harness (`tools/ricefish-match/`) has shown the upstream C++ engine plays a different style from our AI and can beat our hard difficulty. Porting the algorithm gives the user a stylistically distinct opponent that lives natively in the browser (no native binary required).

The port must be **expandable**: 3+ player games, custom board layouts, team mode, and piece variants should all work on day one.

## Constraints

- **Do not modify** `src/game/ai/search.ts`, `src/game/ai/strategy.ts`, or `src/game/ai/evaluate.ts` — another agent owns them.
- May add a single branch in `src/game/ai/worker.ts` and a small type extension in `src/types/ai.ts`.
- Must work in the existing Web Worker (no main-thread work, no native deps, no network).

## Non-goals

- 1:1 bit-exact reproduction of upstream Ricefish output. We port the algorithm — eval shape and search style — but generalize the board model and embrace the project's existing primitives.
- A separate UCI-over-Worker protocol. The bake-off harness keeps existing for offline benchmarking; in-app play uses direct function calls.

## Architecture

### Module layout

All new code lives in one self-contained directory:

```
src/game/ai/ricefish/
  evaluate.ts       — eval function (generalized to N players + custom goals)
  ordering.ts       — move ordering heuristics
  search.ts         — alpha-beta (N=2) + Max^n (N≥3) + iterative deepening + TT
  dispatcher.ts     — findRicefishMove(state, difficulty, personality)
  index.ts          — public exports
```

This module **only** imports from:
- `@/types/*`
- `@/game/coordinates`
- `@/game/moves` (for `getAllValidMoves`)
- `@/game/state` (for `applyMove`, `hasPlayerWon`, `getGoalPositionsForState`)
- `@/game/setup` (for `getPlayerPieces`)
- `@/game/constants` (for `OPPOSITE_PLAYER`, depth tables)

It does **not** import from `src/game/ai/*` to keep cleanly separated from the other agent's churn.

### Evaluation (`evaluate.ts`)

Generalization of Ricefish's `score_by_side<Us>()`:

```ts
// For each player p, compute total distance from p's pieces toward p's goal.
// Goal is represented as the centroid of p's current goal positions (via
// getGoalPositionsForState so custom boards work).
playerDistance(state, p) -> number =
  sum over p's pieces of cubeDistance(piece, centroid(goalPositions(p)))

// Score for player p is "everyone else's distance minus my distance".
playerScore(state, p, personality) -> number =
  (sum over q != p of playerDistance(state, q) * defenseWeight(personality))
  - playerDistance(state, p)
```

**Personality bias** (applied to the eval, not the search):
- `generalist`: `defenseWeight = 1.0` — pure Ricefish-style symmetric eval.
- `defensive`: `defenseWeight = 2.0` — weight opponents' remaining progress more, encouraging blocks.
- `aggressive`: `defenseWeight = 0.75` — discount opponents' progress, prioritize own advance. Move ordering also adds a `+jumpDistance` bonus.

**Win/loss shortcuts** (terminal detection is authoritative via `hasPlayerWon`; the upstream `<=20` distance heuristic is dropped because it was a speedup for the C++ version, not part of the algorithm's correctness):
- If `hasPlayerWon(state, p)` for player `p` being evaluated → return `MATE = 1e9`.
- If `hasPlayerWon(state, q)` for any opponent `q` → return `-MATE`.

### Move ordering (`ordering.ts`)

Generalization of Ricefish's `MoveList::rate()` which scores moves by `dist(from, to)`:

```ts
moveOrderingScore(move, personality) =
  cubeDistance(move.from, move.to)         // longer hops first
  + (move.isJump ? 1 : 0)                  // prefer jumps over steps
  + (personality === 'aggressive' ? 0.5 * cubeDistance(...) : 0)
```

Sorted descending; stable.

### Search (`search.ts`)

**2-player path** — straight alpha-beta with iterative deepening:
- Iteratively deepen from depth 1 → `MAX_DEPTH[difficulty]`.
- At each depth, run negamax with alpha-beta.
- Order children by `moveOrderingScore`, then re-sort using the previous iteration's PV (move from prior depth's best line first).
- Transposition table keyed by `(boardHash, depth, currentPlayer)` storing `{value, flag: exact|lower|upper, bestMove}`.
- Killer move heuristic — 2 slots per ply, sorted before non-killers.

**N≥3 player path** — Max^n:
- Each node maintains a vector `score: number[]` indexed by `activePlayers`.
- At each ply, the current player picks the child maximizing `score[currentPlayer]`.
- No pruning (Max^n's safe pruning conditions are restrictive and not worth the complexity for v1).
- Shallower depths (since branching factor grows): `MAX_DEPTH_MULTIPLAYER[difficulty]` = `MAX_DEPTH[difficulty] - 1`, clamped to ≥1.

**Time budget**: iterative deepening checks elapsed wall-clock at each node entry; aborts the current depth and returns the previous iteration's best if budget exceeded. Budget per difficulty:
- easy: 500 ms
- medium: 1500 ms
- hard: 4000 ms

(Matches the upstream Ricefish `go movetime` style.)

**Depth table**:
| difficulty | 2-player depth | N-player depth |
|------------|----------------|----------------|
| easy       | 2              | 1              |
| medium     | 3              | 2              |
| hard       | 4              | 3              |

### Dispatcher (`dispatcher.ts`)

Single public function:

```ts
export function findRicefishMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality
): Move | null
```

Same signature as `findBestMove` from the default engine (minus opening book — Ricefish has no book). Internally branches on `state.activePlayers.length`.

### Type extension

`src/types/ai.ts` gets:

```ts
export type AIEngine = 'default' | 'ricefish';

export interface AIConfig {
  engine?: AIEngine;          // defaults to 'default' when missing
  difficulty: AIDifficulty;
  personality: AIPersonality;
}
```

Optional field — existing saved games and AI configs continue to work as `engine = 'default'`.

### Worker plumbing

`src/game/ai/worker.ts` — add a single branch:

```ts
const move = aiConfig.engine === 'ricefish'
  ? findRicefishMove(state, aiConfig.difficulty, aiConfig.personality)
  : findBestMove(state, aiConfig.difficulty, aiConfig.personality, openingMoves);
```

No other shared code touched.

### UI

`src/components/setup/*` (the AI configuration UI in play setup / lobby):

- Add an "Engine" dropdown with options Default / Ricefish (default = Default for backward compat).
- Difficulty + personality dropdowns remain visible and active for both engines.

Concrete file edits depend on existing structure — to be enumerated in the implementation plan.

## Data flow

1. User picks Engine=Ricefish + difficulty/personality in setup → stored in `AIPlayerMap`.
2. Game starts → on AI's turn, `useAITurn` posts game state + AI config to worker.
3. Worker reads `aiConfig.engine`, dispatches to `findRicefishMove` or existing path.
4. Worker returns the chosen `Move`; UI applies it via existing path. No further changes.

## Testing

- **Unit tests** at `tests/game/ai/ricefish/`:
  - `evaluate.test.ts` — eval is symmetric, win/loss shortcuts trigger, custom-board goal centroid works.
  - `search.test.ts` — 2P alpha-beta picks known wins; Max^n picks player-1 best in toy 3P position.
  - `ordering.test.ts` — long jumps first; personality bias applies.
- **Integration**: extend the bake-off harness to support `--our-engine ricefish` so we can pit ported-Ricefish vs upstream Ricefish (best fidelity check we can do without bit-exact reproduction).
- **Manual smoke test**: start a 2P game with Engine=Ricefish hard generalist, play 20 moves, confirm reasonable behavior.

## Error handling

- `findRicefishMove` returns `null` if no legal moves exist (same convention as `findBestMove`).
- TT memory bounded — evict oldest entries beyond 100k entries to avoid OOM in long Max^n searches.
- Iterative deepening always returns at least the depth-1 best move; if even depth 1 times out (shouldn't happen) fall back to a random legal move with a console warning.

## Risks

- **Behavioral divergence from upstream Ricefish**: our generalized eval differs from `score_by_side` (centroid vs. fixed goal tip). Mitigation: bake-off integration test compares port vs. upstream on standard 2P.
- **Max^n speed at depth 3**: ~6 active children × 60 pieces × 3 ply = ~3.6M positions worst case. Iterative deepening + time budget should keep it under 4s but may not reach depth 3 in 6-player games. Acceptable for v1 — UI shows a "thinking" spinner.
- **Worker.ts merge conflict**: if the other agent edits worker.ts simultaneously, our small branch may need rebasing. Mitigation: keep the edit minimal (one if/else block).

## Out of scope (defer)

- Opening book for Ricefish (upstream doesn't have one either).
- Tunable evaluation weights via UI (only personality presets in v1).
- Endgame tablebase / puzzle solver mode for the Ricefish engine.
- Per-engine "thinking" debug overlay.
