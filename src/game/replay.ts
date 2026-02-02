import type { Move, GameState, PlayerIndex } from '@/types/game';
import type { SavedGameData } from '@/types/replay';
import { cubeEquals } from './coordinates';
import { createGame } from './setup';
import { applyMove } from './state';

/**
 * Merge consecutive chain-jump hops into single moves.
 * Detection: move[i+1] continues move[i]'s chain if
 * moves[i].to equals moves[i+1].from and moves[i+1].isJump === true.
 * Merged move: from = first hop's from, to = last hop's to,
 * jumpPath = concatenated jumpPaths, isJump = true.
 */
export function normalizeMoveHistory(rawMoves: Move[], activePlayers: PlayerIndex[]): Move[] {
  if (rawMoves.length === 0) return [];

  const normalized: Move[] = [];
  let current: Move = { ...rawMoves[0] };
  // Track whose turn each raw move belongs to based on turn cycling
  let rawTurnPlayer = 0; // index into activePlayers for the first raw move

  for (let i = 1; i < rawMoves.length; i++) {
    const next = rawMoves[i];
    // Chain continuation: same player's turn, next starts where current ends, and it's a jump
    if (next.isJump && cubeEquals(current.to, next.from)) {
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

  const initialState = createGame(
    initialConfig.playerCount,
    initialConfig.activePlayers,
    initialConfig.playerColors,
    initialConfig.aiPlayers,
  );

  if (initialConfig.isCustomLayout) {
    initialState.isCustomLayout = true;
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
