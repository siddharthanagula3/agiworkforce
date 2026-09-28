import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DAILY_TOP_UP_LIMIT_USD,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_CONVERSION,
  TOP_UP_UNITS_PER_USD,
  creditsFromMicrousd,
  formatCredits,
  isFreeBillingPlanTier,
  quoteTopUp,
} from '@agiworkforce/types';
import { getOptionalEnv } from '@shared/utils/env';
import { resolveCheckoutReturnOrigin } from '@/lib/server/checkout-return-origin';
import { buildCheckoutTaxParams } from '@/lib/billing/tax-policy';
import {
  withdrawalConsentMessage,
  withdrawalConsentMetadata,
} from '@/lib/billing/withdrawal-consent';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { IDEMPOTENCY_KEY_HEADER } from '@/lib/api-gateway-policy';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { evaluateActiveWorkspacePolicy } from '@/lib/services/organization-policy-gate';
import { isPolicyUnavailable } from '@/lib/services/organization-policy-evaluator';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { resolveBillingCustomerId, type BillingOwnerRow } from '@/lib/server/billing-owner-row';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { getStripeClient } from '@/lib/server/stripe-client';
import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';

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

async function resolveStoreBilledTopUpCustomer(
  db: UserScopedDb['db'],
  userId: string,
  billing: BillingOwnerRow,
): Promise<string> {
  const existing = await resolveBillingCustomerId(db, userId, billing);
  if (existing) return existing;
  try {
    const [profile] = await db.query<{ email: string | null }>(
      'select email from public.profiles where id = $1 limit 1',
      [userId],
    );
    const customer = await getStripeClient().customers.create(
      { ...(profile?.email ? { email: profile.email } : {}), metadata: { user_id: userId } },
      { idempotencyKey: `topup-customer:${userId}` },
    );
    await db.execute(
      'update public.profiles set stripe_customer_id = $1 where id = $2 and stripe_customer_id is null',
      [customer.id, userId],
    );
    return customer.id;
  } catch (error) {
    logger.error({ error, userId }, 'Top-up refused: could not prepare a payment customer');
    throw createError
      .serviceUnavailable(
        'Your payment details could not be prepared. No charge was made; please retry.',
      )
      .asUserSafe();
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
    throw createError
      .serviceUnavailable('Top-up checkout is not available right now.')
      .asUserSafe();
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
    throw isPolicyUnavailable(billingGate)
      ? createError.serviceUnavailable(billingGate.reason).asUserSafe()
      : createError.conflict(billingGate.reason);
  }

  const parsed = TopUpRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(
      `Choose a whole-dollar top-up from $${MIN_TOP_UP_AMOUNT_USD} to $${MAX_TOP_UP_AMOUNT_USD}.`,
    );
  }

  const amountUsd = parsed.data.amountUsd;
  const quote = quoteTopUp(amountUsd);
  if (!quote) {
    throw createError.validation('Invalid top-up amount.');
  }
  const topUpUnits = quote.credits;

  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '';

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

  const [billing] = await db.query<BillingOwnerRow>(
    `select plan_tier, status, stripe_customer_id, stripe_subscription_id,
            apple_original_transaction_id, google_purchase_token, current_period_end
     from subscriptions where user_id = $1 limit 1`,
    [userId],
  );

  const billingSource = resolveSubscriptionBillingSource(billing);
  if (
    !billing ||
    isFreeBillingPlanTier(billing.plan_tier) ||
    !['active', 'trialing'].includes(billing.status) ||
    !['stripe', 'apple', 'google'].includes(billingSource)
  ) {
    throw createError.validation(
      'Top-ups are available on active paid plans. Start or restore your plan first.',
    );
  }

  let customerId: string;
  if (billingSource === 'apple' || billingSource === 'google') {
    customerId = await resolveStoreBilledTopUpCustomer(db, userId, billing);
  } else {
    if (
      !isStripeCustomerId(billing.stripe_customer_id) ||
      !isStripeSubscriptionId(billing.stripe_subscription_id)
    ) {
      throw createError.validation(
        'Top-ups are available on active paid plans. Start or restore your plan first.',
      );
    }
    const subscriptionCurrency = await resolveSubscriptionCurrency(billing.stripe_subscription_id);
    if (subscriptionCurrency !== 'usd') {
      throw createError.validation(
        `Top-ups are billed in USD and your plan is billed in ${subscriptionCurrency.toUpperCase()}. ` +
          'No charge was made. Upgrade your plan for more included usage, or contact support.',
      );
    }
    customerId = billing.stripe_customer_id;
  }

  const [purchasedToday] = await db.query<{ purchased_microusd: string | number | null }>(
    `select coalesce(sum(amount_microusd), 0) as purchased_microusd
       from credit_transactions
      where user_id = $1
        and transaction_type = 'purchase'
        and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`,
    [userId],
  );
  const dailyCredits = DAILY_TOP_UP_LIMIT_USD * TOP_UP_UNITS_PER_USD;
  const purchasedTodayCredits = creditsFromMicrousd(
    Number(purchasedToday?.purchased_microusd ?? 0),
  );
  if (purchasedTodayCredits + topUpUnits > dailyCredits) {
    throw createError.validation(
      `You can add up to ${formatCredits(dailyCredits)} a day. Choose a smaller amount or try again tomorrow.`,
    );
  }

  const metadata = {
    type: 'credit_topup',
    user_id: userId,
    conversion: TOP_UP_CONVERSION,
    amount_usd: String(quote.amountUsd),
    price_cents: String(quote.priceCents),
    discount_percent: String(quote.discountPercent),
    credit_amount_cents: String(quote.budgetCents),
    top_up_units: String(topUpUnits),
    auto_reload: 'false',
    ...withdrawalConsentMetadata(),
  };
  const appUrl = resolveCheckoutReturnOrigin(request);
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'auto',
      currency: 'usd',
      customer: customerId,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: quote.priceCents,
            product_data: {
              name: `AGI top-up, ${formatCredits(topUpUnits)}`,
              description:
                quote.discountPercent > 0
                  ? `${formatCredits(topUpUnits)}, ${quote.discountPercent}% off`
                  : formatCredits(topUpUnits),
            },
          },
        },
      ],
      success_url: `${appUrl}/settings/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?topup=cancelled`,
      metadata,
      payment_intent_data: { metadata },
      consent_collection: { terms_of_service: 'required' },
      custom_text: { terms_of_service_acceptance: { message: withdrawalConsentMessage() } },
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

  return NextResponse.json({
    url: session.url,
    amountUsd,
    topUpUnits,
    priceCents: quote.priceCents,
    discountPercent: quote.discountPercent,
  });
}

export const POST = withCorsRoute(
  withErrorHandler(handleTopUp, {
    idempotencyKey: 'required',
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.top-up',
  }),
);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
