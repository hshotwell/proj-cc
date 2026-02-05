'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import { HEX_SIZE, BOARD_PADDING, MOVE_ANIMATION_DURATION, ROTATION_FOR_PLAYER, BOARD_ROTATION_DURATION } from '@/game/constants';
import { generateBoardPositions } from '@/game/board';
import { cubeToPixel, coordKey, cubeEquals, parseCoordKey, getMovePath } from '@/game/coordinates';
import { getPlayerColorFromState, hexToRgba, blendColorsRgba } from '@/game/colors';
import { findBoardTriangles, findBorderEdges } from '@/game/triangles';
import { isGameFullyOver } from '@/game/state';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useReplayStore } from '@/store/replayStore';
import { BoardCell } from './BoardCell';
import { Piece } from './Piece';
import { MoveIndicator } from './MoveIndicator';

export function Board() {
  // Replay store
  const {
    isReplayActive,
    displayState: replayDisplayState,
    currentStep: replayStep,
    moves: replayMoves,
    longestHopIndex,
  } = useReplayStore();

  const {
    gameState: liveGameState,
    selectedPiece: liveSelectedPiece,
    validMovesForSelected: liveValidMoves,
    pendingConfirmation,
    originalPiecePosition,
    animatingPiece,
    animationPath,
    animationStep,
    selectPiece,
    makeMove,
    clearSelection,
    confirmMove,
    undoLastMove,
  } = useGameStore();

  const { showAllMoves, animateMoves, rotateBoard, showTriangleLines, showLastMoves } = useSettingsStore();

  // Choose data source based on replay mode
  const gameState = isReplayActive ? replayDisplayState : liveGameState;
  const selectedPiece = isReplayActive ? null : liveSelectedPiece;
  const validMovesForSelected = isReplayActive ? [] : liveValidMoves;

  // Current player (turn no longer advances until confirmed)
  const displayCurrentPlayer = gameState?.currentPlayer;

  // Board rotation: track cumulative rotation to allow shortest-path transitions
  const [cumulativeRotation, setCumulativeRotation] = useState(0);
  const prevPlayerRef = useRef<PlayerIndex | undefined>(undefined);
  const prevRotateBoardRef = useRef(rotateBoard);

  useEffect(() => {
    // Disable rotation in replay mode
    if (isReplayActive) return;
    if (displayCurrentPlayer === undefined) return;

    const justEnabled = rotateBoard && !prevRotateBoardRef.current;
    prevRotateBoardRef.current = rotateBoard;

    if (!rotateBoard) return;

    // Skip rotation for AI players — keep the board oriented for the last human player
    const isCurrentAI = gameState?.aiPlayers?.[displayCurrentPlayer] != null;
    if (isCurrentAI && !justEnabled) {
      prevPlayerRef.current = displayCurrentPlayer;
      return;
    }

    const targetAngle = ROTATION_FOR_PLAYER[displayCurrentPlayer];

    if (prevPlayerRef.current === undefined || justEnabled) {
      // First render or setting just re-enabled: snap to target angle directly
      setCumulativeRotation(targetAngle);
    } else if (prevPlayerRef.current !== displayCurrentPlayer) {
      // Player changed: compute shortest-path delta
      setCumulativeRotation((prev) => {
        let delta = targetAngle - (prev % 360);
        // Normalize delta to [-180, 180]
        delta = ((delta + 540) % 360) - 180;
        return prev + delta;
      });
    }

    prevPlayerRef.current = displayCurrentPlayer;
  }, [displayCurrentPlayer, rotateBoard, gameState?.aiPlayers, isReplayActive]);

  // Reset rotation when entering/leaving replay mode
  useEffect(() => {
    if (isReplayActive) {
      setCumulativeRotation(0);
      prevPlayerRef.current = undefined;
    }
  }, [isReplayActive]);

  // Drive animation stepping: when animationPath changes or step advances,
  // schedule the next step after the CSS transition completes
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isReplayActive) return;
    if (!animatingPiece || !animationPath) return;

    if (animationStep === 0) {
      // Initial render at path[0]. Wait one frame then advance to path[1]
      // to trigger the first CSS transition.
      const raf = requestAnimationFrame(() => {
        useGameStore.getState().advanceAnimation();
      });
      return () => cancelAnimationFrame(raf);
    } else if (animationStep < animationPath.length - 1) {
      // Mid-path: wait for the current transition to finish, then advance
      animationTimerRef.current = setTimeout(() => {
        useGameStore.getState().advanceAnimation();
      }, MOVE_ANIMATION_DURATION);
    } else {
      // At final position: wait for the last transition to finish, then clear
      animationTimerRef.current = setTimeout(() => {
        useGameStore.getState().clearAnimation();
      }, MOVE_ANIMATION_DURATION);
    }

    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [animatingPiece, animationPath, animationStep, isReplayActive]);

  // Generate board positions - use game state for custom layouts, or standard positions
  const boardPositions = useMemo(() => {
    if (gameState?.isCustomLayout) {
      // Extract positions from the game state board
      return Array.from(gameState.board.keys()).map(parseCoordKey);
    }
    return generateBoardPositions();
  }, [gameState?.isCustomLayout, gameState?.board]);

  // Board cell keys as a set (used for triangle detection and border edges)
  const boardKeys = useMemo(() => {
    return new Set(boardPositions.map((pos) => coordKey(pos)));
  }, [boardPositions]);

  // Compute triangles between adjacent cells
  const boardTriangles = useMemo(() => {
    return findBoardTriangles(boardKeys, gameState?.startingPositions, gameState?.isCustomLayout);
  }, [boardKeys, gameState?.startingPositions, gameState?.isCustomLayout]);

  // Compute border edges (outer boundary of the board)
  const borderEdges = useMemo(() => findBorderEdges(boardTriangles, boardKeys), [boardTriangles, boardKeys]);

  // Calculate SVG viewBox dimensions
  const viewBox = useMemo(() => {
    if (boardPositions.length === 0) {
      return '-200 -200 400 400';
    }
    const positions = boardPositions.map((pos) => cubeToPixel(pos, HEX_SIZE));
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const minX = Math.min(...xs) - BOARD_PADDING;
    const maxX = Math.max(...xs) + BOARD_PADDING;
    const minY = Math.min(...ys) - BOARD_PADDING;
    const maxY = Math.max(...ys) + BOARD_PADDING;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [boardPositions]);

  // Get pieces from board state
  const pieces = useMemo(() => {
    if (!gameState) return [];
    const result: Array<{ coord: CubeCoord; player: PlayerIndex }> = [];
    for (const [key, content] of gameState.board) {
      if (content.type === 'piece') {
        const [q, r] = key.split(',').map(Number);
        result.push({
          coord: { q, r, s: -q - r },
          player: content.player,
        });
      }
    }
    return result;
  }, [gameState]);

  // Displayed moves - filtered by omniscience setting (for rendering indicators)
  const displayedMoves = useMemo(() => {
    if (isReplayActive) return [];
    let moves = validMovesForSelected;

    // When omniscience is off, only show immediate moves (single step or single hop)
    if (!showAllMoves) {
      moves = moves.filter((m) => {
        if (!m.isJump) return true; // step moves always shown
        // Only show single hops (jumpPath length 1 or no path)
        return !m.jumpPath || m.jumpPath.length <= 1;
      });
    }

    return moves.map((m) => ({
      coord: m.to,
      isJump: m.isJump,
      isSwap: m.isSwap,
    }));
  }, [validMovesForSelected, showAllMoves, isReplayActive]);

  // All valid move destinations for click detection - always the full set
  // so players can still click distant hops even with omniscience off
  const validDestinations = useMemo(() => {
    if (isReplayActive) return [];
    return validMovesForSelected.map((m) => m.to);
  }, [validMovesForSelected, isReplayActive]);

  const isAITurn = !isReplayActive && gameState?.aiPlayers?.[gameState.currentPlayer] != null;

  // Replay: compute last move indicator data
  const lastMoveData = useMemo(() => {
    if (!isReplayActive || replayStep === 0) return null;
    const move = replayMoves[replayStep - 1];
    if (!move) return null;
    return {
      from: cubeToPixel(move.from, HEX_SIZE),
      to: cubeToPixel(move.to, HEX_SIZE),
      fromCoord: move.from,
      toCoord: move.to,
    };
  }, [isReplayActive, replayStep, replayMoves]);

  // Replay: compute longest hop highlight data
  const longestHopData = useMemo(() => {
    if (!isReplayActive || longestHopIndex === null) return null;
    // Show when we're viewing the state after the longest hop move
    if (replayStep !== longestHopIndex + 1) return null;
    const move = replayMoves[longestHopIndex];
    if (!move || !move.jumpPath || move.jumpPath.length === 0) return null;

    const path = getMovePath(move.from, move.to, move.jumpPath);
    return path.map(c => cubeToPixel(c, HEX_SIZE));
  }, [isReplayActive, longestHopIndex, replayStep, replayMoves]);

  // Compute last move for each player (for showLastMoves setting)
  const lastMovesPerPlayer = useMemo(() => {
    if (!showLastMoves || !gameState || isReplayActive) return new Map<PlayerIndex, { from: CubeCoord; to: CubeCoord; path: { x: number; y: number }[]; color: string }>();

    const result = new Map<PlayerIndex, { from: CubeCoord; to: CubeCoord; path: { x: number; y: number }[]; color: string }>();
    const history = gameState.moveHistory;

    // Find the last move for each active player
    for (const player of gameState.activePlayers) {
      // Search backwards for the last move by this player
      for (let i = history.length - 1; i >= 0; i--) {
        const move = history[i];
        if (move.player === player) {
          const path = getMovePath(move.from, move.to, move.jumpPath);
          const pixelPath = path.map(c => cubeToPixel(c, HEX_SIZE));
          const baseColor = getPlayerColorFromState(player, gameState);
          // Lighten the color for the path
          const lightColor = hexToRgba(baseColor, 0.4);
          result.set(player, {
            from: move.from,
            to: move.to,
            path: pixelPath,
            color: lightColor,
          });
          break;
        }
      }
    }

    return result;
  }, [showLastMoves, gameState, isReplayActive]);

  // Set of piece positions that were the last move destination (for highlighting)
  const lastMoveDestinations = useMemo(() => {
    const set = new Set<string>();
    for (const [, data] of lastMovesPerPlayer) {
      set.add(coordKey(data.to));
    }
    return set;
  }, [lastMovesPerPlayer]);

  const handleCellClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
    if (!gameState || isGameFullyOver(gameState)) return;
    // Block interaction during animation or AI turn
    if (animatingPiece || isAITurn) return;

    // If pending and clicking on the original starting position, undo all moves
    if (pendingConfirmation && originalPiecePosition && cubeEquals(coord, originalPiecePosition)) {
      undoLastMove();
      return;
    }

    // Check if clicking on a valid move destination first (works during pending too)
    if (validDestinations.some((dest) => cubeEquals(dest, coord))) {
      makeMove(coord, animateMoves);
      return;
    }

    // If there's a pending confirmation and not clicking a valid move, confirm
    if (pendingConfirmation) {
      confirmMove();
      return;
    }

    // Check if clicking on a piece
    const content = gameState.board.get(coordKey(coord));
    if (content?.type === 'piece') {
      if (content.player === displayCurrentPlayer) {
        selectPiece(coord);
      } else {
        clearSelection();
      }
    } else {
      clearSelection();
    }
  };

  const handlePieceClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
    if (!gameState || isGameFullyOver(gameState)) return;
    // Block interaction during animation or AI turn
    if (animatingPiece || isAITurn) return;

    // If pending and clicking on the original starting position, undo all moves
    if (pendingConfirmation && originalPiecePosition && cubeEquals(coord, originalPiecePosition)) {
      undoLastMove();
      return;
    }

    // Check if clicking on a valid move destination (the piece might be at a valid move spot)
    if (validDestinations.some((dest) => cubeEquals(dest, coord))) {
      makeMove(coord, animateMoves);
      return;
    }

    // If there's a pending confirmation and not clicking a valid move, confirm
    if (pendingConfirmation) {
      confirmMove();
      return;
    }

    selectPiece(coord);
  };

  const handleMoveClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
    // Block interaction during animation or AI turn
    if (animatingPiece || isAITurn) return;
    // If clicking on the original starting position, undo instead of moving
    if (pendingConfirmation && originalPiecePosition && cubeEquals(coord, originalPiecePosition)) {
      undoLastMove();
      return;
    }
    makeMove(coord, animateMoves);
  };

  // Calculate the display position for an animating piece
  const getAnimationDisplayCoord = (pieceCoord: CubeCoord): CubeCoord | undefined => {
    if (isReplayActive) return undefined;
    if (!animatingPiece || !animationPath || !cubeEquals(pieceCoord, animatingPiece)) {
      return undefined;
    }
    // Return the current step position in the animation path
    return animationPath[animationStep];
  };

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No game in progress
      </div>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-full max-h-[80vh]"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        style={{
          transform: isReplayActive ? undefined : `rotate(${cumulativeRotation}deg)`,
          transformOrigin: '0 0',
          transition: !isReplayActive && rotateBoard ? `transform ${BOARD_ROTATION_DURATION}ms ease-in-out` : undefined,
        }}
      >
      {/* Layer 0: Triangle fills between adjacent cells */}
      <g>
        {boardTriangles.map((tri) => {
          const points = tri.vertices.map((key) => {
            const pos = parseCoordKey(key);
            const px = cubeToPixel(pos, HEX_SIZE);
            return `${px.x},${px.y}`;
          }).join(' ');

          let fill: string;
          if (tri.playerOwners.length > 0 && gameState) {
            const colors = tri.playerOwners.map((p) => getPlayerColorFromState(p, gameState));
            fill = blendColorsRgba(colors, 0.15);
          } else if (tri.zonePlayer !== null && !gameState?.activePlayers.includes(tri.zonePlayer)) {
            fill = '#e2e2e2';
          } else {
            fill = '#f8f8f8';
          }

          return (
            <polygon
              key={`tri-${tri.vertices.join('-')}`}
              points={points}
              fill={fill}
              stroke={showTriangleLines ? 'black' : 'none'}
              strokeWidth={0.5}
            />
          );
        })}
        {/* Border edges: thick lines on outer boundary, always visible */}
        {borderEdges.map((edge) => {
          const pa = cubeToPixel(parseCoordKey(edge.a), HEX_SIZE);
          const pb = cubeToPixel(parseCoordKey(edge.b), HEX_SIZE);
          return (
            <line
              key={`border-${edge.a}-${edge.b}`}
              x1={pa.x} y1={pa.y}
              x2={pb.x} y2={pb.y}
              stroke="black"
              strokeWidth={1.5}
            />
          );
        })}
      </g>

      {/* Layer 1: Background cells */}
      <g>
        {boardPositions.map((coord) => (
          <g
            key={coordKey(coord)}
            onClick={() => handleCellClick(coord)}
            style={{ cursor: isReplayActive ? 'default' : 'pointer' }}
          >
            <BoardCell
              coord={coord}
              size={HEX_SIZE}
              activePlayers={gameState?.activePlayers}
              isCustomLayout={gameState?.isCustomLayout}
              playerColors={gameState?.playerColors}
              customGoalPositions={gameState?.customGoalPositions}
            />
          </g>
        ))}
      </g>

      {/* Layer 2: Valid move indicators (hidden during animation, AI turns, and replay) */}
      {!isReplayActive && !animatingPiece && !isAITurn && (
        <g>
          {displayedMoves.map(({ coord, isJump, isSwap }) => (
            <MoveIndicator
              key={`move-${coordKey(coord)}`}
              coord={coord}
              onClick={() => handleMoveClick(coord)}
              size={HEX_SIZE}
              playerColor={displayCurrentPlayer !== undefined ? getPlayerColorFromState(displayCurrentPlayer, gameState) : undefined}
              isJump={isJump}
              isSwap={isSwap}
            />
          ))}
        </g>
      )}

      {/* Layer 2b: Replay last-move indicator */}
      {isReplayActive && lastMoveData && (
        <g>
          {/* Faded circle at the "from" position */}
          <circle
            cx={lastMoveData.from.x}
            cy={lastMoveData.from.y}
            r={HEX_SIZE * 0.45}
            fill="none"
            stroke="#6b7280"
            strokeWidth={2}
            opacity={0.4}
            className="replay-last-move"
          />
          {/* Brighter ring at the "to" position */}
          <circle
            cx={lastMoveData.to.x}
            cy={lastMoveData.to.y}
            r={HEX_SIZE * 0.55}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2.5}
            opacity={0.6}
            className="replay-last-move"
          />
        </g>
      )}

      {/* Layer 2c: Longest hop highlight */}
      {isReplayActive && longestHopData && longestHopData.length > 1 && (
        <g>
          {/* Golden polyline connecting all landing positions */}
          <polyline
            points={longestHopData.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="longest-hop-glow"
          />
          {/* Pulsing dot markers at each intermediate landing */}
          {longestHopData.map((point, i) => (
            <circle
              key={`hop-${i}`}
              cx={point.x}
              cy={point.y}
              r={i === 0 || i === longestHopData.length - 1 ? 4 : 3}
              className="longest-hop-marker"
            />
          ))}
        </g>
      )}

      {/* Layer 2d: Last move paths for each player */}
      {showLastMoves && !isReplayActive && lastMovesPerPlayer.size > 0 && (
        <g>
          {Array.from(lastMovesPerPlayer.entries()).map(([player, data]) => (
            <g key={`last-move-${player}`}>
              {/* Path line from start to current position */}
              {data.path.length > 1 && (
                <polyline
                  points={data.path.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={data.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="6 4"
                />
              )}
              {/* Faded circle at the starting position */}
              <circle
                cx={data.path[0].x}
                cy={data.path[0].y}
                r={HEX_SIZE * 0.35}
                fill={data.color}
                stroke="none"
              />
              {/* Small dots at intermediate positions for jumps */}
              {data.path.slice(1, -1).map((point, i) => (
                <circle
                  key={`intermediate-${i}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill={data.color}
                />
              ))}
            </g>
          ))}
        </g>
      )}

      {/* Layer 3: Pieces */}
      <g>
        {pieces.map(({ coord, player }) => {
          const displayCoord = getAnimationDisplayCoord(coord);
          const isThisAnimating = !!displayCoord;

          const pieceKey = coordKey(coord);
          const isLastMoved = showLastMoves && lastMoveDestinations.has(pieceKey);

          return (
            <Piece
              key={`piece-${pieceKey}`}
              coord={coord}
              player={player}
              isCurrentPlayer={!isReplayActive && !isAITurn && player === displayCurrentPlayer}
              isSelected={
                !isReplayActive && !isAITurn && selectedPiece !== null && cubeEquals(selectedPiece, coord)
              }
              onClick={() => handlePieceClick(coord)}
              size={HEX_SIZE}
              customColors={gameState.playerColors}
              displayCoord={displayCoord}
              isAnimating={isThisAnimating}
              isLastMoved={isLastMoved}
            />
          );
        })}
      </g>
      </g>
    </svg>
  );
}
