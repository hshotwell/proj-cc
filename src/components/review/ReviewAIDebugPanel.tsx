'use client';

import { useState } from 'react';
import { useReplayStore } from '@/store/replayStore';
import type { AIScoreBreakdown } from '@/types/game';

function formatCoord(c: { q: number; r: number }): string {
  return `(${c.q},${c.r})`;
}

const BREAKDOWN_FIELDS: Array<keyof AIScoreBreakdown> = [
  'minimaxScore',
  'evaluatePosition',
  'strategicTotal',
  'backPiecePriority',
  'chainEnablingStep',
  'frontPieceSidestep',
  'inGoalLateral',
  'samePieceMissedForward',
  'lateralReachableByForward',
  'shallowGoalEntry',
  'chainExtension',
  'goalEntryBonus',
  'chainEndpointSetup',
  'chainBackwardHop',
  'inGoalRegression',
  'makeRoomSetup',
  'lateralCohesion',
  'landingQuality',
  'leapfrogPotential',
  'residualTrajectory',
  'sourceDominance',
  'createsOpponentJump',
  'backPieceChainSetup',
  'setupBlockRisk',
  'lastMoveResponse',
  'endgameMove',
  'endgameLateral',
  'landingHopQuality',
  'bigJumpOpportunity',
  'regressionPenalty',
  'repetitionPenalty',
];

export function ReviewAIDebugPanel() {
  const { moves, currentStep } = useReplayStore();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(0);

  const currentMove = currentStep > 0 && currentStep <= moves.length
    ? moves[currentStep - 1]
    : null;

  if (!currentMove?.debug) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          AI Debug
        </h3>
        <div className="text-xs text-gray-400">
          No AI debug info for this move. (Either it&apos;s a human move, or the game was played before AI debug capture was enabled.)
        </div>
      </div>
    );
  }

  const debug = currentMove.debug;

  return (
    <div className="text-xs">
      <button
        className="w-full flex items-center justify-between text-left mb-2"
        onClick={() => setOpen(!open)}
      >
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          AI Debug ({debug.candidates.length} candidate{debug.candidates.length === 1 ? '' : 's'})
        </h3>
        <span className="text-gray-400">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <>
          <div className="mb-2 text-gray-500 text-xs flex flex-wrap gap-x-3">
            <span>Depth: <span className="font-mono">{debug.depthReached}</span></span>
            <span>Difficulty: <span className="font-mono">{debug.difficulty}</span></span>
            <span>Personality: <span className="font-mono">{debug.personality}</span></span>
            {debug.note && <span className="text-amber-700">via: {debug.note}</span>}
          </div>

          <div className="space-y-1">
            {debug.candidates.map((c, i) => (
              <div
                key={i}
                className={`border rounded overflow-hidden ${
                  c.picked ? 'border-blue-300' : 'border-gray-200'
                }`}
              >
                <button
                  className={`w-full px-2 py-1.5 flex items-center gap-2 text-left ${
                    c.picked ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
                  <span className="font-mono flex-1 text-xs">
                    {formatCoord(c.from)} → {formatCoord(c.to)}
                  </span>
                  {c.isJump && (
                    <span className="text-green-600 text-xs whitespace-nowrap">
                      {c.jumpPath && c.jumpPath.length > 1 ? `chain ×${c.jumpPath.length}` : 'jump'}
                    </span>
                  )}
                  {c.picked && (
                    <span className="text-blue-700 font-medium text-xs">PICKED</span>
                  )}
                  <span className="font-mono font-semibold text-right tabular-nums" style={{ minWidth: '4em' }}>
                    {c.finalScore.toFixed(1)}
                  </span>
                </button>

                {expanded === i && (
                  <div className="px-2 py-2 bg-gray-50 border-t border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {BREAKDOWN_FIELDS.map((field) => {
                        const value = c.breakdown[field];
                        const nonZero = Math.abs(value) >= 0.01;
                        if (!nonZero) return null;
                        return (
                          <div key={field} className="flex justify-between gap-2 text-xs">
                            <span className="text-gray-600 truncate" title={field}>
                              {field}
                            </span>
                            <span
                              className={`font-mono tabular-nums ${
                                value > 0 ? 'text-green-700' : 'text-red-700'
                              }`}
                            >
                              {value > 0 ? '+' : ''}{value.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
