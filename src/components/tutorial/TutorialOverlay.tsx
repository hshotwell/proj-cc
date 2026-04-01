'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTutorialStore, TutorialPosition } from '@/store/tutorialStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getValidMoves } from '@/game/moves';

// Absolute-position classes for each card location (relative to the board container)
const POSITION_CLASS: Record<Exclude<TutorialPosition, 'center'>, string> = {
  'bottom-left':  'absolute bottom-4 left-4 w-52 z-10',
  'bottom-right': 'absolute bottom-4 right-4 w-52 z-10',
  'top-left':     'absolute top-12 left-4 w-60 z-10',
  'top-right':    'absolute top-4 right-4 w-52 z-10',
  'right-full':   'absolute top-4 bottom-4 right-4 w-44 z-10',
};

// Steps 1–6 (excluding the welcome step at index 0) are numbered 1 of 6 … 6 of 6
const COUNTED_TOTAL = 6;

function TutorialCard({
  message,
  subtext,
  position,
  stepIndex,   // currentStep value; 0 = welcome (no counter)
  onAction,
  actionLabel,
}: {
  message: string;
  subtext?: string;
  position: Exclude<TutorialPosition, 'center'>;
  stepIndex: number;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const showCounter = stepIndex > 0;
  return (
    <div className={POSITION_CLASS[position]}>
      {/* Arrow pointing up toward the gear button for top-left */}
      {position === 'top-left' && (
        <div className="absolute -top-2 left-5 w-4 h-4 bg-white border-l border-t border-gray-200 rotate-45" />
      )}
      <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 p-3 flex flex-col gap-1.5">
        {showCounter && (
          <span className="text-xs text-gray-400 font-medium">
            Step {stepIndex} of {COUNTED_TOTAL}
          </span>
        )}
        <p className="text-gray-800 text-sm font-medium leading-snug">{message}</p>
        {subtext && <p className="text-gray-500 text-xs leading-snug">{subtext}</p>}
        {onAction && (
          <div className="flex justify-end mt-1">
            <button
              onClick={onAction}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
            >
              {actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TutorialOverlay() {
  const { isActive, currentStep, steps, nextStep, endTutorial, releaseBlockedPiece } =
    useTutorialStore();
  const tutorialGameId = useTutorialStore((s) => s.gameId);
  const currentGameId = useGameStore((s) => s.gameId);

  // End tutorial if player navigated to a different game
  useEffect(() => {
    if (isActive && tutorialGameId && currentGameId && tutorialGameId !== currentGameId) {
      endTutorial();
    }
  }, [isActive, tutorialGameId, currentGameId, endTutorial]);

  const step = steps[currentStep];
  const gameState = useGameStore((s) => s.gameState);
  const selectedPiece = useGameStore((s) => s.selectedPiece);
  const pendingConfirmation = useGameStore((s) => s.pendingConfirmation);
  const turnNumber = gameState?.turnNumber ?? 0;
  const moveHistory = gameState?.moveHistory;
  const settingsOpen = useSettingsStore((s) => s.settingsMenuOpen);

  // Track whether the player has selected a piece during the chain-jump step
  const [chainJumpVisible, setChainJumpVisible] = useState(false);
  useEffect(() => { setChainJumpVisible(false); }, [currentStep]);
  useEffect(() => {
    if (step?.trigger === 'multi-hop-turn-confirmed' && selectedPiece) {
      setChainJumpVisible(true);
    }
  }, [step?.trigger, selectedPiece]);

  // For swap-possible step: only show the card when a swap move is actually available
  // and the player's turn is fully active (no pending confirmation, not the AI's turn).
  const swapPossible = useMemo(() => {
    if (!isActive || !step || step.trigger !== 'swap-possible' || !gameState) return false;
    if (pendingConfirmation || gameState.currentPlayer !== 0) return false;
    for (const [key, content] of gameState.board) {
      if (content.type !== 'piece' || content.player !== 0) continue;
      const parts = key.split(',').map(Number);
      const coord = { q: parts[0], r: parts[1], s: -parts[0] - parts[1] };
      if (getValidMoves(gameState, coord).some((m) => m.isSwap)) return true;
    }
    return false;
  }, [isActive, step, gameState, pendingConfirmation]);

  // Refs for comparing previous values in the trigger effect
  const prevSelectedPiece = useRef(selectedPiece);
  const prevPendingConfirmation = useRef(pendingConfirmation);
  const prevTurnNumber = useRef(turnNumber);
  const prevSettingsOpen = useRef(settingsOpen);
  // Tracks how many jumps player 0 has made in their current pending turn
  const p0JumpsRef = useRef(0);
  // Whether the current step's card has been rendered at least once
  const cardHasShownRef = useRef(false);

  // Reset tracking refs whenever the step changes so triggers start fresh
  useEffect(() => {
    prevSelectedPiece.current = selectedPiece;
    prevPendingConfirmation.current = pendingConfirmation;
    prevTurnNumber.current = turnNumber;
    prevSettingsOpen.current = settingsOpen;
    p0JumpsRef.current = 0;
    cardHasShownRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Auto-advance based on the current step's trigger
  useEffect(() => {
    if (!isActive || !step) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const advance = () => {
      timer = setTimeout(nextStep, 300);
    };

    switch (step.trigger) {
      case 'piece-selected':
        if (!prevSelectedPiece.current && selectedPiece) advance();
        break;
      case 'move-made':
        if (!prevPendingConfirmation.current && pendingConfirmation) advance();
        break;
      case 'turn-confirmed':
        if (prevTurnNumber.current !== undefined && turnNumber > prevTurnNumber.current) advance();
        break;
      case 'own-confirmed':
        if (prevPendingConfirmation.current && !pendingConfirmation) advance();
        break;
      case 'menu-opened':
        if (!prevSettingsOpen.current && settingsOpen) advance();
        break;
      case 'multi-hop-turn-confirmed':
        // While player 0 is in their pending phase, proactively count their jumps.
        // This avoids any risk of reading stale history at the moment of confirmation.
        if (pendingConfirmation && gameState?.currentPlayer === 0) {
          const p0Moves = gameState.moveHistory.filter((m) => m.player === 0);
          const currentTurn = p0Moves.length > 0 ? p0Moves[p0Moves.length - 1].turnNumber : undefined;
          if (currentTurn !== undefined) {
            // Sum jumpPath lengths: handles both manual hops (one record per hop)
            // and auto-routed chains (single record with jumpPath.length = N).
            p0JumpsRef.current = p0Moves
              .filter((m) => m.turnNumber === currentTurn && m.isJump)
              .reduce((sum, m) => sum + (m.jumpPath?.length ?? 1), 0);
          }
        }
        // When player 0 confirms (pendingConfirmation true → false), check the snapshot.
        if (prevPendingConfirmation.current && !pendingConfirmation) {
          if (p0JumpsRef.current >= 2) advance();
          p0JumpsRef.current = 0;
        }
        break;
    }

    prevSelectedPiece.current = selectedPiece;
    prevPendingConfirmation.current = pendingConfirmation;
    prevTurnNumber.current = turnNumber;
    prevSettingsOpen.current = settingsOpen;

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isActive, step, selectedPiece, pendingConfirmation, turnNumber, settingsOpen, nextStep, gameState]);

  // Detect when the player makes a swap move → release the AI's blocked piece and end tutorial
  useEffect(() => {
    if (!isActive || !step || step.trigger !== 'swap-possible') return;
    const lastMove = moveHistory?.[moveHistory.length - 1];
    if (lastMove?.isSwap && lastMove?.player === 0) {
      releaseBlockedPiece();
      setTimeout(endTutorial, 600);
    }
  }, [isActive, step, moveHistory, releaseBlockedPiece, endTutorial]);

  if (!isActive || !step) return null;

  // Don't show a card for the first time during the AI's turn, but keep it visible if already shown
  if (step.position !== 'center' && gameState && gameState.currentPlayer !== 0 && !cardHasShownRef.current) return null;

  // Respect showAfterTurn threshold
  if (step.showAfterTurn !== undefined && turnNumber < step.showAfterTurn) return null;

  // swap-possible: only show when a swap is actually available
  if (step.trigger === 'swap-possible' && !swapPossible) return null;

  // chain-jump: only show once the player has selected a piece this step
  if (step.trigger === 'multi-hop-turn-confirmed' && !chainJumpVisible) return null;

  // Mark that this step's card has been shown at least once
  cardHasShownRef.current = true;

  const isManual = step.trigger === 'manual';

  // ── Center: full-screen blocking overlay for the welcome card ───────────────
  if (step.position === 'center') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center">
          <p className="text-gray-900 text-xl font-semibold leading-relaxed mb-3">
            {step.message}
          </p>
          {step.subtext && <p className="text-gray-500 text-sm mt-1">{step.subtext}</p>}
          <button
            onClick={nextStep}
            className="mt-6 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
          >
            Start Tutorial
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <TutorialCard
        message={step.message}
        subtext={step.subtext}
        position={step.position}
        stepIndex={currentStep}
        onAction={isManual ? nextStep : undefined}
        actionLabel="Got it →"
      />
      {step.paired && (
        <TutorialCard
          message={step.paired.message}
          subtext={step.paired.subtext}
          position={step.paired.position}
          stepIndex={currentStep}
        />
      )}
    </>
  );
}
