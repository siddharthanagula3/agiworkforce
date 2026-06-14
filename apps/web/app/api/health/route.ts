import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { runHealthChecks } from '@/lib/server/health-check';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';

/**
 * GET /api/health
 *
 * Public health endpoint. The check logic lives in
 * lib/server/health-check.ts and is shared with the /status page (which
 * calls it directly rather than fetching this route · no self-HTTP).
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 30 requests per minute per IP to prevent enumeration
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
