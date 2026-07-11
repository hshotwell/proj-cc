'use client';

import { create } from 'zustand';
import type { CubeCoord } from '@/types/game';
import { coordKey } from '@/game/coordinates';

export interface AnnotationCircle {
  cell: CubeCoord;
  color: string;
}

export interface AnnotationArrow {
  id: string;
  from: CubeCoord;
  to: CubeCoord;
  color: string;
}

interface AnnotationStoreState {
  circles: Map<string, AnnotationCircle>;
  arrows: Map<string, AnnotationArrow>;
  toggleCircle: (cell: CubeCoord, color: string) => void;
  toggleArrow: (from: CubeCoord, to: CubeCoord, color: string) => void;
  clearAll: () => void;
}

export const useAnnotationStore = create<AnnotationStoreState>((set, get) => ({
  circles: new Map(),
  arrows: new Map(),

  toggleCircle(cell, color) {
    const key = coordKey(cell);
    const next = new Map(get().circles);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { cell, color });
    }
    set({ circles: next });
  },

  toggleArrow(from, to, color) {
    const key = `${coordKey(from)}>${coordKey(to)}`;
    const next = new Map(get().arrows);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { id: key, from, to, color });
    }
    set({ arrows: next });
  },

  clearAll() {
    set({ circles: new Map(), arrows: new Map() });
  },
}));
