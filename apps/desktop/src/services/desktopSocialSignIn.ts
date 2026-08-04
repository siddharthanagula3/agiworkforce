/**
 * Social/SSO sign-in for AGI Desktop.
 *
 * This is the ONE place Desktop sign-in still leaves the app, and it is not a
 * design choice: Google, Microsoft, and Apple all prohibit their OAuth consent
 * screens inside embedded webviews and will refuse the request
 * (`disallowed_useragent`). So the provider hop runs in the user's real system
 * browser and returns through the `agiworkforce://sso-callback` deep link.
 *
 * The flow mirrors `@clerk/expo`'s `useSSO` exactly (verified against the
 * installed build, `dist/hooks/useSSO.js`):
 *
 *   1. Create a sign-in with `strategy=oauth_*` and our deep-link
 *      `redirect_url`.
 *   2. Open `first_factor_verification.external_verification_redirect_url` in
 *      the system browser.
 *   3. When the deep link comes back, read `rotating_token_nonce` from it and
 *      reload the sign-in with that nonce.
 *   4. Mint a session token for `created_session_id`.
 *
 * Known configuration dependency, stated rather than assumed: Clerk only
 * appends `rotating_token_nonce` when the redirect URL is registered as an
 * allowed redirect URL on the Clerk instance. If it is not, the callback
 * arrives without a nonce and `parseDeepLink` reports
 * `missing_rotating_token_nonce` so the user sees a real cause instead of a
 * hang.
 */

import { isElectronHost } from '../lib/runtimeEnvironment';
import {
  ClerkAuthError,
  createOauthSignIn,
  createSessionToken,
  reloadSignInWithNonce,
  type ClerkSignIn,
} from './clerkNativeAuth';

/** Providers offered on the sign-in screen, with their Clerk strategy names. */
export const SOCIAL_PROVIDERS = [
  { id: 'google', strategy: 'oauth_google', label: 'Google' },
  { id: 'microsoft', strategy: 'oauth_microsoft', label: 'Microsoft' },
  { id: 'apple', strategy: 'oauth_apple', label: 'Apple' },
] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]['id'];

// The Electron cloud shell registers its own scheme so it can be installed
// next to the Tauri shell; both callback URLs must be allowlisted as redirect
// URLs on the Clerk instance.
export const SSO_REDIRECT_URL = isElectronHost
  ? 'agiworkforce-cloud://sso-callback'
  : 'agiworkforce://sso-callback';

export interface SocialSignInHandle {
  signIn: ClerkSignIn;
  authorizationUrl: string;
}

/** Open a URL in the user's default browser. */
async function openInSystemBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new ClerkAuthError('unexpected', 'Refusing to open an insecure provider sign-in URL.');
  }

  const { isTauri } = await import('../lib/runtimeEnvironment');
  if (isElectronHost) {
    // Routed to shell.openExternal by the electron shim (a window.open here
    // would spawn an embedded BrowserWindow, which OAuth providers refuse).
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return;
  }
  if (!isTauri) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      throw new ClerkAuthError(
        'unexpected',
        'Your browser blocked the provider sign-in window. Allow pop-ups and try again.',
      );
    }
    return;
  }

  // The system browser, never a child webview: a Tauri WebviewWindow is an
  // embedded user agent and Google/Microsoft/Apple refuse OAuth in one.
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(url);
}

/**
 * Start a social sign-in: create the Clerk sign-in and hand the user to their
 * browser. Returns the in-flight sign-in so the caller can finish it when the
 * deep link arrives, or discard it when the user cancels.
 */
export async function beginSocialSignIn(strategy: string): Promise<SocialSignInHandle> {
  const { signIn, authorizationUrl } = await createOauthSignIn(strategy, SSO_REDIRECT_URL);
  await openInSystemBrowser(authorizationUrl);
  return { signIn, authorizationUrl };
}

/**
 * Finish a social sign-in from the deep-link callback.
 *
 * Returns the Clerk session JWT, which the caller exchanges for the durable
 * AGI Cloud credential through the same path native email sign-in uses.
 */
export async function completeSocialSignIn(
  signIn: ClerkSignIn,
  rotatingTokenNonce: string,
): Promise<string> {
  const reloaded = await reloadSignInWithNonce(signIn.id, rotatingTokenNonce);

  if (reloaded.status !== 'complete' || !reloaded.createdSessionId) {
    if (reloaded.status === 'needs_second_factor') {
      throw new ClerkAuthError(
        'mfa_required',
        'This account requires a second factor. Sign in with your email and password to enter your code.',
      );
    }
    if (reloaded.firstFactorVerificationStatus === 'transferable') {
      // The provider identity has no AGI account yet. Signing up is a
      // different ceremony with its own consent; do not silently create one.
      throw new ClerkAuthError(
        'identifier_not_found',
        'No AGI account is linked to that provider account yet. Create an AGI account first, then link the provider.',
      );
    }
    throw new ClerkAuthError(
      'unexpected',
      'The provider sign-in did not complete. Try again, or use email sign-in.',
    );
  }

  return createSessionToken(reloaded.createdSessionId);
}
