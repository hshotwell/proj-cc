import type { BoardLayout, PlayerIndex } from '@/types/game';
import { DIRECTIONS } from './constants';

export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLayout(layout: BoardLayout): LayoutValidationResult {
  if (layout.gameMode === 'hexchess') return validateHexChessLayout(layout);
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

export function validateHexChessLayout(layout: BoardLayout): LayoutValidationResult {
  const errors: string[] = [];
  const cellSet = new Set(layout.cells);
  const wallSet = new Set(layout.walls ?? []);
  const live = (k: string) => cellSet.has(k) && !wallSet.has(k);
  const pieces = layout.hexPieces ?? {};

  const armies = new Map<PlayerIndex, { kings: number; pawns: number; total: number }>();
  for (const [key, pc] of Object.entries(pieces)) {
    if (!live(key)) errors.push(`A piece sits on a wall or missing cell (${key}).`);
    const a = armies.get(pc.player) ?? { kings: 0, pawns: 0, total: 0 };
    a.total += 1;
    if (pc.type === 'king') a.kings += 1;
    if (pc.type === 'pawn') a.pawns += 1;
    armies.set(pc.player, a);
  }

  if (armies.size < 2) {
    errors.push('Hex chess needs at least 2 armies with pieces.');
    return { valid: false, errors };
  }

  let anyPawns = false;
  let armyNumber = 0;
  for (const [player, a] of armies) {
    armyNumber += 1;
    const label = `Army ${armyNumber}`;
    if (a.kings !== 1) errors.push(`${label} must have exactly one king (has ${a.kings}).`);
    if (a.pawns > 0) {
      anyPawns = true;
      const promo = (layout.promotionPositions?.[player] ?? []).filter(live);
      if (promo.length === 0) {
        errors.push(`${label} has pawns but no promotion tiles — the pawns' forward direction is undefined.`);
      }
    }
  }

  for (const [player, tiles] of Object.entries(layout.promotionPositions ?? {})) {
    for (const t of tiles ?? []) {
      if (!live(t)) errors.push(`A promotion tile for player ${Number(player) + 1} is on a wall or missing cell (${t}).`);
    }
  }

  const options = layout.promotionOptions ?? ['knight', 'bishop', 'rook', 'queen'];
  if (anyPawns && options.length === 0) {
    errors.push('At least one promote-to option must be enabled when the board has pawns.');
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
