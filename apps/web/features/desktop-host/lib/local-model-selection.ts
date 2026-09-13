'use client';

import { create } from 'zustand';
import type { LocalModel } from '@agiworkforce/local-runtime-contract';

interface LocalModelSelectionState {
  selected: LocalModel | null;
  select: (model: LocalModel | null) => void;
}

/**
 * Which on-device model the composer is pointed at, if any.
 *
 * Deliberately not persisted and deliberately not the managed model store: a
 * local id would resolve to nothing in the published catalogue, and a
 * selection that survived a reload would put a conversation back on a boundary
 * the user has not re-chosen.
 */
export const useLocalModelSelection = create<LocalModelSelectionState>((set) => ({
  selected: null,
  select: (model) => set({ selected: model }),
}));

export function readSelectedLocalModel(): LocalModel | null {
  return useLocalModelSelection.getState().selected;
}
