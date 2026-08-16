import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getSecurityHeaders, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveDeploymentMediaModelAvailability } from '@/lib/services/media-model-availability-service';

export const runtime = 'nodejs';

async function handleGetAvailability(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const limited = await withRateLimit(request, 'model-catalog');
  if (limited) return limited;

  await getClerkAuthUser(request);

  return NextResponse.json(await resolveDeploymentMediaModelAvailability());
}

const getWithErrors = withErrorHandler(handleGetAvailability);

export const GET = withCorsRoute(async (request: NextRequest) => {
  const response = await getWithErrors(request);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
});

export function OPTIONS(request: NextRequest): NextResponse {
  const response =
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
