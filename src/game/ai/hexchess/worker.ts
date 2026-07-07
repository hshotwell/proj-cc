/// <reference lib="webworker" />
import type { HexChessState } from '@/game/hexchess';
import { searchBestMove, type SearchOptions } from './search';

interface AnalyzeRequest {
  type: 'analyze';
  state: HexChessState;
  options: SearchOptions;
}

interface AnalyzeResponse {
  type: 'result';
  move: import('@/game/hexchess').HexMove | null;
  evalCp: number;
  depth: number;
  nodes: number;
}

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const msg = e.data;
  if (msg.type !== 'analyze') return;
  const result = searchBestMove(msg.state, msg.options);
  const response: AnalyzeResponse = {
    type: 'result',
    move: result.move,
    evalCp: result.evalCp,
    depth: result.depth,
    nodes: result.nodes,
  };
  self.postMessage(response);
};
