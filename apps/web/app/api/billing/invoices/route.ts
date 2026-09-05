import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { listUserBillingInvoices } from '@/lib/services/billing-invoice-service';

async function handleGetInvoices(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { resolveOrganization: false });
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    return NextResponse.json({
      invoices: await listUserBillingInvoices(scoped.db, scoped.userId),
    });
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
