import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// WEB-4 audit fix (2026-05-03): pin to Node runtime so the Stripe SDK's
// HMAC verification (stripe.webhooks.constructEvent) has access to Node
// crypto. Edge runtime would silently fail signature checks. Also marks
// this route as dynamic so Next.js doesn't try to pre-render or cache it.
// Pairs with the proxy.ts matcher exclusion that keeps middleware off this
// route entirely.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import {
  resolvePlanTier,
  isValidPlanTier,
  getTierMapping,
  isPriceIdRegistered,
} from '@/lib/price-tier-mapping';
import { logInvalidSignature } from '@/lib/security-audit';
import { WEBHOOK_MAX_RETRIES, WEBHOOK_RETRY_BASE_DELAY_MS } from '@/lib/constants';
// AUDIT-P3: Use shared Stripe type helpers for type safety
import { getSubscriptionPeriod, getSubscriptionCouponId } from '@/lib/stripe-types';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { getUsageBudgetCentsFromPriceCents } from '@agiworkforce/types';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'];
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'];
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  logger.error(
    'Stripe webhook is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel environment variables.',
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error(
    'Supabase service role environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables. Webhook cannot update subscriptions.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    })
  : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function getUsageBudgetOverrideCentsFromStripePrice(
  price: Pick<Stripe.Price, 'unit_amount'> | null | undefined,
): number | undefined {
  const unitAmountCents = price?.unit_amount;
  if (typeof unitAmountCents !== 'number' || unitAmountCents < 0) {
    return undefined;
  }
  return getUsageBudgetCentsFromPriceCents(unitAmountCents);
}

/**
 * Ensure a profile exists for the user (required for subscriptions FK constraint)
 */
async function ensureProfileExists(userId: string, email?: string | null): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not initialized');
  }

  // Check if profile exists
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
    // Profile doesn't exist - create it
    logger.info({ userId, email }, 'Creating missing profile for user in webhook');
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, email: email || null } as Record<string, unknown>);

    if (insertError) {
      // Ignore duplicate key errors (profile might have been created concurrently)
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

/**
 * Handle credit top-up purchases (one-time payments for additional credits)
 */
async function handleCreditTopUp(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin) {
    logger.error('handleCreditTopUp: missing Supabase admin client');
    throw new Error('Missing Supabase admin client');
  }

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
  // Prevents granting credits that don't match the actual payment
  if (stripe && session.payment_intent) {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent.id;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      logger.error(
        {
          sessionId: session.id,
          paymentIntentId,
          status: paymentIntent.status,
        },
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
      {
        sessionId: session.id,
        userId,
        paymentIntentId,
        amountVerified: creditAmountCents,
      },
      'Credit top-up: PaymentIntent amount verified successfully',
    );
  } else if (!session.payment_intent) {
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
    // Get current subscription to determine the period
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, current_period_start, current_period_end')
      .eq('user_id', userId)
      .single();

    if (!subscription) {
      logger.error({ userId }, 'No subscription found for credit top-up user');
      throw new Error('No subscription found for user');
    }

    // Get the user's credit account (token_credits) for this subscription period
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

    // Get balance before adding credits for verification
    const { data: balanceBefore } = await supabaseAdmin
      .from('token_credits')
      .select('credits_remaining_cents')
      .eq('id', creditAccount.id)
      .single();

    const previousBalance = balanceBefore?.credits_remaining_cents ?? 0;

    // Add credits to the user's account using the correct credit account ID
    const { data: rpcResult, error: creditError } = await supabaseAdmin.rpc('add_credits', {
      p_user_id: userId,
      p_account_id: creditAccount.id, // Use credit account ID, not subscription ID
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

    // Verify credits were actually added by checking the new balance
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
      // Don't throw - the transaction may have partially succeeded
      // But log error for investigation
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

async function upsertSubscriptionFromSession(
  session: Stripe.Checkout.Session,
): Promise<NextResponse | void> {
  if (!supabaseAdmin || !stripe) {
    logger.error('upsertSubscriptionFromSession: missing dependencies');
    throw new Error('Missing dependencies');
  }

  logger.info({ sessionId: session.id }, 'Processing checkout session');

  let supabaseUserId =
    session.metadata?.['supabase_user_id'] ||
    session.metadata?.['userId'] || // Legacy key - kept for sessions created before cleanup
    session.client_reference_id;

  // If no user ID in metadata, try to find user by Stripe customer ID (BEST PRACTICE)
  if (!supabaseUserId && session.customer) {
    try {
      const stripeCustomerId = session.customer as string;

      // First, try to find user by customer ID in profiles table
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
        // SECURITY: Email fallback is risky and only for legacy data migration
        // Do NOT use email fallback for new integrations
        logger.warn(
          { sessionId: session.id, customerId: stripeCustomerId },
          'SECURITY WARNING: stripe_customer_id not found in profiles - attempting email fallback (legacy only)',
        );

        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (typeof customer !== 'string' && !customer.deleted && customer.email) {
          // Additional safety: Look up user by email via profiles table (O(1) indexed query).
          // Replaces the previous O(N) auth.admin.listUsers() scan.
          const { data: matchingUsers, error: authError } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('email', customer.email.toLowerCase())
            .limit(1);

          if (!authError && matchingUsers && matchingUsers.length > 0) {
            const matchingUser = matchingUsers[0];

            if (matchingUser) {
              // Verify this email isn't being reused by checking for existing subscriptions
              const { data: existingStripeCustomers } = await supabaseAdmin
                .from('profiles')
                .select('id, email, stripe_customer_id')
                .eq('email', customer.email)
                .limit(2); // Only need to detect duplicates; > 1 means email reuse

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

              // CRITICAL: Immediately store customer_id to prevent future fallbacks
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

  // Get customer email for profile creation
  let customerEmail: string | null = null;
  if (session.customer && stripe) {
    try {
      const customer = await stripe.customers.retrieve(session.customer as string);
      if (typeof customer !== 'string' && !customer.deleted) {
        customerEmail = customer.email || null;
      }
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Could not fetch customer email');
    }
  }

  // Ensure profile exists before creating subscription (FK constraint)
  await ensureProfileExists(supabaseUserId, customerEmail);

  // Store Stripe customer_id in profiles table (CRITICAL for proper customer-to-user mapping)
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

  // Warn about email mismatches (common issue causing subscription assignment problems)
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

  // Get plan_tier from metadata or price ID using strict mapping
  const priceId = session.line_items?.data?.[0]?.price?.id;

  // SECURITY: Validate that the price ID from the checkout session is registered.
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
    // Return 500 for config errors - allows Stripe to retry the webhook
    // Once the environment variables are properly configured, the retry will succeed
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
    {
      sessionId: session.id,
      supabaseUserId,
      planTier,
      stripeCustomerId,
      stripeSubId,
    },
    'Session details',
  );

  let stripePriceId: string | null = null;
  let overrideCreditsCents: number | undefined;
  if (session.line_items?.data && session.line_items.data.length > 0) {
    stripePriceId = session.line_items.data[0]?.price?.id || null;
    overrideCreditsCents = getUsageBudgetOverrideCentsFromStripePrice(
      session.line_items.data[0]?.price,
    );
  } else if (stripe && session.id) {
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

  if (stripeSubId && stripe) {
    try {
      const subscription = await stripe.subscriptions.retrieve(stripeSubId);
      status = subscription.status;

      // AUDIT-P3: Use shared type-safe helper for period extraction (Stripe v20+ flexible billing)
      const period = getSubscriptionPeriod(subscription);
      if (period) {
        currentPeriodStart = new Date(period.start * 1000);
        currentPeriodEnd = new Date(period.end * 1000);
      }

      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

      // Ensure we always get price_id from subscription if not already set
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

      // AUDIT-P3: Use shared type-safe helper for coupon ID (v20 API: discount -> discounts)
      stripeCouponId = getSubscriptionCouponId(subscription);
    } catch (error) {
      logger.error(
        { error, subscriptionId: stripeSubId },
        'Failed to retrieve subscription details',
      );
    }
  }

  // Final fallback: if we still don't have price_id but have subscription_id, try one more time
  if (!stripePriceId && stripeSubId && stripe) {
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

  // Log warning if price_id is still missing and attempt one final retrieval
  if (!stripePriceId && stripeSubId && stripe) {
    logger.warn(
      { sessionId: session.id, subscriptionId: stripeSubId, userId: supabaseUserId },
      'stripe_price_id is null for session. Attempting final retrieval...',
    );
    try {
      // Final attempt: retrieve subscription with full expansion
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

  if (!stripeCouponId && stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['total_details.breakdown'],
      });

      if (expandedSession.total_details?.breakdown?.discounts) {
        const discountItem = expandedSession.total_details.breakdown.discounts[0];
        // Access coupon ID through the discount object
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
    .upsert(subData, {
      onConflict: 'user_id',
    })
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

  // Allocate credits for the subscription period with retry
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
          {
            stripePriceId: stripePriceId ?? undefined,
            overrideCreditsCents,
          },
        );
        logger.info(
          {
            userId: supabaseUserId,
            subscriptionId: data.id,
            planTier,
            attempt,
          },
          'Credits allocated for new subscription',
        );
        lastError = null;
        break; // Success, exit loop
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

        // Wait before retry (exponential backoff)
        if (attempt < WEBHOOK_MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, WEBHOOK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)),
          );
        }
      }
    }

    if (lastError) {
      // All retries failed - log critical error but don't fail webhook
      // The sync-subscription endpoint can recover credits later
      logger.error(
        {
          error: lastError,
          userId: supabaseUserId,
          subscriptionId: data.id,
          planTier,
        },
        'CRITICAL: Failed to allocate credits after all retries - user may need manual sync',
      );
    }
  }
}

async function updateSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  if (!supabaseAdmin || !stripe) {
    logger.error('updateSubscriptionFromStripeSubscription: missing dependencies');
    throw new Error('Missing dependencies');
  }

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

  // SECURITY: Validate that the price ID is one of our configured prices.
  // A crafted webhook with an unrecognised price could manipulate tiers.
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

  // Use centralized price-tier-mapping for consistent plan resolution
  const resolvedTier = resolvePlanTier(
    subscription.metadata as Record<string, string> | null,
    stripePriceId,
  );

  // Validate the resolved tier
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
    // For updates, if we can't resolve the tier, return early without updating
    // This prevents losing existing subscription data
    logger.warn(
      { subscriptionId: subscription.id },
      'Skipping subscription update due to unmapped price ID. Existing subscription data preserved.',
    );
    return;
  }

  if (!subscription.metadata?.['plan_tier']) {
    logger.warn(
      {
        subscriptionId: subscription.id,
        inferredPlan: planTier,
        priceId: stripePriceId,
      },
      'plan_tier missing from subscription metadata. Inferred from price_id using centralized mapping.',
    );
  }

  // AUDIT-P3: Use shared type-safe helper for period extraction (Stripe SDK v20 flexible billing)
  const period = getSubscriptionPeriod(subscription);
  const periodStart = period?.start;
  const periodEnd = period?.end;

  // AUDIT-P3: Use shared type-safe helper for coupon ID (v20 API: discount -> discounts)
  const stripeCouponId = getSubscriptionCouponId(subscription);

  // Force update plan tier if we found one
  const updateData: {
    status: string;
    stripe_price_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    stripe_coupon_id?: string | null;
    plan_tier?: string; // Always include plan_tier to fix "Free" issue
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

  // First, try to find user_id for this subscription
  if (stripeSubId) {
    // Check if subscription already exists
    const { data: existingSub, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();

    if (fetchError) {
      logger.error({ error: fetchError, stripeSubId }, 'Failed to check existing subscription');
    }

    if (existingSub) {
      // Subscription exists - normal update path
      supabaseUserId = existingSub.user_id;

      // Fetch current subscription to check period
      const { data: currentSub } = await supabaseAdmin
        .from('subscriptions')
        .select('current_period_start')
        .eq('stripe_subscription_id', stripeSubId)
        .single();

      // Check if this is a new billing period (period_start changed)
      const isNewPeriod = currentSub?.current_period_start !== updateData.current_period_start;

      const res = await supabaseAdmin
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', stripeSubId)
        .select()
        .single();
      error = res.error;

      // Allocate or reset credits if subscription updated successfully
      if (
        !error &&
        res.data &&
        updateData.current_period_start &&
        updateData.current_period_end &&
        supabaseUserId
      ) {
        const periodStart = updateData.current_period_start;
        const periodEnd = updateData.current_period_end;
        try {
          if (isNewPeriod) {
            // New billing period - reset credits
            await SubscriptionService.resetCreditsForNewPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
              {
                stripePriceId: stripePriceId ?? undefined,
                overrideCreditsCents,
              },
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits reset for new billing period',
            );
          } else {
            // Same period - ensure credits are allocated
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
              {
                stripePriceId: stripePriceId ?? undefined,
                overrideCreditsCents,
              },
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits allocated for subscription update',
            );
          }
        } catch (creditError) {
          // Log but don't fail the webhook if credit allocation fails
          logger.error(
            {
              error: creditError,
              userId: supabaseUserId,
              subscriptionId: res.data.id,
            },
            'Failed to allocate/reset credits for subscription',
          );
        }
      }
    } else {
      // Subscription doesn't exist - need to find user_id and create it
      // First, try metadata (most reliable)
      const metadataUserId = subscription.metadata?.['supabase_user_id'];
      if (metadataUserId) {
        logger.info(
          { stripeSubId, metadataUserId },
          'Subscription not found. Will create via metadata user_id',
        );
        supabaseUserId = metadataUserId;
      } else if (stripeCustomerId) {
        // Second, try to find by customer ID (BEST PRACTICE)
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
          // Last resort: Try to find user by customer email (for legacy data only)
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

                // Store customer_id for future lookups
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
        // Ensure profile exists before creating subscription (FK constraint)
        let customerEmailForProfile: string | null = null;
        if (stripeCustomerId) {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (typeof customer !== 'string' && !customer.deleted) {
              customerEmailForProfile = customer.email || null;
            }
          } catch {
            // Ignore - we'll create profile without email
          }
        }
        await ensureProfileExists(supabaseUserId, customerEmailForProfile);

        // Store Stripe customer_id in profiles table (CRITICAL for proper customer-to-user mapping)
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

        // CRITICAL FIX: Use upsert with proper conflict resolution
        // This handles both INSERT (new subscription) and UPDATE (existing subscription)
        const createData = {
          user_id: supabaseUserId,
          ...updateData,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: stripeCustomerId,
        };
        logger.info({ createData }, 'Upserting subscription (will INSERT or UPDATE as needed)');

        // Use upsert to handle both creation and update cases
        const res = await supabaseAdmin
          .from('subscriptions')
          .upsert(createData, {
            onConflict: 'user_id',
            ignoreDuplicates: false, // Always update if exists
          })
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

        // Allocate credits for new subscription
        if (
          !error &&
          res.data &&
          updateData.current_period_start &&
          updateData.current_period_end &&
          supabaseUserId
        ) {
          const periodStart = updateData.current_period_start;
          const periodEnd = updateData.current_period_end;
          try {
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
              {
                stripePriceId: stripePriceId ?? undefined,
                overrideCreditsCents,
              },
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits allocated for new subscription',
            );
          } catch (creditError) {
            logger.error(
              {
                error: creditError,
                userId: supabaseUserId,
                subscriptionId: res.data.id,
              },
              'Failed to allocate credits for new subscription',
            );
          }
        }
      } else {
        // CRITICAL: Cannot create subscription without user_id
        logger.error(
          { stripeSubId, stripeCustomerId },
          'CRITICAL: Cannot create subscription - no user_id found via metadata, customer_id, or email',
        );
        throw new Error(`Cannot create subscription ${stripeSubId}: no user_id found`);
      }
    }
  } else if (stripeCustomerId) {
    // No subscription ID - try to update by customer ID (edge case)
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

export async function POST(request: NextRequest) {
  // H5: Rate limit webhook endpoint to prevent abuse (generous limit for legitimate Stripe traffic)
  const rateLimitResponse = await withRateLimit(request, 'stripe-webhook');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin not configured');
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.error('Missing Stripe signature');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // SEV-WEB-HIGH-5 fix: shorten the replay window from the SDK default of
    // 300 s to 60 s. Stripe recommends 60 s; the longer window only matters
    // when retries take more than a minute, and we have idempotency on top.
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET, 60);
    logger.info({ eventType: event.type, eventId: event.id }, 'Webhook verified');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Stripe webhook signature verification failed',
    );
    // Log security event for invalid webhook signature
    await logInvalidSignature(request, 'stripe_webhook');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Atomic idempotency check using database function
  // This prevents race conditions by using INSERT ... ON CONFLICT
  const { data: shouldProcess, error: idempotencyError } = await supabaseAdmin.rpc(
    'process_stripe_event_idempotent',
    { p_event_id: event.id },
  );

  if (idempotencyError) {
    logger.error(
      { eventId: event.id, error: idempotencyError },
      'Failed to check event idempotency',
    );
    return NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 });
  }

  if (!shouldProcess) {
    logger.warn({ eventId: event.id }, 'Stripe event already processed (idempotent skip)');
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Check if this is a credit top-up or a subscription
        if (session.metadata?.['type'] === 'credit_topup') {
          logger.info({ sessionId: session.id }, 'Processing credit top-up checkout');
          await handleCreditTopUp(session);
        } else {
          // Regular subscription checkout
          await upsertSubscriptionFromSession(session);
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info({ sessionId: session.id }, 'Async payment succeeded');
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubId = session.subscription as string | null;
        const stripeCustomerId = session.customer as string | null;
        logger.warn({ sessionId: session.id }, 'Async payment failed');

        if (supabaseAdmin) {
          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeSubId },
                  'Failed to update subscription for async payment failed',
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription by customer ID for async payment failed',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for async payment failed');
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await updateSubscriptionFromStripeSubscription(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        // Access subscription ID (v20 type change)
        const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;

        logger.info({ invoiceId: invoice.id }, 'Payment succeeded for invoice');

        if (supabaseAdmin && stripe) {
          const updateData: {
            status: string;
            current_period_start?: string;
            current_period_end?: string;
          } = { status: 'active' };

          if (stripeSubId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(stripeSubId);
              updateData.status = subscription.status;
              // AUDIT-P3: Use shared type-safe helper for period extraction
              const period = getSubscriptionPeriod(subscription);
              if (period) {
                updateData.current_period_start = new Date(period.start * 1000).toISOString();
                updateData.current_period_end = new Date(period.end * 1000).toISOString();
              }
            } catch (error) {
              logger.error({ error, stripeSubId }, 'Failed to retrieve subscription for invoice');
            }
          }

          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeSubId },
                  'Failed to update subscription for payment succeeded',
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription by customer ID for payment succeeded',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for payment succeeded');
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;
        logger.info({ stripeSubId }, 'Subscription deleted');
        if (supabaseAdmin) {
          try {
            // Use Stripe's canceled_at timestamp for accuracy, fallback to now
            const canceledAt = subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : new Date().toISOString();

            // First, get the subscription to find the user_id for credit revocation
            const { data: existingSub, error: fetchError } = await supabaseAdmin
              .from('subscriptions')
              .select('id, user_id')
              .eq('stripe_subscription_id', stripeSubId)
              .maybeSingle();

            if (fetchError) {
              logger.error(
                { error: fetchError, stripeSubId },
                'Failed to fetch subscription for deletion',
              );
            }

            // Update subscription status to canceled
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'canceled',
                canceled_at: canceledAt,
              })
              .eq('stripe_subscription_id', stripeSubId);

            if (updateError) {
              logger.error(
                { error: updateError, stripeSubId },
                'Failed to update subscription for deleted event',
              );
            }

            // Revoke remaining credits for the canceled subscription
            if (existingSub?.user_id) {
              try {
                // Set credits to 0 by deducting remaining balance
                const balance = await CreditService.getBalance(existingSub.user_id);
                if (balance && balance.credits_remaining_cents > 0) {
                  await CreditService.deductCredits(
                    existingSub.user_id,
                    balance.credits_remaining_cents,
                    'Credits revoked due to subscription cancellation',
                    { type: 'revocation', reason: 'subscription_canceled' },
                  );
                  logger.info(
                    {
                      userId: existingSub.user_id,
                      revokedCents: balance.credits_remaining_cents,
                      stripeSubId,
                    },
                    'Credits revoked for canceled subscription',
                  );
                }
              } catch (creditError) {
                logger.error(
                  { error: creditError, userId: existingSub.user_id, stripeSubId },
                  'Failed to revoke credits for canceled subscription',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for deleted event');
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        // Access subscription ID (v20 type change)
        const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;
        logger.warn({ invoiceId: invoice.id, stripeSubId }, 'Payment failed for invoice');

        if (supabaseAdmin && stripeSubId) {
          try {
            // Fetch actual subscription status from Stripe instead of assuming past_due
            const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
            const actualStatus = stripeSubscription.status;

            logger.info(
              { stripeSubId, actualStatus },
              'Retrieved actual subscription status from Stripe after payment failure',
            );

            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({ status: actualStatus })
              .eq('stripe_subscription_id', stripeSubId);

            if (updateError) {
              logger.error(
                { error: updateError, stripeSubId, actualStatus },
                'Failed to update subscription for payment failed',
              );
            }
          } catch (error) {
            logger.error(
              { error, stripeSubId },
              'Error fetching/updating subscription for payment failed',
            );
          }
        } else if (supabaseAdmin && stripeCustomerId) {
          // Fallback: update by customer ID if no subscription ID available
          try {
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_customer_id', stripeCustomerId);
            if (updateError) {
              logger.error(
                { error: updateError, stripeCustomerId },
                'Failed to update subscription by customer ID for payment failed',
              );
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for payment failed');
          }
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const stripeCustomerId = charge.customer as string | null;
        const refundedAmount = charge.amount_refunded;

        logger.info(
          { chargeId: charge.id, customerId: stripeCustomerId, refundedAmount },
          'Processing charge refund',
        );

        if (supabaseAdmin && stripeCustomerId && refundedAmount > 0) {
          try {
            // Find user by stripe_customer_id
            const { data: profile, error: profileError } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('stripe_customer_id', stripeCustomerId)
              .maybeSingle();

            if (profileError) {
              logger.error(
                { error: profileError, stripeCustomerId },
                'Failed to find user for refund',
              );
              break;
            }

            if (profile?.id) {
              // Use the handle_refund database function to revoke credits proportionally
              const { error: refundError } = await supabaseAdmin.rpc('handle_refund', {
                p_user_id: profile.id,
                p_refund_amount_cents: refundedAmount,
                p_reason: `Refund for charge ${charge.id}`,
              });

              if (refundError) {
                logger.error(
                  { error: refundError, userId: profile.id, refundedAmount },
                  'Failed to revoke credits for refund',
                );
              } else {
                logger.info(
                  { userId: profile.id, refundedAmount, chargeId: charge.id },
                  'Credits revoked for refund successfully',
                );
              }
            } else {
              logger.warn(
                { stripeCustomerId, chargeId: charge.id },
                'No user found for refunded charge - credits not revoked',
              );
            }
          } catch (error) {
            logger.error({ error, chargeId: charge.id }, 'Error processing charge refund');
          }
        }
        break;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = dispute.charge as string;
        const amount = dispute.amount;
        const reason = dispute.reason;

        logger.warn(
          { disputeId: dispute.id, chargeId, amount, reason },
          'CRITICAL: Charge dispute created - requires immediate attention',
        );

        if (supabaseAdmin && stripe) {
          try {
            // Get the charge to find the customer
            const charge = await stripe.charges.retrieve(chargeId);
            const stripeCustomerId = charge.customer as string | null;

            if (stripeCustomerId) {
              // Find user by stripe_customer_id
              const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('id, email')
                .eq('stripe_customer_id', stripeCustomerId)
                .maybeSingle();

              if (!profileError && profile?.id) {
                // Flag the subscription as disputed (use cancel_at_period_end to prevent renewal)
                const { error: updateError } = await supabaseAdmin
                  .from('subscriptions')
                  .update({
                    status: 'past_due',
                    cancel_at_period_end: true,
                  })
                  .eq('stripe_customer_id', stripeCustomerId);

                if (updateError) {
                  logger.error(
                    { error: updateError, stripeCustomerId },
                    'Failed to update subscription for dispute',
                  );
                }

                // Revoke all remaining credits for the disputed user
                try {
                  const balance = await CreditService.getBalance(profile.id);
                  if (balance && balance.credits_remaining_cents > 0) {
                    await CreditService.deductCredits(
                      profile.id,
                      balance.credits_remaining_cents,
                      `Credits revoked due to charge dispute ${dispute.id}`,
                      { type: 'dispute', disputeId: dispute.id, reason },
                    );
                    logger.info(
                      {
                        userId: profile.id,
                        revokedCents: balance.credits_remaining_cents,
                        disputeId: dispute.id,
                      },
                      'Credits revoked due to dispute',
                    );
                  }
                } catch (creditError) {
                  logger.error(
                    { error: creditError, userId: profile.id, disputeId: dispute.id },
                    'Failed to revoke credits for dispute',
                  );
                }

                logger.warn(
                  {
                    userId: profile.id,
                    email: profile.email,
                    disputeId: dispute.id,
                    chargeId,
                    amount,
                    reason,
                  },
                  'ALERT: User subscription flagged due to dispute',
                );
              } else {
                logger.error(
                  { stripeCustomerId, disputeId: dispute.id },
                  'Could not find user for disputed charge',
                );
              }
            }
          } catch (error) {
            logger.error({ error, disputeId: dispute.id }, 'Error processing charge dispute');
          }
        }
        break;
      }
      default:
        logger.warn({ eventType: event.type }, 'Unhandled Stripe event type');
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        eventType: event.type,
        eventId: event.id,
        stack: err instanceof Error ? err.stack : undefined,
      },
      'Error handling Stripe webhook event',
    );

    // Mark failed so Stripe retries can reprocess this event (retry-safe idempotency)
    try {
      await supabaseAdmin.rpc('mark_stripe_event_failed', {
        p_event_id: event.id,
        p_error: errorMessage,
      });
    } catch (markError) {
      logger.error(
        { error: markError, eventId: event.id },
        'Failed to mark Stripe event as failed',
      );
    }

    // WEB-7 (audit 2026-05-03): return a generic body. The previous
    // `errorMessage` interpolation leaked internal details (Supabase
    // column names, SQL constraint names, stack traces) to anyone able
    // to forge a webhook signature, AND surfaced the same string in
    // Stripe's dashboard on retries. Server-side `logger.error` above
    // already captured the full error.
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
    });
  }

  // Mark succeeded so future retries are skipped (retry-safe idempotency)
  try {
    await supabaseAdmin.rpc('mark_stripe_event_succeeded', { p_event_id: event.id });
  } catch (markError) {
    // Don't fail webhook response; Stripe will retry, and idempotency lock will prevent double work
    logger.error(
      { error: markError, eventId: event.id },
      'Failed to mark Stripe event as succeeded',
    );
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Webhook processed successfully');
  return NextResponse.json({ received: true, eventType: event.type }, { status: 200 });
}
