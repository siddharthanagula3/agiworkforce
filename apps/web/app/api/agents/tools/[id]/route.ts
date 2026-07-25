import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';

/**
 * GET /api/agents/tools/[id]
 *
 * STB-20: RETIRED. Zero in-repo callers. The live /api/agents surface is the Express
 * api-gateway's own agents router (services/api-gateway); this Next.js subtree is
 * an abandoned parallel implementation that still authenticated and queried
 * private rows on every request.
 *
 * Retired in place rather than deleted, matching the convention already used by
 * /api/agents/session and /api/usage/deduct: any client still pointed here gets
 * an explicit ENDPOINT_RETIRED signal instead of a 404 that reads like a broken
 * deploy. The handler no longer authenticates against or reads private rows.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    await getClerkAuthUser(request);
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  return NextResponse.json(
    {
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'Agent tool registration is handled by the api-gateway agents router.',
      },
    },
    { status: 410 },
  );
}

export const GET = withErrorHandler(withRateLimitHandler(handler, 'me'));
