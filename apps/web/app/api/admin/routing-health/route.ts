import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import {
  isKnownRoutingProvider,
  readProviderRouteHealth,
  readRoutingHealth,
} from '@/features/admin/services/routing-health-metrics';

const PROVIDER_PARAM = 'provider';
const NO_STORE = 'private, no-store';

/**
 * Read-only view of the breakers the router already acts on. It mutates
 * nothing: a breaker an operator can force closed from a console is a breaker
 * that stops being evidence of what the fleet is doing.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const provider = request.nextUrl.searchParams.get(PROVIDER_PARAM);
  if (provider !== null) {
    if (!isKnownRoutingProvider(provider)) {
      throw createError.badRequest('No live route is registered for that provider');
    }
    return NextResponse.json(
      { provider, routes: await readProviderRouteHealth(provider) },
      { headers: { 'Cache-Control': NO_STORE } },
    );
  }

  return NextResponse.json(await readRoutingHealth(), {
    headers: { 'Cache-Control': NO_STORE },
  });
}

export const GET = withErrorHandler(handleGet);
