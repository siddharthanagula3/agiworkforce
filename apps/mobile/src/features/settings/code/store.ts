import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface CodePreferences {
  wrapLongLines: boolean;
  setWrapLongLines: (wrapLongLines: boolean) => void;
}

const STORE_NAME = 'code-preferences';

export const useCodePreferences = create<CodePreferences>()(
  persist(
    (set) => ({
      wrapLongLines: false,
      setWrapLongLines: (wrapLongLines) => set({ wrapLongLines }),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({ wrapLongLines: state.wrapLongLines }),
      merge: (persisted, current) => {
        const stored = (persisted as { wrapLongLines?: unknown } | undefined)?.wrapLongLines;
        return typeof stored === 'boolean' ? { ...current, wrapLongLines: stored } : current;
      },
    },
  ),
);

rehydrateWhenMmkvReady(useCodePreferences, STORE_NAME);
