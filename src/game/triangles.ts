import type { PlayerIndex } from '@/types/game';
import { DIRECTIONS } from './constants';
import { coordKey, parseCoordKey } from './coordinates';
import { getTriangleForPosition } from './board';

export interface BoardTriangle {
  // The three vertex coord keys, sorted
  vertices: [string, string, string];
  // Players whose starting positions touch this triangle (one entry per vertex that is a starting pos)
  playerOwners: PlayerIndex[];
  // If all 3 vertices are in the same star arm zone, the player whose home that is; otherwise null
  zonePlayer: PlayerIndex | null;
}

export interface BorderEdge {
  a: string; // coord key
  b: string; // coord key
}

/**
 * Find all triangles formed by groups of 3 mutually adjacent hex cells on the board.
 *
 * For each cell, check pairs of consecutive hex directions (i and (i+1)%6).
 * Those two neighbors are always mutually adjacent, forming a triangle.
 * Deduplicate by only emitting when the current cell has the lexicographically
 * smallest coordKey of the three.
 */
export function findBoardTriangles(
  boardKeys: Set<string>,
  startingPositions?: Partial<Record<PlayerIndex, string[]>>,
  isCustomLayout?: boolean
): BoardTriangle[] {
  // Build a reverse lookup: coordKey -> player who starts there
  const startPosToPlayer = new Map<string, PlayerIndex>();
  if (startingPositions) {
    for (const [playerStr, positions] of Object.entries(startingPositions)) {
      const player = Number(playerStr) as PlayerIndex;
      if (positions) {
        for (const key of positions) {
          startPosToPlayer.set(key, player);
        }
      }
    }
  }

  const triangles: BoardTriangle[] = [];

  for (const key of boardKeys) {
    const [q, r] = key.split(',').map(Number);

    for (let i = 0; i < 6; i++) {
      const d1 = DIRECTIONS[i];
      const d2 = DIRECTIONS[(i + 1) % 6];

      const n1Key = coordKey({ q: q + d1.q, r: r + d1.r, s: -(q + d1.q) - (r + d1.r) });
      const n2Key = coordKey({ q: q + d2.q, r: r + d2.r, s: -(q + d2.q) - (r + d2.r) });

      if (!boardKeys.has(n1Key) || !boardKeys.has(n2Key)) continue;

      // Deduplicate: only emit when this cell has the smallest key
      if (key > n1Key || key > n2Key) continue;

      // Collect player owners for each vertex that is a starting position
      const playerOwners: PlayerIndex[] = [];
      for (const vk of [key, n1Key, n2Key]) {
        const p = startPosToPlayer.get(vk);
        if (p !== undefined) playerOwners.push(p);
      }

      // Determine zone: only for default star layout, check if any vertex is in a star arm
      let zonePlayer: PlayerIndex | null = null;
      if (!isCustomLayout) {
        const z0 = getTriangleForPosition(parseCoordKey(key));
        const z1 = getTriangleForPosition(parseCoordKey(n1Key));
        const z2 = getTriangleForPosition(parseCoordKey(n2Key));
        zonePlayer = (z0 ?? z1 ?? z2) as PlayerIndex | null;
      }

      triangles.push({
        vertices: [key, n1Key, n2Key],
        playerOwners,
        zonePlayer,
      });
    }
  }

  return triangles;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Find all edges between adjacent cells on the board.
 */
export function findAllEdges(boardKeys: Set<string>): BorderEdge[] {
  const edges = new Map<string, BorderEdge>();

  for (const key of boardKeys) {
    const [q, r] = key.split(',').map(Number);

    for (const d of DIRECTIONS) {
      const neighborKey = coordKey({ q: q + d.q, r: r + d.r, s: -(q + d.q) - (r + d.r) });
      if (boardKeys.has(neighborKey)) {
        const ek = edgeKey(key, neighborKey);
        if (!edges.has(ek)) {
          edges.set(ek, { a: key, b: neighborKey });
        }
      }
    }
  }

  return Array.from(edges.values());
}

/**
 * Find border edges: edges that sit on the outer boundary of the board.
 * This includes:
 * 1. Triangle edges that belong to only one triangle
 * 2. Edges not part of any triangle (connecting isolated/pendant nodes)
 */
export function findBorderEdges(triangles: BoardTriangle[], boardKeys: Set<string>): BorderEdge[] {
  // Count how many triangles each edge belongs to
  const edgeTriangleCounts = new Map<string, number>();

  for (const tri of triangles) {
    const [v0, v1, v2] = tri.vertices;
    for (const [a, b] of [[v0, v1], [v1, v2], [v0, v2]]) {
      const ek = edgeKey(a, b);
      edgeTriangleCounts.set(ek, (edgeTriangleCounts.get(ek) || 0) + 1);
    }
  }

  // Find all edges on the board
  const allEdges = findAllEdges(boardKeys);

  // An edge is a border if it belongs to 0 or 1 triangles
  const borders: BorderEdge[] = [];
  for (const edge of allEdges) {
    const ek = edgeKey(edge.a, edge.b);
    const triangleCount = edgeTriangleCounts.get(ek) || 0;
    if (triangleCount <= 1) {
      borders.push(edge);
    }
  }

  return borders;
}
