import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from '@/utils/env';
import { withRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/v1/providers/:providerId/catalog — proxy to api-gateway model catalog.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { providerId } = await params;
  const gatewayUrl = getEnv('API_GATEWAY_URL', 'http://localhost:3000').replace(/\/+$/, '');
  const authHeader = request.headers.get('authorization') ?? '';

  const res = await fetch(
    `${gatewayUrl}/api/v1/providers/${encodeURIComponent(providerId)}/catalog`,
    {
      method: 'GET',
      headers: {
        ...(authHeader ? { authorization: authHeader } : {}),
        'x-requested-with': 'agiworkforce-web',
      },
      cache: 'no-store',
    },
  );

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
