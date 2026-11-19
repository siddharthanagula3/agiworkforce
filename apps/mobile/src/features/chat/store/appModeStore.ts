import { create, type StateCreator, type StoreMutatorIdentifier } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export type MobileChatAppMode = 'local' | 'cloud';

interface ChatAppModeState {
  appMode: MobileChatAppMode;
  setAppMode: (mode: MobileChatAppMode) => void;
}

export type AppModeAdmission = (requested: MobileChatAppMode) => MobileChatAppMode;

let admitAppMode: AppModeAdmission | null = null;

export function setAppModeAdmission(admission: AppModeAdmission | null): void {
  admitAppMode = admission;
}

type AppModeGate = <
  T extends { appMode: MobileChatAppMode },
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  creator: StateCreator<T, Mps, Mcs>,
) => StateCreator<T, Mps, Mcs>;

type AppModeGateImpl = <T extends { appMode: MobileChatAppMode }>(
  creator: StateCreator<T, [], []>,
) => StateCreator<T, [], []>;

// Every write passes here, the setter, setState and the persisted value read
// back at launch alike, so no writer can show Cloud Mode the admission refuses.
const appModeGateImpl: AppModeGateImpl =
  <T extends { appMode: MobileChatAppMode }>(
    creator: StateCreator<T, [], []>,
  ): StateCreator<T, [], []> =>
  (set, get, api) => {
    const admittedSet: typeof set = (...args: unknown[]) => {
      const [partial, replace] = args as [unknown, boolean | undefined];
      const next = (
        typeof partial === 'function' ? (partial as (state: T) => Partial<T>)(get()) : partial
      ) as Partial<T>;
      const requested = next.appMode;
      const admission = admitAppMode;
      const admitted =
        admission && (requested === 'local' || requested === 'cloud')
          ? { ...next, appMode: admission(requested) }
          : next;
      set(...([admitted, replace] as Parameters<typeof set>));
    };
    api.setState = admittedSet;
    return creator(admittedSet, get, api);
  };

const appModeGate = appModeGateImpl as unknown as AppModeGate;

export const useChatAppModeStore = create<ChatAppModeState>()(
  appModeGate(
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
  ),
);

rehydrateWhenMmkvReady(useChatAppModeStore, 'chat-app-mode-store');

if (__DEV__) {
  (globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ = {
    ...((globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ ?? {}),
    appModeStore: useChatAppModeStore,
  };
}
