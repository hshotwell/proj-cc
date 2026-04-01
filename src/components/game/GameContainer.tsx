'use client';

import Link from 'next/link';
import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from './TurnIndicator';
import { GameOverDialog } from './GameOverDialog';
import { MoveConfirmation } from './MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';
import { usePlayerOpening } from '@/hooks/usePlayerOpening';
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';

export function GameContainer() {
  useAITurn();
  usePlayerOpening();

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* Back to home */}
        <Link href="/home" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors">
          ← Home
        </Link>

        {/* Board with settings button and tutorial overlay */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <Board />
          <TutorialOverlay />
        </div>

        {/* Move Confirmation directly under the board */}
        <MoveConfirmation />

        {/* Turn Indicator */}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>
      </div>

      {/* Game Over Dialog */}
      <GameOverDialog />

      {/* Settings Popup (Esc to toggle) */}
      <SettingsPopup mode="game" />
    </div>
  );
}
