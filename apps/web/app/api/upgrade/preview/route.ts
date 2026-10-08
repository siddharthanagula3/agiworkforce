import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { requireEnv } from '@shared/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError, isAppError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  UpgradePreviewRequestSchema,
  resolveCheckoutQuantity,
  type UpgradePreviewRequest,
} from '@/lib/validations/checkout';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getStripeClient } from '@/lib/server/stripe-client';
import {
  getLocalizedPricingCatalog,
  getPriceSelectionForCurrency,
} from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import {
  promotionDiscountCents,
  resolveStripeSubscriptionForUpgrade,
  resolveUpgradePromotion,
  upgradeDiscounts,
  type ResolvedUpgradeSubscription,
  type UpgradePromotion,
} from '@/lib/server/stripe-upgrade-subscription';
import { createUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';
import { resolveTrialDaysForCheckout } from '@/lib/billing/trial-policy';
import { referralTrialDays } from '@/lib/services/referral-service';
import {
  assertUpgradeBillingInterval,
  checkoutBillingIntervalFromStripePrice,
  classifyPlanChange,
  planChangeItems,
  seatChangeBasis,
  isUpgrade,
  planChangeAnchor,
  planChangeProration,
  type PlanChangeAnchor,
} from '@/lib/server/stripe-plan-change';
import { grandfatheredYearlyBillingNotice, isPerSeatBillingPlan } from '@agiworkforce/types';
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
  discountCents: number;
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
  creditToBalanceCents: number;
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
function isProrationLine(line: Stripe.InvoiceLineItem): boolean {
  return (
    line.parent?.subscription_item_details?.proration === true ||
    line.parent?.invoice_item_details?.proration === true
  );
}

/**
 * A seat increase co-terms: the added seats are charged only for the rest of
 * the current period and renew with the seats already held, so the renewal
 * date does not move. That preview carries the next period's recurring line
 * as well, which is not billed today, so only proration lines are due now.
 */
function immediateProrationBreakdown(
  preview: Stripe.Invoice,
  anchor: PlanChangeAnchor,
): UpgradeChargeBreakdown {
  const allLines = preview.lines?.data ?? [];
  const lines = anchor === 'unchanged' ? allLines.filter(isProrationLine) : allLines;

  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  const lineItems = lines.map((line) => {
    const tax = (line.taxes ?? []).reduce(
      (sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0),
      0,
    );
    subtotalCents += line.amount;
    discountCents += (line.discount_amounts ?? []).reduce((sum, entry) => sum + entry.amount, 0);
    taxCents += tax;
    return { description: line.description ?? '', amountCents: line.amount };
  });

  // The charge line is the positive one; credits for unused time are negative.
  // Its period end is the new renewal date, which the anchor reset has moved.
  const chargeLine = lines.find((line) => line.amount > 0);
  const periodEnd = (chargeLine as { period?: { end?: number } } | undefined)?.period?.end;

  const totalCents = subtotalCents - discountCents + taxCents;
  const appliedBalanceCents = preview.starting_balance ?? 0;
  const netCents = totalCents + appliedBalanceCents;

  return {
    lineItems,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    appliedBalanceCents,
    totalDueTodayCents: Math.max(0, netCents),
    creditToBalanceCents: Math.max(0, -netCents),
    renewsAt: typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

const DAY_MS = 86_400_000;

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

interface CheckoutTrialPreview {
  days: number;
  convertsAt: string;
}

async function previewCheckoutTrial(input: {
  db: DatabaseAdapter;
  stripe: Stripe;
  userId: string;
  plan: string;
  sub: SubRow | null;
}): Promise<CheckoutTrialPreview | null> {
  const { db, stripe, userId, plan, sub } = input;
  let offeredReferralDays: number | null;
  let profileCustomerId: string | null;
  try {
    offeredReferralDays = await referralTrialDays(db, userId, plan);
    const [profile] = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
      'select stripe_customer_id from profiles where id = $1 limit 1',
      [userId],
    );
    profileCustomerId = profile?.stripe_customer_id ?? null;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to check trial eligibility for upgrade preview');
    throw createError
      .serviceUnavailable('Trial eligibility could not be verified. Please retry.')
      .asUserSafe();
  }

  const days = await resolveTrialDaysForCheckout({
    stripe,
    plan,
    userId,
    stripeCustomerId: isStripeCustomerId(profileCustomerId)
      ? profileCustomerId
      : isStripeCustomerId(sub?.stripe_customer_id)
        ? sub.stripe_customer_id
        : null,
    referralTrialDays: offeredReferralDays,
    existingSubscription: sub,
  });
  return days === null
    ? null
    : { days, convertsAt: new Date(Date.now() + days * DAY_MS).toISOString() };
}

async function checkoutRequiredResponse(input: {
  request: NextRequest;
  db: DatabaseAdapter;
  stripe: Stripe;
  userId: string;
  sub: SubRow | null;
  plan: UpgradePreviewRequest['plan'];
  billingInterval: UpgradePreviewRequest['billingInterval'];
  seats: number;
  message: string;
}): Promise<NextResponse> {
  const country = input.request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
  const catalog = await getLocalizedPricingCatalog(country);
  const checkoutPrice = catalog.plans[input.plan]?.[input.billingInterval];
  if (!checkoutPrice?.checkoutReady) {
    throw createError.validation(
      `Checkout pricing is not configured for ${input.plan} ${input.billingInterval} in your region.`,
    );
  }
  const trial = await previewCheckoutTrial(input);
  const recurringAmountCents = checkoutPrice.amountMinor * input.seats;
  return NextResponse.json(
    {
      error: {
        message: input.message,
        type: 'invalid_request_error',
        code: 'checkout_required',
      },
      checkout: {
        amountDueNowCents: trial ? 0 : recurringAmountCents,
        currency: checkoutPrice.currency,
        recurringAmountCents,
        seats: input.seats,
        trial,
      },
    },
    { status: 409 },
  );
}

async function handleUpgradePreview(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

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

  const parsed = UpgradePreviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw createError.validation(`Invalid request: ${msg}`);
  }
  const { plan: targetPlan, billingInterval, promotionCode } = parsed.data;
  const requestedSeats = resolveCheckoutQuantity(parsed.data);

  const stripe = getStripeClient();

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
    throw createError
      .serviceUnavailable(
        'Billing details could not be verified. No upgrade was prepared; please retry.',
      )
      .asUserSafe();
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
    return checkoutRequiredResponse({
      request,
      db,
      stripe,
      userId,
      sub,
      plan: targetPlan,
      billingInterval,
      seats: requestedSeats,
      message: 'Starting this paid plan requires Stripe Checkout.',
    });
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
      profileRows = await db.query<Pick<SubscriptionRow, 'stripe_customer_id'>>(
        'select stripe_customer_id from profiles where id = $1 limit 1',
        [userId],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load billing customer for upgrade preview');
      throw createError
        .serviceUnavailable(
          'Billing customer details could not be verified. No upgrade was prepared; please retry.',
        )
        .asUserSafe();
    }
    stripeCustomerId = profileRows[0]?.stripe_customer_id ?? null;
  }

  let resolved: ResolvedUpgradeSubscription | null = null;
  try {
    resolved = await resolveStripeSubscriptionForUpgrade(
      stripe,
      {
        planTier: currentTier,
        stripeCustomerId,
        stripeSubscriptionId: sub.stripe_subscription_id,
      },
      userId,
    );
    if (resolved?.recovered) {
      const recovered = resolved.subscription;
      await db.execute(
        `update subscriptions
         set stripe_subscription_id = $1, stripe_customer_id = $2, stripe_price_id = $3
         where user_id = $4`,
        [
          recovered.id,
          typeof recovered.customer === 'string' ? recovered.customer : recovered.customer.id,
          seatChangeBasis(recovered)?.item.price.id ?? null,
          userId,
        ],
      );
    }
  } catch (err) {
    logger.error(
      { err, stripeSubId: sub.stripe_subscription_id },
      'Failed to resolve Stripe subscription for preview',
    );
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!resolved) {
    return checkoutRequiredResponse({
      request,
      db,
      stripe,
      userId,
      sub,
      plan: targetPlan,
      billingInterval,
      seats: requestedSeats,
      message:
        'Your current plan has no paid Stripe subscription to credit. Starting a paid plan requires full-price checkout.',
    });
  }

  const stripeSub = resolved.subscription;
  const stripeSubId = stripeSub.id;
  const seatBasis = seatChangeBasis(stripeSub);
  const stripeItem = seatBasis?.item;
  const stripeItemId = stripeItem?.id ?? null;
  const currentSeats = seatBasis?.currentSeats ?? 1;
  const currentPriceRecurring = stripeItem?.price.recurring ?? null;
  const customerId =
    typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
  const subscriptionCurrency = stripeSub.currency;
  const cancelAtPeriodEnd = stripeSub.cancel_at_period_end === true;
  const subscriptionEndsAt = stripeSub.cancel_at ?? stripeItem?.current_period_end ?? null;
  const scheduleId =
    typeof stripeSub.schedule === 'string' ? stripeSub.schedule : (stripeSub.schedule?.id ?? null);
  if (!seatBasis || !stripeItemId || !customerId) {
    throw createError.internal('Subscription has no items');
  }

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
    assertUpgradeBillingInterval(currentPriceRecurring, billingInterval, targetPlan);
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
  const anchor = planChangeAnchor(planChange.kind);

  let promotion: UpgradePromotion | null = null;
  if (promotionCode) {
    try {
      promotion = await resolveUpgradePromotion(stripe, promotionCode, customerId);
    } catch (err) {
      if (isAppError(err)) throw err;
      logger.error({ err, userId }, 'Promotion code lookup failed');
      throw createError
        .serviceUnavailable('The promotion code could not be checked. Please try again.')
        .asUserSafe();
    }
  }

  let preview: Stripe.Invoice;
  try {
    preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: stripeSubId,
      subscription_details: {
        items: planChangeItems(seatBasis, newPriceId, requestedSeats),
        ...planChangeProration(anchor, prorationDate),
      },
      ...(promotion
        ? {
            discounts: upgradeDiscounts(stripeSub, promotion),
            expand: ['lines.data.discount_amounts.discount'],
          }
        : {}),
    });
  } catch (err) {
    logger.error({ err, userId, stripeSubId, targetPlan }, 'Stripe upgrade preview failed');
    if (promotion) {
      throw createError.validation('That promotion code cannot be used for this upgrade.');
    }
    throw createError.internal('Failed to preview the upgrade cost');
  }

  if (promotion && promotionDiscountCents(preview.lines?.data ?? [], promotion) <= 0) {
    throw createError.validation('That promotion code does not apply to this upgrade.');
  }

  const charge = immediateProrationBreakdown(preview, anchor);
  const currentInterval = checkoutBillingIntervalFromStripePrice(currentPriceRecurring);

  return NextResponse.json({
    plan: targetPlan,
    billingInterval,
    currency: preview.currency,
    amountDueNowCents: charge.totalDueTodayCents,
    charge,
    grandfatheredNotice:
      currentInterval === 'yearly' ? grandfatheredYearlyBillingNotice(currentTier) : null,
    recurringAmountCents:
      priceSelection.amountMinor * (requestedSeats - seatBasis.premiumSeats) +
      seatBasis.premiumRecurringCents,
    seats: requestedSeats,
    promotion,
    replacesScheduledChange: scheduleId !== null,
    previewToken: createUpgradePreviewToken(
      {
        userId,
        plan: targetPlan,
        billingInterval,
        stripeSubscriptionId: stripeSubId,
        seats: requestedSeats,
        promotionCodeId: promotion?.id ?? null,
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
