import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { storageFallback } from '../lib/storageFallback';

interface CoworkDispatchState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/**
 * Device-local authority for accepting new tasks from a paired Mobile
 * companion. Default-off is intentional: pairing alone never grants task
 * execution authority.
 */
export const useCoworkDispatchStore = create<CoworkDispatchState>()(
  devtools(
    persist(
      (set) => ({
        enabled: false,
        setEnabled: (enabled) =>
          set({ enabled }, undefined, `coworkDispatch/${enabled ? 'enable' : 'disable'}`),
      }),
      {
        name: 'agiworkforce-cowork-dispatch',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({ enabled: state.enabled }),
      },
    ),
    { name: 'CoworkDispatchStore' },
  ),
);
