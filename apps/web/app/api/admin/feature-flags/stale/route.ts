import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { cleanUpStaleFlags } from '@/lib/feature-flags/flag-admin-service';
import { readFeatureFlagConfig } from '@/lib/feature-flags/flag-config';
import { listFlagDefinitions } from '@/lib/feature-flags/flag-store';
import { findStaleFlags } from '@/lib/feature-flags/stale-flags';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const config = readFeatureFlagConfig();
  return NextResponse.json(
    { stale: findStaleFlags(await listFlagDefinitions()), staleAfterDays: config.staleAfterDays },
    { headers: NO_STORE },
  );
}

/**
 * Archive the flags that have stopped deciding anything. A kill switch is never
 * archived by this: archiving one would put back whatever it is holding off.
 */
async function handleCleanUp(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const result = await cleanUpStaleFlags({ userId, request }, await listFlagDefinitions());
  return NextResponse.json(result, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCleanUp);
