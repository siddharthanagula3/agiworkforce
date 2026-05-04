import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from '@/utils/env';

/**
 * GET /api/v1/providers — proxy to api-gateway provider availability list.
 *
 * Server-side proxy avoids cross-origin headaches from the client and lets us
 * inject the gateway auth token without exposing it to the browser.
 *
 * Sprint S8 (web app integration with the OpenClaw-port adapters).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const gatewayUrl = getEnv('API_GATEWAY_URL', 'http://localhost:3000').replace(/\/+$/, '');
  const authHeader = request.headers.get('authorization') ?? '';

  const res = await fetch(`${gatewayUrl}/api/v1/providers`, {
    method: 'GET',
    headers: {
      ...(authHeader ? { authorization: authHeader } : {}),
      'x-requested-with': 'agiworkforce-web',
    },
    cache: 'no-store',
  });

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
