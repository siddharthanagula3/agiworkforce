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

interface ProviderEndpointConvention {
  /**
   * Vendor default API root, written in the shape this module's joiner expects
   * (i.e. already excluding `versionSegment` when that is non-empty).
   */
  defaultRoot: string;
  /** Env var carrying the operator's override. */
  envKey: string;
  /**
   * Version path segment this module appends after the resolved root, or `''`
   * when the provider's `*_BASE_URL` convention already carries it. When
   * non-empty, a trailing `/<segment>` on an override is trimmed before the
   * segment is re-applied, so both spellings of the override resolve to the
   * same URL.
   */
  versionSegment: string;
}

/**
 * Per-provider endpoint convention.
 *
 * The two providers are NOT symmetric here, and the asymmetry is forced by the
 * SDKs the rest of this repo already feeds the SAME env vars to. Checked
 * against the installed packages, not from memory:
 *
 *   OPENAI_BASE_URL — carries `/v1`. Both consumers agree:
 *     - `openai@6.38.0` client.js:137 defaults `baseURL` to
 *       `https://api.openai.com/v1` and posts version-relative paths.
 *     - `@ai-sdk/openai@3.0.48` dist/index.js:6649 defaults to the same string.
 *     So the resolved root is used verbatim and `versionSegment` is `''`.
 *
 *   ANTHROPIC_BASE_URL — the two consumers DISAGREE, which is why this module
 *   must not just concatenate:
 *     - `@anthropic-ai/sdk@0.91.1` client.js:57 defaults `baseURL` to
 *       `https://api.anthropic.com` WITHOUT `/v1` and posts `/v1/messages`
 *       itself (resources/messages/messages.js:35). That is the SDK
 *       `packages/ai/providers/anthropic/src/index.ts:75` constructs, and
 *       `lib/services/provider-adapter-service.ts:182-201` hands it the
 *       validated `ANTHROPIC_BASE_URL` override unchanged.
 *     - `@ai-sdk/anthropic@3.0.64` dist/index.js:5094 defaults to
 *       `https://api.anthropic.com/v1` and appends `/messages`
 *       (dist/index.js:3277). That is what `lib/ai-sdk/providers.ts:106-112`
 *       feeds the SAME env var.
 *   No single string satisfies both by plain concatenation. This module is
 *   therefore version-AGNOSTIC about the Anthropic override: it trims a
 *   trailing `/v1` off the resolved root and re-applies `v1` itself, so
 *   `https://gw.example.com` and `https://gw.example.com/v1` both produce
 *   `https://gw.example.com/v1/messages`. An operator can pick whichever
 *   spelling their adapter path needs and these direct fetch sites still land
 *   on a real endpoint instead of 404ing on a missing or doubled `/v1`.
 */
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
};

/**
 * Strip trailing slashes, then (when the provider's paths are versioned by
 * this module) strip one trailing `/<versionSegment>` so the segment is not
 * doubled for operators who wrote the override in the `@ai-sdk/anthropic`
 * spelling. Only a TRAILING occurrence is removed — a gateway root such as
 * `https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic` keeps its interior
 * `/v1`, which is part of the gateway's own path, not the provider's version.
 */
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

/**
 * Resolve the API root for a managed provider: the validated `*_BASE_URL`
 * override when one is set and allowlisted, otherwise the vendor default.
 * Never throws — an unusable override degrades to the default.
 */
function resolveProviderApiRoot(provider: ManagedProviderId): string {
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

/**
 * Build a full provider REST URL from a VERSION-RELATIVE path — i.e. the path
 * as the vendor documents it below the version segment (`audio/transcriptions`,
 * `messages`, `files/{id}/content`). Callers never write `v1/` themselves; this
 * function places the version segment wherever that provider's convention puts
 * it (inside the root for OpenAI, appended by this module for Anthropic).
 *
 *   providerApiUrl('openai', 'audio/transcriptions')
 *     -> https://api.openai.com/v1/audio/transcriptions
 *   providerApiUrl('anthropic', 'messages')
 *     -> https://api.anthropic.com/v1/messages
 *
 * Path segments interpolated by callers (container ids, file ids) must already
 * be encoded by the caller — this function does not encode them.
 */
export function providerApiUrl(provider: ManagedProviderId, path: string): string {
  const { versionSegment } = PROVIDER_ENDPOINTS[provider];
  const root = resolveProviderApiRoot(provider);
  const relative = path.replace(/^\/+/, '');
  return versionSegment ? `${root}/${versionSegment}/${relative}` : `${root}/${relative}`;
}
