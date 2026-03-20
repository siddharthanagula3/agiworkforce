/**
 * App Mode Store
 *
 * Foundation store for the Dual-Mode Architecture (Local vs Cloud).
 * All mode-gated features read from this store.
 *
 * Persists: mode, planTier, hasOnboarded
 * Not persisted: isOnline (always derived from navigator.onLine at startup)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { isTauri } from '../lib/tauri-mock';

export type AppMode = 'local' | 'cloud';
export type PlanTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

interface AppModeState {
  mode: AppMode;
  planTier: PlanTier;
  hasOnboarded: boolean;
  isOnline: boolean;

  setMode: (mode: AppMode) => void;
  setPlanTier: (tier: PlanTier) => void;
  completeOnboarding: () => void;
  setOnline: (online: boolean) => void;
}

const APP_MODE_STORE_VERSION = 1;

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        mode: isTauri ? 'local' : 'cloud',
        planTier: 'free',
        hasOnboarded: false,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

        setMode: (mode: AppMode) => {
          // Web mode is always cloud — cannot switch to local
          if (!isTauri && mode === 'local') {
            import('sonner').then(({ toast }) => {
              toast.info('Local mode requires the desktop app');
            });
            return;
          }
          // Block mode switching while chat is actively streaming to avoid mid-stream state
          // inconsistencies. Use dynamic imports to avoid circular dependencies.
          import('./chat/chatStore')
            .then(({ useChatStore }) => {
              const isStreaming = useChatStore.getState().isStreaming;
              if (isStreaming) {
                import('sonner').then(({ toast }) => {
                  toast.error('Finish the current response before switching modes');
                });
                return;
              }
              // Cloud mode requires authentication
              if (mode === 'cloud') {
                import('./auth').then(({ useAuthStore }) => {
                  const isAuthenticated = useAuthStore.getState().isAuthenticated;
                  if (!isAuthenticated) {
                    import('sonner').then(({ toast }) => {
                      toast.error('Sign in to use Cloud mode');
                    });
                    return;
                  }
                  set({ mode }, undefined, 'appMode/setMode');
                });
                return;
              }
              set({ mode }, undefined, 'appMode/setMode');
            })
            .catch(() => {
              // chatStore not available — allow mode switch
              set({ mode }, undefined, 'appMode/setMode');
            });
        },

        setPlanTier: (tier: PlanTier) => {
          set({ planTier: tier }, undefined, 'appMode/setPlanTier');
        },

        completeOnboarding: () => {
          set({ hasOnboarded: true }, undefined, 'appMode/completeOnboarding');
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
          planTier: state.planTier,
          hasOnboarded: state.hasOnboarded,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          const state = persistedState as AppModeState;
          // Web builds must always be in cloud mode
          if (!isTauri && state.mode === 'local') {
            return { ...state, mode: 'cloud' };
          }
          return state;
        },
      },
    ),
    { name: 'AppModeStore', enabled: import.meta.env.DEV },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectMode = (state: AppModeState): AppMode => state.mode;
export const selectIsCloud = (state: AppModeState): boolean => state.mode === 'cloud';
export const selectIsLocal = (state: AppModeState): boolean => state.mode === 'local';
export const selectPlanTier = (state: AppModeState): PlanTier => state.planTier;
export const selectHasOnboarded = (state: AppModeState): boolean => state.hasOnboarded;

// Reload conversations when mode changes
useAppModeStore.subscribe(
  (state) => state.mode,
  (mode, prevMode) => {
    if (mode !== prevMode) {
      import('./chat/chatStore').then(({ useChatStore }) => {
        import('./auth').then(({ useAuthStore }) => {
          const user = useAuthStore.getState().user;
          if (user?.id) {
            useChatStore.setState({
              conversations: [],
              messages: [],
              activeConversationId: null,
              messagesByConversation: {},
            });
            useChatStore.getState().loadConversations(user.id);
          }
        });
      });
    }
  },
);
