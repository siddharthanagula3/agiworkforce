import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { isAuthGateRefusal } from '@/lib/api-auth-response';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import {
  ManagedUsageRequestError,
  parseManagedUsageIdempotencyKey,
} from '@/lib/services/managed-usage-request-service';
import type { ManagedUsageTurnCost } from '@agiworkforce/types';
import { readManagedUsageTurnCost } from '@/lib/services/account-usage-history-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ requestId: string }> };

function parseRequestId(value: string): string {
  try {
    return parseManagedUsageIdempotencyKey(value);
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      throw createError.validation(
        'The request ID is the Idempotency-Key the request was sent with: 8 to 128 letters, digits, dots, underscores, colons or hyphens.',
      );
    }
    throw error;
  }
}

async function handler(request: NextRequest, context: RouteContext) {
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { apiKeyScope: 'usage:read' });
  } catch (error) {
    if (isApiKeyScopeError(error) || isAuthGateRefusal(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  const requestId = parseRequestId((await context.params).requestId);

  let turn: ManagedUsageTurnCost | null;
  try {
    turn = await readManagedUsageTurnCost(scoped.db, scoped.userId, requestId);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to read the settled cost of a turn');
    throw createError.internal('Failed to read the settled cost of this request');
  }
  if (!turn) {
    throw createError.notFound('No managed request with that ID exists on this account.');
  }
  return NextResponse.json(turn, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withCorsRoute(
  withErrorHandler(withRateLimitHandler(handler, 'credits-balance')),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
