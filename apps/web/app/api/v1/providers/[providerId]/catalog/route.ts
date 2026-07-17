import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from '@shared/utils/env';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/providers/:providerId/catalog · proxy to api-gateway model catalog.
 *
 * Security: API_GATEWAY_URL is validated against https scheme in production
 * (mirrors the guard in [providerId]/stream/route.ts lines 131-142).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { providerId } = await params;
  const gatewayUrl = getEnv('API_GATEWAY_URL', 'http://localhost:3000').replace(/\/+$/, '');

  // Validate gateway URL · production must use https, not localhost or plain http.
  if (process.env.NODE_ENV === 'production') {
    try {
      const parsed = new URL(gatewayUrl);
      if (parsed.protocol !== 'https:') {
        logger.error({ gatewayUrl }, 'API_GATEWAY_URL must use https in production');
        return NextResponse.json({ error: 'Gateway misconfigured' }, { status: 503 });
      }
    } catch {
      return NextResponse.json({ error: 'Gateway misconfigured' }, { status: 503 });
    }
  }

  const authHeader = request.headers.get('authorization') ?? '';

  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}/api/v1/providers/${encodeURIComponent(providerId)}/catalog`, {
      method: 'GET',
      headers: {
        ...(authHeader ? { authorization: authHeader } : {}),
        'x-requested-with': 'agiworkforce-web',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error({ err, providerId }, 'Provider catalog gateway request failed');
    return NextResponse.json({ error: 'Gateway unavailable' }, { status: 504 });
  }

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
