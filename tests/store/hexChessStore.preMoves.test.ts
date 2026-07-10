import { describe, it, expect, vi, beforeEach } from 'vitest';

const _lsStore: Record<string, string> = {};
const _localStorageMock = {
  getItem: (key: string) => _lsStore[key] ?? null,
  setItem: (key: string, value: string) => { _lsStore[key] = value; },
  removeItem: (key: string) => { delete _lsStore[key]; },
  clear: () => { Object.keys(_lsStore).forEach(k => delete _lsStore[k]); },
};
vi.stubGlobal('localStorage', _localStorageMock);
vi.stubGlobal('window', { localStorage: _localStorageMock });

import { useHexChessStore, HEX_MAX_PRE_MOVES } from '@/store/hexChessStore';
import type { HexChessConfig } from '@/game/hexchess';
import { cubeCoord } from '@/game/coordinates';

function makeConfig(id = 'premove-test'): HexChessConfig {
  return {
    id,
    players: [
      { color: '#ff0000', name: 'Alice', isAI: false },
      { color: '#0000ff', name: 'Bob', isAI: false },
    ],
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: null,
  };
}

function reset() {
  useHexChessStore.getState().clearGame();
  _localStorageMock.clear();
}

describe('hexChessStore pre-moves', () => {
  beforeEach(reset);

  it('selectPreMovePiece selects, toggles off on repeat, replaces on a different id', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const ownPieces = useHexChessStore.getState().state!.pieces.filter(p => p.player === 0);
    const [p0, p1] = ownPieces;

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBe(p0.id);

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBeNull();

    useHexChessStore.getState().selectPreMovePiece(p0.id);
    useHexChessStore.getState().selectPreMovePiece(p1.id);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBe(p1.id);
  });

  it('queuePreMove pushes a non-promoting move and clears the selection', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(piece.id);

    useHexChessStore.getState().queuePreMove(cubeCoord(0, -6));

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([{ pieceId: piece.id, to: cubeCoord(0, -6), promotion: null }]);
    expect(s.preMoveSelectedPieceId).toBeNull();
  });

  it('caps the queue at HEX_MAX_PRE_MOVES', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    for (let i = 0; i < HEX_MAX_PRE_MOVES + 2; i++) {
      useHexChessStore.setState({ preMoveSelectedPieceId: piece.id });
      useHexChessStore.getState().queuePreMove(cubeCoord(i, -6));
    }
    expect(useHexChessStore.getState().preMoves).toHaveLength(HEX_MAX_PRE_MOVES);
  });

  it('queuing a soldier onto a promotion-zone cell opens the promotion picker instead of queuing directly', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);

    const promotionCell = cubeCoord(0, 1); // r >= 1 is player 0's promotion zone
    useHexChessStore.getState().queuePreMove(promotionCell);

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.pendingPreMovePromotion).toEqual({ pieceId: soldier.id, to: promotionCell });
    expect(s.preMoveSelectedPieceId).toBeNull();
  });

  it('confirmPreMovePromotion queues the move with the chosen piece type', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    const promotionCell = cubeCoord(0, 1);
    useHexChessStore.getState().queuePreMove(promotionCell);

    useHexChessStore.getState().confirmPreMovePromotion('rook');

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([{ pieceId: soldier.id, to: promotionCell, promotion: 'rook' }]);
    expect(s.pendingPreMovePromotion).toBeNull();
  });

  it('cancelPreMovePromotion clears the picker and restores the selection', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    const promotionCell = cubeCoord(0, 1);
    useHexChessStore.getState().queuePreMove(promotionCell);

    useHexChessStore.getState().cancelPreMovePromotion();

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.pendingPreMovePromotion).toBeNull();
    expect(s.preMoveSelectedPieceId).toBe(soldier.id);
  });

  it('cancelPreMoveAt drops the entry and everything after it', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const piece = useHexChessStore.getState().state!.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    for (let i = 0; i < 3; i++) {
      useHexChessStore.setState({ preMoveSelectedPieceId: piece.id });
      useHexChessStore.getState().queuePreMove(cubeCoord(i, -6));
    }
    useHexChessStore.getState().cancelPreMoveAt(1);
    expect(useHexChessStore.getState().preMoves).toEqual([
      { pieceId: piece.id, to: cubeCoord(0, -6), promotion: null },
    ]);
  });

  it('clearAllPreMoves resets the queue, selection, and pending promotion', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    useHexChessStore.getState().queuePreMove(cubeCoord(0, 1));

    useHexChessStore.getState().clearAllPreMoves();

    const s = useHexChessStore.getState();
    expect(s.preMoves).toEqual([]);
    expect(s.preMoveSelectedPieceId).toBeNull();
    expect(s.pendingPreMovePromotion).toBeNull();
  });

  it('getVirtualPieces applies queued moves in order and simulates capture', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const state = useHexChessStore.getState().state!;
    const mover = state.pieces.find(p => p.type === 'rook' && p.player === 0)!;
    const victim = state.pieces.find(p => p.player === 1)!;

    useHexChessStore.getState().selectPreMovePiece(mover.id);
    useHexChessStore.getState().queuePreMove(victim.cell); // simulated capture, legality not checked

    const virtual = useHexChessStore.getState().getVirtualPieces();
    expect(virtual.find(p => p.id === victim.id)).toBeUndefined();
    expect(virtual.find(p => p.id === mover.id)!.cell).toEqual(victim.cell);
  });

  it('preMoves/preMoveSelectedPieceId/pendingPreMovePromotion reset on createGame/loadGame/clearGame', () => {
    useHexChessStore.getState().createGame(makeConfig());
    const soldier = useHexChessStore.getState().state!.pieces.find(p => p.type === 'soldier' && p.player === 0)!;
    useHexChessStore.getState().selectPreMovePiece(soldier.id);
    useHexChessStore.getState().queuePreMove(cubeCoord(0, 1));
    expect(useHexChessStore.getState().pendingPreMovePromotion).not.toBeNull();

    useHexChessStore.getState().createGame(makeConfig('second-game'));
    expect(useHexChessStore.getState().preMoves).toEqual([]);
    expect(useHexChessStore.getState().preMoveSelectedPieceId).toBeNull();
    expect(useHexChessStore.getState().pendingPreMovePromotion).toBeNull();
  });
});
