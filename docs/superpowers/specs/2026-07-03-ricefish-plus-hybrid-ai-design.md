# Ricefish+ Hybrid AI — Design

## Goal

Add a third AI engine, **Ricefish+**, that combines the default AI's rich multi-term
evaluation with Ricefish's fast search shell (alpha-beta + TT + quiescence).
The hybrid uses default-AI-style evaluation in the opening and midgame, then
smoothly transitions to Ricefish-style distance matching as the endgame
approaches. Per-turn latency must stay in the same order of magnitude as
Ricefish.

## Non-goals

- No new personality, difficulty, or player-count controls.
- No opening book (skipped explicitly to reduce coupling with default AI).
- No changes to Ricefish or default AI behavior — both continue to work as
  today.

## Architecture

New directory `src/game/ai/ricefish-plus/`:

- `evaluate.ts` — the hybrid score function.
- `search.ts` — thin entry point that calls Ricefish's search with the hybrid
  score function.
- `index.ts` — exports `pickRicefishPlusMove`.

Ricefish's `src/game/ai/ricefish/search.ts` is refactored so that the score
function is injectable:

- `pickRicefishMove(state, cfg, scoreFn?)` — `scoreFn` defaults to
  `ricefishScore`.
- Internal `search()` and `quiesce()` helpers receive `scoreFn` via closure
  or argument.
- If `orderMoves` in `ordering.ts` calls the score function for shallow
  ordering, the same threading applies. Verified during implementation.

All other Ricefish machinery — TT, iterative deepening, quiescence extension
(`RICEFISH_Q_DEPTH = 3`), move ordering heuristics, time budget — is untouched.
Ricefish continues to pass its own `ricefishScore`; Ricefish+ passes
`hybridScore`.

## Phase blend factor

Per node evaluation, compute a scalar `α ∈ [0, 1]`:

```
maxFill = max over active players of (pieces_in_own_goal / goal_size)
α       = clamp(maxFill / 0.7, 0, 1)
```

- `α = 0`: nobody is home yet → pure default-AI eval.
- `α = 1`: leader has ≥70% of pieces in goal → pure Ricefish eval.
- Linear ramp between.

The `max` across players (not just the current player) ensures both sides use
the same eval regime when the position is tactically endgame-shaped for
anyone.

Cost: one pass through `activePlayers × pieces` per eval, cached per node via
the same `GoalCellsCache` Ricefish already uses. Effectively free.

The `0.7` boundary is a tunable constant. If empirical play shows Ricefish+
switching to matching-mode too early or too late, adjust this single value.

## Combined score formula

Both evals live on different scales:

- Default AI: hundreds/thousands (weighted personality terms).
- Ricefish: tens (sum of hex distances).

Normalize each to a comparable range before blending, then blend:

```
defaultTerm  = evaluatePosition(state, player, personality, difficulty) / DEFAULT_NORM
ricefishTerm = ricefishScore(state, player, personality)                / RICEFISH_NORM
hybridScore  = (1 - α) * defaultTerm + α * ricefishTerm
```

`evaluatePosition` is the default AI's exported eval from `src/game/ai/evaluate.ts`.

Starting constants (tuned empirically during implementation by dumping eval
on several sample positions):

- `DEFAULT_NORM = 100`
- `RICEFISH_NORM = 30`

Terminal handling: if `hasPlayerWon(state, player)` is true, return `+MATE`
immediately, bypassing normalization. This preserves the clean terminal
score that Ricefish's search shell already relies on.

Personality: automatic. `evaluatePosition` internally uses
`PERSONALITY_WEIGHTS`; `ricefishScore` internally uses `defenseWeight`. The
hybrid inherits both.

Evaluation terms:

- The `evaluatePosition` call brings in the default AI's full term set
  (`progress`, `distanceProgress`, `alignment`, `chainReach`, `cohesion`,
  personality-weighted). Cohesion is inside `evaluatePosition` and would
  require code changes to remove; keeping it in is fine for the opening
  phase where its cost is amortized.
- The `ricefishScore` call brings in Ricefish's greedy piece-to-goal
  matching, obstruction penalty, straggler weight.
- Explicitly skipped by not calling them from the hybrid path: opening
  book (`getOpeningMove`), regression/repetition penalties (they live in
  the default AI's move ordering, not in `evaluatePosition`, so simply
  routing to Ricefish's move ordering excludes them). Threat evaluation
  is only invoked at the top level of the default AI's search
  (`search.ts:791`), not inside `evaluatePosition`, so it is also
  naturally excluded.

## Configuration integration

- `src/types/ai.ts`: extend `engine` union with `'ricefish-plus'`.
- Engine dropdown in AI setup UI: add "Ricefish+" option, same visibility
  rules as Ricefish (all difficulties, all personalities, all player counts).
- `src/game/ai/workerClient.ts` + `worker.ts`: dispatch
  `'ricefish-plus'` → `pickRicefishPlusMove`.
- Difficulty/time budgets: reuse `RICEFISH_DEPTH_2P`, `RICEFISH_DEPTH_MP`,
  `RICEFISH_TIME_BUDGET_MS`. No new tuning surface.

By reusing Ricefish's search shell, Ricefish+ inherits Max^n for 3+ players,
custom-board support, and team mode without extra work.

## Testing

New file `tests/game/ai/ricefish-plus.test.ts`:

- α computes correctly at boundary states (empty board, ~50% goal-filled,
  terminal).
- Hybrid score reduces to normalized default-AI eval when α = 0.
- Hybrid score reduces to normalized Ricefish eval when α = 1.
- Terminal states return `±MATE` cleanly (no NaN from normalization).
- `pickRicefishPlusMove` returns a legal move on standard board.
- Ricefish's existing tests still pass (proves the shell refactor is
  transparent — Ricefish still uses its own scoreFn by default).

Manual verification:

- Run a few games in `/play` at hard difficulty with Ricefish+ enabled.
- Watch AI move latency; confirm it is within ~10–20% of Ricefish's latency
  on the same board.
- Spot-check play: midgame moves should look default-AI-shaped
  (corridor/chain-reach discipline); endgame moves should look
  Ricefish-shaped (matching-driven, resolves stragglers/blockers).

## Files touched

New:

- `src/game/ai/ricefish-plus/evaluate.ts`
- `src/game/ai/ricefish-plus/search.ts`
- `src/game/ai/ricefish-plus/index.ts`
- `tests/game/ai/ricefish-plus.test.ts`

Modified:

- `src/game/ai/ricefish/search.ts` — inject `scoreFn` parameter.
- `src/game/ai/ricefish/ordering.ts` — inject `scoreFn` if used for
  ordering.
- `src/types/ai.ts` — extend `engine` union.
- `src/game/ai/workerClient.ts`, `src/game/ai/worker.ts` — dispatch new
  engine.
- Engine dropdown component in AI setup UI (exact path TBD during
  implementation).

## Open questions for implementation

- Exact numeric values of `DEFAULT_NORM` and `RICEFISH_NORM` — pick after
  dumping eval on sample positions.
- Confirm whether `ordering.ts` uses the score function; if so, thread
  `scoreFn` through it too.
- Exact file path of the Engine dropdown component.
