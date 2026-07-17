import { nextLivingPlayer, livingPlayers } from './board';
import type { HexChessState, HexPieceType } from './state';
import { rulesModeOf } from './state';
import { isCheckmate, isStalemate, isThreefoldRepetition, isInsufficientMaterial } from './check';
import { hashState } from './zobrist';

const VALID_PROMOTION_TYPES = new Set<HexPieceType>(['queen', 'rook', 'bishop', 'knight']);

/**
 * Resolves a pending promotion by applying the chosen piece type.
 *
 * Steps:
 *  1. Validates that `state.pendingPromotion` is non-null and `choice` is in options.
 *  2. Replaces the piece's type with `choice`.
 *  3. Updates the last moveHistory entry to record `promotion: choice`.
 *  4. Advances the turn (currentPlayer + turnNumber).
 *  5. Computes a Zobrist hash of the new position and updates positionHashes.
 *  6. Runs end-of-turn endgame checks (checkmate, stalemate, repetition, insufficient material).
 */
export function confirmPromotion(state: HexChessState, choice: HexPieceType): HexChessState {
  if (state.pendingPromotion === null) {
    throw new Error('confirmPromotion called with no pendingPromotion in state');
  }

  const { pieceId, options } = state.pendingPromotion;

  if (!options.includes(choice)) {
    throw new Error(`confirmPromotion: choice '${choice}' is not in options [${options.join(', ')}]`);
  }

  // 1. Replace the promoting piece's type.
  const nextPieces = state.pieces.map(p =>
    p.id === pieceId ? { ...p, type: choice } : p
  );

  // 2. Update the last moveHistory entry to record the promotion choice.
  const lastIdx = state.moveHistory.length - 1;
  const nextMoveHistory = state.moveHistory.map((m, i) =>
    i === lastIdx ? { ...m, promotion: choice } : m
  );

  // 3. Advance the turn.
  // Mirror applyMoveCore: turnNumber always increments by 1 when advanceTurn=true.
  const mover = state.currentPlayer;
  const nextPlayer = nextLivingPlayer(state, mover);
  const advancedTurnNumber = state.turnNumber + 1;

  let next: HexChessState = {
    ...state,
    pieces: nextPieces,
    moveHistory: nextMoveHistory,
    pendingPromotion: null,
    currentPlayer: nextPlayer,
    turnNumber: advancedTurnNumber,
  };

  // 4. Update positionHashes with this new position's Zobrist hash.
  const hash = hashState(next);
  const prevCount = next.positionHashes[hash] ?? 0;
  next = {
    ...next,
    positionHashes: { ...next.positionHashes, [hash]: prevCount + 1 },
  };

  // 5. Endgame checks (same pattern as applyMove).
  if (rulesModeOf(next) === 'king-capture') {
    // The promoting move may have captured a king (elimination was recorded
    // by applyMoveCore) — detect last-standing here too.
    const living = livingPlayers(next);
    if (living.length === 1) {
      next = { ...next, result: { winner: living[0], reason: 'king-capture' } };
    } else if (isThreefoldRepetition(next)) {
      next = { ...next, result: { winner: 'draw', reason: 'repetition' } };
    }
  } else if (isCheckmate(next)) {
    next = { ...next, result: { winner: mover, reason: 'checkmate' } };
  } else if (isStalemate(next)) {
    next = { ...next, result: { winner: 'draw', reason: 'stalemate' } };
  } else if (isThreefoldRepetition(next)) {
    next = { ...next, result: { winner: 'draw', reason: 'repetition' } };
  } else if (isInsufficientMaterial(next)) {
    next = { ...next, result: { winner: 'draw', reason: 'insufficient-material' } };
  }

  return next;
}
