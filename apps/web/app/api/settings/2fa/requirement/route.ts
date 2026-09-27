import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isBlockedByMfaPolicy } from '@/lib/mfa-policy-gate';
import { TWO_FACTOR_SCOPE } from '../lib/scope';

async function handleRequirement(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request, TWO_FACTOR_SCOPE);

  return NextResponse.json(
    { required: await isBlockedByMfaPolicy(userId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleRequirement);
