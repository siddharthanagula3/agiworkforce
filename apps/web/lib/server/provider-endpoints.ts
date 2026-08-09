import 'server-only';

import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import { getOptionalEnv } from '@shared/utils/env';
import { logger } from '@/lib/logger';

/**
 * Canonical managed-provider API roots for the web app's DIRECT `fetch()` call
 * sites — the endpoints that are not reached through a provider adapter.
 *
 * `lib/services/provider-adapter-service.ts` already resolves `*_BASE_URL`
 * overrides for every adapter-backed request. The routes that talk to a
 * provider's REST API themselves (audio transcription, image generation/edit,
 * the OpenAI container-file and Anthropic Files download paths, the GitHub PR
 * reviewer) bypassed that resolution and pinned `https://api.openai.com/v1` /
 * `https://api.anthropic.com/v1` inline, so an operator who pointed the
 * platform at a regional host, an on-prem proxy, or an AI gateway got chat
 * routed there while these routes kept calling the vendor directly.
 *
 * This module is the one place those roots are declared. It applies the SAME
 * override rules as the adapter service:
 *   - the override is read from the provider's `*_BASE_URL` env var,
 *   - it is validated against `ALLOWED_MANAGED_PROVIDER_HOSTS` (the canonical
 *     SSRF allowlist in `@agiworkforce/provider-runtime`),
 *   - a rejected override is logged and DROPPED in favour of the default; it
 *     never fails the request and never reaches `fetch()`.
 *
 * It does not do anything else: it is a URL builder, not an egress gate for
 * arbitrary user input. Caller-supplied URLs still belong in
 * `@/lib/egress-policy`.
 */

export type ManagedProviderId = 'openai' | 'anthropic';

/**
 * Vendor default API roots, including the version segment, matching the
 * convention `*_BASE_URL` already uses at the adapter boundary (the OpenAI and
 * Anthropic SDKs both expect `baseURL` to carry `/v1`).
 */
const DEFAULT_API_ROOT: Record<ManagedProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

const BASE_URL_ENV_KEY: Record<ManagedProviderId, string> = {
  openai: 'OPENAI_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
};

/**
 * Resolve the API root for a managed provider: the validated `*_BASE_URL`
 * override when one is set and allowlisted, otherwise the vendor default.
 * Never throws — an unusable override degrades to the default.
 */
function resolveProviderApiRoot(provider: ManagedProviderId): string {
  const fallback = DEFAULT_API_ROOT[provider];
  const envKey = BASE_URL_ENV_KEY[provider];
  const candidate = getOptionalEnv(envKey);
  if (!candidate) return fallback;

  const validated = validateBaseUrl(candidate, {
    allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
  });
  if (validated.ok) {
    return validated.url.replace(/\/+$/, '');
  }

  logger.warn(
    { provider, envKey, reason: validated.reason, host: validated.hostname },
    'Refusing *_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
  );
  return fallback;
}

/**
 * Build a full provider REST URL from a version-relative path.
 * `path` is joined onto the resolved API root: `providerApiUrl('openai',
 * 'audio/transcriptions')` -> `https://api.openai.com/v1/audio/transcriptions`.
 *
 * Path segments interpolated by callers (container ids, file ids) must already
 * be encoded by the caller — this function does not encode them.
 */
export function providerApiUrl(provider: ManagedProviderId, path: string): string {
  return `${resolveProviderApiRoot(provider)}/${path.replace(/^\/+/, '')}`;
}
