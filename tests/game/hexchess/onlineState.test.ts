import { describe, it, expect } from 'vitest';
import {
  buildHexConfigFromOnline, reconstructHexChessOnline,
  serializeHexMove, applyResign,
  type OnlineHexGameData, type OnlineHexTurn,
} from '@/game/hexchess/onlineState';
import { createInitialState, applyMove, legalMoves, confirmPromotion } from '@/game/hexchess';
import type { HexMove } from '@/game/hexchess';
import type { OnlinePlayerSlot } from '@/game/onlineState';
import type { BoardLayout } from '@/types/game';
import { coordKey } from '@/game/coordinates';

function slots(n: number, aiSlots: number[] = []): OnlinePlayerSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i,
    type: aiSlots.includes(i) ? ('ai' as const) : ('human' as const),
    userId: aiSlots.includes(i) ? undefined : `user-${i}`,
    username: aiSlots.includes(i) ? undefined : `Player ${i}`,
    color: ['#ffffff', '#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#a855f7'][i],
    ...(aiSlots.includes(i) ? { aiConfig: { difficulty: 'medium', personality: 'generalist' } } : {}),
    isReady: true,
  }));
}

function baseData(n: number, aiSlots: number[] = []): OnlineHexGameData {
  return {
    _id: 'game123', hostId: 'user-0', status: 'playing',
    playerCount: n, players: slots(n, aiSlots), turns: [],
    gameType: 'hexchess', currentPlayerIndex: 0,
  };
}

// Deterministic move picker: first legal move sorted by (pieceId, to).
function pickMove(moves: HexMove[]): HexMove {
  return [...moves].sort((a, b) =>
    (a.pieceId + `|${a.to.q},${a.to.r}`).localeCompare(b.pieceId + `|${b.to.q},${b.to.r}`)
  )[0];
}

// Small hex patch used by the promotion layout (radius-4 hexagon).
const patchCells: string[] = [];
for (let q = -4; q <= 4; q++) {
  for (let r = -4; r <= 4; r++) {
    if (Math.abs(-q - r) <= 4) patchCells.push(`${q},${r}`);
  }
}

// Custom board whose army 0 pawn starts one edge-step from its promotion tile.
// Army 0 centroid (0,0) -> promo centroid (4,0): edge forward (1,0) => pawns.
const promoLayout: BoardLayout = {
  id: 'promo-board',
  name: 'Promo Board',
  createdAt: 0,
  cells: patchCells,
  startingPositions: {},
  gameMode: 'hexchess',
  hexPieces: {
    '-3,0': { player: 0, type: 'king' },
    '3,0': { player: 0, type: 'pawn' },
    '0,2': { player: 2, type: 'king' },
    '2,2': { player: 2, type: 'pawn' },
  },
  promotionPositions: { 0: ['4,0'], 2: ['2,-2', '4,-2'] },
  promotionOptions: ['queen', 'rook', 'bishop', 'knight'],
};

describe('buildHexConfigFromOnline', () => {
  it('maps slots to standard-board seats with colors, names, and AI', () => {
    const config = buildHexConfigFromOnline(baseData(2, [1]));
    expect(config.seats).toEqual([0, 2]); // ACTIVE_PLAYERS[2]
    expect(config.players[0]!.name).toBe('Player 0');
    expect(config.players[0]!.color).toBe('#ffffff');
    expect(config.players[2]!.isAI).toBe(true);
    expect(config.ai).toEqual({ 2: 'medium' });
    expect(config.layout).toBeUndefined();
    expect(config.layoutPreset).toBe('v1-default');
  });

  it('uses the Traditional built-in board seats when selectedBuiltinLayoutId is set', () => {
    const config = buildHexConfigFromOnline({
      ...baseData(2), selectedBuiltinLayoutId: 'builtin-traditional-hexchess',
    });
    expect(config.seats).toEqual([0, 4]); // Traditional armies
    expect(config.layout).toBeDefined();
    expect(config.layoutPreset).toBe('custom');
  });

  it('uses the custom layout armies when customLayout is set', () => {
    const config = buildHexConfigFromOnline({ ...baseData(2), customLayout: promoLayout });
    expect(config.seats).toEqual([0, 2]);
    expect(config.layout?.layoutId).toBe('promo-board');
  });
});

describe('reconstructHexChessOnline', () => {
  it('round-trips a sequence of played moves', () => {
    const data = baseData(2);
    const config = buildHexConfigFromOnline(data);
    let local = createInitialState(config);
    const turns: OnlineHexTurn[] = [];
    for (let i = 0; i < 8; i++) {
      const move = pickMove(legalMoves(local));
      const slotIndex = config.seats.indexOf(move.player);
      local = applyMove(local, move);
      turns.push({ playerIndex: slotIndex, moves: serializeHexMove(move) });
    }
    const { state } = reconstructHexChessOnline({ ...data, turns });
    expect(state.moveHistory.length).toBe(8);
    expect(state.currentPlayer).toBe(local.currentPlayer);
    expect(state.pieces).toEqual(local.pieces);
    expect(state.result).toEqual(local.result);
  });

  it('applies recorded promotions during replay', () => {
    const data: OnlineHexGameData = { ...baseData(2), customLayout: promoLayout };
    const config = buildHexConfigFromOnline(data);
    let local = createInitialState(config);

    const promoting = legalMoves(local).find(
      (m) => coordKey(m.to) === '4,0' && m.pieceId.includes('pawn'),
    );
    expect(promoting).toBeDefined();
    local = applyMove(local, promoting!);
    expect(local.pendingPromotion).not.toBeNull();
    local = confirmPromotion(local, 'queen');

    // The store records promotion on the last history entry after confirm.
    const recorded = local.moveHistory[local.moveHistory.length - 1];
    expect(recorded.promotion).toBe('queen');

    const turns: OnlineHexTurn[] = [
      { playerIndex: config.seats.indexOf(recorded.player), moves: serializeHexMove(recorded) },
    ];
    const { state } = reconstructHexChessOnline({ ...data, turns });
    const promoted = state.pieces.find((p) => p.id === recorded.pieceId);
    expect(promoted?.type).toBe('queen');
    expect(state.pendingPromotion).toBeNull();
    expect(state.currentPlayer).toBe(2);
  });

  it('throws on an illegal turn payload', () => {
    const data = baseData(2);
    expect(() => reconstructHexChessOnline({
      ...data,
      turns: [{ playerIndex: 0, moves: { kind: 'move', pieceId: 'nope', from: '0,0', to: '1,1', promotion: null } }],
    })).toThrow();
  });

  it('replays a resign turn (2p: resignation result)', () => {
    const data = baseData(2);
    const { state } = reconstructHexChessOnline({
      ...data, turns: [{ playerIndex: 1, moves: { kind: 'resign' } }],
    });
    expect(state.result).toEqual({ winner: 0, reason: 'resignation' });
  });

  it('replays a resign turn (3p: elimination, game continues)', () => {
    const data = baseData(3);
    const { state } = reconstructHexChessOnline({
      ...data, turns: [{ playerIndex: 1, moves: { kind: 'resign' } }],
    });
    // seats for 3p are ACTIVE_PLAYERS[3] = [0, 3, 1]; slot 1 = seat 3
    expect(state.eliminated).toEqual([3]);
    expect(state.result).toBeNull();
  });

  it('reports the last replayed move for highlights', () => {
    const data = baseData(2);
    const config = buildHexConfigFromOnline(data);
    let local = createInitialState(config);
    const move = pickMove(legalMoves(local));
    local = applyMove(local, move);
    const { lastMove } = reconstructHexChessOnline({
      ...data,
      turns: [{ playerIndex: config.seats.indexOf(move.player), moves: serializeHexMove(move) }],
    });
    expect(lastMove?.pieceId).toBe(move.pieceId);
    expect(coordKey(lastMove!.to)).toBe(coordKey(move.to));
  });
});

describe('applyResign', () => {
  it('second resignation in 3p ends the game', () => {
    const config = buildHexConfigFromOnline(baseData(3));
    let state = createInitialState(config);
    state = applyResign(state, config.seats[1]);
    state = applyResign(state, config.seats[2]);
    expect(state.result?.winner).toBe(config.seats[0]);
  });
});
