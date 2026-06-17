# AI Improvement Design

**Date:** 2026-06-17  
**Scope:** Approach B — threshold fix + endgame solver improvements + mid-game heuristic tuning  
**Files affected:** `src/game/ai/endgame.ts`, `src/game/ai/search.ts`, `src/game/ai/strategy.ts`, `src/game/ai/evaluate.ts`

---

## Background

An extensive 24-flag game review identified two clusters of AI failures:

- **Flags 4–24 (6/10 pieces in goal):** The dedicated endgame solver (`findEndgameMove`) only activates at 7+ pieces in goal. At exactly 6, the weak minimax (depth 2–3) handles it instead and cannot plan multi-move sequences like "move piece A deeper to make room for piece B to chain-jump in." The result is repeated sidesteps, backsteps out of the goal zone, and stalled endgame play.
- **Flags 1–3 (3–5 pieces in goal):** Mid-game issues — moving the same piece repeatedly, setting up the opponent for a big jump, and failing to prioritize far-back pieces.

Additionally, setup moves (moving a piece sideways to enable another piece to jump further) are undervalued across all phases, and the global endgame threshold is the wrong model — pieces near the goal should enter endgame logic individually, not only once 7 teammates have already arrived.

---

## Section 1: Per-Piece Phase Detection

Replace the global `isLateEndgame(state, player): boolean` threshold with per-piece phase classification.

**Three piece phases:**
- `endgame`: piece is inside the goal zone, or within 3 cells of the nearest goal cell with no opponent pieces between it and the goal entrance
- `endgame-contested`: same proximity criteria, but opponent pieces are present in the path to the goal
- `midgame`: everything else

**New function:** `getPiecePhase(state, piece, player): 'midgame' | 'endgame' | 'endgame-contested'`

- Check if the piece is within 3 cells of any goal cell (for the player's goal positions).
- If within range, check for opponent pieces between the piece and the goal entrance (closer to the goal than the piece itself). Opponent presence → `endgame-contested`, no opponents → `endgame`.
- `isLateEndgame` is replaced by "does any piece qualify as `endgame` or `endgame-contested`?" — this triggers `findEndgameMove`.

**Proximity radius:** 3 cells from the nearest goal cell. This covers pieces at the entrance to the triangle and one step outside it — close enough that goal-filling logic applies, far enough that it doesn't activate for pieces still mid-crossing.

---

## Section 2: Piece Move Priority

**Default rule:** The AI prefers moving midgame pieces. Pieces still crossing the board have more ground to cover and more path-planning value. Midgame pieces receive a baseline priority bonus in `computeStrategicScore` so the AI naturally moves them unless an exceptional opportunity exists for an endgame piece.

**Exceptions that override to an endgame piece:**

1. **Deep goal entry available** — an endgame/endgame-contested piece can reach a position in row 2 or deeper of the goal triangle (the triangle has 4 rows; row 1 is the entrance, row 4 is the back). "Deep" = `getGoalPositionDepth(target) > median goal depth`. Entrance-row entries do not override midgame priority. `scoreEndgameMove` already returns very large values for deep entries; no structural change needed for this exception, just ensuring the bonus is large enough relative to the new midgame baseline.

2. **Opponent blocking** — an opponent piece is in or near the goal zone and a swap move or blocking move is available. This triggers the endgame-contested evaluation (Section 4) which provides the score override. Weighted by personality (see Section 4).

---

## Section 3: Setup Move Value at All Phases

**Problem:** `evaluateSteppingStoneSetup` in `strategy.ts` correctly computes "if I move here, another piece can jump further." But setup moves are often lateral (zero progress delta), and `getTopMoves` applies a 0 penalty for laterals — neutral scoring. With `AI_MOVE_LIMIT[medium] = 15`, if 15 forward moves exist, a sideways setup move never survives into the deeper minimax.

**Fix 1 — Survive pruning:** In `getTopMoves` and `getTopMovesFromList`, setup moves with `steppingStoneValue` above a threshold get an explicit priority boost sufficient to keep them in the candidate list regardless of direct progress delta. The boost is proportional to the chain value they enable.

**Fix 2 — Apply at all difficulties:** Strategic scoring (including setup move value) currently skips easy difficulty. Setup move value is enabled for all difficulties at a reduced weight for easy, because enabling another piece to jump is a fundamental game concept, not a difficulty feature.

**No depth increase:** The search depth stays the same. The goal is to ensure genuinely good setup moves are evaluated by the existing minimax, not to deepen the search.

---

## Section 4: Endgame-Contested Evaluation

**When it applies:** A piece has phase `endgame-contested` — it is near the goal but opponent pieces are present in the path.

The existing endgame priority waterfall still runs (direct entry > make room > move deeper > stepping stone > shuffle). These two evaluations layer on top as score adjustments applied to candidate moves:

**Opponent-gift detection:**
- After generating a candidate move, simulate the resulting board state.
- Check if any opponent piece now has a forward jump with distance gain above a threshold (e.g., 3+ cells).
- Penalize the candidate move proportional to the gift size.
- Weighted by personality: defensive AI applies a high penalty (strongly avoids gifting), aggressive AI applies a low penalty (ignores opponent threats), generalist is moderate.
- This is the same personality weight path as existing `blockingOpponent` in `computeStrategicScore`.

**Swap move bonus:**
- When an opponent piece occupies a goal cell, a swap move (already supported by move generator as `m.isSwap`) displaces them and fills the cell.
- In endgame-contested situations, swap moves get a score bonus scaled by goal depth (deeper displaced opponent = more valuable).
- Weighted by personality: defensive high, aggressive low, generalist moderate.

---

## Section 5: Mid-Game Heuristic Tuning

Three targeted adjustments to `computeStrategicScore` and `evaluatePosition`. No structural changes.

**Consecutive-piece penalty:**
- Track which piece (`from` coordinate) moved on the AI's last turn (storable in search state or passed as context).
- Apply a soft penalty when the AI considers moving the same piece again: small for 2 consecutive turns, significant for 3, very large for 4+.
- Exceptions: waived if the piece is the only straggler with a large gap, or if no other piece has a viable forward move.

**Opponent-gift penalty in midgame:**
- Apply the same opponent-gift detection from Section 4, at lower weight (~40% of endgame-contested weight).
- Only for medium and hard difficulty (easy AI does not evaluate opponent threats).
- Already present conceptually in `findOpponentJumpThreats` — this extends it to penalize moves that create such threats, not just reward blocking them.

**Straggler penalty scaling:**
- Current: `stragglerScore = -(maxPieceDist²) / 5`
- Change: reduce divisor from 5 to 3, making the penalty grow faster as the gap between the farthest piece and the rest increases.
- This directly addresses flags 2–3 where the AI moves a forward piece while a back piece is significantly further from goal.

---

## Section 6: Endgame Lateral Move Handling + Multi-Hop Chain Detection

**Rule:** In endgame phase, purposeless lateral moves are penalized. Setup laterals are rewarded. The distinction is detected via multi-hop chain analysis.

**New function: `canReachGoalViaChain(state, piece, targetGoalPos)`**
- BFS from `piece`'s position over available jump paths (not steps — only jumps, since chains are what make setup moves valuable)
- Returns true if `piece` can reach `targetGoalPos` via any chain of jumps given the current board
- Bounded depth (e.g., 6 hops max) to keep it fast

**How it's applied to lateral moves in endgame:**
1. Simulate the lateral move on the board
2. For each empty goal position, run `canReachGoalViaChain` for each friendly piece
3. Compare reachable goal depths before and after the lateral
4. If the lateral **increases** the maximum reachable goal depth for any friendly piece → score it positively (bonus scales with the depth gain unlocked)
5. If the lateral changes nothing → heavy endgame penalty

This replaces the current "0 penalty, let search depth decide" approach. It makes the intent explicit: lateral moves earn their place by demonstrably enabling deeper goal access.

**`couldEnterGoalIfEmpty` upgrade:**
The existing 1-hop check in `findEndgameMove`'s "make room" priority is replaced with `canReachGoalViaChain`. This fixes flags 9, 13–15 where the AI fails to see that consolidating a shallow goal piece creates space for a multi-hop chain entry from an outside piece.

---

## Section 7: Repetition Prevention

The current `computeRepetitionPenalty` and `wouldRepeatState` are not preventing the loops seen in flags 12, 16, 18, 21. Strengthening:

**Board-state repetition (endgame):** In endgame phase, if `wouldRepeatState` detects the resulting board has been seen before, the penalty escalates from a soft penalty to a hard veto. Outside endgame it stays as a soft penalty (some early-game positions legitimately recur).

**Per-piece cycle detection:** If a piece has visited its proposed destination in the last 6 of its own moves (tracked via `moveHistory`), veto the move. This catches the "A→B→A→B" shuffle loops that `wouldRepeatState` misses when other players are also moving (changing the global board hash each time).

**No-progress escalation:** If a player in endgame phase has made 4+ consecutive moves with zero net progress (measured by `computePlayerProgress`), apply a strong penalty to any move that also produces zero progress. Forces the AI to find a different approach rather than continuing to shuffle.

---

## What This Does NOT Change

- Search algorithm (minimax / max^n) — unchanged
- Search depth constants — unchanged  
- Personality definitions — unchanged (all new evaluations route through existing personality weight paths)
- Opening book — unchanged
- Custom layout logic — unchanged
- Move generation — unchanged (swap moves already exist)

---

## Success Criteria

After implementation, replaying the flagged game should show:

- No backsteps from within the goal zone (flags 19, 23, 24)
- No pure sidesteps when forward moves or setup moves exist (flags 4, 7, 8, 10, 11, 12, 17, 18, 21)
- Endgame pieces correctly making room / filling deep positions at 6/10 in goal (flags 5, 9, 13–16)
- Midgame pieces getting priority over endgame fidgeting (flags 6, 7, 35/37 turns)
- Fewer same-piece repetition loops (flag 1)
- Reduced opponent-gift moves (flags 2, 3)
