import type { CubeCoord, GameState, PlayerIndex } from '@/types/game';
import { DIRECTIONS } from './constants';
import { coordKey, cubeAdd, getJumpDestination } from './coordinates';

/**
 * Cache for theoretical distances from goals.
 * Key format: "boardHash|goalKeys" -> Map<cellKey, distance>
 *
 * Since board topology doesn't change during a game, we can cache
 * the distance from every cell to the nearest goal.
 */
const distanceFromGoalsCache = new Map<string, Map<string, number>>();

/**
 * Generate a simple hash for the board topology (just the cell keys).
 */
function getBoardHash(state: GameState): string {
  // For custom layouts, use the board size as a quick hash
  // (Full hashing would be expensive and boards don't change mid-game)
  return `${state.board.size}`;
}

/**
 * Compute distances from ALL goals to every reachable cell using multi-source BFS.
 * This is much faster than computing from each piece to each goal separately.
 *
 * Returns a map from cell key to minimum distance to ANY goal.
 */
function computeDistancesFromGoals(
  state: GameState,
  goals: CubeCoord[]
): Map<string, number> {
  const goalKeySet = new Set(goals.map(g => coordKey(g)));
  const cacheKey = `${getBoardHash(state)}|${Array.from(goalKeySet).sort().join(',')}`;

  // Check cache first
  const cached = distanceFromGoalsCache.get(cacheKey);
  if (cached) return cached;

  const distances = new Map<string, number>();

  // Initialize all goals with distance 0
  const queue: Array<{ key: string; q: number; r: number; dist: number }> = [];
  for (const goal of goals) {
    const key = coordKey(goal);
    distances.set(key, 0);
    queue.push({ key, q: goal.q, r: goal.r, dist: 0 });
  }

  // BFS from all goals simultaneously
  while (queue.length > 0) {
    const { q, r, dist } = queue.shift()!;
    const nextDist = dist + 1;

    for (const dir of DIRECTIONS) {
      const nq = q + dir.q;
      const nr = r + dir.r;
      const neighborKey = `${nq},${nr}`;

      // Must be on board
      if (!state.board.has(neighborKey)) continue;

      // Skip if already visited (BFS guarantees first visit is shortest)
      if (distances.has(neighborKey)) continue;

      distances.set(neighborKey, nextDist);
      queue.push({ key: neighborKey, q: nq, r: nr, dist: nextDist });
    }
  }

  // Cache for future use
  distanceFromGoalsCache.set(cacheKey, distances);

  // Limit cache size to prevent memory leaks
  if (distanceFromGoalsCache.size > 50) {
    const firstKey = distanceFromGoalsCache.keys().next().value;
    if (firstKey) distanceFromGoalsCache.delete(firstKey);
  }

  return distances;
}

/**
 * Check if a piece is stuck (has no valid moves).
 * A stuck piece can't contribute to progress.
 */
function isPieceStuck(state: GameState, pos: CubeCoord): boolean {
  const posKey = coordKey(pos);

  // Check for any step move
  for (const dir of DIRECTIONS) {
    const neighbor = cubeAdd(pos, dir);
    const neighborKey = coordKey(neighbor);
    const content = state.board.get(neighborKey);
    if (content?.type === 'empty') return false;
  }

  // Check for any jump move
  for (const dir of DIRECTIONS) {
    const over = cubeAdd(pos, dir);
    const overContent = state.board.get(coordKey(over));
    if (overContent?.type !== 'piece') continue;

    const landing = getJumpDestination(pos, over);
    const landingKey = coordKey(landing);
    if (!state.board.has(landingKey)) continue;

    const landingContent = state.board.get(landingKey);
    if (landingContent?.type === 'empty') return false;
  }

  return true;
}

/**
 * Compute optimal assignment of pieces to goals using the pre-computed
 * distance map. Much faster than individual BFS calls.
 *
 * Uses greedy assignment: repeatedly assign the piece closest to any unassigned goal.
 */
export function computeOptimalAssignment(
  state: GameState,
  pieces: CubeCoord[],
  goals: CubeCoord[],
  _useActualMoves = false // Kept for API compatibility, but we always use theoretical now
): { totalCost: number; assignments: Array<{ piece: CubeCoord; goal: CubeCoord; cost: number }> } {
  if (pieces.length === 0 || goals.length === 0) {
    return { totalCost: 0, assignments: [] };
  }

  const goalKeySet = new Set(goals.map(g => coordKey(g)));

  // Separate pieces into: already in goals vs not
  const piecesInGoals: CubeCoord[] = [];
  const piecesOutside: CubeCoord[] = [];

  for (const piece of pieces) {
    const pieceKey = coordKey(piece);
    if (goalKeySet.has(pieceKey)) {
      piecesInGoals.push(piece);
    } else {
      piecesOutside.push(piece);
    }
  }

  // Compute distances from all goals
  const distFromGoals = computeDistancesFromGoals(state, goals);

  // Build distance matrix only for pieces outside to unoccupied goals
  const occupiedGoalKeys = new Set(piecesInGoals.map(p => coordKey(p)));
  const availableGoals = goals.filter(g => !occupiedGoalKeys.has(coordKey(g)));

  // Start with pieces already in goals (cost 0 each)
  const assignments: Array<{ piece: CubeCoord; goal: CubeCoord; cost: number }> = [];
  let totalCost = 0;

  for (const piece of piecesInGoals) {
    assignments.push({ piece, goal: piece, cost: 0 });
  }

  if (piecesOutside.length === 0 || availableGoals.length === 0) {
    return { totalCost, assignments };
  }

  // Pre-compute distances for all pieces outside goals
  const pieceDistances: number[] = piecesOutside.map(p => {
    const key = coordKey(p);
    return distFromGoals.get(key) ?? Infinity;
  });

  // Create indexed list and sort by distance (closest first)
  const indexed = piecesOutside.map((piece, i) => ({
    piece,
    dist: pieceDistances[i],
    idx: i
  }));
  indexed.sort((a, b) => a.dist - b.dist);

  // Greedy assignment: take closest pieces first
  const numToAssign = Math.min(indexed.length, availableGoals.length);
  for (let i = 0; i < numToAssign; i++) {
    const { piece, dist } = indexed[i];
    assignments.push({ piece, goal: availableGoals[i], cost: dist });
    totalCost += dist;
  }

  return { totalCost, assignments };
}

/**
 * Compute progress score based on distances to goals.
 * Optimized version using cached multi-source BFS.
 */
export function computePathBasedProgress(
  state: GameState,
  _player: PlayerIndex,
  pieces: CubeCoord[],
  goals: CubeCoord[],
  homePositions: CubeCoord[]
): number {
  if (pieces.length === 0 || goals.length === 0) return 0;

  // Get cached distance map from goals
  const distFromGoals = computeDistancesFromGoals(state, goals);

  // Use a large penalty for unreachable positions (not 0!)
  const UNREACHABLE_COST = 100;

  // Sum distances for current pieces
  let currentCost = 0;
  for (const piece of pieces) {
    const key = coordKey(piece);
    const dist = distFromGoals.get(key);
    currentCost += dist !== undefined ? dist : UNREACHABLE_COST;
  }

  // Sum distances for home positions (starting cost)
  let startingCost = 0;
  for (const home of homePositions) {
    const key = coordKey(home);
    const dist = distFromGoals.get(key);
    startingCost += dist !== undefined ? dist : UNREACHABLE_COST;
  }

  // Goal cost is 0 (when all pieces are in goals)
  const range = startingCost;
  if (range <= 0) return 100;

  const progress = ((startingCost - currentCost) / range) * 100;
  return Math.max(0, Math.min(100, progress));
}

/**
 * Get the worst (maximum) distance for any piece to reach a goal.
 * Optimized to use cached distance map and skip pieces already in goals.
 */
export function getWorstAssignmentCost(
  state: GameState,
  pieces: CubeCoord[],
  goals: CubeCoord[],
  _useActualMoves = false
): number {
  if (pieces.length === 0 || goals.length === 0) return 0;

  const goalKeySet = new Set(goals.map(g => coordKey(g)));
  const distFromGoals = computeDistancesFromGoals(state, goals);

  // Use a large but finite cost for unreachable pieces
  const UNREACHABLE_COST = 100;
  let worstCost = 0;

  for (const piece of pieces) {
    const pieceKey = coordKey(piece);

    // Skip pieces already in goals
    if (goalKeySet.has(pieceKey)) continue;

    const dist = distFromGoals.get(pieceKey);
    const cost = dist !== undefined ? dist : UNREACHABLE_COST;
    if (cost > worstCost) {
      worstCost = cost;
    }
  }

  return worstCost;
}

/**
 * Clear the distance cache. Call this when starting a new game
 * or if the board topology changes.
 */
export function clearPathfindingCache(): void {
  distanceFromGoalsCache.clear();
}

// Legacy exports for API compatibility
export function computeMoveDistances(
  state: GameState,
  from: CubeCoord,
  ignoreOccupancy = false
): Map<string, number> {
  // Simplified: just return theoretical distances from this position
  const distances = new Map<string, number>();
  const fromKey = coordKey(from);
  distances.set(fromKey, 0);

  const queue: Array<{ q: number; r: number; dist: number }> = [{ q: from.q, r: from.r, dist: 0 }];

  while (queue.length > 0) {
    const { q, r, dist } = queue.shift()!;
    const nextDist = dist + 1;

    for (const dir of DIRECTIONS) {
      const nq = q + dir.q;
      const nr = r + dir.r;
      const neighborKey = `${nq},${nr}`;

      if (!state.board.has(neighborKey)) continue;
      if (distances.has(neighborKey)) continue;

      if (!ignoreOccupancy) {
        const content = state.board.get(neighborKey);
        if (content?.type !== 'empty') continue;
      }

      distances.set(neighborKey, nextDist);
      queue.push({ q: nq, r: nr, dist: nextDist });
    }
  }

  return distances;
}

export function computeTheoreticalDistance(
  state: GameState,
  from: CubeCoord,
  to: CubeCoord
): number {
  const toKey = coordKey(to);
  const fromKey = coordKey(from);

  if (fromKey === toKey) return 0;

  const visited = new Set<string>();
  visited.add(fromKey);

  const queue: Array<{ q: number; r: number; dist: number }> = [{ q: from.q, r: from.r, dist: 0 }];

  while (queue.length > 0) {
    const { q, r, dist } = queue.shift()!;

    for (const dir of DIRECTIONS) {
      const nq = q + dir.q;
      const nr = r + dir.r;
      const nextKey = `${nq},${nr}`;

      if (!state.board.has(nextKey)) continue;
      if (visited.has(nextKey)) continue;

      if (nextKey === toKey) return dist + 1;

      visited.add(nextKey);
      queue.push({ q: nq, r: nr, dist: dist + 1 });
    }
  }

  return Infinity;
}
