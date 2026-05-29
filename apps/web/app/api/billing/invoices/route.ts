import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'];

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
  : null;

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

  if (!stripe) {
    logger.warn('[billing/invoices] Stripe not configured');
    return NextResponse.json({ invoices: [] });
  }

  const db = getNeonDb();

  type SubRow = Pick<SubscriptionRow, 'stripe_customer_id'>;
  const [sub] = await db
    .query<SubRow>(
      `select stripe_customer_id from public.subscriptions where user_id = $1 limit 1`,
      [userId],
    )
    .catch(() => [] as SubRow[]);

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] });
  }

  try {
    const stripeInvoices = await stripe.invoices.list({
      customer: sub.stripe_customer_id,
      limit: 24,
    });

    const invoices = stripeInvoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? '',
      status: inv.status ?? 'draft',
      amount: inv.amount_due,
      currency: inv.currency,
      description: inv.description ?? `Invoice ${inv.number ?? inv.id}`,
      created_at: new Date(inv.created * 1000).toISOString(),
      due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      paid_at: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
        : null,
      invoice_pdf: inv.invoice_pdf ?? null,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      line_items: inv.lines.data.map((line) => ({
        id: line.id,
        description: line.description ?? '',
        amount: line.amount,
        quantity: line.quantity ?? 1,
        period: {
          start: new Date(line.period.start * 1000).toISOString(),
          end: new Date(line.period.end * 1000).toISOString(),
        },
      })),
    }));

    return NextResponse.json({ invoices });
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
