'use client';

interface HowToPlayHexChessProps {
  open: boolean;
  onClose: () => void;
}

export function HowToPlayHexChess({ open, onClose }: HowToPlayHexChessProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-semibold">How to Play Hex Chess</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Goal</h3>
          <p className="text-sm text-gray-700">Checkmate your opponent&apos;s king. A king is in check when an enemy piece could capture it on the next move; the player must eliminate the threat. If no move can escape check, it is checkmate and the checking player wins.</p>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Setup</h3>
          <p className="text-sm text-gray-700">Each player starts with 10 pieces on their arm of the star board: 1 King, 1 Queen, 2 Rooks, 2 Bishops, and 4 Peons. Kings sit at the apex; Peons form the front row facing the center.</p>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Pieces</h3>
          <ul className="text-sm text-gray-700 space-y-2">
            <li><strong>King</strong>: 1 step in any of 12 directions (edges + diagonals). Cannot move into check.</li>
            <li><strong>Queen</strong>: any distance along 6 edges or 6 diagonals.</li>
            <li><strong>Rook</strong>: any distance along 6 edge directions.</li>
            <li><strong>Bishop</strong>: any distance along 6 diagonal directions (2-hex steps).</li>
            <li><strong>Knight</strong>: leaps to the 12 nearest cells not reachable by a Queen in one step.</li>
            <li><strong>Peon</strong>: moves 1 diagonal forward, captures 1 edge forward on either side.</li>
          </ul>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Promotion</h3>
          <p className="text-sm text-gray-700">Peons that reach any cell of the opposing arm promote to a Queen, Rook, Bishop, or Knight — your choice.</p>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">En passant</h3>
          <p className="text-sm text-gray-700">When your Peon advances two cells (via its normal 1-diagonal step) and lands next to an enemy Peon, that enemy may capture your Peon immediately using its normal diagonal capture onto the passed-through cell (if that cell is empty). If your Peon slides directly past an enemy Peon standing beside its path, that Peon may instead capture onto the cell yours just left. Both apply even if your Peon promoted on arrival, and only on the immediately following turn.</p>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Draws</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>Stalemate: no legal moves and not in check.</li>
            <li>Threefold repetition: the same position occurs three times.</li>
            <li>Insufficient material: neither side can checkmate (King vs King, King+Bishop vs King, etc.).</li>
          </ul>
        </section>
        <section className="mb-4">
          <h3 className="font-medium mb-2">Multiplayer (3-6 players)</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>Each player fields a full army in their own corner; turns pass clockwise.</li>
            <li>Check is only a warning — you may ignore it, and you may even move into check.</li>
            <li>A player is eliminated when another player actually captures their king.</li>
            <li>An eliminated army turns grey and freezes: it never moves and gives no check, but still blocks paths and can be captured (knights leap over as usual).</li>
            <li>The last player standing wins. Threefold repetition is still a draw.</li>
          </ul>
        </section>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
