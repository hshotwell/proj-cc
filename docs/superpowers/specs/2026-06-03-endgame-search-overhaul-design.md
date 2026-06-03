# Endgame Search Overhaul Design

**Date:** 2026-06-03
**Status:** Approved

## Problem

The in-game AI makes poor decisions in the endgame — backwards moves, redundant shuffles, stalling with a single piece left. Two root causes:

1. `findEndgameMove()` (fires at 7+ pieces in goal) is a greedy rule-based function with zero lookahead. If its heuristics get confused, the AI makes bad moves with no search to catch them.
2. The existing `AI_ENDGAME_DEPTH` constants are dead letters in late endgame because `findEndgameMove()` intercepts before minimax ever runs.
3. The training program's puzzle scores are useless as a signal — every genome already scores 100/100 because the puzzle evaluator uses stronger search (beam width=5, depth=5) than the real AI ever uses.

## Goals

- Replace the greedy late-endgame intercept with real search, scaled deeper as the position simplifies
- Add an endgame tablebase (1–2 pieces remaining) built by training for instant perfect play
- Add a position pattern cache built during GA training to improve move ordering in the 3–8 piece range
- Unify the three existing phase/depth systems (`detectPhase`, `AI_ENDGAME_DEPTH`, `isLateEndgame`) into one coherent parameter curve

## Non-Goals

- Changing midgame search behavior
- Modifying the opening book
- Changing AI difficulty variance (`selectMoveWithVariance`)

---

## Design

### 1. Unified Depth Scaling

**Replace** `detectPhase()` + `AI_ENDGAME_DEPTH` + the `isLateEndgame()` full-decision intercept with a single function:

```ts
computeSearchParams(state, player, difficulty): { depth: number; moveLimit: number }
```

This returns search parameters based on how many pieces are currently in goal. The depth curve:

| Pieces in goal | Pieces out | Hard depth | Medium depth | Easy depth | Move limit (hard/med/easy) |
|----------------|------------|-----------|-------------|-----------|---------------------------|
| 0–3            | 10–7       | 2          | 2            | 2          | 20 / 15 / 10              |
| 4–6            | 6–4        | 3          | 2            | 2          | 16 / 12 / 8               |
| 7              | 3          | 5          | 4            | 3          | 12 / 10 / 6               |
| 8              | 2          | 7          | 5            | 3          | 8 / 6 / 4                 |
| 9              | 1          | 9          | 7            | 4          | 6 / 4 / 3                 |

Move limit scales down with pieces remaining because branching factor collapses — depth 9 with 1 piece and limit 6 is near-instant.

**Strip `findEndgameMove()`** to only two provably-correct fast-path cases (always right, no search needed):
1. Direct goal entry (outside piece can step or jump into an empty goal cell) — always take deepest available
2. Move-deeper-within-goal (piece in goal can advance to a deeper goal cell, no pieces waiting outside) — always take

Everything else — shuffling, stepping stones, approaching from outside, make-room sequences — is removed from the rule-based path and handled by the depth-scaled minimax. The `scoreEndgameMove()` heuristic bonuses stay in place inside `getTopMoves()` to guide move ordering, but no longer make the final decision.

**`AI_DEPTH`, `AI_OPENING_DEPTH`, `AI_ENDGAME_DEPTH` constants** in `src/types/ai.ts` are replaced by `computeSearchParams`. `detectPhase()` is removed.

### 2. Endgame Tablebase

A lookup table of solved 1–2 piece endgame positions, built by the training program and stored in localStorage.

**Position key format:**
```
"outside:{q1,r1};{q2,r2}|empty-goals:{qa,ra};{qb,rb}"
```
Coordinates within each group are sorted canonically for consistent keying. For 1-piece positions the outside group has one entry; for 2-piece it has two.

**Entry format:**
```ts
interface TablebaseEntry {
  from: { q: number; r: number };
  to: { q: number; r: number };
  solvedIn: number; // turns to solve from this position
}
```

**Storage:** `localStorage` key `chinese-checkers-endgame-table`. JSON object mapping position key → entry. Estimated size ~1.7MB (500 one-piece positions + ~55k two-piece positions at ~32 bytes each).

**Building the table (`buildEndgameTablebase`):**
- Implemented in `src/game/training/tablebaseBuilder.ts`
- Takes the best genome found in training
- Enumerates reachable 1–2 piece positions by replaying saved games and sampling the last few turns, supplemented by the curated puzzle positions
- Solves each position using minimax at depth 12 (1 piece) or depth 8 (2 pieces) with the best genome
- Stores results incrementally so the builder can be interrupted and resumed
- Progress exposed as `{solved, total, sizeBytes}` for the UI

**In-game lookup (`lookupTablebase`):**
- Implemented in `src/game/ai/tablebase.ts`
- Loads and caches the table from localStorage once on first call (lazy, no startup cost)
- Called at the top of `findBestMove()`, before the rule-based fast-path
- If a hit is found, return that move immediately — no search runs
- Cache is invalidated when a new table is stored (version timestamp in localStorage)

**Training UI:** A "Build Endgame Table" button on the `/training` page, enabled after a training run completes (best genome must exist). Shows a progress bar and estimated size. Can be re-run to rebuild with an improved genome.

### 3. Position Pattern Cache

Lightweight score adjustments for move ordering, extracted from the GA tournament games and applied inside `getTopMoves()`.

**Feature vector (per move):**
- `piecesInGoalBucket`: `'3-5' | '6-7' | '8'`
- `isChainJump`: boolean
- `chainLengthBucket`: `'1' | '2' | '3+'`
- `isDirectGoalEntry`: boolean
- `distBucket`: `'near'` (≤3) | `'mid'` (4–6) | `'far'` (7+)

~30 feature combinations total.

**Cache entry:**
```ts
interface PatternEntry {
  totalGames: number;
  wins: number; // games where this feature combo correlated with finishing within par
  scoreDelta: number; // pre-computed: (wins/totalGames - 0.5) * PATTERN_SCALE
}
```

**Building the cache:** During the GA tournament in `trainingStore.ts`, whenever a game reaches a position with 3–8 pieces outside goal, record the feature vector of the move chosen and whether the player finished within a par count from that point. Accumulated into `src/game/training/patternCache.ts`. Flushed to `localStorage` under `chinese-checkers-pattern-cache` after each generation.

**In-game use:** At the end of the scoring loop inside `getTopMoves()`, look up each move's feature vector and add `scoreDelta` to the score. This adjusts move ordering without affecting the minimax result — better ordering means more pruning and faster convergence. No change to minimax logic itself.

**Par definition for pattern collection:** From a position with N pieces outside goal, par = N × 4 turns (generous, filters out only genuinely terrible sequences).

---

## File Changes

| File | Change |
|------|--------|
| `src/types/ai.ts` | Remove `AI_DEPTH`, `AI_OPENING_DEPTH`, `AI_ENDGAME_DEPTH`; add nothing (params computed dynamically) |
| `src/game/ai/search.ts` | Replace `detectPhase()` + depth lookup with `computeSearchParams()`; call `lookupTablebase()` at top of `findBestMove()` |
| `src/game/ai/endgame.ts` | Strip `findEndgameMove()` to direct-entry + move-deeper only; remove stepping stone, make-room, shuffle sequence logic |
| `src/game/ai/tablebase.ts` | New file: `lookupTablebase()`, cache management, position key generation |
| `src/game/training/tablebaseBuilder.ts` | New file: `buildEndgameTablebase()`, position enumeration, minimax solver |
| `src/game/training/patternCache.ts` | New file: feature extraction, accumulation, serialization |
| `src/store/trainingStore.ts` | Wire pattern cache accumulation into game loop; expose tablebase build action |
| `src/app/training/page.tsx` | Add "Build Endgame Table" button and progress display |

---

## Testing

- Unit tests for `computeSearchParams()` — verify depth/limit at each piece-count threshold
- Unit tests for `lookupTablebase()` — position key canonicalization, cache hit/miss
- Unit tests for pattern cache feature extraction — verify correct bucket assignment
- Integration test: run all 5 curated puzzles against the new search path (no tablebase), verify solved in ≤ par with DEFAULT_GENOME
- Integration test: build a minimal tablebase from a known puzzle, verify lookup returns the correct move
