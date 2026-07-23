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
import { getPriceSelectionForCurrency } from '@/lib/server/localized-pricing-service';
import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

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
  type SubRow = Pick<SubscriptionRow, 'status' | 'plan_tier' | 'stripe_subscription_id'>;
  const subRows = await db
    .query<SubRow>(
      `select status, plan_tier, stripe_subscription_id
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

  const stripeSubId = sub.stripe_subscription_id;
  if (!isStripeSubscriptionId(stripeSubId)) {
    return NextResponse.json(
      {
        error: {
          message:
            'Your current plan is not attached to a live Stripe subscription. Continue through secure checkout.',
          type: 'invalid_request_error',
          code: 'checkout_required',
        },
      },
      { status: 409 },
    );
  }

  let stripeItem: Stripe.SubscriptionItem | null = null;
  let subscriptionCurrency = 'usd';
  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
      expand: ['items.data'],
    });
    stripeItem = stripeSub.items.data[0] ?? null;
    subscriptionCurrency = stripeSub.currency;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      return NextResponse.json(
        {
          error: {
            message:
              'Your previous Stripe subscription no longer exists. Continue through secure checkout.',
            type: 'invalid_request_error',
            code: 'checkout_required',
          },
        },
        { status: 409 },
      );
    }
    logger.error({ err, stripeSubId }, 'Failed to retrieve Stripe subscription for item ID');
    throw createError.internal('Failed to retrieve subscription details from Stripe');
  }
  if (!stripeItem) throw createError.internal('Subscription has no items');

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
        items: [{ id: stripeItem.id, price: newPriceId }],
        // A replacement cycle charges the full target plan now and lets Stripe
        // credit only the unused TIME on the old plan.
        billing_cycle_anchor: 'now',
        proration_behavior: 'always_invoice',
        // Stripe applies the plan change only after the immediate invoice is paid.
        payment_behavior: 'pending_if_incomplete',
        expand: ['latest_invoice.confirmation_secret'],
        metadata: { plan_tier: targetPlan, user_id: userId, upgrade_from: currentTier },
      },
      {
        idempotencyKey: `upgrade:${stripeSubId}:${stripeItem.price.id}:${newPriceId}`,
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
        ...(invoice?.confirmation_secret?.client_secret
          ? { clientSecret: invoice.confirmation_secret.client_secret }
          : {}),
      },
      { status: 402 },
    );
  }

  const appliedPriceId = updatedSubscription.items.data[0]?.price.id;
  if (appliedPriceId !== newPriceId) {
    logger.error(
      { userId, stripeSubId, targetPlan, expectedPriceId: newPriceId, appliedPriceId },
      'Stripe returned an upgrade without the target price applied',
    );
    throw createError.internal('Upgrade payment status could not be verified');
  }

  logger.info(
    { userId, stripeSubId, newPriceId, targetPlan },
    'Stripe upgrade paid; awaiting canonical webhook activation',
  );
  return NextResponse.json({
    success: true,
    newPlan: targetPlan,
    billingInterval,
    activation: 'webhook_pending',
  });
}

export const POST = withErrorHandler(handleUpgrade);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
