# Swap-Awareness for Ricefish and Default AI

## Problem

When an opponent leaves pieces in their starting zone (= our goal triangle), those cells can only be claimed via a *swap*. The current evaluation gives swaps a roughly net-zero delta:

- `ourDist`: −1 (our piece is now in a goal cell)
- `oppDist`: −1 (the displaced opponent piece advances one cell toward their own goal)
- For generalist (`w = 1`), the swap's eval delta is `w·(−1) − (−1) = 0`.

So the search treats a necessary swap as equivalent to a sideways shuffle. In endgame positions with deep blockers, this is a horizon effect: the swap is the *only* way to win, but the eval offers no gradient pointing at it.

A previous attempt (commits `5eddf752` → `618ecd43`, reverted in `06deca8f`) added a blanket per-blocker penalty, depth-weighted bonuses, anti-repetition, ordering bonuses, and a depth extension. The combination distorted mid-game evaluation and made Ricefish *weaker* overall. This spec proposes a strictly more surgical fix.

## Design

### Trigger

Penalty applies **only when a blocker actually obstructs an assignment** — i.e., a matched (outside piece → goal cell) pair where the goal cell is currently occupied by an opponent. No fill-ratio gate, no global "blockers anywhere" pass, no depth weight.

This means:

- Mid-game positions where blockers exist but our matching prefers empty goal cells get **zero** penalty.
- Endgame positions where every unfilled cell has a blocker get full penalty per cell.

### Ricefish (`src/game/ai/ricefish/evaluate.ts`)

Modify `greedyAssignmentCost` to also accept the `GameState` and acting `PlayerIndex`, and to count obstructed pairs while it walks the sorted distance list:

```ts
function greedyAssignmentCost(
  state: GameState,
  player: PlayerIndex,
  pieces: CubeCoord[],
  goals: CubeCoord[],
): { cost: number; obstructed: number } {
  // ...existing greedy loop, but each time a (pi, gj) pair is taken:
  //   if state.board.get(coordKey(goals[gj])) is a piece owned by an opponent,
  //   obstructed++.
}
```

`playerDistance` returns `cost + OBSTRUCTION_PENALTY * obstructed`.

Constant:

```ts
const OBSTRUCTION_PENALTY = 1.5;
```

Rationale:

- `1.0` would make swaps eval-neutral (cancels opponent's gain). `1.5` makes them mildly positive.
- `2.0` was tried implicitly in the reverted attempt via `BLOCKER_PENALTY = 3` (applied always); it overshot.
- The value will be tunable via bake-off games.

### Default AI (`src/game/ai/evaluate.ts`)

The late-endgame block at lines 392–416 already filters `emptyGoals` as "empty OR opponent-occupied" and pairs them against `piecesOutside`. Extend it:

```ts
const obstructedCount = emptyGoals.filter((g) => {
  const c = state.board.get(coordKey(g));
  return c?.type === 'piece' && c.player !== player;
}).length;
const obstructedInMatching = Math.min(obstructedCount, piecesOutside.length);
```

Apply as a subtraction from `distanceProgressScore` (units: progress %) or as an extra negative term in `stragglerScore` (units: cube distance squared). The cleaner site is `distanceProgressScore` — multiply by `2.0` (calibrated to 2% per blocker, roughly comparable to one extra distance unit at typical board scale).

The penalty stays gated to `lateEndgame` (`inGoal >= 9`) since that is the only branch where `emptyGoals`/`piecesOutside` is already computed and where stalemate scenarios actually arise for the default AI. This is consistent with the surgical principle: outside that branch the matching is centroid-based and blockers don't cleanly map to "assigned cells."

### What we explicitly do NOT do

- **No ordering bonus for swap moves.** The leaf eval doing the work is sufficient; the previous `+5` ordering bias distorted move order globally.
- **No depth-weighted blocker penalty.** Cube distance already encodes "deeper = farther"; an extra depth term reshaped gradients inside the goal triangle and harmed packing.
- **No anti-repetition penalty.** Repetition is a symptom, not the disease — fixing the eval to bias toward the actual progress move should eliminate the cycles that triggered repetition.
- **No endgame depth extension.** Out of scope; same reasoning as above.

## Tests

### Ricefish

`tests/game/ai/ricefish/evaluate.test.ts`:

- **Obstruction adds penalty:** state with 1 outside piece adjacent to a single opponent-occupied goal cell. `playerDistance` returns `1 + OBSTRUCTION_PENALTY` rather than `1`.
- **Off-matching blocker has no effect:** state with 5 outside pieces, 5 empty unfilled goals close to them, and 1 extra opponent piece sitting on a far goal cell that is *not* in the cardinality-limited matching. `playerDistance` unchanged from the baseline (no penalty).
- **Multiple obstructions stack:** state with 2 outside pieces both matched to blocker-occupied goals. Penalty = `2 * OBSTRUCTION_PENALTY`.

`tests/game/ai/ricefish/search.test.ts`:

- **Endgame swap is chosen:** 2-player state, P0 has 9 in goal and 1 outside adjacent to a single opponent-occupied goal cell. Medium-difficulty search must pick the swap move (`isSwap: true`, `to` ∈ goal cells).

### Default AI

`tests/game/ai/evaluate.test.ts` (or wherever the eval test file lives):

- Late-endgame scenario with `inGoal == 9`, one outside piece, one opponent-occupied unfilled goal → eval is lower than the same scenario with the opponent piece replaced by an empty cell.

## Calibration & validation

Ship with `OBSTRUCTION_PENALTY = 1.5` (Ricefish) and `2.0` progress points (default AI). Validate by:

1. Run the existing test suite — no regressions in non-blocker positions.
2. Run `tools/ricefish-match/run.ts` for 4–6 games against the external Ricefish C++ engine, generalist hard. Compare against the pre-fix branch.
3. If Ricefish over- or under-prioritizes swaps in mid-game (visible in replays), tune the constant in 0.5 steps.

## Risks

- **Penalty too low** → fix doesn't trigger; swaps remain net-zero and the AI still stalls.
- **Penalty too high** → AI over-prioritizes setup moves that approach blockers even when mid-game progress is available elsewhere. Mitigation: surgical trigger limits exposure to positions where blockers are already in the matching.
- **Multi-player Max^n** asymmetry: in 3+ player games, the displaced opponent advances toward *their* own goal which may or may not be antipodal to ours. Calibration assumed 2-player geometry. Acceptable risk for round one — multi-player effect should be in the same sign, just possibly weaker.

## Out of scope

- Anti-repetition.
- Depth extensions for endgame.
- Changes to move ordering.
- Big-piece/blocker piece special rules from `getSwapMoves` (the blocker swap rule is already a legal move; this spec only changes evaluation, not move generation).
