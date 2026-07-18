import type { CubeCoord } from '@/types/game';
import { cubeAdd, coordKey } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, KNIGHT_LEAPS } from './directions';
import { pieceAt, kingOf, isEliminated } from './board';
import { geometryOf, isOpenCell } from './geometry';
import type { HexChessState, HexMove, HexPiece, HexPlayerIndex } from './state';
import { rulesModeOf } from './state';
import { applyMoveCore, pseudoMovesForPiece } from './moves';
import { hashState } from './zobrist';

/**
 * Compute all cells attacked (defended/threatened) by a sliding piece.
 * Rays extend in each direction until they leave the board or hit any piece
 * (the piece's own cell is included — the ray stops AT the occupant, including it).
 * This differs from slidingMoves() which stops BEFORE own pieces.
 */
function slidingAttackCells(
  state: HexChessState,
  piece: HexPiece,
  dirs: CubeCoord[],
): CubeCoord[] {
  const geom = geometryOf(state);
  const targets: CubeCoord[] = [];
  for (const d of dirs) {
    let cell = cubeAdd(piece.cell, d);
    while (isOpenCell(geom, cell)) {
      targets.push(cell);
      if (pieceAt(state, cell) !== null) break; // stop AT the blocking piece (include it)
      cell = cubeAdd(cell, d);
    }
  }
  return targets;
}

/**
 * Returns the set of cells attacked by `piece`, for the purpose of check
 * detection. Own-piece cells are included (a piece "defends" own pieces).
 * Soldier and pawn use their CAPTURE cells only (not their move cells).
 */
function attackCellsForPiece(state: HexChessState, piece: HexPiece): CubeCoord[] {
  const geom = geometryOf(state);
  const open = (c: CubeCoord) => isOpenCell(geom, c);
  switch (piece.type) {
    case 'rook':
      return slidingAttackCells(state, piece, EDGE_DIRECTIONS);

    case 'bishop':
      return slidingAttackCells(state, piece, DIAGONAL_DIRECTIONS);

    case 'queen':
      return [
        ...slidingAttackCells(state, piece, EDGE_DIRECTIONS),
        ...slidingAttackCells(state, piece, DIAGONAL_DIRECTIONS),
      ];

    case 'knight':
      return KNIGHT_LEAPS
        .map(l => cubeAdd(piece.cell, l))
        .filter(open);

    case 'king':
      return [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS]
        .map(d => cubeAdd(piece.cell, d))
        .filter(open);

    case 'soldier':
    case 'pawn': {
      // Both capture (and therefore attack) exactly their two flanking
      // capture-direction cells — never their forward move cell.
      const fwd = geom.forward[piece.player];
      if (!fwd) return [];
      return fwd.captureDirs.map(e => cubeAdd(piece.cell, e)).filter(open);
    }
  }
}

/**
 * Returns true if `cell` is attacked by any piece belonging to `byPlayer`.
 * For check purposes, "attacked" means: a piece of `byPlayer` could move
 * there (or could capture there in the case of soldier/pawn).
 */
export function isCellAttacked(
  state: HexChessState,
  cell: CubeCoord,
  byPlayer: HexPlayerIndex,
): boolean {
  const cellKey = coordKey(cell);
  for (const piece of state.pieces) {
    if (piece.player !== byPlayer) continue;
    const attacked = attackCellsForPiece(state, piece);
    if (attacked.some(c => coordKey(c) === cellKey)) return true;
  }
  return false;
}

/**
 * Returns true if `cell` is attacked by any LIVING enemy of `ofPlayer`.
 * Eliminated players' frozen pieces give no threats.
 */
export function isCellAttackedByEnemies(
  state: HexChessState,
  cell: CubeCoord,
  ofPlayer: HexPlayerIndex,
): boolean {
  const cellKey = coordKey(cell);
  for (const piece of state.pieces) {
    if (piece.player === ofPlayer) continue;
    if (isEliminated(state, piece.player)) continue;
    const attacked = attackCellsForPiece(state, piece);
    if (attacked.some(c => coordKey(c) === cellKey)) return true;
  }
  return false;
}

/**
 * Returns true if `player`'s king is currently attacked by any living enemy.
 * Returns false if the king cannot be found (invalid/in-progress state) or
 * the player is already eliminated.
 */
export function isInCheck(state: HexChessState, player: HexPlayerIndex): boolean {
  if (isEliminated(state, player)) return false;
  const king = kingOf(state, player);
  if (!king) return false;
  return isCellAttackedByEnemies(state, king.cell, player);
}

/**
 * Filters `pseudos` to only those moves that do NOT leave `state.currentPlayer`'s
 * king in check after the move is applied.
 *
 * King-capture mode (3+ players): check is advisory only — every pseudo-legal
 * move is legal, including moving into or ignoring check.
 */
export function filterLegal(state: HexChessState, pseudos: HexMove[]): HexMove[] {
  if (rulesModeOf(state) === 'king-capture') return pseudos;
  const mover = state.currentPlayer;
  return pseudos.filter(move => {
    // Use applyMoveCore (no result detection) to avoid infinite recursion:
    // applyMove → isCheckmate → legalMoves → filterLegal → applyMove → ...
    const next = applyMoveCore(state, move);
    // `next.currentPlayer` has flipped; `mover` is the player who just moved.
    // The move is legal only if it does not leave that player's king in check.
    return !isInCheck(next, mover);
  });
}

/**
 * Returns all fully legal moves for `state.currentPlayer`: generates pseudo-moves
 * for every piece belonging to that player, then filters through `filterLegal`.
 */
export function legalMoves(state: HexChessState): HexMove[] {
  const mover = state.currentPlayer;
  const result: HexMove[] = [];
  for (const piece of state.pieces) {
    if (piece.player !== mover) continue;
    const pseudos = pseudoMovesForPiece(state, piece);
    const legal = filterLegal(state, pseudos);
    result.push(...legal);
  }
  return result;
}

/**
 * Returns true if `state.currentPlayer` is in checkmate: they have no legal
 * moves AND their king is currently in check.
 * Called after `applyMove` has advanced the turn to the player who may be mated.
 */
export function isCheckmate(state: HexChessState): boolean {
  return legalMoves(state).length === 0 && isInCheck(state, state.currentPlayer);
}

/**
 * Returns true if `state.currentPlayer` is stalemated: they have no legal
 * moves AND their king is NOT currently in check.
 * Called after `applyMove` has advanced the turn to the player who may be stalemated.
 */
export function isStalemate(state: HexChessState): boolean {
  return legalMoves(state).length === 0 && !isInCheck(state, state.currentPlayer);
}

/**
 * Returns true if the current position has appeared three or more times
 * (tracked via Zobrist hashes in `state.positionHashes`).
 */
export function isThreefoldRepetition(state: HexChessState): boolean {
  const hash = hashState(state);
  return (state.positionHashes[hash] ?? 0) >= 3;
}

/**
 * Hex color of a cell: `(q + 2*r) mod 3` — one of 0, 1, 2.
 * Used for bishop same-color detection (mod result is taken as unsigned).
 */
function hexColor(q: number, r: number): number {
  return ((q + 2 * r) % 3 + 3) % 3;
}

/**
 * Returns true if the position has insufficient material for either side to
 * force checkmate. Recognized patterns (symmetric):
 *   - K vs K
 *   - K+B vs K
 *   - K+N vs K
 *   - K+B vs K+B where both bishops occupy cells of the same hex color
 */
export function isInsufficientMaterial(state: HexChessState): boolean {
  // 2-player (checkmate mode) only — multiplayer never calls this.
  const [seatA, seatB] = state.activePlayers;
  // Partition pieces by player, ignoring kings
  const extras0 = state.pieces.filter(p => p.player === seatA && p.type !== 'king');
  const extras1 = state.pieces.filter(p => p.player === seatB && p.type !== 'king');

  // Mating material check: only pieces that cannot force mate are bishop/knight
  const isMatingType = (type: HexPiece['type']): boolean =>
    type !== 'bishop' && type !== 'knight';

  // If either side has any mating piece (queen, rook, soldier, pawn), material is sufficient
  if (extras0.some(p => isMatingType(p.type))) return false;
  if (extras1.some(p => isMatingType(p.type))) return false;

  // K vs K
  if (extras0.length === 0 && extras1.length === 0) return true;

  // K+minor vs K
  if (extras0.length === 1 && extras1.length === 0) return true;
  if (extras0.length === 0 && extras1.length === 1) return true;

  // K+B vs K+B: only insufficient if bishops share the same hex color
  if (
    extras0.length === 1 && extras0[0].type === 'bishop' &&
    extras1.length === 1 && extras1[0].type === 'bishop'
  ) {
    const c0 = hexColor(extras0[0].cell.q, extras0[0].cell.r);
    const c1 = hexColor(extras1[0].cell.q, extras1[0].cell.r);
    return c0 === c1;
  }

  return false;
}
