# Training V2 — Cross-Engine Tournament — Design

## Goal

Redo the Convex-hosted AI training so it directly refines the tunable values
of every runtime engine (Default AI, Ricefish, Ricefish+). Fitness is
measured by round-robin play against a rotating benchmark of the current
champions across all engine × personality combos. Runtime engines load the
champions once per session with a hard-coded fallback.

Must fit inside Convex free-tier limits.

## Non-goals

- Not tuning every internal magic number in the Default AI — only the top-
  level weight profiles plus a hand-picked shortlist of major constants.
- No multi-player training (2-player only). Max^n tuning stays out of scope.
- No live/online training against human players. Self-play only.

## Answered questions (from brainstorming)

| Question | Decision |
|---|---|
| Training scope | Cross-engine tournament (fitness from cross-engine matchups) |
| Structure | Round-robin across engine × personality benchmark set |
| Benchmark refresh | Only on promotion (candidate must beat champion ≥55% over 20 games) |
| Player counts | 2-player only |
| Tunable knobs | Full per-personality weight profiles + eval constants shortlist |
| Runtime loading | Client fetch once per session with localStorage fallback |
| Existing infra | Start clean in a new module (`src/game/training-v2/`) |
| Scale strategy | 3 subpopulations (one per engine); personality baked into each genome |

## Architecture

New module `src/game/training-v2/`:

- `genomes.ts` — per-engine genome types, `DEFAULT_*_GENOME` defaults, gene
  ranges, `createRandomGenome`, `mutate`, `crossover` per engine.
- `engineApply.ts` — thin adapters that take an optional genome and return
  the engine's tunable config, falling back to hard-coded defaults if the
  genome is undefined.
- `tournament.ts` — headless 2-player runner. Given a candidate genome and
  an opponent genome (and their engine types), runs one game and returns
  the winner. Batched by the Convex action.
- `evolve.ts` — GA operators (elite carry-forward, tournament selection,
  crossover, mutation) parameterised over any genome type.
- `promote.ts` — challenge match runner and promote/reject decision.

Convex additions:

- `convex/trainingV2.ts` — queries/mutations for `trainingStateV2`,
  `championsV2`, `cronCursorV2`, plus a public `getAllChampions` query.
- `convex/trainingV2Actions.ts` — the `runTrainingV2Step` internal action.
- `convex/crons.ts` — new cron entry, same 30-min cadence.
- `convex/schema.ts` — three new tables (see Schema section).

Runtime hook: `src/hooks/useChampionGenomes.ts`. Worker request extended
with an optional `championGenomes` field.

## Genome shapes

Personality is baked into each genome so a single individual represents all
three personality flavors for its engine.

```ts
// src/game/training-v2/genomes.ts

interface DefaultGenome {
  personalityWeights: Record<AIPersonality, {
    progress: number;
    distanceProgress: number;
    alignment: number;
    chainReach: number;
    cohesion: number;
  }>;
  evalConstants: {
    stragglerThreshold: number;
    emptyGoalTargetWeight: number;
    backConvoyWeight: number;
    extremeStragglerMultiplier: number;
    blockadeWeight: number;
  };
}

interface RicefishGenome {
  obstructionPenalty: number;
  stragglerWeight: number;
  defenseWeightByPersonality: Record<AIPersonality, number>;
}

interface RicefishPlusGenome {
  defaultNorm: number;
  ricefishNorm: number;
  alphaEndgameThreshold: number;
}
```

Parameter counts: Default 20, Ricefish 5, Ricefish+ 3.

Gene ranges are declared per-genome in a `GENE_RANGES` const per file.
Mutation and clamp use these bounds. The default AI's per-piece straggler
formulas, cohesion sub-terms, and other internal constants stay hard-coded
— YAGNI on tuning those until the top-level profile converges.

## Tournament runner + scheduling

Each generation has a `matchupSchedule` built once at initialisation:

```
for individual in 0..populationSize:
  for opponentEngine in [default, ricefish, ricefish-plus]:
    for opponentPersonality in [generalist, defensive, aggressive]:
      for g in 0..gamesPerMatchup:
        push({individualIdx, opponentEngine, opponentPersonality, gameIdx: g})
```

Population size = 12, games per matchup = 3 → **12 × 3 × 3 × 3 = 324 games
per generation per subpop**.

Per cron tick, the action:

1. Reads `cronCursorV2` to determine which engine gets this tick's work
   (round-robin: default → ricefish → ricefish-plus → default …).
2. Loads that subpop's `trainingStateV2` row and the 9 `championsV2` rows.
3. Runs up to `GAMES_PER_BATCH = 20` games from the current cursor, obeying
   `BATCH_TIME_LIMIT_MS = 90_000`.
4. Persists updated state; advances the cron cursor.
5. If the subpop's schedule is exhausted → evolve + attempt promotion (see
   below) in the same action.

The cross-engine benchmark for a game is: candidate uses its own engine and
one personality (drawn from its genome); opponent uses whichever
`{engine, personality}` slot the schedule pointed at, loaded from
`championsV2`. First-player alternates by `gameIdx % 2`. Fitness: win = 3,
draw = 1, loss = 0 (same as V1).

Because candidate genomes carry all three personality profiles, the runner
picks the personality from the schedule slot — a Default candidate playing
the `{ricefish, defensive}` opponent is evaluated as, say, its
`generalist` config against Ricefish's defensive champion. To exercise all
three personalities of the candidate, the schedule cycles the candidate's
personality across the `gameIdx` (`gameIdx % 3`).

## Champion promotion

After a subpop's generation completes:

1. Sort population by fitness. Fittest is the challenger.
2. For each personality `p ∈ {generalist, defensive, aggressive}`, play a
   **20-game challenge match** between:
   - Challenger's engine × `p` (using challenger's genome), and
   - Current `championsV2[{challenger.engine, p}]`.
   Alternate first player every game.
3. If challenger wins ≥ 11 / 20, replace the champion row for
   `{challenger.engine, p}`. Record `promotedAt` and append to
   `challengeHistory`. Else keep the current champion; append a losing
   record to `challengeHistory`.
4. Evolve the next generation (elite + tournament crossover + mutation) and
   reset the schedule.

**Bootstrap:** first cron tick sees `championsV2` empty. It seeds all 9
rows from each engine's hard-coded defaults. From that point on,
promotions are apples-to-apples.

## Runtime loading

**Hook** `src/hooks/useChampionGenomes.ts`:

```ts
export function useChampionGenomes(): ChampionGenomeSet | undefined {
  // 1. Read localStorage cache (may be undefined).
  // 2. useQuery(api.trainingV2.getAllChampions).
  // 3. On query completion, write to localStorage; return the fresh value.
  // 4. During load, return the cached value.
}
```

**Worker request**: `WorkerRequest.championGenomes?: ChampionGenomeSet`.
The AI worker starter (`useAITurn` hook) reads `useChampionGenomes()` and
puts it on every worker request. The worker deserialises and passes the
relevant `{engine, personality}` slot into the engine call.

**Engine wiring** (thin refactor):

- Default AI `evaluatePosition(state, player, personality, difficulty?,
  genome?)`
- Ricefish `ricefishScore(state, player, personality, cache?, genome?)`;
  the `defenseWeight(personality)` helper takes `genome?` too.
- Ricefish+ `createHybridScore(difficulty, genomes?)` where `genomes?` is
  the pair `{default: DefaultGenome, ricefish: RicefishGenome,
  ricefishPlus: RicefishPlusGenome}` because the hybrid calls into both
  underlying evaluators.

Fallback: any missing genome → hard-coded module-level defaults. Silent, no
throw.

Feature flag: `USE_TRAINED_GENOMES: boolean = true` in `src/types/ai.ts`.
Set `false` to short-circuit the hook (always return `undefined`) and force
defaults everywhere.

## Convex schema

```ts
// convex/schema.ts additions
defineTable({
  engine: v.union(v.literal('default'), v.literal('ricefish'), v.literal('ricefish-plus')),
  currentGeneration: v.number(),
  population: v.array(v.any()),                    // Individual<Genome>[]
  matchupSchedule: v.array(v.any()),               // schedule slots
  matchupIndex: v.number(),
  gamesCompletedInGeneration: v.number(),
  lastUpdated: v.number(),
}).index('by_engine', ['engine']),   // trainingStateV2

defineTable({
  engine: v.union(...),
  personality: v.union(v.literal('generalist'), v.literal('defensive'), v.literal('aggressive')),
  genome: v.any(),
  fitness: v.number(),
  promotedAt: v.number(),
  challengeHistory: v.array(v.object({
    candidateGenome: v.any(),
    wins: v.number(),
    played: v.number(),
    date: v.number(),
    promoted: v.boolean(),
  })),
}).index('by_engine_personality', ['engine', 'personality']),   // championsV2

defineTable({
  nextEngine: v.union(...),
  lastTick: v.number(),
}),                                                              // cronCursorV2
```

Cron: `convex/crons.ts` gains a new entry running
`internal.trainingV2Actions.runTrainingV2Step` every 30 minutes. The old V1
cron continues running unchanged during cutover.

## Budget guardrails

Convex free-tier estimates (see brainstorming for math):

- **Games per full generation cycle** (3 subpops × 12 individuals × 9
  opponents × 3 games ÷ 3 tick rotation): ~324 games per subpop, ~972 across
  a full 3-subpop rotation.
- **Cron rate:** 48 ticks/day, 20 games/tick, 300 ms/game →
  ~4.8 min/day action time ≈ **~2.5 hours action time/month**. Free-tier
  cap: ~20 GB-hours (~24 hours at 1 GB); we sit at ~10% of budget.
- **Function calls:** ≤ 5 per cron tick × 48/day × 30 = **~7,200/month**.
  Cap: 1,000,000.
- **Bandwidth:** each cron writes maybe 100 KB of state and champion rows.
  48/day × 100 KB × 30 = ~144 MB/month. Cap: generous.

Guardrails in code:

- `GAMES_PER_BATCH` starts at 20. If any tick logs over 60 s of run time,
  bump it down.
- `BATCH_TIME_LIMIT_MS = 90_000` — same 90 s hard cap as V1, prevents
  runaway actions.
- `runTrainingV2Step` wraps its body in try/catch; on error, logs and
  returns cleanly (never throws — an unhandled throw retries the action and
  doubles cost).
- Convex dashboard usage alert at 70% of any metric (set manually by user).

## Testing plan

**Unit** (`tests/game/training-v2/`):

- `genomes.test.ts` — random genomes fall inside declared ranges; mutation
  respects clamps; crossover preserves valid ranges per gene.
- `engineApply.test.ts` — with `genome = undefined`, the produced config
  equals the hard-coded module constants byte-for-byte. Same for a
  hand-crafted "default-equivalent" genome.
- `promote.test.ts` — rigged 12/20 challenger promotes; rigged 10/20 does
  not; ties (10/10 impossible at 20 games; check 9-11 boundary).
- `tournament.test.ts` — 4-individual population × 2 benchmark opponents,
  run one batch, fitness accumulates correctly and matchup index advances.

**Integration:**

- Empty `championsV2` → first cron tick seeds all 9 rows from defaults.
- Serialisation round-trip: genome → Convex `v.any()` → deserialise → engine
  produces same move on a fixed position.

**Manual smoke:**

- Deploy to Convex dev, watch three ticks (one per engine) — verify no
  errors, action time under 90 s, generation state advances.
- Open `/play`, add a Default AI player. In dev tools:
  - Confirm `useChampionGenomes()` fires a query and populates
    localStorage.
  - Confirm the worker POST includes a `championGenomes` field.
  - Confirm the Default AI still moves normally.

## Cutover + rollback

- **Cutover:** V1 and V2 crons run in parallel for at least 2 weeks. Runtime
  engines read V2 champions only. V1 is dead weight but harmless — its
  `evolvedGenome` still updates but no one reads it.
- **Rollback:** flip `USE_TRAINED_GENOMES = false` in `src/types/ai.ts`.
  Engines revert to hard-coded defaults without touching Convex.
- **Retirement:** after 2 clean weeks of V2 operation, delete:
  - `src/game/training/*` (V1 module),
  - `convex/training.ts`, `convex/trainingActions.ts`,
  - the V1 cron entry,
  - and via one-shot migration script, the `trainingState`,
    `evolvedGenome`, and `learning` tables.
  - Also delete the `getCachedLearnedWeights()` blending code in the
    default AI's `evaluatePosition` — it becomes dead code once V2 is
    authoritative.

## Files touched

**New:**

- `src/game/training-v2/genomes.ts`
- `src/game/training-v2/engineApply.ts`
- `src/game/training-v2/tournament.ts`
- `src/game/training-v2/evolve.ts`
- `src/game/training-v2/promote.ts`
- `src/game/training-v2/index.ts`
- `src/hooks/useChampionGenomes.ts`
- `convex/trainingV2.ts`
- `convex/trainingV2Actions.ts`
- `tests/game/training-v2/genomes.test.ts`
- `tests/game/training-v2/engineApply.test.ts`
- `tests/game/training-v2/promote.test.ts`
- `tests/game/training-v2/tournament.test.ts`

**Modified:**

- `src/types/ai.ts` — add `USE_TRAINED_GENOMES` flag, genome-set type
  aliases.
- `src/game/ai/evaluate.ts` — accept optional `genome` param, use
  `applyDefaultGenome` for weights.
- `src/game/ai/ricefish/evaluate.ts` — accept optional `genome` param.
- `src/game/ai/ricefish-plus/evaluate.ts` — accept optional genome set.
- `src/game/ai/worker.ts`, `src/game/ai/workerClient.ts` — pass genomes
  through the request.
- `src/hooks/useAITurn.ts` — read `useChampionGenomes()`, put it on the
  worker request.
- `convex/schema.ts` — add three tables.
- `convex/crons.ts` — add V2 cron entry.
