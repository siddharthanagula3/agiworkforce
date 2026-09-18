import {
  passkeySignInEnabled,
  resolveAuthProviders,
  type AuthProvider,
} from '@agiworkforce/client-runtime';

const PROVIDER_ENV_KEY = 'AGI_AUTH_PROVIDERS';
const MFA_EMAIL_FALLBACK_ENV_KEY = 'AGI_AUTH_MFA_EMAIL_FALLBACK';
const ENABLED = '1';

export function configuredAuthProviders(): readonly AuthProvider[] {
  return resolveAuthProviders(process.env[PROVIDER_ENV_KEY]);
}

export function configuredPasskeySignIn(): boolean {
  return passkeySignInEnabled(process.env[PROVIDER_ENV_KEY]);
}

export function configuredMfaEmailFallback(): boolean {
  return process.env[MFA_EMAIL_FALLBACK_ENV_KEY] === ENABLED;
}
