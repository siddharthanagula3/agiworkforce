import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { readBillingOwnerRow, resolveBillingCustomerId } from '@/lib/server/billing-owner-row';
import { readPaymentHistory } from '@/lib/server/payments/stripe-provider';

async function handleGetReceipts(request: NextRequest) {
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

  const stripe = getStripeClientOrNull();
  if (!stripe) return NextResponse.json({ receipts: [] });

  const row = await readBillingOwnerRow(scoped.db, scoped.userId);
  const customerId = await resolveBillingCustomerId(scoped.db, scoped.userId, row);
  if (!customerId) return NextResponse.json({ receipts: [] });

  try {
    const { receipts } = await readPaymentHistory(stripe, customerId);
    return NextResponse.json({ receipts });
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to read top-up receipts from Stripe');
    throw createError
      .serviceUnavailable('Your credit purchase receipts could not be loaded. Please try again.')
      .asUserSafe();
  }
}

export const GET = withErrorHandler(handleGetReceipts);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
