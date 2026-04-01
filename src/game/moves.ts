import type { CubeCoord, Move, GameState, PlayerIndex, PieceVariant } from '@/types/game';
import { DIRECTIONS } from './constants';
import {
  coordKey,
  cubeAdd,
  cubeEquals,
  getJumpDestination,
} from './coordinates';
import { getHomePositions, getGoalPositions, getTeammate } from './state';

// Check if a position is empty on the board
function isEmpty(state: GameState, coord: CubeCoord): boolean {
  const content = state.board.get(coordKey(coord));
  return content?.type === 'empty';
}

// Check if a position has a piece
function hasPiece(state: GameState, coord: CubeCoord): boolean {
  const content = state.board.get(coordKey(coord));
  return content?.type === 'piece';
}

// Check if a position has something jumpable by the given player.
// Big pieces can only be jumped by their owner or teammates (in team mode).
// Walls are always jumpable.
export function canJumpOver(state: GameState, coord: CubeCoord, jumpingPlayer: PlayerIndex): boolean {
  const content = state.board.get(coordKey(coord));
  if (!content) return false;
  if (content.type === 'wall') return true;
  if (content.type !== 'piece') return false;
  // Check per-piece variant first (custom boards can have individual big pieces),
  // then fall back to player-level type.
  const variant = state.pieceVariants?.get(coordKey(coord)) ?? state.playerPieceTypes?.[content.player] ?? 'normal';
  if (variant === 'big') {
    if (content.player === jumpingPlayer) return true;
    if (state.teamMode && getTeammate(jumpingPlayer) === content.player) return true;
    return false;
  }
  return true;
}

// Check if a position is valid (on the board)
// Uses the game state's board which contains the correct cells for both
// default and custom layouts.
function isOnBoard(state: GameState, coord: CubeCoord): boolean {
  return state.board.has(coordKey(coord));
}

// Get all valid step moves (moving to an adjacent empty cell)
function getStepMoves(state: GameState, from: CubeCoord): Move[] {
  const moves: Move[] = [];

  for (const dir of DIRECTIONS) {
    const to = cubeAdd(from, dir);

    // Must be on board and empty
    if (isOnBoard(state, to) && isEmpty(state, to)) {
      moves.push({
        from,
        to,
        isJump: false,
      });
    }
  }

  return moves;
}

// Get all valid jump moves using BFS for chain jumps
function getJumpMoves(state: GameState, from: CubeCoord, player: PlayerIndex): Move[] {
  const moves: Move[] = [];
  const visited = new Set<string>();
  visited.add(coordKey(from));

  // BFS queue: [current position, path of jumps]
  const queue: Array<{ pos: CubeCoord; path: CubeCoord[] }> = [
    { pos: from, path: [] },
  ];

  while (queue.length > 0) {
    const { pos: current, path } = queue.shift()!;

    // Try jumping in each direction
    for (const dir of DIRECTIONS) {
      const over = cubeAdd(current, dir);
      const landing = getJumpDestination(current, over);

      // Jump is valid if:
      // 1. There's a piece or wall to jump over
      // 2. Landing spot is on the board
      // 3. Landing spot is empty
      // 4. Haven't visited this landing spot yet
      if (
        canJumpOver(state, over, player) &&
        isOnBoard(state, landing) &&
        isEmpty(state, landing) &&
        !visited.has(coordKey(landing))
      ) {
        visited.add(coordKey(landing));
        const newPath = [...path, over];

        // Add this as a valid move
        moves.push({
          from,
          to: landing,
          isJump: true,
          jumpPath: newPath,
        });

        // Continue BFS from this position for chain jumps
        queue.push({ pos: landing, path: newPath });
      }
    }
  }

  return moves;
}

// Check if a player has moved ALL their pieces out of their home/starting positions
function hasPlayerLeftHome(state: GameState, player: PlayerIndex): boolean {
  // For custom layouts, use startingPositions from state
  if (state.isCustomLayout && state.startingPositions?.[player]) {
    for (const key of state.startingPositions[player]!) {
      const content = state.board.get(key);
      if (content?.type === 'piece' && content.player === player) {
        return false;
      }
    }
    return true;
  }

  // For standard layouts, use default home positions
  const homePositions = getHomePositions(player);
  for (const pos of homePositions) {
    const content = state.board.get(coordKey(pos));
    if (content?.type === 'piece' && content.player === player) {
      return false;
    }
  }
  return true;
}

// Get swap moves: single-step onto adjacent goal cell occupied by opponent.
// Extra rule: any piece may always swap with a blocker (big) piece, and any blocker
// may always swap with any adjacent opponent piece — regardless of goal zone or home status.
// This prevents blockers from forming impassable walls outside endzones.
function getSwapMoves(state: GameState, from: CubeCoord, player: PlayerIndex): Move[] {
  const fromKey = coordKey(from);
  const movingVariant = state.pieceVariants?.get(fromKey) ?? state.playerPieceTypes?.[player] ?? 'normal';
  const isMovingBig = movingVariant === 'big';

  // Get goal positions for the standard swap rule
  let goalKeys: Set<string> | null = null;
  if (!state.isCustomLayout) {
    goalKeys = new Set(getGoalPositions(player).map(coordKey));
  } else if (state.customGoalPositions?.[player]) {
    goalKeys = new Set(state.customGoalPositions[player]!);
  }

  const leftHome = hasPlayerLeftHome(state, player);
  const moves: Move[] = [];

  for (const dir of DIRECTIONS) {
    const to = cubeAdd(from, dir);
    const toKey = coordKey(to);

    const content = state.board.get(toKey);
    if (!content || content.type !== 'piece' || content.player === player) continue;

    const targetVariant = state.pieceVariants?.get(toKey) ?? state.playerPieceTypes?.[content.player] ?? 'normal';
    const targetIsBig = targetVariant === 'big';

    // Standard: has left home and target is in player's goal zone
    const standardSwap = leftHome && goalKeys !== null && goalKeys.has(toKey);
    // Blocker rule: either piece is a blocker — always allowed, anywhere
    const blockerSwap = isMovingBig || targetIsBig;

    if (standardSwap || blockerSwap) {
      moves.push({ from, to, isJump: false, isSwap: true });
    }
  }

  return moves;
}

// Turbo: scans along each direction past empty cells until it hits a jumpable,
// then lands the same distance on the other side. Chain jumps allowed.
// Big pieces owned by opponents block the scan.
function getTurboJumps(state: GameState, from: CubeCoord, player: PlayerIndex): Move[] {
  const moves: Move[] = [];
  const visited = new Set<string>();
  visited.add(coordKey(from));

  const queue: Array<{ pos: CubeCoord; path: CubeCoord[] }> = [{ pos: from, path: [] }];

  while (queue.length > 0) {
    const { pos: current, path } = queue.shift()!;

    for (const dir of DIRECTIONS) {
      // Scan outward until we hit a jumpable or leave the board
      for (let k = 1; ; k++) {
        const over: CubeCoord = {
          q: current.q + dir.q * k,
          r: current.r + dir.r * k,
          s: current.s + dir.s * k,
        };
        if (!isOnBoard(state, over)) break;
        // Treat the piece's starting square as empty — it has vacated that position.
        // Also stop at opponent big pieces — they block the line.
        if (isEmpty(state, over) || cubeEquals(over, from)) continue; // skip empty / own origin
        if (!canJumpOver(state, over, player)) break; // blocked by opponent big piece
        // Found the first jumpable cell at distance k.
        // The mirror path (between jumped piece and landing) must also be clear.
        const landing: CubeCoord = {
          q: current.q + dir.q * 2 * k,
          r: current.r + dir.r * 2 * k,
          s: current.s + dir.s * 2 * k,
        };
        // Check cells at k+1 ... 2k-1 are all empty (mirror clearance)
        let mirrorClear = true;
        for (let m = k + 1; m < 2 * k; m++) {
          const mid: CubeCoord = {
            q: current.q + dir.q * m,
            r: current.r + dir.r * m,
            s: current.s + dir.s * m,
          };
          if (!isEmpty(state, mid) && !cubeEquals(mid, from)) { mirrorClear = false; break; }
        }
        if (mirrorClear && isOnBoard(state, landing) && isEmpty(state, landing) && !visited.has(coordKey(landing))) {
          visited.add(coordKey(landing));
          const newPath = [...path, over];
          moves.push({ from, to: landing, isJump: true, jumpPath: newPath });
          queue.push({ pos: landing, path: newPath });
        }
        break; // stop scanning after the first jumpable regardless
      }
    }
  }

  return moves;
}

// Ghost: in each direction, collects the contiguous run of adjacent jumpable cells
// and lands in the first empty cell after the run. Chain jumps allowed.
// Opponent big pieces break the run.
function getGhostJumps(state: GameState, from: CubeCoord, player: PlayerIndex): Move[] {
  const moves: Move[] = [];
  const visited = new Set<string>();
  visited.add(coordKey(from));

  const queue: Array<{ pos: CubeCoord; path: CubeCoord[] }> = [{ pos: from, path: [] }];

  while (queue.length > 0) {
    const { pos: current, path } = queue.shift()!;

    for (const dir of DIRECTIONS) {
      // Collect the contiguous run of jumpable cells starting at current+dir
      const jumpedOver: CubeCoord[] = [];
      let k = 1;
      while (true) {
        const cell: CubeCoord = {
          q: current.q + dir.q * k,
          r: current.r + dir.r * k,
          s: current.s + dir.s * k,
        };
        // Treat the piece's starting square as empty — it has vacated that position.
        // Opponent big pieces also break the run.
        if (!isOnBoard(state, cell) || !canJumpOver(state, cell, player) || cubeEquals(cell, from)) break;
        jumpedOver.push(cell);
        k++;
      }

      if (jumpedOver.length === 0) continue; // nothing to jump over in this direction

      // Landing is the first cell after the run
      const landing: CubeCoord = {
        q: current.q + dir.q * k,
        r: current.r + dir.r * k,
        s: current.s + dir.s * k,
      };
      if (isOnBoard(state, landing) && isEmpty(state, landing) && !visited.has(coordKey(landing))) {
        visited.add(coordKey(landing));
        // Store one virtual midpoint per hop (not all jumped pieces).
        // getMovePath uses getJumpDestination(current, v) = 2v - current, so
        // v = current + dir*(k/2) correctly reconstructs landing = current + dir*k.
        const virtualMid: CubeCoord = {
          q: current.q + dir.q * k / 2,
          r: current.r + dir.r * k / 2,
          s: current.s + dir.s * k / 2,
        };
        const newPath = [...path, virtualMid];
        moves.push({ from, to: landing, isJump: true, jumpPath: newPath });
        queue.push({ pos: landing, path: newPath });
      }
    }
  }

  return moves;
}

// Get all valid moves for a piece at the given position
export function getValidMoves(state: GameState, from: CubeCoord): Move[] {
  // Verify there's a piece at this position
  const content = state.board.get(coordKey(from));
  if (!content || content.type !== 'piece') {
    return [];
  }

  // Determine jump function based on piece variant (per-piece overrides player-level type)
  const variant: PieceVariant = state.pieceVariants?.get(coordKey(from)) ?? state.playerPieceTypes?.[content.player] ?? 'normal';
  const player = content.player;
  let jumpMoves: Move[];
  if (variant === 'turbo') {
    jumpMoves = getTurboJumps(state, from, player);
  } else if (variant === 'ghost') {
    jumpMoves = getGhostJumps(state, from, player);
  } else {
    // 'normal' and 'big' both use standard adjacent hops
    jumpMoves = getJumpMoves(state, from, player);
  }

  const stepMoves = getStepMoves(state, from);
  const swapMoves = getSwapMoves(state, from, content.player);

  return [...stepMoves, ...jumpMoves, ...swapMoves];
}

// Get all valid moves for a player
export function getAllValidMoves(
  state: GameState,
  player: PlayerIndex
): Move[] {
  const allMoves: Move[] = [];

  // Find all pieces belonging to this player
  for (const [key, content] of state.board) {
    if (content.type === 'piece' && content.player === player) {
      const [q, r] = key.split(',').map(Number);
      const from = { q, r, s: -q - r };
      const moves = getValidMoves(state, from);
      allMoves.push(...moves);
    }
  }

  return allMoves;
}

// Check if a move is valid
export function isValidMove(
  state: GameState,
  move: Move,
  player: PlayerIndex
): boolean {
  // Check if there's a piece at the from position belonging to this player
  const content = state.board.get(coordKey(move.from));
  if (!content || content.type !== 'piece' || content.player !== player) {
    return false;
  }

  // Get all valid moves and check if this move is among them
  const validMoves = getValidMoves(state, move.from);
  return validMoves.some(
    (m) => cubeEquals(m.from, move.from) && cubeEquals(m.to, move.to)
  );
}
