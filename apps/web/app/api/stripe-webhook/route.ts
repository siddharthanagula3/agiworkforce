import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.error(
    '[billing] FATAL: Stripe webhook is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[billing] FATAL: Supabase service role env vars are missing. Webhook cannot update subscriptions.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })
  : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// Price IDs (Should ideally be shared/ENV driven but hardcoded here for fallback robustness matching checkout/route.ts)
const STRIPE_PRICE_HOBBY_MONTHLY =
  process.env.STRIPE_PRICE_HOBBY_MONTHLY ?? 'price_1Sgwx10zEfO6BZMh7thtFU77';
const STRIPE_PRICE_HOBBY_YEARLY =
  process.env.STRIPE_PRICE_HOBBY_YEARLY ?? 'price_1Sgwx20zEfO6BZMhbgpxL8TI';
const STRIPE_PRICE_PRO_MONTHLY =
  process.env.STRIPE_PRICE_PRO_MONTHLY ?? 'price_1Sgwx20zEfO6BZMh3ix7hivi';
const STRIPE_PRICE_PRO_YEARLY =
  process.env.STRIPE_PRICE_PRO_YEARLY ?? 'price_1Sgwx30zEfO6BZMhJXsduOyl';
const STRIPE_PRICE_MAX_MONTHLY =
  process.env.STRIPE_PRICE_MAX_MONTHLY ?? 'price_1Sgwx30zEfO6BZMhJqItFYKF';
const STRIPE_PRICE_MAX_YEARLY =
  process.env.STRIPE_PRICE_MAX_YEARLY ?? 'price_1Sgwx40zEfO6BZMhYS63EnfW';

function getPlanFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_HOBBY_MONTHLY || priceId === STRIPE_PRICE_HOBBY_YEARLY)
    return 'hobby';
  if (priceId === STRIPE_PRICE_PRO_MONTHLY || priceId === STRIPE_PRICE_PRO_YEARLY) return 'pro';
  if (priceId === STRIPE_PRICE_MAX_MONTHLY || priceId === STRIPE_PRICE_MAX_YEARLY) return 'max';
  return null;
}

async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin || !stripe) {
    console.error('[billing] upsertSubscriptionFromSession: missing dependencies');
    throw new Error('Missing dependencies');
  }

  console.log('[billing] upsertSubscriptionFromSession: Processing session', session.id);

  const supabaseUserId = session.metadata?.['supabase_user_id'] || session.client_reference_id;
  if (!supabaseUserId) {
    console.warn(
      '[billing] upsertSubscriptionFromSession: No supabase_user_id in metadata or client_reference_id',
    );
    return;
  }

  let planTier = (session.metadata?.['plan_tier'] as string | undefined) ?? 'pro';
  const stripeCustomerId = session.customer as string | null;
  const stripeSubId = session.subscription as string | null;

  // Try to infer plan tier from Price ID if metadata is weird, or just to double check
  // Note: We need to get stripePriceId first before we can use it.
  // Re-ordering logic below to get line items first.

  console.log('[billing] upsertSubscriptionFromSession: details', {
    supabaseUserId,
    planTier,
    stripeCustomerId,
    stripeSubId,
  });

  let stripePriceId: string | null = null;
  if (session.line_items?.data && session.line_items.data.length > 0) {
    stripePriceId = session.line_items.data[0].price?.id || null;
  } else if (stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      if (expandedSession.line_items?.data && expandedSession.line_items.data.length > 0) {
        stripePriceId = expandedSession.line_items.data[0].price?.id || null;
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve expanded session:', error);
    }
  }

  // Refine Plan Tier inference - always infer from price_id if available (more reliable than metadata)
  if (stripePriceId) {
    const inferredPlan = getPlanFromPriceId(stripePriceId);
    if (inferredPlan) {
      console.log(
        `[billing] Inferred plan ${inferredPlan} from price ${stripePriceId} (overriding metadata: ${session.metadata?.['plan_tier']})`,
      );
      planTier = inferredPlan;
    } else if (!session.metadata?.['plan_tier']) {
      // Only use default 'pro' if we can't infer from price_id AND no metadata
      console.warn(
        `[billing] Could not infer plan from price_id ${stripePriceId}, using default 'pro'`,
      );
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
      currentPeriodStart = new Date(subscription.current_period_start * 1000);
      currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

      // Ensure we always get price_id from subscription if not already set
      if (!stripePriceId && subscription.items.data.length > 0) {
        stripePriceId = subscription.items.data[0].price.id;
        console.log(
          `[billing] Retrieved price_id ${stripePriceId} from subscription ${stripeSubId}`,
        );
      }

      // Also update plan_tier from price_id if we have it (more reliable than metadata)
      if (stripePriceId) {
        const inferredPlan = getPlanFromPriceId(stripePriceId);
        if (inferredPlan) {
          console.log(
            `[billing] Updating plan_tier to ${inferredPlan} from price_id ${stripePriceId}`,
          );
          planTier = inferredPlan;
        }
      }

      if (subscription.discount?.coupon?.id) {
        stripeCouponId = subscription.discount.coupon.id;
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve subscription details:', error);
    }
  }

  // Final fallback: if we still don't have price_id but have subscription_id, try one more time
  if (!stripePriceId && stripeSubId && stripe) {
    try {
      console.warn(
        `[billing] stripe_price_id still null after initial attempts, retrying for subscription ${stripeSubId}`,
      );
      const subscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price'],
      });
      if (subscription.items.data.length > 0) {
        stripePriceId = subscription.items.data[0].price.id;
        console.log(
          `[billing] Successfully retrieved price_id ${stripePriceId} from subscription on retry`,
        );
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve price_id on retry:', error);
    }
  }

  // Log warning if price_id is still missing and attempt one final retrieval
  if (!stripePriceId && stripeSubId && stripe) {
    console.warn(
      `[billing] WARNING: stripe_price_id is null for session ${session.id}, subscription ${stripeSubId}, user ${supabaseUserId}. Attempting final retrieval...`,
    );
    try {
      // Final attempt: retrieve subscription with full expansion
      const finalSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price', 'items.data.plan'],
      });
      if (finalSubscription.items.data.length > 0) {
        stripePriceId =
          finalSubscription.items.data[0].price?.id ||
          finalSubscription.items.data[0].plan?.id ||
          null;
        if (stripePriceId) {
          console.log(
            `[billing] Successfully retrieved price_id ${stripePriceId} in final attempt`,
          );
        }
      }
    } catch (error) {
      console.error('[billing] Final attempt to retrieve price_id failed:', error);
    }
  }

  if (!stripePriceId) {
    console.error(
      `[billing] CRITICAL: stripe_price_id is still null after all attempts for session ${session.id}, subscription ${stripeSubId}, user ${supabaseUserId}`,
    );
  }

  if (!stripeCouponId && stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['total_details.breakdown'],
      });

      if (expandedSession.total_details?.breakdown?.discounts) {
        const discount = expandedSession.total_details.breakdown.discounts[0];
        if (discount?.discount?.coupon?.id) {
          stripeCouponId = discount.discount.coupon.id;
        }
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve session discount details:', error);
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

  console.log('[billing] Upserting subscription:', subData);

  const { error } = await supabaseAdmin.from('subscriptions').upsert(subData, {
    onConflict: 'user_id',
  });

  if (error) {
    console.error('[billing] Failed to upsert subscription:', error);
    throw error;
  }
}

async function updateSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  if (!supabaseAdmin) {
    console.error('[billing] updateSubscriptionFromStripeSubscription: missing supabaseAdmin');
    throw new Error('Missing dependencies');
  }

  console.log(
    '[billing] updateSubscriptionFromStripeSubscription: Processing sub',
    subscription.id,
  );

  const stripeSubId = subscription.id;
  const stripeCustomerId = subscription.customer as string | null;

  let stripePriceId: string | null = null;
  if (subscription.items.data.length > 0) {
    stripePriceId = subscription.items.data[0].price.id;
  }

  let planTier: string = 'pro';
  if (subscription.metadata?.plan_tier) {
    planTier = subscription.metadata.plan_tier;
  } else if (stripePriceId) {
    const inferred = getPlanFromPriceId(stripePriceId);
    if (inferred) {
      planTier = inferred;
    } else {
      console.log(
        '[billing] No plan_tier in subscription metadata and unknown price ID, keeping pro default',
      );
    }
  }

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
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_coupon_id: subscription.discount?.coupon?.id || null,
    plan_tier: planTier,
  };

  console.log('[billing] Updating subscription:', { stripeSubId, stripeCustomerId, updateData });

  let error;
  if (stripeSubId) {
    const { data: existingSub, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();

    if (fetchError) {
      console.error('[billing] Failed to check existing subscription:', fetchError);
    }

    if (existingSub) {
      // Normal path: update by stripe_subscription_id
      const res = await supabaseAdmin
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', stripeSubId);
      error = res.error;
    } else {
      // Fallback: Code did not find by stripe_subscription_id.
      // Check if we have a user_id in metadata to link it.
      const metadataUserId = subscription.metadata?.supabase_user_id;
      if (metadataUserId) {
        console.log(
          `[billing] Subscription ${stripeSubId} not found by ID. Linking via metadata user_id: ${metadataUserId}`,
        );
        // We merge the IDs into updateData to ensure they are saved
        const linkData = {
          ...updateData,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: stripeCustomerId,
        };

        const res = await supabaseAdmin
          .from('subscriptions')
          .update(linkData)
          .eq('user_id', metadataUserId);
        error = res.error;
      } else {
        // Fallback 2: Try by customer ID as a last resort if user has no other subs?
        // Actually, existing logic tried by customer ID if stripeSubId wasn't passed, but here stripeSubId IS passed.
        // We'll stick to the original "else if (stripeCustomerId)" logic below only if we really didn't find anything.
        console.warn(
          `[billing] Subscription ${stripeSubId} not found and no metadata user_id. Falling back to customer ID lookup.`,
        );
        const res = await supabaseAdmin
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_customer_id', stripeCustomerId);
        error = res.error;
      }
    }
  } else if (stripeCustomerId) {
    const res = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);
    error = res.error;
  }

  if (error) {
    console.error('[billing] Failed to update subscription:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error('[billing] Stripe not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    console.error('[billing] Supabase admin not configured');
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[billing] Missing Stripe signature');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    console.log('[billing] Webhook verified, event type:', event.type);
  } catch (err) {
    console.error('[billing] Stripe webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[billing] Async payment succeeded for session:', session.id);
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubId = session.subscription as string | null;
        const stripeCustomerId = session.customer as string | null;
        console.log('[billing] Async payment failed for session:', session.id);

        if (supabaseAdmin) {
          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription for async payment failed:',
                  updateError,
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription by customer ID for async payment failed:',
                  updateError,
                );
              }
            }
          } catch (error) {
            console.error('[billing] Error updating subscription for async payment failed:', error);
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
        const stripeSubId = invoice.subscription as string | null;

        console.log('[billing] Payment succeeded for invoice:', invoice.id);

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
              updateData.current_period_start = new Date(
                subscription.current_period_start * 1000,
              ).toISOString();
              updateData.current_period_end = new Date(
                subscription.current_period_end * 1000,
              ).toISOString();
            } catch (error) {
              console.error('[billing] Failed to retrieve subscription for invoice:', error);
            }
          }

          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription for payment succeeded:',
                  updateError,
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription by customer ID for payment succeeded:',
                  updateError,
                );
              }
            }
          } catch (error) {
            console.error('[billing] Error updating subscription for payment succeeded:', error);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;
        console.log('[billing] Subscription deleted:', stripeSubId);
        if (supabaseAdmin) {
          try {
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'canceled',
                canceled_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', stripeSubId);
            if (updateError) {
              console.error(
                '[billing] Failed to update subscription for deleted event:',
                updateError,
              );
            }
          } catch (error) {
            console.error('[billing] Error updating subscription for deleted event:', error);
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        const stripeSubId = invoice.subscription as string | null;
        console.log('[billing] Payment failed for invoice:', invoice.id);

        if (supabaseAdmin) {
          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription for payment failed:',
                  updateError,
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                console.error(
                  '[billing] Failed to update subscription by customer ID for payment failed:',
                  updateError,
                );
              }
            }
          } catch (error) {
            console.error('[billing] Error updating subscription for payment failed:', error);
          }
        }
        break;
      }
      default:
        console.log(`[billing] Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error('[billing] Error handling Stripe webhook event', err);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
