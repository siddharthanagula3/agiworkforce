export function hasClerkSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
  if (!match) return false;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0;
}

export function hasUsableClerkSessionToken(): boolean {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(/(?:^|;\s*)__session=([^;]*)/);
  const token = match?.[1];
  if (!token) return false;
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = (claims as { exp?: unknown })?.exp;
    if (typeof exp !== 'number') return true;
    return exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function clerkSessionCookieValue(): string | null {
  if (typeof document === 'undefined') return null;
  const uat = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/)?.[1] ?? '';
  const ready = hasUsableClerkSessionToken() ? '1' : '0';
  return uat || ready === '1' ? `${uat}.${ready}` : null;
}

type ClerkSessionListener = () => void;

const clerkSessionListeners = new Set<ClerkSessionListener>();
let clerkSessionWatcherInstalled = false;
let lastObservedSessionCookie: string | null = null;

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
