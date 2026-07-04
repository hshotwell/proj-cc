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
