import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import type { PrivacyMode } from '@agiworkforce/types';
import { storageFallback } from '../lib/storageFallback';
import { supportsLocalAppMode } from '../lib/runtimeEnvironment';
import { isChatStoreStreaming } from './chat/chatStoreRef';

export type AppMode = 'local' | 'cloud';

interface AppModeState {
  mode: AppMode;
  hasOnboarded: boolean;
  hasSelectedMode: boolean;
  isOnline: boolean;

  setMode: (mode: AppMode) => void;
  completeOnboarding: () => void;
  setHasSelectedMode: (selected: boolean) => void;
  setOnline: (online: boolean) => void;
}

const APP_MODE_STORE_VERSION = 3;

type PersistedAppModeState = Pick<AppModeState, 'mode' | 'hasOnboarded' | 'hasSelectedMode'>;

function sanitizePersistedAppModeState(value: unknown): PersistedAppModeState {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : Object.create(null);
  let mode: AppMode = raw['mode'] === 'cloud' ? 'cloud' : 'local';

  if (!supportsLocalAppMode && mode === 'local') mode = 'cloud';

  return {
    mode,
    hasOnboarded: raw['hasOnboarded'] === true,
    hasSelectedMode: raw['hasSelectedMode'] === true,
  };
}

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        mode: supportsLocalAppMode ? 'local' : 'cloud',
        hasOnboarded: false,
        hasSelectedMode: false,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

        setMode: (mode: AppMode) => {
          if (!supportsLocalAppMode && mode === 'local') {
            toast.info('Local mode requires the desktop app');
            return;
          }
          if (isChatStoreStreaming()) {
            toast.error('Finish the current response before switching modes');
            return;
          }
          if (mode === 'cloud') {
            set({ mode }, undefined, 'appMode/setMode');
            return;
          }
          set({ mode }, undefined, 'appMode/setMode');
        },

        completeOnboarding: () => {
          set({ hasOnboarded: true }, undefined, 'appMode/completeOnboarding');
        },

        setHasSelectedMode: (selected: boolean) => {
          set({ hasSelectedMode: selected }, undefined, 'appMode/setHasSelectedMode');
        },

        setOnline: (online: boolean) => {
          set({ isOnline: online }, undefined, 'appMode/setOnline');
        },
      })),
      {
        name: 'app-mode-store',
        version: APP_MODE_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          mode: state.mode,
          hasSelectedMode: state.hasSelectedMode,
        }),
        migrate: (persistedState: unknown, _version: number) =>
          sanitizePersistedAppModeState(persistedState),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizePersistedAppModeState(persistedState),
        }),
      },
    ),
    { name: 'AppModeStore', enabled: import.meta.env.DEV },
  ),
);

if (typeof window !== 'undefined' && !window.localStorage.getItem('app-mode-store')) {
  useAppModeStore.setState((state) => ({ ...state }));
}

export const selectMode = (state: AppModeState): AppMode => state.mode;
export const selectIsCloud = (state: AppModeState): boolean => state.mode === 'cloud';
export const selectIsLocal = (state: AppModeState): boolean => state.mode === 'local';
export const selectHasOnboarded = (state: AppModeState): boolean => state.hasOnboarded;

export const selectPrivacyMode = (state: AppModeState): PrivacyMode => {
  return state.mode === 'local' ? 'local' : 'managed';
};
