import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';

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
