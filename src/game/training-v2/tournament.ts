import type { GameState, Move, PlayerIndex } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import type { DefaultGenome, RicefishGenome, RicefishPlusGenome } from './genomes';
import { createGame } from '@/game/setup';
import { applyMove, isGameFullyOver } from '@/game/state';
import { findBestMove } from '@/game/ai/search';
import { findRicefishMove } from '@/game/ai/ricefish/search';
import { findRicefishPlusMove } from '@/game/ai/ricefish-plus/search';
import { ricefishScore } from '@/game/ai/ricefish/evaluate';

export type EngineGenome =
  | { engine: 'default';        genome: DefaultGenome }
  | { engine: 'ricefish';       genome: RicefishGenome }
  | { engine: 'ricefish-plus';  genome: RicefishPlusGenome };

/**
 * Pick a move using the engine + personality specified, threading the
 * genome down into the eval where wired:
 *  - Default AI: genome flows through findBestMove's optional param,
 *    which sets the module-scope injection consumed by evaluatePosition.
 *  - Ricefish: we build a scoreFn closure that binds the genome and pass
 *    it into findRicefishMove's optional scoreFn parameter.
 *  - Ricefish+: the search entry doesn't accept genomes yet — deferred to
 *    the follow-up plan. Ricefish+ champions will still be promoted based
 *    on hard-coded-vs-hard-coded matches during this pass, which is fine
 *    because Ricefish+ is hidden from the UI today.
 */
function pickMoveFor(
  eg: EngineGenome,
  state: GameState,
  personality: AIPersonality,
): Move | null {
  switch (eg.engine) {
    case 'default':
      return findBestMove(state, 'hard', personality, undefined, eg.genome);
    case 'ricefish': {
      const g = eg.genome;
      const scoreFn = (s: GameState, player: PlayerIndex, p: AIPersonality, cache?: Parameters<typeof ricefishScore>[3]) =>
        ricefishScore(s, player, p, cache, g);
      return findRicefishMove(state, 'hard', personality, scoreFn);
    }
    case 'ricefish-plus':
      return findRicefishPlusMove(state, 'hard', personality);
  }
}

export const DEFAULT_GAME_WALL_MS = 15_000;

export function runTournamentGame(
  candidate: EngineGenome,
  opponent: EngineGenome,
  candidatePersonality: AIPersonality,
  opponentPersonality: AIPersonality,
  candidateGoesFirst: boolean,
  maxMoves: number,
  maxWallMs: number = DEFAULT_GAME_WALL_MS,
): { winner: 'candidate' | 'opponent' | null; totalMoves: number } {
  let state = createGame(2);
  const players = state.activePlayers;
  const candidateIdx = candidateGoesFirst ? players[0] : players[1];
  const opponentIdx = candidateGoesFirst ? players[1] : players[0];

  let totalMoves = 0;
  const wallDeadline = Date.now() + maxWallMs;

  while (!isGameFullyOver(state) && totalMoves < maxMoves && Date.now() < wallDeadline) {
    const currentPlayer = state.currentPlayer;
    const isCandidate = currentPlayer === candidateIdx;
    const eg = isCandidate ? candidate : opponent;
    const personality = isCandidate ? candidatePersonality : opponentPersonality;

    const move = pickMoveFor(eg, state, personality);
    if (!move) break;

    state = applyMove(state, move);
    totalMoves++;
  }

  let winner: 'candidate' | 'opponent' | null = null;
  if (state.finishedPlayers.length > 0) {
    const winnerPlayer = state.finishedPlayers[0].player;
    winner = winnerPlayer === candidateIdx ? 'candidate' : 'opponent';
  }

  return { winner, totalMoves };
}
