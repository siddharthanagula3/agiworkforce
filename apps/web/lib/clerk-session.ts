/**
 * Fast, synchronous signed-out detection for client-side bootstraps.
 *
 * Clerk sets the `__client_uat` cookie to a Unix-seconds timestamp: it is `0`
 * (or absent) when the visitor is signed out and `> 0` when a session exists.
 * This is the same indicator Clerk's own server middleware uses for cheap
 * signed-out detection, so it is safe to rely on before Clerk's JS finishes
 * loading.
 *
 * Use it to gate module-level/bootstrap `/api/me` (or other authenticated)
 * probes: firing them on a signed-out page load returns a guaranteed 401, which
 * the browser logs to the console on every route that runs the bootstrap. The
 * signed-out-quiet contract is enforced by e2e/public-auth-clean.spec.ts.
 *
 * A signed-in user always has `__client_uat > 0` by the time client JS runs, so
 * gating on this never suppresses a real session; any caller can still perform
 * the authenticated fetch explicitly after sign-in.
 */
export function hasClerkSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
  if (!match) return false;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0;
}

/**
 * Raw `__client_uat` cookie value, or `null` when the cookie is absent.
 *
 * PER-1: the auth bootstraps need to know not just "signed in?" but "signed in
 * as of WHICH session" — Clerk bumps this timestamp on sign-in, sign-out and
 * session switch. Comparing the raw value against the one a cached auth state
 * was resolved from is what lets the stores notice that the cookie landed (or
 * changed) AFTER module evaluation, instead of latching the bootstrap answer
 * for the rest of the SPA session.
 */
export function clerkSessionCookieValue(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
  return match?.[1] ?? null;
}

type ClerkSessionListener = () => void;

const clerkSessionListeners = new Set<ClerkSessionListener>();
let clerkSessionWatcherInstalled = false;
let lastObservedSessionCookie: string | null = null;

/** Poll interval for the cookie watcher. Cheap: one string read + one regex. */
const CLERK_SESSION_POLL_MS = 1500;

function notifyClerkSessionListeners(): void {
  for (const listener of clerkSessionListeners) {
    try {
      listener();
    } catch {
      // A single misbehaving subscriber must never stop the others.
    }
  }
}

function pollClerkSessionCookie(): void {
  const current = clerkSessionCookieValue();
  if (current === lastObservedSessionCookie) return;
  lastObservedSessionCookie = current;
  notifyClerkSessionListeners();
}

/**
 * Subscribe to Clerk session-cookie changes plus the browser events after
 * which a stale auth snapshot is most likely (tab refocus, restore from
 * bfcache, regained connectivity).
 *
 * Subscribers are also notified on those events even when the cookie value is
 * unchanged, so a bootstrap that failed transiently (network blip, upstream
 * timeout) gets a deterministic retry point rather than staying wrong for the
 * whole session. Subscribers must therefore be idempotent and cheap when
 * nothing has actually changed.
 *
 * Returns an unsubscribe function. Safe to call on the server (no-op).
 */
export function subscribeToClerkSessionChange(listener: ClerkSessionListener): () => void {
  if (typeof window === 'undefined') return () => undefined;

  clerkSessionListeners.add(listener);

  if (!clerkSessionWatcherInstalled) {
    clerkSessionWatcherInstalled = true;
    lastObservedSessionCookie = clerkSessionCookieValue();
    window.setInterval(pollClerkSessionCookie, CLERK_SESSION_POLL_MS);
    const revalidate = () => {
      pollClerkSessionCookie();
      notifyClerkSessionListeners();
    };
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    window.addEventListener('pageshow', revalidate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revalidate();
    });
  }

  return () => {
    clerkSessionListeners.delete(listener);
  };
}
