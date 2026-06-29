/**
 * Endgame solver for Chinese Checkers.
 *
 * CRITICAL RULES:
 * 1. NEVER move a piece to a shallower goal position (unless enabling entry)
 * 2. NEVER move a piece OUT of goal unless it enables an immediate entry
 * 3. ALWAYS extend chain jumps to maximum distance toward deepest goal
 * 4. When pieces are stuck, look ahead to find the minimal shuffle sequence
 * 5. Identify and execute "make room" moves - move blocking pieces deeper
 */

import type { GameState, PlayerIndex, CubeCoord, Move } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import { coordKey, cubeEquals, cubeDistance, centroid } from '../coordinates';
import { getGoalPositionsForState, countPiecesInGoal } from '../state';
import { getPlayerPieces } from '../setup';
import { getAllValidMoves, getValidMoves, canJumpOver } from '../moves';
import { applyMove } from '../state';
import { DIRECTIONS } from '../constants';
import { getCachedEndgameInsights } from '../learning';

/**
 * Classify a single piece's phase for move evaluation.
 * endgame: piece is in/near goal (within 3 cells) with no opponents between it and the goal.
 * endgame-contested: same proximity but an opponent piece is closer to goal than this piece.
 * midgame: piece is not near the goal.
 */
export function getPiecePhase(
  state: GameState,
  piece: CubeCoord,
  player: PlayerIndex
): 'midgame' | 'endgame' | 'endgame-contested' {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // If piece is already inside the goal zone, it is unambiguously in endgame
  if (goalKeys.has(coordKey(piece))) return 'endgame';

  const nearGoal = goalPositions.some(g => cubeDistance(piece, g) <= 3);
  if (!nearGoal) return 'midgame';

  const goalCenter = centroid(goalPositions);
  const pieceToGoalDist = cubeDistance(piece, goalCenter);

  for (const [key, content] of state.board) {
    if (content.type !== 'piece' || content.player === player) continue;
    const [q, r] = key.split(',').map(Number);
    const opponentPos: CubeCoord = { q, r, s: -q - r };
    // Opponents inside the goal only count if they are adjacent to our piece
    // (they are physically blocking entry), not if they are already deep inside
    // Opponents already deep in the goal zone don't make us "contested" unless
    // they are adjacent — a piece at (-4,8) shouldn't block entry at (-2,4).
    const opponentInGoal = goalKeys.has(key);
    if (opponentInGoal && cubeDistance(opponentPos, piece) > 1) continue;
    // Consider opponents within 3 cells of any goal position (the approach zone)
    const opponentNearGoal = goalPositions.some(g => cubeDistance(opponentPos, g) <= 3);
    if (!opponentNearGoal) continue;
    if (cubeDistance(opponentPos, goalCenter) < pieceToGoalDist) {
      return 'endgame-contested';
    }
  }

  return 'endgame';
}

/**
 * BFS over jump paths: can `piece` reach `targetGoalPos` via a chain of jumps?
 * Only counts jumps (not steps) — used to detect if a setup move unlocks a chain entry.
 * maxHops bounds the search to keep it fast (default 6).
 */
export function canReachGoalViaChain(
  state: GameState,
  piece: CubeCoord,
  targetGoalPos: CubeCoord,
  player: PlayerIndex,
  maxHops: number = 6
): boolean {
  const visited = new Set<string>();
  const queue: Array<{ pos: CubeCoord; hops: number }> = [{ pos: piece, hops: 0 }];
  visited.add(coordKey(piece));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (cubeEquals(current.pos, targetGoalPos)) return true;
    if (current.hops >= maxHops) continue;

    for (const dir of DIRECTIONS) {
      const over: CubeCoord = {
        q: current.pos.q + dir.q,
        r: current.pos.r + dir.r,
        s: current.pos.s + dir.s,
      };
      const land: CubeCoord = {
        q: current.pos.q + dir.q * 2,
        r: current.pos.r + dir.r * 2,
        s: current.pos.s + dir.s * 2,
      };

      if (!state.board.has(coordKey(land))) continue;
      if (state.board.get(coordKey(land))?.type !== 'empty') continue;
      if (!canJumpOver(state, over, player)) continue;

      const landKey = coordKey(land);
      if (!visited.has(landKey)) {
        visited.add(landKey);
        queue.push({ pos: land, hops: current.hops + 1 });
      }
    }
  }

  return false;
}

/**
 * Check if we're in late endgame where finishing logic should take over.
 * Trigger at 6+ pieces to focus on finishing efficiently.
 */
export function isLateEndgame(state: GameState, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const pieces = getPlayerPieces(state, player);

  let inGoal = 0;
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) {
      inGoal++;
    }
  }

  // Late endgame: 6+ pieces in goal (4 or fewer remaining).
  // The extreme-straggler bypass in findBestMove (pieces > 12 cells from goal)
  // handles the one case where the endgame solver was unreliable. Keeping this
  // at 6 ensures findEndgameMove and scoreEndgameMove still apply at 6-in-goal
  // so the AI correctly prioritises direct goal entries at that stage.
  return inGoal >= 6;
}

/**
 * Calculate the "depth" of a goal position.
 * Depth = distance from board center. Higher = deeper = should be filled first.
 */
export function getGoalPositionDepth(goalPos: CubeCoord): number {
  const boardCenter: CubeCoord = { q: 0, r: 0, s: 0 };
  return cubeDistance(goalPos, boardCenter);
}

/**
 * Get empty goal positions sorted by depth (deepest first).
 */
export function getEmptyGoalsByDepth(state: GameState, player: PlayerIndex): CubeCoord[] {
  const goalPositions = getGoalPositionsForState(state, player);
  const emptyGoals: Array<{ pos: CubeCoord; depth: number }> = [];

  for (const goal of goalPositions) {
    const content = state.board.get(coordKey(goal));
    if (content?.type === 'empty') {
      emptyGoals.push({ pos: goal, depth: getGoalPositionDepth(goal) });
    }
  }

  emptyGoals.sort((a, b) => b.depth - a.depth);
  return emptyGoals.map(g => g.pos);
}

/**
 * Find pieces NOT in goal positions.
 */
export function getPiecesOutsideGoal(state: GameState, player: PlayerIndex): CubeCoord[] {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const pieces = getPlayerPieces(state, player);
  return pieces.filter(p => !goalKeys.has(coordKey(p)));
}

/**
 * Check if a move places a piece directly into an empty goal from OUTSIDE.
 */
export function isDirectGoalEntry(state: GameState, move: Move, player: PlayerIndex): boolean {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  return goalKeys.has(coordKey(move.to)) && !goalKeys.has(coordKey(move.from));
}

/**
 * Check if an outside piece could enter a specific goal position via jump
 * if that position were empty.
 */
function couldEnterGoalIfEmpty(
  state: GameState,
  goalPos: CubeCoord,
  player: PlayerIndex,
  piecesOutside: CubeCoord[]
): CubeCoord | null {
  // Simulate the goal position being empty so chain detection is accurate
  const tempBoard = new Map(state.board);
  tempBoard.set(coordKey(goalPos), { type: 'empty' });
  const tempState: GameState = { ...state, board: tempBoard };

  for (const piece of piecesOutside) {
    // Single-step entry: outside piece adjacent to the vacated goal cell.
    // Previously this only checked chains, which missed cases like an
    // outside piece sitting one cell away from the freed goal slot.
    for (const dir of DIRECTIONS) {
      if (
        piece.q + dir.q === goalPos.q &&
        piece.r + dir.r === goalPos.r
      ) {
        return piece;
      }
    }
    if (canReachGoalViaChain(tempState, piece, goalPos, player)) {
      return piece;
    }
  }
  return null;
}

/**
 * Find a "make room" move: a piece in a shallower goal position that can move
 * deeper, freeing up the shallow position for another piece to enter.
 */
function findMakeRoomMove(
  state: GameState,
  player: PlayerIndex,
  allMoves: Move[],
  goalKeys: Set<string>,
  piecesOutside: CubeCoord[]
): Move | null {
  const goalPositions = getGoalPositionsForState(state, player);

  // Find occupied shallow goal positions that block potential entries
  const blockingPieces: Array<{
    pos: CubeCoord;
    depth: number;
    blockedPiece: CubeCoord;
  }> = [];

  for (const goalPos of goalPositions) {
    const content = state.board.get(coordKey(goalPos));
    if (content?.type !== 'piece' || content.player !== player) continue;

    // Check if an outside piece could enter here if this were empty
    const blockedPiece = couldEnterGoalIfEmpty(state, goalPos, player, piecesOutside);
    if (blockedPiece) {
      blockingPieces.push({
        pos: goalPos,
        depth: getGoalPositionDepth(goalPos),
        blockedPiece,
      });
    }
  }

  // Sort by depth (shallowest first - those should move out of the way)
  blockingPieces.sort((a, b) => a.depth - b.depth);

  // For each blocking piece, see if it can move deeper
  for (const { pos: blockingPos } of blockingPieces) {
    // Find moves from this blocking piece that go deeper in goal
    const deeperMoves = allMoves
      .filter(m => {
        if (!cubeEquals(m.from, blockingPos)) return false;
        if (!goalKeys.has(coordKey(m.to))) return false;
        return getGoalPositionDepth(m.to) > getGoalPositionDepth(m.from);
      })
      .sort((a, b) => getGoalPositionDepth(b.to) - getGoalPositionDepth(a.to));

    if (deeperMoves.length > 0) {
      return deeperMoves[0];
    }
  }

  return null;
}

/**
 * Find a move that creates a stepping stone for an outside piece to jump into goal.
 */
function findSteppingStoneMove(
  state: GameState,
  player: PlayerIndex,
  allMoves: Move[],
  goalKeys: Set<string>,
  piecesOutside: CubeCoord[],
  emptyGoals: CubeCoord[]
): Move | null {
  if (emptyGoals.length === 0 || piecesOutside.length === 0) return null;

  // For each empty goal, check if placing a stepping stone would enable a jump in
  for (const emptyGoal of emptyGoals) {
    for (const dir of DIRECTIONS) {
      // Where would the jumping piece need to be?
      const jumperPos: CubeCoord = {
        q: emptyGoal.q - dir.q * 2,
        r: emptyGoal.r - dir.r * 2,
        s: emptyGoal.s - dir.s * 2,
      };

      // Is there an outside piece there?
      const outsidePiece = piecesOutside.find(p => cubeEquals(p, jumperPos));
      if (!outsidePiece) continue;

      // Where would the stepping stone need to be?
      const stonePos: CubeCoord = {
        q: emptyGoal.q - dir.q,
        r: emptyGoal.r - dir.r,
        s: emptyGoal.s - dir.s,
      };

      // Is that position empty and on the board?
      const stoneContent = state.board.get(coordKey(stonePos));
      if (stoneContent?.type !== 'empty') continue;

      // Find a move that places a piece at stonePos (from anywhere)
      const stoneMove = allMoves.find(m => cubeEquals(m.to, stonePos));
      if (stoneMove) {
        // Verify this doesn't leave goal (or if it does, the entry is worth it)
        const fromInGoal = goalKeys.has(coordKey(stoneMove.from));
        const toInGoal = goalKeys.has(coordKey(stoneMove.to));

        // If leaving goal, only do it if the resulting entry is to a deeper position
        if (fromInGoal && !toInGoal) {
          const fromDepth = getGoalPositionDepth(stoneMove.from);
          const entryDepth = getGoalPositionDepth(emptyGoal);
          if (entryDepth <= fromDepth) continue; // Not worth leaving goal
        }

        return stoneMove;
      }
    }
  }

  return null;
}

/**
 * Find the BEST endgame move. This should be the PRIMARY decision maker.
 * CRITICAL: This function should ALWAYS return a move if moves are available.
 * It uses a strict priority system to ensure optimal endgame play.
 */
export function findEndgameMove(state: GameState, player: PlayerIndex): Move | null {
  const allRawMoves = getAllValidMoves(state, player);
  if (allRawMoves.length === 0) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  const goalCenter = centroid(goalPositions);

  // Hard rules applied once here — they propagate to ALL priorities that use `moves`:
  //   1. A piece inside the goal zone must NEVER leave it.
  //   2. A piece OUTSIDE the goal must never move backward (increase distance to
  //      goal centre). This is the root cause of "inverted direction" bugs for
  //      players whose goal is on a non-obvious axis: every priority in this
  //      function draws from `moves`, so filtering here fixes them all at once.
  const allMoves = allRawMoves.filter(m => {
    const fromInGoal = goalKeys.has(coordKey(m.from));
    const toInGoal = goalKeys.has(coordKey(m.to));
    if (fromInGoal && !toInGoal) return false; // Never leave the goal zone
    if (!fromInGoal) {
      // Outside piece: reject any move that increases distance to the goal centre.
      const d = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
      if (d < -0.5) return false; // Backward step/jump — skip
    }
    return true;
  });

  // If filtering left us with nothing, fall back to all moves (prevents deadlock
  // in the rare case where a piece is completely boxed in with only backward paths)
  const moves = allMoves.length > 0 ? allMoves : allRawMoves;

  const piecesOutside = getPiecesOutsideGoal(state, player);
  const emptyGoals = getEmptyGoalsByDepth(state, player);

  // If no pieces outside goal AND no empty goals, game is won - any move is fine
  if (piecesOutside.length === 0 && emptyGoals.length === 0) {
    return moves[0];
  }

  // PRIORITY 0: Back-piece preference. When 2+ pieces are outside goal and the
  // back-most piece(s) are meaningfully behind the rest, advance one of them
  // BEFORE running the in-goal shuffle / stepping-stone priorities. This is the
  // fundamental "back piece first" principle that the lower priorities don't
  // naturally capture.
  //
  // Tie handling: ALL pieces at the maximum outside-piece distance are treated
  // as back pieces; the gap is measured against the closest piece below max.
  // This catches scenarios with two symmetric back pieces.
  //
  // Strictness: no "give way to a big chain elsewhere" safety. The user's
  // principle is unconditional — a forward move on the back piece always wins
  // over any move from a non-back piece. Big chains from front pieces remain
  // available next turn; back-piece neglect compounds over many turns.
  if (piecesOutside.length >= 2) {
    const pieceDists = piecesOutside.map(p => ({ p, d: cubeDistance(p, goalCenter) }));
    pieceDists.sort((a, b) => b.d - a.d);
    const maxDist = pieceDists[0].d;
    const firstBelow = pieceDists.find(pd => pd.d < maxDist);
    const nextBestDist = firstBelow ? firstBelow.d : -Infinity;

    if (maxDist - nextBestDist >= 1) {
      // Perpendicular-to-goal vector for lateral-drift comparisons. Vacating
      // an on-axis cell tempts a teammate to re-fill it next turn — the
      // back-and-forth waste pattern (Flags 13/14). Vacating an off-axis cell
      // leaves a hole no teammate wants to step into.
      const gLen = Math.sqrt(goalCenter.q * goalCenter.q + goalCenter.r * goalCenter.r);
      const haveAxis = gLen > 0.01;
      const px = haveAxis ? -goalCenter.r / gLen : 0;
      const py = haveAxis ?  goalCenter.q / gLen : 0;
      const lateralDrift = (p: CubeCoord) =>
        haveAxis ? Math.abs(p.q * px + p.r * py) : 0;

      const backPieces = pieceDists.filter(pd => pd.d === maxDist).map(pd => pd.p);
      const backForwards = moves
        .filter(m => backPieces.some(bp => cubeEquals(m.from, bp)))
        .map(m => {
          const isEntry = isDirectGoalEntry(state, m, player);
          const nextState = applyMove(state, m);

          // (a) Self-jump lookahead: from m.to, what is the deepest goal cell
          // the moved piece can directly jump into next turn? Catches the
          // "lateral step that opens a chain into the corner" pattern (Flag 6).
          let nextTurnGoalEntryDepth = 0;
          if (!isEntry) {
            for (const nm of getValidMoves(nextState, m.to)) {
              if (nm.isJump && goalKeys.has(coordKey(nm.to))) {
                const d = getGoalPositionDepth(nm.to);
                if (d > nextTurnGoalEntryDepth) nextTurnGoalEntryDepth = d;
              }
            }
          }

          // (b) Leapfrog lookahead: can a DIFFERENT friendly piece adjacent to
          // m.to now jump OVER m.to to an empty cell? When yes, our move
          // converted itself into a stepping stone. Catches the "same-destination
          // tiebreak — pick the source the other piece can jump over" pattern
          // (Flag 2) and the goal-entry leapfrog (Flag 3, lands in goal).
          let leapfrogGain = 0;
          let leapfrogIntoGoal = false;
          for (const dir of DIRECTIONS) {
            const neighbor: CubeCoord = {
              q: m.to.q + dir.q, r: m.to.r + dir.r, s: m.to.s + dir.s,
            };
            const nc = nextState.board.get(coordKey(neighbor));
            if (!nc || nc.type !== 'piece' || nc.player !== player) continue;
            const land: CubeCoord = {
              q: m.to.q - dir.q, r: m.to.r - dir.r, s: m.to.s - dir.s,
            };
            const lc = nextState.board.get(coordKey(land));
            if (!lc || lc.type !== 'empty') continue;
            const gain = cubeDistance(neighbor, goalCenter) - cubeDistance(land, goalCenter);
            if (gain <= 0) continue;
            if (gain > leapfrogGain) leapfrogGain = gain;
            if (goalKeys.has(coordKey(land))) leapfrogIntoGoal = true;
          }

          return {
            move: m,
            improvement: cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter),
            isEntry,
            entryDepth: isEntry ? getGoalPositionDepth(m.to) : 0,
            nextTurnGoalEntryDepth,
            leapfrogGain,
            leapfrogIntoGoal,
            sourceLateral: lateralDrift(m.from),
            jumpLen: m.jumpPath?.length || 0,
          };
        })
        // Allow: direct goal entries, forward steps/jumps, AND lateral moves
        // that open a chain into goal next turn. Goal entries always pass even
        // when the centroid metric shows zero improvement (Flag 7: chain into
        // the corner). Lateral setup moves pass when the destination unlocks
        // a chain into goal (Flag 6: step to a stepping-stone cell).
        .filter(s => s.isEntry || s.improvement >= 1 || s.nextTurnGoalEntryDepth > 0);
      backForwards.sort((a, b) => {
        if (a.isEntry !== b.isEntry) return a.isEntry ? -1 : 1;
        // Among goal entries, the DEEPEST cell wins. Corner goal cells become
        // unreachable for other pieces once the chain pieces are spent, so they
        // must be claimed by the chain that can reach them now.
        if (a.isEntry && b.isEntry && a.entryDepth !== b.entryDepth) {
          return b.entryDepth - a.entryDepth;
        }
        // Among non-entry moves, prefer the one whose destination unlocks the
        // deepest next-turn goal entry. A "0-improvement" step into a chain
        // launchpad beats a "+1-improvement" step that dead-ends.
        if (a.nextTurnGoalEntryDepth !== b.nextTurnGoalEntryDepth) {
          return b.nextTurnGoalEntryDepth - a.nextTurnGoalEntryDepth;
        }
        // Leapfrog landing INSIDE the goal is the strongest tiebreak — Flag 3:
        // moving (-1,3) to (-1,4) lets (0,3) leapfrog into the empty goal cell
        // (-2,5), while moving (0,3) to the same spot does not.
        if (a.leapfrogIntoGoal !== b.leapfrogIntoGoal) return a.leapfrogIntoGoal ? -1 : 1;
        // Leapfrog tiebreak only when gains differ by MORE than 1 cell.
        // Otherwise let the source-lateral tiebreak decide — a 1-cell leapfrog
        // edge doesn't justify leaving an on-axis source cell vacant when a
        // teammate is poised to back-fill it (Flag 13/14 waste pattern).
        if (Math.abs(b.leapfrogGain - a.leapfrogGain) > 1) {
          return b.leapfrogGain - a.leapfrogGain;
        }
        // Source-lateral tiebreak: prefer to vacate the more off-axis source
        // cell. Leaving an on-axis cell empty draws a teammate to re-fill it
        // next turn (sidestep waste); leaving an off-axis cell empty doesn't.
        // Applies only when leapfrog gains are within 1 (handled above).
        if (Math.abs(a.sourceLateral - b.sourceLateral) > 0.1) {
          return b.sourceLateral - a.sourceLateral;
        }
        if (a.leapfrogGain !== b.leapfrogGain) return b.leapfrogGain - a.leapfrogGain;
        if (Math.abs(b.improvement - a.improvement) > 0.5) return b.improvement - a.improvement;
        return b.jumpLen - a.jumpLen;
      });

      if (backForwards.length > 0) {
        return backForwards[0].move;
      }
    }
  }

  // PRIORITY 1: Direct goal entry — usually first choice, but DEFERRED when a
  // back piece is stranded and the entering piece is a front-of-pack stepping
  // stone the back piece still needs. Without this gate the solver would burn
  // through the easy entries and abandon the back piece (the persistent
  // "left behind" pattern).
  const directEntries = moves
    .filter(m => isDirectGoalEntry(state, m, player))
    .map(m => ({
      move: m,
      depth: getGoalPositionDepth(m.to),
      jumpLen: m.jumpPath?.length || 0,
      fromDist: cubeDistance(m.from, goalCenter),
    }))
    .sort((a, b) => {
      if (b.depth !== a.depth) return b.depth - a.depth;
      return b.jumpLen - a.jumpLen;
    });

  if (directEntries.length > 0) {
    // Check for stranded back piece. If one exists, only take direct entries
    // whose FROM piece is the back piece itself — otherwise defer entry and
    // let the lower priorities advance the back piece.
    let maxOutsideDist = 0;
    if (piecesOutside.length >= 2) {
      for (const p of piecesOutside) {
        const d = cubeDistance(p, goalCenter);
        if (d > maxOutsideDist) maxOutsideDist = d;
      }
    }
    const hasStrandedBack = piecesOutside.length >= 2 && maxOutsideDist > 9;
    if (!hasStrandedBack) {
      return directEntries[0].move;
    }
    // Take the entry only if it comes from the stranded back piece itself
    // (a chain jump from the back piece all the way to goal — best of both worlds).
    const backPieceEntry = directEntries.find(e => Math.abs(e.fromDist - maxOutsideDist) < 0.5);
    if (backPieceEntry) return backPieceEntry.move;
    // Otherwise let lower priorities advance the back piece.
  }

  // PRIORITY 2: "Make room" - move a blocking piece deeper to enable entry
  const makeRoomMove = findMakeRoomMove(state, player, moves, goalKeys, piecesOutside);
  if (makeRoomMove) {
    return makeRoomMove;
  }

  // PRIORITY 3: Move pieces DEEPER within goal (consolidate at back)
  const deeperMoves = moves
    .filter(m => {
      if (!goalKeys.has(coordKey(m.from))) return false;
      if (!goalKeys.has(coordKey(m.to))) return false;
      const fromDepth = getGoalPositionDepth(m.from);
      const toDepth = getGoalPositionDepth(m.to);
      return toDepth > fromDepth;
    })
    .map(m => ({
      move: m,
      depthGain: getGoalPositionDepth(m.to) - getGoalPositionDepth(m.from)
    }))
    .sort((a, b) => b.depthGain - a.depthGain);

  if (deeperMoves.length > 0) {
    return deeperMoves[0].move;
  }

  // PRIORITY 4: Create stepping stone for goal entry
  const steppingStoneMove = findSteppingStoneMove(
    state, player, moves, goalKeys, piecesOutside, emptyGoals
  );
  if (steppingStoneMove) {
    return steppingStoneMove;
  }

  // PRIORITY 5: Shuffle within goal that IMMEDIATELY enables a goal entry
  // Cap to 20 in-goal moves to prevent blowup when many chain paths exist.
  let inGoalCheckCount = 0;
  const inGoalShuffles: Array<{ move: Move; enablesDepth: number }> = [];
  for (const move of moves) {
    if (!goalKeys.has(coordKey(move.from))) continue;
    if (!goalKeys.has(coordKey(move.to))) continue;
    if (inGoalCheckCount++ >= 20) break;

    const fromDepth = getGoalPositionDepth(move.from);
    const toDepth = getGoalPositionDepth(move.to);

    // Don't go shallower
    if (toDepth < fromDepth) continue;

    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);
    const enabledEntries = nextMoves
      .filter(m => isDirectGoalEntry(nextState, m, player))
      .map(m => getGoalPositionDepth(m.to));

    if (enabledEntries.length > 0) {
      inGoalShuffles.push({
        move,
        enablesDepth: Math.max(...enabledEntries)
      });
    }
  }

  if (inGoalShuffles.length > 0) {
    inGoalShuffles.sort((a, b) => b.enablesDepth - a.enablesDepth);
    return inGoalShuffles[0].move;
  }

  // PRIORITY 6: 2-4 move lookahead for shuffle/reposition sequences
  // Depth 3 captures the "move blocker deeper so outside piece can chain further in" sequences.
  // Node counter is reset here so each findEndgameMove call gets a fresh budget.
  _shuffleNodesChecked = 0;
  const shuffleSequence = findShuffleSequence(state, player, moves, goalKeys, 3);
  if (shuffleSequence) {
    return shuffleSequence;
  }

  // PRIORITY 7: Move outside pieces toward the deepest empty goal
  if (emptyGoals.length > 0 && piecesOutside.length > 0) {
    const targetGoal = emptyGoals[0];
    const goalCenter = centroid(goalPositions);

    const outsideMoves: Array<{
      move: Move;
      pieceDistFromGoal: number;
      improvement: number;
      centerImprovement: number;
      jumpLen: number;
    }> = [];

    for (const piece of piecesOutside) {
      const distToGoal = cubeDistance(piece, targetGoal);
      const distToCenter = cubeDistance(piece, goalCenter);
      for (const move of moves) {
        if (!cubeEquals(move.from, piece)) continue;

        const newDist = cubeDistance(move.to, targetGoal);
        const newDistToCenter = cubeDistance(move.to, goalCenter);
        outsideMoves.push({
          move,
          pieceDistFromGoal: distToGoal,
          improvement: distToGoal - newDist,
          centerImprovement: distToCenter - newDistToCenter,
          jumpLen: move.jumpPath?.length || 0
        });
      }
    }

    outsideMoves.sort((a, b) => {
      // 0. Multi-hop chain jumps with positive improvement come first
      const aBig = (a.move.jumpPath?.length ?? 0) > 1 && a.improvement > 0 ? 1 : 0;
      const bBig = (b.move.jumpPath?.length ?? 0) > 1 && b.improvement > 0 ? 1 : 0;
      if (bBig !== aBig) return bBig - aBig;

      // 1. When BOTH moves are forward-improving, a piece 4+ cells farther from
      //    goal always wins. Without this gate the closer piece's larger relative
      //    improvement (e.g. 2-cell step vs 1-cell step) outranked the more
      //    urgent back piece — the persistent "back pieces left behind" pattern.
      const aForward = a.improvement > 0;
      const bForward = b.improvement > 0;
      if (aForward && bForward) {
        const distGap = a.pieceDistFromGoal - b.pieceDistFromGoal;
        if (Math.abs(distGap) >= 4) return distGap > 0 ? -1 : 1;
      }

      // 2. Improvement toward target goal
      if (Math.abs(b.improvement - a.improvement) > 0.5) return b.improvement - a.improvement;
      // 3. Farther pieces first (more to gain)
      if (Math.abs(b.pieceDistFromGoal - a.pieceDistFromGoal) > 0.5) return b.pieceDistFromGoal - a.pieceDistFromGoal;
      // 4. Any jump over step
      return b.jumpLen - a.jumpLen;
    });

    // Keep moves that improve toward the target goal OR toward the goal center.
    // This prevents backward walks when the specific target cell is off-axis.
    const goodMoves = outsideMoves.filter(
      m => m.improvement >= 0 || m.centerImprovement > 0
    );
    if (goodMoves.length > 0) {
      return goodMoves[0].move;
    }

    // Secondary fallback: at minimum, don't go backward relative to goal centroid.
    // The primary fallback below could return a backward move if all improvements
    // are negative — avoid that when any lateral-or-forward move exists.
    const nonBackward = outsideMoves.filter(m => m.centerImprovement >= 0);
    if (nonBackward.length > 0) {
      return nonBackward[0].move;
    }

    if (outsideMoves.length > 0) {
      return outsideMoves[0].move; // absolute last resort
    }
  }

  // PRIORITY 8: Any remaining safe move.
  // Critical: when outside pieces still exist, NEVER fall back to an in-goal
  // shuffle. The infinite sidestep loops at the end of games trace to this path
  // — the endgame solver was picking an in-goal lateral when an outside piece
  // had perfectly valid forward moves. Restrict candidates to outside-piece
  // moves first; only fall through to in-goal moves if there are no outside pieces.
  if (moves.length > 0) {
    const goalCenter = centroid(goalPositions);
    const outsidePieceMoves = piecesOutside.length > 0
      ? moves.filter(m => !goalKeys.has(coordKey(m.from)))
      : moves;
    const candidates = outsidePieceMoves.length > 0 ? outsidePieceMoves : moves;
    const scored = candidates.map(m => {
      const forward = cubeDistance(m.from, goalCenter) - cubeDistance(m.to, goalCenter);
      const jumpLen = m.jumpPath?.length || 0;
      const tiebreaker = Math.random() * 0.01;
      return { move: m, score: forward * 10 + jumpLen + tiebreaker };
    });
    scored.sort((a, b) => b.score - a.score);
    const forwardFirst = scored.find(s => s.score >= 0);
    return (forwardFirst ?? scored[0]).move;
  }

  return moves[0] ?? allRawMoves[0];
}

// Node budget shared across the current findShuffleSequence call tree.
// Reset in findEndgameMove before each invocation.
let _shuffleNodesChecked = 0;
const SHUFFLE_NODE_LIMIT = 400;

/**
 * Find a shuffle sequence up to `maxDepth` moves that enables a goal entry.
 * Enhanced to consider moves that reposition pieces to enable jumps.
 */
function findShuffleSequence(
  state: GameState,
  player: PlayerIndex,
  moves: Move[],
  goalKeys: Set<string>,
  maxDepth: number
): Move | null {
  if (maxDepth <= 0) return null;
  if (_shuffleNodesChecked >= SHUFFLE_NODE_LIMIT) return null;

  // Consider goal rearrangements that don't go shallower,
  // AND moves from outside that might position for a jump
  const validMoves = moves.filter(m => {
    const fromInGoal = goalKeys.has(coordKey(m.from));
    const toInGoal = goalKeys.has(coordKey(m.to));

    // Goal to goal: don't go shallower
    if (fromInGoal && toInGoal) {
      const fromDepth = getGoalPositionDepth(m.from);
      const toDepth = getGoalPositionDepth(m.to);
      return toDepth >= fromDepth;
    }

    // Outside to outside: allow (positioning moves)
    if (!fromInGoal && !toInGoal) {
      return true;
    }

    // Goal to outside: only in deeper search (may create stepping stone)
    if (fromInGoal && !toInGoal) {
      return maxDepth >= 3; // Allow in later stages of search
    }

    // Outside to goal: always good
    return true;
  });

  for (const move of validMoves) {
    if (_shuffleNodesChecked >= SHUFFLE_NODE_LIMIT) break;
    _shuffleNodesChecked++;

    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);

    // Check if this enables entry
    if (nextMoves.some(m => isDirectGoalEntry(nextState, m, player))) {
      return move;
    }

    // Recurse with reduced depth
    if (maxDepth > 1) {
      const deeper = findShuffleSequence(nextState, player, nextMoves, goalKeys, maxDepth - 1);
      if (deeper) {
        return move;
      }
    }
  }

  return null;
}

/**
 * BFS over our own move sequences (opponent frozen) to find the minimum-move
 * path to fill all remaining empty goal slots. Only activates for small finishing
 * puzzles (≤3 pieces outside, ≤4 empty goal slots) where BFS is tractable.
 * Returns the first move of the optimal sequence, or null if not found within 8 moves.
 */
export function findOptimalEndgameSequence(
  state: GameState,
  player: PlayerIndex
): Move | null {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const piecesOutside = getPiecesOutsideGoal(state, player);
  const emptyGoals = getEmptyGoalsByDepth(state, player);

  // Only tractable for small finishing puzzles
  if (piecesOutside.length === 0 || piecesOutside.length > 3) return null;
  if (emptyGoals.length > 4) return null;

  type BoardCell = { type: 'empty' } | { type: 'piece'; player: number };

  // Apply a single move to a board copy WITHOUT advancing the turn
  const applyToBoard = (board: Map<string, BoardCell>, move: Move): Map<string, BoardCell> => {
    const next = new Map(board);
    const content = next.get(coordKey(move.from));
    next.set(coordKey(move.from), { type: 'empty' });
    next.set(coordKey(move.to), content!);
    return next;
  };

  // Hash only our piece positions (opponent is frozen — not in the search)
  const hashBoard = (board: Map<string, BoardCell>): string => {
    const positions: string[] = [];
    for (const [key, cell] of board) {
      if (cell.type === 'piece' && (cell as { type: 'piece'; player: number }).player === player) {
        positions.push(key);
      }
    }
    return positions.sort().join('|');
  };

  // Check if all goal positions are filled by our player
  const isSolved = (board: Map<string, BoardCell>): boolean =>
    goalPositions.every(g => {
      const cell = board.get(coordKey(g));
      return cell?.type === 'piece' && (cell as { type: 'piece'; player: number }).player === player;
    });

  // Tiebreak weight for a single move. The BFS finds A min-depth sequence — but
  // when several first moves lead to min-depth solutions, iteration order picks
  // among them. Sorting "best move first" makes BFS return the strongest
  // first move: fill the deepest goal cell, then prefer longer chain jumps,
  // then any forward jump, then steps. Matches the user's repeated flag pattern
  // (Flag 7: deepest endzone, Flag 6: jump-enabling step).
  const moveTiebreakScore = (m: Move): number => {
    let s = 0;
    if (goalKeys.has(coordKey(m.to))) {
      s += 10_000 + getGoalPositionDepth(m.to) * 100;
    }
    if (m.isJump) {
      s += 100;
      if (m.jumpPath) s += m.jumpPath.length * 10;
    }
    return s;
  };

  // Get candidate moves for our pieces: no goal-leaving allowed.
  // Sorted by tiebreak score so the BFS naturally prefers stronger first moves
  // when multiple min-depth solutions exist.
  const getCandidates = (board: Map<string, BoardCell>): Move[] => {
    const simState: GameState = {
      ...state,
      board: board as GameState['board'],
      currentPlayer: player,
    };
    const moves = getAllValidMoves(simState, player);
    const filtered = moves.filter(m => {
      const fromInGoal = goalKeys.has(coordKey(m.from));
      const toInGoal = goalKeys.has(coordKey(m.to));
      if (fromInGoal && !toInGoal) return false; // Never leave goal
      return true;
    });
    filtered.sort((a, b) => moveTiebreakScore(b) - moveTiebreakScore(a));
    return filtered;
  };

  // BFS
  type Entry = { board: Map<string, BoardCell>; firstMove: Move; depth: number };
  const visited = new Set<string>();
  const queue: Entry[] = [];

  const initialBoard = state.board as Map<string, BoardCell>;
  visited.add(hashBoard(initialBoard));

  for (const move of getCandidates(initialBoard)) {
    const nextBoard = applyToBoard(initialBoard, move);
    const hash = hashBoard(nextBoard);
    if (visited.has(hash)) continue;
    visited.add(hash);
    if (isSolved(nextBoard)) return move;
    queue.push({ board: nextBoard, firstMove: move, depth: 1 });
  }

  const MAX_DEPTH = 8;
  const MAX_BFS_NODES = 4000;
  while (queue.length > 0) {
    if (visited.size > MAX_BFS_NODES) break; // Safety cap — too many states to explore
    const { board, firstMove, depth } = queue.shift()!;
    if (depth >= MAX_DEPTH) continue;
    for (const move of getCandidates(board)) {
      const nextBoard = applyToBoard(board, move);
      const hash = hashBoard(nextBoard);
      if (visited.has(hash)) continue;
      visited.add(hash);
      if (isSolved(nextBoard)) return firstMove;
      queue.push({ board: nextBoard, firstMove, depth: depth + 1 });
    }
  }

  return null;
}

/**
 * For endgame-phase pieces making a lateral or backward move:
 * returns a large positive score if the move unlocks a new chain-jump path
 * to a goal cell (setup move), or a heavy penalty if it sets nothing up.
 * Returns 0 for midgame pieces or forward moves (handled elsewhere).
 */
export function evaluateEndgameLateral(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const phase = getPiecePhase(state, move.from, player);
  if (phase === 'midgame') return 0;

  // Premature-endgame guard: getPiecePhase classifies any piece within 3 cells
  // of a goal cell as "endgame", which lets this scorer fire when 0/10 pieces
  // are actually in goal. In that situation a lateral move is not yet an
  // endgame-shaped decision and the (state-sensitive) chain-unlock heuristic
  // tends to over-reward routine forward-staging laterals. Require at least
  // a couple of pieces actually in the goal before this scorer takes over.
  if (countPiecesInGoal(state, player) < 2) return 0;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  if (distAfter < distBefore) return 0; // Forward move — not a lateral

  const nextState = applyMove(state, move);
  const emptyGoals = getEmptyGoalsByDepth(nextState, player);
  if (emptyGoals.length === 0) return -800; // Goal is full

  const piecesOutsideBefore = getPiecesOutsideGoal(state, player);
  const piecesOutsideAfter = getPiecesOutsideGoal(nextState, player);

  let bestDepthUnlocked = 0;

  for (const emptyGoal of emptyGoals) {
    const depth = getGoalPositionDepth(emptyGoal);

    // Was this goal already reachable by any piece before the move?
    const wasReachable = piecesOutsideBefore.some(p =>
      canReachGoalViaChain(state, p, emptyGoal, player)
    );
    if (wasReachable) continue;

    // Is it reachable after the move?
    const isReachableNow = piecesOutsideAfter.some(p =>
      canReachGoalViaChain(nextState, p, emptyGoal, player)
    );
    if (isReachableNow) {
      bestDepthUnlocked = Math.max(bestDepthUnlocked, depth);
    }
  }

  if (bestDepthUnlocked > 0) {
    // Capped + scaled: previous 500/depth was so large it swamped every
    // anti-sidestep penalty in the codebase. 150/depth, capped at depth 4,
    // means max +600 — still a meaningful tiebreaker, no longer a steamroller.
    return Math.min(bestDepthUnlocked, 4) * 150;
  }

  return -800; // No setup value detected
}

/**
 * Score a move for endgame purposes.
 * Used when findEndgameMove returns null but we're still in late endgame.
 * Scores are VERY large to dominate regular evaluation scores.
 */
export function scoreEndgameMove(
  state: GameState,
  move: Move,
  player: PlayerIndex,
  personality?: AIPersonality
): number {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));
  const emptyGoals = getEmptyGoalsByDepth(state, player);
  const goalCenter = centroid(goalPositions);
  const piecesOutside = getPiecesOutsideGoal(state, player);

  let score = 0;

  // Swap move: displaces an opponent from our goal cell — highly valuable.
  // Personality-weighted: defensive prizes this, aggressive less so.
  if (move.isSwap) {
    const swapDepth = getGoalPositionDepth(move.to);
    const baseSwapBonus = 30000 + swapDepth * 800;
    const personalityMultiplier =
      personality === 'defensive' ? 1.5 :
      personality === 'aggressive' ? 0.6 : 1.0;
    score += baseSwapBonus * personalityMultiplier;
  }

  const fromInGoal = goalKeys.has(coordKey(move.from));
  const toInGoal = goalKeys.has(coordKey(move.to));

  // MASSIVE bonus for direct goal entry (outside -> inside)
  if (!fromInGoal && toInGoal) {
    const depth = getGoalPositionDepth(move.to);
    let entryBonus = 50000 + depth * 1000;
    if (move.jumpPath) {
      entryBonus += move.jumpPath.length * 500;
    }

    // When a back piece is stranded far behind AND the entering piece is one of
    // the front pieces, discount the entry: those mid-board pieces are stepping
    // stones the back piece needs to chain forward. Letting them disappear into
    // goal too early forces the back piece to walk alone — the persistent
    // "left behind" pattern. The back piece can use them now, the goal slot will
    // still be there in a couple of turns.
    if (piecesOutside.length >= 2) {
      let maxOutsideDist = 0;
      for (const p of piecesOutside) {
        const d = cubeDistance(p, goalCenter);
        if (d > maxOutsideDist) maxOutsideDist = d;
      }
      const movingFromDist = cubeDistance(move.from, goalCenter);
      // Tiered discount. The strict tier (gap≥5 AND maxDist>9) stays at 0.08x
      // for extreme strandings. A new looser tier (gap≥3 AND maxDist>6) cuts
      // the entry by half — catches the "front piece grabs goal slot while
      // back piece is moderately behind" pattern (Flag 2: gap=4, maxDist=7).
      if (maxOutsideDist - movingFromDist >= 5 && maxOutsideDist > 9) {
        entryBonus *= 0.08;
      } else if (maxOutsideDist - movingFromDist >= 3 && maxOutsideDist > 6) {
        entryBonus *= 0.5;
      }
    }
    score += entryBonus;
  }

  // Within goal: reward deeper, ABSOLUTE VETO for shallower
  if (fromInGoal && toInGoal) {
    const fromDepth = getGoalPositionDepth(move.from);
    const toDepth = getGoalPositionDepth(move.to);
    if (toDepth > fromDepth) {
      score += 10000 + (toDepth - fromDepth) * 2000;

      // Extra bonus if this "makes room" for an outside piece
      const blockedPiece = couldEnterGoalIfEmpty(state, move.from, player, piecesOutside);
      if (blockedPiece) {
        score += 15000; // Big bonus for unblocking an entry
      }
    } else if (toDepth < fromDepth) {
      score -= 100000;
    }
  }

  // ABSOLUTE VETO for leaving goal unless it enables immediate entry
  if (fromInGoal && !toInGoal) {
    const nextState = applyMove(state, move);
    const nextMoves = getAllValidMoves(nextState, player);
    const enablesEntry = nextMoves.some(m => isDirectGoalEntry(nextState, m, player));

    // Check if this creates a stepping stone for a jump into goal
    const createsSteppingStone = (() => {
      for (const emptyGoal of emptyGoals) {
        for (const dir of DIRECTIONS) {
          const stonePos: CubeCoord = {
            q: emptyGoal.q - dir.q,
            r: emptyGoal.r - dir.r,
            s: emptyGoal.s - dir.s,
          };
          if (cubeEquals(move.to, stonePos)) {
            // Check if there's an outside piece that could jump
            const jumperPos: CubeCoord = {
              q: emptyGoal.q - dir.q * 2,
              r: emptyGoal.r - dir.r * 2,
              s: emptyGoal.s - dir.s * 2,
            };
            if (piecesOutside.some(p => cubeEquals(p, jumperPos))) {
              return true;
            }
          }
        }
      }
      return false;
    })();

    if (enablesEntry) {
      score += 5000;
    } else if (createsSteppingStone) {
      score += 3000; // Leaving goal to be a stepping stone
    } else {
      score -= 100000;
    }
  }

  // Outside goal: bonus for approaching deepest empty goal
  if (!fromInGoal && !toInGoal && emptyGoals.length > 0) {
    const target = emptyGoals[0];
    const improvement = cubeDistance(move.from, target) - cubeDistance(move.to, target);
    score += improvement * 1000;

    if (move.jumpPath && move.jumpPath.length > 0) {
      score += move.jumpPath.length * 500;
    }

    const distFromGoal = cubeDistance(move.from, goalCenter);
    score += distFromGoal * 100;
  }

  // Check if this move enables goal entry next turn
  const nextState = applyMove(state, move);
  const nextMoves = getAllValidMoves(nextState, player);
  const enabledEntries = nextMoves.filter(m => isDirectGoalEntry(nextState, m, player));
  for (const entry of enabledEntries) {
    const depth = getGoalPositionDepth(entry.to);
    score += 3000 + depth * 500;
  }

  // Apply learned endgame adjustments
  const endgameInsights = getCachedEndgameInsights();
  if (endgameInsights && endgameInsights.gamesAnalyzed > 10) {
    const inGoal = countPiecesInGoal(state, player);

    // If winners fill deep-first, increase depth bonus for entries
    if (endgameInsights.optimalFillOrderScore > 0.6 && !fromInGoal && toInGoal) {
      const depth = getGoalPositionDepth(move.to);
      score += depth * 300;
    }

    // If winners rarely shuffle, reduce score for within-goal rearrangements
    if (endgameInsights.avgShuffleMoves < 3 && fromInGoal && toInGoal) {
      const depthGain = getGoalPositionDepth(move.to) - getGoalPositionDepth(move.from);
      if (depthGain <= 0) {
        score -= 500;
      }
    }

    // If winners finish fast from 9, boost direct entry even more at 9+
    if (inGoal >= 9 && endgameInsights.avgMovesFrom9 < 4 && !fromInGoal && toInGoal) {
      score += 10000;
    }
  }

  return score;
}
