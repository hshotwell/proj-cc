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
