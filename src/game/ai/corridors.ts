// src/game/ai/corridors.ts
import type { CubeCoord, PlayerIndex } from '@/types/game';
import { coordKey } from '../coordinates';
import { DIRECTIONS } from '../constants';
import { getDefaultBoardCells } from '../defaultLayout';

const laneMapCache = new Map<PlayerIndex, Map<string, number>>();

export function clearApproachLaneCache(): void {
  laneMapCache.clear();
}

/**
 * Build an approach-lane map for a player's goal triangle.
 * For each goal cell G and hex direction dir, marks positions at
 * G − dir×2k (k=1..6) as "on-lane" with value k (hops to goal).
 * Minimum k wins when multiple lanes cover the same cell.
 * Cache is keyed by PlayerIndex; safe only for standard layouts where each
 * player's goal positions are fixed. Custom layouts bypass this via the
 * !state.isCustomLayout guard in computeApproachLaneScore.
 *
 * A piece "on-lane" can potentially chain-jump into a goal cell without
 * a lateral correction step — the core of the "approach angle" concept.
 */
export function getApproachLaneMap(
  player: PlayerIndex,
  goalPositions: CubeCoord[]
): Map<string, number> {
  if (laneMapCache.has(player)) {
    return laneMapCache.get(player)!;
  }

  const boardCells = getDefaultBoardCells();
  const laneMap = new Map<string, number>();

  for (const goal of goalPositions) {
    for (const dir of DIRECTIONS) {
      for (let hops = 1; hops <= 6; hops++) {
        const pos: CubeCoord = {
          q: goal.q - dir.q * (hops * 2),
          r: goal.r - dir.r * (hops * 2),
          s: goal.s - dir.s * (hops * 2),
        };
        const key = coordKey(pos);
        if (!boardCells.has(key)) continue; // Off board at this hop — check further hops
        const existing = laneMap.get(key);
        if (existing === undefined || hops < existing) {
          laneMap.set(key, hops);
        }
      }
    }
  }

  laneMapCache.set(player, laneMap);
  return laneMap;
}
