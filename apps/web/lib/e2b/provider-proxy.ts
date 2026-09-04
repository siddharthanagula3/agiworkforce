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

export function providerProxyDefaultBaseUrl(providerId: string): string | undefined {
  if (!providerProxyAuthHeader(providerId) || !isManagedProviderId(providerId)) return undefined;
  return resolveProviderApiRoot(providerId);
}

export function resolveAppOrigin(): string | null {
  const configured = process.env['NEXT_PUBLIC_APP_URL']?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
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
