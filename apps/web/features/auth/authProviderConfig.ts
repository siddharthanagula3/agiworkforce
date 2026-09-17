import {
  passkeySignInEnabled,
  resolveAuthProviders,
  type AuthProvider,
} from '@agiworkforce/client-runtime';

const PROVIDER_ENV_KEY = 'AGI_AUTH_PROVIDERS';

export function configuredAuthProviders(): readonly AuthProvider[] {
  return resolveAuthProviders(process.env[PROVIDER_ENV_KEY]);
}

export function configuredPasskeySignIn(): boolean {
  return passkeySignInEnabled(process.env[PROVIDER_ENV_KEY]);
}
