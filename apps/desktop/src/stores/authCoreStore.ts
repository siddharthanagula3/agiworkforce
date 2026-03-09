/**
 * Auth Core Store
 *
 * Handles authentication identity: login/logout, session, user object.
 * Extracted from the unified auth.ts god store.
 *
 * Consumers should prefer importing from this store directly rather than
 * using the backwards-compat facade in auth.ts when only auth identity
 * state is needed.
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { supabaseAuth } from '../services/supabaseAuth';

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}

// =============================================================================
// State & Actions
// =============================================================================

interface AuthCoreState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;
  sessionValidated: boolean;
}

interface AuthCoreActions {
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  setSessionValidated: (state: boolean) => void;
  isAuthReady: () => boolean;
  setError: (error: string | null) => void;
  clearError: () => void;

  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'github' | 'google') => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

type AuthCoreStore = AuthCoreState & AuthCoreActions;

// =============================================================================
// Store
// =============================================================================

export const useAuthCoreStore = create<AuthCoreStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Default state
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        _hasHydrated: false,
        sessionValidated: false,

        setUser: (user) => {
          set(
            { user, isAuthenticated: !!user, sessionValidated: true, error: null },
            undefined,
            'authCore/setUser',
          );
        },

        getCurrentUserId: () => get().user?.id || '',

        clearAuth: () => {
          set(
            {
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
              sessionValidated: true,
            },
            undefined,
            'authCore/clearAuth',
          );
        },

        setHasHydrated: (state) => {
          set({ _hasHydrated: state }, undefined, 'authCore/setHasHydrated');
        },

        setSessionValidated: (state) => {
          set({ sessionValidated: state }, undefined, 'authCore/setSessionValidated');
        },

        isAuthReady: () => {
          const state = get();
          return state._hasHydrated && state.sessionValidated;
        },

        setError: (error) => set({ error }, undefined, 'authCore/setError'),
        clearError: () => set({ error: null }, undefined, 'authCore/clearError'),

        signIn: async (email, password) => {
          set({ isLoading: true, error: null }, undefined, 'authCore/signIn/start');
          try {
            const response = await supabaseAuth.signIn({ email, password });
            if (response.error) {
              set({ error: response.error.message }, undefined, 'authCore/signIn/error');
              return { error: response.error.message };
            }
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'authCore/signIn/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'authCore/signIn/complete');
          }
        },

        signUp: async (email, password, name) => {
          set({ isLoading: true, error: null }, undefined, 'authCore/signUp/start');
          try {
            const response = await supabaseAuth.signUp({ email, password, displayName: name });
            if (response.error) {
              set({ error: response.error.message }, undefined, 'authCore/signUp/error');
              return { error: response.error.message };
            }
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'authCore/signUp/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'authCore/signUp/complete');
          }
        },

        signOut: async () => {
          set({ isLoading: true }, undefined, 'authCore/signOut/start');
          try {
            await supabaseAuth.signOut();
          } catch (error) {
            console.error('[AuthCore] Sign out error:', error);
          } finally {
            set(
              {
                user: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
                _hasHydrated: true,
                sessionValidated: true,
              },
              undefined,
              'authCore/signOut/complete',
            );
          }
        },

        signInWithMagicLink: async (email) => {
          set({ isLoading: true, error: null }, undefined, 'authCore/magicLink/start');
          try {
            const { error } = await supabaseAuth.signInWithMagicLink(email);
            if (error) {
              set({ error: error.message }, undefined, 'authCore/magicLink/error');
              return { error: error.message };
            }
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'authCore/magicLink/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'authCore/magicLink/complete');
          }
        },

        resetPassword: async (email) => {
          set({ isLoading: true, error: null }, undefined, 'authCore/resetPassword/start');
          try {
            const { error } = await supabaseAuth.resetPassword(email);
            if (error) {
              set({ error: error.message }, undefined, 'authCore/resetPassword/error');
              return { error: error.message };
            }
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'authCore/resetPassword/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'authCore/resetPassword/complete');
          }
        },

        signInWithOAuth: async (provider) => {
          set({ isLoading: true, error: null }, undefined, 'authCore/oauth/start');
          try {
            const { error } = await supabaseAuth.signInWithOAuth(provider);
            if (error) {
              set({ error: error.message }, undefined, 'authCore/oauth/error');
              return { error: error.message };
            }
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'authCore/oauth/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'authCore/oauth/complete');
          }
        },
      })),
      {
        name: 'auth-core-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          user: state.user
            ? {
                id: state.user.id,
                email: state.user.email,
                name: state.user.name,
                avatar: state.user.avatar,
              }
            : null,
          isAuthenticated: state.isAuthenticated,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
          }
        },
      },
    ),
    { name: 'AuthCoreStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectAuthCoreUser = (state: AuthCoreStore) => state.user;
export const selectAuthCoreIsAuthenticated = (state: AuthCoreStore) => state.isAuthenticated;
export const selectAuthCoreIsLoading = (state: AuthCoreStore) => state.isLoading;
export const selectAuthCoreError = (state: AuthCoreStore) => state.error;
export const selectAuthCoreIsReady = (state: AuthCoreStore) =>
  state._hasHydrated && state.sessionValidated;
export const selectAuthCoreIsHydrated = (state: AuthCoreStore) => state._hasHydrated;

// =============================================================================
// Helpers
// =============================================================================

export function waitForAuthCoreReady(): Promise<void> {
  return new Promise((resolve) => {
    const state = useAuthCoreStore.getState();
    if (state._hasHydrated && state.sessionValidated) {
      resolve();
      return;
    }
    const unsub = useAuthCoreStore.subscribe((s) => {
      if (s._hasHydrated && s.sessionValidated) {
        unsub();
        resolve();
      }
    });
  });
}

export function initializeAuthCoreStore(): () => void {
  return supabaseAuth.onAuthStateChange((authState) => {
    const store = useAuthCoreStore.getState();
    if (authState.user) {
      store.setUser({
        id: authState.user.id,
        email: authState.user.email || '',
        name:
          authState.profile?.display_name ||
          (authState.user.user_metadata?.['full_name'] as string),
        avatar:
          authState.profile?.avatar_url || (authState.user.user_metadata?.['avatar_url'] as string),
      });
    } else if (!authState.isLoading) {
      store.clearAuth();
    }
  });
}
