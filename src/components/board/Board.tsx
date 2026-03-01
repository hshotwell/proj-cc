'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { CubeCoord, PlayerIndex, Move } from '@/types/game';
import { HEX_SIZE, BOARD_PADDING, MOVE_ANIMATION_DURATION, ROTATION_FOR_PLAYER, BOARD_ROTATION_DURATION } from '@/game/constants';
import { generateBoardPositions } from '@/game/board';
import { cubeToPixel, coordKey, cubeEquals, parseCoordKey, getMovePath } from '@/game/coordinates';
import { getPlayerColorFromState, hexToRgba, blendColorsRgba, lightenHex } from '@/game/colors';
import { findBoardTriangles, findBorderEdges } from '@/game/triangles';
import { isGameFullyOver } from '@/game/state';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useReplayStore } from '@/store/replayStore';
import { BoardCell } from './BoardCell';
import { Piece } from './Piece';
import { MoveIndicator } from './MoveIndicator';

interface BoardProps {
  /** When set, lock board rotation to this player's perspective (for online games) */
  fixedRotationPlayer?: PlayerIndex;
  /** When false, suppress spinning highlights on pieces (online: not your turn) */
  isLocalPlayerTurn?: boolean;
}

export function Board({ fixedRotationPlayer, isLocalPlayerTurn }: BoardProps = {}) {
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
      stateBeforeMove,
      originalPiecePosition,
      animatingPiece,
      animationPath,
      animationStep,
      lastMoveInfo,
      selectPiece,
      makeMove,
      clearSelection,
      confirmMove,
      undoLastMove,
    } = useGameStore();
  const { showAllMoves, animateMoves, rotateBoard, showTriangleLines, showLastMoves, showCoordinates, darkMode, woodenBoard, glassPieces } = useSettingsStore();

  // Track hovered cell for coordinate display
  const [hoveredCell, setHoveredCell] = useState<CubeCoord | null>(null);

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

    const isInitialRender = prevPlayerRef.current === undefined;
    const justEnabled = rotateBoard && !prevRotateBoardRef.current;
    prevRotateBoardRef.current = rotateBoard;

    // In online mode with fixedRotationPlayer, always lock to that player's perspective
    if (fixedRotationPlayer !== undefined) {
      const fixedAngle = ROTATION_FOR_PLAYER[fixedRotationPlayer];
      if (isInitialRender) {
        setCumulativeRotation(fixedAngle);
        prevPlayerRef.current = displayCurrentPlayer;
      }
      return;
    }

    const targetAngle = ROTATION_FOR_PLAYER[displayCurrentPlayer];

    if (isInitialRender) {
      // Always snap to current player's orientation on first render,
      // regardless of rotateBoard setting — the most natural starting view
      setCumulativeRotation(targetAngle);
      prevPlayerRef.current = displayCurrentPlayer;
      return;
    }

    if (!rotateBoard) return;

    // Skip rotation for AI players — keep the board oriented for the last human player
    const isCurrentAI = gameState?.aiPlayers?.[displayCurrentPlayer] != null;
    if (isCurrentAI && !justEnabled) {
      prevPlayerRef.current = displayCurrentPlayer;
      return;
    }

    if (justEnabled) {
      // Setting just re-enabled: snap to target angle directly
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
  }, [displayCurrentPlayer, rotateBoard, gameState?.aiPlayers, isReplayActive, fixedRotationPlayer]);

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

  // Get walls from board state
  const wallPositions = useMemo(() => {
    if (!gameState) return [];
    const result: CubeCoord[] = [];
    for (const [key, content] of gameState.board) {
      if (content.type === 'wall') {
        const [q, r] = key.split(',').map(Number);
        result.push({ q, r, s: -q - r });
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

  // Compute the actual path of the last move to pass to the Piece component
  // Shows the previous player's confirmed move (visible even during current player's pending moves)
  const lastMoveActualPath = useMemo(() => {
    if (!showLastMoves || isReplayActive || !gameState) return null;

    // For confirmed moves: use lastMoveInfo and find that turn's moves
    if (!lastMoveInfo) return null;

    const history = gameState.moveHistory;

    const lastMoveOrigin = lastMoveInfo.origin;
    const lastMoveDestCoord = lastMoveInfo.destination;
    const lastMovePlayer = lastMoveInfo.player;

    // Find the end of this player's turn (last move to destination)
    let turnEndIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      const move = history[i];
      if (move.player === lastMovePlayer && cubeEquals(move.to, lastMoveDestCoord)) {
        turnEndIndex = i;
        break;
      }
    }

    if (turnEndIndex === -1) return null;

    // Find the start of this player's turn
    // We know the origin (where the piece started), so trace back until we find it
    let turnStartIndex = turnEndIndex;
    for (let i = turnEndIndex; i >= 0; i--) {
      const move = history[i];
      // Stop if different player
      if (move.player !== lastMovePlayer) {
        break;
      }
      // This is part of the turn
      turnStartIndex = i;
      // Stop if we found the origin (where the piece started this turn)
      if (cubeEquals(move.from, lastMoveOrigin)) {
        break;
      }
    }

    // Get all moves from this turn
    const turnMoves = history.slice(turnStartIndex, turnEndIndex + 1);

    if (turnMoves.length === 0) return null;

    // Build the complete path from all moves this turn
    const fullPath: CubeCoord[] = [];
    for (const move of turnMoves) {
      const segmentPath = getMovePath(move.from, move.to, move.jumpPath);
      if (fullPath.length === 0) {
        fullPath.push(...segmentPath);
      } else {
        fullPath.push(...segmentPath.slice(1));
      }
    }

    // Remove loops/backtracking: if a position appears twice, keep only from the last occurrence
    // This gives the "shortest" path without unnecessary detours
    const simplifiedPath: CubeCoord[] = [];
    const positionLastIndex = new Map<string, number>();

    // First pass: find the last occurrence of each position
    for (let i = 0; i < fullPath.length; i++) {
      const key = coordKey(fullPath[i]);
      positionLastIndex.set(key, i);
    }

    // Second pass: build path skipping to last occurrence when we hit a repeated position
    let i = 0;
    while (i < fullPath.length) {
      const key = coordKey(fullPath[i]);
      const lastIndex = positionLastIndex.get(key)!;
      simplifiedPath.push(fullPath[i]);
      // Jump to after the last occurrence of this position (skip the loop)
      i = lastIndex + 1;
    }

    return simplifiedPath.map(c => cubeToPixel(c, HEX_SIZE));
  }, [showLastMoves, lastMoveInfo, gameState, isReplayActive]);

  const handleCellClick = (coord: CubeCoord) => {
    if (isReplayActive) return;
    if (!gameState) return;
    // Allow confirming a pending move even if the game just ended (winning move)
    if (isGameFullyOver(gameState) && !pendingConfirmation) return;
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
    if (!gameState) return;
    if (isGameFullyOver(gameState) && !pendingConfirmation) return;
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

  // Parse viewBox to calculate aspect ratio
  const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
  const aspectRatio = vbWidth && vbHeight ? vbWidth / vbHeight : 1;
  const boardRadius = Math.max(vbWidth, vbHeight) / 2 - BOARD_PADDING / 2;

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto max-h-[70vh] sm:max-h-[75vh]"
      style={{ aspectRatio: aspectRatio }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        style={{
          transform: isReplayActive ? undefined : `rotate(${cumulativeRotation}deg)`,
          transformOrigin: '0 0',
          transition: !isReplayActive && rotateBoard ? `transform ${BOARD_ROTATION_DURATION}ms ease-in-out` : undefined,
        }}
      >
      {/* Layer -1: Wooden board background */}
      {woodenBoard && (
        <g>
          <defs>
            <linearGradient id="wood-base" x1="0%" y1="0%" x2="100%" y2="10%">
              <stop offset="0%" stopColor={darkMode ? '#5a3e16' : '#c49040'} />
              <stop offset="30%" stopColor={darkMode ? '#6b4c1e' : '#d4a056'} />
              <stop offset="70%" stopColor={darkMode ? '#5a3e16' : '#b8873a'} />
              <stop offset="100%" stopColor={darkMode ? '#4a3412' : '#a87830'} />
            </linearGradient>
            <filter id="wood-grain-filter" colorInterpolationFilters="sRGB">
              {/* Stretched noise for directional grain */}
              <feTurbulence type="fractalNoise" baseFrequency="0.005 0.06" numOctaves="4" seed="8" result="noise"/>
              {/* High contrast to create distinct grain bands */}
              <feComponentTransfer in="noise" result="grain">
                <feFuncR type="linear" slope={darkMode ? 2.5 : 3} intercept={darkMode ? -0.5 : -0.7}/>
                <feFuncG type="linear" slope={darkMode ? 2.5 : 3} intercept={darkMode ? -0.5 : -0.7}/>
                <feFuncB type="linear" slope={darkMode ? 2.5 : 3} intercept={darkMode ? -0.5 : -0.7}/>
                <feFuncA type="linear" slope="0" intercept="1"/>
              </feComponentTransfer>
              <feBlend mode="soft-light" in="SourceGraphic" in2="grain"/>
            </filter>
          </defs>
          {/* Wood base with grain texture */}
          <circle cx={0} cy={0} r={boardRadius} fill="url(#wood-base)" filter="url(#wood-grain-filter)" />
          {/* Subtle radial grain lines suggesting linear grain direction */}
          {[0.15, 0.55, 1.05, 1.45, 1.95, 2.35, 2.85].map((angle, i) => (
            <line
              key={`grain-${i}`}
              x1={0}
              y1={0}
              x2={Math.cos(angle) * boardRadius * 0.92}
              y2={Math.sin(angle) * boardRadius * 0.92}
              stroke={darkMode ? 'rgba(90,65,20,0.05)' : 'rgba(80,50,20,0.05)'}
              strokeWidth={0.8}
            />
          ))}
          {/* Wood knots */}
          {[
            { x: boardRadius * -0.3, y: boardRadius * 0.2, scale: 0.1 },
            { x: boardRadius * 0.35, y: boardRadius * -0.25, scale: 0.07 },
            { x: boardRadius * 0.1, y: boardRadius * 0.5, scale: 0.06 },
          ].map((knot, ki) => (
            <g key={`knot-${ki}`}>
              {[1, 0.75, 0.5, 0.3, 0.15].map((s, ri) => (
                <ellipse
                  key={ri}
                  cx={knot.x}
                  cy={knot.y}
                  rx={boardRadius * knot.scale * s}
                  ry={boardRadius * knot.scale * s * 0.7}
                  fill="none"
                  stroke={darkMode ? `rgba(90,65,15,${0.12 + ri * 0.06})` : `rgba(80,50,20,${0.1 + ri * 0.05})`}
                  strokeWidth={0.8}
                />
              ))}
              {/* Darker center fill for knot */}
              <ellipse
                cx={knot.x}
                cy={knot.y}
                rx={boardRadius * knot.scale * 0.12}
                ry={boardRadius * knot.scale * 0.08}
                fill={darkMode ? 'rgba(60,40,10,0.3)' : 'rgba(80,50,20,0.2)'}
              />
            </g>
          ))}
          {/* Beveled edge - lighter inner ring + darker outer ring */}
          <circle cx={0} cy={0} r={boardRadius - 1.5}
            fill="none"
            stroke={darkMode ? '#7a5a1e' : '#c49040'}
            strokeWidth={1.5}
          />
          <circle cx={0} cy={0} r={boardRadius}
            fill="none"
            stroke={darkMode ? '#2a1a08' : '#4a2a08'}
            strokeWidth={2}
          />
        </g>
      )}

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
            if (darkMode) {
              // Blend colors then lighten to produce a visible opaque tint
              const lightened = colors.map((c) => lightenHex(c, 0.4));
              const n = lightened.length;
              const avg = lightened.reduce((acc, c) => {
                const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
              }, [0, 0, 0]);
              // Blend toward dark background (#2a2a2a) at 50% color strength
              const br = Math.round(0x2a + (avg[0] - 0x2a) * 0.50);
              const bg = Math.round(0x2a + (avg[1] - 0x2a) * 0.50);
              const bb = Math.round(0x2a + (avg[2] - 0x2a) * 0.50);
              fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
            } else {
              // Blend colors toward white (#f8f8f8) at 25% color strength
              const n = colors.length;
              const avg = colors.reduce((acc, c) => {
                const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
              }, [0, 0, 0]);
              const br = Math.round(0xf8 + (avg[0] - 0xf8) * 0.25);
              const bg = Math.round(0xf8 + (avg[1] - 0xf8) * 0.25);
              const bb = Math.round(0xf8 + (avg[2] - 0xf8) * 0.25);
              fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
            }
          } else if (tri.zonePlayer !== null && !gameState?.activePlayers.includes(tri.zonePlayer)) {
            fill = darkMode ? '#3a3a3a' : '#e2e2e2';
          } else {
            fill = darkMode ? '#2a2a2a' : '#f8f8f8';
          }

          return (
            <polygon
              key={`tri-${tri.vertices.join('-')}`}
              points={points}
              fill={fill}
              stroke={showTriangleLines ? (darkMode ? '#888' : 'black') : fill}
              strokeWidth={showTriangleLines ? 0.5 : 0.5}
              strokeLinejoin="round"
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
              stroke={woodenBoard ? (darkMode ? '#8B6914' : '#5c3a10') : (darkMode ? 'white' : 'black')}
              strokeWidth={2.5}
              strokeLinecap="round"
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
            onMouseEnter={showCoordinates ? () => setHoveredCell(coord) : undefined}
            onMouseLeave={showCoordinates ? () => setHoveredCell(null) : undefined}
            style={{ cursor: isReplayActive ? 'default' : 'pointer' }}
          >
            <BoardCell
              coord={coord}
              size={HEX_SIZE}
              activePlayers={gameState?.activePlayers}
              isCustomLayout={gameState?.isCustomLayout}
              playerColors={gameState?.playerColors}
              customGoalPositions={gameState?.customGoalPositions}
              darkMode={darkMode}
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



      {/* Layer 2e: Last Move Path (purely visual, doesn't block clicks) */}
      {showLastMoves && !isReplayActive && lastMoveActualPath && lastMoveInfo && (
        <g style={{ pointerEvents: 'none' }}>
          <polyline
            points={lastMoveActualPath.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={getPlayerColorFromState(lastMoveInfo.player, gameState)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
        </g>
      )}

      {/* Layer 2f: Walls */}
      <g>
        {/* First draw connecting lines between adjacent walls */}
        {(() => {
          const wallKeySet = new Set(wallPositions.map(c => coordKey(c)));
          const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
          const directions = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
          ];

          for (const wall of wallPositions) {
            const wallKey = coordKey(wall);
            for (const dir of directions) {
              const neighborKey = `${wall.q + dir.q},${wall.r + dir.r}`;
              // Only draw if neighbor exists and has a "greater" key to avoid duplicates
              if (wallKeySet.has(neighborKey) && neighborKey > wallKey) {
                const { x: x1, y: y1 } = cubeToPixel(wall, HEX_SIZE);
                const neighbor = { q: wall.q + dir.q, r: wall.r + dir.r, s: -(wall.q + dir.q) - (wall.r + dir.r) };
                const { x: x2, y: y2 } = cubeToPixel(neighbor, HEX_SIZE);
                lines.push({ x1, y1, x2, y2 });
              }
            }
          }

          return lines.map((line, i) => (
            <line
              key={`wall-line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#4b5563"
              strokeWidth={HEX_SIZE * 0.4}
              strokeLinecap="round"
            />
          ));
        })()}

        {/* Then draw the wall hexagons on top */}
        {wallPositions.map((coord) => {
          const { x, y } = cubeToPixel(coord, HEX_SIZE);
          // Generate hexagon points (flat-top hexagon) - bigger than pieces
          const hexSize = HEX_SIZE * 0.7;
          const hexPoints = Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i;
            const px = x + hexSize * Math.cos(angle);
            const py = y + hexSize * Math.sin(angle);
            return `${px},${py}`;
          }).join(' ');
          return (
            <polygon
              key={`wall-${coordKey(coord)}`}
              points={hexPoints}
              fill="#6b7280"
              stroke="#374151"
              strokeWidth={2}
            />
          );
        })}
      </g>

      {/* Layer 3: Pieces */}
      <g>
        {pieces.map(({ coord, player }) => {
          const displayCoord = getAnimationDisplayCoord(coord);
          const isThisAnimating = !!displayCoord;

          const pieceKey = coordKey(coord);
          const isLastMoved = showLastMoves && lastMoveInfo?.destination && cubeEquals(lastMoveInfo.destination, coord);

          return (
            <g
              key={`piece-${pieceKey}`}
              onMouseEnter={showCoordinates ? () => setHoveredCell(coord) : undefined}
              onMouseLeave={showCoordinates ? () => setHoveredCell(null) : undefined}
            >
              <Piece
                coord={coord}
                player={player}
                isCurrentPlayer={!isReplayActive && !isAITurn && !animatingPiece && isLocalPlayerTurn !== false && player === displayCurrentPlayer && (isLocalPlayerTurn === undefined || player === fixedRotationPlayer)}
                isSelected={
                  !isReplayActive && !isAITurn && selectedPiece !== null && cubeEquals(selectedPiece, coord)
                }
                onClick={() => handlePieceClick(coord)}
                size={HEX_SIZE}
                customColors={gameState.playerColors}
                displayCoord={displayCoord}
                isAnimating={isThisAnimating}
                isLastMoved={isLastMoved}
                darkMode={darkMode}
                glassPieces={glassPieces}
              />
            </g>
          );
        })}
      </g>
      </g>

      {/* Coordinate tooltip - outside rotation group so text stays upright */}
      {showCoordinates && hoveredCell && (() => {
        const pixel = cubeToPixel(hoveredCell, HEX_SIZE);
        // Apply the same rotation to position but not to the text
        const radians = (cumulativeRotation * Math.PI) / 180;
        const rotatedX = pixel.x * Math.cos(radians) - pixel.y * Math.sin(radians);
        const rotatedY = pixel.x * Math.sin(radians) + pixel.y * Math.cos(radians);
        return (
          <g>
            <rect
              x={rotatedX - 28}
              y={rotatedY - HEX_SIZE - 20}
              width={56}
              height={16}
              rx={3}
              fill="rgba(0,0,0,0.8)"
            />
            <text
              x={rotatedX}
              y={rotatedY - HEX_SIZE - 8}
              textAnchor="middle"
              fill="white"
              fontSize={10}
              fontFamily="monospace"
            >
              {hoveredCell.q},{hoveredCell.r},{hoveredCell.s}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
