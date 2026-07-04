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
