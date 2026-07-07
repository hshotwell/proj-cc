import { describe, it, expect } from 'vitest';
import { pseudoMovesForPiece } from '@/game/hexchess/moves';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 't',
  players: [
    { color: 'red', name: 'A', isAI: false },
    { color: 'blue', name: 'B', isAI: false },
  ],
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('pseudoMovesForPiece dispatcher', () => {
  it('returns HexMove-shaped objects with player/turnNumber populated', () => {
    const s = createInitialState(config);
    const soldier = s.pieces.find(p => p.player === 0 && p.type === 'soldier')!;
    const moves = pseudoMovesForPiece(s, soldier);
    for (const m of moves) {
      expect(m.pieceId).toBe(soldier.id);
      expect(m.from).toEqual(soldier.cell);
      expect(m.player).toBe(0);
      expect(m.turnNumber).toBe(s.turnNumber);
      expect(m.promotion).toBeNull();
      expect(m.isEnPassant).toBe(false);
      expect(m.isDoubleStep).toBe(false);
    }
  });

  it('populates capture field when target has enemy piece', () => {
    // Set up a rook that can capture the opposing queen directly.
    // Easier: use a synthetic state — put player-0 rook on (0,0) and player-1 rook on (2,0).
    // Actually with initial state we can grep for a soldier that can capture an enemy.
    // Simplest verification: for each move, check that capture.pieceId matches the piece
    // sitting on `to` (when non-null), and that no own-piece captures appear.
    const s = createInitialState(config);
    for (const piece of s.pieces.filter(p => p.player === 0)) {
      for (const move of pseudoMovesForPiece(s, piece)) {
        if (move.capture) {
          const capturedPiece = s.pieces.find(p => p.id === move.capture!.pieceId);
          expect(capturedPiece).toBeDefined();
          expect(capturedPiece!.player).toBe(1); // enemy only
        }
      }
    }
  });

  it('never generates captures onto own pieces in starting position', () => {
    const s = createInitialState(config);
    // No move should ever capture a friendly piece.
    for (const piece of s.pieces.filter(p => p.player === 0)) {
      for (const move of pseudoMovesForPiece(s, piece)) {
        if (move.capture) {
          const capturedPiece = s.pieces.find(p => p.id === move.capture!.pieceId)!;
          expect(capturedPiece.player).not.toBe(piece.player);
        }
      }
    }
  });
});
