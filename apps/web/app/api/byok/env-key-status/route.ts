import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { getClerkAuthUser } from '@/lib/api-auth';

/**
 * GET /api/byok/env-key-status
 *
 * Returns which env-based BYOK keys are currently configured for an
 * authenticated settings page.
 *
 * Privacy guarantee: the response contains only { id, isSet }.
 * `isSet` is computed as Boolean(process.env[envVar]?.trim()).
 * No env var name, value, partial value, length, or hash is returned.
 *
 * Must run on Node.js runtime (edge runtime may not see all env vars).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  await getClerkAuthUser(request);

  const providers = BYOK_PROVIDERS.map(({ id, envVar }) => ({
    id,
    isSet: Boolean(process.env[envVar]?.trim()),
  }));

  return NextResponse.json({ providers });
}

export const GET = withErrorHandler(handleGet);
