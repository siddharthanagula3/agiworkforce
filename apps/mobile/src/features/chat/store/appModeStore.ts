import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export type MobileChatAppMode = 'local' | 'cloud';

interface ChatAppModeState {
  appMode: MobileChatAppMode;
  setAppMode: (mode: MobileChatAppMode) => void;
}

export const useChatAppModeStore = create<ChatAppModeState>()(
  persist(
    (set) => ({
      appMode: 'local',
      setAppMode: (mode) => set({ appMode: mode }),
    }),
    {
      name: 'chat-app-mode-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatAppModeStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useChatAppModeStore, 'chat-app-mode-store');

/** Dev-only inspection handle — see the note in src/features/billing/store.ts. */
if (__DEV__) {
  (globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ = {
    ...((globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ ?? {}),
    appModeStore: useChatAppModeStore,
  };
}
