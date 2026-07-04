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
