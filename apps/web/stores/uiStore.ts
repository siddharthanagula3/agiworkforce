'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UIState {
  simpleMode: boolean;
  setSimpleMode: (simple: boolean) => void;
  toggleSimpleMode: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      simpleMode: false,
      setSimpleMode: (simple) => set({ simpleMode: simple }),
      toggleSimpleMode: () => set((state) => ({ simpleMode: !state.simpleMode })),
    }),
    {
      name: 'agiworkforce-web-ui',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
