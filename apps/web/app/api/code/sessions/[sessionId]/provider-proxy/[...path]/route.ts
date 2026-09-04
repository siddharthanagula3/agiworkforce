import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_MANAGED_PROVIDER_HOSTS, validateBaseUrl } from '@agiworkforce/provider-runtime';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { providerProxyAuthHeader, providerProxyDefaultBaseUrl } from '@/lib/e2b/provider-proxy';
import { verifyProviderProxyToken } from '@/lib/e2b/provider-proxy-token';
import { MANAGED_CLOUD_E2B_TENANT_ID, getE2BSession } from '@/lib/e2b/session-store';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string; path: string[] }> };

const HOP_BY_HOP_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'connection',
  'content-length',
  'x-api-key',
  'authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-vercel-id',
  'x-vercel-deployment-url',
]);

function proxyError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { message, type: 'invalid_request_error', code } }, { status });
}

function bearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

async function handleProxy(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const { sessionId, path } = await context.params;

  const incomingToken =
    request.headers.get('x-api-key') ?? bearerToken(request.headers.get('authorization'));
  if (!incomingToken) {
    return proxyError(401, 'provider_proxy_token_missing', 'No session credential was presented.');
  }

  const verified = verifyProviderProxyToken(incomingToken);
  if (!verified || verified.sessionId !== sessionId) {
    return proxyError(
      401,
      'provider_proxy_token_invalid',
      'This session credential is invalid or has expired.',
    );
  }

  const limited = await withRateLimit(request, 'code-provider-proxy', `user:${verified.userId}`);
  if (limited) return limited;

  const session = await getE2BSession({
    tenantId: MANAGED_CLOUD_E2B_TENANT_ID,
    userId: verified.userId,
    resource: { kind: 'code_session', id: sessionId },
  });
  if (!session) {
    return proxyError(401, 'provider_proxy_session_ended', 'This Code session has ended.');
  }

  const providerId = verified.providerId;
  const authHeaderName = providerProxyAuthHeader(providerId);
  if (!authHeaderName) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider is not covered by the credential proxy.',
    );
  }

  let apiKey: string | undefined;
  let configuredBaseUrl: string | undefined;
  try {
    const adapter = buildServerProviderAdapter(providerId);
    apiKey = adapter.config.apiKey;
    configuredBaseUrl = adapter.config.baseUrl;
  } catch (err) {
    logger.error(
      { err, providerId, sessionId },
      '[e2b] provider-proxy has no managed key configured for this provider',
    );
  }
  if (!apiKey) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This coding agent has no managed credential configured.',
    );
  }

  const upstreamBase = configuredBaseUrl ?? providerProxyDefaultBaseUrl(providerId);
  if (!upstreamBase) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider has no configured endpoint.',
    );
  }
  const upstreamPath = path.map(encodeURIComponent).join('/');
  const upstreamCandidate = `${upstreamBase.replace(/\/+$/, '')}/${upstreamPath}${request.nextUrl.search}`;
  const validated = validateBaseUrl(upstreamCandidate, {
    allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
  });
  if (!validated.ok) {
    logger.error(
      { providerId, reason: validated.reason, sessionId },
      '[e2b] provider-proxy refused a non-allowlisted upstream host',
    );
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider endpoint is not allowlisted.',
    );
  }

  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) forwardHeaders.set(key, value);
  }
  forwardHeaders.set(authHeaderName, apiKey);

  const method = request.method.toUpperCase();
  const forwardsBody = method !== 'GET' && method !== 'HEAD';

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(validated.url, {
      method,
      headers: forwardHeaders,
      ...(forwardsBody ? { body: request.body, duplex: 'half' } : {}),
    } as RequestInit);
  } catch (err) {
    logger.error({ err, providerId, sessionId }, '[e2b] provider-proxy upstream request failed');
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'The upstream provider could not be reached.',
    );
  }

  logger.info(
    { sessionId, providerId, path: upstreamPath, status: upstreamResponse.status },
    '[e2b] provider-proxy forwarded a request',
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
