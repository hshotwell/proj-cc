import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, MAX_PRE_MOVES } from '@/store/gameStore';
import { cubeCoord, coordKey } from '@/game/coordinates';

function reset() {
  useGameStore.getState().startGame(2);
  // Drain the store's pre-move state (startGame already does, but be explicit)
  useGameStore.setState({ preMoves: [], preMoveSelectedFrom: null });
}

describe('gameStore pre-moves', () => {
  beforeEach(() => {
    reset();
  });

  it('selecting a piece stores it as preMoveSelectedFrom', () => {
    const coord = cubeCoord(0, 0);
    useGameStore.getState().selectPreMovePiece(coord);
    expect(useGameStore.getState().preMoveSelectedFrom).toEqual(coord);
  });

  it('selecting the same piece again cancels selection', () => {
    const coord = cubeCoord(0, 0);
    useGameStore.getState().selectPreMovePiece(coord);
    useGameStore.getState().selectPreMovePiece(coord);
    expect(useGameStore.getState().preMoveSelectedFrom).toBeNull();
  });

  it('selecting a different piece replaces the selection', () => {
    const a = cubeCoord(0, 0);
    const b = cubeCoord(1, 0);
    useGameStore.getState().selectPreMovePiece(a);
    useGameStore.getState().selectPreMovePiece(b);
    expect(useGameStore.getState().preMoveSelectedFrom).toEqual(b);
  });

  it('queuePreMove appends a QueuedPreMove and clears the selection', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(0, 1);
    useGameStore.getState().selectPreMovePiece(from);
    useGameStore.getState().queuePreMove(to);
    const s = useGameStore.getState();
    expect(s.preMoveSelectedFrom).toBeNull();
    expect(s.preMoves).toHaveLength(1);
    expect(s.preMoves[0]).toEqual({ from, to });
  });

  it('queuePreMove is a no-op when no selection is set', () => {
    useGameStore.getState().queuePreMove(cubeCoord(0, 1));
    expect(useGameStore.getState().preMoves).toHaveLength(0);
  });

  it('queuePreMove enforces a cap of MAX_PRE_MOVES', () => {
    for (let i = 0; i < MAX_PRE_MOVES + 2; i++) {
      useGameStore.getState().selectPreMovePiece(cubeCoord(i, 0));
      useGameStore.getState().queuePreMove(cubeCoord(i, 1));
    }
    expect(useGameStore.getState().preMoves).toHaveLength(MAX_PRE_MOVES);
  });

  it('cancelPreMoveAt(i) drops preMoves[i..end]', () => {
    for (let i = 0; i < 4; i++) {
      useGameStore.getState().selectPreMovePiece(cubeCoord(i, 0));
      useGameStore.getState().queuePreMove(cubeCoord(i, 1));
    }
    useGameStore.getState().cancelPreMoveAt(1);
    expect(useGameStore.getState().preMoves).toHaveLength(1);
  });

  it('clearAllPreMoves drops queue and selection', () => {
    useGameStore.getState().selectPreMovePiece(cubeCoord(0, 0));
    useGameStore.getState().queuePreMove(cubeCoord(0, 1));
    useGameStore.getState().selectPreMovePiece(cubeCoord(1, 0));
    useGameStore.getState().clearAllPreMoves();
    const s = useGameStore.getState();
    expect(s.preMoves).toHaveLength(0);
    expect(s.preMoveSelectedFrom).toBeNull();
  });

  it('cancelPreMoveSelection clears only the selection, not the queue', () => {
    useGameStore.getState().selectPreMovePiece(cubeCoord(0, 0));
    useGameStore.getState().queuePreMove(cubeCoord(0, 1));
    useGameStore.getState().selectPreMovePiece(cubeCoord(1, 0));
    useGameStore.getState().cancelPreMoveSelection();
    const s = useGameStore.getState();
    expect(s.preMoves).toHaveLength(1);
    expect(s.preMoveSelectedFrom).toBeNull();
  });

  it('getVirtualBoard applies queued moves in order', () => {
    const state = useGameStore.getState().gameState!;
    // Pick a real player-0 piece from the initial board
    let player0Piece: { q: number; r: number; s: number } | null = null;
    for (const [key, cell] of state.board) {
      if (cell.type === 'piece' && cell.player === 0) {
        const [q, r] = key.split(',').map(Number);
        player0Piece = { q, r, s: -q - r };
        break;
      }
    }
    expect(player0Piece).not.toBeNull();

    // Find an empty cell to move to
    let emptyCell: { q: number; r: number; s: number } | null = null;
    for (const [key, cell] of state.board) {
      if (cell.type === 'empty') {
        const [q, r] = key.split(',').map(Number);
        emptyCell = { q, r, s: -q - r };
        break;
      }
    }
    expect(emptyCell).not.toBeNull();

    useGameStore.getState().selectPreMovePiece(player0Piece!);
    useGameStore.getState().queuePreMove(emptyCell!);

    const vb = useGameStore.getState().getVirtualBoard();
    expect(vb.get(coordKey(player0Piece!))?.type).toBe('empty');
    const landed = vb.get(coordKey(emptyCell!));
    expect(landed?.type).toBe('piece');
    if (landed?.type === 'piece') {
      expect(landed.player).toBe(0);
    }
  });

  it('undoLastMove clears the pre-move queue', () => {
    // Seed a pending move so undoLastMove has something to restore
    const state = useGameStore.getState().gameState!;
    // Find a legal step for player 0 to create pending state
    const { makeMove, selectPiece } = useGameStore.getState();
    let piece: { q: number; r: number; s: number } | null = null;
    for (const [key, cell] of state.board) {
      if (cell.type === 'piece' && cell.player === 0) {
        const [q, r] = key.split(',').map(Number);
        piece = { q, r, s: -q - r };
        break;
      }
    }
    selectPiece(piece!);
    const validMoves = useGameStore.getState().validMovesForSelected;
    if (validMoves.length === 0) return; // Skip if no legal move (unlikely)
    makeMove(validMoves[0].to, false);

    // Now push a fake pre-move queue and undo
    useGameStore.setState({
      preMoves: [{ from: cubeCoord(0, 0), to: cubeCoord(0, 1) }],
      preMoveSelectedFrom: cubeCoord(2, 0),
    });
    useGameStore.getState().undoLastMove();
    const s = useGameStore.getState();
    expect(s.preMoves).toHaveLength(0);
    expect(s.preMoveSelectedFrom).toBeNull();
  });

  it('startGame clears queued pre-moves and selection', () => {
    useGameStore.setState({
      preMoves: [{ from: cubeCoord(0, 0), to: cubeCoord(0, 1) }],
      preMoveSelectedFrom: cubeCoord(2, 0),
    });
    useGameStore.getState().startGame(2);
    const s = useGameStore.getState();
    expect(s.preMoves).toHaveLength(0);
    expect(s.preMoveSelectedFrom).toBeNull();
  });
});
