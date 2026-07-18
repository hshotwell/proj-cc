'use client';

import type { PlayerIndex } from '@/types/game';
import type { HexPromotionOption, ForwardSpec } from '@/game/hexchess';
import { cubeToPixel } from '@/game/coordinates';

const OPTION_LABELS: Record<HexPromotionOption, string> = {
  knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen',
};

export function HexPromotionsPanel({
  armies, armyColors, promoArmy, onSelectArmy,
  options, onToggleOption, forwards, darkMode,
}: {
  armies: PlayerIndex[];
  armyColors: Partial<Record<PlayerIndex, string>>;
  promoArmy: PlayerIndex | null;
  onSelectArmy: (p: PlayerIndex) => void;
  options: Set<HexPromotionOption>;
  onToggleOption: (o: HexPromotionOption) => void;
  /** Derived forward per army; null/undefined = promotion tiles missing. */
  forwards: Partial<Record<PlayerIndex, ForwardSpec | null>>;
  darkMode: boolean;
}) {
  const dm = (d: string, l: string) => (darkMode ? d : l);
  return (
    <div className="flex flex-col gap-2">
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Draw promotion tiles for</div>
      <div className="flex gap-1.5 flex-wrap">
        {armies.map((p) => (
          <button
            key={p}
            onClick={() => onSelectArmy(p)}
            title={armyColors[p]}
            className={`w-6 h-6 rounded-full transition-all ${
              promoArmy === p ? `ring-2 ring-blue-500 ${dm('ring-offset-gray-800', '')} ring-offset-1` : 'hover:scale-110'
            }`}
            style={{ backgroundColor: armyColors[p], border: '1.5px solid rgba(0,0,0,0.3)' }}
          />
        ))}
        {armies.length === 0 && (
          <span className={`text-xs ${dm('text-gray-500', 'text-gray-400')}`}>Place pieces first.</span>
        )}
      </div>
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Can promote to</div>
      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(OPTION_LABELS) as HexPromotionOption[]).map((o) => (
          <button
            key={o}
            onClick={() => onToggleOption(o)}
            className={`px-2 py-1 text-xs rounded transition-all ${
              options.has(o)
                ? 'bg-blue-600 text-white'
                : dm('bg-gray-700 text-gray-500 line-through', 'bg-gray-100 text-gray-400 line-through')
            }`}
          >
            {OPTION_LABELS[o]}
          </button>
        ))}
      </div>
      <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Derived forward</div>
      <div className="flex flex-col gap-1">
        {armies.map((p) => {
          const fwd = forwards[p];
          const px = fwd ? cubeToPixel(fwd.dir, 10) : null;
          const angle = px ? (Math.atan2(px.y, px.x) * 180) / Math.PI : 0;
          return (
            <div key={p} className={`flex items-center gap-2 text-xs ${dm('text-gray-300', 'text-gray-700')}`}>
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: armyColors[p], border: '1px solid rgba(0,0,0,0.3)' }}
              />
              {fwd ? (
                <>
                  <svg width="14" height="14" viewBox="-7 -7 14 14" className="shrink-0">
                    <g transform={`rotate(${angle})`}>
                      <line x1={-5} y1={0} x2={2} y2={0} stroke="currentColor" strokeWidth={1.5} />
                      <path d="M 1 -3 L 5.5 0 L 1 3 Z" fill="currentColor" />
                    </g>
                  </svg>
                  <span>{fwd.kind === 'point' ? 'point — plays as peon' : 'edge — plays as pawn'}</span>
                </>
              ) : (
                <span className={dm('text-yellow-400', 'text-yellow-600')}>place promotion tiles to set direction</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
