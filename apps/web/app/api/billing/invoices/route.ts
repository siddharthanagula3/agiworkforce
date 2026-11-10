import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { readUserBillingInvoicePage } from '@/lib/services/billing-invoice-service';

async function handleGetInvoices(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { resolveOrganization: false });
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    const { invoices, available, hasMore } = await readUserBillingInvoicePage(
      scoped.db,
      scoped.userId,
    );
    return NextResponse.json({ invoices, available, hasMore });
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to fetch Stripe invoices');
    throw createError.internal('Failed to fetch invoices');
  }
}

export const GET = withErrorHandler(handleGetInvoices);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
