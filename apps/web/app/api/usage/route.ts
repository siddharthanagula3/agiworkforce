import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { isAuthGateRefusal } from '@/lib/api-auth-response';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';

async function handler(request: NextRequest) {
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { apiKeyScope: 'usage:read' });
  } catch (error) {
    if (isApiKeyScopeError(error) || isAuthGateRefusal(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    const body: ManagedUsageSummaryResponse = await getManagedUsageSummary(
      scoped.db,
      scoped.userId,
    );
    return NextResponse.json(body);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to fetch usage data');
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
