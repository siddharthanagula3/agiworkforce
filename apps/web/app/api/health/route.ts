import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { runHealthChecks } from '@/lib/server/health-check';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const healthCheck = await runHealthChecks();

  const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(healthCheck, {
    status: statusCode,
    headers: {
      ...getCorsHeaders(request),
      // An external uptime monitor is the only detector that survives this
      // deployment being down; a 200 with no freshness directive is
      // heuristically cacheable, so a proxy could answer "healthy" for it
      // while the platform is unreachable.
      'Cache-Control': 'no-store',
    },
  });
}

export function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
