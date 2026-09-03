import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';

async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    await getClerkAuthUser(request);
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  return NextResponse.json(
    {
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'Agent message logging is handled by the api-gateway agents router.',
      },
    },
    { status: 410 },
  );
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'chat-conversation'));
