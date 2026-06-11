import { describe, it, expect, beforeEach } from 'vitest';
import { useReviewStore } from '@/store/reviewStore';
import type { FlaggedMove } from '@/types/review';

const baseFlag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
  gameId: 'game1',
  turnNumber: 10,
  player: 1,
  difficulty: 'hard',
  personality: 'generalist',
  piecesInGoal: 9,
  actualMove: { from: { q: 3, r: -5 }, to: { q: 2, r: -5 } },
  note: 'should have gone deeper',
  boardAfter: { pieces: { 1: [{ q: 3, r: -5 }] } },
};

beforeEach(() => {
  useReviewStore.setState({ isPaused: false, flags: [] });
});

describe('reviewStore', () => {
  it('starts unpaused with no flags', () => {
    const { isPaused, flags } = useReviewStore.getState();
    expect(isPaused).toBe(false);
    expect(flags).toHaveLength(0);
  });

  it('togglePause flips isPaused', () => {
    useReviewStore.getState().togglePause();
    expect(useReviewStore.getState().isPaused).toBe(true);
    useReviewStore.getState().togglePause();
    expect(useReviewStore.getState().isPaused).toBe(false);
  });

  it('addFlag assigns id and timestamp', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const { flags } = useReviewStore.getState();
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toMatch(/^[a-z0-9]{8}$/);
    expect(flags[0].timestamp).toBeGreaterThan(0);
  });

  it('removeFlag removes by id', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const id = useReviewStore.getState().flags[0].id;
    useReviewStore.getState().removeFlag(id);
    expect(useReviewStore.getState().flags).toHaveLength(0);
  });

  it('clearFlags empties the list', () => {
    useReviewStore.getState().addFlag(baseFlag);
    useReviewStore.getState().addFlag(baseFlag);
    useReviewStore.getState().clearFlags();
    expect(useReviewStore.getState().flags).toHaveLength(0);
  });

  it('exportText returns "(no flags recorded)" when empty', () => {
    expect(useReviewStore.getState().exportText()).toBe('(no flags recorded)');
  });

  it('exportText includes move coords and note', () => {
    useReviewStore.getState().addFlag(baseFlag);
    const text = useReviewStore.getState().exportText();
    expect(text).toContain('(3,-5) → (2,-5)');
    expect(text).toContain('should have gone deeper');
    expect(text).toContain('Turn 10');
    expect(text).toContain('9/10 in goal');
  });

  it('exportText includes suggested move when provided', () => {
    useReviewStore.getState().addFlag({
      ...baseFlag,
      suggestedMove: { from: { q: 3, r: -5 }, to: { q: 3, r: -6 } },
    });
    expect(useReviewStore.getState().exportText()).toContain('Suggested:');
    expect(useReviewStore.getState().exportText()).toContain('(3,-6)');
  });
});
