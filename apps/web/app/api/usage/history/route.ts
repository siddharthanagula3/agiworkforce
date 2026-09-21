import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import {
  readAccountUsageHistory,
  type AccountUsageHistory,
} from '@/lib/services/account-usage-history-service';
import { resolveUsageWindow } from '@/lib/services/usage-aggregation';

export const runtime = 'nodejs';

export type AccountUsageHistoryResponse = AccountUsageHistory;

async function handler(request: NextRequest) {
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { apiKeyScope: 'usage:read' });
  } catch (error) {
    if (isApiKeyScopeError(error) || isMfaRequiredError(error) || isIpNotAllowedError(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  const params = new URL(request.url).searchParams;
  const window = resolveUsageWindow(params.get('from'), params.get('to'));

  try {
    const history: AccountUsageHistoryResponse = await readAccountUsageHistory(
      scoped.db,
      scoped.userId,
      window,
    );
    return NextResponse.json(history);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to fetch usage history');
    throw createError.internal('Failed to fetch usage history');
  }
}

export const GET = withCorsRoute(
  withErrorHandler(withRateLimitHandler(handler, 'credits-balance')),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
