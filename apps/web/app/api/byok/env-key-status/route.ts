import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';

/**
 * GET /api/byok/env-key-status
 *
 * Returns which env-based BYOK keys are currently configured.
 * NEVER returns the key value — only a boolean `isSet` per provider.
 *
 * Privacy guarantee: the response contains only { id, envVar, isSet }.
 * `isSet` is computed as Boolean(process.env[envVar]?.trim()).
 * No value, no partial value, no length, no hash is returned.
 *
 * Must run on Node.js runtime (edge runtime may not see all env vars).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const providers = BYOK_PROVIDERS.map(({ id, envVar }) => ({
    id,
    envVar,
    isSet: Boolean(process.env[envVar]?.trim()),
  }));

  return NextResponse.json({ providers });
}

export const GET = withErrorHandler(handleGet);
