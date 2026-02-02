'use client';

import { create } from 'zustand';
import type { GameState } from '@/types/game';
import type { Genome, Individual, TrainingConfig, GenerationResult } from '@/types/training';
import { DEFAULT_TRAINING_CONFIG } from '@/types/training';
import { createGame } from '@/game/setup';
import { applyMove, isGameFullyOver } from '@/game/state';
import {
  createInitialPopulation,
  evolveGeneration,
  saveEvolvedGenome,
  findBestMoveWithGenome,
  saveTrainingSession,
  loadTrainingSession,
  clearTrainingSession,
} from '@/game/training';
import type { TrainingSession } from '@/game/training';

interface MatchupInfo {
  player1Index: number;
  player2Index: number;
  gameNumber: number;
  moveCount: number;
}

interface TrainingStore {
  isRunning: boolean;
  isPaused: boolean;
  config: TrainingConfig;
  currentGeneration: number;
  population: Individual[];
  bestGenome: Genome | null;
  generationHistory: GenerationResult[];
  gamesCompleted: number;
  totalGamesToPlay: number;
  statusMessage: string;
  // Live game visualization
  currentGameState: GameState | null;
  currentMatchup: MatchupInfo | null;

  startTraining: (config: TrainingConfig) => void;
  resumeSession: () => void;
  pauseTraining: () => void;
  resumeTraining: () => void;
  stopTraining: () => void;
  applyBestGenome: () => void;
}

// Handle for the current training loop so we can cancel it
let abortController: AbortController | null = null;

function computeTotalGames(config: TrainingConfig): number {
  const matchups = (config.populationSize * (config.populationSize - 1)) / 2;
  return matchups * config.gamesPerMatchup * config.generations;
}

// Build the flat list of all matchups for a generation
function buildMatchupSchedule(popSize: number): [number, number][] {
  const schedule: [number, number][] = [];
  for (let i = 0; i < popSize; i++) {
    for (let j = i + 1; j < popSize; j++) {
      schedule.push([i, j]);
    }
  }
  return schedule;
}

export const useTrainingStore = create<TrainingStore>()((set, get) => ({
  isRunning: false,
  isPaused: false,
  config: DEFAULT_TRAINING_CONFIG,
  currentGeneration: 0,
  population: [],
  bestGenome: null,
  generationHistory: [],
  gamesCompleted: 0,
  totalGamesToPlay: 0,
  statusMessage: 'Ready to start training',
  currentGameState: null,
  currentMatchup: null,

  startTraining: (config: TrainingConfig) => {
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    const totalGames = computeTotalGames(config);
    const population = createInitialPopulation(config.populationSize);

    clearTrainingSession();

    set({
      isRunning: true,
      isPaused: false,
      config,
      currentGeneration: 0,
      population,
      bestGenome: null,
      generationHistory: [],
      gamesCompleted: 0,
      totalGamesToPlay: totalGames,
      statusMessage: 'Initializing population...',
      currentGameState: null,
      currentMatchup: null,
    });

    runTrainingLoop(population, config, 0, [], 0, 0, 0, signal);
  },

  resumeSession: () => {
    const session = loadTrainingSession();
    if (!session) return;

    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    set({
      isRunning: true,
      isPaused: false,
      config: session.config,
      currentGeneration: session.currentGeneration,
      population: session.population,
      bestGenome: session.bestGenome,
      generationHistory: session.generationHistory,
      gamesCompleted: session.gamesCompleted,
      totalGamesToPlay: session.totalGamesToPlay,
      statusMessage: 'Resuming training...',
      currentGameState: null,
      currentMatchup: null,
    });

    runTrainingLoop(
      session.population,
      session.config,
      session.currentGeneration,
      session.generationHistory,
      session.gamesCompleted,
      session.matchupIndex,
      session.gameWithinMatchup,
      signal
    );
  },

  pauseTraining: () => {
    set({ isPaused: true, statusMessage: 'Training paused' });
  },

  resumeTraining: () => {
    set({ isPaused: false, statusMessage: 'Resuming training...' });
  },

  stopTraining: () => {
    abortController?.abort();
    abortController = null;
    const state = get();
    // Auto-save best genome on stop if we have one
    if (state.bestGenome) {
      saveEvolvedGenome(state.bestGenome);
    }
    set({
      isRunning: false,
      isPaused: false,
      currentGameState: null,
      currentMatchup: null,
      statusMessage: state.bestGenome
        ? 'Training stopped. Best genome saved automatically.'
        : 'Training stopped.',
    });
  },

  applyBestGenome: () => {
    const { bestGenome } = get();
    if (bestGenome) {
      saveEvolvedGenome(bestGenome);
      set({ statusMessage: 'Evolved AI saved!' });
    }
  },
}));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Save a snapshot of training progress
function persistProgress(
  config: TrainingConfig,
  currentGeneration: number,
  population: Individual[],
  bestGenome: Genome | null,
  generationHistory: GenerationResult[],
  gamesCompleted: number,
  totalGamesToPlay: number,
  matchupIndex: number,
  gameWithinMatchup: number
) {
  const session: TrainingSession = {
    config,
    currentGeneration,
    population: population.map((ind) => ({ ...ind, genome: { ...ind.genome } })),
    bestGenome: bestGenome ? { ...bestGenome } : null,
    generationHistory: [...generationHistory],
    gamesCompleted,
    totalGamesToPlay,
    matchupIndex,
    gameWithinMatchup,
  };
  saveTrainingSession(session);
}

async function runTrainingLoop(
  initialPopulation: Individual[],
  config: TrainingConfig,
  startGen: number,
  initialHistory: GenerationResult[],
  initialGamesCompleted: number,
  startMatchupIdx: number,
  startGameWithinMatchup: number,
  signal: AbortSignal
) {
  let population = initialPopulation;
  let generationHistory = [...initialHistory];
  let totalGamesCompleted = initialGamesCompleted;
  const totalGamesToPlay = computeTotalGames(config);

  for (let gen = startGen; gen < config.generations; gen++) {
    if (signal.aborted) return;

    // Wait while paused
    while (useTrainingStore.getState().isPaused) {
      if (signal.aborted) return;
      await sleep(200);
    }

    // Reset fitness at start of generation (unless resuming mid-generation)
    const isResuming = gen === startGen && startMatchupIdx > 0;
    if (!isResuming) {
      for (const ind of population) {
        ind.fitness = 0;
        ind.wins = 0;
        ind.gamesPlayed = 0;
      }
    }

    useTrainingStore.setState({
      currentGeneration: gen + 1,
      statusMessage: `Generation ${gen + 1}/${config.generations}: Running tournament...`,
    });

    const schedule = buildMatchupSchedule(config.populationSize);
    const mStart = isResuming ? startMatchupIdx : 0;

    for (let m = mStart; m < schedule.length; m++) {
      const [i, j] = schedule[m];
      const gStart = (m === mStart && isResuming) ? startGameWithinMatchup : 0;

      for (let g = gStart; g < config.gamesPerMatchup; g++) {
        if (signal.aborted) return;

        // Wait while paused
        while (useTrainingStore.getState().isPaused) {
          if (signal.aborted) return;
          await sleep(200);
        }

        const first = g % 2 === 0 ? i : j;
        const second = first === i ? j : i;

        useTrainingStore.setState({
          currentMatchup: {
            player1Index: first,
            player2Index: second,
            gameNumber: g + 1,
            moveCount: 0,
          },
          statusMessage: `Gen ${gen + 1}: Individual ${first + 1} vs ${second + 1} (game ${g + 1}/${config.gamesPerMatchup})`,
        });

        // Play one game move-by-move
        const result = await playGameStepByStep(
          population[first].genome,
          population[second].genome,
          config.maxMovesPerGame,
          signal
        );

        if (signal.aborted) return;

        // Record result
        population[first].gamesPlayed++;
        population[second].gamesPlayed++;

        if (result.winner === 0) {
          population[first].wins++;
          population[first].fitness += 3;
        } else if (result.winner === 1) {
          population[second].wins++;
          population[second].fitness += 3;
        } else {
          population[first].fitness += 1;
          population[second].fitness += 1;
        }

        totalGamesCompleted++;

        useTrainingStore.setState({
          population: [...population],
          gamesCompleted: totalGamesCompleted,
          currentGameState: null,
          currentMatchup: null,
        });

        // Auto-save progress after each game
        persistProgress(
          config, gen, population, useTrainingStore.getState().bestGenome,
          generationHistory, totalGamesCompleted, totalGamesToPlay,
          m, g + 1
        );

        // Yield between games
        await sleep(0);
      }
    }

    if (signal.aborted) return;

    // Generation complete — summarize
    const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0];
    const avgFitness =
      population.reduce((sum, ind) => sum + ind.fitness, 0) / population.length;

    const result: GenerationResult = {
      generation: gen + 1,
      bestFitness: best.fitness,
      avgFitness,
      bestGenome: { ...best.genome },
    };
    generationHistory = [...generationHistory, result];

    // Auto-save best genome after each generation
    saveEvolvedGenome(best.genome);

    useTrainingStore.setState({
      population: [...population],
      bestGenome: { ...best.genome },
      generationHistory,
      statusMessage: `Generation ${gen + 1} complete. Best fitness: ${best.fitness.toFixed(1)} (auto-saved)`,
    });

    // Save progress at generation boundary
    persistProgress(
      config, gen + 1, population, best.genome,
      generationHistory, totalGamesCompleted, totalGamesToPlay,
      0, 0
    );

    // Evolve next generation (unless this is the last)
    if (gen < config.generations - 1) {
      population = evolveGeneration(population, config);
      useTrainingStore.setState({ population: [...population] });
    }

    await sleep(0);
  }

  // Training complete
  clearTrainingSession();
  useTrainingStore.setState({
    isRunning: false,
    isPaused: false,
    currentGameState: null,
    currentMatchup: null,
    statusMessage: 'Training complete! Evolved AI saved automatically.',
  });
}

interface StepResult {
  winner: 0 | 1 | null;
}

async function playGameStepByStep(
  genome1: Genome,
  genome2: Genome,
  maxMoves: number,
  signal: AbortSignal
): Promise<StepResult> {
  let state = createGame(2);
  const players = state.activePlayers;
  const genomes: Record<number, Genome> = {
    [players[0]]: genome1,
    [players[1]]: genome2,
  };

  let totalMoves = 0;

  useTrainingStore.setState({ currentGameState: state });

  while (!isGameFullyOver(state) && totalMoves < maxMoves) {
    if (signal.aborted) return { winner: null };

    // Wait while paused
    while (useTrainingStore.getState().isPaused) {
      if (signal.aborted) return { winner: null };
      await sleep(200);
    }

    const currentPlayer = state.currentPlayer;
    const genome = genomes[currentPlayer];

    // Compute one move — this is the expensive part (~0.5-2s)
    const move = findBestMoveWithGenome(state, genome);
    if (!move) break;

    state = applyMove(state, move);
    totalMoves++;

    // Update store so UI can render the board
    useTrainingStore.setState((s) => ({
      currentGameState: state,
      currentMatchup: s.currentMatchup
        ? { ...s.currentMatchup, moveCount: totalMoves }
        : null,
    }));

    // Yield to browser so it can paint the updated board
    await sleep(0);
  }

  let winner: 0 | 1 | null = null;
  if (state.finishedPlayers.length > 0) {
    const winnerPlayer = state.finishedPlayers[0].player;
    winner = winnerPlayer === players[0] ? 0 : 1;
  }

  return { winner };
}
