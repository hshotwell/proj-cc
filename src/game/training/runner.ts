import type { Genome } from '@/types/training';
import type { PlayerIndex } from '@/types/game';
import { createGame } from '../setup';
import { applyMove, isGameFullyOver } from '../state';
import { findBestMoveWithGenome } from './evaluate';

export interface GameResult {
  winner: 0 | 1 | null;
  totalMoves: number;
  player1Moves: number;
  player2Moves: number;
}

export function runHeadlessGame(
  genome1: Genome,
  genome2: Genome,
  maxMoves: number
): GameResult {
  let state = createGame(2);
  const players = state.activePlayers;
  const genomes: Record<number, Genome> = {
    [players[0]]: genome1,
    [players[1]]: genome2,
  };

  let totalMoves = 0;
  let player1Moves = 0;
  let player2Moves = 0;

  while (!isGameFullyOver(state) && totalMoves < maxMoves) {
    const currentPlayer = state.currentPlayer;
    const genome = genomes[currentPlayer];
    const move = findBestMoveWithGenome(state, genome);

    if (!move) break;

    state = applyMove(state, move);
    totalMoves++;

    if (currentPlayer === players[0]) {
      player1Moves++;
    } else {
      player2Moves++;
    }
  }

  let winner: 0 | 1 | null = null;
  if (state.finishedPlayers.length > 0) {
    const winnerPlayer = state.finishedPlayers[0].player;
    winner = winnerPlayer === players[0] ? 0 : 1;
  }

  return { winner, totalMoves, player1Moves, player2Moves };
}
