import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove } from './search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, openingId } = e.data;
  const state = deserializeGameState(serialized);
  const move = findBestMove(state, difficulty, personality, openingId);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
