'use client';

import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { ReplayInfo } from './ReplayInfo';
import { ReplayPlayerPanel } from './ReplayPlayerPanel';
import { ReplayControls } from './ReplayControls';
import { ReplayMoveHistory } from './ReplayMoveHistory';

export function ReplayContainer() {
  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">

          {/* Center column — board + info/players/controls below it */}
          <div className="flex-1 flex flex-col gap-2 sm:gap-4 min-w-0">
            {/* Board */}
            <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board />
            </div>

            {/* Below-board panels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-white rounded-lg shadow p-3 sm:p-4">
                <ReplayInfo />
              </div>
              <div className="bg-white rounded-lg shadow p-3 sm:p-4">
                <ReplayPlayerPanel />
              </div>
              <div className="bg-white rounded-lg shadow p-3 sm:p-4">
                <ReplayControls />
              </div>
            </div>
          </div>

          {/* Right sidebar — Move History */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow p-2 sm:p-4 lg:sticky lg:top-4" style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
              <ReplayMoveHistory />
            </div>
          </div>

        </div>
      </div>

      <SettingsPopup mode="replay" />
    </div>
  );
}
