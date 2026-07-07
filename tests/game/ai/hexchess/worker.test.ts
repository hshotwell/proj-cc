import { describe, it, expect } from 'vitest';
import { analyzeWithWorker } from '@/game/ai/hexchess/workerClient';

class MockWorker {
  private listeners = new Map<string, Set<(e: any) => void>>();
  postedMessages: any[] = [];

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(msg: any) {
    this.postedMessages.push(msg);
    // Simulate worker sending back a result asynchronously
    setTimeout(() => {
      const listeners = this.listeners.get('message');
      if (listeners) {
        for (const l of listeners) {
          l({ data: { type: 'result', move: null, evalCp: 42, depth: 3, nodes: 100 } });
        }
      }
    }, 0);
  }

  terminate() {}
}

describe('analyzeWithWorker', () => {
  it('resolves with the worker response', async () => {
    const w = new MockWorker() as unknown as Worker;
    const result = await analyzeWithWorker(w, {} as any, { budgetMs: 1000, maxDepth: 3 });
    expect(result.evalCp).toBe(42);
    expect(result.depth).toBe(3);
    expect(result.nodes).toBe(100);
    expect(result.move).toBeNull();
  });

  it('posts the analyze message to the worker', async () => {
    const w = new MockWorker() as unknown as Worker;
    const mock = w as unknown as MockWorker;
    await analyzeWithWorker(w, {} as any, { budgetMs: 500, maxDepth: 2 });
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0].type).toBe('analyze');
    expect(mock.postedMessages[0].options).toEqual({ budgetMs: 500, maxDepth: 2 });
  });
});
