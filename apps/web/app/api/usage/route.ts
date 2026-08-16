import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';

async function handler(request: NextRequest) {
  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request, { apiKeyScope: 'usage:read' });
    userId = authResult.userId;
  } catch (error) {
    if (isApiKeyScopeError(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    return NextResponse.json(await getManagedUsageSummary(userId));
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch usage data');
    throw createError.internal('Failed to fetch usage data');
  }
}

export const GET = withCorsRoute(
  withErrorHandler(withRateLimitHandler(handler, 'credits-balance')),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
