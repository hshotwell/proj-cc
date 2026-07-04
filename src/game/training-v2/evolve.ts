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
