import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

function getAllowedOrigins(): string[] {
  const envOrigins = process.env['ALLOWED_ORIGINS'];
  const origins: string[] = [];

  if (process.env.NODE_ENV === 'development') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    );
  }

  if (envOrigins) {
    const customOrigins = envOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    origins.push(...customOrigins);
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'];
  if (appUrl && !origins.includes(appUrl)) {
    origins.push(appUrl);
  }

  return origins;
}

/**
 * Check if the origin is allowed
 *
 * @param origin - The origin header value
 * @param requireOrigin - If true, reject requests without Origin header (AUDIT-008-012)
 */
export function isOriginAllowed(origin: string | null, requireOrigin = false): boolean {
  if (!origin) {
    if (requireOrigin) {
      return false;
    }
    return true;
  }

  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const tauriOriginPattern = /^(?:https:\/\/tauri\.localhost|tauri:\/\/localhost)(?::\d+)?$/;
  if (tauriOriginPattern.test(origin)) {
    return true;
  }

  if (origin === 'agi://cloud') {
    return true;
  }

  if (process.env.NODE_ENV === 'development') {
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (localhostPattern.test(origin)) {
      return true;
    }
  }

  return false;
}

export function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Request-ID, x-csrf-token, X-Requested-With, Idempotency-Key, X-AGI-Surface, X-AGI-Organization-Id, X-Client',
    'Access-Control-Expose-Headers':
      'X-AGI-Agent-Run-Id, X-AGI-Agent-Run-URL, X-AGI-Tool-Loop, X-AGI-Research-Loop, X-Quota-Warning, X-AGI-Resolved-Model, X-AGI-Fallback-Reason, X-AGI-Moved-From-Model, X-AGI-Moved-Reason, X-AGI-Route-Lane',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  if (isOriginAllowed(origin)) {
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    // When origin is null (same-origin request), don't set CORS headers - they're not needed
  } else {
    logger.warn({ origin }, 'Blocked request from disallowed origin');
    // Don't set Access-Control-Allow-Origin for disallowed origins
  }

  return headers;
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
  };
}

/**
 * Handle CORS preflight request
 *
 * @param request - The incoming request
 * @param requireOrigin - If true, reject requests without Origin header (AUDIT-008-012)
 */
export function handleCorsPreflightRequest(
  request: NextRequest,
  requireOrigin = false,
): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('origin');

  if (!isOriginAllowed(origin, requireOrigin)) {
    logger.warn({ origin }, 'CORS preflight blocked from disallowed origin');
    return new NextResponse(null, {
      status: 403,
      headers: getSecurityHeaders(),
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

// Add a field to Vary without dropping the ones already there. Overwriting
// would silently disable another route's cache key -- /api/pricing/localized
// varies on X-Vercel-IP-Country, and losing that serves one country's prices to
// every country.
export function appendVary(response: Response, field: string): void {
  const existing = response.headers.get('Vary');
  if (!existing) {
    response.headers.set('Vary', field);
    return;
  }
  if (existing.trim() === '*') return;
  const fields = existing
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (fields.some((entry) => entry.toLowerCase() === field.toLowerCase())) return;
  response.headers.set('Vary', [...fields, field].join(', '));
}

export function withCorsAndSecurityHeaders<TResponse extends Response>(
  response: TResponse,
  request: NextRequest,
): TResponse {
  const corsHeaders = getCorsHeaders(request);
  const securityHeaders = getSecurityHeaders();

  // The body Vercel puts on the wire depends on the request's Accept-Encoding,
  // and several API routes are Cache-Control: public. Without this a shared
  // cache downstream may hand a brotli body to a client that asked for
  // identity, which cannot decode it.
  appendVary(response, 'Accept-Encoding');

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }

  return response;
}

export function withCorsRoute<TArgs extends unknown[]>(
  handler: (request: NextRequest, ...args: TArgs) => Promise<Response>,
): (request: NextRequest, ...args: TArgs) => Promise<Response> {
  return async (request: NextRequest, ...args: TArgs): Promise<Response> =>
    withCorsAndSecurityHeaders(await handler(request, ...args), request);
}

export function jsonResponseWithCors(
  request: NextRequest,
  data: unknown,
  options?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  const response = NextResponse.json(data, {
    status: options?.status,
    headers: options?.headers,
  });

  return withCorsAndSecurityHeaders(response, request);
}

/**
 * AUDIT-008-012: Validate that a request has a valid Origin header
 * Use this for sensitive endpoints that should reject requests without Origin
 *
 * @returns NextResponse with 403 if origin is missing or invalid, null if valid
 */
export function requireValidOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');

  if (!origin) {
    logger.warn(
      { url: request.url, method: request.method },
      'Request rejected: missing Origin header on sensitive endpoint',
    );
    return new NextResponse(JSON.stringify({ error: 'Origin header required' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...getSecurityHeaders(),
      },
    });
  }

  if (!isOriginAllowed(origin, true)) {
    logger.warn(
      { origin, url: request.url },
      'Request rejected: invalid Origin on sensitive endpoint',
    );
    return new NextResponse(JSON.stringify({ error: 'Invalid origin' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...getSecurityHeaders(),
      },
    });
  }

  return null;
}
