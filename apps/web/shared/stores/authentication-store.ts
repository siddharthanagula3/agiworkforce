import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  authService,
  AuthUser,
  AuthResponse,
  LoginData,
  RegisterData,
} from '@shared/services/authentication-manager';
import { logger } from '@shared/lib/logger';
import { hasClerkSessionCookie } from '@/lib/clerk-session';

/**
 * Central cleanup function to reset all stores on logout
 * Prevents data leaks between user sessions
 */
async function cleanupAllStores(): Promise<void> {
  // Each store's cleanup is fully independent (own dynamic import + reset)
  // and runs via Promise.allSettled rather than Promise.all: this function's
  // whole purpose is preventing cross-user data leaks, so one store failing
  // to load (e.g. a stale chunk hash right after a deploy, or a transient
  // network blip) or failing to reset must not silently skip cleanup for the
  // other nine — a partial failure here is strictly better than an
  // all-or-nothing one. Previously a single rejected import aborted the
  // whole Promise.all, jumping straight to a catch-all that skipped every
  // remaining reset AND the localStorage cleanup below it.
  const tasks: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'workforce-store',
      run: async () => {
        const { useWorkforceStore, cleanupWorkforceSubscription } =
          await import('./workforce-store');
        useWorkforceStore.getState().reset();
        cleanupWorkforceSubscription();
      },
    },
    {
      name: 'mission-control-store',
      run: async () => {
        const { useMissionStore, stopMissionCleanupInterval } =
          await import('./mission-control-store');
        useMissionStore.getState().reset();
        stopMissionCleanupInterval();
      },
    },
    {
      name: 'notification-store',
      run: async () => {
        const { useNotificationStore } = await import('./notification-store');
        useNotificationStore.getState().clearAll();
      },
    },
    {
      name: 'chat-store',
      run: async () => {
        const { useChatStore } = await import('./chat-store');
        const chatState = useChatStore.getState();
        if (typeof chatState.clearHistory === 'function') {
          chatState.clearHistory();
        } else if (
          typeof (chatState as unknown as Record<string, unknown>)['reset'] === 'function'
        ) {
          (chatState as unknown as Record<string, unknown> & { reset: () => void }).reset();
        } else {
          logger.auth('Warning: Chat store has no clearHistory or reset method');
        }
      },
    },
    {
      name: 'artifact-store',
      run: async () => {
        const { useArtifactStore } = await import('./artifact-store');
        const artifactState = useArtifactStore.getState();
        if (typeof artifactState.reset === 'function') {
          artifactState.reset();
        } else {
          logger.auth('Warning: Artifact store has no reset method');
        }
      },
    },
    {
      name: 'layout-store',
      run: async () => {
        const { useUIStore } = await import('./layout-store');
        const layoutState = useUIStore.getState();
        if (typeof layoutState.reset === 'function') {
          layoutState.reset();
        } else {
          logger.auth('Warning: Layout store has no reset method');
        }
      },
    },
    {
      name: 'user-profile-store',
      run: async () => {
        const { useUserProfileStore } = await import('./user-profile-store');
        const profileState = useUserProfileStore.getState();
        if (typeof profileState.reset === 'function') {
          profileState.reset();
        } else {
          logger.auth('Warning: User profile store has no reset method');
        }
      },
    },
  ];

  // Each task's own name is baked into its rejection (rather than indexing
  // back into `tasks` by position afterward) so the failure is attributable
  // without relying on `results` and `tasks` staying index-aligned.
  const results = await Promise.allSettled(
    tasks.map((task) =>
      task.run().catch((error: unknown) => {
        logger.error(`Error cleaning up ${task.name} on logout:`, error);
        throw error;
      }),
    ),
  );
  const failedCount = results.filter((result) => result.status === 'rejected').length;

  // Clear persisted data from localStorage regardless of the per-store
  // results above — this is synchronous, best-effort, and independent of
  // any single store's in-memory reset succeeding.
  const keysToRemove = [
    'agi-chat-store',
    'agi-notification-store',
    'agi-multi-agent-chat-store',
    'agi-usage-warning-store',
    'agi-artifact-store',
    'agi-layout-store',
    'agi-settings-store',
    'agi-user-profile-store',
  ];
  keysToRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (_e) {
      // Ignore localStorage errors
    }
  });

  if (failedCount === 0) {
    logger.auth('All stores cleaned up on logout');
  } else {
    logger.auth(
      `Store cleanup on logout completed with ${failedCount} of ${tasks.length} store(s) failing; see preceding errors`,
    );
  }
}

/** Result type for auth operations */
export interface AuthResult {
  success: boolean;
  error: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  initialized: boolean;
  login: (loginData: LoginData) => Promise<{ success: boolean; error: string | null }>;
  register: (registerData: RegisterData) => Promise<{ success: boolean; error: string | null }>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  resetPassword: (email: string) => Promise<{ success: boolean; error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error: string | null }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error: string | null }>;
  updateProfile: (
    updates: Partial<AuthUser>,
  ) => Promise<{ success: boolean; error: string | null }>;
}

// SECURITY FIX: Only enable devtools in development, not production
const enableDevtools = process.env.NODE_ENV !== 'production';

// Module-level flag to prevent double-init race condition
let _initializingPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  devtools(
    immer((set, get) => ({
      user: null,
      isLoading: true,
      error: null,
      isAuthenticated: false,
      initialized: false,

      initialize: async () => {
        if (get().initialized) return;
        // Signed-out fast path: skip the guaranteed-401 /api/me probe (which the
        // browser logs to the console on every route that runs this bootstrap).
        // Clerk's __client_uat cookie is 0/absent when signed out. A signed-in
        // user always has it > 0 by the time client JS runs, so their init is
        // unchanged. Regression: e2e/public-auth-clean.spec.ts.
        if (!hasClerkSessionCookie()) {
          set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
          return;
        }
        // Prevent concurrent initializations (race condition guard)
        if (_initializingPromise) return _initializingPromise;

        _initializingPromise = (async () => {
          logger.auth('Initializing auth state...');
          set({ isLoading: true });

          try {
            const timeoutPromise = new Promise<AuthResponse>((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    user: null,
                    error: 'Auth initialization timeout',
                  }),
                5000,
              ),
            );

            const result = await Promise.race([authService.getCurrentUser(), timeoutPromise]);

            if (!result) {
              logger.debug('Initialization skipped: empty auth response');
              set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
              return;
            }

            const { user, error } = result;

            if (error) {
              logger.debug('No existing session:', error);
              // Clear any invalid auth data from localStorage
              try {
                localStorage.removeItem('__clerk_db_jwt');
                localStorage.removeItem('sb-lywdzvfibhzbljrgovwr-auth-token');
              } catch (_e) {
                logger.debug('Could not clear localStorage');
              }
              set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
            } else {
              logger.auth('Restored user session:', user?.email);
              set({ user, isAuthenticated: !!user, isLoading: false, initialized: true });
            }
          } catch (error) {
            logger.error('Initialization error:', error);
            // Clear any invalid auth data
            try {
              localStorage.removeItem('__clerk_db_jwt');
              localStorage.removeItem('sb-lywdzvfibhzbljrgovwr-auth-token');
            } catch (_e) {
              logger.debug('Could not clear localStorage');
            }
            set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
          }
        })().finally(() => {
          _initializingPromise = null;
        });
        return _initializingPromise;
      },

      login: async (loginData) => {
        set({ isLoading: true, error: null });
        try {
          const { user, error } = await authService.login(loginData);
          if (error) {
            set({
              error,
              isLoading: false,
              isAuthenticated: false,
              user: null,
            });
            return { success: false, error };
          }
          set({ user, isAuthenticated: !!user, isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false, isAuthenticated: false, user: null });
          return { success: false, error };
        }
      },

      register: async (registerData) => {
        set({ isLoading: true, error: null });
        try {
          const { user, error } = await authService.register(registerData);
          if (error) {
            set({
              error,
              isLoading: false,
              isAuthenticated: false,
              user: null,
            });
            return { success: false, error };
          }
          set({ user, isAuthenticated: !!user, isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false, isAuthenticated: false, user: null });
          return { success: false, error };
        }
      },

      logout: async () => {
        set({ isLoading: true });

        try {
          // Logout from auth service · proceed with cleanup even if this fails
          await authService.logout();
        } catch (err) {
          console.warn('[Auth] authService.logout() failed, proceeding with cleanup:', err);
        }

        // Clean up all stores to prevent data leaks between sessions
        await cleanupAllStores();

        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          initialized: false,
        });

        logger.auth('User logged out, all stores reset');
      },

      fetchUser: async () => {
        set({ isLoading: true });
        try {
          const { user, error } = await authService.getCurrentUser();
          if (error) {
            set({ user: null, isAuthenticated: false, isLoading: false });
          } else {
            set({ user, isAuthenticated: !!user, isLoading: false });
          }
        } catch (_error) {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateUser: (user: AuthUser) => {
        set({ user, isAuthenticated: !!user });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      reset: () => {
        set({
          user: null,
          isAuthenticated: false,
          error: null,
          isLoading: false,
          initialized: false,
        });
      },

      resetPassword: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const { error } = await authService.resetPassword(email);
          if (error) {
            set({ error, isLoading: false });
            return { success: false, error };
          }
          set({ isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false });
          return { success: false, error };
        }
      },

      updatePassword: async (newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
          const { error } = await authService.updatePassword(newPassword);
          if (error) {
            set({ error, isLoading: false });
            return { success: false, error };
          }
          set({ isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false });
          return { success: false, error };
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
          const { error } = await authService.changePassword(currentPassword, newPassword);
          if (error) {
            set({ error, isLoading: false });
            return { success: false, error };
          }
          set({ isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false });
          return { success: false, error };
        }
      },

      updateProfile: async (updates: Partial<AuthUser>) => {
        set({ isLoading: true, error: null });
        try {
          const { user, error } = await authService.updateProfile(updates);
          if (error) {
            set({ error, isLoading: false });
            return { success: false, error };
          }
          set({ user, isAuthenticated: !!user, isLoading: false });
          return { success: true, error: null };
        } catch (err: unknown) {
          // TYPESCRIPT FIX: Properly handle unknown error type
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false });
          return { success: false, error };
        }
      },
    })),
    { name: 'AuthStore', enabled: enableDevtools },
  ),
);

// Auto-initialize the store when imported
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
