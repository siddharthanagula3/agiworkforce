import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { supabaseAuth } from '../services/supabaseAuth';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  // Tracks if Zustand persist has finished rehydrating from localStorage
  _hasHydrated: boolean;
  // Tracks if the session has been validated with Supabase (not just rehydrated from cache)
  sessionValidated: boolean;
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  setSessionValidated: (state: boolean) => void;
  // Check if auth state is ready to use (hydrated AND validated)
  isAuthReady: () => boolean;

  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'github' | 'google') => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        _hasHydrated: false,
        sessionValidated: false,

        setUser: (user: User | null) => {
          set({
            user,
            isAuthenticated: !!user,
            sessionValidated: true, // Session is validated when setUser is called from auth listener
            error: null,
          });
        },

        getCurrentUserId: () => {
          const state = get();
          return state.user?.id || '';
        },

        clearAuth: () => {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            sessionValidated: true, // Session validated as "no session"
          });
        },

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },

        setSessionValidated: (state: boolean) => {
          set({ sessionValidated: state });
        },

        isAuthReady: () => {
          const state = get();
          // Auth is ready when:
          // 1. Zustand has finished rehydrating from localStorage
          // 2. Session has been validated with Supabase
          return state._hasHydrated && state.sessionValidated;
        },

        signIn: async (email: string, password: string) => {
          set({ isLoading: true, error: null });

          try {
            const response = await supabaseAuth.signIn({ email, password });

            if (response.error) {
              set({ error: response.error.message });
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[AuthStore] Sign in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            return { error: message };
          } finally {
            set({ isLoading: false });
          }
        },

        signUp: async (email: string, password: string, name?: string) => {
          set({ isLoading: true, error: null });

          try {
            const response = await supabaseAuth.signUp({
              email,
              password,
              displayName: name,
            });

            if (response.error) {
              set({ error: response.error.message });
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[AuthStore] Sign up exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            return { error: message };
          } finally {
            set({ isLoading: false });
          }
        },

        signOut: async () => {
          set({ isLoading: true });
          try {
            await supabaseAuth.signOut();
          } catch (error) {
            console.error('[AuthStore] Sign out error:', error);
          } finally {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        },

        signInWithMagicLink: async (email: string) => {
          set({ isLoading: true, error: null });

          try {
            const { error } = await supabaseAuth.signInWithMagicLink(email);

            if (error) {
              set({ error: error.message });
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[AuthStore] Magic link sign in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            return { error: message };
          } finally {
            set({ isLoading: false });
          }
        },

        resetPassword: async (email: string) => {
          set({ isLoading: true, error: null });

          try {
            const { error } = await supabaseAuth.resetPassword(email);

            if (error) {
              set({ error: error.message });
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[AuthStore] Reset password exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            return { error: message };
          } finally {
            set({ isLoading: false });
          }
        },

        signInWithOAuth: async (provider: 'github' | 'google') => {
          set({ isLoading: true, error: null });

          try {
            const { error } = await supabaseAuth.signInWithOAuth(provider);

            if (error) {
              set({ error: error.message });
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error(`[AuthStore] OAuth sign in exception (${provider}):`, error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            return { error: message };
          } finally {
            set({ isLoading: false });
          }
        },
      })),
      {
        name: 'auth-storage',
        // Only persist user data, not validation state (which must be re-validated each session)
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          // Mark that hydration is complete
          if (state) {
            state.setHasHydrated(true);
            // Note: sessionValidated remains false until checkSession() completes
            console.log('[AuthStore] Rehydration complete, waiting for session validation...');
          }
        },
      },
    ),
    { name: 'AuthStore', enabled: import.meta.env.DEV },
  ),
);

export function initializeAuthStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange((authState) => {
    const store = useAuthStore.getState();

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
      // setUser already sets sessionValidated: true
    } else if (!authState.isLoading) {
      // No user and not loading = session validation complete (no valid session)
      store.clearAuth();
      // clearAuth already sets sessionValidated: true
    }
    // Note: When isLoading is true, we wait for the next callback
  });

  return unsubscribe;
}

/**
 * Selector to check if authentication state is ready to use.
 * Components should use this before trusting isAuthenticated.
 *
 * @example
 * const isReady = useAuthStore(selectIsAuthReady);
 * const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
 *
 * if (!isReady) return <LoadingSpinner />;
 * if (!isAuthenticated) return <LoginPage />;
 * return <App />;
 */
export const selectIsAuthReady = (state: AuthState): boolean =>
  state._hasHydrated && state.sessionValidated;

/**
 * Wait for auth state to be fully ready (hydrated + session validated).
 * Use this before accessing auth state in async initialization code.
 *
 * @example
 * await waitForAuthReady();
 * const state = useAuthStore.getState();
 * if (state.isAuthenticated) {
 *   // Safe to use auth data
 * }
 */
export function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    const state = useAuthStore.getState();
    if (state._hasHydrated && state.sessionValidated) {
      resolve();
      return;
    }
    const unsub = useAuthStore.subscribe((s) => {
      if (s._hasHydrated && s.sessionValidated) {
        unsub();
        resolve();
      }
    });
  });
}

if (typeof window !== 'undefined') {
  supabaseAuth.checkSession();
}
