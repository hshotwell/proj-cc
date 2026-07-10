'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { useReplayStore } from '@/store/replayStore';
import { playStep, playClick } from '@/audio/soundEffects';

type SettingsMode = 'game' | 'replay' | 'editor' | 'hexchess';
type SettingsTab = 'main' | 'gameplay' | 'visuals' | 'sound';

interface SettingsPopupProps {
  mode: SettingsMode;
  onRestart?: () => void;
}

export function SettingsPopup({ mode, onRestart }: SettingsPopupProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('main');

  const {
    settingsMenuOpen,
    closeSettingsMenu,
    toggleSettingsMenu,
    showAllMoves,
    animateMoves,
    rotateBoard,
    showTriangleLines,
    showLastMoves,
    showCoordinates,
    autoConfirm,
    showPlayerProgress,
    darkMode,
    woodenBoard,
    glassPieces,
    hopEffect,
    usePlayerOpening,
    hexCells,
    preMoves,
    activePlayerRing,
    masterVolume,
    gameVolume,
    uiVolume,
    setMasterVolume,
    setGameVolume,
    setUiVolume,
    toggleShowAllMoves,
    toggleAnimateMoves,
    toggleRotateBoard,
    toggleTriangleLines,
    toggleShowLastMoves,
    toggleShowCoordinates,
    toggleAutoConfirm,
    toggleShowPlayerProgress,
    toggleDarkMode,
    toggleWoodenBoard,
    toggleGlassPieces,
    toggleHopEffect,
    toggleUsePlayerOpening,
    toggleHexCells,
    togglePreMoves,
    toggleActivePlayerRing,
  } = useSettingsStore();

  const { resetGame } = useGameStore();
  const { goToStart } = useReplayStore();

  // Reset to main tab when opening
  useEffect(() => {
    if (settingsMenuOpen) {
      setActiveTab('main');
    }
  }, [settingsMenuOpen]);

  if (!settingsMenuOpen) return null;

  const handleResume = () => {
    closeSettingsMenu();
  };

  const handleReturnToMenu = () => {
    closeSettingsMenu();
    router.push('/home');
  };

  const handleRestart = () => {
    if (onRestart) {
      onRestart();
    } else if (mode === 'game') {
      resetGame();
    } else if (mode === 'replay') {
      goToStart();
    }
    closeSettingsMenu();
  };

  const getRestartLabel = () => {
    switch (mode) {
      case 'game':
        return 'Restart';
      case 'replay':
        return 'Restart';
      case 'editor':
        return 'Restart';
      default:
        return 'Restart';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-100 px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Settings</h2>
            <button
              onClick={closeSettingsMenu}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              &times;
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {(['main', 'gameplay', 'visuals', 'sound'] as SettingsTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'main' && (
            <div className="space-y-3">
              <button
                onClick={handleResume}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
              >
                Resume
              </button>
              <button
                onClick={handleRestart}
                className="w-full px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                {getRestartLabel()}
              </button>
              <button
                onClick={handleReturnToMenu}
                className="w-full px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                Return to Menu
              </button>
              <p className="text-xs text-center text-gray-400 mt-4">
                Press Esc to close
              </p>
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className="space-y-4">
              <ToggleOption
                label="Show all moves"
                description={showAllMoves ? 'Showing chain jumps' : 'Showing immediate moves only'}
                checked={showAllMoves}
                onChange={toggleShowAllMoves}
              />
              <ToggleOption
                label="Auto-confirm moves"
                description={autoConfirm ? 'Moves confirmed instantly' : 'Confirm each move manually'}
                checked={autoConfirm}
                onChange={toggleAutoConfirm}
              />
              <ToggleOption
                label="Pre-moves"
                description={
                  preMoves
                    ? (mode === 'hexchess'
                        ? 'Queue up to 3 moves while your opponent thinks'
                        : 'Queue up to 6 moves while opponents take their turns')
                    : 'Play only when it\'s your turn'
                }
                checked={preMoves}
                onChange={togglePreMoves}
              />
              <ToggleOption
                label="Show player progress"
                description={showPlayerProgress ? 'Showing pieces in goal & progress' : 'Progress hidden'}
                checked={showPlayerProgress}
                onChange={toggleShowPlayerProgress}
              />
              <ToggleOption
                label="Show last moves"
                description={showLastMoves ? "Showing each player's last move" : 'Last moves hidden'}
                checked={showLastMoves}
                onChange={toggleShowLastMoves}
              />
              <ToggleOption
                label="Rotate board"
                description={rotateBoard ? 'Board faces active player' : 'Board stays fixed'}
                checked={rotateBoard}
                onChange={toggleRotateBoard}
              />
              <ToggleOption
                label="Show coordinates"
                description={showCoordinates ? 'Hover cells to see coords' : 'Coordinates hidden'}
                checked={showCoordinates}
                onChange={toggleShowCoordinates}
              />
              <ToggleOption
                label="Use favored opening"
                description={usePlayerOpening ? 'Auto-plays your saved opening at game start' : 'Play opening moves manually'}
                checked={usePlayerOpening}
                onChange={toggleUsePlayerOpening}
              />
            </div>
          )}

          {activeTab === 'visuals' && (
            <div className="space-y-4">
              <ToggleOption
                label="Animate moves"
                description={animateMoves ? 'Pieces slide along path' : 'Pieces teleport instantly'}
                checked={animateMoves}
                onChange={toggleAnimateMoves}
              />
              <ToggleOption
                label="Hop effect"
                description={hopEffect ? 'Particle burst on landing' : 'No landing effect'}
                checked={hopEffect}
                onChange={toggleHopEffect}
              />
              <ToggleOption
                label="Triangle lines"
                description={showTriangleLines ? 'Grid lines visible' : 'Grid lines hidden'}
                checked={showTriangleLines}
                onChange={toggleTriangleLines}
              />
              <ToggleOption
                label="Wooden board"
                description={woodenBoard ? 'Classic wood finish' : 'Standard flat board'}
                checked={woodenBoard}
                onChange={toggleWoodenBoard}
              />
              <ToggleOption
                label="Simplified pieces"
                description={glassPieces ? 'Realistic glass marbles' : 'Flat colored pieces'}
                checked={!glassPieces}
                onChange={toggleGlassPieces}
              />

              <ToggleOption
                label="Hex cells"
                description={hexCells ? 'Cells shown as hexagon tiles' : 'Cells shown as circles'}
                checked={hexCells}
                onChange={toggleHexCells}
              />
              <ToggleOption
                label="Active-player ring"
                description={activePlayerRing ? 'Spinning ring around the current player’s pieces' : 'No ring around the current player’s pieces'}
                checked={activePlayerRing}
                onChange={toggleActivePlayerRing}
              />
              <ToggleOption
                label="Dark mode"
                description={darkMode ? 'Dark background' : 'Light background'}
                checked={darkMode}
                onChange={toggleDarkMode}
              />
            </div>
          )}

          {activeTab === 'sound' && (
            <div className="space-y-5">
              <VolumeSlider
                label="Master volume"
                value={masterVolume}
                onChange={setMasterVolume}
                onRelease={() => playStep()}
              />
              <VolumeSlider
                label="Game effects"
                description="Moves, jumps, and turn confirmations"
                value={gameVolume}
                onChange={setGameVolume}
                onRelease={() => playStep()}
              />
              <VolumeSlider
                label="UI effects"
                description="Piece selection and button clicks"
                value={uiVolume}
                onChange={setUiVolume}
                onRelease={() => playClick()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface VolumeSliderProps {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  onRelease: () => void;
}

function VolumeSlider({ label, description, value, onChange, onRelease }: VolumeSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs tabular-nums text-gray-500 w-8 text-right">{value}</span>
      </div>
      {description && <div className="text-xs text-gray-500">{description}</div>}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onRelease}
        onTouchEnd={onRelease}
        onKeyUp={onRelease}
        className="w-full accent-blue-500"
      />
    </div>
  );
}

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleOption({ label, description, checked, onChange }: ToggleOptionProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-200'}`} />
        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
          {label}
        </div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </label>
  );
}
