'use client';

import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from './TurnIndicator';
import { GameOverDialog } from './GameOverDialog';
import { MoveConfirmation } from './MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';

export function GameContainer() {
  useAITurn();

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* Board with settings button */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <Board />
        </div>

        {/* Turn Indicator under the board */}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>

        {/* Move Confirmation */}
        <MoveConfirmation />
      </div>

      {/* Game Over Dialog */}
      <GameOverDialog />

      {/* Settings Popup (Esc to toggle) */}
      <SettingsPopup mode="game" />
    </div>
  );
}
