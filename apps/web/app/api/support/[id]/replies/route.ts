import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';

/**
 * GET, POST /api/support/[id]/replies
 *
 * STB-20: RETIRED. Zero in-repo callers. Support tickets are submitted and read
 * through /api/support; the /support and /help pages are static marketing pages
 * that fetch nothing.
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
        message: 'Support ticket replies are not exposed over the API.',
      },
    },
    { status: 410 },
  );
}

export const GET = withErrorHandler(withRateLimitHandler(handler, 'me'));
export const POST = withErrorHandler(withRateLimitHandler(handler, 'me'));
