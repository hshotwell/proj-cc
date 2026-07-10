import { describe, it, expect } from 'vitest';
import { applyMove, pseudoMovesForPiece } from '@/game/hexchess/moves';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig, HexChessState, HexMove } from '@/game/hexchess/state';
import { cubeEquals } from '@/game/coordinates';

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

describe('applyMove', () => {
  // Soldiers in the initial layout have no non-capture moves (forward diagonal is
  // either occupied by friendly pieces or off-board). We use a bishop which has
  // clear diagonal lines from its starting position.
  it('moves piece to target and sets hasMoved', () => {
    const s0 = createInitialState(config);
    const knight = s0.pieces.find(p => p.player === 0 && p.type === 'knight')!;
    const moves = pseudoMovesForPiece(s0, knight).filter(m => m.capture === null);
    expect(moves.length).toBeGreaterThan(0);
    const s1 = applyMove(s0, moves[0]);
    const movedKnight = s1.pieces.find(p => p.id === knight.id)!;
    expect(cubeEquals(movedKnight.cell, moves[0].to)).toBe(true);
    expect(movedKnight.hasMoved).toBe(true);
  });

  it('does not mutate input state (immutability)', () => {
    const s0 = createInitialState(config);
    const knight = s0.pieces.find(p => p.player === 0 && p.type === 'knight')!;
    const originalCell = { ...knight.cell };
    const originalHasMoved = knight.hasMoved;
    const originalMoveHistory = s0.moveHistory;
    const originalCurrentPlayer = s0.currentPlayer;

    const move = pseudoMovesForPiece(s0, knight).find(m => m.capture === null)!;
    applyMove(s0, move);

    // Original state should be unchanged.
    expect(cubeEquals(knight.cell, originalCell)).toBe(true);
    expect(knight.hasMoved).toBe(originalHasMoved);
    expect(s0.moveHistory).toBe(originalMoveHistory);
    expect(s0.currentPlayer).toBe(originalCurrentPlayer);
  });

  it('advances turn: currentPlayer flips 0->1, turnNumber increments', () => {
    const s0 = createInitialState(config);
    const knight = s0.pieces.find(p => p.player === 0 && p.type === 'knight')!;
    const move = pseudoMovesForPiece(s0, knight).find(m => m.capture === null)!;
    const s1 = applyMove(s0, move);
    expect(s1.currentPlayer).toBe(1);
    expect(s1.turnNumber).toBe(2);
  });

  it('appends move to history', () => {
    const s0 = createInitialState(config);
    const knight = s0.pieces.find(p => p.player === 0 && p.type === 'knight')!;
    const move = pseudoMovesForPiece(s0, knight).find(m => m.capture === null)!;
    const s1 = applyMove(s0, move);
    expect(s1.moveHistory).toHaveLength(1);
    expect(s1.moveHistory[0]).toEqual(move);
  });

  it('removes captured piece when move.capture is set', () => {
    // Construct a state where a rook can immediately capture.
    // Simplest: use a synthesized state, not the initial position.
    const rook: HexChessState['pieces'][0] = { id: 'R', player: 0, type: 'rook', cell: { q: 0, r: 0, s: 0 }, hasMoved: false };
    const enemy: HexChessState['pieces'][0] = { id: 'E', player: 1, type: 'soldier', cell: { q: 3, r: 0, s: -3 }, hasMoved: false };
    const kingA: HexChessState['pieces'][0] = { id: 'KA', player: 0, type: 'king', cell: { q: 4, r: -4, s: 0 }, hasMoved: false };
    const kingB: HexChessState['pieces'][0] = { id: 'KB', player: 1, type: 'king', cell: { q: -4, r: 4, s: 0 }, hasMoved: false };
    const state: HexChessState = {
      mode: 'hexchess', pieces: [rook, enemy, kingA, kingB], currentPlayer: 0, turnNumber: 1,
      enPassantTarget: null, pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
    };
    const move: HexMove = {
      pieceId: 'R', from: rook.cell, to: enemy.cell,
      capture: { pieceId: 'E', cell: enemy.cell },
      promotion: null, isEnPassant: false, isDoubleStep: false,
      player: 0, turnNumber: 1,
    };
    const next = applyMove(state, move);
    expect(next.pieces.find(p => p.id === 'E')).toBeUndefined();
    const movedRook = next.pieces.find(p => p.id === 'R')!;
    expect(cubeEquals(movedRook.cell, enemy.cell)).toBe(true);
  });

  it('clears enPassantTarget after a move', () => {
    const s0 = createInitialState(config);
    // Directly set an enPassantTarget on a synthetic state.
    const synth: HexChessState = { ...s0, enPassantTarget: { capturedPieceId: 'x', targetCells: [], availableUntilTurn: 999 } };
    const knight = synth.pieces.find(p => p.player === 0 && p.type === 'knight')!;
    const move = pseudoMovesForPiece(synth, knight).find(m => m.capture === null)!;
    const next = applyMove(synth, move);
    expect(next.enPassantTarget).toBeNull();
  });
});
