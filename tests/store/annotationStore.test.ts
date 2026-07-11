import { describe, it, expect, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/store/annotationStore';
import { cubeCoord, coordKey } from '@/game/coordinates';

function reset() {
  useAnnotationStore.getState().clearAll();
}

describe('annotationStore', () => {
  beforeEach(reset);

  it('starts empty', () => {
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(0);
    expect(s.arrows.size).toBe(0);
  });

  it('toggleCircle adds a circle keyed by cell', () => {
    const cell = cubeCoord(1, -1);
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(1);
    expect(s.circles.get(coordKey(cell))).toEqual({ cell, color: '#ff0000' });
  });

  it('toggleCircle removes an existing circle regardless of the color passed', () => {
    const cell = cubeCoord(1, -1);
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    useAnnotationStore.getState().toggleCircle(cell, '#0000ff'); // different color, still removes
    expect(useAnnotationStore.getState().circles.size).toBe(0);
  });

  it('toggleArrow adds an arrow keyed by the directional (from, to) pair', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    const s = useAnnotationStore.getState();
    expect(s.arrows.size).toBe(1);
    const key = `${coordKey(from)}>${coordKey(to)}`;
    expect(s.arrows.get(key)).toEqual({ id: key, from, to, color: '#22c55e' });
  });

  it('toggleArrow removes an existing arrow on repeat with the same direction', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    useAnnotationStore.getState().toggleArrow(from, to, '#22c55e');
    expect(useAnnotationStore.getState().arrows.size).toBe(0);
  });

  it('A→B and B→A are distinct arrows', () => {
    const a = cubeCoord(0, 0);
    const b = cubeCoord(2, -1);
    useAnnotationStore.getState().toggleArrow(a, b, '#22c55e');
    useAnnotationStore.getState().toggleArrow(b, a, '#22c55e');
    expect(useAnnotationStore.getState().arrows.size).toBe(2);
  });

  it('clearAll empties both circles and arrows', () => {
    useAnnotationStore.getState().toggleCircle(cubeCoord(0, 0), '#ff0000');
    useAnnotationStore.getState().toggleArrow(cubeCoord(0, 0), cubeCoord(1, 0), '#ff0000');
    useAnnotationStore.getState().clearAll();
    const s = useAnnotationStore.getState();
    expect(s.circles.size).toBe(0);
    expect(s.arrows.size).toBe(0);
  });
});
