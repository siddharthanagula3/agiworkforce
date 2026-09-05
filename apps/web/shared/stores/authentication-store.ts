import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  authService,
  AuthUser,
  LoginData,
  RegisterData,
} from '@shared/services/authentication-manager';
import { logger } from '@shared/lib/logger';
import {
  clerkSessionCookieValue,
  hasClerkSessionCookie,
  subscribeToClerkSessionChange,
} from '@/lib/clerk-session';

interface ZustandStoreHandle {
  getState: () => unknown;
  persist?: {
    getOptions: () => { name?: string };
    clearStorage: () => void;
  };
}

function asZustandStore(value: unknown): ZustandStoreHandle | null {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['getState'] !== 'function') return null;
  return value as ZustandStoreHandle;
}

function hasPersistApi(handle: ZustandStoreHandle): boolean {
  const api = handle.persist;
  return (
    !!api &&
    typeof api === 'object' &&
    typeof api.getOptions === 'function' &&
    typeof api.clearStorage === 'function'
  );
}

function invokeStateMethod(state: unknown, method: string): boolean {
  if (!state || typeof state !== 'object') return false;
  const fn = (state as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  (fn as () => void)();
  return true;
}

const STORE_RESET_METHODS = ['resetOnLogout', 'reset', 'clearAll', 'clear'] as const;
const MODULE_TEARDOWN_METHODS = new Set(['stopMissionCleanupInterval']);

function resetStoreState(handle: ZustandStoreHandle): void {
  const state = handle.getState();
  for (const method of STORE_RESET_METHODS) {
    if (invokeStateMethod(state, method)) return;
  }
}

const USER_SCOPED_STORE_MODULES: ReadonlyArray<{ label: string; load: () => Promise<unknown> }> = [
  { label: 'mission-control-store', load: () => import('./mission-control-store') },
  { label: 'notification-store', load: () => import('./notification-store') },
  { label: 'artifact-store', load: () => import('./artifact-store') },
  { label: 'layout-store', load: () => import('./layout-store') },
  { label: 'user-profile-store', load: () => import('./user-profile-store') },
  { label: 'web-chat-store', load: () => import('./web-chat-store') },
  { label: 'web-settings-store', load: () => import('./web-settings-store') },
  { label: 'media-store', load: () => import('./media-store') },
  { label: 'model-store', load: () => import('./model-store') },
  { label: 'thinking-store', load: () => import('./thinking-store') },
  { label: 'tool-store', load: () => import('./tool-store') },
  { label: 'agent-metrics-store', load: () => import('./agent-metrics-store') },
  { label: 'company-hub-store', load: () => import('./company-hub-store') },
  { label: 'artifacts-store', load: () => import('@/features/chat/stores/artifacts-store') },
  { label: 'voice-input-store', load: () => import('@/features/chat/stores/voice-input-store') },
  { label: 'style-store', load: () => import('@/features/chat/stores/style-store') },
  {
    label: 'tool-permissions-store',
    load: () => import('@/features/connectors/stores/tool-permissions-store'),
  },
  { label: 'unified-chat-stores', load: () => import('@agiworkforce/unified-chat') },
];

const APP_STORAGE_KEY_PATTERNS: readonly RegExp[] = [
  /^agi[-_.]/i,
  /^agiworkforce[-_.]/i,
  /^chat-/i,
  /^tool-storage$/,
  /^agent-metrics-storage$/,
  /^__clerk_db_jwt$/,
  /^sb-[a-z0-9]+-auth-token$/i,
  /^auth_token$/,
  /^refresh_token$/,
];

function isAppOwnedStorageKey(key: string): boolean {
  return APP_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function purgeAppOwnedStorage(area: Storage | undefined): number {
  if (!area) return 0;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < area.length; i++) {
      const key = area.key(i);
      if (key && isAppOwnedStorageKey(key)) doomed.push(key);
    }
  } catch {
    return 0;
  }
  let removed = 0;
  for (const key of doomed) {
    try {
      area.removeItem(key);
      removed++;
    } catch {
      // Ignore per-key storage errors; keep purging the rest.
    }
  }
  return removed;
}

/**
 * Central cleanup on sign-out. Resets every user-scoped store's in-memory
 * state AND clears its persisted payload, then sweeps any remaining app-owned
 * storage keys. Exported so BOTH sign-out paths (`useAuthStore.logout()` and
 * `useBillingStore.signOut()`) run the exact same cleanup, the two used to
 * carry "keep this in sync" comments and had already drifted apart.
 *
 * Every step is independent and runs through `Promise.allSettled`: this
 * function's whole purpose is preventing cross-user data leaks, so one module
 * failing to load (a stale chunk hash right after a deploy, a transient
 * network blip) must never skip the rest. A partial failure is strictly better
 * than an all-or-nothing one.
 */
export async function cleanupAllStores(): Promise<void> {
  const results = await Promise.allSettled(
    USER_SCOPED_STORE_MODULES.map(async ({ label, load }) => {
      try {
        const mod = await load();
        if (!mod || typeof mod !== 'object') return;
        for (const exported of Object.values(mod as Record<string, unknown>)) {
          const handle = asZustandStore(exported);
          if (!handle) continue;
          resetStoreState(handle);
          if (hasPersistApi(handle)) handle.persist?.clearStorage();
        }
        for (const [exportName, exported] of Object.entries(mod as Record<string, unknown>)) {
          if (MODULE_TEARDOWN_METHODS.has(exportName) && typeof exported === 'function') {
            (exported as () => void)();
          }
        }
      } catch (error) {
        logger.error(`Error cleaning up ${label} on logout:`, error);
        throw error;
      }
    }),
  );
  const failedCount = results.filter((result) => result.status === 'rejected').length;

  if (typeof window !== 'undefined') {
    purgeAppOwnedStorage(window.localStorage);
    purgeAppOwnedStorage(window.sessionStorage);
  }

  if (failedCount === 0) {
    logger.auth('All stores cleaned up on logout');
  } else {
    logger.auth(
      `Store cleanup on logout completed with ${failedCount} of ${USER_SCOPED_STORE_MODULES.length} module(s) failing; see preceding errors`,
    );
  }
}

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
  resyncSession: () => Promise<void>;
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

const enableDevtools = process.env.NODE_ENV !== 'production';

let _initializingPromise: Promise<void> | null = null;

let _resolvedFromSessionToken: string | null = null;
let _sessionSettled = false;
let _lastResolveAttemptAt = 0;

const SESSION_RETRY_COOLDOWN_MS = 10_000;
const SESSION_RESOLVE_TIMEOUT_MS = 5000;

function clearSessionResolution(): void {
  _resolvedFromSessionToken = null;
  _sessionSettled = false;
  _lastResolveAttemptAt = 0;
}

function clearStaleAuthStorage(): void {
  try {
    localStorage.removeItem('__clerk_db_jwt');
    localStorage.removeItem('sb-lywdzvfibhzbljrgovwr-auth-token');
  } catch (_e) {
    logger.debug('Could not clear localStorage');
  }
}

interface SessionResolution {
  user: AuthUser | null;
  error: string | null;
  settled: boolean;
}

async function resolveSession(): Promise<SessionResolution> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<SessionResolution>((resolve) => {
    timer = setTimeout(
      () => resolve({ user: null, error: 'Auth initialization timeout', settled: false }),
      SESSION_RESOLVE_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([
      authService.getCurrentUser().then((result): SessionResolution => {
        if (!result) {
          return { user: null, error: 'Empty auth response', settled: false };
        }
        return { user: result.user, error: result.error, settled: !result.transient };
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    logger.error('Session resolution error:', error);
    return {
      user: null,
      error: error instanceof Error ? error.message : String(error),
      settled: false,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const useAuthStore = create<AuthState>()(
  devtools(
    immer((set, get) => ({
      user: null,
      isLoading: true,
      error: null,
      isAuthenticated: false,
      initialized: false,

      initialize: async () => {
        await get().resyncSession();
      },

      resyncSession: async () => {
        if (typeof window === 'undefined') return;

        const token = clerkSessionCookieValue();

        if (get().initialized && _sessionSettled && _resolvedFromSessionToken === token) return;

        if (
          !_sessionSettled &&
          _lastResolveAttemptAt !== 0 &&
          Date.now() - _lastResolveAttemptAt < SESSION_RETRY_COOLDOWN_MS
        ) {
          return;
        }

        if (_initializingPromise) return _initializingPromise;

        _lastResolveAttemptAt = Date.now();

        if (!hasClerkSessionCookie()) {
          _resolvedFromSessionToken = token;
          _sessionSettled = true;
          set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
          return;
        }

        _initializingPromise = (async () => {
          logger.auth('Resolving auth state...');
          set({ isLoading: true });

          const { user, error, settled } = await resolveSession();

          if (error) {
            logger.debug('No existing session:', error);
            if (settled) {
              clearStaleAuthStorage();
              set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
            } else {
              set((state) => ({ ...state, isLoading: false, initialized: true }));
            }
          } else {
            logger.auth('Restored user session:', user?.email);
            set({ user, isAuthenticated: !!user, isLoading: false, initialized: true });
          }

          _sessionSettled = settled;
          _resolvedFromSessionToken = settled ? token : null;
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
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false, isAuthenticated: false, user: null });
          return { success: false, error };
        }
      },

      logout: async () => {
        set({ isLoading: true });

        // Before the session goes: the push subscription is bound to this
        // browser, not to the tab, so leaving it registered keeps delivering the
        // signed-out account's notifications to whoever uses this machine next.
        // The DELETE needs the session cookie, so it has to run first.
        try {
          const { disableWebPush } = await import('@/features/notifications/lib/web-push-client');
          await disableWebPush();
        } catch (err) {
          console.warn('[Auth] Web Push revocation failed, proceeding with cleanup:', err);
        }

        try {
          const result = await authService.logout();
          if (result?.error) {
            console.warn('[Auth] Clerk sign-out failed, proceeding with cleanup:', result.error);
          }
        } catch (err) {
          console.warn('[Auth] authService.logout() failed, proceeding with cleanup:', err);
        }

        await cleanupAllStores();

        clearSessionResolution();

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
        const token = clerkSessionCookieValue();
        _lastResolveAttemptAt = Date.now();
        const { user, error, settled } = await resolveSession();
        if (error) {
          // A failed refetch (a rate limit, a dropped connection) is not proof
          // the session ended: only replace a previously resolved user with
          // null when this attempt actually settled one way or the other. The
          // sidebar account row reads this store, and clearing it on every
          // transient error was showing "User" over an account that was
          // signed in seconds earlier.
          set((state) => ({
            user: settled ? null : state.user,
            isAuthenticated: settled ? false : state.isAuthenticated,
            isLoading: false,
            initialized: true,
          }));
        } else {
          set({ user, isAuthenticated: !!user, isLoading: false, initialized: true });
        }
        _sessionSettled = settled;
        _resolvedFromSessionToken = settled ? token : null;
      },

      updateUser: (user: AuthUser) => {
        set({ user, isAuthenticated: !!user });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      reset: () => {
        clearSessionResolution();
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
          const error = err instanceof Error ? err.message : String(err);
          set({ error, isLoading: false });
          return { success: false, error };
        }
      },
    })),
    { name: 'AuthStore', enabled: enableDevtools },
  ),
);

if (typeof window !== 'undefined') {
  void useAuthStore.getState().initialize();
  subscribeToClerkSessionChange(() => {
    void useAuthStore.getState().resyncSession();
  });
}
