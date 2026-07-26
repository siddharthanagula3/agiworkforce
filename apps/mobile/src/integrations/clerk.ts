/**
 * Clerk client configuration for AGI Mobile (cloud auth).
 *
 * Clerk publishable keys are public client identifiers, but production and
 * preview builds must still use the live Clerk instance. Expo inlines
 * EXPO_PUBLIC_* values into the application bundle at build time.
 */
import { getClerkInstance } from '@clerk/expo';

const DEVELOPMENT_CLERK_PUBLISHABLE_KEY =
  'pk_test_aGFuZHktamF3ZmlzaC03My5jbGVyay5hY2NvdW50cy5kZXYk';
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const configuredPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

if (
  (appEnv === 'production' || appEnv === 'preview') &&
  !configuredPublishableKey?.startsWith('pk_live_')
) {
  throw new Error(
    `[clerk] ${appEnv} builds require EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk publishable key.`,
  );
}

export const CLERK_PUBLISHABLE_KEY = configuredPublishableKey || DEVELOPMENT_CLERK_PUBLISHABLE_KEY;

/**
 * Clerk's native Expo components can create a pending session while an
 * additional verification step is in progress. Auth-state consumers must not
 * collapse that state into "signed out", or the app can revoke Cloud access
 * and redirect in the middle of sign-in. Keep this shared so every mobile
 * auth boundary follows Clerk's native-components contract.
 */
export const CLERK_NATIVE_AUTH_OPTIONS = {
  treatPendingAsSignedOut: false,
} as const;

// ---------------------------------------------------------------------------
// Token bridge
//
// Clerk's native AuthView (clerk-ios SwiftUI) creates a NATIVE session whose
// token is only reliably reachable through the React `useAuth().getToken()`
// hook — the non-React `getClerkInstance().session` is null for native
// sign-ins. <ClerkTokenBridge> (rendered inside <ClerkProvider> in
// app/_layout.tsx) registers that hook's getToken here so non-React callers
// (services/authSession.ts → services/streaming.ts) can read the session JWT.
// ---------------------------------------------------------------------------

let tokenGetter: (() => Promise<string | null>) | null = null;
let userIdGetter: (() => string | null) | null = null;
/**
 * Force-refresh getter: calls `getToken({ skipCache: true })` so the 401-retry
 * path in api.ts gets a fresh JWT rather than the same cached token that just
 * failed. Registered by <ClerkTokenBridge> alongside the normal tokenGetter.
 */
let tokenRefreshGetter: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(
  getToken: (() => Promise<string | null>) | null,
  getUserId: (() => string | null) | null = null,
  getTokenFresh: (() => Promise<string | null>) | null = null,
): void {
  tokenGetter = getToken;
  userIdGetter = getUserId;
  tokenRefreshGetter = getTokenFresh;
}

/**
 * Resolve the current Clerk session JWT for non-React callers. Prefers the
 * React-bridged getter (native-session aware); falls back to the JS singleton.
 */
export async function getClerkToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter();
    } catch (err) {
      console.warn('[clerk] token bridge error:', err);
      return null;
    }
  }
  try {
    const clerk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
    return (await clerk.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Force a fresh Clerk session JWT, bypassing the in-memory cache.
 * Use this in the 401 retry path so the re-request carries a newly-issued
 * token rather than the same expired/revoked one that was just rejected.
 */
export async function getClerkTokenFresh(): Promise<string | null> {
  if (tokenRefreshGetter) {
    try {
      return await tokenRefreshGetter();
    } catch (err) {
      console.warn('[clerk] force-refresh token error:', err);
      return null;
    }
  }
  // Fallback: non-React Clerk singleton with skipCache (works for JS-layer sessions).
  try {
    const clerk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
    return (await clerk.session?.getToken({ skipCache: true })) ?? null;
  } catch {
    return null;
  }
}

/** The signed-in Clerk user id, or null. */
export function getClerkUserId(): string | null {
  if (userIdGetter) {
    try {
      return userIdGetter();
    } catch {
      return null;
    }
  }
  try {
    return getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).user?.id ?? null;
  } catch {
    return null;
  }
}
