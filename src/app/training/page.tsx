'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { TrainingConfig } from '@/types/training';
import { DEFAULT_TRAINING_CONFIG } from '@/types/training';
import { useTrainingStore } from '@/store/trainingStore';
import { hasEvolvedGenome, loadTrainingSession } from '@/game/training/persistence';
import { TrainingBoard } from '@/components/board/TrainingBoard';

export default function TrainingPage() {
  const {
    isRunning,
    isPaused,
    currentGeneration,
    bestGenome,
    generationHistory,
    gamesCompleted,
    totalGamesToPlay,
    statusMessage,
    currentGameState,
    currentMatchup,
    startTraining,
    resumeSession,
    pauseTraining,
    resumeTraining,
    stopTraining,
    applyBestGenome,
    config: activeConfig,
  } = useTrainingStore();

  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG);
  const [hasExistingGenome, setHasExistingGenome] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(false);

  useEffect(() => {
    setHasExistingGenome(hasEvolvedGenome());
    setHasSavedSession(loadTrainingSession() !== null);
  }, [statusMessage]);

  const handleStart = () => {
    startTraining(config);
  };

  const handleResume = () => {
    resumeSession();
  };

  const progressPercent =
    totalGamesToPlay > 0
      ? Math.round((gamesCompleted / totalGamesToPlay) * 100)
      : 0;

  const isComplete = !isRunning && generationHistory.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link
            href="/home"
            className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Training
          </h1>
          <p className="text-gray-600">
            Evolve AI evaluation weights through genetic algorithm
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column: Config + Controls */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Configuration
              </h2>
              <div className="space-y-3">
                <ConfigField
                  label="Population Size"
                  value={config.populationSize}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, populationSize: v }))
                  }
                  min={4}
                  max={50}
                  disabled={isRunning}
                />
                <ConfigField
                  label="Generations"
                  value={config.generations}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, generations: v }))
                  }
                  min={1}
                  max={100}
                  disabled={isRunning}
                />
                <ConfigField
                  label="Games per Matchup"
                  value={config.gamesPerMatchup}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, gamesPerMatchup: v }))
                  }
                  min={1}
                  max={10}
                  disabled={isRunning}
                />
                <ConfigField
                  label="Mutation Rate"
                  value={config.mutationRate}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, mutationRate: v }))
                  }
                  min={0.01}
                  max={1}
                  step={0.01}
                  disabled={isRunning}
                />
                <ConfigField
                  label="Mutation Strength"
                  value={config.mutationStrength}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, mutationStrength: v }))
                  }
                  min={0.05}
                  max={1}
                  step={0.01}
                  disabled={isRunning}
                />
                <ConfigField
                  label="Max Moves/Game"
                  value={config.maxMovesPerGame}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxMovesPerGame: v }))
                  }
                  min={50}
                  max={2000}
                  step={50}
                  disabled={isRunning}
                />
              </div>

              {/* Controls */}
              <div className="mt-6 space-y-2">
                {!isRunning && (
                  <>
                    <button
                      onClick={handleStart}
                      className="w-full py-3 text-white font-semibold bg-green-600 rounded-lg hover:bg-green-500 transition-colors"
                    >
                      Start Training
                    </button>
                    {hasSavedSession && (
                      <button
                        onClick={handleResume}
                        className="w-full py-3 text-white font-semibold bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
                      >
                        Resume Previous Session
                      </button>
                    )}
                  </>
                )}
                {isRunning && !isPaused && (
                  <button
                    onClick={pauseTraining}
                    className="w-full py-3 text-white font-semibold bg-yellow-600 rounded-lg hover:bg-yellow-500 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {isRunning && isPaused && (
                  <button
                    onClick={resumeTraining}
                    className="w-full py-3 text-white font-semibold bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
                  >
                    Resume
                  </button>
                )}
                {isRunning && (
                  <button
                    onClick={stopTraining}
                    className="w-full py-3 text-white font-semibold bg-red-600 rounded-lg hover:bg-red-500 transition-colors"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Center column: Live game board */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl shadow p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Live Game
              </h2>
              {currentMatchup && (
                <div className="text-sm text-gray-600 mb-2">
                  <span className="font-medium">
                    #{currentMatchup.player1Index + 1}
                  </span>
                  {' vs '}
                  <span className="font-medium">
                    #{currentMatchup.player2Index + 1}
                  </span>
                  {' \u2014 '}
                  Move {currentMatchup.moveCount}
                </div>
              )}
              {currentGameState ? (
                <div className="aspect-square max-h-[50vh]">
                  <TrainingBoard gameState={currentGameState} />
                </div>
              ) : (
                <div className="aspect-square max-h-[50vh] flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  {isRunning
                    ? 'Starting next game...'
                    : 'Start training to watch AI games'}
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="bg-white rounded-xl shadow p-4 mt-4">
              <p className="text-sm text-gray-600 mb-2">{statusMessage}</p>
              {(isRunning || isComplete) && (
                <>
                  <div className="flex justify-between text-sm text-gray-500 mb-1">
                    <span>
                      Generation {currentGeneration} of{' '}
                      {activeConfig.generations}
                    </span>
                    <span>
                      {gamesCompleted} / {totalGamesToPlay} games
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="text-right text-sm text-gray-500 mt-1">
                    {progressPercent}%
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right column: Stats + Genome */}
          <div className="lg:col-span-4 space-y-6">
            {/* Generation History */}
            {generationHistory.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Generation History
                </h2>
                <div className="overflow-y-auto max-h-48">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 pr-4">Gen</th>
                        <th className="pb-2 pr-4">Best</th>
                        <th className="pb-2">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generationHistory.map((r) => (
                        <tr
                          key={r.generation}
                          className="border-b border-gray-100"
                        >
                          <td className="py-1 pr-4 font-medium">
                            {r.generation}
                          </td>
                          <td className="py-1 pr-4">
                            {r.bestFitness.toFixed(1)}
                          </td>
                          <td className="py-1">{r.avgFitness.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Best Genome */}
            {bestGenome && (
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Best Genome
                </h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <GenomeField label="Progress" value={bestGenome.progress} />
                  <GenomeField
                    label="Goal Dist"
                    value={bestGenome.goalDistance}
                  />
                  <GenomeField
                    label="Center"
                    value={bestGenome.centerControl}
                  />
                  <GenomeField label="Blocking" value={bestGenome.blocking} />
                  <GenomeField
                    label="Jump Pot"
                    value={bestGenome.jumpPotential}
                  />
                  <GenomeField
                    label="Strag Div"
                    value={bestGenome.stragglerDivisor}
                  />
                  <GenomeField
                    label="Center Val"
                    value={bestGenome.centerPieceValue}
                  />
                  <GenomeField
                    label="Block Base"
                    value={bestGenome.blockingBaseValue}
                  />
                  <GenomeField
                    label="Jump Mult"
                    value={bestGenome.jumpPotentialMultiplier}
                  />
                  <GenomeField
                    label="Jump Cap"
                    value={bestGenome.jumpPotentialCap}
                  />
                  <GenomeField
                    label="Regr Mult"
                    value={bestGenome.regressionMultiplier}
                  />
                  <GenomeField
                    label="Goal Pen"
                    value={bestGenome.goalLeavePenalty}
                  />
                  <GenomeField
                    label="Rep Pen"
                    value={bestGenome.repetitionPenalty}
                  />
                  <GenomeField
                    label="Cycle Pen"
                    value={bestGenome.cyclePenalty}
                  />
                  <GenomeField
                    label="End Thr"
                    value={bestGenome.endgameThreshold}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    onClick={applyBestGenome}
                    className="w-full py-2 text-white font-semibold rounded-lg transition-colors bg-purple-600 hover:bg-purple-500"
                  >
                    Save as Evolved AI
                  </button>
                  {hasExistingGenome && (
                    <p className="text-xs text-green-600 text-center">
                      Evolved AI saved. Best genome is auto-saved after each
                      generation.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-500"
      />
    </div>
  );
}

function GenomeField({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <div className="text-xs text-gray-500 truncate">{label}</div>
      <div className="font-mono font-medium text-gray-900 text-sm">
        {value.toFixed(2)}
      </div>
    </div>
  );
}
