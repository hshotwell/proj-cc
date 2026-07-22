import type { PlayerIndex } from '@/types/game';
import { PLAYER_COLORS } from '@/game/constants';

/** Small SVG preview of a board's cell layout, used in board pickers. */
export function BoardPreview({
  cells,
  startingPositions,
  walls = [],
  size = 64,
}: {
  cells: string[];
  startingPositions: Partial<Record<PlayerIndex, string[]>>;
  walls?: string[];
  size?: number;
}) {
  if (cells.length === 0) return <div style={{ width: size, height: size }} />;

  // Pointy-top hex: x = sqrt(3) * (q + r/2), y = 3/2 * r
  const toXY = (key: string) => {
    const [q, r] = key.split(',').map(Number);
    return { x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r };
  };

  const points = cells.map(k => ({ key: k, ...toXY(k) }));
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range = Math.max(rangeX, rangeY);
  const pad = 2;
  const inner = size - pad * 2;
  const scale = inner / range;
  const offX = (inner - rangeX * scale) / 2;
  const offY = (inner - rangeY * scale) / 2;

  const px = (x: number) => (x - minX) * scale + pad + offX;
  const py = (y: number) => (y - minY) * scale + pad + offY;

  const playerAtCell: Record<string, PlayerIndex> = {};
  for (const [pStr, positions] of Object.entries(startingPositions)) {
    if (positions) for (const pos of positions) playerAtCell[pos] = Number(pStr) as PlayerIndex;
  }
  const wallSet = new Set(walls);
  const r = Math.max(0.8, scale * 0.44);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {points.map(({ key, x, y }) => {
        const pi = playerAtCell[key];
        const fill = wallSet.has(key) ? '#6b7280' : pi !== undefined ? PLAYER_COLORS[pi] : '#d1d5db';
        return <circle key={key} cx={px(x)} cy={py(y)} r={r} fill={fill} />;
      })}
    </svg>
  );
}
