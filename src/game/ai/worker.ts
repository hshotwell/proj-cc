import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves } = e.data;
  const state = deserializeGameState(serialized);
  const move =
    engine === 'ricefish-plus' ? findRicefishPlusMove(state, difficulty, personality) :
    engine === 'ricefish'      ? findRicefishMove(state, difficulty, personality) :
                                 findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
