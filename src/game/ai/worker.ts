import type { WorkerRequest, WorkerResponse } from './workerClient';
import { deserializeGameState } from './workerClient';
import { findBestMove, setPatternCache } from './search';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { state: serialized, difficulty, personality, openingMoves, patternCache } = e.data;
  if (patternCache) setPatternCache(patternCache);
  const state = deserializeGameState(serialized);
  const move = findBestMove(state, difficulty, personality, openingMoves);
  const response: WorkerResponse = { move };
  self.postMessage(response);
};
