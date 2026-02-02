'use client';

import { Board } from '@/components/board';
import { TurnIndicator } from './TurnIndicator';
import { PlayerPanel } from './PlayerPanel';
import { GameControls } from './GameControls';
import { SettingsPanel } from './SettingsPanel';
import { MoveHistory } from './MoveHistory';
import { GameOverDialog } from './GameOverDialog';
import { MoveConfirmation } from './MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';

export function GameContainer() {
  useAITurn();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4">
        {/* Mobile: stack vertically, Desktop: three columns */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left sidebar - Players and Controls */}
          <div className="lg:w-64 space-y-4">
            <TurnIndicator />
            <div className="bg-white rounded-lg shadow p-4">
              <PlayerPanel />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <GameControls />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <SettingsPanel />
            </div>
          </div>

          {/* Center - Board */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-2xl aspect-square bg-white rounded-lg shadow-lg p-4">
              <Board />
            </div>
          </div>

          {/* Right sidebar - Move History */}
          <div className="lg:w-64">
            <div className="bg-white rounded-lg shadow p-4 h-full">
              <MoveHistory />
            </div>
          </div>
        </div>
      </div>

      {/* Move Confirmation Popup */}
      <MoveConfirmation />

      {/* Game Over Dialog */}
      <GameOverDialog />
    </div>
  );
}
