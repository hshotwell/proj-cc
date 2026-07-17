import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';
import { ricefishScore } from './ricefish/evaluate';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves, championGenomes, endgameGenome } = e.data;
  const state = deserializeGameState(serialized);

  let move;
  if (engine === 'ricefish-plus') {
    // Search entry doesn't accept genomes yet — follow-up plan wires it in.
    move = findRicefishPlusMove(state, difficulty, personality);
  } else if (engine === 'ricefish') {
    const g = championGenomes?.ricefish?.[personality];
    const scoreFn = g
      ? (s: Parameters<typeof ricefishScore>[0], player: Parameters<typeof ricefishScore>[1], p: Parameters<typeof ricefishScore>[2], cache?: Parameters<typeof ricefishScore>[3]) =>
          ricefishScore(s, player, p, cache, g)
      : undefined;
    move = findRicefishMove(state, difficulty, personality, scoreFn);
  } else {
    const g = championGenomes?.default?.[personality];
    move = findBestMove(state, difficulty, personality, openingMoves, g, endgameGenome);
  }

  const response: WorkerResponse = { move };
  self.postMessage(response);
};
