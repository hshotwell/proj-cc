import type { BoardLayout } from '@/types/game';

/**
 * Built-in "Traditional Hex Chess" board — a Glinski-style 91-cell hexagon
 * (radius 5) shown flat-top via rotated30, with classic white and black
 * armies facing each other. Always available in the hex chess board picker
 * for every player; never stored in (or deletable from) the user's layouts.
 *
 * Both armies derive an edge forward, so all pawns play with classic chess
 * pawn rules (1 straight step + double-step from their start cells, two
 * flanking capture cells). Promotion lines run along the opponent's home edge.
 */
export const TRADITIONAL_HEX_LAYOUT: BoardLayout = {
  id: 'builtin-traditional-hexchess',
  name: 'Traditional Hex Chess',
  createdAt: 0,
  gameMode: 'hexchess',
  rotated30: true,
  defaultColors: { 0: '#ffffff', 4: '#1a1a1a' },
  startingPositions: {},
  walls: [],
  cells: [
    '0,0', '-1,0', '0,-1', '1,-1', '1,0', '0,1', '-1,1', '-2,0', '0,-2',
    '2,-2', '2,0', '0,2', '-2,2', '-1,-1', '1,-2', '2,-1', '1,1', '-1,2',
    '-2,1', '-3,0', '0,-3', '3,-3', '3,0', '0,3', '-3,3', '-2,-1', '1,-3',
    '3,-2', '2,1', '-1,3', '-3,2', '-1,-2', '2,-3', '3,-1', '1,2', '-2,3',
    '-3,1', '0,-4', '4,-4', '4,0', '0,4', '-4,4', '-4,0', '1,-4', '4,-3',
    '3,1', '-1,4', '-4,3', '-3,-1', '2,-4', '4,-2', '2,2', '-2,4', '-4,2',
    '-2,-2', '3,-4', '4,-1', '1,3', '-3,4', '-4,1', '-1,-3', '-5,5', '-5,0',
    '0,-5', '5,-5', '5,0', '0,5', '-4,5', '-5,1', '-1,-4', '4,-5', '5,-1',
    '1,4', '-3,5', '-5,2', '-2,-3', '3,-5', '5,-2', '2,3', '-2,5', '-5,3',
    '-3,-2', '2,-5', '5,-3', '3,2', '-1,5', '-5,4', '-4,-1', '1,-5', '5,-4',
    '4,1',
  ],
  hexPieces: {
    // White (seat 0) — pawn line
    '-4,5': { player: 0, type: 'pawn' },
    '-3,4': { player: 0, type: 'pawn' },
    '-2,3': { player: 0, type: 'pawn' },
    '-1,2': { player: 0, type: 'pawn' },
    '0,1': { player: 0, type: 'pawn' },
    '1,1': { player: 0, type: 'pawn' },
    '2,1': { player: 0, type: 'pawn' },
    '3,1': { player: 0, type: 'pawn' },
    '4,1': { player: 0, type: 'pawn' },
    // White — back ranks
    '0,3': { player: 0, type: 'bishop' },
    '0,4': { player: 0, type: 'bishop' },
    '0,5': { player: 0, type: 'bishop' },
    '1,4': { player: 0, type: 'king' },
    '-1,5': { player: 0, type: 'queen' },
    '-2,5': { player: 0, type: 'knight' },
    '2,3': { player: 0, type: 'knight' },
    '-3,5': { player: 0, type: 'rook' },
    '3,2': { player: 0, type: 'rook' },
    // Black (seat 4) — pawn line
    '-4,-1': { player: 4, type: 'pawn' },
    '-3,-1': { player: 4, type: 'pawn' },
    '-2,-1': { player: 4, type: 'pawn' },
    '-1,-1': { player: 4, type: 'pawn' },
    '0,-1': { player: 4, type: 'pawn' },
    '1,-2': { player: 4, type: 'pawn' },
    '2,-3': { player: 4, type: 'pawn' },
    '3,-4': { player: 4, type: 'pawn' },
    '4,-5': { player: 4, type: 'pawn' },
    // Black — back ranks
    '0,-5': { player: 4, type: 'bishop' },
    '0,-4': { player: 4, type: 'bishop' },
    '0,-3': { player: 4, type: 'bishop' },
    '1,-5': { player: 4, type: 'king' },
    '-1,-4': { player: 4, type: 'queen' },
    '-2,-3': { player: 4, type: 'knight' },
    '2,-5': { player: 4, type: 'knight' },
    '-3,-2': { player: 4, type: 'rook' },
    '3,-5': { player: 4, type: 'rook' },
  },
  promotionPositions: {
    0: ['-5,0', '-4,-1', '-3,-2', '-2,-3', '-1,-4', '0,-5', '1,-5', '2,-5', '3,-5', '4,-5', '5,-5'],
    4: ['-5,5', '-4,5', '-3,5', '-2,5', '-1,5', '0,5', '1,4', '2,3', '3,2', '4,1', '5,0'],
  },
  promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
};
