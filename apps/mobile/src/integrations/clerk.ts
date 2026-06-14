/**
 * Clerk client configuration for AGI Mobile (cloud auth).
 *
 * CLERK_PUBLISHABLE_KEY is the DEVELOPMENT publishable key (`pk_test_…`). Clerk
 * publishable keys are PUBLIC client keys — they are designed to ship in the
 * client bundle, so committing this value is safe. Before a production store
 * release, swap this for the `pk_live_…` key of a production Clerk instance
 * (the linked Clerk app currently has no production instance).
 */
import { getClerkInstance } from '@clerk/expo';

export const CLERK_PUBLISHABLE_KEY = 'pk_test_aGFuZHktamF3ZmlzaC03My5jbGVyay5hY2NvdW50cy5kZXYk';

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

export function setClerkTokenGetter(
  getToken: (() => Promise<string | null>) | null,
  getUserId: (() => string | null) | null = null,
): void {
  tokenGetter = getToken;
  userIdGetter = getUserId;
}

/**
 * Resolve the current Clerk session JWT for non-React callers. Prefers the
 * React-bridged getter (native-session aware); falls back to the JS singleton.
 */
export async function getClerkToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      // TEMP diagnostic (remove once cloud auth is confirmed):
      console.log('[clerk] bridged token:', token ? 'present' : 'null');
      return token;
    } catch (err) {
      console.warn('[clerk] token bridge error:', err);
      return null;
    }
  }
  try {
    const clerk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
    const token = (await clerk.session?.getToken()) ?? null;
    console.log('[clerk] singleton token:', token ? 'present' : 'null (no bridge yet)');
    return token;
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
