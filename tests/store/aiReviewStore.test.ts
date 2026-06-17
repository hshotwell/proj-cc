import { describe, it, expect, beforeEach } from 'vitest';
import { useAIReviewStore } from '@/store/aiReviewStore';
import type { FlaggedMove } from '@/types/review';

const baseFlag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
  gameId: 'g1',
  turnNumber: 10,
  player: 1,
  difficulty: 'hard',
  personality: 'generalist',
  piecesInGoal: 9,
  actualMove: { from: { q: 3, r: -5 }, to: { q: 2, r: -5 } },
  note: 'bad move',
  boardAfter: { pieces: { 1: [{ q: 3, r: -5 }] } },
};

beforeEach(() => {
  useAIReviewStore.setState({
    captureMode: null,
    captureFrom: null,
    captureTo: null,
    flags: [],
    activeGameId: null,
  });
});

describe('captureCell state machine', () => {
  it('startCapture → captureCell(from) → captureCell(to) → done', () => {
    useAIReviewStore.getState().startCapture();
    expect(useAIReviewStore.getState().captureMode).toBe('from');

    const c1 = { q: 1, r: -2, s: 1 };
    useAIReviewStore.getState().captureCell(c1);
    expect(useAIReviewStore.getState().captureMode).toBe('to');
    expect(useAIReviewStore.getState().captureFrom).toEqual(c1);

    const c2 = { q: 2, r: -3, s: 1 };
    useAIReviewStore.getState().captureCell(c2);
    expect(useAIReviewStore.getState().captureMode).toBeNull();
    expect(useAIReviewStore.getState().captureTo).toEqual(c2);
  });

  it('captureCell does nothing when captureMode is null', () => {
    useAIReviewStore.getState().captureCell({ q: 0, r: 0, s: 0 });
    expect(useAIReviewStore.getState().captureFrom).toBeNull();
  });

  it('cancelCapture resets all capture state', () => {
    useAIReviewStore.getState().startCapture();
    useAIReviewStore.getState().captureCell({ q: 1, r: 0, s: -1 });
    useAIReviewStore.getState().cancelCapture();
    const s = useAIReviewStore.getState();
    expect(s.captureMode).toBeNull();
    expect(s.captureFrom).toBeNull();
    expect(s.captureTo).toBeNull();
  });
});

describe('flags', () => {
  it('addFlag assigns id (UUID) and timestamp', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const { flags } = useAIReviewStore.getState();
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('removeFlag removes by id', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    useAIReviewStore.getState().removeFlag(id);
    expect(useAIReviewStore.getState().flags).toHaveLength(0);
  });

  it('clearFlags empties list', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().clearFlags();
    expect(useAIReviewStore.getState().flags).toHaveLength(0);
  });
});

describe('exportText', () => {
  it('returns sentinel when no flags', () => {
    expect(useAIReviewStore.getState().exportText()).toBe('(no flags recorded)');
  });

  it('includes move coords and note', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('(3,-5) → (2,-5)');
    expect(text).toContain('bad move');
    expect(text).toContain('Turn 10');
    expect(text).toContain('9/10 in goal');
  });

  it('includes suggested move when present', () => {
    useAIReviewStore.getState().addFlag({
      ...baseFlag,
      suggestedMove: { from: { q: 3, r: -5 }, to: { q: 3, r: -6 } },
    });
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('Suggested:');
    expect(text).toContain('(3,-6)');
  });
});

describe('activeGameId', () => {
  it('setActiveGameId sets and clears activeGameId', () => {
    useAIReviewStore.getState().setActiveGameId('game-abc');
    expect(useAIReviewStore.getState().activeGameId).toBe('game-abc');
    useAIReviewStore.getState().setActiveGameId(null);
    expect(useAIReviewStore.getState().activeGameId).toBeNull();
  });
});

describe('updateFlag', () => {
  it('patches note on an existing flag', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    useAIReviewStore.getState().updateFlag(id, { note: 'updated note' });
    expect(useAIReviewStore.getState().flags[0].note).toBe('updated note');
  });

  it('patches suggestedMove on an existing flag', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    const id = useAIReviewStore.getState().flags[0].id;
    const suggested = { from: { q: 1, r: -2 }, to: { q: 2, r: -3 } };
    useAIReviewStore.getState().updateFlag(id, { suggestedMove: suggested });
    expect(useAIReviewStore.getState().flags[0].suggestedMove).toEqual(suggested);
  });

  it('does nothing for unknown id', () => {
    useAIReviewStore.getState().addFlag(baseFlag);
    useAIReviewStore.getState().updateFlag('nonexistent', { note: 'x' });
    expect(useAIReviewStore.getState().flags[0].note).toBe('bad move');
  });
});

describe('exportText with gameId filter', () => {
  it('returns sentinel when no flags match gameId', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'other-game' });
    expect(useAIReviewStore.getState().exportText('g1')).toBe('(no flags recorded)');
  });

  it('filters to matching gameId only', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g1' });
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g2', note: 'other game' });
    const text = useAIReviewStore.getState().exportText('g1');
    expect(text).toContain('bad move');
    expect(text).not.toContain('other game');
  });

  it('exports all flags when no gameId provided (backward compat)', () => {
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g1' });
    useAIReviewStore.getState().addFlag({ ...baseFlag, gameId: 'g2', note: 'other' });
    const text = useAIReviewStore.getState().exportText();
    expect(text).toContain('bad move');
    expect(text).toContain('other');
  });
});
