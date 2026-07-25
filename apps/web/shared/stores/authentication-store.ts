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

// ---------------------------------------------------------------------------
// PER-11 / PER-12 — sign-out cleanup
// ---------------------------------------------------------------------------

/**
 * Minimal structural view of a zustand store created with the `persist`
 * middleware.
 *
 * PER-11: the previous implementation removed EIGHT hardcoded localStorage
 * keys, only two of which matched a real `persist({ name })`. Artifact bodies
 * (`agi-artifacts-store`), the web chat transcript (`agiworkforce-web-chat`,
 * `agi-web-chat`), remembered memory facts (`agi-memory-store-v1`), the model
 * picker, the company hub and the media job list all survived sign-out, so on
 * a shared browser the next user inherited them. Rather than re-typing a
 * longer hand-written list that can drift again, the key is read back out of
 * `persist.getOptions().name` — the very object the store persisted under.
 */
interface ZustandStoreHandle {
  getState: () => unknown;
  /** Present only when the store uses the `persist` middleware. */
  persist?: {
    getOptions: () => { name?: string };
    clearStorage: () => void;
  };
}

/** Runtime shape check — no cast to `any`, no dependency on each store's declared type. */
function asZustandStore(value: unknown): ZustandStoreHandle | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['getState'] !== 'function') return null;
  return value as ZustandStoreHandle;
}

/** True when this store persists to storage and can clear that payload itself. */
function hasPersistApi(handle: ZustandStoreHandle): boolean {
  const api = handle.persist;
  return (
    !!api &&
    typeof api === 'object' &&
    typeof api.getOptions === 'function' &&
    typeof api.clearStorage === 'function'
  );
}

/** Invoke `state[method]()` when it exists. Returns true when something ran. */
function invokeStateMethod(state: unknown, method: string): boolean {
  if (!state || typeof state !== 'object') return false;
  const fn = (state as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  (fn as () => void)();
  return true;
}

/**
 * Ordered "clear my state" verbs used across this codebase's stores; the first
 * one a store exposes wins. A store that exposes none is not left dirty: every
 * such store in `USER_SCOPED_STORE_MODULES` persists, so `clearStorage()` below
 * removes its durable payload and both sign-out paths navigate away afterwards.
 */
const STORE_RESET_METHODS = ['resetOnLogout', 'reset', 'clearAll', 'clear'] as const;

/** Reset a store's in-memory state through whichever clearing action it exposes. */
function resetStoreState(handle: ZustandStoreHandle): void {
  const state = handle.getState();
  for (const method of STORE_RESET_METHODS) {
    if (invokeStateMethod(state, method)) return;
  }
}

/**
 * Every module that owns user-scoped state which must not survive a sign-out.
 * The module is imported and ALL of its exports are scanned for zustand stores
 * (persisted or not) — so adding a new store to one of these modules is
 * covered automatically, and renaming a persist key cannot desynchronize the
 * cleanup list.
 */
const USER_SCOPED_STORE_MODULES: ReadonlyArray<{ label: string; load: () => Promise<unknown> }> = [
  { label: 'workforce-store', load: () => import('./workforce-store') },
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
  { label: 'plugin-store', load: () => import('@/features/plugins/stores/plugin-store') },
  {
    label: 'tool-permissions-store',
    load: () => import('@/features/connectors/stores/tool-permissions-store'),
  },
  { label: 'unified-chat-stores', load: () => import('@agiworkforce/unified-chat') },
];

/**
 * localStorage key namespaces this app owns. Backstop for persisted stores
 * whose zustand handle is module-private (e.g. the artifacts store's internal
 * `_persistStore`), so a key can never be orphaned just because the store that
 * wrote it is not exported. Anything matching is user-scoped by construction.
 */
const APP_STORAGE_KEY_PATTERNS: readonly RegExp[] = [
  /^agi[-_.]/i,
  /^agiworkforce[-_.]/i,
  /^chat-/i,
  /^tool-storage$/,
  /^agent-metrics-storage$/,
  /^__clerk_db_jwt$/,
  /^sb-[a-z0-9]+-auth-token$/i,
];

function isAppOwnedStorageKey(key: string): boolean {
  return APP_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** Remove every app-owned key from a Storage area. Best-effort and synchronous. */
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
 * `useBillingStore.signOut()`) run the exact same cleanup — the two used to
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
          // The persisted payload's key is read out of the store's own
          // `persist({ name })` config rather than re-typed here, which is the
          // whole point: the cleanup list cannot drift from reality.
          if (hasPersistApi(handle)) handle.persist?.clearStorage();
        }
        // Module-level teardown that is not part of any store's state.
        const moduleFns = mod as Record<string, unknown>;
        for (const fnName of ['cleanupWorkforceSubscription', 'stopMissionCleanupInterval']) {
          const fn = moduleFns[fnName];
          if (typeof fn === 'function') (fn as () => void)();
        }
      } catch (error) {
        logger.error(`Error cleaning up ${label} on logout:`, error);
        throw error;
      }
    }),
  );
  const failedCount = results.filter((result) => result.status === 'rejected').length;

  // Storage sweep runs regardless of the per-module results above.
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
  /**
   * PER-1: re-resolve the session when the Clerk cookie no longer matches the
   * one the current state was resolved from, or when the previous attempt
   * never settled. Cheap and idempotent when nothing has changed.
   */
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

// SECURITY FIX: Only enable devtools in development, not production
const enableDevtools = process.env.NODE_ENV !== 'production';

// Module-level flag to prevent double-init race condition
let _initializingPromise: Promise<void> | null = null;

// --- PER-1 -----------------------------------------------------------------
// `initialize()` ran once at module import, was guarded by `if (initialized)
// return`, and set `initialized: true` on EVERY exit path — including the
// signed-out fast path and the 5s timeout — while nothing ever called
// `fetchUser()` again. If the Clerk `__client_uat` cookie lagged module
// evaluation (exactly what happens on a post-sign-in client-side navigation)
// the store latched `user: null` for the whole SPA session and only a hard
// reload recovered.
//
// The fix keeps `initialized` meaning "the bootstrap has run" (consumers and
// tests rely on that), and adds the two things that were missing: WHAT the
// state was resolved from, and WHETHER that resolution actually settled.
/** Raw `__client_uat` value the current auth state was resolved from. */
let _resolvedFromSessionToken: string | null = null;
/** False after a timeout/exception — the answer is provisional, retry later. */
let _sessionSettled = false;
/** Start of the most recent resolution attempt, for the failure cooldown. */
let _lastResolveAttemptAt = 0;

/** Minimum gap between retries after an UNSETTLED attempt (ms). */
const SESSION_RETRY_COOLDOWN_MS = 10_000;
/** Upper bound on a single session resolution before it is treated as failed. */
const SESSION_RESOLVE_TIMEOUT_MS = 5000;

function clearSessionResolution(): void {
  _resolvedFromSessionToken = null;
  _sessionSettled = false;
  _lastResolveAttemptAt = 0;
}

/** Drop auth material a rejected/expired session may have left behind. */
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
  /** True when the server gave a definitive answer (including "not signed in"). */
  settled: boolean;
}

/**
 * Resolve the current session against `/api/me`, bounded by a timeout. A
 * timeout or a thrown error is reported as UNSETTLED so the caller knows the
 * `user: null` it is about to store is provisional, not an answer.
 */
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
        // An explicit error here (401 / expired session) IS a definitive
        // answer: the server has told us there is no session.
        return { user: result.user, error: result.error, settled: true };
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
        // PER-1: delegates to resyncSession, which short-circuits when the
        // current state was already resolved from exactly this Clerk cookie.
        // That preserves the original "run once" behavior while making a
        // LATER cookie change (post-sign-in client-side navigation) recover.
        await get().resyncSession();
      },

      resyncSession: async () => {
        if (typeof window === 'undefined') return;

        const token = clerkSessionCookieValue();

        // Settled against exactly this cookie value — nothing to do.
        if (get().initialized && _sessionSettled && _resolvedFromSessionToken === token) return;

        // Previous attempt never settled: retry, but not on every tick.
        if (
          !_sessionSettled &&
          _lastResolveAttemptAt !== 0 &&
          Date.now() - _lastResolveAttemptAt < SESSION_RETRY_COOLDOWN_MS
        ) {
          return;
        }

        // Prevent concurrent resolutions (race condition guard)
        if (_initializingPromise) return _initializingPromise;

        _lastResolveAttemptAt = Date.now();

        // Signed-out fast path: skip the guaranteed-401 /api/me probe (which the
        // browser logs to the console on every route that runs this bootstrap).
        // Clerk's __client_uat cookie is 0/absent when signed out.
        // Regression: e2e/public-auth-clean.spec.ts.
        //
        // Unlike before, this records WHAT it resolved from, so the cookie
        // appearing a moment later re-resolves instead of latching null.
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
            if (settled) clearStaleAuthStorage();
            set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
          } else {
            logger.auth('Restored user session:', user?.email);
            set({ user, isAuthenticated: !!user, isLoading: false, initialized: true });
          }

          // Only a settled answer may suppress future re-resolution. A timeout
          // or a network failure leaves `_sessionSettled === false`, so the
          // Clerk session watcher below retries at its next trigger — a cookie
          // change, tab focus, visibility change, bfcache restore or `online`
          // — subject to SESSION_RETRY_COOLDOWN_MS so repeated focus events
          // cannot become a request storm.
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

        // PER-1: forget which cookie the (now discarded) state was resolved
        // from, so the next sign-in on this page resolves from scratch.
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
        // PER-1/PER-8: an unconditional re-fetch of `/api/me`. Callers use it
        // after writing the profile so the greeting/header/sidebar update
        // without a reload. It records the resolution bookkeeping too, so a
        // successful fetch also settles any provisional bootstrap state.
        set({ isLoading: true });
        const token = clerkSessionCookieValue();
        _lastResolveAttemptAt = Date.now();
        const { user, error, settled } = await resolveSession();
        if (error) {
          set({ user: null, isAuthenticated: false, isLoading: false, initialized: true });
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
  void useAuthStore.getState().initialize();
  // PER-1: the bootstrap answer is no longer final. Re-resolve whenever the
  // Clerk session cookie changes (post-sign-in client-side navigation, sign-out
  // in another tab, session switch) or the tab regains focus/connectivity after
  // an unsettled attempt. Without this, a cookie that lands after module
  // evaluation left `user: null` until a hard reload — the reported bug.
  subscribeToClerkSessionChange(() => {
    void useAuthStore.getState().resyncSession();
  });
}
