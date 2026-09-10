import 'server-only';

import { isManagedProviderId, resolveProviderApiRoot } from '@/lib/server/provider-endpoints';

export const PROVIDER_PROXY_PATH_SEGMENT = 'provider-proxy';

/**
 * The HTTP header each provider's SDK sends its API key in. Anthropic's SDK
 * authenticates with `x-api-key`; OpenAI's (and Codex's Responses-API client)
 * with `Authorization: Bearer <key>`. A provider added here without this
 * header name being verified against its SDK/docs must not be marked
 * proxy-covered in templates.ts.
 */
const PROVIDER_PROXY_AUTH_HEADER: Readonly<Record<string, string>> = {
  anthropic: 'x-api-key',
  openai: 'authorization',
};

export function providerProxyAuthHeader(providerId: string): string | undefined {
  return PROVIDER_PROXY_AUTH_HEADER[providerId];
}

/**
 * The upstream paths a harness actually calls, per provider.
 *
 * The proxy attaches the platform's own provider key, so whatever path it
 * forwards is called with that credential. Relaying any path the sandbox names
 * turned the proxy into a general-purpose credential for the whole provider
 * API, including endpoints that spend differently or that no usage parser can
 * meter. A path added here has to be one a harness needs.
 */
const PROVIDER_PROXY_ALLOWED_PATHS: Readonly<Record<string, readonly string[]>> = {
  anthropic: ['messages', 'messages/count_tokens', 'models'],
  openai: ['responses', 'chat/completions', 'embeddings', 'models'],
};

function normalizeProviderProxyPath(upstreamPath: string): string {
  // Whether the version segment is part of the path or already part of the
  // configured root differs by provider, and a deployment may override the
  // root, so it is accepted in either position.
  return upstreamPath.replace(/^v1\//, '');
}

export function isProviderProxyPathAllowed(providerId: string, upstreamPath: string): boolean {
  const allowed = PROVIDER_PROXY_ALLOWED_PATHS[providerId];
  if (!allowed) return false;
  return allowed.includes(normalizeProviderProxyPath(upstreamPath));
}

/**
 * Which allowlisted paths spend money, and in whose request shape.
 *
 * `models` and `messages/count_tokens` are deliberately absent: they carry no
 * provider charge, so metering them would reserve against the customer's
 * balance for a call that costs nothing.
 */
export type ProviderProxyMeteredEndpoint =
  | 'anthropic_messages'
  | 'openai_responses'
  | 'openai_chat_completions'
  | 'openai_embeddings';

const PROVIDER_PROXY_METERED_PATHS: Readonly<
  Record<string, Readonly<Record<string, ProviderProxyMeteredEndpoint>>>
> = {
  anthropic: { messages: 'anthropic_messages' },
  openai: {
    responses: 'openai_responses',
    'chat/completions': 'openai_chat_completions',
    embeddings: 'openai_embeddings',
  },
};

export function providerProxyMeteredEndpoint(
  providerId: string,
  upstreamPath: string,
): ProviderProxyMeteredEndpoint | null {
  return (
    PROVIDER_PROXY_METERED_PATHS[providerId]?.[normalizeProviderProxyPath(upstreamPath)] ?? null
  );
}

export function providerProxyDefaultBaseUrl(providerId: string): string | undefined {
  if (!providerProxyAuthHeader(providerId) || !isManagedProviderId(providerId)) return undefined;
  return resolveProviderApiRoot(providerId);
}

function parseOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function resolveAppOrigin(): string | null {
  return (
    parseOrigin(process.env['AGI_PROVIDER_PROXY_ORIGIN']) ??
    parseOrigin(process.env['NEXT_PUBLIC_APP_URL'])
  );
}

export function providerProxyBaseUrl(sessionId: string): string | null {
  const origin = resolveAppOrigin();
  if (!origin) return null;
  return `${origin}/api/code/sessions/${encodeURIComponent(sessionId)}/${PROVIDER_PROXY_PATH_SEGMENT}`;
}

export function providerProxyHost(): string | null {
  const origin = resolveAppOrigin();
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}
