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
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import {
  getLocalizedPricingCatalog,
  getPriceSelectionForCurrency,
} from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import { resolveStripeSubscriptionForUpgrade } from '@/lib/server/stripe-upgrade-subscription';
import { createUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';

// Tier order MUST match app/api/upgrade/route.ts so preview and apply agree on
// what counts as an upgrade.
const TIER_ORDER: Record<string, number> = {
  free: 0,
  basic: 0.5,
  pro: 1,
  team: 1.5,
  max: 2,
  max_15x: 3,
  enterprise: 4,
};

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

/**
 * Read-only proration preview for a mid-cycle upgrade. Returns the exact amount
 * Stripe would charge NOW (prorated) plus the going-forward recurring amount, so
 * the client can show a "you'll be charged $X today, then $Y/interval" confirmation
 * before the actual charge. Mirrors the setup of app/api/upgrade/route.ts exactly
 * (same tier order, same subscription lookup, same `always_invoice` +
 * `billing_cycle_anchor: now`) but calls `invoices.createPreview` — it NEVER
 * mutates the subscription or charges the card.
 */
async function handleUpgradePreview(request: NextRequest): Promise<NextResponse> {
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

  type SubRow = Pick<
    SubscriptionRow,
    'status' | 'plan_tier' | 'stripe_customer_id' | 'stripe_subscription_id'
  >;
  const subRows = await db
    .query<SubRow>(
      `select status, plan_tier, stripe_customer_id, stripe_subscription_id
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

  let stripeCustomerId = sub.stripe_customer_id;
  if (!isStripeCustomerId(stripeCustomerId)) {
    const profileRows = await db
      .query<
        Pick<SubscriptionRow, 'stripe_customer_id'>
      >('select stripe_customer_id from profiles where id = $1 limit 1', [userId])
      .catch(() => [] as Pick<SubscriptionRow, 'stripe_customer_id'>[]);
    stripeCustomerId = profileRows[0]?.stripe_customer_id ?? null;
  }

  let stripeSubId = sub.stripe_subscription_id;
  let stripeItemId: string | null = null;
  let customerId: string | null = null;
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
            amountDueNowCents: checkoutPrice.amountMinor,
            currency: checkoutPrice.currency,
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
    customerId =
      typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
    subscriptionCurrency = stripeSub.currency;
  } catch (err) {
    logger.error({ err, stripeSubId }, 'Failed to resolve Stripe subscription for preview');
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!stripeItemId || !customerId) throw createError.internal('Subscription has no items');

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
        items: [{ id: stripeItemId, price: newPriceId }],
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: 'now',
        proration_date: prorationDate,
      },
    });
  } catch (err) {
    logger.error({ err, userId, stripeSubId, targetPlan }, 'Stripe upgrade preview failed');
    throw createError.internal('Failed to preview the upgrade cost');
  }

  return NextResponse.json({
    plan: targetPlan,
    billingInterval,
    currency: preview.currency,
    // Charged now (prorated): the full new plan minus credit for unused time on
    // the old plan. This is the ONLY figure the server must compute — the going-
    // forward recurring price is a static catalog value the client already knows.
    amountDueNowCents: preview.amount_due,
    previewToken: createUpgradePreviewToken(
      {
        userId,
        plan: targetPlan,
        billingInterval,
        stripeSubscriptionId: stripeSubId,
        prorationDate,
      },
      requireEnv('STRIPE_SECRET_KEY'),
    ),
  });
}

export const POST = withErrorHandler(handleUpgradePreview);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
