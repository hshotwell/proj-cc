# AI Learning Plan

This document outlines the phased approach for implementing AI learning from game history.

## Goals

- Learn from all games played (human and AI)
- Favor games with lower move counts (more efficient wins)
- Eventually favor higher-ranked player games
- Learn general strategies/patterns applicable to all boards
- Learn openings for the standard board

---

## Phase 1: Local Learning Foundation

**Status**: In Progress

### Objective
Create a game analytics system that extracts generalizable features from completed games and uses them to improve AI play.

### Features to Extract
- **Advancement efficiency**: Average distance gained toward goal per move
- **Jump utilization**: Ratio of jumps to steps, average jump chain length
- **Piece cohesion**: How often pieces stay within jumping range of each other
- **Goal occupation rate**: How quickly pieces enter and fill the goal zone
- **Move efficiency**: Total moves to win (lower = better)
- **Blocking patterns**: Frequency of moves that unblock other pieces

### Storage
- localStorage initially (`chinese-checkers-learned-patterns`)
- Patterns stored as weighted coefficients for the evaluation function

### Implementation
1. Create `src/game/learning/` module
2. `PatternExtractor` - analyzes completed games and extracts features
3. `LearningStore` - persists learned weights to localStorage
4. `LearnedEvaluator` - applies learned weights in AI evaluation

### Weighting Formula
```
gameWeight = (1 / moveCount) * difficultyMultiplier * (futureRankMultiplier)
```

---

## Phase 2: Opening Book (Standard Board)

**Status**: Planned

### Objective
Track and replay proven opening sequences for the standard board layout.

### Approach
- Hash board positions (piece locations only, not whose turn)
- Store move frequencies for each position from winning games
- Look up position hash during AI move selection
- Use book move if confidence is high, otherwise fall back to search

### Storage Structure
```typescript
interface OpeningBook {
  // positionHash -> { moveKey -> { count, winRate, avgEfficiency } }
  positions: Map<string, Map<string, MoveStats>>;
}
```

### Depth
- Track first 10-15 moves of each game
- Require minimum game count before trusting a line

---

## Phase 3: Backend for Cross-User Learning

**Status**: Planned

### Objective
Aggregate learning across all users for collective improvement.

### API Endpoints
- `POST /api/games/submit` - Submit game summary after completion
- `GET /api/learning/weights` - Fetch current learned weights
- `GET /api/opening-book` - Fetch opening book data

### Data Submitted (Privacy-Conscious)
- Extracted pattern metrics (not full game replay)
- Board layout hash (standard vs custom)
- Move count and winner
- No user identification required

### Aggregation
- Weighted average of pattern coefficients
- Periodic recomputation (daily/weekly)
- Version the weights for cache invalidation

---

## Phase 4: Ranking Integration

**Status**: Planned

### Objective
Weight learning contributions by player skill level.

### Approach
- Implement player ranking system (separate feature)
- Track player rank at time of game completion
- Apply rank multiplier to game weight in learning formula

### Rank Multiplier Examples
- Beginner (0-1000): 0.5x
- Intermediate (1000-1500): 1.0x
- Advanced (1500-2000): 1.5x
- Expert (2000+): 2.0x

### Considerations
- Bootstrap problem: initially all players unranked
- Consider opponent rank as well as player rank
- Decay old games as meta evolves

---

## Generalizable Pattern Principles

Rather than memorizing specific positions, the AI should learn:

### Evaluation Weight Adjustments
- How much to value pure distance vs mobility
- Importance of piece clustering for jump chains
- When to prioritize leading pieces vs lagging pieces

### Move Type Preferences
- When jumps are worth "wasting" by not maximizing distance
- Value of positioning moves that enable future jumps

### Positional Principles
- Center control value on different board shapes
- Advancement balance (all pieces vs leading scouts)
- Goal zone entry timing

---

## Strategic Principles (Implemented in `src/game/ai/strategy.ts`)

These core strategic principles are now implemented as AI heuristics:

### 1. Stepping Stone Moves
- **Principle**: If a jump could go further but is blocked by your own piece, prioritize moving that blocker
- **Implementation**: `evaluateSteppingStoneSetup()` - evaluates moves that enable future jumps for friendly pieces
- **Endgame**: This becomes MORE important in endgame when finishing quickly matters
- **Aggressive AI**: Weights stepping stone setup 3.0x (highest priority)

### 2. Back Pieces First
- **Principle**: Prioritize moving pieces that are further from the goal before making many moves with forward pieces
- **Implementation**: `getPieceBackwardness()` - calculates how "back" a piece is relative to others
- **Bonus**: Up to 5 points for moving the most backward piece
- **Defensive AI**: Weights this 2.0x (helps maintain formation)

### 3. Past-Opponents Penalty
- **Principle**: Pieces that have passed all opponents are low priority (unless they enable jumps)
- **Implementation**: `isPiecePastOpponents()` - detects pieces with no opponents ahead
- **Penalty**: Applied only if the move doesn't gain significant distance (< 3)

### 4. Use Opponent Pieces for Jumps
- **Principle**: Jumps using opponent pieces are valuable because those pieces may move
- **Implementation**: `countOpponentPiecesInJump()` - counts opponent pieces used in a jump path
- **Bonus**: 3 points per opponent piece used in a jump
- **Aggressive AI**: Weights this 2.0x

### 5. Defensive Blocking
- **Principle**: Block opponent's planned big jumps by stepping into their path
- **Implementation**: `findOpponentJumpThreats()` - detects opponent jump opportunities
- **Defensive AI**: Weights blocking 3.0x (highest priority)
- **Targets**: Only considers jumps that would gain > 3 distance for opponent

### 6. Unblocking Value
- **Principle**: If your piece is blocking a friendly piece's jump, moving it has extra value
- **Implementation**: `findBlockedJumpPotential()` - detects when piece blocks friendly jumps
- **Aggressive AI**: Weights unblocking 2.5x

### Personality Weight Summary

| Factor | Aggressive | Defensive | Generalist |
|--------|-----------|-----------|------------|
| Stepping Stone | 3.0 | 1.5 | 2.0 |
| Unblocking | 2.5 | 1.5 | 2.0 |
| Backwardness | 1.5 | 2.0 | 1.5 |
| Opponent Pieces | 2.0 | 1.5 | 1.5 |
| Blocking Opponent | 0.5 | 3.0 | 1.5 |
| Past Opponents Penalty | 0.5 | 1.0 | 0.8 |

---

## Success Metrics

1. **Win rate improvement**: AI trained with learning should beat untrained AI
2. **Move efficiency**: Learned AI should win in fewer moves on average
3. **Generalization**: Patterns learned on standard board should help on custom boards
4. **Stability**: Learned weights should converge, not oscillate

---

## File Structure

```
src/game/learning/
  index.ts           - Public exports
  types.ts           - Type definitions
  patternExtractor.ts - Extract features from games
  learningStore.ts   - Persist/load learned data
  learnedEvaluator.ts - Apply learning to AI
  openingBook.ts     - Opening book system (Phase 2)
```
