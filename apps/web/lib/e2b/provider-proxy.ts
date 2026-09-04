import 'server-only';

export const PROVIDER_PROXY_PATH_SEGMENT = 'provider-proxy';

/**
 * The HTTP header each provider's SDK sends its API key in. Anthropic's SDK
 * authenticates with `x-api-key`; a provider added here without this header
 * name being verified against its SDK/docs must not be marked proxy-covered
 * in templates.ts.
 */
const PROVIDER_PROXY_AUTH_HEADER: Readonly<Record<string, string>> = {
  anthropic: 'x-api-key',
};

/**
 * The base URL a provider's SDK talks to when no override is configured.
 * https://api.anthropic.com is Anthropic's own default (also in
 * ALLOWED_MANAGED_PROVIDER_HOSTS), used when ANTHROPIC_BASE_URL is unset for
 * the server's own managed credential.
 */
const PROVIDER_PROXY_DEFAULT_BASE_URL: Readonly<Record<string, string>> = {
  anthropic: 'https://api.anthropic.com',
};

export function providerProxyAuthHeader(providerId: string): string | undefined {
  return PROVIDER_PROXY_AUTH_HEADER[providerId];
}

export function providerProxyDefaultBaseUrl(providerId: string): string | undefined {
  return PROVIDER_PROXY_DEFAULT_BASE_URL[providerId];
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
