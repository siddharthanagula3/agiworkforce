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

async function handleGetPaymentMethods(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-payment-methods');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  if (!stripe) {
    logger.warn('[billing/payment-methods] Stripe not configured');
    return NextResponse.json({ payment_methods: [] });
  }

  const db = getNeonDb();

  type SubRow = Pick<SubscriptionRow, 'stripe_customer_id' | 'stripe_subscription_id'>;
  const [sub] = await db
    .query<SubRow>(
      `select stripe_customer_id, stripe_subscription_id
         from public.subscriptions where user_id = $1 limit 1`,
      [userId],
    )
    .catch(() => [] as SubRow[]);

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ payment_methods: [] });
  }

  try {
    const customer = await stripe.customers.retrieve(sub.stripe_customer_id);
    if (customer.deleted) {
      return NextResponse.json({ payment_methods: [] });
    }

    const customerDefaultPmId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : ((customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null)?.id ??
          null);

    // A subscription may carry its own default, and that is the one Stripe
    // actually charges for it. Marking the customer default here would name a
    // card the renewal will not touch.
    const defaultPmId =
      (sub.stripe_subscription_id
        ? await stripe.subscriptions
            .retrieve(sub.stripe_subscription_id)
            .then((subscription) =>
              typeof subscription.default_payment_method === 'string'
                ? subscription.default_payment_method
                : (subscription.default_payment_method?.id ?? null),
            )
            .catch(() => null)
        : null) ?? customerDefaultPmId;

    // Every type, not just cards. Checkout with Link stores a `link` method, and
    // filtering to cards reported "no payment method on file" to users who had
    // just paid with one.
    const stripePaymentMethods = await stripe.paymentMethods.list({
      customer: sub.stripe_customer_id,
    });

    const payment_methods = stripePaymentMethods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      is_default: pm.id === defaultPmId,
      card: pm.card
        ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
          }
        : undefined,
      billing_details: {
        name: pm.billing_details.name ?? null,
        email: pm.billing_details.email ?? null,
        address: {
          city: pm.billing_details.address?.city ?? null,
          country: pm.billing_details.address?.country ?? null,
          line1: pm.billing_details.address?.line1 ?? null,
          line2: pm.billing_details.address?.line2 ?? null,
          postal_code: pm.billing_details.address?.postal_code ?? null,
          state: pm.billing_details.address?.state ?? null,
        },
      },
      created_at: new Date(pm.created * 1000).toISOString(),
    }));

    return NextResponse.json({ payment_methods });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch Stripe payment methods');
    throw createError.internal('Failed to fetch payment methods');
  }
}

export const GET = withErrorHandler(handleGetPaymentMethods);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
