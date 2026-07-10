import { describe, it, expect } from 'vitest';
import { DIFFICULTY_BUDGET } from '@/hooks/useHexChessAITurn';

describe('DIFFICULTY_BUDGET', () => {
  it('has entries for all three difficulty levels', () => {
    expect(DIFFICULTY_BUDGET).toHaveProperty('easy');
    expect(DIFFICULTY_BUDGET).toHaveProperty('medium');
    expect(DIFFICULTY_BUDGET).toHaveProperty('hard');
  });

  it('easy is nerfed with a real blunder chance and a large shuffle chance', () => {
    expect(DIFFICULTY_BUDGET.easy.blunderChance).toBeGreaterThan(0);
    expect(DIFFICULTY_BUDGET.easy.shuffleChance).toBeGreaterThan(0);
    expect(DIFFICULTY_BUDGET.easy.maxDepth).toBeLessThan(3);
  });

  it('medium has a smaller blunder chance and a moderate shuffle chance', () => {
    expect(DIFFICULTY_BUDGET.medium.blunderChance).toBeLessThan(DIFFICULTY_BUDGET.easy.blunderChance);
    expect(DIFFICULTY_BUDGET.medium.shuffleChance).toBeLessThan(DIFFICULTY_BUDGET.easy.shuffleChance);
    expect(DIFFICULTY_BUDGET.medium.maxDepth).toBeGreaterThanOrEqual(DIFFICULTY_BUDGET.easy.maxDepth);
  });

  it('hard is full strength — no blunder or shuffle chance', () => {
    expect(DIFFICULTY_BUDGET.hard.blunderChance).toBe(0);
    expect(DIFFICULTY_BUDGET.hard.shuffleChance).toBe(0);
    expect(DIFFICULTY_BUDGET.hard.maxDepth).toBeGreaterThan(DIFFICULTY_BUDGET.medium.maxDepth);
  });

  it('budgetMs and maxDepth do not decrease with difficulty', () => {
    expect(DIFFICULTY_BUDGET.easy.budgetMs).toBeLessThanOrEqual(DIFFICULTY_BUDGET.medium.budgetMs);
    expect(DIFFICULTY_BUDGET.medium.budgetMs).toBeLessThanOrEqual(DIFFICULTY_BUDGET.hard.budgetMs);
    expect(DIFFICULTY_BUDGET.easy.maxDepth).toBeLessThanOrEqual(DIFFICULTY_BUDGET.medium.maxDepth);
    expect(DIFFICULTY_BUDGET.medium.maxDepth).toBeLessThanOrEqual(DIFFICULTY_BUDGET.hard.maxDepth);
  });
});
