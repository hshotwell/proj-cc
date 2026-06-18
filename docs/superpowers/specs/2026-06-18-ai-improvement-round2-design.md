# AI Improvement Round 2 Design

**Date:** 2026-06-18  
**Scope:** Approach C — landing quality score + last-move opponent awareness + hard depth increase  
**Files affected:** `src/game/ai/strategy.ts`, `src/game/ai/search.ts`, `src/types/ai.ts`

---

## Background

After round 1 improvements the AI can now complete games reliably and avoids the worst endgame pathologies (backsteps, repetition loops, threshold too high). Round 2 addresses more nuanced mid-game quality issues observed in a new 19-flag review:

- **Flags 1, 9, 10**: AI always prefers the longest possible chain jump, but sometimes a shorter jump that stays corridor-aligned and near teammates is stronger over the next two turns.
- **Flags 6, 8**: Pieces drift sideways off their ideal trajectory toward the goal, requiring a corrective step later.
- **Flags 2, 3, 7, 19**: AI moves pieces forward without leaving stepping stones reachable by the furthest-back straggler.
- **Flags 12–14**: After the opponent sets up a threat with their last move, the AI misses the 1-turn response window.
- **Flags 4, 5, 11, 15, 16**: Partially addressed by personality weighting and corridor alignment; no dedicated new logic required beyond what the three sections below provide.

---

## Section 1: Landing Quality Score

**New function:** `scoreLandingQuality(state, move, player, personality): number` in `src/game/ai/strategy.ts`

Three components summed into a single landing quality score, applied in `getTopMoves` and `getTopMovesFromList` alongside existing strategic score:

### Component 1: Corridor alignment of landing position

Measures how well the landing square is aligned with the goal axis, not just how far it is from the goal center. Uses the same perpendicular-deviation geometry as `computeDirectionalAlignment` in `evaluate.ts`, but applied per-move to the landing position rather than averaging across all pieces.

- Compute the perpendicular deviation of `move.to` from the vector between `move.from` and the goal center.
- A landing that drifts 2+ cells off-axis is penalized; a landing that stays within 1 cell of axis is rewarded.
- This directly addresses pieces developing off-angle trajectories (Flags 6, 8) and the AI preferring longer-but-lateral jumps over shorter-but-straight ones (Flags 9, 10).

### Component 2: Consolidation score

Counts the number of friendly pieces within 2 cells of the landing position. Landing near teammates means they can chain-jump through you next turn; landing isolated means you need to wait for the pack to catch up.

- +N points for each friendly piece within cube distance 2 of `move.to`.
- Personality-weighted: aggressive ignores this (prefers raw distance), defensive values it highly, generalist is moderate.
- Captures the "keeping pieces consolidated for chain jumping" principle (Flags 1, 9, 10).

### Component 3: Straggler connectivity

If the player has a significant straggler (furthest-back piece is 3+ cells behind the second-furthest), score how connected the landing is to that straggler's path.

- Check if `move.to` is within 3 cells of the straggler, OR if `move.to` is between the straggler and the nearest other friendly piece ("bridging position" = `cubeDistance(straggler, move.to) + cubeDistance(move.to, nearestPack) < cubeDistance(straggler, nearestPack)`).
- Rewarded: landing creates or maintains a stepping-stone chain for the straggler.
- Penalized: landing leaves the straggler isolated with no friendly pieces within jumping range.
- Directly addresses Flags 2, 3, 7, 19 — moving pieces forward and abandoning the back piece.

### Difficulty scaling

| Difficulty | Weight multiplier |
|-----------|------------------|
| hard      | 1.0              |
| medium    | 0.6              |
| easy      | 0.2              |

Applied to the total of all three components before adding to move score.

---

## Section 2: Hard Difficulty Midgame Depth Increase

**Change:** `AI_DEPTH['hard']` in `src/types/ai.ts`: `2` → `3`

Easy and medium remain at depth 2. Endgame and opening depths are unchanged (already 4 for hard).

At depth 3, the hard AI sees: my move → opponent responds → my follow-up. This naturally discovers two-move combinations — "jump shorter now so I can jump farther next turn" — without needing heuristics to approximate them. The minimax finds these patterns directly.

The round 1 transposition table partially mitigates the 3× node expansion at depth 3. If profiling shows the AI is too slow at hard/depth-3, the fallback is to reduce `AI_MOVE_LIMIT['hard']` from 20 to 15 as a safety valve — this recovers most of the time while preserving the extra depth benefit.

**Revert path:** Change `AI_DEPTH['hard']` back to `2`. One line, no other changes needed.

---

## Section 3: Last-Move Opponent Awareness

**New function:** `scoreLastMoveResponse(state, move, player, personality): number` in `src/game/ai/strategy.ts`

Applied in `getTopMoves` and `getTopMovesFromList` for medium and hard difficulty only (easy ignores opponent's last move entirely).

### Sub-component 1: Threat amplification for the last-moved piece

1. Read `state.moveHistory` to identify the opponent's most recent move.
2. From the opponent's current position (`lastMove.to`), enumerate all single-hop jumps available in the current board state.
3. For any jump that gains 3+ cells for the opponent: if our candidate move occupies the landing square OR occupies the intermediate stepping-over position, score this as a high-priority blocking response.
4. Personality weight: defensive = 3×, generalist = 1.5×, aggressive = 0×.

This closes the 1-turn response window shown in Flags 12–14.

### Sub-component 2: Opportunity from vacated square

When an opponent moves away from a position, they may have opened a jump lane usable by our pieces.

1. Check if `lastMove.from` (the square the opponent just vacated) is on a potential chain-jump path for any of our pieces.
2. If our candidate move positions a friendly piece to use that vacated square as an intermediate hop, score this as an opportunistic move.
3. Personality weight: aggressive = 2×, generalist = 1×, defensive = 0.5× (defensive is less interested in exploiting gaps, more in blocking threats).

This captures the flip side of opponent reactions — using their movement to our advantage.

### Difficulty scaling

Applied at medium (60% weight) and hard (100% weight). Easy: function returns 0.

---

## Section 4: Setup Move Block Risk

**New function:** `scoreSetupBlockRisk(state, move, player, personality): number` in `src/game/ai/strategy.ts`

A setup move (stepping stone) creates value on the player's NEXT turn — piece A is placed so piece B can chain-jump through it. Between that setup turn and the follow-through, the opponent takes a turn. If the opponent can disrupt the intended chain in that one turn, the setup move's value evaporates. This function penalizes risky setup moves proportionally to both the chain value and the disruption probability.

**When it applies:** Only when the move has meaningful `steppingStoneValue` (reuses the existing computation from `evaluateSteppingStoneSetup`). For non-setup moves, returns 0.

### Two disruption types

**Type 1 — Fill block:** The opponent moves INTO a landing position that the intended chain relies on. In Chinese Checkers, you cannot land on an occupied square. If the opponent can reach any intermediate or final landing position of the enabled chain in one move (step or jump), the chain is blocked.

Detected by: for each landing position in the enabled chain, enumerate all opponent moves in the simulated state and check if any opponent piece can reach that position.

**Type 2 — Removal block:** The opponent moves AWAY FROM a position that the chain relies on as a jump-over intermediate. If the chain requires jumping over an opponent piece at position X (which is legal and common in Chinese Checkers — you can jump over any piece), and that opponent piece moves before your follow-through, the jump becomes impossible because you cannot jump over an empty square.

Detected by: identify any opponent pieces used as stepping-stone jump-overs in the enabled chain; check if that piece has valid moves (i.e., it CAN be moved by the opponent). If the opponent piece is mobile, flag the chain as block-vulnerable.

Note: Chains that rely only on friendly pieces as stepping stones are not vulnerable to removal — the opponent cannot move your pieces. Only opponent-piece stepping stones carry removal risk.

### Risk score computation

```
blockRisk = chainValue × (fillRiskWeight + removalRiskWeight)
```

- `fillRiskWeight`: 1.0 if opponent can reach the landing in 1 move, 0.4 if 2 moves, 0 beyond that
- `removalRiskWeight`: 0.6 if any opponent stepping stone in the chain is mobile (has valid moves), 0 otherwise
- `chainValue`: the `steppingStoneValue` of the enabled chain

The result is a negative score (penalty) subtracted from the setup move's total score.

### Personality scaling

| Personality | Multiplier | Intent |
|-------------|-----------|--------|
| defensive   | 2.0       | Near-veto on risky setups — only makes them if the chain is very high value and hard to disrupt |
| generalist  | 1.0       | Standard caution — weights risk against chain value |
| aggressive  | 0.3       | Mostly ignores block risk — prefers to go for it |

### Difficulty scaling

Hard: full weight. Medium: 60%. Easy: 0% (easy AI doesn't reason about opponent disruption).

---

## What This Does NOT Change

- Endgame solver logic (`findEndgameMove`, `evaluateEndgameLateral`, etc.) — unchanged from round 1
- `getPiecePhase`, `canReachGoalViaChain` — unchanged
- Personality definitions — unchanged (all new logic routes through existing personality weight paths)
- Opening book — unchanged
- Easy and medium search depths — unchanged

---

## Success Criteria

After implementation, a new AI vs AI game at hard/generalist should show:

- Pieces staying in their corridor toward the goal without lateral drift (Flags 6, 8)
- Far-back pieces maintaining stepping-stone connections rather than being left isolated (Flags 2, 3, 7, 19)
- Shorter jumps chosen over longer-but-off-axis jumps when corridor alignment is better (Flags 9, 10)
- Hard AI responding to opponent's most recent move threat within 1 turn (Flags 12–14)
- Defensive AI avoiding setup moves that can be disrupted by one opponent move (Flags 4, 5, 12)
- Generally fewer "why did it do that?" moments at hard difficulty

---

## Flag Coverage

| Flags | Theme | Addressed by |
|-------|-------|-------------|
| 1, 9, 10 | Jump length vs. consolidation | §1 Component 2 (consolidation) + §2 depth 3 |
| 2, 3, 7, 19 | Straggler isolation | §1 Component 3 (straggler connectivity) |
| 6, 8 | Off-axis trajectory | §1 Component 1 (corridor alignment) |
| 12, 13, 14 | Missing 1-turn response | §3 Sub-component 1 (threat amplification) |
| 4, 5, 12 | Risk of giving opponent good move / risky setup | §3 Sub-component 1 + §4 setup block risk |
| 11, 15, 16 | Step direction / near-goal restraint | §1 Component 1 + §2 depth 3 discovering better sequences |
| 17, 18 | Sidesteps at 6/10 in goal | Round 1 endgame improvements |
