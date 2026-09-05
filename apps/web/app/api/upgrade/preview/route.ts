import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { requireEnv } from '@shared/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CheckoutRequestSchema, resolveCheckoutQuantity } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getStripeClient } from '@/lib/server/stripe-client';
import {
  getLocalizedPricingCatalog,
  getPriceSelectionForCurrency,
} from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import { resolveStripeSubscriptionForUpgrade } from '@/lib/server/stripe-upgrade-subscription';
import { createUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';
import {
  assertSameCheckoutBillingInterval,
  classifyPlanChange,
  currentSeatsFromStripeItem,
  isUpgrade,
} from '@/lib/server/stripe-plan-change';
import { isPerSeatBillingPlan } from '@agiworkforce/types';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';

/**
 * What Stripe will actually charge the moment the upgrade is confirmed.
 *
 * NOT `preview.amount_due`. `invoices.createPreview` defaults to
 * `preview_mode: 'next'`, so its total also carries the NEXT period's recurring
 * subscription line, a line that is not billed today. Quoting it overstated the
 * charge by one full period of the new plan: pro -> max mid-cycle read "$140.00
 * today" against a $40.00 invoice.
 *
 * `subscriptions.update` with `proration_behavior: 'always_invoice'` raises an
 * invoice containing the proration lines only. Confirmed against a real
 * Anthropic upgrade (Max 5x -> Max 20x, same day): the invoice held exactly
 * `$200.00` for the new plan over the remaining period and `-$99.89` unused time
 * on the old one, totalling `$100.11 + $6.61` tax = `$106.72`. No renewal line.
 *
 * Stripe's guidance is to select `parent.subscription_item_details.proration`,
 * and tax is summed per line because the figure shown must be the amount taken,
 * which for that invoice was the tax-inclusive $106.72 rather than $100.11.
 */
export interface UpgradeChargeBreakdown {
  /** One row per proration line, in Stripe's order, for an itemized receipt. */
  lineItems: { description: string; amountCents: number }[];
  subtotalCents: number;
  taxCents: number;
  /** Invoice total before the customer balance is applied. */
  totalCents: number;
  /**
   * Stripe's customer balance, signed as Stripe signs it: positive is owed and
   * increases what is taken, negative is credit and reduces it. Separate from
   * the total because it is not part of the invoice, it is settled against it.
   */
  appliedBalanceCents: number;
  totalDueTodayCents: number;
  /** End of the period being started, so the UI can state the renewal date. */
  renewsAt: string | null;
}

/**
 * Under `billing_cycle_anchor: 'now'` the invoice holds two kinds of line, and
 * both are due today:
 *
 *   proration=true   -$1.05   Unused time on Basic
 *   proration=false  $20.00   1 x Pro (at $20.00 / month)
 *
 * The new plan's charge is NOT a proration line, because the cycle restarts and
 * a full period is being bought outright. Filtering to proration lines would
 * therefore show the credit and drop the charge it offsets, quoting -$1.05.
 * Every line on this preview belongs on the bill.
 */
function immediateProrationBreakdown(preview: Stripe.Invoice): UpgradeChargeBreakdown {
  const lines = preview.lines?.data ?? [];

  let subtotalCents = 0;
  let taxCents = 0;
  const lineItems = lines.map((line) => {
    const tax = (line.taxes ?? []).reduce(
      (sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0),
      0,
    );
    subtotalCents += line.amount;
    taxCents += tax;
    return { description: line.description ?? '', amountCents: line.amount };
  });

  // The charge line is the positive one; credits for unused time are negative.
  // Its period end is the new renewal date, which the anchor reset has moved.
  const chargeLine = lines.find((line) => line.amount > 0);
  const periodEnd = (chargeLine as { period?: { end?: number } } | undefined)?.period?.end;

  const totalCents = subtotalCents + taxCents;
  const appliedBalanceCents = preview.starting_balance ?? 0;

  return {
    lineItems,
    subtotalCents,
    taxCents,
    totalCents,
    appliedBalanceCents,
    totalDueTodayCents: totalCents + appliedBalanceCents,
    renewsAt: typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

async function handleUpgradePreview(request: NextRequest): Promise<NextResponse> {
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

  const parsed = CheckoutRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw createError.validation(`Invalid request: ${msg}`);
  }
  const { plan: targetPlan, billingInterval } = parsed.data;
  const requestedSeats = resolveCheckoutQuantity(parsed.data);

  const db = getNeonDb();
  const scopedDb = createClaimedUserScopedDb(db, { userId, organizationId: null });
  const stripe = getStripeClient();

  type SubRow = Pick<
    SubscriptionRow,
    | 'status'
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'apple_original_transaction_id'
    | 'google_purchase_token'
    | 'current_period_end'
  >;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      `select status, plan_tier, stripe_customer_id, stripe_subscription_id,
              apple_original_transaction_id, google_purchase_token, current_period_end
       from subscriptions where user_id = $1 limit 1`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to load subscription for upgrade preview');
    throw createError.serviceUnavailable(
      'Billing details could not be verified. No upgrade was prepared; please retry.',
    );
  }
  const sub = subRows[0] ?? null;
  const ownerPolicy = getSubscriptionBillingOwnerPolicy(sub);

  if (sub && !ownerPolicy.ownershipVerified) {
    throw createError.conflict(stripeBillingOwnershipMessage(ownerPolicy, 'upgrade'));
  }

  if (sub && !ownerPolicy.terminal && !ownerPolicy.canApplyStripeUpgrade) {
    throw createError.conflict(stripeBillingOwnershipMessage(ownerPolicy, 'upgrade'));
  }

  if (!sub || ownerPolicy.terminal) {
    const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
    const catalog = await getLocalizedPricingCatalog(country);
    const checkoutPrice = catalog.plans[targetPlan]?.[billingInterval];
    if (!checkoutPrice?.checkoutReady) {
      throw createError.validation(
        `Checkout pricing is not configured for ${targetPlan} ${billingInterval} in your region.`,
      );
    }
    return NextResponse.json(
      {
        error: {
          message: 'Starting this paid plan requires Stripe Checkout.',
          type: 'invalid_request_error',
          code: 'checkout_required',
        },
        checkout: {
          amountDueNowCents: checkoutPrice.amountMinor * requestedSeats,
          currency: checkoutPrice.currency,
          recurringAmountCents: checkoutPrice.amountMinor * requestedSeats,
          seats: requestedSeats,
        },
      },
      { status: 409 },
    );
  }

  const currentTier = sub.plan_tier ?? 'free';
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
      profileRows = await scopedDb.query<Pick<SubscriptionRow, 'stripe_customer_id'>>(
        'select stripe_customer_id from profiles where id = $1 limit 1',
        [userId],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load billing customer for upgrade preview');
      throw createError.serviceUnavailable(
        'Billing customer details could not be verified. No upgrade was prepared; please retry.',
      );
    }
    stripeCustomerId = profileRows[0]?.stripe_customer_id ?? null;
  }

  let stripeSubId = sub.stripe_subscription_id;
  let stripeItemId: string | null = null;
  let customerId: string | null = null;
  let subscriptionCurrency = 'usd';
  let cancelAtPeriodEnd = false;
  let subscriptionEndsAt: number | null = null;
  let currentSeats = 1;
  let currentPriceRecurring: Stripe.Price.Recurring | null = null;
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
      const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
      const catalog = await getLocalizedPricingCatalog(country);
      const checkoutPrice = catalog.plans[targetPlan]?.[billingInterval];
      if (!checkoutPrice?.checkoutReady) {
        throw createError.validation(
          `Checkout pricing is not configured for ${targetPlan} ${billingInterval} in your region.`,
        );
      }
      return NextResponse.json(
        {
          error: {
            message:
              'Your current plan has no paid Stripe subscription to credit. Starting a paid plan requires full-price checkout.',
            type: 'invalid_request_error',
            code: 'checkout_required',
          },
          checkout: {
            amountDueNowCents: checkoutPrice.amountMinor * requestedSeats,
            currency: checkoutPrice.currency,
            recurringAmountCents: checkoutPrice.amountMinor * requestedSeats,
            seats: requestedSeats,
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
    stripeItemId = stripeSub.items.data[0]?.id ?? null;
    currentSeats = currentSeatsFromStripeItem(stripeSub.items.data[0]?.quantity);
    currentPriceRecurring = stripeSub.items.data[0]?.price.recurring ?? null;
    customerId =
      typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
    subscriptionCurrency = stripeSub.currency;
    cancelAtPeriodEnd = stripeSub.cancel_at_period_end === true;
    subscriptionEndsAt = stripeSub.cancel_at ?? stripeSub.items.data[0]?.current_period_end ?? null;
  } catch (err) {
    logger.error({ err, stripeSubId }, 'Failed to resolve Stripe subscription for preview');
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!stripeItemId || !customerId) throw createError.internal('Subscription has no items');

  if (cancelAtPeriodEnd) {
    return NextResponse.json(
      {
        error: {
          message:
            'This plan is scheduled to end and cannot be changed while a cancellation is pending. ' +
            'Resume the subscription from billing, then change plans.',
          type: 'invalid_request_error',
          code: 'subscription_pending_cancellation',
          ...(subscriptionEndsAt ? { ends_at: subscriptionEndsAt } : {}),
        },
      },
      { status: 409 },
    );
  }

  try {
    assertSameCheckoutBillingInterval(currentPriceRecurring, billingInterval);
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
    currentSeats,
  });
  if (!planChange.allowed) {
    throw createError.validation(planChange.reason);
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
  const prorationDate = Math.floor(Date.now() / 1000);

  let preview: Stripe.Invoice;
  try {
    preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: stripeSubId,
      subscription_details: {
        items: [{ id: stripeItemId, price: newPriceId, quantity: requestedSeats }],
        proration_behavior: 'always_invoice',
        // The cycle restarts on upgrade: a full period of the new plan is bought
        // today, less credit for unused time on the old one, and the renewal date
        // moves. Stripe rejects `proration_date` alongside this.
        billing_cycle_anchor: 'now',
      },
    });
  } catch (err) {
    logger.error({ err, userId, stripeSubId, targetPlan }, 'Stripe upgrade preview failed');
    throw createError.internal('Failed to preview the upgrade cost');
  }

  const charge = immediateProrationBreakdown(preview);

  return NextResponse.json({
    plan: targetPlan,
    billingInterval,
    currency: preview.currency,
    amountDueNowCents: charge.totalDueTodayCents,
    charge,
    recurringAmountCents: priceSelection.amountMinor * requestedSeats,
    seats: requestedSeats,
    previewToken: createUpgradePreviewToken(
      {
        userId,
        plan: targetPlan,
        billingInterval,
        stripeSubscriptionId: stripeSubId,
        seats: requestedSeats,
        prorationDate,
      },
      requireEnv('STRIPE_SECRET_KEY'),
    ),
  });
}

export const POST = withCorsRoute(withErrorHandler(handleUpgradePreview));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
