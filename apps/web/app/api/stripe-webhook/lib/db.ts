import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import {
  resolvePlanTier,
  isValidPlanTier,
  getTierMapping,
  isPriceIdRegistered,
} from '@/lib/price-tier-mapping';
import { WEBHOOK_MAX_RETRIES, WEBHOOK_RETRY_BASE_DELAY_MS } from '@/lib/constants';
import { getSubscriptionPeriod, getSubscriptionCouponId } from '@/lib/stripe-types';
import { getPlanUsageBudgetCents } from '@/lib/server/managed-usage-policy';
import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

export async function ensureProfileExists(
  db: DatabaseAdapter,
  userId: string,
  email?: string | null,
): Promise<void> {
  const existing = await db
    .query<{ id: string }>('select id from profiles where id = $1 limit 1', [userId])
    .catch((fetchError: unknown) => {
      logger.error({ error: fetchError, userId }, 'Error checking for existing profile');
      throw fetchError;
    });

  if (existing.length === 0) {
    logger.info({ userId, email }, 'Creating missing profile for user in webhook');
    await db
      .execute('insert into profiles (id, email) values ($1, $2) on conflict (id) do nothing', [
        userId,
        email ?? null,
      ])
      .catch((insertError: unknown) => {
        const pgCode = (insertError as { code?: string })?.code;
        if (pgCode !== '23505') {
          logger.error({ error: insertError, userId }, 'Failed to create profile');
          throw insertError;
        }
        logger.info({ userId }, 'Profile already exists (concurrent creation)');
      });
    logger.info({ userId, email }, 'Profile created successfully in webhook');
  }
}

export async function handleCreditTopUp(
  db: DatabaseAdapter,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.['user_id'];
  const creditAmountCents = parseInt(session.metadata?.['credit_amount_cents'] || '0', 10);

  if (!userId || !creditAmountCents) {
    logger.error(
      { sessionId: session.id, userId, creditAmountCents },
      'Missing required metadata for credit top-up',
    );
    throw new Error('Missing user_id or credit_amount_cents in session metadata');
  }

  // M7: Validate credit amount against actual Stripe PaymentIntent amount
  if (session.payment_intent) {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent.id;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      logger.error(
        { sessionId: session.id, paymentIntentId, status: paymentIntent.status },
        'Credit top-up: PaymentIntent has not succeeded',
      );
      throw new Error(
        `PaymentIntent ${paymentIntentId} has status ${paymentIntent.status}, expected succeeded`,
      );
    }

    if (paymentIntent.amount_received !== creditAmountCents) {
      logger.error(
        {
          sessionId: session.id,
          userId,
          paymentIntentId,
          metadataAmount: creditAmountCents,
          actualAmountReceived: paymentIntent.amount_received,
        },
        'SECURITY: Credit top-up amount mismatch - metadata does not match PaymentIntent amount_received',
      );
      throw new Error(
        `Credit amount mismatch: metadata says ${creditAmountCents} cents but PaymentIntent received ${paymentIntent.amount_received} cents`,
      );
    }

    logger.info(
      { sessionId: session.id, userId, paymentIntentId, amountVerified: creditAmountCents },
      'Credit top-up: PaymentIntent amount verified successfully',
    );
  } else {
    logger.error(
      { sessionId: session.id, userId },
      'SECURITY: Credit top-up session has no payment_intent - cannot verify payment',
    );
    throw new Error('Credit top-up session missing payment_intent');
  }

  logger.info(
    { sessionId: session.id, userId, creditAmountCents },
    'Processing credit top-up purchase',
  );

  try {
    const subscriptions = await db.query<{
      id: string;
      current_period_start: string;
      current_period_end: string;
    }>(
      'select id, current_period_start, current_period_end from subscriptions where user_id = $1 limit 1',
      [userId],
    );
    const subscription = subscriptions[0];

    if (!subscription) {
      logger.error({ userId }, 'No subscription found for credit top-up user');
      throw new Error('No subscription found for user');
    }

    const creditAccounts = await db.query<{ id: string }>(
      'select id from token_credits where user_id = $1 and subscription_id = $2 limit 1',
      [userId, subscription.id],
    );
    const creditAccount = creditAccounts[0];

    if (!creditAccount) {
      logger.error({ userId, subscriptionId: subscription.id }, 'No credit account found for user');
      throw new Error('No credit account found for user');
    }

    const balanceBefore = await db
      .query<{
        credits_remaining_cents: number;
      }>('select credits_remaining_cents from token_credits where id = $1 limit 1', [
        creditAccount.id,
      ])
      .then((rows) => rows[0]);

    const previousBalance = balanceBefore?.credits_remaining_cents ?? 0;

    await db.execute('select add_credits($1, $2, $3, $4, $5)', [
      userId,
      creditAccount.id,
      creditAmountCents,
      'Credit top-up purchase',
      'purchase',
    ]);

    const balanceAfter = await db
      .query<{
        credits_remaining_cents: number;
      }>('select credits_remaining_cents from token_credits where id = $1 limit 1', [
        creditAccount.id,
      ])
      .then((rows) => rows[0]);

    const newBalance = balanceAfter?.credits_remaining_cents ?? 0;
    const actualDifference = newBalance - previousBalance;

    if (actualDifference !== creditAmountCents) {
      logger.error(
        {
          userId,
          creditAccountId: creditAccount.id,
          expected: creditAmountCents,
          actual: actualDifference,
          previousBalance,
          newBalance,
        },
        'Credit verification failed: balance did not increase by expected amount',
      );
    } else {
      logger.info(
        {
          userId,
          creditAmountCents,
          subscriptionId: subscription.id,
          creditAccountId: creditAccount.id,
          previousBalance,
          newBalance,
        },
        'Credit top-up processed and verified successfully',
      );
    }
  } catch (error) {
    logger.error({ error, userId, creditAmountCents }, 'Error processing credit top-up');
    throw error;
  }
}

export async function upsertSubscriptionFromSession(
  db: DatabaseAdapter,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<NextResponse | void> {
  logger.info({ sessionId: session.id }, 'Processing checkout session');

  let resolvedUserId =
    session.metadata?.['user_id'] || session.metadata?.['userId'] || session.client_reference_id;

  if (!resolvedUserId && session.customer) {
    try {
      const stripeCustomerId = session.customer as string;

      const profiles = await db.query<{ id: string }>(
        'select id from profiles where stripe_customer_id = $1 limit 1',
        [stripeCustomerId],
      );
      const profile = profiles[0];

      if (profile?.id) {
        resolvedUserId = profile.id;
        logger.info(
          { sessionId: session.id, customerId: stripeCustomerId, userId: resolvedUserId },
          'Resolved user_id from stripe_customer_id in profiles table (BEST PRACTICE)',
        );
      } else {
        logger.warn(
          { sessionId: session.id, customerId: stripeCustomerId },
          'SECURITY WARNING: stripe_customer_id not found in profiles - attempting email fallback (legacy only)',
        );

        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (typeof customer !== 'string' && !customer.deleted && customer.email) {
          const matchingProfiles = await db.query<{ id: string; email: string | null }>(
            'select id, email from profiles where email = $1 limit 1',
            [customer.email.toLowerCase()],
          );

          if (matchingProfiles.length > 0) {
            const matchingUser = matchingProfiles[0];

            if (matchingUser) {
              const duplicateCheck = await db.query<{ id: string }>(
                'select id from profiles where email = $1 limit 2',
                [customer.email],
              );

              if (duplicateCheck.length > 1) {
                logger.error(
                  {
                    sessionId: session.id,
                    email: customer.email,
                    count: duplicateCheck.length,
                  },
                  'SECURITY: Multiple profiles found with same email - cannot safely assign subscription',
                );
                throw new Error('Email reuse detected - cannot safely assign subscription');
              }

              resolvedUserId = matchingUser.id;
              logger.warn(
                { sessionId: session.id, email: customer.email, userId: resolvedUserId },
                'FALLBACK: Resolved user_id from email - storing customer_id for future',
              );

              await db
                .execute('update profiles set stripe_customer_id = $1 where id = $2', [
                  stripeCustomerId,
                  resolvedUserId,
                ])
                .catch(() => undefined);

              logger.info(
                { userId: resolvedUserId, customerId: stripeCustomerId },
                'Stored stripe_customer_id in profile (migration from email fallback)',
              );
            } else {
              logger.error(
                { sessionId: session.id, email: customer.email },
                'No auth user found matching customer email',
              );
            }
          }
        }
      }
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Failed to resolve user from customer');
    }
  }

  if (!resolvedUserId) {
    logger.error(
      {
        sessionId: session.id,
        customerId: session.customer,
        hasMetadata: !!session.metadata,
        hasClientRef: !!session.client_reference_id,
      },
      'CRITICAL: No user_id found - cannot create subscription',
    );
    throw new Error('Cannot determine user_id for subscription');
  }

  let customerEmail: string | null = null;
  if (session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer as string);
      if (typeof customer !== 'string' && !customer.deleted) {
        customerEmail = customer.email || null;
      }
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Could not fetch customer email');
    }
  }

  await ensureProfileExists(db, resolvedUserId, customerEmail);

  const stripeCustomerId = session.customer as string | null;
  if (stripeCustomerId) {
    await db
      .execute('update profiles set stripe_customer_id = $1 where id = $2', [
        stripeCustomerId,
        resolvedUserId,
      ])
      .catch((updateError: unknown) => {
        logger.error(
          { error: updateError, userId: resolvedUserId, customerId: stripeCustomerId },
          'Failed to store stripe_customer_id in profiles table',
        );
      });
    logger.info(
      { userId: resolvedUserId, customerId: stripeCustomerId },
      'Stored stripe_customer_id in profiles table (enables proper customer lookup)',
    );
  }

  if (customerEmail) {
    const profileRows = await db
      .query<{
        email: string | null;
      }>('select email from profiles where id = $1 limit 1', [resolvedUserId])
      .catch(() => [] as { email: string | null }[]);

    const storedProfile = profileRows[0];
    if (storedProfile?.email && storedProfile.email !== customerEmail) {
      logger.warn(
        {
          resolvedUserId,
          profileEmail: storedProfile.email,
          stripeCustomerEmail: customerEmail,
          sessionId: session.id,
        },
        'WARNING: Stripe customer email does not match Neon profile email - subscription will be created for the logged-in user but emails differ',
      );
    }
  }

  const stripeSubId = session.subscription as string | null;

  let stripePriceId: string | null = null;
  if (session.line_items?.data && session.line_items.data.length > 0) {
    stripePriceId = session.line_items.data[0]?.price?.id || null;
  } else if (session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      if (expandedSession.line_items?.data && expandedSession.line_items.data.length > 0) {
        stripePriceId = expandedSession.line_items.data[0]?.price?.id || null;
      }
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Failed to retrieve expanded session');
    }
  }

  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;
  let status: string = 'active';
  let cancelAtPeriodEnd: boolean = false;
  let canceledAt: Date | null = null;
  let stripeCouponId: string | null = null;

  if (stripeSubId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(stripeSubId);
      status = subscription.status;

      const period = getSubscriptionPeriod(subscription);
      if (period) {
        currentPeriodStart = new Date(period.start * 1000);
        currentPeriodEnd = new Date(period.end * 1000);
      }

      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

      const firstItem = subscription.items?.data?.[0];
      if (!stripePriceId && firstItem) {
        stripePriceId = firstItem.price.id;
        logger.info(
          { priceId: stripePriceId, subscriptionId: stripeSubId },
          'Retrieved price_id from subscription',
        );
      }
      stripeCouponId = getSubscriptionCouponId(subscription);
    } catch (error) {
      logger.error(
        { error, subscriptionId: stripeSubId },
        'Failed to retrieve subscription details',
      );
    }
  }

  if (!stripePriceId && stripeSubId) {
    try {
      logger.warn(
        { subscriptionId: stripeSubId },
        'stripe_price_id still null after initial attempts, retrying for subscription',
      );
      const subscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price'],
      });
      const retryItem = subscription.items.data[0];
      if (retryItem) {
        stripePriceId = retryItem.price.id;
        logger.info(
          { priceId: stripePriceId, subscriptionId: stripeSubId },
          'Successfully retrieved price_id from subscription on retry',
        );
      }
    } catch (error) {
      logger.error({ error, subscriptionId: stripeSubId }, 'Failed to retrieve price_id on retry');
    }
  }

  if (!stripePriceId && stripeSubId) {
    logger.warn(
      { sessionId: session.id, subscriptionId: stripeSubId, userId: resolvedUserId },
      'stripe_price_id is null for session. Attempting final retrieval...',
    );
    try {
      const finalSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price', 'items.data.plan'],
      });
      const finalItem = finalSubscription.items.data[0];
      if (finalItem) {
        stripePriceId = finalItem.price?.id || finalItem.plan?.id || null;
        if (stripePriceId) {
          logger.info(
            { priceId: stripePriceId },
            'Successfully retrieved price_id in final attempt',
          );
        }
      }
    } catch (error) {
      logger.error(
        { error, subscriptionId: stripeSubId },
        'Final attempt to retrieve price_id failed',
      );
    }
  }

  if (!stripePriceId) {
    logger.error(
      { sessionId: session.id, subscriptionId: stripeSubId, userId: resolvedUserId },
      'CRITICAL: stripe_price_id is still null after all attempts',
    );
    throw new Error('Cannot provision subscription without a registered Stripe Price');
  }

  if (!isPriceIdRegistered(stripePriceId)) {
    logger.error(
      {
        sessionId: session.id,
        priceId: stripePriceId,
        registeredPriceIds: Object.keys(getTierMapping()),
      },
      'Checkout session contained an unrecognised Price; refusing entitlement provisioning',
    );
    throw new Error('Cannot provision subscription from an unregistered Stripe Price');
  }

  const planTier = resolvePlanTier(
    session.metadata as Record<string, string> | null,
    stripePriceId,
  );
  if (!planTier || !isValidPlanTier(planTier)) {
    logger.error(
      {
        sessionId: session.id,
        priceId: stripePriceId,
        registeredPriceIds: Object.keys(getTierMapping()),
      },
      'Registered Stripe Price did not resolve to a valid entitlement tier',
    );
    throw new Error('Cannot determine subscription tier from its registered Stripe Price');
  }

  const metadataTier = session.metadata?.['plan_tier']?.toLowerCase();
  if (metadataTier && metadataTier !== planTier) {
    logger.warn(
      { sessionId: session.id, metadataTier, priceTier: planTier, priceId: stripePriceId },
      'Ignoring stale subscription metadata because the purchased Stripe Price is authoritative',
    );
  }

  let replacedEntitlement: { id: string; planTier: string } | null = null;
  if (session.metadata?.['replace_unlinked_entitlement'] === 'true') {
    const previousPlanTier = session.metadata?.['upgrade_from']?.toLowerCase();
    const existingRows = await db.query<{ id: string; plan_tier: string }>(
      'select id, plan_tier from subscriptions where user_id = $1 limit 1',
      [resolvedUserId],
    );
    const existing = existingRows[0];
    const previousBudget = getPlanUsageBudgetCents(previousPlanTier ?? '', 'monthly');
    const nextBudget = getPlanUsageBudgetCents(planTier, 'monthly');
    if (
      existing &&
      previousPlanTier &&
      existing.plan_tier === previousPlanTier &&
      previousBudget > 0 &&
      nextBudget >= previousBudget
    ) {
      replacedEntitlement = { id: existing.id, planTier: previousPlanTier };
    } else {
      logger.warn(
        {
          sessionId: session.id,
          resolvedUserId,
          previousPlanTier,
          storedPlanTier: existing?.plan_tier,
          planTier,
        },
        'Ignoring invalid unlinked-entitlement replacement metadata',
      );
    }
  }

  logger.debug(
    { sessionId: session.id, resolvedUserId, planTier, stripeCustomerId, stripeSubId },
    'Session details',
  );

  if (!stripeCouponId && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['total_details.breakdown'],
      });

      if (expandedSession.total_details?.breakdown?.discounts) {
        const discountItem = expandedSession.total_details.breakdown.discounts[0];
        const couponId = (discountItem as unknown as { discount?: { coupon?: { id?: string } } })
          ?.discount?.coupon?.id;
        if (couponId) {
          stripeCouponId = couponId;
        }
      }
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Failed to retrieve session discount details');
    }
  }

  const subData = {
    user_id: resolvedUserId,
    status,
    plan_tier: planTier,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubId,
    stripe_price_id: stripePriceId,
    stripe_coupon_id: stripeCouponId,
    current_period_start: currentPeriodStart?.toISOString() ?? null,
    current_period_end: currentPeriodEnd?.toISOString() ?? null,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt?.toISOString() ?? null,
  };

  logger.info({ subscriptionData: subData }, 'Upserting subscription');

  const upserted = await db
    .query<{ id: string }>(
      `insert into subscriptions (user_id, status, plan_tier, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_coupon_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (user_id) do update set
         status = excluded.status,
         plan_tier = excluded.plan_tier,
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         stripe_price_id = excluded.stripe_price_id,
         stripe_coupon_id = excluded.stripe_coupon_id,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at = excluded.canceled_at
       returning id`,
      [
        subData.user_id,
        subData.status,
        subData.plan_tier,
        subData.stripe_customer_id,
        subData.stripe_subscription_id,
        subData.stripe_price_id,
        subData.stripe_coupon_id,
        subData.current_period_start,
        subData.current_period_end,
        subData.cancel_at_period_end,
        subData.canceled_at,
      ],
    )
    .catch((error: unknown) => {
      logger.error(
        { error, subscriptionData: subData },
        'CRITICAL: Failed to upsert subscription - subscription will not be created',
      );
      throw error;
    });

  const data = upserted[0];

  if (data && currentPeriodStart && currentPeriodEnd) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
      try {
        if (replacedEntitlement && replacedEntitlement.id === data.id) {
          await SubscriptionService.carryCreditsForUpgradePeriod(
            resolvedUserId,
            data.id,
            replacedEntitlement.planTier,
            planTier,
            new Date(currentPeriodStart),
            new Date(currentPeriodEnd),
            db,
          );
        } else {
          await SubscriptionService.allocateCreditsForPeriod(
            resolvedUserId,
            data.id,
            planTier,
            new Date(currentPeriodStart),
            new Date(currentPeriodEnd),
            { db },
          );
        }
        logger.info(
          {
            userId: resolvedUserId,
            subscriptionId: data.id,
            planTier,
            attempt,
            carriedUsage: !!replacedEntitlement,
          },
          replacedEntitlement
            ? 'Usage carried into paid replacement subscription'
            : 'Credits allocated for new subscription',
        );
        lastError = null;
        break;
      } catch (creditError) {
        lastError = creditError;
        logger.warn(
          {
            error: creditError,
            userId: resolvedUserId,
            subscriptionId: data.id,
            attempt,
            maxRetries: WEBHOOK_MAX_RETRIES,
          },
          `Credit allocation attempt ${attempt}/${WEBHOOK_MAX_RETRIES} failed`,
        );

        if (attempt < WEBHOOK_MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, WEBHOOK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)),
          );
        }
      }
    }

    if (lastError) {
      logger.error(
        { error: lastError, userId: resolvedUserId, subscriptionId: data.id, planTier },
        'CRITICAL: Failed to allocate credits after all retries - user may need manual sync',
      );
      throw lastError;
    }
  }
}

export async function updateSubscriptionFromStripeSubscription(
  db: DatabaseAdapter,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  logger.info({ subscriptionId: subscription.id }, 'Processing subscription update');

  if (subscription.pending_update) {
    logger.info(
      { subscriptionId: subscription.id },
      'Skipping subscription provisioning until pending upgrade payment succeeds',
    );
    return;
  }

  const stripeSubId = subscription.id;
  const stripeCustomerId = subscription.customer as string | null;

  let stripePriceId: string | null = null;
  const firstSubItem = subscription.items.data[0];
  if (firstSubItem) {
    stripePriceId = firstSubItem.price.id;
  }

  if (stripePriceId && !isPriceIdRegistered(stripePriceId)) {
    logger.error(
      {
        subscriptionId: subscription.id,
        priceId: stripePriceId,
        registeredPriceIds: Object.keys(getTierMapping()),
      },
      'Webhook contained an unregistered Price; refusing entitlement provisioning',
    );
    throw new Error('Cannot provision subscription from an unregistered Stripe Price');
  }

  const resolvedTier = resolvePlanTier(
    subscription.metadata as Record<string, string> | null,
    stripePriceId,
  );
  const planTier = resolvedTier && isValidPlanTier(resolvedTier) ? resolvedTier : null;

  if (!planTier) {
    logger.error(
      {
        subscriptionId: subscription.id,
        priceId: stripePriceId,
        hasMetadata: !!subscription.metadata?.['plan_tier'],
        registeredPriceIds: Object.keys(getTierMapping()),
        envVarHint:
          'Ensure the current Stripe Price env vars (STRIPE_PRICE_BASIC_MONTHLY_USD, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_MAX_MONTHLY, STRIPE_PRICE_MAX_15X_MONTHLY, STRIPE_PRICE_TEAM_MONTHLY, and their yearly/regional variants) are set in Vercel environment variables',
      },
      'CRITICAL: Cannot determine valid plan_tier for subscription update - check if Stripe price IDs are registered in environment variables',
    );
    logger.warn(
      { subscriptionId: subscription.id },
      'Subscription update cannot proceed until its Stripe Price is registered.',
    );
    throw new Error('Cannot determine subscription tier from its registered Stripe Price');
  }

  if (!subscription.metadata?.['plan_tier']) {
    logger.warn(
      { subscriptionId: subscription.id, inferredPlan: planTier, priceId: stripePriceId },
      'plan_tier missing from subscription metadata. Inferred from price_id using centralized mapping.',
    );
  }

  const period = getSubscriptionPeriod(subscription);
  const periodStart = period?.start;
  const periodEnd = period?.end;
  const stripeCouponId = getSubscriptionCouponId(subscription);

  const updateData = {
    status: subscription.status,
    stripe_price_id: stripePriceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_coupon_id: stripeCouponId,
    plan_tier: planTier,
  };

  logger.info({ stripeSubId, stripeCustomerId, updateData }, 'Updating subscription');

  let resolvedUserId: string | null = null;

  if (stripeSubId) {
    const existingSubs = await db
      .query<{
        id: string;
        user_id: string;
        plan_tier: string | null;
        status: string | null;
        current_period_start: string | null;
      }>(
        'select id, user_id, plan_tier, status, current_period_start from subscriptions where stripe_subscription_id = $1 limit 1',
        [stripeSubId],
      )
      .catch((fetchError: unknown) => {
        // A READ error must NOT be silently treated as "no existing subscription":
        // that falls through to the create/upsert path and bypasses the
        // isNewPeriod reset-vs-allocate distinction, mis-allocating credits.
        // Re-throw so the webhook returns non-2xx and Stripe retries.
        logger.error({ error: fetchError, stripeSubId }, 'Failed to check existing subscription');
        throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      });

    const existingSub = existingSubs[0];

    if (existingSub) {
      resolvedUserId = existingSub.user_id;

      // Ordering guard: Stripe does not guarantee webhook delivery order, so a
      // stale `customer.subscription.updated` (created before a cancel) can
      // arrive AFTER `customer.subscription.deleted`. `canceled` is terminal —
      // Stripe never reactivates a deleted subscription id (a resubscribe mints
      // a NEW id) — so refuse to resurrect a locally-canceled row back to an
      // active/paid state. Without this, the stale event would flip `status`
      // (and re-derive `plan_tier` from the still-paid price) back to active and
      // silently re-entitle a canceled user, since entitlement reads gate on the
      // stored `status`.
      if (existingSub.status === 'canceled' && updateData.status !== 'canceled') {
        logger.warn(
          { stripeSubId, incomingStatus: updateData.status },
          'Ignoring out-of-order subscription update that would resurrect a canceled subscription',
        );
        return;
      }

      const isNewPeriod = existingSub.current_period_start !== updateData.current_period_start;

      const isPaidPlanUpgrade =
        isNewPeriod &&
        !!existingSub.plan_tier &&
        existingSub.plan_tier !== planTier &&
        getPlanUsageBudgetCents(existingSub.plan_tier, 'monthly') > 0 &&
        getPlanUsageBudgetCents(planTier, 'monthly') >=
          getPlanUsageBudgetCents(existingSub.plan_tier, 'monthly');

      if (isPaidPlanUpgrade && updateData.current_period_start && updateData.current_period_end) {
        await SubscriptionService.carryCreditsForUpgradePeriod(
          resolvedUserId,
          existingSub.id,
          existingSub.plan_tier!,
          planTier,
          new Date(updateData.current_period_start),
          new Date(updateData.current_period_end),
          db,
        );
      }

      const updated = await db
        .query<{ id: string }>(
          `update subscriptions set
            status = $1,
            stripe_price_id = $2,
            current_period_start = $3,
            current_period_end = $4,
            cancel_at_period_end = $5,
            canceled_at = $6,
            stripe_coupon_id = $7,
            plan_tier = $8
          where stripe_subscription_id = $9
          returning id`,
          [
            updateData.status,
            updateData.stripe_price_id,
            updateData.current_period_start,
            updateData.current_period_end,
            updateData.cancel_at_period_end,
            updateData.canceled_at,
            updateData.stripe_coupon_id,
            updateData.plan_tier,
            stripeSubId,
          ],
        )
        .catch((updateError: unknown) => {
          logger.error({ error: updateError, stripeSubId }, 'Failed to update subscription');
          throw updateError;
        });

      const updatedRow = updated[0];

      if (
        updatedRow &&
        updateData.current_period_start &&
        updateData.current_period_end &&
        resolvedUserId
      ) {
        const pStart = updateData.current_period_start;
        const pEnd = updateData.current_period_end;
        try {
          if (isPaidPlanUpgrade) {
            logger.info(
              { userId: resolvedUserId, subscriptionId: updatedRow.id, planTier },
              'Usage carried into replacement upgrade period',
            );
          } else if (isNewPeriod) {
            await SubscriptionService.resetCreditsForNewPeriod(
              resolvedUserId,
              updatedRow.id,
              planTier,
              new Date(pStart),
              new Date(pEnd),
              { db },
            );
            logger.info(
              { userId: resolvedUserId, subscriptionId: updatedRow.id, planTier },
              'Credits reset for new billing period',
            );
          } else {
            await SubscriptionService.allocateCreditsForPeriod(
              resolvedUserId,
              updatedRow.id,
              planTier,
              new Date(pStart),
              new Date(pEnd),
              { db },
            );
            logger.info(
              { userId: resolvedUserId, subscriptionId: updatedRow.id, planTier },
              'Credits allocated for subscription update',
            );
          }
        } catch (creditError) {
          logger.error(
            { error: creditError, userId: resolvedUserId, subscriptionId: updatedRow.id },
            'Failed to allocate/reset credits for subscription',
          );
          // Entitlement and its usage ledger are one billing outcome. Returning
          // 2xx here would acknowledge the Stripe event while leaving the user
          // on the new plan with a stale or missing allowance. Re-throw so
          // Stripe retries the idempotent reconciliation.
          throw creditError;
        }
      }
    } else {
      const metadataUserId = subscription.metadata?.['user_id'];
      if (metadataUserId) {
        logger.info(
          { stripeSubId, metadataUserId },
          'Subscription not found. Will create via metadata user_id',
        );
        resolvedUserId = metadataUserId;
      } else if (stripeCustomerId) {
        const profileRows = await db.query<{ id: string }>(
          'select id from profiles where stripe_customer_id = $1 limit 1',
          [stripeCustomerId],
        );
        const profileByCustomer = profileRows[0];

        if (profileByCustomer?.id) {
          logger.info(
            { userId: profileByCustomer.id, customerId: stripeCustomerId },
            'Found user by stripe_customer_id in profiles table (BEST PRACTICE)',
          );
          resolvedUserId = profileByCustomer.id;
        } else {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (typeof customer !== 'string' && !customer.deleted && customer.email) {
              const customerEmail = customer.email;
              logger.warn({ customerEmail }, 'FALLBACK: Attempting to find user by customer email');

              const emailProfiles = await db.query<{ id: string }>(
                'select id from profiles where email = $1 limit 1',
                [customerEmail],
              );
              const emailProfile = emailProfiles[0];

              if (emailProfile?.id) {
                logger.warn(
                  { userId: emailProfile.id, email: customerEmail },
                  'FALLBACK: Found user by email (will store customer_id for future)',
                );
                resolvedUserId = emailProfile.id;

                await db
                  .execute('update profiles set stripe_customer_id = $1 where id = $2', [
                    stripeCustomerId,
                    emailProfile.id,
                  ])
                  .catch(() => undefined);
              } else {
                logger.error(
                  { email: customerEmail, stripeSubId },
                  'CRITICAL: No existing profile found for customer - cannot create subscription',
                );
              }
            } else {
              logger.error(
                { stripeCustomerId, stripeSubId },
                'CRITICAL: Customer has no email address',
              );
            }
          } catch (customerError) {
            logger.error(
              { error: customerError, stripeSubId },
              'CRITICAL: Failed to retrieve customer',
            );
          }
        }
      }

      if (resolvedUserId) {
        let replacedUnlinkedEntitlement: { id: string; planTier: string } | null = null;
        if (subscription.metadata?.['replace_unlinked_entitlement'] === 'true') {
          const previousPlanTier = subscription.metadata?.['upgrade_from']?.toLowerCase();
          const existingRows = await db.query<{
            id: string;
            plan_tier: string;
            stripe_subscription_id: string | null;
          }>(
            'select id, plan_tier, stripe_subscription_id from subscriptions where user_id = $1 limit 1',
            [resolvedUserId],
          );
          const existing = existingRows[0];
          const previousBudget = getPlanUsageBudgetCents(previousPlanTier ?? '', 'monthly');
          const nextBudget = getPlanUsageBudgetCents(planTier, 'monthly');
          if (
            existing &&
            previousPlanTier &&
            existing.plan_tier === previousPlanTier &&
            !isStripeSubscriptionId(existing.stripe_subscription_id) &&
            previousBudget > 0 &&
            nextBudget >= previousBudget
          ) {
            replacedUnlinkedEntitlement = {
              id: existing.id,
              planTier: previousPlanTier,
            };
          } else {
            logger.warn(
              {
                subscriptionId: stripeSubId,
                resolvedUserId,
                previousPlanTier,
                storedPlanTier: existing?.plan_tier,
                planTier,
              },
              'Ignoring invalid unlinked-entitlement replacement metadata on subscription',
            );
          }
        }

        let customerEmailForProfile: string | null = null;
        if (stripeCustomerId) {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (typeof customer !== 'string' && !customer.deleted) {
              customerEmailForProfile = customer.email || null;
            }
          } catch {
            // ignore; profile created without email
          }
        }
        await ensureProfileExists(db, resolvedUserId, customerEmailForProfile);

        if (stripeCustomerId) {
          await db
            .execute('update profiles set stripe_customer_id = $1 where id = $2', [
              stripeCustomerId,
              resolvedUserId,
            ])
            .catch((updateError: unknown) => {
              logger.error(
                { error: updateError, userId: resolvedUserId, customerId: stripeCustomerId },
                'Failed to store stripe_customer_id in profiles table',
              );
            });
          logger.info(
            { userId: resolvedUserId, customerId: stripeCustomerId },
            'Stored stripe_customer_id in profiles table',
          );
        }

        const createData = {
          ...updateData,
          user_id: resolvedUserId,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: stripeCustomerId,
        };
        logger.info({ createData }, 'Upserting subscription (will INSERT or UPDATE as needed)');

        const upserted = await db
          .query<{ id: string }>(
            `insert into subscriptions (user_id, status, plan_tier, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_coupon_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             on conflict (user_id) do update set
               status = excluded.status,
               plan_tier = excluded.plan_tier,
               stripe_customer_id = excluded.stripe_customer_id,
               stripe_subscription_id = excluded.stripe_subscription_id,
               stripe_price_id = excluded.stripe_price_id,
               stripe_coupon_id = excluded.stripe_coupon_id,
               current_period_start = excluded.current_period_start,
               current_period_end = excluded.current_period_end,
               cancel_at_period_end = excluded.cancel_at_period_end,
               canceled_at = excluded.canceled_at
             returning id`,
            [
              createData.user_id,
              createData.status,
              createData.plan_tier,
              createData.stripe_customer_id,
              createData.stripe_subscription_id,
              createData.stripe_price_id,
              createData.stripe_coupon_id,
              createData.current_period_start,
              createData.current_period_end,
              createData.cancel_at_period_end,
              createData.canceled_at,
            ],
          )
          .catch((error: unknown) => {
            logger.error({ error, createData }, 'CRITICAL: Failed to upsert subscription');
            throw error;
          });

        const upsertedRow = upserted[0];
        if (upsertedRow) {
          logger.info(
            { subscriptionId: upsertedRow.id, userId: resolvedUserId },
            'Successfully upserted subscription',
          );
        }

        if (
          upsertedRow &&
          updateData.current_period_start &&
          updateData.current_period_end &&
          resolvedUserId
        ) {
          const pStart = updateData.current_period_start;
          const pEnd = updateData.current_period_end;
          try {
            if (replacedUnlinkedEntitlement && replacedUnlinkedEntitlement.id === upsertedRow.id) {
              await SubscriptionService.carryCreditsForUpgradePeriod(
                resolvedUserId,
                upsertedRow.id,
                replacedUnlinkedEntitlement.planTier,
                planTier,
                new Date(pStart),
                new Date(pEnd),
                db,
              );
            } else {
              await SubscriptionService.allocateCreditsForPeriod(
                resolvedUserId,
                upsertedRow.id,
                planTier,
                new Date(pStart),
                new Date(pEnd),
                { db },
              );
            }
            logger.info(
              {
                userId: resolvedUserId,
                subscriptionId: upsertedRow.id,
                planTier,
                carriedUsage: !!replacedUnlinkedEntitlement,
              },
              replacedUnlinkedEntitlement
                ? 'Usage carried into paid replacement subscription'
                : 'Credits allocated for new subscription',
            );
          } catch (creditError) {
            logger.error(
              { error: creditError, userId: resolvedUserId, subscriptionId: upsertedRow.id },
              'Failed to allocate or carry credits for new subscription',
            );
            throw creditError;
          }
        }
      } else {
        logger.error(
          { stripeSubId, stripeCustomerId },
          'CRITICAL: Cannot create subscription - no user_id found via metadata, customer_id, or email',
        );
        throw new Error(`Cannot create subscription ${stripeSubId}: no user_id found`);
      }
    }
  } else if (stripeCustomerId) {
    logger.warn(
      { stripeCustomerId },
      'No stripe_subscription_id provided, attempting update by customer_id',
    );
    await db
      .execute(
        `update subscriptions set
          status = $1,
          stripe_price_id = $2,
          current_period_start = $3,
          current_period_end = $4,
          cancel_at_period_end = $5,
          canceled_at = $6,
          stripe_coupon_id = $7,
          plan_tier = $8
        where stripe_customer_id = $9`,
        [
          updateData.status,
          updateData.stripe_price_id,
          updateData.current_period_start,
          updateData.current_period_end,
          updateData.cancel_at_period_end,
          updateData.canceled_at,
          updateData.stripe_coupon_id,
          updateData.plan_tier,
          stripeCustomerId,
        ],
      )
      .catch((error: unknown) => {
        logger.error({ error, stripeCustomerId }, 'Failed to update subscription by customer_id');
        throw error;
      });
  } else {
    logger.error('CRITICAL: No stripe_subscription_id or stripe_customer_id provided');
    throw new Error('Cannot update subscription: missing identifiers');
  }
}

export { CreditService };
