import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';

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
import { getUsageBudgetCentsFromPriceCents } from '@agiworkforce/types';

export function getUsageBudgetOverrideCentsFromStripePrice(
  price: Pick<Stripe.Price, 'unit_amount'> | null | undefined,
): number | undefined {
  const unitAmountCents = price?.unit_amount;
  if (typeof unitAmountCents !== 'number' || unitAmountCents < 0) {
    return undefined;
  }
  return getUsageBudgetCentsFromPriceCents(unitAmountCents);
}

export async function ensureProfileExists(
  supabaseAdmin: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<void> {
  const { data: existingProfile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    logger.error({ error: fetchError, userId }, 'Error checking for existing profile');
    throw fetchError;
  }

  if (!existingProfile) {
    logger.info({ userId, email }, 'Creating missing profile for user in webhook');
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, email: email || null } as Record<string, unknown>);

    if (insertError) {
      if (insertError.code !== '23505') {
        logger.error({ error: insertError, userId }, 'Failed to create profile');
        throw insertError;
      }
      logger.info({ userId }, 'Profile already exists (concurrent creation)');
    } else {
      logger.info({ userId, email }, 'Profile created successfully in webhook');
    }
  }
}

export async function handleCreditTopUp(
  supabaseAdmin: SupabaseClient,
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
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, current_period_start, current_period_end')
      .eq('user_id', userId)
      .single();

    if (!subscription) {
      logger.error({ userId }, 'No subscription found for credit top-up user');
      throw new Error('No subscription found for user');
    }

    const { data: creditAccount } = await supabaseAdmin
      .from('token_credits')
      .select('id')
      .eq('user_id', userId)
      .eq('subscription_id', subscription.id)
      .single();

    if (!creditAccount) {
      logger.error({ userId, subscriptionId: subscription.id }, 'No credit account found for user');
      throw new Error('No credit account found for user');
    }

    const { data: balanceBefore } = await supabaseAdmin
      .from('token_credits')
      .select('credits_remaining_cents')
      .eq('id', creditAccount.id)
      .single();

    const previousBalance = balanceBefore?.credits_remaining_cents ?? 0;

    const { data: rpcResult, error: creditError } = await supabaseAdmin.rpc('add_credits', {
      p_user_id: userId,
      p_account_id: creditAccount.id,
      p_amount_cents: creditAmountCents,
      p_description: 'Credit top-up purchase',
      p_transaction_type: 'purchase',
    });

    if (creditError) {
      logger.error(
        { error: creditError, userId, creditAmountCents, creditAccountId: creditAccount.id },
        'Failed to add credits from top-up',
      );
      throw creditError;
    }

    const { data: balanceAfter } = await supabaseAdmin
      .from('token_credits')
      .select('credits_remaining_cents')
      .eq('id', creditAccount.id)
      .single();

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
          rpcResult,
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
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<NextResponse | void> {
  logger.info({ sessionId: session.id }, 'Processing checkout session');

  let supabaseUserId =
    session.metadata?.['supabase_user_id'] ||
    session.metadata?.['userId'] ||
    session.client_reference_id;

  if (!supabaseUserId && session.customer) {
    try {
      const stripeCustomerId = session.customer as string;

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', stripeCustomerId)
        .limit(1)
        .maybeSingle();

      if (!profileError && profile?.id) {
        supabaseUserId = profile.id;
        logger.info(
          { sessionId: session.id, customerId: stripeCustomerId, userId: supabaseUserId },
          'Resolved user_id from stripe_customer_id in profiles table (BEST PRACTICE)',
        );
      } else {
        logger.warn(
          { sessionId: session.id, customerId: stripeCustomerId },
          'SECURITY WARNING: stripe_customer_id not found in profiles - attempting email fallback (legacy only)',
        );

        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (typeof customer !== 'string' && !customer.deleted && customer.email) {
          const { data: matchingUsers, error: authError } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('email', customer.email.toLowerCase())
            .limit(1);

          if (!authError && matchingUsers && matchingUsers.length > 0) {
            const matchingUser = matchingUsers[0];

            if (matchingUser) {
              const { data: existingStripeCustomers } = await supabaseAdmin
                .from('profiles')
                .select('id, email, stripe_customer_id')
                .eq('email', customer.email)
                .limit(2);

              if (existingStripeCustomers && existingStripeCustomers.length > 1) {
                logger.error(
                  {
                    sessionId: session.id,
                    email: customer.email,
                    count: existingStripeCustomers.length,
                  },
                  'SECURITY: Multiple profiles found with same email - cannot safely assign subscription',
                );
                throw new Error('Email reuse detected - cannot safely assign subscription');
              }

              supabaseUserId = matchingUser.id;
              logger.warn(
                { sessionId: session.id, email: customer.email, userId: supabaseUserId },
                'FALLBACK: Resolved user_id from email - storing customer_id for future',
              );

              await supabaseAdmin
                .from('profiles')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', supabaseUserId);

              logger.info(
                { userId: supabaseUserId, customerId: stripeCustomerId },
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

  if (!supabaseUserId) {
    logger.error(
      {
        sessionId: session.id,
        customerId: session.customer,
        hasMetadata: !!session.metadata,
        hasClientRef: !!session.client_reference_id,
      },
      'CRITICAL: No supabase_user_id found - cannot create subscription',
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

  await ensureProfileExists(supabaseAdmin, supabaseUserId, customerEmail);

  const stripeCustomerId = session.customer as string | null;
  if (stripeCustomerId) {
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', supabaseUserId);

    if (updateError) {
      logger.error(
        { error: updateError, userId: supabaseUserId, customerId: stripeCustomerId },
        'Failed to store stripe_customer_id in profiles table',
      );
    } else {
      logger.info(
        { userId: supabaseUserId, customerId: stripeCustomerId },
        'Stored stripe_customer_id in profiles table (enables proper customer lookup)',
      );
    }
  }

  if (customerEmail) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', supabaseUserId)
      .single();

    if (profile?.email && profile.email !== customerEmail) {
      logger.warn(
        {
          supabaseUserId,
          profileEmail: profile.email,
          stripeCustomerEmail: customerEmail,
          sessionId: session.id,
        },
        'WARNING: Stripe customer email does not match Supabase profile email - subscription will be created for the logged-in user but emails differ',
      );
    }
  }

  const priceId = session.line_items?.data?.[0]?.price?.id;

  if (priceId && !isPriceIdRegistered(priceId)) {
    logger.warn(
      {
        sessionId: session.id,
        priceId,
        registeredPriceIds: Object.keys(getTierMapping()),
      },
      'Checkout session contained unrecognised price ID - skipping subscription upsert. ' +
        'This may happen legitimately during price migration; verify STRIPE_PRICE_* env vars if unexpected.',
    );
    return;
  }

  const planTier = resolvePlanTier(session.metadata as Record<string, string> | null, priceId);

  if (!planTier || !isValidPlanTier(planTier)) {
    logger.error(
      {
        sessionId: session.id,
        priceId,
        hasMetadata: !!session.metadata?.['plan_tier'],
        inferredFromPrice: priceId ? 'attempted' : 'no-price-id',
        registeredPriceIds: Object.keys(getTierMapping()),
        envVarHint:
          'Ensure STRIPE_PRICE_HOBBY_MONTHLY, STRIPE_PRICE_PRO_MONTHLY, etc. are set in Vercel environment variables',
      },
      'CRITICAL: Cannot determine valid plan_tier for subscription - check if Stripe price IDs are registered in environment variables',
    );
    return NextResponse.json(
      {
        error:
          'Cannot determine subscription plan tier. Check that STRIPE_PRICE_* environment variables are configured.',
      },
      { status: 500 },
    );
  }

  const stripeSubId = session.subscription as string | null;

  logger.debug(
    { sessionId: session.id, supabaseUserId, planTier, stripeCustomerId, stripeSubId },
    'Session details',
  );

  let stripePriceId: string | null = null;
  let overrideCreditsCents: number | undefined;
  if (session.line_items?.data && session.line_items.data.length > 0) {
    stripePriceId = session.line_items.data[0]?.price?.id || null;
    overrideCreditsCents = getUsageBudgetOverrideCentsFromStripePrice(
      session.line_items.data[0]?.price,
    );
  } else if (session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      if (expandedSession.line_items?.data && expandedSession.line_items.data.length > 0) {
        stripePriceId = expandedSession.line_items.data[0]?.price?.id || null;
        overrideCreditsCents = getUsageBudgetOverrideCentsFromStripePrice(
          expandedSession.line_items.data[0]?.price,
        );
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
      overrideCreditsCents =
        overrideCreditsCents ?? getUsageBudgetOverrideCentsFromStripePrice(firstItem?.price);

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
        overrideCreditsCents =
          overrideCreditsCents ?? getUsageBudgetOverrideCentsFromStripePrice(retryItem.price);
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
      { sessionId: session.id, subscriptionId: stripeSubId, userId: supabaseUserId },
      'stripe_price_id is null for session. Attempting final retrieval...',
    );
    try {
      const finalSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price', 'items.data.plan'],
      });
      const finalItem = finalSubscription.items.data[0];
      if (finalItem) {
        stripePriceId = finalItem.price?.id || finalItem.plan?.id || null;
        overrideCreditsCents =
          overrideCreditsCents ?? getUsageBudgetOverrideCentsFromStripePrice(finalItem.price);
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
      { sessionId: session.id, subscriptionId: stripeSubId, userId: supabaseUserId },
      'CRITICAL: stripe_price_id is still null after all attempts',
    );
  }

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
    user_id: supabaseUserId,
    status: status,
    plan_tier: planTier,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubId,
    stripe_price_id: stripePriceId,
    stripe_coupon_id: stripeCouponId,
    current_period_start: currentPeriodStart?.toISOString() || null,
    current_period_end: currentPeriodEnd?.toISOString() || null,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt?.toISOString() || null,
  };

  logger.info({ subscriptionData: subData }, 'Upserting subscription');

  const { error, data } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subData, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    logger.error(
      {
        error,
        subscriptionData: subData,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        errorMessage: error.message,
      },
      'CRITICAL: Failed to upsert subscription - subscription will not be created',
    );
    throw error;
  }

  if (data && currentPeriodStart && currentPeriodEnd) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
      try {
        await SubscriptionService.allocateCreditsForPeriod(
          supabaseUserId,
          data.id,
          planTier,
          new Date(currentPeriodStart),
          new Date(currentPeriodEnd),
          { stripePriceId: stripePriceId ?? undefined, overrideCreditsCents },
        );
        logger.info(
          { userId: supabaseUserId, subscriptionId: data.id, planTier, attempt },
          'Credits allocated for new subscription',
        );
        lastError = null;
        break;
      } catch (creditError) {
        lastError = creditError;
        logger.warn(
          {
            error: creditError,
            userId: supabaseUserId,
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
        { error: lastError, userId: supabaseUserId, subscriptionId: data.id, planTier },
        'CRITICAL: Failed to allocate credits after all retries - user may need manual sync',
      );
    }
  }
}

export async function updateSubscriptionFromStripeSubscription(
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  logger.info({ subscriptionId: subscription.id }, 'Processing subscription update');

  const stripeSubId = subscription.id;
  const stripeCustomerId = subscription.customer as string | null;

  let stripePriceId: string | null = null;
  let overrideCreditsCents: number | undefined;
  const firstSubItem = subscription.items.data[0];
  if (firstSubItem) {
    stripePriceId = firstSubItem.price.id;
    overrideCreditsCents = getUsageBudgetOverrideCentsFromStripePrice(firstSubItem.price);
  }

  if (stripePriceId && !isPriceIdRegistered(stripePriceId)) {
    logger.warn(
      {
        subscriptionId: subscription.id,
        priceId: stripePriceId,
        registeredPriceIds: Object.keys(getTierMapping()),
      },
      'Webhook contained unrecognised price ID - skipping subscription update. ' +
        'This may happen legitimately during price migration; verify STRIPE_PRICE_* env vars if unexpected.',
    );
    return;
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
          'Ensure STRIPE_PRICE_HOBBY_MONTHLY, STRIPE_PRICE_PRO_MONTHLY, etc. are set in Vercel environment variables',
      },
      'CRITICAL: Cannot determine valid plan_tier for subscription update - check if Stripe price IDs are registered in environment variables',
    );
    logger.warn(
      { subscriptionId: subscription.id },
      'Skipping subscription update due to unmapped price ID. Existing subscription data preserved.',
    );
    return;
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

  const updateData: {
    status: string;
    stripe_price_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    stripe_coupon_id?: string | null;
    plan_tier?: string;
  } = {
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

  let error;
  let supabaseUserId: string | null = null;

  if (stripeSubId) {
    const { data: existingSub, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();

    if (fetchError) {
      logger.error({ error: fetchError, stripeSubId }, 'Failed to check existing subscription');
    }

    if (existingSub) {
      supabaseUserId = existingSub.user_id;

      const { data: currentSub } = await supabaseAdmin
        .from('subscriptions')
        .select('current_period_start')
        .eq('stripe_subscription_id', stripeSubId)
        .single();

      const isNewPeriod = currentSub?.current_period_start !== updateData.current_period_start;

      const res = await supabaseAdmin
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', stripeSubId)
        .select()
        .single();
      error = res.error;

      if (
        !error &&
        res.data &&
        updateData.current_period_start &&
        updateData.current_period_end &&
        supabaseUserId
      ) {
        const pStart = updateData.current_period_start;
        const pEnd = updateData.current_period_end;
        try {
          if (isNewPeriod) {
            await SubscriptionService.resetCreditsForNewPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(pStart),
              new Date(pEnd),
              { stripePriceId: stripePriceId ?? undefined, overrideCreditsCents },
            );
            logger.info(
              { userId: supabaseUserId, subscriptionId: res.data.id, planTier },
              'Credits reset for new billing period',
            );
          } else {
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(pStart),
              new Date(pEnd),
              { stripePriceId: stripePriceId ?? undefined, overrideCreditsCents },
            );
            logger.info(
              { userId: supabaseUserId, subscriptionId: res.data.id, planTier },
              'Credits allocated for subscription update',
            );
          }
        } catch (creditError) {
          logger.error(
            { error: creditError, userId: supabaseUserId, subscriptionId: res.data.id },
            'Failed to allocate/reset credits for subscription',
          );
        }
      }
    } else {
      const metadataUserId = subscription.metadata?.['supabase_user_id'];
      if (metadataUserId) {
        logger.info(
          { stripeSubId, metadataUserId },
          'Subscription not found. Will create via metadata user_id',
        );
        supabaseUserId = metadataUserId;
      } else if (stripeCustomerId) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', stripeCustomerId)
          .limit(1)
          .maybeSingle();

        if (!profileError && profile?.id) {
          logger.info(
            { userId: profile.id, customerId: stripeCustomerId },
            'Found user by stripe_customer_id in profiles table (BEST PRACTICE)',
          );
          supabaseUserId = profile.id;
        } else {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (typeof customer !== 'string' && !customer.deleted && customer.email) {
              const customerEmail = customer.email;
              logger.warn({ customerEmail }, 'FALLBACK: Attempting to find user by customer email');

              const { data: emailProfile, error: emailError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('email', customerEmail)
                .limit(1)
                .maybeSingle();

              if (!emailError && emailProfile?.id) {
                logger.warn(
                  { userId: emailProfile.id, email: customerEmail },
                  'FALLBACK: Found user by email (will store customer_id for future)',
                );
                supabaseUserId = emailProfile.id;

                await supabaseAdmin
                  .from('profiles')
                  .update({ stripe_customer_id: stripeCustomerId })
                  .eq('id', emailProfile.id);
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

      if (supabaseUserId) {
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
        await ensureProfileExists(supabaseAdmin, supabaseUserId, customerEmailForProfile);

        if (stripeCustomerId) {
          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ stripe_customer_id: stripeCustomerId })
            .eq('id', supabaseUserId);

          if (updateError) {
            logger.error(
              { error: updateError, userId: supabaseUserId, customerId: stripeCustomerId },
              'Failed to store stripe_customer_id in profiles table',
            );
          } else {
            logger.info(
              { userId: supabaseUserId, customerId: stripeCustomerId },
              'Stored stripe_customer_id in profiles table',
            );
          }
        }

        const createData = {
          user_id: supabaseUserId,
          ...updateData,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: stripeCustomerId,
        };
        logger.info({ createData }, 'Upserting subscription (will INSERT or UPDATE as needed)');

        const res = await supabaseAdmin
          .from('subscriptions')
          .upsert(createData, { onConflict: 'user_id', ignoreDuplicates: false })
          .select()
          .single();
        error = res.error;

        if (error) {
          logger.error(
            { error, createData, errorCode: error.code },
            'CRITICAL: Failed to upsert subscription',
          );
        } else {
          logger.info(
            { subscriptionId: res.data?.id, userId: supabaseUserId },
            'Successfully upserted subscription',
          );
        }

        if (
          !error &&
          res.data &&
          updateData.current_period_start &&
          updateData.current_period_end &&
          supabaseUserId
        ) {
          const pStart = updateData.current_period_start;
          const pEnd = updateData.current_period_end;
          try {
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(pStart),
              new Date(pEnd),
              { stripePriceId: stripePriceId ?? undefined, overrideCreditsCents },
            );
            logger.info(
              { userId: supabaseUserId, subscriptionId: res.data.id, planTier },
              'Credits allocated for new subscription',
            );
          } catch (creditError) {
            logger.error(
              { error: creditError, userId: supabaseUserId, subscriptionId: res.data.id },
              'Failed to allocate credits for new subscription',
            );
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
    const res = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);
    error = res.error;

    if (error) {
      logger.error({ error, stripeCustomerId }, 'Failed to update subscription by customer_id');
    }
  } else {
    logger.error('CRITICAL: No stripe_subscription_id or stripe_customer_id provided');
    throw new Error('Cannot update subscription: missing identifiers');
  }

  if (error) {
    logger.error({ error }, 'Failed to update subscription');
    throw error;
  }
}

export { CreditService };
