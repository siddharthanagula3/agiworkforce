import { resolveAuthProviders, type AuthProviderId } from '@agiworkforce/client-runtime';

import { isElectronHost } from '../lib/runtimeEnvironment';
import {
  ClerkAuthError,
  createOauthSignIn,
  createSessionToken,
  reloadSignInWithNonce,
  type ClerkSignIn,
} from './clerkNativeAuth';

const SOCIAL_STRATEGY_PREFIX = 'oauth_';
const CONFIGURED_PROVIDERS_ENV_KEY = 'VITE_AGI_AUTH_PROVIDERS';

export function socialSignInStrategy(provider: AuthProviderId): string {
  return `${SOCIAL_STRATEGY_PREFIX}${provider}`;
}

export function configuredSocialProviders() {
  return resolveAuthProviders(import.meta.env[CONFIGURED_PROVIDERS_ENV_KEY] as string | undefined);
}

export const SSO_REDIRECT_URL = isElectronHost
  ? 'agiworkforce-cloud://sso-callback'
  : 'agiworkforce://sso-callback';

export interface SocialSignInHandle {
  signIn: ClerkSignIn;
  authorizationUrl: string;
}

async function openInSystemBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new ClerkAuthError('unexpected', 'Refusing to open an insecure provider sign-in URL.');
  }

  const { isTauri } = await import('../lib/runtimeEnvironment');
  if (isElectronHost) {
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

  const { open } = await import('@tauri-apps/plugin-shell');
  await open(url);
}

export async function beginSocialSignIn(strategy: string): Promise<SocialSignInHandle> {
  const { signIn, authorizationUrl } = await createOauthSignIn(strategy, SSO_REDIRECT_URL);
  await openInSystemBrowser(authorizationUrl);
  return { signIn, authorizationUrl };
}

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
