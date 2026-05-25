# Endgame Training V2: Curated Puzzle Prioritization + Genome Expansion

**Date:** 2026-05-25

## Summary

The endgame training system has been running for 3,775+ generations but has four compounding problems that prevent it from consistently solving the newly added curated 3-move straggler puzzles:

1. **Genome schema drift** — The stored/evolved genomes are missing `chainDepth`, `pathClearance`, `formationSpread`, and `vanguardBonus` because those fields were added to the `Genome` type after the initial genome was saved. The endgame trainer warm-starts from that incomplete genome, silently treating those signals as zero.
2. **Curated puzzles under-weighted** — Simple mean over all puzzles gives the 5 curated puzzles only 25% of the fitness signal, diluted by 15 seeded puzzles with pars of 2–25.
3. **Beam search too narrow/shallow** — Width=3, depth=3 prunes winning branches when an intermediate state (e.g. a goal piece shuffles to create a bridge) scores neutrally before the straggler chain is visible.
4. **No endgame-specific straggler heuristics** — The evaluator has no way to reward "straggler has a jump chain set up" or "straggler is one hop from a goal cell" independently of the general chain depth and goal distance signals.

This design fixes all four, preserves the current best genome as an in-game benchmark, and starts fresh training.

---

## Issues Not in Scope

- General (game-based) training is unchanged.
- The in-game AI switches to the new genome automatically once it surpasses the benchmark — no manual promotion step.

---

## Genome Expansion

Three new fields are added to the `Genome` interface in `src/types/training.ts`:

| Field | Range | Default | Purpose |
|---|---|---|---|
| `stragglerChainMultiplier` | [0, 5] | 2.0 | In endgame mode, amplifies the chain-depth score computed **only for pieces outside the goal zone**. Rewards positions where the straggler has a jump chain set up (even before it has moved). |
| `goalEntryBonus` | [0, 30] | 8.0 | Bonus per non-goal piece that can reach a goal cell in a single hop. Directly rewards the "one jump away" positioning. |
| `lastPieceMultiplier` | [1, 6] | 3.0 | When exactly 1 piece remains outside the goal, multiplies both the `goalDistance` signal and the `stragglerChainMultiplier` signal. Gives the AI tunnel-vision on the final piece. |

`GENE_RANGES` in `evolution.ts` gains corresponding entries so the GA evolves all three.

`DEFAULT_GENOME` in `evaluate.ts` gains the three new fields at their default values.

### Why no `goalRepositionPenalty`

Goal pieces sidestepping or shuffling deeper **within** the goal zone are `fromIsGoal && toIsGoal` moves — `goalLeavePenalty` never fires for them. The reason the AI doesn't currently make those moves is purely a beam search depth issue: at depth 3/width 3, the "goal piece shuffles → straggler chain appears → straggler wins in 2 more hops" sequence is invisible. The deeper beam (below) and `stragglerChainMultiplier` resolve this without a new penalty gene.

---

## Evaluator Changes (`evaluate.ts`)

### Genome backfill

Anywhere a genome is loaded from Convex, it is spread over `DEFAULT_GENOME` first:

```typescript
const genome = { ...DEFAULT_GENOME, ...storedGenome };
```

This repairs the missing-field bug for all existing stored genomes without requiring a data migration.

### New compute functions

**`computeStragglersChainDepth(pieces, goalSet, board)`**
Same recursive logic as `computeChainDepth` but skips pieces whose coord key is in `goalSet`. Returns total chain depth for out-of-goal pieces only.

**`computeGoalEntryBonus(pieces, goalSet, board, goalPositions)`**
For each non-goal piece, iterates all 6 directions. If an adjacent cell holds a piece, the jump landing is a goal cell, and the landing cell is empty, that piece scores 1 entry. Returns total entry count.

### Updated `evaluateWithGenome` in endgame mode

In endgame mode (`inGoal >= genome.endgameThreshold`):

```
stragglersChainScore  = computeStragglersChainDepth(pieces, goalSet, board)
goalEntryCount        = computeGoalEntryBonus(pieces, goalSet, board, goalPositions)
lastPieceFactor       = (pieces.length - inGoal === 1) ? genome.lastPieceMultiplier : 1.0

finalScore += genome.stragglerChainMultiplier * lastPieceFactor * stragglersChainScore
finalScore += genome.goalEntryBonus * goalEntryCount
// existing goalDistance score also multiplied by lastPieceFactor
```

The existing `chainDepth` term (all pieces) is kept — it still contributes to non-endgame evaluation.

---

## Beam Search + Puzzle Scoring (`endgameRunner.ts`)

### Beam search

| Parameter | Old | New |
|---|---|---|
| `BEAM_WIDTH` | 3 | 5 |
| `BEAM_DEPTH` | 3 | 5 |

Approximately 3× more paths explored per turn. The "goal piece shuffles → straggler chain exists → straggler enters goal" 3-move sequence is within the new search horizon.

### Weighted puzzle scoring

`StoredPuzzle` gains an optional `source?: string` field.

`scoreGenomeOnPuzzles` splits puzzles by source:

```
fitness = 0.6 × mean(curated puzzles) + 0.4 × mean(seeded puzzles)
```

If only one category is present, falls back to an unweighted mean (safe for tests and local use). Curated puzzles now carry 60% of the fitness signal regardless of how many seeded puzzles exist.

### Cron config adjustment

To keep Convex action time within budget given ~3× more compute per puzzle:

| Parameter | Old | New |
|---|---|---|
| `generationsPerBatch` | 5 | 3 |
| `batchTimeLimitMs` | 50,000 ms | 90,000 ms |

---

## Benchmark System

### New Convex table: `endgameBenchmark`

Schema: `{ genome: any, fitness: number, generation: number, scoredAt: number }`

This table is written once and never overwritten — it is a permanent snapshot of the pre-V2 best genome, scored using the **new** weighted scoring system so the comparison is apples-to-apples.

### Transition logic (first cron run after deploy)

In `runEndgameTrainingStep`, before any training work:

1. Check if `endgameBenchmark` is empty.
2. If empty:
   a. Load current `endgameEvolvedGenome` (the V1 best).
   b. Apply backfill: `{ ...DEFAULT_GENOME, ...v1Genome }`.
   c. Score it on all current puzzles using the new weighted scoring.
   d. Save to `endgameBenchmark`.
   e. Delete the `endgameTrainingState` and `endgameEvolvedGenome` rows so the next invocation initializes from scratch.
   f. Return early — training begins next invocation with a clean slate.
3. If not empty: proceed with normal training.

This transition is automatic, requires no manual step, and runs exactly once.

### New public query: `getActiveEndgameGenome`

Returns whichever genome is currently best for in-game use:

```
if no current best exists → return benchmark genome
if current best fitness >= benchmark fitness → return current best
else → return benchmark genome
```

Both fitness values are scored on the same puzzle set with the same weighted formula, so the comparison is valid.

### Client update (`useEvolvedGenome.ts`)

`fetchEndgameGenome` switches from `api.endgameTraining.getEndgameEvolvedGenome` to `api.endgameTraining.getActiveEndgameGenome`. No other client changes required — the genome format is identical.

---

## Files Touched

| File | Change |
|---|---|
| `src/types/training.ts` | Add 3 new genome fields |
| `src/game/training/evaluate.ts` | Add `computeStragglersChainDepth`, `computeGoalEntryBonus`; update `evaluateWithGenome` endgame block; update `DEFAULT_GENOME` |
| `src/game/training/evolution.ts` | Add 3 new entries to `GENE_RANGES` |
| `src/game/training/endgameRunner.ts` | Increase beam constants; weighted `scoreGenomeOnPuzzles`; add `source` to `StoredPuzzle` |
| `convex/schema.ts` | Add `endgameBenchmark` table |
| `convex/endgameTraining.ts` | Add `setEndgameBenchmark`, `getEndgameBenchmark`, `getActiveEndgameGenome` |
| `convex/endgameTrainingActions.ts` | Genome backfill; transition logic; updated cron config |
| `src/hooks/useEvolvedGenome.ts` | Switch to `getActiveEndgameGenome` |

---

## Success Criteria

- All 5 curated 3-move puzzles solved at par (score ≥ 100 each) by the best genome within a reasonable number of generations.
- Population average fitness on curated puzzles consistently > 90.
- Benchmark genome remains active in-game until the above is achieved.
- Seeded puzzle performance does not regress significantly (mean seeded score stays ≥ 80).
