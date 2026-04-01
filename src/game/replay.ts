import type { Move, GameState, PlayerIndex, BoardLayout } from '@/types/game';
import type { SavedGameData } from '@/types/replay';
import { cubeEquals } from './coordinates';
import { createGame, createGameFromLayout } from './setup';
import { applyMove } from './state';
import { computePlayerProgress } from './progress';

/**
 * Merge consecutive chain-jump hops into single moves.
 * Detection: move[i+1] continues move[i]'s chain if:
 * - Both moves are jumps (steps end the turn, can't be chained)
 * - Both moves are by the same player
 * - Both moves are from the same turn (same turnNumber)
 * - moves[i].to equals moves[i+1].from
 * Merged move: from = first hop's from, to = last hop's to,
 * jumpPath = concatenated jumpPaths, isJump = true.
 */
export function normalizeMoveHistory(rawMoves: Move[], activePlayers: PlayerIndex[]): Move[] {
  if (rawMoves.length === 0) return [];

  const normalized: Move[] = [];
  let current: Move = { ...rawMoves[0] };

  for (let i = 1; i < rawMoves.length; i++) {
    const next = rawMoves[i];
    // Chain continuation: both are jumps, same player, same turn, and next starts where current ends
    // Steps (isJump: false) always end the turn, so can never be part of a chain
    const samePlayer = current.player === next.player;
    const sameTurn = current.turnNumber !== undefined && current.turnNumber === next.turnNumber;
    const isContinuation = current.isJump && next.isJump && samePlayer && sameTurn && cubeEquals(current.to, next.from);

    if (isContinuation) {
      // Merge: extend current move
      current = {
        from: current.from,
        to: next.to,
        isJump: true,
        jumpPath: [
          ...(current.jumpPath || []),
          ...(next.jumpPath || []),
        ],
        isSwap: current.isSwap || next.isSwap,
        player: current.player,
        turnNumber: current.turnNumber,
      };
    } else {
      // Current move is complete, push it
      normalized.push(current);
      current = { ...next };
    }
  }
  // Push the last accumulated move
  normalized.push(current);

  return normalized;
}

/**
 * Reconstruct all intermediate game states from a saved game.
 * Returns array where states[0] = initial, states[n] = after move n.
 * Length = moves.length + 1.
 */
export function reconstructGameStates(savedGame: SavedGameData): GameState[] {
  const { initialConfig, moves } = savedGame;

  let initialState: GameState;

  if (initialConfig.isCustomLayout && initialConfig.customCells) {
    // Reconstruct custom board layout
    const layout: BoardLayout = {
      id: 'replay-layout',
      name: 'Replay Layout',
      cells: initialConfig.customCells,
      startingPositions: initialConfig.customStartingPositions || {},
      goalPositions: initialConfig.customGoalPositions,
      walls: initialConfig.customWalls,
      createdAt: 0,
    };
    initialState = createGameFromLayout(
      layout,
      initialConfig.playerColors,
      initialConfig.aiPlayers,
      undefined,
      initialConfig.teamMode,
    );
  } else {
    initialState = createGame(
      initialConfig.playerCount,
      initialConfig.activePlayers,
      initialConfig.playerColors,
      initialConfig.aiPlayers,
      undefined,
      initialConfig.teamMode,
    );
  }

  const states: GameState[] = [initialState];
  let current = initialState;

  for (const move of moves) {
    current = applyMove(current, move);
    states.push(current);
  }

  return states;
}

/**
 * Find the move with the longest jumpPath.
 * Returns null if no jumps exist.
 * @deprecated Prefer findBestHopGain for new code.
 */
export function findLongestHop(moves: Move[]): { moveIndex: number; jumpLength: number } | null {
  let best: { moveIndex: number; jumpLength: number } | null = null;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (move.isJump && move.jumpPath && move.jumpPath.length > 0) {
      const len = move.jumpPath.length;
      if (!best || len > best.jumpLength) {
        best = { moveIndex: i, jumpLength: len };
      }
    }
  }

  return best;
}

/**
 * For each player, find the jump move with the highest % progress gain.
 * Returns a Set of move indices — one entry per player who made at least one
 * positive-gain jump. Requires the reconstructed states array (length = moves.length + 1).
 */
export function findLongestHopIndices(moves: Move[], states: GameState[]): Set<number> {
  const bestByPlayer = new Map<PlayerIndex, { index: number; gain: number }>();

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move.isJump || move.player === undefined) continue;
    if (i + 1 >= states.length) continue;

    const gain = computePlayerProgress(states[i + 1], move.player) -
                 computePlayerProgress(states[i],     move.player);
    if (gain <= 0) continue;

    const current = bestByPlayer.get(move.player);
    if (!current || gain > current.gain) {
      bestByPlayer.set(move.player, { index: i, gain });
    }
  }

  return new Set(Array.from(bestByPlayer.values()).map(v => v.index));
}

/**
 * Return the single largest % progress gain from any jump move across all players.
 * Returns 0 if no improving jumps are found.
 */
export function findBestHopGain(moves: Move[], states: GameState[]): number {
  let best = 0;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move.isJump || move.player === undefined) continue;
    if (i + 1 >= states.length) continue;

    const gain = computePlayerProgress(states[i + 1], move.player) -
                 computePlayerProgress(states[i],     move.player);
    if (gain > best) best = gain;
  }

  return best;
}
