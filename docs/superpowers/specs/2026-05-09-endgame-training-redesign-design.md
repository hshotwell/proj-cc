# Endgame Training Redesign

**Date:** 2026-05-09
**Status:** Approved

## Overview

Improve the endgame GA training system in four areas:
1. Apply the evolved endgame genome to all AI difficulties during the endgame phase
2. Reform fitness scoring to remove the effective ceiling
3. Expand the puzzle set from 5 to 15
4. Upgrade the training runner from depth-0 greedy to beam-3 depth-3 search, and add four new abstract pattern genes to the genome

---

## 1. Endgame Genome Applied to All AI

### What changes
Currently the endgame-evolved genome is only used when difficulty is `'evolved'`. `'evolved'` is removed as a selectable difficulty — it was a transitional option that no longer makes sense now that the evolution system trains all AI.

During the endgame phase (when a player has ≥ `endgameThreshold` pieces in goal), **all difficulty levels** switch to the endgame-evolved genome for position evaluation. Search depth stays per-difficulty:

| Difficulty | Search depth |
|------------|-------------|
| easy | 1 |
| medium | 2 |
| hard | 3 |

The genome is already fetched and cached client-side with a 5-minute TTL. If it hasn't loaded yet, the existing hardcoded endgame weights are used as fallback — no latency impact.

### Files affected
- `src/game/ai/evaluate.ts` — load endgame genome for all difficulties when in endgame phase
- `src/game/ai/search.ts` — remove `'evolved'` difficulty branch
- `src/types/game.ts` (or wherever `Difficulty` is typed) — remove `'evolved'` from the union
- Any UI components that render difficulty options — remove `'evolved'` from the list

---

## 2. Fitness Scoring Reform

### What changes
The old formula gave a modest flat bonus for beating par (`+5 per turn under`), creating a soft ceiling that meant a genome finishing in half the time barely outscored one that just made par.

**New formula:**

```
unsolved          → 0
solved > par      → max(0, 100 − (turns − par) × 10)
solved ≤ par      → 100 × (par / turnsUsed)
```

The under-par case now uses a ratio. Finishing in exactly par scores 100. Finishing in half the par time scores 200. Finishing in a third scores 300. There is no ceiling — outstanding sequences are proportionally rewarded. The over-par penalty is eased slightly (×10 instead of ×15) so nearly-solved attempts still provide gradient signal.

Fitness is still the mean score across all puzzles.

### Files affected
- `src/game/training/endgameRunner.ts` — update `scoreGenomeOnPuzzles`

---

## 3. Expanded Puzzle Set (5 → 15)

### New puzzles

All puzzles use player 0's goal zone (q+r ≥ 5, bottom-right triangle). Exact coordinates are validated against the board's cell list during implementation.

| Name | Pieces in goal | Scenario | Par |
|------|---------------|----------|-----|
| *(existing)* Nearly Done | 9 | 1 piece just outside entry | 2 |
| *(existing)* Two to Go | 8 | 2 approaching | 4 |
| *(existing)* Set Up the Chain | 7 | 3 pieces rewarding a chain | 6 |
| *(existing)* Mid-Endgame | 5 | 5 in approach corridor | 9 |
| *(existing)* The Sprint | 4 | 6 spread through approach | 12 |
| Last Mile | 9 | 1 piece 4 cells out — tests regression avoidance | 4 |
| Corner Entry | 9 | 1 piece needs an indirect path to the only open goal cell | 3 |
| Straggler Crisis | 8 | 1 piece close, 1 still in starting zone | 8 |
| Traffic Jam | 7 | 3 pieces bunched at goal entrance needing ordered entry | 4 |
| Chain Ladder | 6 | 4 pieces in a diagonal line — rewards recognizing a long jump chain | 5 |
| Two Waves | 5 | 3 near goal, 2 still far — tests prioritizing the right group | 10 |
| The Bottleneck | 5 | 5 pieces funneling through a narrow corridor | 8 |
| Spread Out | 4 | 6 pieces scattered at varied distances | 14 |
| Long Road | 2 | 8 pieces in approach zone, no chains set up | 20 |
| Full Approach | 0 | All 10 pieces mid-board, no jumps available | 25 |

New puzzles are added to `SEED_PUZZLES` in `endgameTrainingActions.ts`. Because seeding is guarded by `puzzleCount === 0`, a one-time migration mutation is needed to insert the new puzzles into existing deployments.

### Files affected
- `convex/endgameTrainingActions.ts` — add 10 puzzles to `SEED_PUZZLES`
- `convex/endgameTraining.ts` — add `addMissingPuzzles` internal mutation for migration

---

## 4. New Pattern Genes

Four board-agnostic evaluation signals added to the genome. These apply during mid-game and endgame alike, on any board layout.

### `chainDepth` [0, 5]
Simulates how many consecutive hops each piece can actually make from its current position (not just counting neighbors as `jumpPotential` does). A piece that can chain 4 hops scores proportionally more. Rewards positions that set up long multi-jump sequences.

### `pathClearance` [0, 5]
For each non-goal piece, counts how many cells on its optimal route to goal are currently unoccupied. Rewards open lanes and penalizes clogged corridors. Distinct from `goalDistance`, which measures how far pieces are but not whether the road is open.

### `formationSpread` [0, 5] *(penalty multiplier)*
Standard deviation of piece positions from the group centroid. Penalizes pieces scattered across the board (hard to chain-help each other) and rewards a tight traveling formation. Distinct from `centerControl`, which measures proximity to the board center, not piece cohesion.

### `vanguardBonus` [0, 5]
Rewards having a lead piece ahead of the group average — but shaped as a bell curve. The bonus peaks when the vanguard is 2–4 cells ahead of the group average (close enough to act as a useful jump stepping-stone for trailing pieces) and falls off for pieces that have run so far ahead they can no longer be reached. A piece isolated 8+ cells out front is a liability, not an asset.

### Gene range additions
All four are added to the `GENE_RANGES` map in `evolution.ts` so mutation and crossover respect their bounds.

### Files affected
- `src/types/training.ts` — add 4 fields to `Genome` type
- `src/game/training/evaluate.ts` — implement and integrate the 4 scoring functions
- `src/game/training/evolution.ts` — add gene ranges for the 4 new parameters
- `src/game/training/endgameRunner.ts` — new genes are picked up automatically via `evaluateWithGenome`

---

## 5. Beam Search Depth-3 Training Runner

### What changes
The runner currently picks the best immediate move each turn (depth-0 greedy). It is upgraded to **beam search, width 3, depth 3**.

**Algorithm per turn decision:**
1. Generate all valid moves from the current state
2. Score each with `evaluateWithGenome` (including all penalties)
3. Keep the top 3 (beam)
4. For each beam state, expand all moves, score, keep top 3 across all children
5. Repeat for depth 3
6. Back the best leaf score up to select the current move

This means the genome is evaluated on 3-move sequences, not single steps. It learns to value positions that set up good chains 2–3 moves later.

### Compute budget

| | Current | New |
|--|---------|-----|
| Evaluations per turn | ~15 (all moves, depth-0) | ~27 (3×3×3 beam) |
| Evaluations per puzzle (12-turn avg) | ~180 | ~324 |
| Puzzles | 5 | 15 |
| Genomes | 8 | 8 |
| Evaluations per batch | ~7,200 | ~38,880 |
| Compute per action | < 5s | ~15–20s |
| Cron interval | 60 min | 3 hours |
| Runs/month | ~720 | ~240 |
| GB-hours/month (est.) | ~0.24 | ~0.65 |

Stays well under the 1 GB-hour/month limit. `batchTimeLimitMs` remains at 50s as a safety net.

### Files affected
- `src/game/training/endgameRunner.ts` — replace greedy loop with beam search
- `convex/crons.ts` — update interval from 60 to 180 minutes
- `convex/endgameTrainingActions.ts` — update budget comment

---

## Out of Scope

- Dynamic puzzle generation from simulated games (future work)
- Multi-genome (opening / mid-game / endgame) split (future work)
- Pattern lookup tables or move libraries at play time
