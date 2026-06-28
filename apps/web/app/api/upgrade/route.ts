import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow, ProfileRow } from '@/lib/server/neon-types';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { CreditService } from '@/lib/services/credit-service';
import { getPlanPriceCents, getPlanUsageBudgetCents } from '@agiworkforce/types';

const TIER_ORDER: Record<string, number> = { free: 0, pro: 1, max: 2, team: 3, enterprise: 4 };

function isUpgrade(from: string, to: string): boolean {
  return (TIER_ORDER[to] ?? -1) > (TIER_ORDER[from] ?? -1);
}

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
  }
  return stripeClient;
}

async function handleUpgrade(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'upgrade');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await (await import('@clerk/nextjs/server')).auth();
  if (!userId) throw createError.unauthorized('Please sign in to continue');

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

  const db = getNeonDb();
  const stripe = getStripe();

  // Fetch current subscription
  type SubRow = Pick<
    SubscriptionRow,
    | 'id'
    | 'status'
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'stripe_price_id'
  >;
  const subRows = await db
    .query<SubRow>(
      `select id, status, plan_tier, stripe_customer_id, stripe_subscription_id, stripe_price_id
       from subscriptions where user_id = $1 limit 1`,
      [userId],
    )
    .catch(() => [] as SubRow[]);
  const sub = subRows[0] ?? null;

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    throw createError.validation(
      'No active subscription found. Use checkout to start a new subscription.',
    );
  }

  const currentTier = sub.plan_tier ?? 'free';
  if (!isUpgrade(currentTier, targetPlan)) {
    throw createError.validation(
      `Cannot upgrade from ${currentTier} to ${targetPlan}. Use the billing portal to change or downgrade your plan.`,
    );
  }

  // Resolve new price ID
  const planPrices = STRIPE_PRICE_IDS[targetPlan as keyof typeof STRIPE_PRICE_IDS];
  if (!planPrices) throw createError.validation(`Unknown plan: ${targetPlan}`);
  const newPriceId = planPrices[billingInterval];
  if (!newPriceId) {
    throw createError.validation(`No price configured for ${targetPlan} ${billingInterval}`);
  }

  const stripeSubId = sub.stripe_subscription_id;
  if (!stripeSubId) throw createError.internal('Subscription has no Stripe subscription ID');

  let stripeCustomerId = sub.stripe_customer_id;

  // Resolve customer ID from profile if missing
  if (!stripeCustomerId) {
    const profileRows = await db
      .query<
        Pick<ProfileRow, 'stripe_customer_id'>
      >('select stripe_customer_id from profiles where id = $1 limit 1', [userId])
      .catch(() => [] as Pick<ProfileRow, 'stripe_customer_id'>[]);
    stripeCustomerId = profileRows[0]?.stripe_customer_id ?? null;
  }
  if (!stripeCustomerId) throw createError.internal('No Stripe customer found for this account');

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Calculate credit-based proration credit
  // ──────────────────────────────────────────────────────────────────────────
  let customerBalanceCreditCents = 0;
  try {
    const balance = await CreditService.getBalance(userId);
    if (balance && balance.credits_allocated_cents > 0) {
      const unusedFraction = balance.credits_remaining_cents / balance.credits_allocated_cents;
      const oldPlanPriceCents = getPlanPriceCents(currentTier, 'monthly');
      customerBalanceCreditCents = Math.floor(oldPlanPriceCents * unusedFraction);
      logger.info(
        {
          userId,
          currentTier,
          unusedFraction,
          oldPlanPriceCents,
          customerBalanceCreditCents,
          creditsAllocated: balance.credits_allocated_cents,
          creditsRemaining: balance.credits_remaining_cents,
        },
        'Calculated credit-based upgrade proration',
      );
    }
  } catch (err) {
    // Non-fatal: proceed without proration credit if balance lookup fails
    logger.warn(
      { err, userId },
      'Failed to get credit balance for proration; upgrading without credit',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Apply Stripe customer balance credit for unused old-plan value
  // ──────────────────────────────────────────────────────────────────────────
  if (customerBalanceCreditCents > 0) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      if (typeof customer !== 'string' && !customer.deleted) {
        const existingBalance = customer.balance; // negative = credit
        await stripe.customers.update(stripeCustomerId, {
          balance: existingBalance - customerBalanceCreditCents,
        });
        logger.info(
          { userId, stripeCustomerId, creditApplied: customerBalanceCreditCents },
          'Applied customer balance credit for upgrade proration',
        );
      }
    } catch (err) {
      // Non-fatal: log and proceed; user still gets new plan
      logger.error({ err, userId, stripeCustomerId }, 'Failed to apply customer balance credit');
      customerBalanceCreditCents = 0;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Retrieve Stripe subscription to get item ID
  // ──────────────────────────────────────────────────────────────────────────
  let stripeItemId: string | null = null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
      expand: ['items.data'],
    });
    stripeItemId = stripeSub.items.data[0]?.id ?? null;
  } catch (err) {
    logger.error({ err, stripeSubId }, 'Failed to retrieve Stripe subscription for item ID');
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!stripeItemId) throw createError.internal('Subscription has no items');

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Update Stripe subscription to new price
  // proration_behavior: 'none' so Stripe does not generate a time-based proration
  // invoice on top of our credit-based adjustment.
  // The customer balance credit applied in step 2 will reduce the next invoice.
  // ──────────────────────────────────────────────────────────────────────────
  try {
    await stripe.subscriptions.update(stripeSubId, {
      items: [{ id: stripeItemId, price: newPriceId }],
      proration_behavior: 'none',
      metadata: { plan_tier: targetPlan },
    });
    logger.info({ userId, stripeSubId, newPriceId, targetPlan }, 'Stripe subscription updated');
  } catch (err) {
    // Roll back the customer balance credit to avoid giving free money on failure
    if (customerBalanceCreditCents > 0) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (typeof customer !== 'string' && !customer.deleted) {
          await stripe.customers.update(stripeCustomerId, {
            balance: customer.balance + customerBalanceCreditCents,
          });
          logger.info(
            { userId },
            'Rolled back customer balance credit after subscription update failure',
          );
        }
      } catch (rollbackErr) {
        logger.error(
          { rollbackErr, userId },
          'CRITICAL: Failed to roll back customer balance credit',
        );
      }
    }
    throw createError.internal('Failed to update subscription on Stripe');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Update local DB plan_tier and price immediately, as an ATOMIC
  // compare-and-swap. The `coalesce(plan_tier,'free') = $expectedCurrent` guard
  // means only the request that actually performs the currentTier→target
  // transition gets rowcount 1; a concurrent double-submit that arrives after
  // the tier already moved matches nothing (rowcount 0). Step 6 (the additive,
  // non-idempotent credit grant) is gated on this so a double-submit cannot
  // grant the upgrade-delta credits twice. COALESCE keeps a NULL plan_tier row
  // upgradeable (currentTier defaults to 'free'), so the guard never breaks a
  // legitimate first upgrade.
  // (The webhook also fires and reconciles these, so skipping on a contended
  //  or failed update is safe.)
  // ──────────────────────────────────────────────────────────────────────────
  let didTransition = false;
  try {
    const affected = await db.execute(
      `update subscriptions set plan_tier = $1, stripe_price_id = $2
       where user_id = $3 and coalesce(plan_tier, 'free') = $4`,
      [targetPlan, newPriceId, userId, currentTier],
    );
    didTransition = affected === 1;
  } catch (err) {
    logger.error({ err, userId, targetPlan }, 'Failed to update local subscription tier');
    didTransition = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: Top up credit account with the delta to new plan's allocation.
  // ONLY runs for the request that actually performed the tier transition, so
  // a concurrent double-submit (didTransition=false) cannot double-add. The
  // webhook fires with the same period (mid-cycle upgrade), so
  // allocateCreditsForPeriod will find the existing account and not re-add
  // the full allocation. We add only the incremental difference.
  // ──────────────────────────────────────────────────────────────────────────
  if (didTransition) {
    try {
      const oldBudgetCents = getPlanUsageBudgetCents(currentTier, 'monthly');
      const newBudgetCents = getPlanUsageBudgetCents(targetPlan, 'monthly');
      const deltaCents = newBudgetCents - oldBudgetCents;

      if (deltaCents > 0) {
        const creditAccountRows = await db.query<{ id: string }>(
          'select id from token_credits where user_id = $1 and subscription_id = $2 limit 1',
          [userId, sub.id],
        );
        const creditAccount = creditAccountRows[0];

        if (creditAccount) {
          await db.execute('select add_credits($1, $2, $3, $4, $5)', [
            userId,
            creditAccount.id,
            deltaCents,
            `Plan upgrade: ${currentTier} → ${targetPlan}`,
            // add_credits only accepts ('purchase','adjustment','refund','bonus');
            // 'upgrade' was rejected by the guard so the incremental grant silently
            // failed. An upgrade credit is an adjustment.
            'adjustment',
          ]);
          logger.info(
            { userId, creditAccountId: creditAccount.id, deltaCents, currentTier, targetPlan },
            'Added incremental credits for plan upgrade',
          );
        } else {
          logger.warn(
            { userId, subscriptionId: sub.id },
            'No credit account found for upgrade delta; webhook will handle credit allocation',
          );
        }
      }
    } catch (err) {
      // Non-fatal: credit top-up failure does not block the upgrade
      logger.error({ err, userId, currentTier, targetPlan }, 'Failed to add upgrade delta credits');
    }
  }

  return NextResponse.json({
    success: true,
    newPlan: targetPlan,
    billingInterval,
    creditApplied: customerBalanceCreditCents,
    creditAppliedUsd: (customerBalanceCreditCents / 100).toFixed(2),
  });
}

export const POST = withErrorHandler(handleUpgrade);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
