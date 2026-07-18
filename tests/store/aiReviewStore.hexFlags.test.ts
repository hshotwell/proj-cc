import { describe, it, expect, beforeEach } from 'vitest';
import { useAIReviewStore } from '@/store/aiReviewStore';

const sampleFlag = {
  gameId: 'g1',
  moveIndex: 4,
  turnNumber: 3,
  seat: 2,
  difficulty: 'hard',
  actualMove: { pieceType: 'knight', from: { q: 1, r: 2 }, to: { q: 2, r: 1 }, capture: 'pawn', promotion: null },
  suggestedMove: { from: { q: 0, r: 3 }, to: { q: 2, r: 1 } },
  note: 'hangs the knight',
  boardAfter: { pieces: { '2,1': { player: 2, type: 'knight' }, '0,0': { player: 0, type: 'king' } } },
};

describe('aiReviewStore hex flags', () => {
  beforeEach(() => {
    useAIReviewStore.setState({ flags: [], hexFlags: [] });
  });

  it('adds, updates, and removes hex flags', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    const flags = useAIReviewStore.getState().hexFlags;
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBeTruthy();
    useAIReviewStore.getState().updateHexFlag(flags[0].id, { note: 'better: fork' });
    expect(useAIReviewStore.getState().hexFlags[0].note).toBe('better: fork');
    useAIReviewStore.getState().removeHexFlag(flags[0].id);
    expect(useAIReviewStore.getState().hexFlags).toHaveLength(0);
  });

  it('exports hex flags with piece-typed board snapshot', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    const text = useAIReviewStore.getState().exportHexText('g1');
    expect(text).toContain('HEX CHESS');
    expect(text).toContain('knight (1,2) → (2,1) x pawn');
    expect(text).toContain('Suggested:');
    expect(text).toContain('(2,1): P2 knight');
    expect(text).toContain('hangs the knight');
  });

  it('filters the export by game id', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    expect(useAIReviewStore.getState().exportHexText('other-game')).toBe('(no flags recorded)');
  });

  it('does not mix hex flags into the sternhalma export', () => {
    useAIReviewStore.getState().addHexFlag(sampleFlag);
    expect(useAIReviewStore.getState().exportText('g1')).toContain('(no flags recorded)');
  });
});
