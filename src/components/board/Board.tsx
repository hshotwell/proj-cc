'use client';

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import type { CubeCoord, PlayerIndex, Move, GameState } from '@/types/game';
import { HEX_SIZE, BOARD_PADDING, MOVE_ANIMATION_DURATION, ROTATION_FOR_PLAYER, BOARD_ROTATION_DURATION, TRIANGLE_ASSIGNMENTS } from '@/game/constants';
import { generateBoardPositions, getTriangleForPosition } from '@/game/board';
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
import { HopParticles } from './HopParticles';
import type { HopParticle } from './HopParticles';

/**
 * For custom boards, compute the CSS rotation angle (degrees) that brings the
 * centroid of the given starting positions to the bottom of the screen.
 * Returns the ROTATION_FOR_PLAYER value for the player if the positions are empty.
 */
function getRotationForStartingPositions(positionKeys: string[]): number {
  if (positionKeys.length === 0) return 0;
  let sumX = 0;
  let sumY = 0;
  for (const key of positionKeys) {
    const [q, r] = key.split(',').map(Number);
    const pixel = cubeToPixel({ q, r, s: -q - r }, HEX_SIZE);
    sumX += pixel.x;
    sumY += pixel.y;
  }
  const cx = sumX / positionKeys.length;
  const cy = sumY / positionKeys.length;
  // If centroid is near the board centre, no meaningful rotation
  if (Math.abs(cx) < 1 && Math.abs(cy) < 1) return 0;
  // CSS rotate(θ) brings the point at (cx,cy) to the bottom when θ = atan2(cx, cy)
  return (Math.atan2(cx, cy) * 180) / Math.PI;
}

function getTargetRotation(gs: GameState, player: PlayerIndex): number {
  if (gs.isCustomLayout) {
    const keys = gs.startingPositions?.[player];
    if (keys && keys.length > 0) return getRotationForStartingPositions(keys);
  }
  return ROTATION_FOR_PLAYER[player] ?? 0;
}

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
    states: replayStates,
    currentStep: replayStep,
    moves: replayMoves,
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
      isSwapAnimation,
      lastMoveInfo,
      selectPiece,
      makeMove,
      clearSelection,
      confirmMove,
      undoLastMove,
    } = useGameStore();
  const { showAllMoves, animateMoves, rotateBoard, showTriangleLines, showLastMoves, showCoordinates, darkMode, woodenBoard, glassPieces, hopEffect, hexCells } = useSettingsStore();

  // Track hovered cell for coordinate display
  const [hoveredCell, setHoveredCell] = useState<CubeCoord | null>(null);

  // Hop particle effect state
  const [hopParticles, setHopParticles] = useState<HopParticle[]>([]);

  // Replay piece animation state.
  // prevState = board state before the move; piece = move.from (where the piece lives in prevState).
  // During animation, gameState is overridden to prevState so the piece naturally sits at 'from'.
  const [replayAnim, setReplayAnim] = useState<{
    piece: CubeCoord;
    path: CubeCoord[];
    step: number;
    prevState: GameState;
  } | null>(null);
  const prevReplayStepRef = useRef(0);

  // Choose data source based on replay mode.
  // While a replay animation is running, show the pre-move board state so the piece starts
  // at its origin. When animation finishes (replayAnim = null), switch to the new state.
  const gameState = isReplayActive
    ? (replayAnim ? replayAnim.prevState : replayDisplayState)
    : liveGameState;
  const selectedPiece = isReplayActive ? null : liveSelectedPiece;
  const validMovesForSelected = isReplayActive ? [] : liveValidMoves;

  // Current player (turn no longer advances until confirmed)
  const displayCurrentPlayer = gameState?.currentPlayer;

  // Board rotation: track cumulative rotation to allow shortest-path transitions.
  // Initialize synchronously from the game store so the board is already at the correct
  // angle on first paint — prevents the startup spin from 0° to the target angle.
  const [cumulativeRotation, setCumulativeRotation] = useState(() => {
    const gs = useGameStore.getState().gameState;
    if (!gs || gs.activePlayers.length <= 1) return 0;
    // Start facing the first human player, not necessarily the first player in turn order
    const firstHuman = gs.activePlayers.find((p) => !gs.aiPlayers?.[p]) ?? gs.currentPlayer;
    return getTargetRotation(gs, firstHuman);
  });
  // Suppress the CSS transition until after the initial render so that any remaining
  // difference (e.g. game state not yet loaded) snaps rather than animates.
  const [rotationInitialized, setRotationInitialized] = useState(false);
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
      const fixedAngle = gameState ? getTargetRotation(gameState, fixedRotationPlayer) : (ROTATION_FOR_PLAYER[fixedRotationPlayer] ?? 0);
      if (isInitialRender) {
        setCumulativeRotation(fixedAngle);
        setRotationInitialized(true);
        prevPlayerRef.current = displayCurrentPlayer;
      }
      return;
    }

    if (isInitialRender) {
      // Snap to the first human player's orientation without animation
      // Single-player (puzzle) mode: no rotation
      const isSinglePlayer = (gameState?.activePlayers.length ?? 0) <= 1;
      const firstHuman = gameState?.activePlayers.find((p) => !gameState.aiPlayers?.[p]) ?? displayCurrentPlayer;
      setCumulativeRotation(gameState && !isSinglePlayer ? getTargetRotation(gameState, firstHuman) : 0);
      setRotationInitialized(true);
      prevPlayerRef.current = displayCurrentPlayer;
      return;
    }

    const targetAngle = getTargetRotation(gameState!, displayCurrentPlayer);

    // No rotation for single-player (puzzle) mode
    if (!rotateBoard || (gameState?.activePlayers.length ?? 0) <= 1) return;

    // Delay rotation until any piece animation has finished
    if (animateMoves && animatingPiece !== null) return;

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
  }, [displayCurrentPlayer, rotateBoard, gameState?.aiPlayers, isReplayActive, fixedRotationPlayer, animatingPiece, animateMoves]);

  // Reset rotation when entering/leaving replay mode
  useEffect(() => {
    if (isReplayActive) {
      setCumulativeRotation(0);
      setRotationInitialized(false);
      prevPlayerRef.current = undefined;
    }
  }, [isReplayActive]);

  // Replay piece animation: start animation when step advances.
  // useLayoutEffect fires synchronously before the browser paints, so the animation
  // state (piece at origin) is committed in the same paint as the step change —
  // preventing the flash where the piece briefly appears at the destination first.
  useLayoutEffect(() => {
    const prevStep = prevReplayStepRef.current;
    prevReplayStepRef.current = replayStep;

    if (!isReplayActive || !animateMoves || replayStep <= prevStep || replayStep === 0) {
      setReplayAnim(null);
      return;
    }

    const prevState = replayStates[replayStep - 1];
    const move = replayMoves[replayStep - 1];
    if (!move || !prevState) { setReplayAnim(null); return; }

    const path = getMovePath(move.from, move.to, move.isJump ? move.jumpPath : undefined);
    if (path.length <= 1) { setReplayAnim(null); return; }

    // piece = move.from: that's where the piece is in prevState, so the board renders it there
    // and getAnimationDisplayCoord overrides its position along the path.
    setReplayAnim({ piece: move.from, path, step: 0, prevState });
  }, [replayStep, isReplayActive, animateMoves, replayMoves, replayStates]);

  // Replay animation frame advance
  useEffect(() => {
    if (!replayAnim) return;
    if (replayAnim.step >= replayAnim.path.length - 1) {
      setReplayAnim(null);
      return;
    }
    const curr = replayAnim.path[replayAnim.step];
    const next = replayAnim.path[replayAnim.step + 1];
    const dist = Math.max(Math.abs(next.q - curr.q), Math.abs(next.r - curr.r), Math.abs(next.s - curr.s));
    const stepDuration = dist <= 2 ? MOVE_ANIMATION_DURATION : Math.min(Math.round(MOVE_ANIMATION_DURATION * dist / 2), 500);
    const timer = setTimeout(() => {
      setReplayAnim(prev => prev ? { ...prev, step: prev.step + 1 } : null);
    }, stepDuration);
    return () => clearTimeout(timer);
  }, [replayAnim]);

  // --- Swap arc animation ---
  // Both pieces orbit each other along quadratic bezier arcs (each curving right relative
  // to its travel direction), driven by requestAnimationFrame rather than CSS transitions.
  const swapArcRafRef = useRef<number | null>(null);
  const swapArcStartRef = useRef<number | null>(null);
  const [swapArcPos, setSwapArcPos] = useState<{
    mx: number; my: number; // moving piece pixel position
    dx: number; dy: number; // displaced piece pixel position
  } | null>(null);

  useEffect(() => {
    if (!isSwapAnimation || !animatingPiece || !animationPath || animationPath.length < 2) {
      setSwapArcPos(null);
      return;
    }
    const fromPx = cubeToPixel(animationPath[0], HEX_SIZE);
    const toPx   = cubeToPixel(animatingPiece,   HEX_SIZE);
    const vx = toPx.x - fromPx.x, vy = toPx.y - fromPx.y;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    // Right-perpendicular to the travel direction (screen y-down)
    const perpX = vy / len, perpY = -vx / len;
    const H = HEX_SIZE * 1.3; // arc height in SVG pixels
    const midX = (fromPx.x + toPx.x) / 2, midY = (fromPx.y + toPx.y) / 2;
    // Piece A control: curves right of A→B
    const caX = midX + perpX * H, caY = midY + perpY * H;
    // Piece B control: curves right of B→A (= left of A→B)
    const cbX = midX - perpX * H, cbY = midY - perpY * H;

    swapArcStartRef.current = null;

    const DUR = MOVE_ANIMATION_DURATION;
    const animate = (ts: number) => {
      if (swapArcStartRef.current === null) swapArcStartRef.current = ts;
      const raw = Math.min((ts - swapArcStartRef.current) / DUR, 1);
      // Smoothstep easing
      const t = raw * raw * (3 - 2 * raw);
      const mt = 1 - t;
      // Bezier A: from → to
      const mx = mt * mt * fromPx.x + 2 * mt * t * caX + t * t * toPx.x;
      const my = mt * mt * fromPx.y + 2 * mt * t * caY + t * t * toPx.y;
      // Bezier B: to → from
      const dx = mt * mt * toPx.x + 2 * mt * t * cbX + t * t * fromPx.x;
      const dy = mt * mt * toPx.y + 2 * mt * t * cbY + t * t * fromPx.y;
      setSwapArcPos({ mx, my, dx, dy });
      if (raw < 1) {
        swapArcRafRef.current = requestAnimationFrame(animate);
      } else {
        setSwapArcPos(null);
        useGameStore.getState().clearAnimation();
      }
    };
    swapArcRafRef.current = requestAnimationFrame(animate);
    return () => {
      if (swapArcRafRef.current !== null) cancelAnimationFrame(swapArcRafRef.current);
      swapArcStartRef.current = null;
    };
  }, [isSwapAnimation, animatingPiece, animationPath]);

  // Drive animation stepping: when animationPath changes or step advances,
  // schedule the next step after the CSS transition completes
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isReplayActive) return;
    if (!animatingPiece || !animationPath) return;
    // Swap uses its own arc animation — don't step here
    if (isSwapAnimation) return;

    // Helper to spawn a hop particle at the current animation position
    const spawnParticle = () => {
      if (!hopEffect || !animateMoves || !gameState) return;
      const pos = cubeToPixel(animationPath[animationStep], HEX_SIZE);
      const isFinal = animationStep === animationPath.length - 1;
      // Look up the player from the board at the animating piece's coord
      // (gameState.currentPlayer may already be the next player in auto-confirm mode)
      const pieceContent = gameState.board.get(coordKey(animatingPiece));
      const player = pieceContent?.type === 'piece' ? pieceContent.player : gameState.currentPlayer;
      const playerColor = getPlayerColorFromState(player, gameState);
      // Detect goal entry: piece lands in goal triangle but started outside it
      let isGoalEntry = false;
      if (isFinal) {
        const goalTriangle = TRIANGLE_ASSIGNMENTS[player]?.goal;
        if (goalTriangle !== undefined) {
          const startTriangle = getTriangleForPosition(animationPath[0]);
          const endTriangle = getTriangleForPosition(animationPath[animationPath.length - 1]);
          isGoalEntry = endTriangle === goalTriangle && startTriangle !== goalTriangle;
        }
      }
      setHopParticles((prev) => [
        ...prev,
        {
          id: `${coordKey(animatingPiece)}-${animationStep}-${Date.now()}`,
          x: pos.x,
          y: pos.y,
          color: playerColor,
          isFinal,
          isGoalEntry,
          createdAt: Date.now(),
        },
      ]);
    };

    // Compute per-step duration based on hop distance.
    // Larger hops (strider/turbo) travel further and deserve more time.
    // Normal hop = distance 2 → MOVE_ANIMATION_DURATION. Scale proportionally, cap at 500ms.
    const stepDuration = (() => {
      if (animationStep < 1) return MOVE_ANIMATION_DURATION;
      const prev = animationPath[animationStep - 1];
      const curr = animationPath[animationStep];
      const dist = Math.max(Math.abs(curr.q - prev.q), Math.abs(curr.r - prev.r), Math.abs(curr.s - prev.s));
      return dist <= 2 ? MOVE_ANIMATION_DURATION : Math.min(Math.round(MOVE_ANIMATION_DURATION * dist / 2), 500);
    })();

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
        spawnParticle();
        useGameStore.getState().advanceAnimation();
      }, stepDuration);
    } else {
      // At final position: wait for the last transition to finish, then clear
      animationTimerRef.current = setTimeout(() => {
        spawnParticle();
        useGameStore.getState().clearAnimation();
      }, stepDuration);
    }

    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [animatingPiece, animationPath, animationStep, isReplayActive, isSwapAnimation, hopEffect, animateMoves, gameState]);

  // Auto-cleanup hop particles after animation completes
  useEffect(() => {
    if (hopParticles.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setHopParticles((prev) => prev.filter((p) => now - p.createdAt < 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [hopParticles.length]);

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

  // Adjacent cell pairs for hex-mode connecting lines (each pair drawn once)
  const adjacentPairs = useMemo(() => {
    const dirs = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }] as const;
    const pairs: Array<[CubeCoord, CubeCoord]> = [];
    for (const pos of boardPositions) {
      for (const d of dirs) {
        const nb = { q: pos.q + d.q, r: pos.r + d.r, s: pos.s - d.q - d.r };
        if (boardKeys.has(coordKey(nb))) pairs.push([pos, nb]);
      }
    }
    return pairs;
  }, [boardPositions, boardKeys]);

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
    // During a swap arc animation, hide both pieces (they are rendered by the arc overlay).
    // For non-swap animations, hide only the displaced piece at animationPath[0].
    const hideDisplacedKey =
      animatingPiece && animationPath ? coordKey(animationPath[0]) : null;
    const hideMovingKey =
      isSwapAnimation && animatingPiece ? coordKey(animatingPiece) : null;
    const result: Array<{ coord: CubeCoord; player: PlayerIndex }> = [];
    for (const [key, content] of gameState.board) {
      if (content.type === 'piece') {
        if (hideDisplacedKey && key === hideDisplacedKey) continue;
        if (hideMovingKey && key === hideMovingKey) continue;
        const [q, r] = key.split(',').map(Number);
        result.push({
          coord: { q, r, s: -q - r },
          player: content.player,
        });
      }
    }
    return result;
  }, [gameState, animatingPiece, animationPath, isSwapAnimation]);

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

  // Compute the actual path of the last move to pass to the Piece component
  // Shows the previous player's confirmed move (visible even during current player's pending moves)
  const lastMoveActualPath = useMemo(() => {
    // Replay mode: show the path of the move just applied at the current step
    if (isReplayActive) {
      if (!showLastMoves || replayStep === 0) return null;
      const move = replayMoves[replayStep - 1];
      if (!move) return null;
      const path = getMovePath(move.from, move.to, move.isJump ? move.jumpPath : undefined);
      return path.map(c => cubeToPixel(c, HEX_SIZE));
    }

    if (!showLastMoves || !gameState) return null;

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
  }, [showLastMoves, lastMoveInfo, gameState, isReplayActive, replayStep, replayMoves]);

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
    if (isReplayActive) {
      if (!replayAnim || !cubeEquals(pieceCoord, replayAnim.piece)) return undefined;
      return replayAnim.path[replayAnim.step];
    }
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
          transition: rotationInitialized && !isReplayActive && rotateBoard && (gameState?.activePlayers.length ?? 0) > 1 ? `transform ${BOARD_ROTATION_DURATION}ms ease-in-out` : undefined,
        }}
      >
      {/* Layer -1: Wooden board background */}
      {woodenBoard && (
        <g>
          <defs>
            <linearGradient id="wood-base" x1="0%" y1="0%" x2="100%" y2="10%">
              <stop offset="0%" stopColor={darkMode ? '#4a3018' : '#8b6038'} />
              <stop offset="30%" stopColor={darkMode ? '#584020' : '#9a6d42'} />
              <stop offset="70%" stopColor={darkMode ? '#4a3018' : '#7d5530'} />
              <stop offset="100%" stopColor={darkMode ? '#3a2810' : '#6e4a28'} />
            </linearGradient>
            <filter id="wood-grain-filter" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
              {/* Stretched noise for directional grain — spread out but visible */}
              <feTurbulence type="fractalNoise" baseFrequency="0.004 0.035" numOctaves="3" seed="8" result="noise"/>
              {/* Desaturate to grayscale to prevent rainbow artifacts */}
              <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
              {/* Moderate contrast for visible but not overpowering grain */}
              <feComponentTransfer in="grayNoise" result="grain">
                <feFuncR type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncG type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncB type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncA type="linear" slope="0" intercept="1"/>
              </feComponentTransfer>
              <feBlend mode="soft-light" in="SourceGraphic" in2="grain" result="blended"/>
              {/* Clip output to source shape so grain doesn't bleed into rectangular bounding box */}
              <feComposite operator="in" in="blended" in2="SourceGraphic"/>
            </filter>
            {/* Subtle version: 50% grain blended with 50% original */}
            <filter id="wood-grain-subtle" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.004 0.035" numOctaves="3" seed="8" result="noise"/>
              <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
              <feComponentTransfer in="grayNoise" result="grain">
                <feFuncR type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncG type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncB type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                <feFuncA type="linear" slope="0" intercept="1"/>
              </feComponentTransfer>
              <feBlend mode="soft-light" in="SourceGraphic" in2="grain" result="blended"/>
              {/* Mix 50% grain effect with 50% original source */}
              <feColorMatrix type="matrix" in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="srcFaded"/>
              <feColorMatrix type="matrix" in="blended" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="grainFaded"/>
              <feComposite operator="over" in="srcFaded" in2="grainFaded" result="mixed"/>
              <feComposite operator="in" in="mixed" in2="SourceGraphic"/>
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
            stroke={darkMode ? '#5a4020' : '#9a6d42'}
            strokeWidth={1.5}
          />
          <circle cx={0} cy={0} r={boardRadius}
            fill="none"
            stroke={darkMode ? '#1a1008' : '#3a2510'}
            strokeWidth={2}
          />
        </g>
      )}

      {/* Layer 0: Triangle fills between adjacent cells — hidden in hex-cell mode */}
      <g filter={woodenBoard ? 'url(#wood-grain-subtle)' : undefined}>
        {!hexCells && boardTriangles.map((tri) => {
          const points = tri.vertices.map((key) => {
            const pos = parseCoordKey(key);
            const px = cubeToPixel(pos, HEX_SIZE);
            return `${px.x},${px.y}`;
          }).join(' ');

          let fill: string;
          let isRgbaFill = false;
          let hasTriRainbowOrOpal = false;
          if (tri.playerOwners.length > 0 && gameState) {
            const colors = tri.playerOwners.map((p) => getPlayerColorFromState(p, gameState));
            hasTriRainbowOrOpal = colors.some(c => !c.startsWith('#'));
            if (hasTriRainbowOrOpal) {
              fill = '#ff0000';
            } else if (woodenBoard) {
              // Blend player color toward wood base — reduced strength so zone is less vivid
              const woodBase = darkMode ? [0x4a, 0x30, 0x18] : [0x8b, 0x60, 0x38];
              const n = colors.length;
              const avg = colors.reduce((acc, c) => {
                const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
              }, [0, 0, 0]);
              const strength = 0.45;
              const br = Math.round(woodBase[0] + (avg[0] - woodBase[0]) * strength);
              const bg = Math.round(woodBase[1] + (avg[1] - woodBase[1]) * strength);
              const bb = Math.round(woodBase[2] + (avg[2] - woodBase[2]) * strength);
              fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
            } else if (darkMode) {
              // Blend colors then lighten to produce a visible opaque tint
              const lightened = colors.map((c) => lightenHex(c, 0.4));
              const n = lightened.length;
              const avg = lightened.reduce((acc, c) => {
                const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
              }, [0, 0, 0]);
              // Blend toward dark background (#2a2a2a) at 35% color strength
              const br = Math.round(0x2a + (avg[0] - 0x2a) * 0.35);
              const bg = Math.round(0x2a + (avg[1] - 0x2a) * 0.35);
              const bb = Math.round(0x2a + (avg[2] - 0x2a) * 0.35);
              fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
            } else {
              // Blend colors toward white (#f8f8f8) at 18% color strength
              const n = colors.length;
              const avg = colors.reduce((acc, c) => {
                const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
              }, [0, 0, 0]);
              const br = Math.round(0xf8 + (avg[0] - 0xf8) * 0.18);
              const bg = Math.round(0xf8 + (avg[1] - 0xf8) * 0.18);
              const bb = Math.round(0xf8 + (avg[2] - 0xf8) * 0.18);
              fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
            }
          } else if (tri.zonePlayer !== null && !gameState?.activePlayers.includes(tri.zonePlayer)) {
            fill = woodenBoard
              ? (darkMode ? 'rgba(30,30,30,0.8)' : 'rgba(60,60,60,0.7)')
              : (darkMode ? '#3a3a3a' : '#e2e2e2');
            if (woodenBoard) isRgbaFill = true;
          } else {
            fill = woodenBoard ? (darkMode ? 'rgba(80,80,80,0.65)' : 'rgba(140,140,140,0.6)') : (darkMode ? '#2a2a2a' : '#f8f8f8');
            if (woodenBoard) isRgbaFill = true;
          }

          return (
            <polygon
              key={`tri-${tri.vertices.join('-')}`}
              points={points}
              fill={fill}
              fillOpacity={hasTriRainbowOrOpal ? 0.3 : undefined}
              className={hasTriRainbowOrOpal ? 'rainbow-ui-filter' : undefined}
              stroke={showTriangleLines ? (woodenBoard ? (darkMode ? '#5a4020' : '#6e5030') : (darkMode ? '#888' : 'black')) : (isRgbaFill ? 'none' : fill)}
              strokeWidth={showTriangleLines ? 0.5 : (isRgbaFill ? 0 : 0.5)}
              strokeLinejoin="round"
            />
          );
        })}
        {/* Border edges: thick lines on outer boundary */}
        {!hexCells && borderEdges.map((edge) => {
          const pa = cubeToPixel(parseCoordKey(edge.a), HEX_SIZE);
          const pb = cubeToPixel(parseCoordKey(edge.b), HEX_SIZE);
          return (
            <line
              key={`border-${edge.a}-${edge.b}`}
              x1={pa.x} y1={pa.y}
              x2={pb.x} y2={pb.y}
              stroke={woodenBoard ? (darkMode ? '#d4a040' : '#2a1808') : (darkMode ? 'white' : 'black')}
              strokeWidth={woodenBoard ? 3 : 2.5}
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Layer 0b: Hex connecting lines — drawn under cells so only gaps show */}
      {hexCells && showTriangleLines && (
        <g>
          {adjacentPairs.map(([a, b], i) => {
            const pa = cubeToPixel(a, HEX_SIZE);
            const pb = cubeToPixel(b, HEX_SIZE);
            const lineColor = woodenBoard
              ? (darkMode ? '#3a2810' : '#5a4020')
              : (darkMode ? '#6b7280' : '#9ca3af');
            return (
              <line
                key={i}
                x1={pa.x} y1={pa.y}
                x2={pb.x} y2={pb.y}
                stroke={lineColor}
                strokeWidth={3}
              />
            );
          })}
        </g>
      )}

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
              woodenBoard={woodenBoard}
              glassPieces={glassPieces}
              hexCells={hexCells}
              showTriangleLines={showTriangleLines}
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
              hexCells={hexCells}
              darkMode={darkMode}
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




      {/* Layer 2e: Last Move Path (purely visual, doesn't block clicks) */}
      {showLastMoves && lastMoveActualPath && (isReplayActive ? replayStep > 0 : !!lastMoveInfo) && (() => {
        const replayMovePlayer = isReplayActive ? replayMoves[replayStep - 1]?.player : undefined;
        const rawColor = isReplayActive
          ? (replayMovePlayer !== undefined ? getPlayerColorFromState(replayMovePlayer, gameState) : '#808080')
          : getPlayerColorFromState(lastMoveInfo!.player, gameState);
        const isRainbowOrOpalPath = rawColor === 'rainbow' || rawColor === 'opal';
        const cHex = isRainbowOrOpalPath ? '808080' : rawColor.replace('#', '');
        const lum = (parseInt(cHex.substring(0, 2), 16) + parseInt(cHex.substring(2, 4), 16) + parseInt(cHex.substring(4, 6), 16)) / 3;
        const pathColor = isRainbowOrOpalPath ? '#ff0000' : (lum > 200 && !darkMode ? '#b0b0b0' : rawColor);
        return (
          <g style={{ pointerEvents: 'none' }}>
            <polyline
              points={lastMoveActualPath.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={pathColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.8}
              className={isRainbowOrOpalPath ? 'rainbow-ui-filter' : undefined}
            />
          </g>
        );
      })()}

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
              if (wallKeySet.has(neighborKey) && neighborKey > wallKey) {
                const { x: x1, y: y1 } = cubeToPixel(wall, HEX_SIZE);
                const neighbor = { q: wall.q + dir.q, r: wall.r + dir.r, s: -(wall.q + dir.q) - (wall.r + dir.r) };
                const { x: x2, y: y2 } = cubeToPixel(neighbor, HEX_SIZE);
                lines.push({ x1, y1, x2, y2 });
              }
            }
          }

          const lineColor = glassPieces ? (darkMode ? '#383838' : '#585050') : '#4b5563';
          return lines.map((line, i) => (
            <line
              key={`wall-line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={HEX_SIZE * 0.4}
              strokeLinecap="round"
            />
          ));
        })()}

        {/* Then draw the wall hexagons on top */}
        {wallPositions.map((coord) => {
          const { x, y } = cubeToPixel(coord, HEX_SIZE);
          const hexSize = HEX_SIZE * 0.7;
          const hexPoints = Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const px = x + hexSize * Math.cos(angle);
            const py = y + hexSize * Math.sin(angle);
            return `${px},${py}`;
          }).join(' ');

          if (glassPieces) {
            // Cobblestone / rubble masonry wall
            const stoneId = `stone-${coord.q}-${coord.r}`;
            const mortarColor = darkMode ? '#383838' : '#585050';
            const seed = Math.abs(coord.q * 7 + coord.r * 13);
            const rng = (i: number) => {
              const v = Math.sin(seed * 9301 + i * 4973) * 49297;
              return v - Math.floor(v);
            };
            const stones: Array<{ sx: number; sy: number; sw: number; sh: number; rx: number; shade: number }> = [];
            const gap = 0.7;
            const r = hexSize;
            let cy = -r * 0.9;
            let rowIdx = 0;
            while (cy < r * 0.9) {
              const rowH = r * (0.22 + rng(rowIdx * 10 + 1) * 0.18);
              let cx = -r * 0.9;
              let colIdx = 0;
              if (rowIdx % 2 === 1) cx += r * (0.1 + rng(rowIdx * 10 + 50) * 0.15);
              while (cx < r * 0.9) {
                const stoneW = r * (0.28 + rng(rowIdx * 100 + colIdx * 7 + 2) * 0.32);
                const stoneH = rowH * (0.8 + rng(rowIdx * 100 + colIdx * 7 + 3) * 0.25);
                const shade = rng(rowIdx * 100 + colIdx * 7 + 4);
                stones.push({
                  sx: x + cx,
                  sy: y + cy,
                  sw: stoneW - gap,
                  sh: stoneH - gap,
                  rx: Math.min(stoneW, stoneH) * 0.15,
                  shade,
                });
                cx += stoneW + gap;
                colIdx++;
              }
              cy += rowH + gap;
              rowIdx++;
            }
            return (
              <g key={`wall-${coordKey(coord)}`}>
                <defs>
                  <clipPath id={`${stoneId}-clip`}>
                    <polygon points={hexPoints} />
                  </clipPath>
                </defs>
                <polygon points={hexPoints} fill={mortarColor} />
                <g clipPath={`url(#${stoneId}-clip)`}>
                  {stones.map((s, i) => {
                    const baseLight = darkMode ? 90 : 160;
                    const range = darkMode ? 50 : 45;
                    const lum = Math.round(baseLight + (s.shade - 0.5) * range);
                    const fill = `rgb(${lum},${Math.round(lum * 0.97)},${Math.round(lum * 0.94)})`;
                    return (
                      <rect
                        key={i}
                        x={s.sx} y={s.sy}
                        width={s.sw} height={s.sh}
                        rx={s.rx}
                        fill={fill}
                      />
                    );
                  })}
                </g>
                <polygon
                  points={hexPoints}
                  fill="none"
                  stroke={darkMode ? '#505050' : '#4a4a4a'}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </g>
            );
          }

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

      {/* Layer 2g: Powerup indicators */}
      {gameState.powerups && gameState.powerups.size > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from(gameState.powerups.entries()).map(([key, variant]) => {
            const [q, r] = key.split(',').map(Number);
            const { x, y } = cubeToPixel({ q, r, s: -q - r }, HEX_SIZE);
            const label = variant === 'turbo' ? 'T' : variant === 'ghost' ? 'S' : 'B';
            const color = variant === 'turbo' ? '#ef4444' : variant === 'ghost' ? '#22c55e' : '#3b82f6';
            return (
              <g key={`powerup-${key}`}>
                <circle cx={x} cy={y} r={HEX_SIZE * 0.38} fill={color} opacity={0.18} />
                <circle cx={x} cy={y} r={HEX_SIZE * 0.38} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={HEX_SIZE * 0.52} fontWeight="bold" fill={color} opacity={0.9}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Layer 3: Pieces */}
      <g>
        {pieces.map(({ coord, player }) => {
          const displayCoord = getAnimationDisplayCoord(coord);
          const isThisAnimating = !!displayCoord;

          // Scale animation duration for long hops (strider/turbo)
          const pieceAnimDuration = (() => {
            if (!isThisAnimating || !animationPath || animationStep < 1) return MOVE_ANIMATION_DURATION;
            const prev = animationPath[animationStep - 1];
            const curr = animationPath[animationStep];
            const dist = Math.max(Math.abs(curr.q - prev.q), Math.abs(curr.r - prev.r), Math.abs(curr.s - prev.s));
            return dist <= 2 ? MOVE_ANIMATION_DURATION : Math.min(Math.round(MOVE_ANIMATION_DURATION * dist / 2), 500);
          })();

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
                animationDuration={pieceAnimDuration}
                isLastMoved={isLastMoved}
                darkMode={darkMode}
                glassPieces={glassPieces}
                hexCells={hexCells}
                variant={gameState.pieceVariants?.get(pieceKey) ?? gameState.playerPieceTypes?.[player] ?? 'normal'}
                boardRotation={cumulativeRotation}
              />
            </g>
          );
        })}
      </g>

      {/* Layer 3b: Swap arc overlay — both pieces rendered at bezier arc positions */}
      {swapArcPos && animatingPiece && animationPath && animationPath.length >= 2 && (() => {
        const movingCoord = animatingPiece;
        const displacedCoord = animationPath[0];
        const movingPlayer = gameState.board.get(coordKey(movingCoord))?.type === 'piece'
          ? (gameState.board.get(coordKey(movingCoord)) as { type: 'piece'; player: PlayerIndex }).player
          : gameState.currentPlayer;
        const displacedContent = gameState.board.get(coordKey(displacedCoord));
        const displacedPlayer = displacedContent?.type === 'piece' ? displacedContent.player : gameState.currentPlayer;
        const movingKey = coordKey(movingCoord);
        const displacedKey = coordKey(displacedCoord);
        const movingVariant = gameState.pieceVariants?.get(movingKey) ?? gameState.playerPieceTypes?.[movingPlayer] ?? 'normal';
        const displacedVariant = gameState.pieceVariants?.get(displacedKey) ?? gameState.playerPieceTypes?.[displacedPlayer] ?? 'normal';
        return (
          <g>
            <Piece
              key="swap-moving"
              coord={movingCoord}
              player={movingPlayer}
              isCurrentPlayer={false}
              isSelected={false}
              onClick={() => {}}
              size={HEX_SIZE}
              customColors={gameState.playerColors}
              displayPx={{ x: swapArcPos.mx, y: swapArcPos.my }}
              darkMode={darkMode}
              glassPieces={glassPieces}
              hexCells={hexCells}
              variant={movingVariant}
              boardRotation={cumulativeRotation}
            />
            <Piece
              key="swap-displaced"
              coord={displacedCoord}
              player={displacedPlayer}
              isCurrentPlayer={false}
              isSelected={false}
              onClick={() => {}}
              size={HEX_SIZE}
              customColors={gameState.playerColors}
              displayPx={{ x: swapArcPos.dx, y: swapArcPos.dy }}
              darkMode={darkMode}
              glassPieces={glassPieces}
              hexCells={hexCells}
              variant={displacedVariant}
              boardRotation={cumulativeRotation}
            />
          </g>
        );
      })()}

      {/* Layer 4: Hop particle effects */}
      {hopParticles.length > 0 && <HopParticles particles={hopParticles} />}
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
