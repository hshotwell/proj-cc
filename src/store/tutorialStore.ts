import { create } from 'zustand';
import { useGameStore } from './gameStore';
import { useSettingsStore } from './settingsStore';
import type { PieceVariant, PlayerIndex } from '@/types/game';

export type TutorialTrigger =
  | 'piece-selected'       // auto when player selects a piece
  | 'move-made'            // auto when pendingConfirmation becomes true
  | 'turn-confirmed'       // auto when turnNumber increments
  | 'own-confirmed'        // auto when player confirms their own move (pendingConfirmation true→false)
  | 'manual'               // shows a button to advance
  | 'menu-opened'          // auto when the settings menu is opened
  | 'swap-possible'        // card only shows when swap moves exist; ends on swap
  | 'multi-hop-turn-confirmed'; // auto when player completes a turn with 2+ hops

export type TutorialPosition = 'center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'right-full';

export interface TutorialStep {
  message: string;
  subtext?: string;
  trigger: TutorialTrigger;
  position: TutorialPosition;
  /** Only show this step's card once turnNumber >= this value */
  showAfterTurn?: number;
  /** A second simultaneous card shown alongside this step */
  paired?: { message: string; subtext?: string; position: Exclude<TutorialPosition, 'center'> };
}

interface TutorialStore {
  isActive: boolean;
  currentStep: number;
  gameId: string | null;
  steps: TutorialStep[];
  /** coordKey of the AI piece the AI will never move (for the swap lesson) */
  blockedPieceKey: string | null;
  startTutorial: (humanColor?: string, pieceType?: PieceVariant) => string;
  nextStep: () => void;
  releaseBlockedPiece: () => void;
  endTutorial: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    position: 'center',
    trigger: 'manual',
    message:
      'Welcome to Sternhalma — Chinese Checkers! Race to move all your pieces to the opposite end of the board before your opponent does.',
  },
  {
    position: 'bottom-left',
    trigger: 'piece-selected',
    message: 'Each turn, click a piece to select it.',
  },
  {
    position: 'bottom-right',
    trigger: 'move-made',
    message:
      'The highlighted spaces show where your piece can move — step to an adjacent space, or hop over another piece.',
  },
  {
    position: 'bottom-left',
    trigger: 'own-confirmed',
    message: "To undo a move, click the piece's previous position, press Undo, or hit U.",
    paired: {
      message: 'When ready, confirm your move by clicking any space twice, pressing Confirm, or hitting C.',
      position: 'bottom-right',
    },
  },
  {
    position: 'right-full',
    trigger: 'multi-hop-turn-confirmed',
    message:
      'After hopping over a piece, you can keep jumping in the same turn — chain as many hops as you can! Look for pieces lined up so you can leap across the board in a single move.',
  },
  {
    position: 'top-left',
    trigger: 'menu-opened',
    showAfterTurn: 4,
    message: 'You can adjust settings or return to the main menu anytime.',
    subtext: 'Click the ⚙ gear icon at the top-left, or press Esc.',
  },
  {
    position: 'top-right',
    trigger: 'swap-possible',
    message:
      "Once all your pieces have left your starting zone, you can swap one of your pieces with an opponent's piece that's blocking your goal — as long as your piece is adjacent to it.",
  },
];

export const useTutorialStore = create<TutorialStore>((set) => ({
  isActive: false,
  currentStep: 0,
  gameId: null,
  steps: TUTORIAL_STEPS,
  blockedPieceKey: null,

  startTutorial: (humanColor?: string, pieceType?: PieceVariant) => {
    const playerPieceTypes: Partial<Record<PlayerIndex, PieceVariant>> | undefined =
      pieceType && pieceType !== 'normal' ? { 0: pieceType } : undefined;

    const gameId = useGameStore.getState().startGame(
      2,
      [0, 2],
      { 0: humanColor ?? '#ef4444', 2: '#22d3ee' },
      { 2: { difficulty: 'easy', personality: 'generalist' } },
      { 0: 'You', 2: 'AI' },
      undefined,
      playerPieceTypes,
    );

    // Find player 2's front piece (q=-1, r=5) to block so the swap lesson can trigger later
    const gs = useGameStore.getState().gameState!;
    let blockedPieceKey: string | null = null;
    for (const [key, content] of gs.board) {
      if (content.type === 'piece' && content.player === 2) {
        const parts = key.split(',').map(Number);
        if (parts[0] === -1 && parts[1] === 5) {
          blockedPieceKey = key;
          break;
        }
      }
    }

    // Disable auto-confirm so the player sees move confirmation prompts
    if (useSettingsStore.getState().autoConfirm) {
      useSettingsStore.getState().toggleAutoConfirm();
    }

    set({ isActive: true, currentStep: 0, gameId, blockedPieceKey });
    return gameId;
  },

  nextStep: () => {
    set((state) => {
      const next = state.currentStep + 1;
      if (next >= state.steps.length) return state;
      return { currentStep: next };
    });
  },

  releaseBlockedPiece: () => {
    set({ blockedPieceKey: null });
  },

  endTutorial: () => {
    set({ isActive: false, blockedPieceKey: null });
  },
}));
