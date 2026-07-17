import type { HexChessState, HexMove } from '@/game/hexchess';
import { legalMoves, applyMove, confirmPromotion } from '@/game/hexchess';
import { evaluateVector, MAXN_WIN } from './evaluate';
import { orderMoves } from './moveOrdering';
import type { SearchOptions, SearchResult } from './search';

// ---------------------------------------------------------------------------
// Max^n search for king-capture (3+ player) hex chess.
//
// Every node returns a score VECTOR (one component per seat). The seat to
// move picks the child that maximizes its own component; there is no
// alpha-beta (opponents are not a single adversary), so depths stay shallow.
// Terminal and depth-0 nodes evaluate with evaluateVector.
// ---------------------------------------------------------------------------

type ScoreVector = Record<number, number>;

interface MaxnNode {
  scores: ScoreVector;
  move: HexMove | null;
}

function maxn(state: HexChessState, depth: number, deadline: number): MaxnNode {
  if (state.result !== null || depth === 0) {
    return { scores: evaluateVector(state), move: null };
  }

  const mover = state.currentPlayer;
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return { scores: evaluateVector(state), move: null };
  }

  const ordered = orderMoves(state, moves);
  let best: MaxnNode | null = null;

  for (const m of ordered) {
    let next = applyMove(state, m);
    if (next.pendingPromotion) next = confirmPromotion(next, 'queen');
    const child = maxn(next, depth - 1, deadline);
    if (best === null || child.scores[mover] > best.scores[mover]) {
      best = { scores: child.scores, move: m };
    }
    // Immediate win found (or out of time) — no sibling can beat it.
    if (best.scores[mover] >= MAXN_WIN) break;
    if (Date.now() >= deadline) break;
  }

  return best!;
}

/**
 * Iterative-deepening Max^n entry point. `options.maxDepth` counts full
 * mover-rounds (multiplied by the number of living seats into plies),
 * matching the difficulty semantics of the 2-player search loosely while
 * keeping node counts tractable.
 */
export function searchBestMoveMaxN(
  state: HexChessState,
  options: SearchOptions,
): SearchResult {
  const startedAt = Date.now();
  const deadline = startedAt + options.budgetMs;
  const mover = state.currentPlayer;

  const livingCount = state.activePlayers.length - state.eliminated.length;
  const maxPlies = Math.max(1, Math.min(options.maxDepth, 3) * (livingCount - 1));

  let best: SearchResult = { move: null, evalCp: 0, depth: 0, nodes: 0 };

  for (let plies = 1; plies <= maxPlies; plies++) {
    if (Date.now() >= deadline && best.move !== null) break;
    const node = maxn(state, plies, deadline);
    if (node.move !== null) {
      best = {
        move: node.move,
        evalCp: node.scores[mover],
        depth: plies,
        nodes: 0,
      };
    }
    // A found king capture / win doesn't improve with more depth.
    if (node.scores[mover] >= MAXN_WIN) break;
  }

  return best;
}
