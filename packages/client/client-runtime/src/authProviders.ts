export const AUTH_PROVIDER_IDS = ['google', 'github', 'microsoft', 'apple'] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export interface AuthProvider {
  id: AuthProviderId;
  label: string;
}

const AUTH_PROVIDER_LABELS: Readonly<Record<AuthProviderId, string>> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

export const DEFAULT_AUTH_PROVIDER_IDS: readonly AuthProviderId[] = ['google', 'github'];

const PROVIDER_LIST_SEPARATOR = ',';

function isAuthProviderId(value: string): value is AuthProviderId {
  return (AUTH_PROVIDER_IDS as readonly string[]).includes(value);
}

export function parseAuthProviderIds(configured?: string | null): readonly AuthProviderId[] {
  const requested = new Set(
    (configured ?? '')
      .split(PROVIDER_LIST_SEPARATOR)
      .map((entry) => entry.trim().toLowerCase())
      .filter(isAuthProviderId),
  );
  const ordered = AUTH_PROVIDER_IDS.filter((id) => requested.has(id));
  return ordered.length > 0 ? ordered : DEFAULT_AUTH_PROVIDER_IDS;
}

export function resolveAuthProviders(configured?: string | null): readonly AuthProvider[] {
  return parseAuthProviderIds(configured).map((id) => ({ id, label: AUTH_PROVIDER_LABELS[id] }));
}
