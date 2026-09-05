import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  topUpLedgerCentsForUsd,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { getOptionalEnv } from '@shared/utils/env';
import { resolveCheckoutReturnOrigin } from '@/lib/server/checkout-return-origin';
import { buildCheckoutTaxParams } from '@/lib/billing/tax-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { evaluateActiveWorkspacePolicy } from '@/lib/services/organization-policy-gate';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { getStripeClient } from '@/lib/server/stripe-client';

const TopUpRequestSchema = z
  .object({
    amountUsd: z.number().int().min(MIN_TOP_UP_AMOUNT_USD).max(MAX_TOP_UP_AMOUNT_USD),
  })
  .strict();

async function resolveSubscriptionCurrency(subscriptionId: string): Promise<string> {
  try {
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    return subscription.currency.trim().toLowerCase();
  } catch (error) {
    logger.warn(
      { error, subscriptionId },
      'Top-up refused: could not read the subscription billing currency from Stripe',
    );
    throw createError.serviceUnavailable(
      'Your billing currency could not be verified. No charge was made; please retry.',
    );
  }
}

function checkoutIsEnabled(): boolean {
  const value = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
  return (
    value !== '0' &&
    value !== 'false' &&
    value !== 'off' &&
    Boolean(getOptionalEnv('STRIPE_SECRET_KEY'))
  );
}

async function handleTopUp(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  if (!checkoutIsEnabled()) {
    throw createError.serviceUnavailable('Top-up checkout is not available right now.');
  }

  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) return rateLimitResponse;

  const billingGate = await evaluateActiveWorkspacePolicy(
    getNeonDb(),
    userId,
    { resource: 'credit_topup' },
    request,
  );
  if (!billingGate.allowed) {
    throw createError.conflict(billingGate.reason);
  }

  const parsed = TopUpRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(
      `Choose a whole-dollar top-up from $${MIN_TOP_UP_AMOUNT_USD} to $${MAX_TOP_UP_AMOUNT_USD}.`,
    );
  }

  const amountUsd = parsed.data.amountUsd;
  const amountCents = topUpLedgerCentsForUsd(amountUsd);
  const topUpUnits = topUpUnitsForUsd(amountUsd);
  if (amountCents === null || topUpUnits === null) {
    throw createError.validation('Invalid top-up amount.');
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw createError.validation('Idempotency-Key must be 8-128 URL-safe characters.');
  }

  type BillingRow = Pick<
    SubscriptionRow,
    'plan_tier' | 'status' | 'stripe_customer_id' | 'stripe_subscription_id'
  >;
  const [storage] = await db.query<{ ready: boolean }>(
    `select (
       to_regprocedure('public.handle_top_up_refund(text,integer,text)') is not null
       and to_regclass('public.idx_credit_transactions_top_up_session_receipt') is not null
     ) as ready`,
  );
  if (storage?.ready !== true) {
    throw createError.serviceUnavailable(
      'Top-up balance storage is being prepared. No checkout was created; please try again later.',
    );
  }

  const [billing] = await db.query<BillingRow>(
    `select plan_tier, status, stripe_customer_id, stripe_subscription_id
     from subscriptions where user_id = $1 limit 1`,
    [userId],
  );

  if (
    !billing ||
    billing.plan_tier === 'free' ||
    !['active', 'trialing'].includes(billing.status) ||
    !isStripeCustomerId(billing.stripe_customer_id) ||
    !isStripeSubscriptionId(billing.stripe_subscription_id)
  ) {
    throw createError.validation(
      'Top-ups are available for active plans billed by AGI Workforce. Start or restore your plan first.',
    );
  }

  const subscriptionCurrency = await resolveSubscriptionCurrency(billing.stripe_subscription_id);
  if (subscriptionCurrency !== 'usd') {
    throw createError.validation(
      `Top-ups are billed in USD and your plan is billed in ${subscriptionCurrency.toUpperCase()}. ` +
        'No charge was made. Upgrade your plan for more included usage, or contact support.',
    );
  }

  const metadata = {
    type: 'credit_topup',
    user_id: userId,
    credit_amount_cents: String(amountCents),
    top_up_units: String(topUpUnits),
    conversion: 'usd_1_to_units_50_v1',
  };
  const appUrl = resolveCheckoutReturnOrigin(request);
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'auto',
      currency: 'usd',
      customer: billing.stripe_customer_id,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `AGI top-up, ${topUpUnits.toLocaleString('en-US')} units`,
              description: `${topUpUnits.toLocaleString('en-US')} managed-usage top-up units`,
            },
          },
        },
      ],
      success_url: `${appUrl}/settings/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?topup=cancelled`,
      metadata,
      payment_intent_data: { metadata },
      ...buildCheckoutTaxParams({ hasExistingCustomer: true }),
    },
    {
      idempotencyKey: `topup:${userId}:${amountUsd}:${idempotencyKey}`,
    },
  );

  if (!session.url) throw createError.internal('Failed to generate top-up checkout URL.');

  await recordAuditEvent({
    userId,
    eventType: 'checkout_started',
    request,
    detail: {
      resourceType: 'credit_topup',
      source: 'checkout',
      resourceName: `$${amountUsd}`,
      count: topUpUnits,
    },
  });

  return NextResponse.json({ url: session.url, amountUsd, topUpUnits });
}

export const POST = withCorsRoute(withErrorHandler(handleTopUp));

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
