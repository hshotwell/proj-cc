import type { BoardLayout, PlayerIndex } from '@/types/game';
import { DIRECTIONS } from './constants';

export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLayout(layout: BoardLayout): LayoutValidationResult {
  const errors: string[] = [];
  const wallSet = new Set(layout.walls ?? []);

  // Ordered list of players who have starting positions
  const activePlayers = (Object.entries(layout.startingPositions) as [string, string[] | undefined][])
    .filter(([, positions]) => positions && positions.length > 0)
    .map(([index]) => Number(index) as PlayerIndex);

  // Check 1: at least one player with pieces
  if (activePlayers.length === 0) {
    errors.push('No pieces on the board.');
    return { valid: false, errors };
  }

  // Walkable cells for connectivity checks: all cells that are not walls
  const walkable = new Set(layout.cells.filter(k => !wallSet.has(k)));

  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const playerLabel = `Player ${i + 1}`;
    const pieces = layout.startingPositions[player] ?? [];
    const goals = layout.goalPositions?.[player] ?? [];

    // Check 2: enough goal cells to hold all pieces
    if (goals.length < pieces.length) {
      errors.push(
        `${playerLabel} has ${pieces.length} piece${pieces.length !== 1 ? 's' : ''} but only ${goals.length} goal cell${goals.length !== 1 ? 's' : ''}.`
      );
    }

    // Check 3: goals must be reachable from starting positions via walkable cells
    if (goals.length > 0) {
      const starts = pieces.filter(k => walkable.has(k));
      if (starts.length === 0) {
        errors.push(`${playerLabel}'s starting positions are all on walls.`);
        continue;
      }

      const reachable = bfsReachable(walkable, starts);
      const blockedGoals = goals.filter(g => !reachable.has(g));

      if (blockedGoals.length > 0) {
        errors.push(
          `${playerLabel}'s goal${blockedGoals.length !== 1 ? 's are' : ' is'} not reachable from their starting positions.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function bfsReachable(walkable: Set<string>, starts: string[]): Set<string> {
  const visited = new Set<string>(starts);
  const queue = [...starts];

  while (queue.length > 0) {
    const key = queue.shift()!;
    const [q, r] = key.split(',').map(Number);

    for (const dir of DIRECTIONS) {
      const nk = `${q + dir.q},${r + dir.r}`;
      if (walkable.has(nk) && !visited.has(nk)) {
        visited.add(nk);
        queue.push(nk);
      }
    }
  }

  return visited;
}
