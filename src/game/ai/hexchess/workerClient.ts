import type { HexChessState, HexMove } from '@/game/hexchess';
import type { SearchOptions } from './search';

export interface AnalyzeResult {
  move: HexMove | null;
  evalCp: number;
  depth: number;
  nodes: number;
}

export function createHexChessWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

export function analyzeWithWorker(
  worker: Worker,
  state: HexChessState,
  options: SearchOptions,
): Promise<AnalyzeResult> {
  return new Promise((resolve, reject) => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.type === 'result') {
        worker.removeEventListener('message', handleMessage);
        resolve({ move: data.move, evalCp: data.evalCp, depth: data.depth, nodes: data.nodes });
      }
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', (e) => {
      worker.removeEventListener('message', handleMessage);
      reject(e);
    }, { once: true });
    worker.postMessage({ type: 'analyze', state, options });
  });
}
