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
    // maxMoves=4: two moves per engine — enough to test wiring; game always
    // hits the cap (no one wins in 4 moves) returning winner=null.
    const res = runTournamentGame(candidate, opponent, 'generalist', 'generalist', true, 4);
    expect(res.totalMoves).toBeGreaterThan(0);
    expect(res.totalMoves).toBeLessThanOrEqual(4);
    expect(['candidate', 'opponent', null]).toContain(res.winner);
  }, 30_000);
});
