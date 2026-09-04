import 'server-only';

import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import { getOptionalEnv } from '@shared/utils/env';
import { logger } from '@/lib/logger';

export type ManagedProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter';

interface ProviderEndpointConvention {
  defaultRoot: string;
  envKey: string;
  versionSegment: string;
}

const PROVIDER_ENDPOINTS: Record<ManagedProviderId, ProviderEndpointConvention> = {
  openai: {
    defaultRoot: 'https://api.openai.com/v1',
    envKey: 'OPENAI_BASE_URL',
    versionSegment: '',
  },
  anthropic: {
    defaultRoot: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_BASE_URL',
    versionSegment: 'v1',
  },
  google: {
    defaultRoot: 'https://generativelanguage.googleapis.com',
    envKey: 'GOOGLE_BASE_URL',
    versionSegment: 'v1beta',
  },
  openrouter: {
    defaultRoot: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_BASE_URL',
    versionSegment: '',
  },
};

export type GoogleVideoOutputHostDisposition = 'api' | 'redirect' | null;

export function googleVideoOutputHostDisposition(
  hostname: string,
  redirect = false,
): GoogleVideoOutputHostDisposition {
  const normalized = hostname.toLowerCase();
  const defaultHostname = new URL(PROVIDER_ENDPOINTS.google.defaultRoot).hostname;
  const configuredHostname = new URL(resolveProviderApiRoot('google')).hostname;
  if (normalized === defaultHostname || normalized === configuredHostname) return 'api';
  if (
    redirect &&
    (normalized === 'storage.googleapis.com' ||
      normalized.endsWith('.googleapis.com') ||
      normalized.endsWith('.googleusercontent.com'))
  ) {
    return 'redirect';
  }
  return null;
}

function normalizeRoot(url: string, versionSegment: string): string {
  let root = url.replace(/\/+$/, '');
  if (versionSegment) {
    const suffix = `/${versionSegment}`;
    if (root.toLowerCase().endsWith(suffix.toLowerCase())) {
      root = root.slice(0, root.length - suffix.length);
    }
  }
  return root;
}

export function resolveProviderApiRoot(provider: ManagedProviderId): string {
  const { defaultRoot, envKey, versionSegment } = PROVIDER_ENDPOINTS[provider];
  const candidate = getOptionalEnv(envKey);
  if (!candidate) return defaultRoot;

  const validated = validateBaseUrl(candidate, {
    allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
  });
  if (validated.ok) {
    return normalizeRoot(validated.url, versionSegment);
  }

  logger.warn(
    { provider, envKey, reason: validated.reason, host: validated.hostname },
    'Refusing *_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
  );
  return defaultRoot;
}

export function isManagedProviderId(value: string): value is ManagedProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDER_ENDPOINTS, value);
}

export function providerApiUrl(provider: ManagedProviderId, path: string): string {
  const { versionSegment } = PROVIDER_ENDPOINTS[provider];
  const root = resolveProviderApiRoot(provider);
  const relative = path.replace(/^\/+/, '');
  return versionSegment ? `${root}/${versionSegment}/${relative}` : `${root}/${relative}`;
}
