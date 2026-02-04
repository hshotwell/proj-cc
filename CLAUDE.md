# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (includes type-checking)
npm run start        # Run production server
npm run lint         # ESLint
npm run test         # Run all Vitest tests
npm run test:watch   # Watch mode
npx vitest tests/game/moves.test.ts  # Run a single test file
```

## Tech Stack

- **Next.js 16** (App Router) with React 19 and TypeScript (strict mode)
- **Zustand** for state management (5 stores: game, settings, layout, replay, training)
- **Tailwind CSS 4** with PostCSS
- **Vitest** for testing
- Path alias: `@/*` maps to `./src/*`

## Architecture

### Core Game Logic (`src/game/`)

Pure functions operating on immutable `GameState` objects. No React dependencies.

- **Coordinate system**: Cube coordinates (`{q, r, s}` where `q+r+s=0`) for a 121-cell hexagonal board (61 center + 6 triangles of 10 cells each)
- **Move types**: Step (adjacent), jump (hop over piece), swap (onto opponent in goal cell). Chain jumps are multiple consecutive jumps in one turn.
- **State flow**: `createGame()` → `selectPiece()` → `makeMove()` (repeatable for chain jumps) → `confirmMove()` advances turn. `undoLastMove()` reverts during pending phase.
- **Win condition**: All 10 pieces in the opposite triangle. `finishedPlayers` tracks order of completion.

### AI System (`src/game/ai/`)

- 2-player: minimax with alpha-beta pruning. 3+ players: Max^n search.
- Difficulty controls search depth (easy=1, medium=2, hard=3).
- Three personalities (generalist/defensive/aggressive) set evaluation weight profiles.
- Runs in a **Web Worker** via `useAITurn` hook to avoid blocking UI.
- `src/game/training/` implements a genetic algorithm that evolves evaluation weights through self-play.

### State Management (`src/store/`)

Five Zustand stores, each with a focused responsibility:
- **gameStore**: Active game state, piece selection, move confirmation, animations
- **settingsStore**: User preferences (persisted to localStorage)
- **layoutStore**: Custom board layouts (persisted to localStorage)
- **replayStore**: Replay playback with state reconstruction
- **trainingStore**: GA training progress

### Persistence

All persistence uses localStorage:
- Games saved as `chinese-checkers-game-{id}` (max 20, oldest evicted)
- Index at `chinese-checkers-saved-games`
- Replay reconstruction: `normalizeMoveHistory()` merges chain jumps, `reconstructGameStates()` rebuilds full state array

### Pages (App Router)

| Route | Purpose |
|-------|---------|
| `/play` | Game setup (player count, colors, AI config) |
| `/game/[id]` | Live gameplay |
| `/replays` | Saved game list |
| `/replay/[id]` | Step-through replay viewer |
| `/editor` | Custom board layout editor |
| `/training` | AI genetic algorithm training |

### Board Rendering (`src/components/board/`)

SVG-based hexagonal board. `Board.tsx` transforms cube coords to pixel positions (18px hex size). Supports board rotation to active player's perspective and animated piece movement along jump paths.
