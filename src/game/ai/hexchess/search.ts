import type { HexChessState, HexMove } from '@/game/hexchess';
import { legalMoves, applyMove, confirmPromotion } from '@/game/hexchess';
import { hashState } from '@/game/hexchess/zobrist';
import { evaluate } from './evaluate';
import { orderMoves } from './moveOrdering';
import { TranspositionTable } from './transposition';
import type { TTFlag } from './transposition';
import { searchBestMoveMaxN } from './maxn';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SearchOptions {
  budgetMs: number;
  maxDepth: number;
}

export interface SearchResult {
  move: HexMove | null;
  evalCp: number;
  depth: number;
  nodes: number;
}

// ---------------------------------------------------------------------------
// Module-level transposition table — reset per search call
// ---------------------------------------------------------------------------

let tt = new TranspositionTable(65536);

// ---------------------------------------------------------------------------
// Quiescence search — extends leaf nodes by searching captures only
// ---------------------------------------------------------------------------

const QUIESCENCE_DEPTH = 4;

function quiescence(
  state: HexChessState,
  alpha: number,
  beta: number,
  maximizing: boolean,
  qDepth: number,
): number {
  const standPat = evaluate(state);

  // Finished game — no point searching further
  if (state.result !== null) return standPat;

  if (qDepth === 0) return standPat;

  if (maximizing) {
    if (standPat >= beta) return standPat;
    alpha = Math.max(alpha, standPat);
  } else {
    if (standPat <= alpha) return standPat;
    beta = Math.min(beta, standPat);
  }

  const captures = legalMoves(state).filter(m => m.capture !== null);
  if (captures.length === 0) return standPat;

  const ordered = orderMoves(state, captures);

  if (maximizing) {
    let best = standPat;
    for (const m of ordered) {
      let next = applyMove(state, m);
      if (next.pendingPromotion) next = confirmPromotion(next, 'queen');
      const score = quiescence(next, alpha, beta, false, qDepth - 1);
      if (score > best) best = score;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = standPat;
    for (const m of ordered) {
      let next = applyMove(state, m);
      if (next.pendingPromotion) next = confirmPromotion(next, 'queen');
      const score = quiescence(next, alpha, beta, true, qDepth - 1);
      if (score < best) best = score;
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning + move ordering + quiescence at leaves
// ---------------------------------------------------------------------------

function minimax(
  state: HexChessState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): { score: number; move: HexMove | null } {
  if (state.result !== null) {
    return { score: evaluate(state), move: null };
  }

  if (depth === 0) {
    return { score: quiescence(state, alpha, beta, maximizing, QUIESCENCE_DEPTH), move: null };
  }

  // Transposition table lookup
  const hash = hashState(state);
  const alphaOriginal = alpha;
  const ttEntry = tt.get(hash);
  if (ttEntry !== null && ttEntry.depth >= depth) {
    if (ttEntry.flag === 'exact') return { score: ttEntry.evalCp, move: ttEntry.bestMove };
    if (ttEntry.flag === 'lower' && ttEntry.evalCp >= beta) return { score: ttEntry.evalCp, move: ttEntry.bestMove };
    if (ttEntry.flag === 'upper' && ttEntry.evalCp <= alpha) return { score: ttEntry.evalCp, move: ttEntry.bestMove };
  }

  const moves = legalMoves(state);
  if (moves.length === 0) {
    return { score: evaluate(state), move: null };
  }

  const ordered = orderMoves(state, moves);
  let bestMove: HexMove | null = null;

  if (maximizing) {
    let best = -Infinity;
    for (const m of ordered) {
      let next = applyMove(state, m);
      if (next.pendingPromotion) {
        next = confirmPromotion(next, 'queen');
      }
      const { score } = minimax(next, depth - 1, alpha, beta, false);
      if (score > best) {
        best = score;
        bestMove = m;
      }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    const flag: TTFlag = best <= alphaOriginal ? 'upper' : (best >= beta ? 'lower' : 'exact');
    tt.set(hash, { depth, evalCp: best, flag, bestMove });
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of ordered) {
      let next = applyMove(state, m);
      if (next.pendingPromotion) {
        next = confirmPromotion(next, 'queen');
      }
      const { score } = minimax(next, depth - 1, alpha, beta, true);
      if (score < best) {
        best = score;
        bestMove = m;
      }
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    const flag: TTFlag = best <= alphaOriginal ? 'upper' : (best >= beta ? 'lower' : 'exact');
    tt.set(hash, { depth, evalCp: best, flag, bestMove });
    return { score: best, move: bestMove };
  }
}

// ---------------------------------------------------------------------------
// Iterative deepening entry point
// ---------------------------------------------------------------------------

export function searchBestMove(
  state: HexChessState,
  options: SearchOptions,
): SearchResult {
  // 3+ players use king-capture rules and a Max^n search — no single
  // adversary to alpha-beta against.
  if (state.activePlayers.length > 2) {
    return searchBestMoveMaxN(state, options);
  }

  // Reset transposition table at the start of each new search
  tt = new TranspositionTable(65536);

  const startedAt = Date.now();
  // evaluate() scores from the first seat's perspective (activePlayers[0]).
  const rootMaximizing = state.currentPlayer === state.activePlayers[0];

  let best: SearchResult = { move: null, evalCp: 0, depth: 0, nodes: 0 };

  for (let depth = 1; depth <= options.maxDepth; depth++) {
    if (Date.now() - startedAt >= options.budgetMs) break;
    const result = minimax(state, depth, -Infinity, Infinity, rootMaximizing);
    best = {
      move: result.move,
      evalCp: result.score,
      depth,
      nodes: 0, // node counting deferred (v1)
    };
  }

  return best;
}
