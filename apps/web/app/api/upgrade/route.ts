import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { requireEnv } from '@shared/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { UpgradeApplyRequestSchema, resolveCheckoutQuantity } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { getPriceSelectionForCurrency } from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import { resolveStripeSubscriptionForUpgrade } from '@/lib/server/stripe-upgrade-subscription';
import { verifyUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  assertSameCheckoutBillingInterval,
  classifyPlanChange,
  currentSeatsFromStripeItem,
  isUpgrade,
} from '@/lib/server/stripe-plan-change';
import { isPerSeatBillingPlan } from '@agiworkforce/types';

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
  }
  return stripeClient;
}

async function handleUpgrade(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'upgrade');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const parsed = UpgradeApplyRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw createError.validation(`Invalid request: ${msg}`);
  }
  const { plan: targetPlan, billingInterval, previewToken } = parsed.data;
  const requestedSeats = resolveCheckoutQuantity(parsed.data);

  const db = getNeonDb();
  const stripe = getStripe();

  // Fetch current subscription
  type SubRow = Pick<
    SubscriptionRow,
    'status' | 'plan_tier' | 'stripe_customer_id' | 'stripe_subscription_id'
  >;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      `select status, plan_tier, stripe_customer_id, stripe_subscription_id
       from subscriptions where user_id = $1 limit 1`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to load subscription for upgrade');
    throw createError.serviceUnavailable(
      'Billing details could not be verified. Your current plan is unchanged; please retry.',
    );
  }
  const sub = subRows[0] ?? null;

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    throw createError.validation(
      'No active subscription found. Use checkout to start a new subscription.',
    );
  }

  const currentTier = sub.plan_tier ?? 'free';
  // Mirrors app/api/upgrade/preview/route.ts: a same-tier request on a per-seat
  // plan is a seat change and is decided below, once Stripe has told us how many
  // seats the subscription currently bills.
  const sameTierSeatChange = currentTier === targetPlan && isPerSeatBillingPlan(targetPlan);
  if (!sameTierSeatChange && !isUpgrade(currentTier, targetPlan)) {
    throw createError.validation(
      `Cannot upgrade from ${currentTier} to ${targetPlan}. Use the billing portal to change or downgrade your plan.`,
    );
  }

  let stripeCustomerId = sub.stripe_customer_id;
  if (!isStripeCustomerId(stripeCustomerId)) {
    let profileRows: Array<Pick<SubscriptionRow, 'stripe_customer_id'>>;
    try {
      profileRows = await db.query<Pick<SubscriptionRow, 'stripe_customer_id'>>(
        'select stripe_customer_id from profiles where id = $1 limit 1',
        [userId],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load billing customer for upgrade');
      throw createError.serviceUnavailable(
        'Billing customer details could not be verified. Your current plan is unchanged; please retry.',
      );
    }
    stripeCustomerId = profileRows[0]?.stripe_customer_id ?? null;
  }

  let stripeSubId = sub.stripe_subscription_id;
  let stripeItem: Stripe.SubscriptionItem | null = null;
  let subscriptionCurrency = 'usd';
  try {
    const resolved = await resolveStripeSubscriptionForUpgrade(
      stripe,
      {
        planTier: currentTier,
        stripeCustomerId,
        stripeSubscriptionId: stripeSubId,
      },
      userId,
    );
    if (!resolved) {
      return NextResponse.json(
        {
          error: {
            message:
              'Your current plan has no paid Stripe subscription to credit. Starting a paid plan requires full-price checkout.',
            type: 'invalid_request_error',
            code: 'checkout_required',
          },
        },
        { status: 409 },
      );
    }
    const stripeSub = resolved.subscription;
    stripeSubId = stripeSub.id;
    if (resolved.recovered) {
      const recoveredCustomerId =
        typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
      const recoveredPriceId = stripeSub.items.data[0]?.price.id ?? null;
      await db.execute(
        `update subscriptions
         set stripe_subscription_id = $1, stripe_customer_id = $2, stripe_price_id = $3
         where user_id = $4`,
        [stripeSub.id, recoveredCustomerId, recoveredPriceId, userId],
      );
    }
    stripeItem = stripeSub.items.data[0] ?? null;
    subscriptionCurrency = stripeSub.currency;
  } catch (err) {
    logger.error({ err, stripeSubId }, 'Failed to resolve Stripe subscription for item ID');
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!stripeItem) throw createError.internal('Subscription has no items');

  try {
    assertSameCheckoutBillingInterval(stripeItem.price.recurring, billingInterval);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Billing cadence could not be verified';
    if (message.startsWith('Mid-cycle upgrades')) throw createError.validation(message);
    throw createError.internal(message);
  }

  const planChange = classifyPlanChange({
    currentTier,
    targetPlan,
    requestedSeats,
    currentSeats: currentSeatsFromStripeItem(stripeItem.quantity),
  });
  if (!planChange.allowed) {
    throw createError.validation(planChange.reason);
  }

  let prorationDate: number;
  try {
    prorationDate = verifyUpgradePreviewToken(
      previewToken,
      {
        userId,
        plan: targetPlan,
        billingInterval,
        stripeSubscriptionId: stripeSubId,
        // Binds the seat count the customer actually saw priced. A token issued
        // for N seats cannot be replayed to apply a different N.
        seats: requestedSeats,
      },
      requireEnv('STRIPE_SECRET_KEY'),
    ).prorationDate;
  } catch {
    throw createError.validation(
      'Your upgrade preview expired or no longer matches this subscription. Preview the price again.',
    );
  }

  const priceSelection = await getPriceSelectionForCurrency(
    targetPlan,
    billingInterval,
    subscriptionCurrency,
  );
  if (!priceSelection) {
    throw createError.validation(
      `Upgrade pricing is not configured for ${targetPlan} ${billingInterval} in your billing currency.`,
    );
  }
  const newPriceId = priceSelection.priceId;

  let updatedSubscription: Stripe.Subscription;
  try {
    updatedSubscription = await stripe.subscriptions.update(
      stripeSubId,
      {
        items: [{ id: stripeItem.id, price: newPriceId, quantity: requestedSeats }],
        // Keep the current renewal date. Stripe invoices only the prorated
        // price/seat difference for the remaining time in this period.
        proration_behavior: 'always_invoice',
        // Must match the signed invoice preview exactly. Stripe documents
        // using the same proration_date on preview and update to prevent a
        // time-of-confirmation price drift.
        proration_date: prorationDate,
        // Stripe applies the plan change only after the immediate invoice is paid.
        payment_behavior: 'pending_if_incomplete',
        expand: ['latest_invoice.confirmation_secret'],
        metadata: {
          plan_tier: targetPlan,
          user_id: userId,
          upgrade_from: currentTier,
          requested_seats: String(requestedSeats),
        },
      },
      {
        // Quantity is part of the key. Without it, "5 seats -> 10" and
        // "5 seats -> 25" collide whenever they share a proration second, and
        // Stripe replays the first result for the second request.
        idempotencyKey: `upgrade:${stripeSubId}:${stripeItem.price.id}:${newPriceId}:${requestedSeats}:${prorationDate}`,
      },
    );
  } catch (err) {
    logger.error({ err, userId, stripeSubId, targetPlan }, 'Stripe upgrade payment failed');
    throw createError.internal('Failed to update subscription on Stripe');
  }

  if (updatedSubscription.pending_update) {
    const invoice =
      typeof updatedSubscription.latest_invoice === 'object'
        ? updatedSubscription.latest_invoice
        : null;
    return NextResponse.json(
      {
        success: false,
        paymentActionRequired: true,
        message: 'Complete the upgrade payment before the new plan is activated.',
        ...(invoice?.hosted_invoice_url ? { paymentUrl: invoice.hosted_invoice_url } : {}),
        ...(invoice?.confirmation_secret?.client_secret
          ? { clientSecret: invoice.confirmation_secret.client_secret }
          : {}),
      },
      { status: 402 },
    );
  }

  const appliedItem = updatedSubscription.items.data[0];
  const appliedPriceId = appliedItem?.price.id;
  const appliedSeats = currentSeatsFromStripeItem(appliedItem?.quantity);
  if (appliedPriceId !== newPriceId || appliedSeats !== requestedSeats) {
    logger.error(
      {
        userId,
        stripeSubId,
        targetPlan,
        expectedPriceId: newPriceId,
        appliedPriceId,
        expectedSeats: requestedSeats,
        appliedSeats,
      },
      'Stripe returned an upgrade without the target price and seat count applied',
    );
    throw createError.internal('Upgrade payment status could not be verified');
  }

  logger.info(
    { userId, stripeSubId, newPriceId, targetPlan },
    'Stripe upgrade paid; awaiting canonical webhook activation',
  );

  // Audit: user-initiated plan change. Plan slugs and the billing interval only
  // — no Stripe ids, invoice urls or client secrets reach the audit row.
  await recordAuditEvent({
    userId,
    eventType: 'plan_changed',
    request,
    detail: {
      resourceType: 'subscription',
      previousPlanTier: currentTier,
      planTier: targetPlan,
      billingInterval,
      source: 'upgrade',
      status: 'webhook_pending',
    },
  });

  return NextResponse.json({
    success: true,
    newPlan: targetPlan,
    billingInterval,
    seats: requestedSeats,
    activation: 'webhook_pending',
  });
}

export const POST = withCorsRoute(withErrorHandler(handleUpgrade));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
