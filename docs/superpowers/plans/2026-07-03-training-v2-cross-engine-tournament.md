# Training V2 — Cross-Engine Tournament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Convex-hosted GA training system that evolves the tunable knobs of every runtime AI engine (Default AI, Ricefish, Ricefish+) via cross-engine round-robin tournament, with promotion-based champion updates and client-side fetch + localStorage fallback.

**Architecture:** New `src/game/training-v2/` module houses per-engine genome types, GA operators, tournament runner, and promotion logic. Engines gain an optional `genome` parameter that overrides hard-coded eval constants when supplied; missing genome → hard-coded defaults. New Convex tables (`trainingStateV2`, `championsV2`, `cronCursorV2`) and a new 30-min cron action rotate through the three subpopulations one engine per tick. Client reads champions once via a module-level TTL cache (same pattern as existing `useEvolvedGenome`) and includes them on every worker request.

**Tech Stack:** TypeScript (strict), Convex (schema + queries + mutations + actions + crons), Vitest, React 19.

## Global Constraints

- Must fit Convex free-tier limits: budget for ~10% of the 20 GB-hours/month action-compute cap. `BATCH_TIME_LIMIT_MS = 90_000`, `GAMES_PER_BATCH = 20`, one subpop per cron tick.
- 2-player games only. No Max^n training.
- Runtime engines' behavior with `genome = undefined` must be byte-for-byte identical to today's hard-coded behavior. All existing AI tests must still pass.
- V1 training cron is already paused (`convex/crons.ts` shows it commented out) — no cutover-cron work needed.
- Feature flag `USE_TRAINED_GENOMES: boolean = true` in `src/types/ai.ts` controls whether the client attempts to fetch champions. Flip to `false` = force defaults everywhere.
- Fallback everywhere: any missing genome silently uses hard-coded defaults. No throw, no error UI.

## Known scope trim (visible before implementation)

Not every genome field gets wired into the eval this pass. What ships end-to-end vs deferred:

**Wired end-to-end (training actually strengthens these):**
- Default AI `PERSONALITY_WEIGHTS` per personality (via module-scope genome injection set by `findBestMove`).
- Ricefish `defenseWeightByPersonality` (via `scoreFn` closure passed to `findRicefishMove`).

**Carried in genome, NOT consumed at runtime this pass (follow-up plan wires them in):**
- Default AI `evalConstants` (stragglerThreshold, emptyGoalTargetWeight, etc.).
- Ricefish `obstructionPenalty`, `stragglerWeight`.
- All of Ricefish+ (`defaultNorm`, `ricefishNorm`, `alphaEndgameThreshold`) — Ricefish+ is hidden from the UI today, so its champions are pure infra until it comes back.

That gives Default AI and Ricefish real training strength this pass; Ricefish+ champions get promoted based on the noise of hard-coded self-play but nothing goes wrong.

---

## File Structure

**New:**

- `src/game/training-v2/genomes.ts` — per-engine `Genome` types, `DEFAULT_*_GENOME` constants, `GENE_RANGES`, `createRandomGenome`, `mutate`, `crossover` per engine.
- `src/game/training-v2/engineApply.ts` — `applyDefaultGenome`, `applyRicefishGenome`, `applyRicefishPlusGenome`. Each takes `genome?` and returns the engine's config, falling back to module defaults.
- `src/game/training-v2/tournament.ts` — headless 2-player runner (`runTournamentGame`).
- `src/game/training-v2/evolve.ts` — GA operators (`tournamentSelect`, `evolveGeneration`) parameterized over any genome type.
- `src/game/training-v2/promote.ts` — challenge match runner (`runChallengeMatch`) + promote/reject decision.
- `src/game/training-v2/index.ts` — barrel exports.
- `src/hooks/useChampionGenomes.ts` — module-level TTL cache (`getServerChampionGenomes()`), pattern from `useEvolvedGenome.ts`.
- `convex/trainingV2.ts` — queries + mutations for `trainingStateV2`, `championsV2`, `cronCursorV2`. Public query `getAllChampions`.
- `convex/trainingV2Actions.ts` — `runTrainingV2Step` internal action.
- `tests/game/training-v2/genomes.test.ts`
- `tests/game/training-v2/engineApply.test.ts`
- `tests/game/training-v2/promote.test.ts`
- `tests/game/training-v2/tournament.test.ts`

**Modified:**

- `src/types/ai.ts` — add `USE_TRAINED_GENOMES` flag and `ChampionGenomeSet` type.
- `src/game/ai/evaluate.ts` — export `PERSONALITY_WEIGHTS`; add optional `genome?: DefaultGenome` parameter to `evaluatePosition`.
- `src/game/ai/ricefish/evaluate.ts` — add optional `genome?: RicefishGenome` parameter to `ricefishScore` and internal `defenseWeight`.
- `src/game/ai/ricefish-plus/evaluate.ts` — accept optional genome set inside `createHybridScore`.
- `src/game/ai/workerClient.ts` — add `championGenomes?: ChampionGenomeSet` to `WorkerRequest`.
- `src/game/ai/worker.ts` — deserialize and thread genomes into engine calls.
- `src/hooks/useAITurn.ts` — read `getServerChampionGenomes()` and put it on the worker request.
- `convex/schema.ts` — add three new tables.
- `convex/crons.ts` — add V2 cron entry.

---

## Task 1: Genome types, defaults, GA operators

**Files:**
- Create: `src/game/training-v2/genomes.ts`
- Create: `src/game/training-v2/evolve.ts`
- Create: `tests/game/training-v2/genomes.test.ts`

**Interfaces:**
- Consumes: `AIPersonality` from `@/types/ai`.
- Produces:
  - `DefaultGenome`, `RicefishGenome`, `RicefishPlusGenome` interfaces.
  - `DEFAULT_DEFAULT_GENOME`, `DEFAULT_RICEFISH_GENOME`, `DEFAULT_RICEFISH_PLUS_GENOME` constants matching the current hard-coded values.
  - `createRandomDefaultGenome()`, `createRandomRicefishGenome()`, `createRandomRicefishPlusGenome()`.
  - `mutateDefaultGenome(g, rate, strength)`, `mutateRicefishGenome(...)`, `mutateRicefishPlusGenome(...)`.
  - `crossoverDefaultGenome(a, b)`, `crossoverRicefishGenome(...)`, `crossoverRicefishPlusGenome(...)`.
  - Generic `tournamentSelect<T>(population, size)` and `evolveGeneration<T>(population, config, createRandom, mutate, crossover)` in `evolve.ts`.

- [ ] **Step 1: Write failing tests for genomes.ts**

Create `tests/game/training-v2/genomes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  createRandomDefaultGenome,
  createRandomRicefishGenome,
  createRandomRicefishPlusGenome,
  mutateDefaultGenome,
  mutateRicefishGenome,
  mutateRicefishPlusGenome,
  crossoverDefaultGenome,
  crossoverRicefishGenome,
  crossoverRicefishPlusGenome,
  DEFAULT_GENE_RANGES,
  RICEFISH_GENE_RANGES,
  RICEFISH_PLUS_GENE_RANGES,
} from '@/game/training-v2/genomes';

describe('DEFAULT_DEFAULT_GENOME', () => {
  it('has personality weights for all three personalities', () => {
    for (const p of ['generalist', 'defensive', 'aggressive'] as const) {
      const w = DEFAULT_DEFAULT_GENOME.personalityWeights[p];
      expect(w.progress).toBeGreaterThan(0);
      expect(w.distanceProgress).toBeGreaterThan(0);
      expect(w.alignment).toBeGreaterThan(0);
      expect(w.chainReach).toBeGreaterThan(0);
      expect(w.cohesion).toBeGreaterThan(0);
    }
  });

  it('has all eval constants populated', () => {
    const c = DEFAULT_DEFAULT_GENOME.evalConstants;
    expect(c.stragglerThreshold).toBeGreaterThan(0);
    expect(c.emptyGoalTargetWeight).toBeGreaterThan(0);
    expect(c.backConvoyWeight).toBeGreaterThan(0);
    expect(c.extremeStragglerMultiplier).toBeGreaterThan(0);
    expect(c.blockadeWeight).toBeGreaterThan(0);
  });
});

describe('createRandomDefaultGenome', () => {
  it('produces a genome inside gene ranges', () => {
    for (let i = 0; i < 20; i++) {
      const g = createRandomDefaultGenome();
      for (const p of ['generalist', 'defensive', 'aggressive'] as const) {
        for (const k of Object.keys(g.personalityWeights[p]) as (keyof typeof g.personalityWeights['generalist'])[]) {
          const [min, max] = DEFAULT_GENE_RANGES.personalityWeights[k];
          expect(g.personalityWeights[p][k]).toBeGreaterThanOrEqual(min);
          expect(g.personalityWeights[p][k]).toBeLessThanOrEqual(max);
        }
      }
    }
  });
});

describe('mutateDefaultGenome', () => {
  it('respects clamps', () => {
    const g = DEFAULT_DEFAULT_GENOME;
    for (let i = 0; i < 20; i++) {
      const m = mutateDefaultGenome(g, 1.0, 5.0);
      for (const p of ['generalist', 'defensive', 'aggressive'] as const) {
        for (const k of Object.keys(m.personalityWeights[p]) as (keyof typeof m.personalityWeights['generalist'])[]) {
          const [min, max] = DEFAULT_GENE_RANGES.personalityWeights[k];
          expect(m.personalityWeights[p][k]).toBeGreaterThanOrEqual(min);
          expect(m.personalityWeights[p][k]).toBeLessThanOrEqual(max);
        }
      }
    }
  });
});

describe('crossoverDefaultGenome', () => {
  it('produces a valid genome from two parents', () => {
    const a = createRandomDefaultGenome();
    const b = createRandomDefaultGenome();
    const c = crossoverDefaultGenome(a, b);
    for (const p of ['generalist', 'defensive', 'aggressive'] as const) {
      for (const k of Object.keys(c.personalityWeights[p]) as (keyof typeof c.personalityWeights['generalist'])[]) {
        const v = c.personalityWeights[p][k];
        // Each gene comes from A or B, so it must equal one of them
        expect([a.personalityWeights[p][k], b.personalityWeights[p][k]]).toContain(v);
      }
    }
  });
});

describe('Ricefish genome ops', () => {
  it('random genome is in range', () => {
    for (let i = 0; i < 20; i++) {
      const g = createRandomRicefishGenome();
      const [minObs, maxObs] = RICEFISH_GENE_RANGES.obstructionPenalty;
      expect(g.obstructionPenalty).toBeGreaterThanOrEqual(minObs);
      expect(g.obstructionPenalty).toBeLessThanOrEqual(maxObs);
    }
  });
  it('mutation clamps', () => {
    for (let i = 0; i < 20; i++) {
      const m = mutateRicefishGenome(DEFAULT_RICEFISH_GENOME, 1.0, 10.0);
      const [minObs, maxObs] = RICEFISH_GENE_RANGES.obstructionPenalty;
      expect(m.obstructionPenalty).toBeGreaterThanOrEqual(minObs);
      expect(m.obstructionPenalty).toBeLessThanOrEqual(maxObs);
    }
  });
  it('crossover picks per-gene from parents', () => {
    const a = createRandomRicefishGenome();
    const b = createRandomRicefishGenome();
    const c = crossoverRicefishGenome(a, b);
    expect([a.obstructionPenalty, b.obstructionPenalty]).toContain(c.obstructionPenalty);
    expect([a.stragglerWeight, b.stragglerWeight]).toContain(c.stragglerWeight);
  });
});

describe('Ricefish+ genome ops', () => {
  it('random is in range', () => {
    for (let i = 0; i < 20; i++) {
      const g = createRandomRicefishPlusGenome();
      const [minDN, maxDN] = RICEFISH_PLUS_GENE_RANGES.defaultNorm;
      expect(g.defaultNorm).toBeGreaterThanOrEqual(minDN);
      expect(g.defaultNorm).toBeLessThanOrEqual(maxDN);
    }
  });
  it('mutation clamps', () => {
    const m = mutateRicefishPlusGenome(DEFAULT_RICEFISH_PLUS_GENOME, 1.0, 100.0);
    const [minDN, maxDN] = RICEFISH_PLUS_GENE_RANGES.defaultNorm;
    expect(m.defaultNorm).toBeGreaterThanOrEqual(minDN);
    expect(m.defaultNorm).toBeLessThanOrEqual(maxDN);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest tests/game/training-v2/genomes.test.ts --run`
Expected: FAIL with "Cannot find module '@/game/training-v2/genomes'"

- [ ] **Step 3: Create `src/game/training-v2/genomes.ts`**

Create the file:

```ts
import type { AIPersonality } from '@/types/ai';

export interface DefaultPersonalityWeights {
  progress: number;
  distanceProgress: number;
  alignment: number;
  chainReach: number;
  cohesion: number;
}

export interface DefaultEvalConstants {
  stragglerThreshold: number;
  emptyGoalTargetWeight: number;
  backConvoyWeight: number;
  extremeStragglerMultiplier: number;
  blockadeWeight: number;
}

export interface DefaultGenome {
  personalityWeights: Record<AIPersonality, DefaultPersonalityWeights>;
  evalConstants: DefaultEvalConstants;
}

export interface RicefishGenome {
  obstructionPenalty: number;
  stragglerWeight: number;
  defenseWeightByPersonality: Record<AIPersonality, number>;
}

export interface RicefishPlusGenome {
  defaultNorm: number;
  ricefishNorm: number;
  alphaEndgameThreshold: number;
}

// Defaults match current hard-coded values verbatim so that a "default-equivalent"
// genome produces byte-for-byte identical behavior.
export const DEFAULT_DEFAULT_GENOME: DefaultGenome = {
  personalityWeights: {
    generalist: { progress: 3.0, distanceProgress: 3.5, alignment: 0.4, chainReach: 2.0, cohesion: 1.0 },
    defensive:  { progress: 2.0, distanceProgress: 3.0, alignment: 0.3, chainReach: 1.0, cohesion: 2.5 },
    aggressive: { progress: 2.5, distanceProgress: 4.0, alignment: 0.3, chainReach: 3.5, cohesion: 1.5 },
  },
  evalConstants: {
    stragglerThreshold: 6,
    emptyGoalTargetWeight: 1.0,
    backConvoyWeight: 1.0,
    extremeStragglerMultiplier: 18,
    blockadeWeight: 1.0,
  },
};

export const DEFAULT_RICEFISH_GENOME: RicefishGenome = {
  obstructionPenalty: 1.5,
  stragglerWeight: 0.5,
  defenseWeightByPersonality: {
    generalist: 1.0,
    defensive: 2.0,
    aggressive: 0.75,
  },
};

export const DEFAULT_RICEFISH_PLUS_GENOME: RicefishPlusGenome = {
  defaultNorm: 100,
  ricefishNorm: 30,
  alphaEndgameThreshold: 0.7,
};

// Gene ranges (min, max) — used to clamp mutations and generate random genomes.
export const DEFAULT_GENE_RANGES = {
  personalityWeights: {
    progress:          [0.5, 8] as [number, number],
    distanceProgress:  [0.5, 8] as [number, number],
    alignment:         [0.0, 2] as [number, number],
    chainReach:        [0.0, 8] as [number, number],
    cohesion:          [0.0, 5] as [number, number],
  },
  evalConstants: {
    stragglerThreshold:         [3, 10] as [number, number],
    emptyGoalTargetWeight:      [0.1, 3] as [number, number],
    backConvoyWeight:           [0.1, 3] as [number, number],
    extremeStragglerMultiplier: [5, 40] as [number, number],
    blockadeWeight:             [0.1, 3] as [number, number],
  },
};

export const RICEFISH_GENE_RANGES = {
  obstructionPenalty: [0.5, 5] as [number, number],
  stragglerWeight:    [0.0, 2] as [number, number],
  defenseWeight:      [0.25, 4] as [number, number],
};

export const RICEFISH_PLUS_GENE_RANGES = {
  defaultNorm:           [10, 500] as [number, number],
  ricefishNorm:          [5, 200] as [number, number],
  alphaEndgameThreshold: [0.3, 1.0] as [number, number],
};

// ── RNG helpers ──────────────────────────────────────────────────────────────

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

// ── DefaultGenome ops ────────────────────────────────────────────────────────

const PERSONALITIES: AIPersonality[] = ['generalist', 'defensive', 'aggressive'];
const DEFAULT_WEIGHT_KEYS = ['progress', 'distanceProgress', 'alignment', 'chainReach', 'cohesion'] as const;
const DEFAULT_CONST_KEYS = ['stragglerThreshold', 'emptyGoalTargetWeight', 'backConvoyWeight', 'extremeStragglerMultiplier', 'blockadeWeight'] as const;

export function createRandomDefaultGenome(): DefaultGenome {
  const personalityWeights = {} as Record<AIPersonality, DefaultPersonalityWeights>;
  for (const p of PERSONALITIES) {
    personalityWeights[p] = {
      progress:         randomInRange(DEFAULT_GENE_RANGES.personalityWeights.progress),
      distanceProgress: randomInRange(DEFAULT_GENE_RANGES.personalityWeights.distanceProgress),
      alignment:        randomInRange(DEFAULT_GENE_RANGES.personalityWeights.alignment),
      chainReach:       randomInRange(DEFAULT_GENE_RANGES.personalityWeights.chainReach),
      cohesion:         randomInRange(DEFAULT_GENE_RANGES.personalityWeights.cohesion),
    };
  }
  const evalConstants: DefaultEvalConstants = {
    stragglerThreshold:         randomInRange(DEFAULT_GENE_RANGES.evalConstants.stragglerThreshold),
    emptyGoalTargetWeight:      randomInRange(DEFAULT_GENE_RANGES.evalConstants.emptyGoalTargetWeight),
    backConvoyWeight:           randomInRange(DEFAULT_GENE_RANGES.evalConstants.backConvoyWeight),
    extremeStragglerMultiplier: randomInRange(DEFAULT_GENE_RANGES.evalConstants.extremeStragglerMultiplier),
    blockadeWeight:             randomInRange(DEFAULT_GENE_RANGES.evalConstants.blockadeWeight),
  };
  return { personalityWeights, evalConstants };
}

export function mutateDefaultGenome(g: DefaultGenome, rate: number, strength: number): DefaultGenome {
  const personalityWeights = {} as Record<AIPersonality, DefaultPersonalityWeights>;
  for (const p of PERSONALITIES) {
    personalityWeights[p] = { ...g.personalityWeights[p] };
    for (const k of DEFAULT_WEIGHT_KEYS) {
      if (Math.random() < rate) {
        const [min, max] = DEFAULT_GENE_RANGES.personalityWeights[k];
        const range = max - min;
        personalityWeights[p][k] = clamp(personalityWeights[p][k] + gaussianRandom() * range * strength, min, max);
      }
    }
  }
  const evalConstants: DefaultEvalConstants = { ...g.evalConstants };
  for (const k of DEFAULT_CONST_KEYS) {
    if (Math.random() < rate) {
      const [min, max] = DEFAULT_GENE_RANGES.evalConstants[k];
      const range = max - min;
      evalConstants[k] = clamp(evalConstants[k] + gaussianRandom() * range * strength, min, max);
    }
  }
  return { personalityWeights, evalConstants };
}

export function crossoverDefaultGenome(a: DefaultGenome, b: DefaultGenome): DefaultGenome {
  const personalityWeights = {} as Record<AIPersonality, DefaultPersonalityWeights>;
  for (const p of PERSONALITIES) {
    const pw = {} as DefaultPersonalityWeights;
    for (const k of DEFAULT_WEIGHT_KEYS) {
      pw[k] = Math.random() < 0.5 ? a.personalityWeights[p][k] : b.personalityWeights[p][k];
    }
    personalityWeights[p] = pw;
  }
  const evalConstants = {} as DefaultEvalConstants;
  for (const k of DEFAULT_CONST_KEYS) {
    evalConstants[k] = Math.random() < 0.5 ? a.evalConstants[k] : b.evalConstants[k];
  }
  return { personalityWeights, evalConstants };
}

// ── RicefishGenome ops ───────────────────────────────────────────────────────

export function createRandomRicefishGenome(): RicefishGenome {
  const defenseWeightByPersonality = {} as Record<AIPersonality, number>;
  for (const p of PERSONALITIES) {
    defenseWeightByPersonality[p] = randomInRange(RICEFISH_GENE_RANGES.defenseWeight);
  }
  return {
    obstructionPenalty: randomInRange(RICEFISH_GENE_RANGES.obstructionPenalty),
    stragglerWeight:    randomInRange(RICEFISH_GENE_RANGES.stragglerWeight),
    defenseWeightByPersonality,
  };
}

export function mutateRicefishGenome(g: RicefishGenome, rate: number, strength: number): RicefishGenome {
  let obstructionPenalty = g.obstructionPenalty;
  let stragglerWeight = g.stragglerWeight;
  const defenseWeightByPersonality = { ...g.defenseWeightByPersonality };
  if (Math.random() < rate) {
    const [min, max] = RICEFISH_GENE_RANGES.obstructionPenalty;
    obstructionPenalty = clamp(obstructionPenalty + gaussianRandom() * (max - min) * strength, min, max);
  }
  if (Math.random() < rate) {
    const [min, max] = RICEFISH_GENE_RANGES.stragglerWeight;
    stragglerWeight = clamp(stragglerWeight + gaussianRandom() * (max - min) * strength, min, max);
  }
  for (const p of PERSONALITIES) {
    if (Math.random() < rate) {
      const [min, max] = RICEFISH_GENE_RANGES.defenseWeight;
      defenseWeightByPersonality[p] = clamp(defenseWeightByPersonality[p] + gaussianRandom() * (max - min) * strength, min, max);
    }
  }
  return { obstructionPenalty, stragglerWeight, defenseWeightByPersonality };
}

export function crossoverRicefishGenome(a: RicefishGenome, b: RicefishGenome): RicefishGenome {
  const defenseWeightByPersonality = {} as Record<AIPersonality, number>;
  for (const p of PERSONALITIES) {
    defenseWeightByPersonality[p] = Math.random() < 0.5 ? a.defenseWeightByPersonality[p] : b.defenseWeightByPersonality[p];
  }
  return {
    obstructionPenalty: Math.random() < 0.5 ? a.obstructionPenalty : b.obstructionPenalty,
    stragglerWeight:    Math.random() < 0.5 ? a.stragglerWeight    : b.stragglerWeight,
    defenseWeightByPersonality,
  };
}

// ── RicefishPlusGenome ops ───────────────────────────────────────────────────

export function createRandomRicefishPlusGenome(): RicefishPlusGenome {
  return {
    defaultNorm:           randomInRange(RICEFISH_PLUS_GENE_RANGES.defaultNorm),
    ricefishNorm:          randomInRange(RICEFISH_PLUS_GENE_RANGES.ricefishNorm),
    alphaEndgameThreshold: randomInRange(RICEFISH_PLUS_GENE_RANGES.alphaEndgameThreshold),
  };
}

export function mutateRicefishPlusGenome(g: RicefishPlusGenome, rate: number, strength: number): RicefishPlusGenome {
  let defaultNorm = g.defaultNorm;
  let ricefishNorm = g.ricefishNorm;
  let alphaEndgameThreshold = g.alphaEndgameThreshold;
  if (Math.random() < rate) {
    const [min, max] = RICEFISH_PLUS_GENE_RANGES.defaultNorm;
    defaultNorm = clamp(defaultNorm + gaussianRandom() * (max - min) * strength, min, max);
  }
  if (Math.random() < rate) {
    const [min, max] = RICEFISH_PLUS_GENE_RANGES.ricefishNorm;
    ricefishNorm = clamp(ricefishNorm + gaussianRandom() * (max - min) * strength, min, max);
  }
  if (Math.random() < rate) {
    const [min, max] = RICEFISH_PLUS_GENE_RANGES.alphaEndgameThreshold;
    alphaEndgameThreshold = clamp(alphaEndgameThreshold + gaussianRandom() * (max - min) * strength, min, max);
  }
  return { defaultNorm, ricefishNorm, alphaEndgameThreshold };
}

export function crossoverRicefishPlusGenome(a: RicefishPlusGenome, b: RicefishPlusGenome): RicefishPlusGenome {
  return {
    defaultNorm:           Math.random() < 0.5 ? a.defaultNorm           : b.defaultNorm,
    ricefishNorm:          Math.random() < 0.5 ? a.ricefishNorm          : b.ricefishNorm,
    alphaEndgameThreshold: Math.random() < 0.5 ? a.alphaEndgameThreshold : b.alphaEndgameThreshold,
  };
}
```

- [ ] **Step 4: Create `src/game/training-v2/evolve.ts`**

```ts
export interface Individual<G> {
  genome: G;
  fitness: number;
  wins: number;
  gamesPlayed: number;
}

export interface EvolveConfig {
  populationSize: number;
  eliteCount: number;
  tournamentSize: number;
  mutationRate: number;
  mutationStrength: number;
}

export function tournamentSelect<G>(population: Individual<G>[], size: number): Individual<G> {
  let best: Individual<G> | null = null;
  for (let i = 0; i < size; i++) {
    const idx = Math.floor(Math.random() * population.length);
    const candidate = population[idx];
    if (best === null || candidate.fitness > best.fitness) best = candidate;
  }
  return best!;
}

export function evolveGeneration<G>(
  population: Individual<G>[],
  config: EvolveConfig,
  createRandom: () => G,
  mutate: (g: G, rate: number, strength: number) => G,
  crossover: (a: G, b: G) => G,
): Individual<G>[] {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  const next: Individual<G>[] = [];
  for (let i = 0; i < config.eliteCount && i < sorted.length; i++) {
    next.push({ genome: sorted[i].genome, fitness: 0, wins: 0, gamesPlayed: 0 });
  }
  while (next.length < config.populationSize) {
    const p1 = tournamentSelect(sorted, config.tournamentSize);
    const p2 = tournamentSelect(sorted, config.tournamentSize);
    const child = mutate(crossover(p1.genome, p2.genome), config.mutationRate, config.mutationStrength);
    next.push({ genome: child, fitness: 0, wins: 0, gamesPlayed: 0 });
  }
  // Unused params in evolve path — kept for symmetry with V1 signature usage in Convex action
  void createRandom;
  return next;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest tests/game/training-v2/genomes.test.ts --run`
Expected: all tests pass.

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors in `endgamePatterns.test.ts` and `pathfinding.test.ts` are unrelated).

- [ ] **Step 7: Commit**

```bash
git add src/game/training-v2/genomes.ts src/game/training-v2/evolve.ts tests/game/training-v2/genomes.test.ts
git commit -m "feat(training-v2): per-engine genome types and GA operators

DefaultGenome, RicefishGenome, RicefishPlusGenome with per-genome
create-random / mutate / crossover functions and a generic
evolveGeneration operator. Defaults mirror current hard-coded engine
constants byte-for-byte."
```

---

## Task 2: Engine-apply adapters

**Files:**
- Create: `src/game/training-v2/engineApply.ts`
- Create: `tests/game/training-v2/engineApply.test.ts`

**Interfaces:**
- Consumes: `DefaultGenome`, `RicefishGenome`, `RicefishPlusGenome`, `DEFAULT_*_GENOME` from Task 1.
- Produces:
  - `applyDefaultGenome(genome?: DefaultGenome): DefaultGenome` — returns the passed genome or `DEFAULT_DEFAULT_GENOME`.
  - `applyRicefishGenome(genome?: RicefishGenome): RicefishGenome` — same pattern.
  - `applyRicefishPlusGenome(genome?: RicefishPlusGenome): RicefishPlusGenome` — same pattern.

- [ ] **Step 1: Write failing tests**

Create `tests/game/training-v2/engineApply.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  applyDefaultGenome,
  applyRicefishGenome,
  applyRicefishPlusGenome,
} from '@/game/training-v2/engineApply';
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  createRandomDefaultGenome,
  createRandomRicefishGenome,
  createRandomRicefishPlusGenome,
} from '@/game/training-v2/genomes';

describe('applyDefaultGenome', () => {
  it('returns default when genome undefined', () => {
    expect(applyDefaultGenome(undefined)).toEqual(DEFAULT_DEFAULT_GENOME);
  });
  it('returns provided genome when passed', () => {
    const custom = createRandomDefaultGenome();
    expect(applyDefaultGenome(custom)).toBe(custom);
  });
});

describe('applyRicefishGenome', () => {
  it('returns default when undefined', () => {
    expect(applyRicefishGenome(undefined)).toEqual(DEFAULT_RICEFISH_GENOME);
  });
  it('returns provided when passed', () => {
    const custom = createRandomRicefishGenome();
    expect(applyRicefishGenome(custom)).toBe(custom);
  });
});

describe('applyRicefishPlusGenome', () => {
  it('returns default when undefined', () => {
    expect(applyRicefishPlusGenome(undefined)).toEqual(DEFAULT_RICEFISH_PLUS_GENOME);
  });
  it('returns provided when passed', () => {
    const custom = createRandomRicefishPlusGenome();
    expect(applyRicefishPlusGenome(custom)).toBe(custom);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest tests/game/training-v2/engineApply.test.ts --run`
Expected: FAIL with "Cannot find module '@/game/training-v2/engineApply'"

- [ ] **Step 3: Create `src/game/training-v2/engineApply.ts`**

```ts
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  type DefaultGenome,
  type RicefishGenome,
  type RicefishPlusGenome,
} from './genomes';

export function applyDefaultGenome(genome?: DefaultGenome): DefaultGenome {
  return genome ?? DEFAULT_DEFAULT_GENOME;
}

export function applyRicefishGenome(genome?: RicefishGenome): RicefishGenome {
  return genome ?? DEFAULT_RICEFISH_GENOME;
}

export function applyRicefishPlusGenome(genome?: RicefishPlusGenome): RicefishPlusGenome {
  return genome ?? DEFAULT_RICEFISH_PLUS_GENOME;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest tests/game/training-v2/engineApply.test.ts --run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/training-v2/engineApply.ts tests/game/training-v2/engineApply.test.ts
git commit -m "feat(training-v2): engine-apply adapters with default fallback"
```

---

## Task 3: Wire genomes into runtime engines

**Files:**
- Modify: `src/game/ai/evaluate.ts` — export `PERSONALITY_WEIGHTS`; add optional `genome?: DefaultGenome` param.
- Modify: `src/game/ai/ricefish/evaluate.ts` — add optional `genome?: RicefishGenome` param to `ricefishScore`.
- Modify: `src/game/ai/ricefish-plus/evaluate.ts` — add optional genome set param to `createHybridScore`.
- Modify: `src/types/ai.ts` — add `ChampionGenomeSet` type + `USE_TRAINED_GENOMES` flag.

**Interfaces:**
- Consumes: `DefaultGenome`, `RicefishGenome`, `RicefishPlusGenome` from Task 1. `applyDefaultGenome`, `applyRicefishGenome`, `applyRicefishPlusGenome` from Task 2.
- Produces:
  - `evaluatePosition(state, player, personality, difficulty?, genome?: DefaultGenome): number` — new optional 5th param.
  - `ricefishScore(state, player, personality, cache?, genome?: RicefishGenome): number` — new optional 5th param.
  - `createHybridScore(difficulty: AIDifficulty, genomes?: { default?: DefaultGenome; ricefish?: RicefishGenome; ricefishPlus?: RicefishPlusGenome }): RicefishScoreFn` — new optional 2nd param.
  - `ChampionGenomeSet` type: `{ default: Record<AIPersonality, DefaultGenome>; ricefish: Record<AIPersonality, RicefishGenome>; 'ricefish-plus': Record<AIPersonality, RicefishPlusGenome> }`.
  - `USE_TRAINED_GENOMES: boolean = true`.

- [ ] **Step 1: Extend `src/types/ai.ts`**

Add at the top of the file, after the existing imports:

```ts
import type { DefaultGenome, RicefishGenome, RicefishPlusGenome } from '@/game/training-v2/genomes';
```

Then, at the end of the file:

```ts
export type ChampionGenomeSet = {
  default:         Record<AIPersonality, DefaultGenome>;
  ricefish:        Record<AIPersonality, RicefishGenome>;
  'ricefish-plus': Record<AIPersonality, RicefishPlusGenome>;
};

/**
 * Master switch: when true, the client attempts to fetch trained champion
 * genomes from Convex and passes them to the worker. When false, engines
 * always use their hard-coded defaults.
 */
export const USE_TRAINED_GENOMES = true;
```

- [ ] **Step 2: Export `PERSONALITY_WEIGHTS` from `src/game/ai/evaluate.ts`**

Find (near top of file):

```ts
const PERSONALITY_WEIGHTS: Record<AIPersonality, {
```

Change to:

```ts
export const PERSONALITY_WEIGHTS: Record<AIPersonality, {
```

- [ ] **Step 3: Add optional `genome` param + module-scope injection to `evaluatePosition`**

In `src/game/ai/evaluate.ts`, at the top of the file (below existing imports), add a module-scope injection setter and reader. This is how the Default AI's search entry point will thread a genome down to every internal eval call without a broad refactor of `search.ts`.

Add:

```ts
// Genome injection: findBestMove (in search.ts) sets this at entry so that
// every evaluatePosition call inside the search sees the genome without a
// signature refactor. Reset to undefined in a finally block after the search
// returns. Safe under single-threaded JS (one Web Worker per AI session).
let injectedDefaultGenome: import('@/game/training-v2/genomes').DefaultGenome | undefined = undefined;

export function setInjectedDefaultGenome(g?: import('@/game/training-v2/genomes').DefaultGenome): void {
  injectedDefaultGenome = g;
}

export function getInjectedDefaultGenome():
  | import('@/game/training-v2/genomes').DefaultGenome | undefined {
  return injectedDefaultGenome;
}
```

Then, find the export:

```ts
export function evaluatePosition(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty = 'hard'
): number {
```

Change to:

```ts
export function evaluatePosition(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  difficulty: AIDifficulty = 'hard',
  genome?: import('@/game/training-v2/genomes').DefaultGenome,
): number {
```

Immediately after the existing `const weights = PERSONALITY_WEIGHTS[personality];` line, apply the genome (explicit param wins, then injected, then defaults):

Find:

```ts
  const weights = PERSONALITY_WEIGHTS[personality];
```

Change to:

```ts
  const activeGenome = genome ?? injectedDefaultGenome;
  const weights = activeGenome?.personalityWeights[personality] ?? PERSONALITY_WEIGHTS[personality];
```

Only `PERSONALITY_WEIGHTS` (per personality) is genome-driven in this pass. The `evalConstants` fields (stragglerThreshold, etc.) are carried on the genome but stay hard-coded at runtime — the follow-up plan wires them in.

- [ ] **Step 3b: Add optional `genome` param to `findBestMove`**

In `src/game/ai/search.ts`, find the exported entry point:

```ts
export function findBestMove(
```

The current signature ends with `openingMoves?: ... | null): Move | null`. Extend it to accept an optional genome and set the module-scope injection before delegating to the existing search body. Use try/finally so an exception cannot leave the injection stuck for the next call.

Find the `export function findBestMove(` declaration and modify:

1. Add `genome?: import('@/game/training-v2/genomes').DefaultGenome` as the last parameter.
2. Wrap the existing function body in `setInjectedDefaultGenome(genome); try { … } finally { setInjectedDefaultGenome(undefined); }`.

Concretely, if the file today reads (roughly):

```ts
export function findBestMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  openingMoves?: OpeningMove[] | null,
): Move | null {
  // …existing body…
  return best;
}
```

change it to:

```ts
import { setInjectedDefaultGenome } from './evaluate';

export function findBestMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  openingMoves?: OpeningMove[] | null,
  genome?: import('@/game/training-v2/genomes').DefaultGenome,
): Move | null {
  setInjectedDefaultGenome(genome);
  try {
    // …existing body unchanged…
    return best;
  } finally {
    setInjectedDefaultGenome(undefined);
  }
}
```

Do not otherwise change the body — every internal `evaluatePosition(...)` call will now pick up the genome via `injectedDefaultGenome`. If the import from `./evaluate` already exists at the top of the file, add `setInjectedDefaultGenome` to that import list rather than a new import line.

- [ ] **Step 4: Add optional `genome` param to `ricefishScore` and internal helpers**

In `src/game/ai/ricefish/evaluate.ts`, find:

```ts
function defenseWeight(personality: AIPersonality): number {
  switch (personality) {
    case 'defensive': return 2.0;
    case 'aggressive': return 0.75;
    case 'generalist':
    default: return 1.0;
  }
}
```

Change to:

```ts
function defenseWeight(personality: AIPersonality, genome?: import('@/game/training-v2/genomes').RicefishGenome): number {
  if (genome) return genome.defenseWeightByPersonality[personality];
  switch (personality) {
    case 'defensive': return 2.0;
    case 'aggressive': return 0.75;
    case 'generalist':
    default: return 1.0;
  }
}
```

Find `ricefishScore`:

```ts
export function ricefishScore(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  cache?: GoalCellsCache,
): number {
  if (hasPlayerWon(state, player)) return MATE;

  const w = defenseWeight(personality);
```

Change to:

```ts
export function ricefishScore(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  cache?: GoalCellsCache,
  genome?: import('@/game/training-v2/genomes').RicefishGenome,
): number {
  if (hasPlayerWon(state, player)) return MATE;

  const w = defenseWeight(personality, genome);
```

The `OBSTRUCTION_PENALTY` and `STRAGGLER_WEIGHT` used inside `playerDistance` are module constants. For Task 3, we route the `genome` through only via `defenseWeight`. The other two are picked up in a follow-up (same scope trim as the DefaultGenome constants). The genome's other fields are inert until then. (This keeps Task 3 mechanical and low-risk; deeper wiring lands after V2 ships end-to-end.)

- [ ] **Step 5: Add optional genome set param to `createHybridScore`**

In `src/game/ai/ricefish-plus/evaluate.ts`, find:

```ts
export function createHybridScore(difficulty: AIDifficulty): RicefishScoreFn {
  return (
    state: GameState,
    player: PlayerIndex,
    personality: AIPersonality,
    cache?: GoalCellsCache,
  ): number => {
    if (hasPlayerWon(state, player)) return MATE;

    const alpha = computePhaseAlpha(state);
    const defaultTerm = evaluatePosition(state, player, personality, difficulty) / DEFAULT_NORM;
    const ricefishTerm = ricefishScore(state, player, personality, cache) / RICEFISH_NORM;
    return (1 - alpha) * defaultTerm + alpha * ricefishTerm;
  };
}
```

Change to:

```ts
export function createHybridScore(
  difficulty: AIDifficulty,
  genomes?: {
    default?: import('@/game/training-v2/genomes').DefaultGenome;
    ricefish?: import('@/game/training-v2/genomes').RicefishGenome;
    ricefishPlus?: import('@/game/training-v2/genomes').RicefishPlusGenome;
  },
): RicefishScoreFn {
  const rp = genomes?.ricefishPlus;
  const defaultNorm  = rp?.defaultNorm  ?? DEFAULT_NORM;
  const ricefishNorm = rp?.ricefishNorm ?? RICEFISH_NORM;
  return (
    state: GameState,
    player: PlayerIndex,
    personality: AIPersonality,
    cache?: GoalCellsCache,
  ): number => {
    if (hasPlayerWon(state, player)) return MATE;
    // Note: alpha threshold override intentionally not wired in Task 3 —
    // computePhaseAlpha uses the module constant; the genome carries it
    // for a follow-up plan once V2 is proven end-to-end.
    const alpha = computePhaseAlpha(state);
    const defaultTerm = evaluatePosition(state, player, personality, difficulty, genomes?.default) / defaultNorm;
    const ricefishTerm = ricefishScore(state, player, personality, cache, genomes?.ricefish) / ricefishNorm;
    return (1 - alpha) * defaultTerm + alpha * ricefishTerm;
  };
}
```

- [ ] **Step 6: Run all existing AI tests to verify no regression**

Run: `npx vitest tests/game/ai --run`
Expected: all pass. This proves `genome = undefined` produces byte-for-byte identical behavior.

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/ai.ts src/game/ai/evaluate.ts src/game/ai/ricefish/evaluate.ts src/game/ai/ricefish-plus/evaluate.ts
git commit -m "feat(ai): accept optional genome param in eval functions

Default AI's evaluatePosition, Ricefish's ricefishScore, and
Ricefish+'s createHybridScore now accept optional genome parameters
that override selected tunable values. When genome is undefined,
behavior is identical to today's hard-coded defaults. Only the top-
level knobs are wired in this pass (PERSONALITY_WEIGHTS, Ricefish
defenseWeight, Ricefish+ normalization constants); deeper eval
constants stay hard-coded and will be wired in a follow-up plan."
```

---

## Task 4: Tournament runner + promotion

**Files:**
- Create: `src/game/training-v2/tournament.ts`
- Create: `src/game/training-v2/promote.ts`
- Create: `src/game/training-v2/index.ts` (barrel)
- Create: `tests/game/training-v2/tournament.test.ts`
- Create: `tests/game/training-v2/promote.test.ts`

**Interfaces:**
- Consumes: types from Task 1 (`DefaultGenome`, `RicefishGenome`, `RicefishPlusGenome`), `AIEngine`, `AIPersonality` from `@/types/ai`, `findBestMove`, `findRicefishMove`, `findRicefishPlusMove` from the engine modules.
- Produces:
  - `type EngineGenome = { engine: 'default'; genome: DefaultGenome } | { engine: 'ricefish'; genome: RicefishGenome } | { engine: 'ricefish-plus'; genome: RicefishPlusGenome };`
  - `runTournamentGame(candidate: EngineGenome, opponent: EngineGenome, candidatePersonality: AIPersonality, opponentPersonality: AIPersonality, candidateGoesFirst: boolean, maxMoves: number): { winner: 'candidate' | 'opponent' | null; totalMoves: number }`.
  - `runChallengeMatch(candidate: EngineGenome, champion: EngineGenome, personality: AIPersonality, gamesCount: number, maxMoves: number): { candidateWins: number; championWins: number; draws: number }`.
  - `PROMOTION_THRESHOLD = 11` (wins out of 20).
  - `shouldPromote(challenge: { candidateWins: number; gamesPlayed: number }): boolean`.

- [ ] **Step 1: Write failing tests for promote**

Create `tests/game/training-v2/promote.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldPromote, PROMOTION_THRESHOLD } from '@/game/training-v2/promote';

describe('shouldPromote', () => {
  it('promotes when candidate wins meet the threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD, gamesPlayed: 20 })).toBe(true);
  });
  it('promotes when candidate wins exceed the threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD + 5, gamesPlayed: 20 })).toBe(true);
  });
  it('rejects when candidate wins below threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD - 1, gamesPlayed: 20 })).toBe(false);
  });
  it('rejects when candidate ties at threshold-1', () => {
    expect(shouldPromote({ candidateWins: 10, gamesPlayed: 20 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest tests/game/training-v2/promote.test.ts --run`
Expected: FAIL "Cannot find module '@/game/training-v2/promote'"

- [ ] **Step 3: Create `src/game/training-v2/tournament.ts`**

```ts
import type { GameState, Move, PlayerIndex } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import type { DefaultGenome, RicefishGenome, RicefishPlusGenome } from './genomes';
import { createGame } from '@/game/setup';
import { applyMove, isGameFullyOver } from '@/game/state';
import { findBestMove } from '@/game/ai/search';
import { findRicefishMove } from '@/game/ai/ricefish/search';
import { findRicefishPlusMove } from '@/game/ai/ricefish-plus/search';
import { ricefishScore } from '@/game/ai/ricefish/evaluate';

export type EngineGenome =
  | { engine: 'default';        genome: DefaultGenome }
  | { engine: 'ricefish';       genome: RicefishGenome }
  | { engine: 'ricefish-plus';  genome: RicefishPlusGenome };

/**
 * Pick a move using the engine + personality specified, threading the
 * genome down into the eval where wired:
 *  - Default AI: genome flows through findBestMove's optional param,
 *    which sets the module-scope injection consumed by evaluatePosition.
 *  - Ricefish: we build a scoreFn closure that binds the genome and pass
 *    it into findRicefishMove's optional scoreFn parameter.
 *  - Ricefish+: the search entry doesn't accept genomes yet — deferred to
 *    the follow-up plan. Ricefish+ champions will still be promoted based
 *    on hard-coded-vs-hard-coded matches during this pass, which is fine
 *    because Ricefish+ is hidden from the UI today.
 */
function pickMoveFor(
  eg: EngineGenome,
  state: GameState,
  personality: AIPersonality,
): Move | null {
  switch (eg.engine) {
    case 'default':
      return findBestMove(state, 'hard', personality, undefined, eg.genome);
    case 'ricefish': {
      const g = eg.genome;
      const scoreFn = (s: GameState, player: PlayerIndex, p: AIPersonality, cache?: Parameters<typeof ricefishScore>[3]) =>
        ricefishScore(s, player, p, cache, g);
      return findRicefishMove(state, 'hard', personality, scoreFn);
    }
    case 'ricefish-plus':
      return findRicefishPlusMove(state, 'hard', personality);
  }
}

export function runTournamentGame(
  candidate: EngineGenome,
  opponent: EngineGenome,
  candidatePersonality: AIPersonality,
  opponentPersonality: AIPersonality,
  candidateGoesFirst: boolean,
  maxMoves: number,
): { winner: 'candidate' | 'opponent' | null; totalMoves: number } {
  let state = createGame(2);
  const players = state.activePlayers;
  const firstIdx = candidateGoesFirst ? players[0] : players[1];
  const secondIdx = candidateGoesFirst ? players[1] : players[0];

  let totalMoves = 0;

  while (!isGameFullyOver(state) && totalMoves < maxMoves) {
    const currentPlayer = state.currentPlayer;
    const isCandidate = currentPlayer === (candidateGoesFirst ? firstIdx : secondIdx);
    const eg = isCandidate ? candidate : opponent;
    const personality = isCandidate ? candidatePersonality : opponentPersonality;

    const move = pickMoveFor(eg, state, personality);
    if (!move) break;

    state = applyMove(state, move);
    totalMoves++;
  }

  let winner: 'candidate' | 'opponent' | null = null;
  if (state.finishedPlayers.length > 0) {
    const winnerPlayer = state.finishedPlayers[0].player;
    const candidateSide = candidateGoesFirst ? firstIdx : secondIdx;
    winner = winnerPlayer === candidateSide ? 'candidate' : 'opponent';
  }

  return { winner, totalMoves };
}
```

Scope reminder (see "Known scope trim" section above): Default AI's `PERSONALITY_WEIGHTS` and Ricefish's `defenseWeightByPersonality` are threaded end-to-end here — those subpopulations will actually train. Ricefish+ genomes are carried but its search entry doesn't accept them yet, so its champions get promoted on hard-coded noise; that's acceptable because Ricefish+ is hidden from the UI today. Follow-up plan wires Ricefish+ end-to-end and expands the Default/Ricefish surface.

- [ ] **Step 4: Create `src/game/training-v2/promote.ts`**

```ts
import type { AIPersonality } from '@/types/ai';
import type { EngineGenome } from './tournament';
import { runTournamentGame } from './tournament';

export const PROMOTION_THRESHOLD = 11; // wins out of 20 = 55%
export const CHALLENGE_GAMES = 20;
export const CHALLENGE_MAX_MOVES = 200;

export function shouldPromote(challenge: { candidateWins: number; gamesPlayed: number }): boolean {
  return challenge.candidateWins >= PROMOTION_THRESHOLD;
}

export interface ChallengeResult {
  candidateWins: number;
  championWins: number;
  draws: number;
  gamesPlayed: number;
}

export function runChallengeMatch(
  candidate: EngineGenome,
  champion: EngineGenome,
  personality: AIPersonality,
  gamesCount: number = CHALLENGE_GAMES,
  maxMoves: number = CHALLENGE_MAX_MOVES,
): ChallengeResult {
  let candidateWins = 0;
  let championWins = 0;
  let draws = 0;
  for (let g = 0; g < gamesCount; g++) {
    const candidateGoesFirst = g % 2 === 0;
    const res = runTournamentGame(candidate, champion, personality, personality, candidateGoesFirst, maxMoves);
    if (res.winner === 'candidate') candidateWins++;
    else if (res.winner === 'opponent') championWins++;
    else draws++;
  }
  return { candidateWins, championWins, draws, gamesPlayed: gamesCount };
}
```

- [ ] **Step 5: Create `src/game/training-v2/index.ts`**

```ts
export * from './genomes';
export * from './evolve';
export * from './engineApply';
export * from './tournament';
export * from './promote';
```

- [ ] **Step 6: Write smoke test for tournament**

Create `tests/game/training-v2/tournament.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  runTournamentGame,
  type EngineGenome,
} from '@/game/training-v2/tournament';
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
} from '@/game/training-v2/genomes';

describe('runTournamentGame', () => {
  it('completes a Default vs Ricefish game and returns a winner or null', () => {
    const candidate: EngineGenome = { engine: 'default',  genome: DEFAULT_DEFAULT_GENOME };
    const opponent:  EngineGenome = { engine: 'ricefish', genome: DEFAULT_RICEFISH_GENOME };
    // Small maxMoves for a fast test — the game may hit the cap and return null.
    const res = runTournamentGame(candidate, opponent, 'generalist', 'generalist', true, 60);
    expect(res.totalMoves).toBeGreaterThan(0);
    expect(res.totalMoves).toBeLessThanOrEqual(60);
    expect(['candidate', 'opponent', null]).toContain(res.winner);
  });
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest tests/game/training-v2/ --run`
Expected: all pass. The tournament test may take a couple of seconds.

- [ ] **Step 8: Commit**

```bash
git add src/game/training-v2/tournament.ts src/game/training-v2/promote.ts src/game/training-v2/index.ts tests/game/training-v2/tournament.test.ts tests/game/training-v2/promote.test.ts
git commit -m "feat(training-v2): tournament runner and promotion logic

runTournamentGame plays a headless 2-player game between two
EngineGenomes. runChallengeMatch runs 20 games alternating first
player. shouldPromote enforces the 55% (11/20) threshold. Genomes
are carried through EngineGenome for future search-entry wiring."
```

---

## Task 5: Convex schema + queries/mutations

**Files:**
- Modify: `convex/schema.ts` — add three new tables.
- Create: `convex/trainingV2.ts` — queries + mutations + public getAllChampions.

**Interfaces:**
- Consumes: nothing from earlier tasks (Convex-side).
- Produces:
  - Tables: `trainingStateV2`, `championsV2`, `cronCursorV2`.
  - Internal queries: `getTrainingStateV2(engine)`, `getChampion(engine, personality)`, `getCronCursor()`.
  - Internal mutations: `saveTrainingStateV2(...)`, `saveChampion(engine, personality, genome, fitness, historyEntry?)`, `saveCronCursor(nextEngine, lastTick)`.
  - Public query: `getAllChampions()` — returns full `ChampionGenomeSet` or `null` if incomplete.

- [ ] **Step 1: Add tables to `convex/schema.ts`**

At the end of the `defineSchema({ ... })` block, before the closing brace, add:

```ts
  trainingStateV2: defineTable({
    engine: v.union(v.literal('default'), v.literal('ricefish'), v.literal('ricefish-plus')),
    currentGeneration: v.number(),
    population: v.any(),
    matchupSchedule: v.any(),
    matchupIndex: v.number(),
    gamesCompletedInGeneration: v.number(),
    lastUpdated: v.number(),
  }).index('by_engine', ['engine']),

  championsV2: defineTable({
    engine: v.union(v.literal('default'), v.literal('ricefish'), v.literal('ricefish-plus')),
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
  }).index('by_engine_personality', ['engine', 'personality']),

  cronCursorV2: defineTable({
    nextEngine: v.union(v.literal('default'), v.literal('ricefish'), v.literal('ricefish-plus')),
    lastTick: v.number(),
  }),
```

- [ ] **Step 2: Create `convex/trainingV2.ts`**

```ts
import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';

const engineValidator = v.union(
  v.literal('default'),
  v.literal('ricefish'),
  v.literal('ricefish-plus'),
);
const personalityValidator = v.union(
  v.literal('generalist'),
  v.literal('defensive'),
  v.literal('aggressive'),
);

export const getTrainingStateV2 = internalQuery({
  args: { engine: engineValidator },
  handler: async (ctx, { engine }) => {
    return await ctx.db
      .query('trainingStateV2')
      .withIndex('by_engine', (q) => q.eq('engine', engine))
      .first();
  },
});

export const saveTrainingStateV2 = internalMutation({
  args: {
    engine: engineValidator,
    currentGeneration: v.number(),
    population: v.any(),
    matchupSchedule: v.any(),
    matchupIndex: v.number(),
    gamesCompletedInGeneration: v.number(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('trainingStateV2')
      .withIndex('by_engine', (q) => q.eq('engine', args.engine))
      .first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert('trainingStateV2', args);
    }
  },
});

export const getChampion = internalQuery({
  args: { engine: engineValidator, personality: personalityValidator },
  handler: async (ctx, { engine, personality }) => {
    return await ctx.db
      .query('championsV2')
      .withIndex('by_engine_personality', (q) =>
        q.eq('engine', engine).eq('personality', personality)
      )
      .first();
  },
});

export const saveChampion = internalMutation({
  args: {
    engine: engineValidator,
    personality: personalityValidator,
    genome: v.any(),
    fitness: v.number(),
    challengeEntry: v.object({
      candidateGenome: v.any(),
      wins: v.number(),
      played: v.number(),
      date: v.number(),
      promoted: v.boolean(),
    }),
    replaceGenome: v.boolean(),
  },
  handler: async (ctx, { engine, personality, genome, fitness, challengeEntry, replaceGenome }) => {
    const existing = await ctx.db
      .query('championsV2')
      .withIndex('by_engine_personality', (q) =>
        q.eq('engine', engine).eq('personality', personality)
      )
      .first();
    const now = Date.now();
    if (existing) {
      const history = [...(existing.challengeHistory ?? []), challengeEntry];
      await ctx.db.patch(existing._id, {
        genome: replaceGenome ? genome : existing.genome,
        fitness: replaceGenome ? fitness : existing.fitness,
        promotedAt: replaceGenome ? now : existing.promotedAt,
        challengeHistory: history,
      });
    } else {
      await ctx.db.insert('championsV2', {
        engine,
        personality,
        genome,
        fitness,
        promotedAt: now,
        challengeHistory: [challengeEntry],
      });
    }
  },
});

export const getCronCursor = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('cronCursorV2').first();
  },
});

export const saveCronCursor = internalMutation({
  args: {
    nextEngine: engineValidator,
    lastTick: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('cronCursorV2').first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert('cronCursorV2', args);
    }
  },
});

/**
 * Public query used by clients to fetch all champions in one round trip.
 * Returns null if any of the 9 rows are missing (bootstrap in progress).
 */
export const getAllChampions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('championsV2').collect();
    if (rows.length < 9) return null;
    const engines = ['default', 'ricefish', 'ricefish-plus'] as const;
    const personalities = ['generalist', 'defensive', 'aggressive'] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = { default: {}, ricefish: {}, 'ricefish-plus': {} };
    for (const e of engines) {
      for (const p of personalities) {
        const row = rows.find((r) => r.engine === e && r.personality === p);
        if (!row) return null;
        result[e][p] = row.genome;
      }
    }
    return result;
  },
});
```

- [ ] **Step 3: Verify Convex code compiles by running the codegen**

Run: `npx convex dev --once`
Expected: schema deploys and generated types update without errors. If Convex CLI is not installed globally, use `npx convex@latest dev --once`. If the command hangs waiting for confirmation, exit with Ctrl+C and note the failure.

If `npx convex dev --once` requires environment configuration you cannot supply, run the type check as a fallback:

Run: `npx tsc --noEmit`
Expected: no errors from `convex/trainingV2.ts` or `convex/schema.ts`. (There may be pre-existing errors in unrelated `.test.ts` files — ignore those.)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/trainingV2.ts
git commit -m "feat(convex): training-v2 schema and queries

Three new tables (trainingStateV2, championsV2, cronCursorV2) plus
internal queries/mutations for state persistence, champion promotion,
and cron round-robin cursoring. Public getAllChampions returns full
ChampionGenomeSet or null when bootstrap is incomplete."
```

---

## Task 6: Convex cron action + seeding

**Files:**
- Create: `convex/trainingV2Actions.ts` — `runTrainingV2Step` internal action.
- Modify: `convex/crons.ts` — add V2 cron entry.

**Interfaces:**
- Consumes: internal queries/mutations from Task 5.
- Produces: `runTrainingV2Step` (internal action, no args).

- [ ] **Step 1: Create `convex/trainingV2Actions.ts`**

```ts
'use node';

import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  createRandomDefaultGenome,
  createRandomRicefishGenome,
  createRandomRicefishPlusGenome,
  mutateDefaultGenome,
  mutateRicefishGenome,
  mutateRicefishPlusGenome,
  crossoverDefaultGenome,
  crossoverRicefishGenome,
  crossoverRicefishPlusGenome,
  type DefaultGenome,
  type RicefishGenome,
  type RicefishPlusGenome,
} from '../src/game/training-v2/genomes';
import { evolveGeneration, type Individual, type EvolveConfig } from '../src/game/training-v2/evolve';
import { runTournamentGame, type EngineGenome } from '../src/game/training-v2/tournament';
import { runChallengeMatch, shouldPromote, CHALLENGE_GAMES } from '../src/game/training-v2/promote';

const ENGINES = ['default', 'ricefish', 'ricefish-plus'] as const;
type Engine = typeof ENGINES[number];
const PERSONALITIES = ['generalist', 'defensive', 'aggressive'] as const;

const CONFIG: EvolveConfig = {
  populationSize: 12,
  eliteCount: 2,
  tournamentSize: 3,
  mutationRate: 0.15,
  mutationStrength: 0.3,
};
const GAMES_PER_MATCHUP = 3;
const MAX_MOVES = 200;
const GAMES_PER_BATCH = 20;
const BATCH_TIME_LIMIT_MS = 90_000;

/**
 * Schedule slot: one game between an individual (identified by index) and
 * a champion identified by (engine, personality). candidatePersonality
 * cycles as gameIdx % 3 so each individual is evaluated across all three
 * personalities.
 */
interface ScheduleSlot {
  individualIdx: number;
  opponentEngine: Engine;
  opponentPersonality: typeof PERSONALITIES[number];
  gameIdx: number;
}

function buildSchedule(populationSize: number): ScheduleSlot[] {
  const schedule: ScheduleSlot[] = [];
  for (let i = 0; i < populationSize; i++) {
    for (const opponentEngine of ENGINES) {
      for (const opponentPersonality of PERSONALITIES) {
        for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
          schedule.push({ individualIdx: i, opponentEngine, opponentPersonality, gameIdx: g });
        }
      }
    }
  }
  return schedule;
}

function createRandomFor(engine: Engine): DefaultGenome | RicefishGenome | RicefishPlusGenome {
  switch (engine) {
    case 'default':       return createRandomDefaultGenome();
    case 'ricefish':      return createRandomRicefishGenome();
    case 'ricefish-plus': return createRandomRicefishPlusGenome();
  }
}

function mutateFor(engine: Engine, g: any, rate: number, strength: number): any {
  switch (engine) {
    case 'default':       return mutateDefaultGenome(g, rate, strength);
    case 'ricefish':      return mutateRicefishGenome(g, rate, strength);
    case 'ricefish-plus': return mutateRicefishPlusGenome(g, rate, strength);
  }
}

function crossoverFor(engine: Engine, a: any, b: any): any {
  switch (engine) {
    case 'default':       return crossoverDefaultGenome(a, b);
    case 'ricefish':      return crossoverRicefishGenome(a, b);
    case 'ricefish-plus': return crossoverRicefishPlusGenome(a, b);
  }
}

function defaultGenomeFor(engine: Engine): any {
  switch (engine) {
    case 'default':       return DEFAULT_DEFAULT_GENOME;
    case 'ricefish':      return DEFAULT_RICEFISH_GENOME;
    case 'ricefish-plus': return DEFAULT_RICEFISH_PLUS_GENOME;
  }
}

function nextEngineAfter(engine: Engine): Engine {
  const idx = ENGINES.indexOf(engine);
  return ENGINES[(idx + 1) % ENGINES.length];
}

function createInitialPopulation(engine: Engine): Individual<any>[] {
  const pop: Individual<any>[] = [{
    genome: defaultGenomeFor(engine),
    fitness: 0, wins: 0, gamesPlayed: 0,
  }];
  for (let i = 1; i < CONFIG.populationSize; i++) {
    pop.push({ genome: createRandomFor(engine), fitness: 0, wins: 0, gamesPlayed: 0 });
  }
  return pop;
}

export const runTrainingV2Step = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();
    try {
      // ── 1. Determine which subpop gets this tick ────────────────────────
      let cursor = await ctx.runQuery(internal.trainingV2.getCronCursor);
      const engine: Engine = cursor?.nextEngine ?? 'default';

      // ── 2. Seed champions if empty ───────────────────────────────────────
      for (const e of ENGINES) {
        for (const p of PERSONALITIES) {
          const existing = await ctx.runQuery(internal.trainingV2.getChampion, { engine: e, personality: p });
          if (!existing) {
            await ctx.runMutation(internal.trainingV2.saveChampion, {
              engine: e,
              personality: p,
              genome: defaultGenomeFor(e),
              fitness: 0,
              challengeEntry: {
                candidateGenome: defaultGenomeFor(e),
                wins: 0,
                played: 0,
                date: Date.now(),
                promoted: true,
              },
              replaceGenome: true,
            });
            console.log(`[TrainingV2] Seeded champion ${e}/${p} from default`);
          }
        }
      }

      // ── 3. Load subpop state, initialize if empty ────────────────────────
      let state = await ctx.runQuery(internal.trainingV2.getTrainingStateV2, { engine });
      if (!state) {
        const population = createInitialPopulation(engine);
        const matchupSchedule = buildSchedule(CONFIG.populationSize);
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration: 0,
          population,
          matchupSchedule,
          matchupIndex: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
        state = { engine, currentGeneration: 0, population, matchupSchedule, matchupIndex: 0, gamesCompletedInGeneration: 0, lastUpdated: Date.now() } as any;
        console.log(`[TrainingV2] Initialized ${engine} subpop`);
      }

      // ── 4. Load champions map for this tick ──────────────────────────────
      const championsMap: Record<Engine, Record<typeof PERSONALITIES[number], any>> = {
        default: {} as any,
        ricefish: {} as any,
        'ricefish-plus': {} as any,
      };
      for (const e of ENGINES) {
        for (const p of PERSONALITIES) {
          const row = await ctx.runQuery(internal.trainingV2.getChampion, { engine: e, personality: p });
          championsMap[e][p] = row!.genome;
        }
      }

      // ── 5. Run batch of games ────────────────────────────────────────────
      const population: Individual<any>[] = state!.population as any;
      const schedule: ScheduleSlot[] = state!.matchupSchedule as any;
      let matchupIndex: number = state!.matchupIndex;
      let gamesCompletedInGeneration: number = state!.gamesCompletedInGeneration;
      const currentGeneration: number = state!.currentGeneration;

      let gamesThisBatch = 0;
      while (gamesThisBatch < GAMES_PER_BATCH && matchupIndex < schedule.length) {
        if (Date.now() - startTime > BATCH_TIME_LIMIT_MS) {
          console.log(`[TrainingV2] Time cap hit, saving progress`);
          break;
        }
        const slot = schedule[matchupIndex];
        const candidatePersonality = PERSONALITIES[slot.gameIdx % PERSONALITIES.length];
        const candidateEG: EngineGenome = { engine, genome: population[slot.individualIdx].genome };
        const opponentEG: EngineGenome = {
          engine: slot.opponentEngine,
          genome: championsMap[slot.opponentEngine][slot.opponentPersonality],
        };

        const res = runTournamentGame(
          candidateEG,
          opponentEG,
          candidatePersonality,
          slot.opponentPersonality,
          slot.gameIdx % 2 === 0,
          MAX_MOVES,
        );

        population[slot.individualIdx].gamesPlayed++;
        if (res.winner === 'candidate')      { population[slot.individualIdx].wins++; population[slot.individualIdx].fitness += 3; }
        else if (res.winner === 'opponent')  {                                                                     population[slot.individualIdx].fitness += 0; }
        else                                 {                                                                     population[slot.individualIdx].fitness += 1; }

        matchupIndex++;
        gamesCompletedInGeneration++;
        gamesThisBatch++;
      }

      // ── 6. Generation complete? evolve + promote ────────────────────────
      if (matchupIndex >= schedule.length) {
        const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
        const champion = sorted[0];

        for (const p of PERSONALITIES) {
          const currentChampion = championsMap[engine][p];
          const challenge = runChallengeMatch(
            { engine, genome: champion.genome },
            { engine, genome: currentChampion },
            p,
          );
          const promoted = shouldPromote({ candidateWins: challenge.candidateWins, gamesPlayed: challenge.gamesPlayed });
          await ctx.runMutation(internal.trainingV2.saveChampion, {
            engine,
            personality: p,
            genome: champion.genome,
            fitness: champion.fitness,
            challengeEntry: {
              candidateGenome: champion.genome,
              wins: challenge.candidateWins,
              played: CHALLENGE_GAMES,
              date: Date.now(),
              promoted,
            },
            replaceGenome: promoted,
          });
          console.log(`[TrainingV2] ${engine}/${p} challenge: ${challenge.candidateWins}/${CHALLENGE_GAMES} (${promoted ? 'PROMOTED' : 'rejected'})`);
        }

        const next = evolveGeneration(
          population,
          CONFIG,
          () => createRandomFor(engine),
          (g, r, s) => mutateFor(engine, g, r, s),
          (a, b) => crossoverFor(engine, a, b),
        );
        const newSchedule = buildSchedule(CONFIG.populationSize);
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration: currentGeneration + 1,
          population: next,
          matchupSchedule: newSchedule,
          matchupIndex: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
      } else {
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration,
          population,
          matchupSchedule: schedule,
          matchupIndex,
          gamesCompletedInGeneration,
          lastUpdated: Date.now(),
        });
      }

      // ── 7. Advance cron cursor ──────────────────────────────────────────
      await ctx.runMutation(internal.trainingV2.saveCronCursor, {
        nextEngine: nextEngineAfter(engine),
        lastTick: Date.now(),
      });

      console.log(`[TrainingV2] Tick complete for ${engine} in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${gamesThisBatch} games)`);
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[TrainingV2] FAILED after ${elapsed}s:`, String(error));
      // Do not rethrow — spec constraint (throw would cause retry and cost).
    }
  },
});
```

- [ ] **Step 2: Add V2 cron entry to `convex/crons.ts`**

Change:

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// General GA training — paused in favour of endgame-specific training
// crons.interval("ai training step", { minutes: 30 }, internal.trainingActions.runTrainingStep);

// Endgame training: runs every 180 minutes (~0.65 GB-hours/month with beam search)
crons.interval("endgame training step", { minutes: 180 }, internal.endgameTrainingActions.runEndgameTrainingStep);

export default crons;
```

to:

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// General GA training — paused in favour of endgame-specific training
// crons.interval("ai training step", { minutes: 30 }, internal.trainingActions.runTrainingStep);

// Endgame training: runs every 180 minutes (~0.65 GB-hours/month with beam search)
crons.interval("endgame training step", { minutes: 180 }, internal.endgameTrainingActions.runEndgameTrainingStep);

// Training V2: cross-engine tournament, one subpopulation per tick.
crons.interval("training v2 step", { minutes: 30 }, internal.trainingV2Actions.runTrainingV2Step);

export default crons;
```

- [ ] **Step 3: Deploy & verify (if Convex CLI available)**

Run: `npx convex dev --once`
Expected: schema + cron changes deploy. New tables appear. No errors.

If CLI cannot run in this environment, fall back to:

Run: `npx tsc --noEmit`
Expected: no errors from `convex/trainingV2Actions.ts` or `convex/crons.ts`.

- [ ] **Step 4: Commit**

```bash
git add convex/trainingV2Actions.ts convex/crons.ts
git commit -m "feat(convex): training-v2 cron action + round-robin scheduler

Every 30 min, one engine's subpopulation runs a batch of up to 20
tournament games against the current champion set, then persists.
When a generation completes, best individual challenges each of the
three personality champions for its engine; promotes on >=11/20 wins.
Bootstraps champions from hard-coded defaults on first tick.
Wrapped in try/catch to avoid Convex action retries on failure."
```

---

## Task 7: Client cache + worker plumbing

**Files:**
- Create: `src/hooks/useChampionGenomes.ts` — module-level TTL cache with background refresh (pattern copied from `useEvolvedGenome.ts`).
- Modify: `src/game/ai/workerClient.ts` — extend `WorkerRequest` with `championGenomes?: ChampionGenomeSet`.
- Modify: `src/game/ai/worker.ts` — deserialize `championGenomes` and pass into engine calls where possible.
- Modify: `src/hooks/useAITurn.ts` — read `getServerChampionGenomes()` and include in worker request.

**Interfaces:**
- Consumes: `USE_TRAINED_GENOMES`, `ChampionGenomeSet` from Task 3.
- Produces: `getServerChampionGenomes(): ChampionGenomeSet | null` — synchronous read from module cache; triggers background refresh if stale.

- [ ] **Step 1: Create `src/hooks/useChampionGenomes.ts`**

```ts
import { getConvexClientOrNull } from '@/lib/convex';
import { api } from '../../convex/_generated/api';
import type { ChampionGenomeSet } from '@/types/ai';
import { USE_TRAINED_GENOMES } from '@/types/ai';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LS_KEY = 'champion-genomes-v2';

let cached: ChampionGenomeSet | null = null;
let cacheTimestamp = 0;
let fetchPromise: Promise<ChampionGenomeSet | null> | null = null;

// Bootstrap from localStorage on module load (browser only).
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cached = JSON.parse(raw) as ChampionGenomeSet;
      // Do not set cacheTimestamp — stale-on-load forces a refresh.
    }
  } catch {
    // localStorage may be blocked; ignore.
  }
}

async function fetchChampions(): Promise<ChampionGenomeSet | null> {
  try {
    const client = getConvexClientOrNull();
    if (!client) return cached;
    const result = await client.query(api.trainingV2.getAllChampions);
    if (result) {
      cached = result as ChampionGenomeSet;
      cacheTimestamp = Date.now();
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(LS_KEY, JSON.stringify(cached)); } catch { /* ignore */ }
      }
    }
    return cached;
  } catch (e) {
    console.warn('[ChampionGenomes] Failed to fetch:', e);
    return cached;
  }
}

/**
 * Synchronous read from module cache. Returns null if we've never fetched
 * successfully AND localStorage was empty. Triggers a background refresh
 * if the cache is stale.
 */
export function getServerChampionGenomes(): ChampionGenomeSet | null {
  if (!USE_TRAINED_GENOMES) return null;
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    if (!fetchPromise) {
      fetchPromise = fetchChampions().finally(() => { fetchPromise = null; });
    }
  }
  return cached;
}
```

- [ ] **Step 2: Extend `WorkerRequest` in `src/game/ai/workerClient.ts`**

Find:

```ts
export interface WorkerRequest {
  state: SerializedGameState;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  engine?: AIEngine;
  openingMoves?: { from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number } }[] | null;
}
```

Change to:

```ts
export interface WorkerRequest {
  state: SerializedGameState;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  engine?: AIEngine;
  openingMoves?: { from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number } }[] | null;
  championGenomes?: import('@/types/ai').ChampionGenomeSet;
}
```

- [ ] **Step 3: Consume `championGenomes` in `src/game/ai/worker.ts`**

Currently the worker dispatches to `findBestMove`, `findRicefishMove`, or `findRicefishPlusMove` and none of them accept a genome argument today. In Task 3 we wired genome-awareness into the *eval* layer, but the search entry points (`findBestMove`, `findRicefishMove`, `findRicefishPlusMove`) still don't accept genomes. That's the scope trim called out in Task 4.

For Task 7, we make the worker *receive* the genomes and stash them on module scope, ready for the follow-up plan that threads them through search entry points. No behavioral change today.

Change:

```ts
import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves } = e.data;
  const state = deserializeGameState(serialized);
  const move =
    engine === 'ricefish-plus' ? findRicefishPlusMove(state, difficulty, personality) :
    engine === 'ricefish'      ? findRicefishMove(state, difficulty, personality) :
                                 findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
```

to:

```ts
import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';

// Received per-request; stored for the follow-up plan that threads
// genomes through the search entry points. No behavioral use yet.
let receivedGenomes: WorkerRequest['championGenomes'] = undefined;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves, championGenomes } = e.data;
  receivedGenomes = championGenomes;
  void receivedGenomes; // silence unused warning; consumed in follow-up plan
  const state = deserializeGameState(serialized);
  const move =
    engine === 'ricefish-plus' ? findRicefishPlusMove(state, difficulty, personality) :
    engine === 'ricefish'      ? findRicefishMove(state, difficulty, personality) :
                                 findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
```

- [ ] **Step 4: Include genomes in the worker request from `useAITurn.ts`**

Find the block at the bottom of the second useEffect where `worker.postMessage({ ... })` is called:

```ts
      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
        engine: currentAI.engine ?? 'default',
        openingMoves,
      });
```

Change to:

```ts
      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
        engine: currentAI.engine ?? 'default',
        openingMoves,
        championGenomes: getServerChampionGenomes() ?? undefined,
      });
```

Add the import at the top of the file, alongside other imports:

```ts
import { getServerChampionGenomes } from './useChampionGenomes';
```

- [ ] **Step 5: Run the full test suite and type check**

Run: `npm run test`
Expected: all pass. No regression in existing AI tests (Task 3 constraint).

Run: `npm run build`
Expected: build succeeds. No type errors.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`

- Open `http://localhost:3000/play`.
- Add an AI player and start a game.
- In dev tools console, verify no errors.
- Check the network tab / Convex dashboard: `getAllChampions` should fire on page load (may return null on first visit if the cron hasn't seeded yet).
- Play through 5+ turns; AI should move normally.

If Convex dev deployment isn't running yet, the query fails silently and the AI falls back to defaults — this is the expected fallback path.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useChampionGenomes.ts src/hooks/useAITurn.ts src/game/ai/workerClient.ts src/game/ai/worker.ts
git commit -m "feat(training-v2): client cache + worker plumbing

Module-level TTL cache with localStorage bootstrap for champion
genomes (getServerChampionGenomes). WorkerRequest carries the genome
set; worker stashes it for follow-up wiring. useAITurn wires the
cache read into every worker post."
```

---

## Task 8: Deploy + verify end-to-end

**Files:**
- No source changes; this task is deploy + verification only.

**Interfaces:** none.

- [ ] **Step 1: Deploy schema + functions to Convex**

Run: `npx convex deploy`
Expected: succeeds. New tables `trainingStateV2`, `championsV2`, `cronCursorV2` appear in the dashboard.

- [ ] **Step 2: Confirm cron is registered**

In the Convex dashboard → Schedule tab, verify "training v2 step" appears with a 30-min interval.

- [ ] **Step 3: Watch first three ticks (up to 90 min of wait)**

Alternate approach without waiting: in the Convex dashboard, manually invoke `trainingV2Actions.runTrainingV2Step` three times.

Expected per tick:
- No errors in the Convex logs.
- Action time under 90 s.
- After tick 1: `championsV2` has 9 rows (seeded from defaults), `trainingStateV2` has 1 row for `default`, `cronCursorV2` has `nextEngine: 'ricefish'`.
- After tick 2: `trainingStateV2` has 2 rows (default + ricefish), cursor moves to `ricefish-plus`.
- After tick 3: 3 rows, cursor cycles back to `default`.

- [ ] **Step 4: Verify client fetches champions**

- Open `http://localhost:3000/play` in a browser (against the deployed Convex).
- In dev tools: `localStorage.getItem('champion-genomes-v2')` should return a JSON blob with 3 engines × 3 personalities.
- Start a game with an AI player.
- Confirm the AI moves and no console errors.

- [ ] **Step 5: Add a smoke test entry to the progress ledger**

No commit needed — this is a deployment verification pass.

---

## Follow-up (not part of this plan)

After V2 infra is live and champions are being updated, a follow-up plan will:

1. Wire genomes through search entry points (`findBestMove`, `findRicefishMove`, `findRicefishPlusMove`) so they actually consume the trained values during gameplay.
2. Extend Default AI eval to consume `evalConstants` fields from the genome (not just `personalityWeights`).
3. Extend Ricefish eval to consume `obstructionPenalty` and `stragglerWeight`.
4. Extend Ricefish+ eval to consume `alphaEndgameThreshold`.
5. Retire V1 training files (`src/game/training/`, `convex/training.ts`, `convex/trainingActions.ts`) and the `trainingState` / `evolvedGenome` tables.

These are all mechanical wiring tasks; splitting them out keeps V2 shipping fast and gives us a stable base to measure the effect of each additional genome field.
