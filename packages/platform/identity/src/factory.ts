import { ClerkIdentityProvider, type ClerkIdentityConfig } from './adapters/clerk';
import {
  IDENTITY_PROVIDERS,
  IdentityConfigError,
  type IdentityProvider,
  type IdentityProviderName,
} from './types';

export const IDENTITY_PROVIDER_ENV = 'AGI_IDENTITY_PROVIDER';

export const DEFAULT_IDENTITY_PROVIDER: IdentityProviderName = 'clerk';

export interface ResolveIdentityProviderOptions {
  provider?: IdentityProviderName;
  clerk?: ClerkIdentityConfig;
}

function readConfiguredProvider(): IdentityProviderName | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const configured = process.env[IDENTITY_PROVIDER_ENV]?.trim().toLowerCase();
  if (!configured) return undefined;
  if ((IDENTITY_PROVIDERS as readonly string[]).includes(configured)) {
    return configured as IdentityProviderName;
  }
  throw new IdentityConfigError(
    `${IDENTITY_PROVIDER_ENV}="${configured}" is not one of: ${IDENTITY_PROVIDERS.join(', ')}`,
  );
}

export function selectIdentityProvider(
  options: ResolveIdentityProviderOptions = {},
): IdentityProviderName {
  return options.provider ?? readConfiguredProvider() ?? DEFAULT_IDENTITY_PROVIDER;
}

/**
 * The one place an identity provider is constructed. A second provider is a
 * second case here plus its adapter; every consumer already talks to the
 * interface, so no route, guard or page changes.
 */
export function resolveIdentityProvider(
  options: ResolveIdentityProviderOptions = {},
): IdentityProvider {
  const provider = selectIdentityProvider(options);
  switch (provider) {
    case 'clerk':
      return new ClerkIdentityProvider(options.clerk ?? {});
  }
}
