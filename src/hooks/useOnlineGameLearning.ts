'use client';

import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { reconstructGameState } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';
import { extractGamePatterns, createGameSummary } from '@/game/learning/patternExtractor';
import { learnFromGame } from '@/game/learning/learningStore';
import { clearWeightsCache } from '@/game/learning/learnedEvaluator';
import { clearSharedInsightsCache } from '@/hooks/useSharedInsights';

/**
 * Hook to learn from finished online games.
 * When an online game finishes, extracts patterns and:
 * 1. Feeds into local learning pipeline (localStorage)
 * 2. Submits insights to the shared server pool
 */
export function useOnlineGameLearning(
  gameId: Id<"onlineGames">,
  onlineGame: any | null | undefined
) {
  const hasExtracted = useRef(false);
  const submitInsights = useMutation(api.learning.submitGameInsights);

  useEffect(() => {
    if (!onlineGame || onlineGame.status !== 'finished' || hasExtracted.current) {
      return;
    }

    // Only extract once per game
    hasExtracted.current = true;

    try {
      // Reconstruct the final game state
      const finalState = reconstructGameState(onlineGame as unknown as OnlineGameData);

      if (finalState.winner === null) {
        // No winner — not useful for learning
        return;
      }

      // Extract patterns
      const patterns = extractGamePatterns(finalState, gameId);
      const summary = createGameSummary(patterns);

      // Feed into local learning
      learnFromGame(summary);
      clearWeightsCache();

      console.log(
        '[OnlineGameLearning] Extracted patterns from game',
        gameId,
        '- winner moves:',
        patterns.winnerMoveCount,
        '- endgame metrics:',
        patterns.endgameMetrics ? 'yes' : 'no'
      );

      // Submit to server shared pool
      const winnerMetrics = patterns.playerMetrics[patterns.winner!];
      if (winnerMetrics) {
        void submitInsights({
          gameId,
          playerCount: patterns.playerCount,
          winnerMoveCount: patterns.winnerMoveCount,
          winnerMetrics,
          endgameMetrics: patterns.endgameMetrics,
        }).then(() => {
          console.log('[OnlineGameLearning] Submitted insights to server');
          clearSharedInsightsCache();
        }).catch((e) => {
          console.warn('[OnlineGameLearning] Failed to submit insights:', e);
        });
      }
    } catch (e) {
      console.error('[OnlineGameLearning] Failed to extract patterns:', e);
    }
  }, [onlineGame?.status, gameId, submitInsights, onlineGame]);
}
