import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_BUDGET,
  maxCaptureAvailable,
  maxHangingOwnValue,
  tacticalSuppression,
} from '@/hooks/useHexChessAITurn';
import { legalMoves } from '@/game/hexchess';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

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

function stateWith(pieces: HexPiece[], currentPlayer: 0 | 1 = 0): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

function piece(id: string, player: 0 | 1, type: HexPiece['type'], q: number, r: number): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

describe('maxCaptureAvailable', () => {
  it('is 0 when no legal move captures anything', () => {
    const s = stateWith([piece('k0', 0, 'king', 0, 0), piece('k1', 1, 'king', 5, 5)]);
    expect(maxCaptureAvailable(s, legalMoves(s))).toBe(0);
  });

  it('returns the value of the highest-value capturable piece', () => {
    // Rook at (0,0) can capture a queen sitting on its file at (3,0).
    const s = stateWith([
      piece('k0', 0, 'king', -5, -5),
      piece('r0', 0, 'rook', 0, 0),
      piece('q1', 1, 'queen', 3, 0),
      piece('k1', 1, 'king', 5, 5),
    ]);
    expect(maxCaptureAvailable(s, legalMoves(s))).toBe(900);
  });
});

describe('maxHangingOwnValue', () => {
  it('is 0 when nothing of the mover\'s is hanging', () => {
    const s = stateWith([piece('k0', 0, 'king', 0, 0), piece('k1', 1, 'king', 5, 5)]);
    expect(maxHangingOwnValue(s, 0)).toBe(0);
  });

  it('reports the value of an undefended piece under attack', () => {
    // Player 0's queen sits on player 1's rook file, undefended.
    const s = stateWith([
      piece('k0', 0, 'king', -5, -5),
      piece('q0', 0, 'queen', 3, 0),
      piece('r1', 1, 'rook', 0, 0),
      piece('k1', 1, 'king', 5, 5),
    ]);
    expect(maxHangingOwnValue(s, 0)).toBe(900);
  });

  it('is 0 when the attacked piece is defended', () => {
    const s = stateWith([
      piece('k0', 0, 'king', -5, -5),
      piece('q0', 0, 'queen', 3, 0),
      piece('defender0', 0, 'rook', 3, -3),
      piece('r1', 1, 'rook', 0, 0),
      piece('k1', 1, 'king', 5, 5),
    ]);
    expect(maxHangingOwnValue(s, 0)).toBe(0);
  });
});

describe('tacticalSuppression', () => {
  it('is 1 (no suppression) with no tactical weight', () => {
    expect(tacticalSuppression(0)).toBe(1);
  });

  it('scales down as tactical weight increases toward a queen\'s value', () => {
    const pawnWeight = tacticalSuppression(100);
    const rookWeight = tacticalSuppression(500);
    const queenWeight = tacticalSuppression(900);
    expect(pawnWeight).toBeLessThan(1);
    expect(rookWeight).toBeLessThan(pawnWeight);
    expect(queenWeight).toBeLessThan(rookWeight);
  });

  it('floors out at MIN_SUPPRESSION once weight reaches a queen\'s value', () => {
    const atQueen = tacticalSuppression(900);
    const beyond = tacticalSuppression(5000);
    expect(atQueen).toBeCloseTo(beyond, 5);
    expect(atQueen).toBeGreaterThan(0);
    expect(atQueen).toBeLessThan(0.1);
  });
});
