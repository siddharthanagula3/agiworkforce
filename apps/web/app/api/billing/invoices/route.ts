import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { listUserBillingInvoices } from '@/lib/services/billing-invoice-service';

/**
 * GET /api/billing/invoices
 * List the current user's Stripe invoices.
 * Returns empty list if Stripe is not configured or user has no customer.
 */
async function handleGetInvoices(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  try {
    return NextResponse.json({ invoices: await listUserBillingInvoices(userId) });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch Stripe invoices');
    throw createError.internal('Failed to fetch invoices');
  }
}

export const GET = withErrorHandler(handleGetInvoices);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
