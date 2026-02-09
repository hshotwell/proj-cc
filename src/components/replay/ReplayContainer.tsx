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
        {/* Mobile: stack vertically, Desktop: three columns */}
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">
          {/* Left sidebar - Game Info and Players (hidden on mobile, shown on desktop) */}
          <div className="hidden lg:block lg:w-64 space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <ReplayInfo />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <ReplayPlayerPanel />
            </div>
          </div>

          {/* Center - Board */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board />
            </div>
          </div>

          {/* Right sidebar - Controls and Move History */}
          <div className="lg:w-64 space-y-2 sm:space-y-4">
            <div className="bg-white rounded-lg shadow p-2 sm:p-4">
              <ReplayControls />
            </div>
            <div className="bg-white rounded-lg shadow p-2 sm:p-4 max-h-64 lg:max-h-none overflow-y-auto">
              <ReplayMoveHistory />
            </div>
          </div>
        </div>
      </div>

      {/* Settings Popup (Esc to toggle) */}
      <SettingsPopup mode="replay" />
    </div>
  );
}
