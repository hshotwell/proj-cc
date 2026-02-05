'use client';

import { useSettingsStore } from '@/store/settingsStore';

export function SettingsPanel() {
  const { showAllMoves, animateMoves, rotateBoard, showTriangleLines, showLastMoves, toggleShowAllMoves, toggleAnimateMoves, toggleRotateBoard, toggleTriangleLines, toggleShowLastMoves } = useSettingsStore();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Settings
      </h3>

      <div className="space-y-2">
        {/* Omniscience Toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={showAllMoves}
              onChange={toggleShowAllMoves}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Show all moves
            </div>
            <div className="text-xs text-gray-500">
              {showAllMoves ? 'Showing chain jumps' : 'Showing immediate moves only'}
            </div>
          </div>
        </label>

        {/* Animation Toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={animateMoves}
              onChange={toggleAnimateMoves}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Animate moves
            </div>
            <div className="text-xs text-gray-500">
              {animateMoves ? 'Pieces slide along path' : 'Pieces teleport instantly'}
            </div>
          </div>
        </label>

        {/* Rotate Board Toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={rotateBoard}
              onChange={toggleRotateBoard}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Rotate board
            </div>
            <div className="text-xs text-gray-500">
              {rotateBoard ? 'Board faces active player' : 'Board stays fixed'}
            </div>
          </div>
        </label>
        {/* Triangle Lines Toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={showTriangleLines}
              onChange={toggleTriangleLines}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Triangle lines
            </div>
            <div className="text-xs text-gray-500">
              {showTriangleLines ? 'Grid lines visible' : 'Grid lines hidden'}
            </div>
          </div>
        </label>

        {/* Show Last Moves Toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={showLastMoves}
              onChange={toggleShowLastMoves}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Show last moves
            </div>
            <div className="text-xs text-gray-500">
              {showLastMoves ? 'Showing each player\'s last move' : 'Last moves hidden'}
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
