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
    headers: getCorsHeaders(request),
  });
}

export function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
