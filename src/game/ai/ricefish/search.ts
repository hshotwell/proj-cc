import type { GameState, Move, PlayerIndex } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import {
  RICEFISH_DEPTH_2P,
  RICEFISH_DEPTH_MP,
  RICEFISH_TIME_BUDGET_MS,
} from '@/types/ai';
import { getAllValidMoves } from '@/game/moves';
import { applyMove, hasPlayerWon } from '@/game/state';
import { cubeEquals } from '@/game/coordinates';
import {
  ricefishScore,
  createGoalCentroidCache,
  MATE,
} from './evaluate';
import { orderMoves } from './ordering';

const TT_MAX_ENTRIES = 100_000;

// ─── transposition table ──────────────────────────────────────────────────────

type TTFlag = 'exact' | 'lower' | 'upper';
interface TTEntry {
  depth: number;
  value: number;
  flag: TTFlag;
  bestMove?: Move;
}

class TT {
  private map = new Map<string, TTEntry>();

  get(key: string): TTEntry | undefined {
    return this.map.get(key);
  }
  set(key: string, entry: TTEntry): void {
    if (this.map.size >= TT_MAX_ENTRIES) {
      // Evict the oldest entry. Map iterates in insertion order so .keys()
      // .next() is the oldest.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, entry);
  }
}

function hashState(state: GameState): string {
  // Serialize occupied cells (key|player) sorted by key, then the current
  // player. Cheap enough at our scale and good enough as a TT key — collisions
  // would just cause us to skip a TT hit, not corrupt the search.
  const cells: string[] = [];
  for (const [k, v] of state.board) {
    if (v.type === 'piece') cells.push(`${k}|${v.player}`);
  }
  cells.sort();
  return `${state.currentPlayer}:${cells.join(';')}`;
}

// ─── time budget ──────────────────────────────────────────────────────────────

class TimeBudget {
  readonly deadline: number;
  constructor(ms: number) {
    this.deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ms;
  }
  expired(): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return now >= this.deadline;
  }
}

class SearchAborted extends Error {
  constructor() { super('search aborted by time budget'); }
}

// ─── 2-player alpha-beta with iterative deepening ─────────────────────────────

interface ABContext {
  root: PlayerIndex;
  personality: AIPersonality;
  cache: ReturnType<typeof createGoalCentroidCache>;
  tt: TT;
  killers: Map<number, Move[]>; // ply -> up to 2 killer moves
  budget: TimeBudget;
  // Best move found at the previous iterative-deepening iteration. Reordered
  // to the front of root move list.
  pvHint: Move | null;
}

function killersFor(ctx: ABContext, ply: number): Move[] {
  let arr = ctx.killers.get(ply);
  if (!arr) {
    arr = [];
    ctx.killers.set(ply, arr);
  }
  return arr;
}

function recordKiller(ctx: ABContext, ply: number, move: Move): void {
  const arr = killersFor(ctx, ply);
  if (arr.some((m) => sameMove(m, move))) return;
  arr.unshift(move);
  if (arr.length > 2) arr.length = 2;
}

function sameMove(a: Move, b: Move): boolean {
  return cubeEquals(a.from, b.from) && cubeEquals(a.to, b.to);
}

function orderRootMoves(
  moves: Move[],
  pvHint: Move | null,
  personality: AIPersonality,
): Move[] {
  const base = orderMoves(moves, personality);
  if (!pvHint) return base;
  const idx = base.findIndex((m) => sameMove(m, pvHint));
  if (idx < 0) return base;
  const [pv] = base.splice(idx, 1);
  return [pv, ...base];
}

function orderInnerMoves(
  moves: Move[],
  ttBest: Move | undefined,
  killers: Move[],
  personality: AIPersonality,
): Move[] {
  const base = orderMoves(moves, personality);
  // Bring TT bestMove (if any) and killer moves to the front, preserving the
  // rest of the ordering.
  const lead: Move[] = [];
  const seen = new Set<Move>();
  if (ttBest) {
    const m = base.find((x) => sameMove(x, ttBest));
    if (m) { lead.push(m); seen.add(m); }
  }
  for (const k of killers) {
    const m = base.find((x) => sameMove(x, k));
    if (m && !seen.has(m)) { lead.push(m); seen.add(m); }
  }
  const rest = base.filter((x) => !seen.has(x));
  return [...lead, ...rest];
}

/**
 * Negamax with alpha-beta from `root`'s perspective. Returns score.
 *
 * Even-depth nodes evaluate from root's POV; odd-depth nodes evaluate from
 * the opponent's POV and we negate. This is the standard 2-player negamax
 * trick — only sound because there are exactly 2 sides taking turns.
 */
function alphaBeta(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: ABContext,
): number {
  if (ctx.budget.expired()) throw new SearchAborted();

  // Terminal or depth cap → leaf eval.
  // We always evaluate from `ctx.root`'s POV and let negamax flip the sign
  // implicitly via the side-to-move alternation in alpha/beta windows.
  const sideToMove = state.currentPlayer;
  if (depth === 0 || state.winner !== null) {
    const raw = ricefishScore(state, ctx.root, ctx.personality, ctx.cache);
    // Convert to side-to-move POV for negamax.
    return sideToMove === ctx.root ? raw : -raw;
  }

  const ttKey = hashState(state);
  const ttHit = ctx.tt.get(ttKey);
  if (ttHit && ttHit.depth >= depth) {
    if (ttHit.flag === 'exact') return ttHit.value;
    if (ttHit.flag === 'lower' && ttHit.value > alpha) alpha = ttHit.value;
    else if (ttHit.flag === 'upper' && ttHit.value < beta) beta = ttHit.value;
    if (alpha >= beta) return ttHit.value;
  }

  const all = getAllValidMoves(state, sideToMove);
  if (all.length === 0) {
    // No legal move — treat as a loss for side-to-move.
    return -MATE;
  }

  const ordered = orderInnerMoves(all, ttHit?.bestMove, killersFor(ctx, ply), ctx.personality);

  let bestValue = -Infinity;
  let bestMove: Move | undefined;
  const alphaOrig = alpha;

  for (const move of ordered) {
    const next = applyMove(state, move);
    const value = -alphaBeta(next, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
    if (value > alpha) alpha = value;
    if (alpha >= beta) {
      recordKiller(ctx, ply, move);
      break;
    }
  }

  const flag: TTFlag =
    bestValue <= alphaOrig ? 'upper' :
    bestValue >= beta ? 'lower' :
    'exact';
  ctx.tt.set(ttKey, { depth, value: bestValue, flag, bestMove });
  return bestValue;
}

function findBestMove2P(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
): Move | null {
  const maxDepth = RICEFISH_DEPTH_2P[difficulty];
  const budget = new TimeBudget(RICEFISH_TIME_BUDGET_MS[difficulty]);
  const ctx: ABContext = {
    root: state.currentPlayer,
    personality,
    cache: createGoalCentroidCache(),
    tt: new TT(),
    killers: new Map(),
    budget,
    pvHint: null,
  };

  const rootMoves = getAllValidMoves(state, state.currentPlayer);
  if (rootMoves.length === 0) return null;

  let bestOverall: Move | null = rootMoves[0];
  // Iterative deepening: complete each depth in full before advancing to the
  // next so that on time-out we always have a usable best move.
  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestThisIter: Move | null = null;
    let bestScore = -Infinity;
    try {
      const ordered = orderRootMoves(rootMoves, ctx.pvHint, personality);
      let alpha = -Infinity;
      const beta = Infinity;
      for (const move of ordered) {
        const next = applyMove(state, move);
        const score = -alphaBeta(next, depth - 1, -beta, -alpha, 1, ctx);
        if (score > bestScore) {
          bestScore = score;
          bestThisIter = move;
        }
        if (score > alpha) alpha = score;
      }
    } catch (e) {
      if (e instanceof SearchAborted) break;
      throw e;
    }
    if (bestThisIter) {
      bestOverall = bestThisIter;
      ctx.pvHint = bestThisIter;
    }
    if (ctx.budget.expired()) break;
    // Early exit if we found a forced win at this depth.
    if (bestScore >= MATE / 2) break;
  }

  return bestOverall;
}

// ─── N-player Max^n ───────────────────────────────────────────────────────────

interface MaxNContext {
  personality: AIPersonality;
  cache: ReturnType<typeof createGoalCentroidCache>;
  budget: TimeBudget;
}

function maxNLeaf(state: GameState, ctx: MaxNContext): number[] {
  return state.activePlayers.map((p) =>
    ricefishScore(state, p, ctx.personality, ctx.cache)
  );
}

/**
 * Max^n: returns a score vector where index i is the score for activePlayers[i].
 * At each node, the side-to-move picks the child maximizing their own component.
 */
function maxN(state: GameState, depth: number, ctx: MaxNContext): number[] {
  if (ctx.budget.expired()) throw new SearchAborted();
  if (depth === 0 || state.winner !== null) return maxNLeaf(state, ctx);

  const sideToMove = state.currentPlayer;
  const sideIndex = state.activePlayers.indexOf(sideToMove);
  if (sideIndex < 0) return maxNLeaf(state, ctx);

  const all = getAllValidMoves(state, sideToMove);
  if (all.length === 0) {
    // Side-to-move has no legal moves — score them as effectively lost.
    const vec = maxNLeaf(state, ctx);
    vec[sideIndex] = -MATE;
    return vec;
  }

  const ordered = orderMoves(all, ctx.personality);
  let best: number[] | null = null;
  for (const move of ordered) {
    const next = applyMove(state, move);
    const childVec = maxN(next, depth - 1, ctx);
    if (best === null || childVec[sideIndex] > best[sideIndex]) {
      best = childVec;
    }
  }
  return best ?? maxNLeaf(state, ctx);
}

function findBestMoveMP(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
): Move | null {
  const maxDepth = RICEFISH_DEPTH_MP[difficulty];
  const budget = new TimeBudget(RICEFISH_TIME_BUDGET_MS[difficulty]);
  const ctx: MaxNContext = {
    personality,
    cache: createGoalCentroidCache(),
    budget,
  };

  const rootMoves = getAllValidMoves(state, state.currentPlayer);
  if (rootMoves.length === 0) return null;
  const sideIndex = state.activePlayers.indexOf(state.currentPlayer);

  let bestOverall: Move | null = rootMoves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestThisIter: Move | null = null;
    let bestComponent = -Infinity;
    try {
      const ordered = orderMoves(rootMoves, personality);
      for (const move of ordered) {
        const next = applyMove(state, move);
        const vec = maxN(next, depth - 1, ctx);
        if (vec[sideIndex] > bestComponent) {
          bestComponent = vec[sideIndex];
          bestThisIter = move;
        }
      }
    } catch (e) {
      if (e instanceof SearchAborted) break;
      throw e;
    }
    if (bestThisIter) bestOverall = bestThisIter;
    if (ctx.budget.expired()) break;
    if (bestComponent >= MATE / 2) break;
  }

  return bestOverall;
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Pick a move for `state.currentPlayer` using the Ricefish-style engine.
 *
 * Dispatches to alpha-beta for 2-player games and Max^n for 3+ player games.
 * Returns null only if there are no legal moves.
 *
 * Uses `hasPlayerWon` indirectly via the eval's terminal shortcuts, so the
 * search will recognize wins at any depth.
 */
export function findRicefishMove(
  state: GameState,
  difficulty: AIDifficulty,
  personality: AIPersonality,
): Move | null {
  // Sanity: confirm the current player is not already finished.
  if (state.finishedPlayers.some((fp) => fp.player === state.currentPlayer)) {
    return null;
  }
  // Early-out if current player has somehow already won.
  if (hasPlayerWon(state, state.currentPlayer)) return null;

  if (state.activePlayers.length <= 2) {
    return findBestMove2P(state, difficulty, personality);
  }
  return findBestMoveMP(state, difficulty, personality);
}
