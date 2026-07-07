import { describe, it, expect } from 'vitest';
import { DIFFICULTY_BUDGET } from '@/hooks/useHexChessAITurn';

describe('DIFFICULTY_BUDGET', () => {
  it('has entries for all three difficulty levels', () => {
    expect(DIFFICULTY_BUDGET).toHaveProperty('easy');
    expect(DIFFICULTY_BUDGET).toHaveProperty('medium');
    expect(DIFFICULTY_BUDGET).toHaveProperty('hard');
  });

  it('easy has a short budget and shallow depth', () => {
    expect(DIFFICULTY_BUDGET.easy.budgetMs).toBe(300);
    expect(DIFFICULTY_BUDGET.easy.maxDepth).toBe(2);
  });

  it('medium has a moderate budget and depth', () => {
    expect(DIFFICULTY_BUDGET.medium.budgetMs).toBe(2000);
    expect(DIFFICULTY_BUDGET.medium.maxDepth).toBe(4);
  });

  it('hard has the longest budget and deepest search', () => {
    expect(DIFFICULTY_BUDGET.hard.budgetMs).toBe(8000);
    expect(DIFFICULTY_BUDGET.hard.maxDepth).toBe(6);
  });

  it('budgetMs and maxDepth increase with difficulty', () => {
    expect(DIFFICULTY_BUDGET.easy.budgetMs).toBeLessThan(DIFFICULTY_BUDGET.medium.budgetMs);
    expect(DIFFICULTY_BUDGET.medium.budgetMs).toBeLessThan(DIFFICULTY_BUDGET.hard.budgetMs);
    expect(DIFFICULTY_BUDGET.easy.maxDepth).toBeLessThan(DIFFICULTY_BUDGET.medium.maxDepth);
    expect(DIFFICULTY_BUDGET.medium.maxDepth).toBeLessThan(DIFFICULTY_BUDGET.hard.maxDepth);
  });
});
