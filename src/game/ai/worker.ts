import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';
import { findRicefishMove } from './ricefish/search';
import { findRicefishPlusMove } from './ricefish-plus/search';

// Received per-request; stored for the follow-up plan that threads
// genomes through the search entry points. No behavioral use yet.
let receivedGenomes: WorkerRequest['championGenomes'] = undefined;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, engine, openingMoves, championGenomes } = e.data;
  receivedGenomes = championGenomes;
  void receivedGenomes; // silence unused warning; consumed in follow-up plan
  const state = deserializeGameState(serialized);
  const move =
    engine === 'ricefish-plus' ? findRicefishPlusMove(state, difficulty, personality) :
    engine === 'ricefish'      ? findRicefishMove(state, difficulty, personality) :
                                 findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
