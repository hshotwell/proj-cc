import type { BoardLayout, PlayerIndex, ColorMapping } from '@/types/game';
import type { SavedGameData } from '@/types/replay';
import { DEFAULT_BOARD_LAYOUT, getDefaultStartingPositions } from './defaultLayout';
import { reconstructGameStates } from './replay';
import { countPiecesInGoal, OPPOSITE_PLAYER } from './state';
import { ROTATION_FOR_PLAYER } from './constants';

/**
 * Flip a coord key 180° around the board centre: (q, r) → (−q, −r).
 * The standard board is point-symmetric, so every flipped key is still a
 * valid board cell.
 */
function invertKey(key: string): string {
  const [q, r] = key.split(',').map(Number);
  return `${-q},${-r}`;
}

export interface EndgamePuzzle {
  layout: BoardLayout;
  date: number;
  /** Color to use for this player's piece (from the original game). */
  playerColor: string | undefined;
  /** The single active player index in this puzzle. */
  humanPlayer: PlayerIndex;
  /** How many turns the player took to finish from this position in the original game (the par/goal). */
  goalMoves: number;
}

const HIDDEN_PUZZLES_KEY = 'chinese-checkers-hidden-puzzles';

export function loadHiddenPuzzleIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_PUZZLES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

export function hidePuzzle(layoutId: string): void {
  try {
    const hidden = loadHiddenPuzzleIds();
    hidden.add(layoutId);
    localStorage.setItem(HIDDEN_PUZZLES_KEY, JSON.stringify([...hidden]));
  } catch {
    // ignore
  }
}

/**
 * Extract two single-player endgame puzzles from a completed standard 2-player game —
 * one for each player.  Each puzzle has only that player's pieces on the board;
 * the opponent is removed so the player solves the position on their own.
 *
 * Endgame = first state where both players have ≥ 5 pieces in their goal zone
 * and the total is ≥ 12/20.  Falls back to 75 % of total moves when the
 * threshold is never crossed.
 *
 * Returns [] for custom-layout or non-2-player games, and for games too short
 * to produce a meaningful endgame.
 */
export function extractEndgamePuzzles(savedGame: SavedGameData): EndgamePuzzle[] {
  if (savedGame.initialConfig.isCustomLayout) return [];

  const { activePlayers, playerColors } = savedGame.initialConfig;
  if (activePlayers.length !== 2) return [];

  const states = reconstructGameStates(savedGame);
  if (states.length < 10) return [];

  // Find first state where both players have ≥ 5 pieces in goal, total ≥ 12
  let endgameIdx = -1;
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const counts = activePlayers.map(p => countPiecesInGoal(state, p));
    if (counts.reduce((a, b) => a + b, 0) >= 12 && counts.every(c => c >= 5)) {
      endgameIdx = i;
      break;
    }
  }
  if (endgameIdx === -1) {
    endgameIdx = Math.floor((states.length - 1) * 0.75);
  }

  const endgameState = states[endgameIdx];
  const dateLabel = new Date(savedGame.dateSaved).toLocaleDateString();

  // Count turns each player took from the endgame position to end of game
  // states[endgameIdx] was reached after applying moves[0..endgameIdx-1], so
  // moves at indices endgameIdx+ are the endgame moves.
  const endgameMoves = savedGame.moves.slice(endgameIdx);
  const playerGoalMoves = new Map<PlayerIndex, number>();
  for (const p of activePlayers) {
    const turnNums = new Set(
      endgameMoves
        .filter(m => m.player === p && m.turnNumber !== undefined)
        .map(m => m.turnNumber as number)
    );
    playerGoalMoves.set(p, turnNums.size);
  }

  return activePlayers.map((player, slot) => {
    // Collect this player's current piece positions
    const rawPositions: string[] = [];
    for (const [key, content] of endgameState.board) {
      if (content.type === 'piece' && content.player === player) {
        rawPositions.push(key);
      }
    }

    const rawGoal = getDefaultStartingPositions(OPPOSITE_PLAYER[player]);

    // If the player's goal sits at the bottom of the board (rotation ≠ 0°),
    // flip all coordinates 180° so the goal is always at the top in the
    // default 0° view — matching the preview and in-game orientation.
    const needsFlip = (ROTATION_FOR_PLAYER[player] ?? 0) !== 0;
    const positions = needsFlip ? rawPositions.map(invertKey) : rawPositions;
    const goal      = needsFlip ? rawGoal.map(invertKey)      : rawGoal;

    const goalMoves = playerGoalMoves.get(player) ?? 0;

    const layout: BoardLayout = {
      id: `endgame-${savedGame.id}-p${player}`,
      // Use "· 2" suffix on the second puzzle so identically-dated entries differ
      name: slot === 0 ? `Endgame · ${dateLabel}` : `Endgame · ${dateLabel} · 2`,
      cells: DEFAULT_BOARD_LAYOUT.cells,
      startingPositions: { [player]: positions } as Partial<Record<PlayerIndex, string[]>>,
      goalPositions: {
        [player]: goal,
      } as Partial<Record<PlayerIndex, string[]>>,
      createdAt: savedGame.dateSaved,
      puzzleGoalMoves: goalMoves,
    };

    return {
      layout,
      date: savedGame.dateSaved,
      playerColor: playerColors?.[player],
      humanPlayer: player,
      goalMoves,
    };
  });
}

/**
 * Load all saved games from localStorage and return all single-player endgame
 * puzzles, sorted most-recent first.
 */
export function loadEndgamePuzzles(): EndgamePuzzle[] {
  if (typeof window === 'undefined') return [];

  try {
    const indexRaw = localStorage.getItem('chinese-checkers-saved-games');
    if (!indexRaw) return [];
    const summaries = JSON.parse(indexRaw);
    if (!Array.isArray(summaries)) return [];

    const hidden = loadHiddenPuzzleIds();
    const puzzles: EndgamePuzzle[] = [];

    for (const summary of summaries) {
      if (summary.activePlayers?.length !== 2) continue;

      const raw = localStorage.getItem(`chinese-checkers-game-${summary.id}`);
      if (!raw) continue;

      try {
        const data = JSON.parse(raw) as SavedGameData;

        // Restore s coordinates (same as localGameStorage.loadGame)
        data.moves = data.moves.map((m) => ({
          ...m,
          from: { q: m.from.q, r: m.from.r, s: -m.from.q - m.from.r },
          to: { q: m.to.q, r: m.to.r, s: -m.to.q - m.to.r },
          ...(m.jumpPath
            ? { jumpPath: m.jumpPath.map((c) => ({ q: c.q, r: c.r, s: -c.q - c.r })) }
            : {}),
        }));

        puzzles.push(...extractEndgamePuzzles(data).filter(p => !hidden.has(p.layout.id)));
      } catch {
        // Skip malformed entries
      }
    }

    return puzzles.sort((a, b) => b.date - a.date);
  } catch {
    return [];
  }
}
