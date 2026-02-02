'use client';

import { Board } from '@/components/board';
import { ReplayInfo } from './ReplayInfo';
import { ReplayPlayerPanel } from './ReplayPlayerPanel';
import { ReplayControls } from './ReplayControls';
import { ReplayMoveHistory } from './ReplayMoveHistory';

export function ReplayContainer() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4">
        {/* Mobile: stack vertically, Desktop: three columns */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left sidebar - Game Info and Players */}
          <div className="lg:w-64 space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <ReplayInfo />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <ReplayPlayerPanel />
            </div>
          </div>

          {/* Center - Board */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-2xl aspect-square bg-white rounded-lg shadow-lg p-4">
              <Board />
            </div>
          </div>

          {/* Right sidebar - Controls and Move History */}
          <div className="lg:w-64 space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <ReplayControls />
            </div>
            <div className="bg-white rounded-lg shadow p-4 h-full">
              <ReplayMoveHistory />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
