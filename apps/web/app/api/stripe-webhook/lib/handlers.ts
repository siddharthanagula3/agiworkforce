import 'server-only';

import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import { getSubscriptionPeriod } from '@/lib/stripe-types';
import {
  handleCreditTopUp,
  upsertSubscriptionFromSession,
  updateSubscriptionFromStripeSubscription,
  CreditService,
} from './db';

export async function dispatchStripeEvent(
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.['type'] === 'credit_topup') {
        logger.info({ sessionId: session.id }, 'Processing credit top-up checkout');
        await handleCreditTopUp(supabaseAdmin, stripe, session);
      } else {
        await upsertSubscriptionFromSession(supabaseAdmin, stripe, session);
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info({ sessionId: session.id }, 'Async payment succeeded');
      await upsertSubscriptionFromSession(supabaseAdmin, stripe, session);
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeSubId = session.subscription as string | null;
      const stripeCustomerId = session.customer as string | null;
      logger.warn({ sessionId: session.id }, 'Async payment failed');

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
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionFromStripeSubscription(supabaseAdmin, stripe, subscription);
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId = invoice.customer as string | null;
      const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;

      logger.info({ invoiceId: invoice.id }, 'Payment succeeded for invoice');

      const updateData: {
        status: string;
        current_period_start?: string;
        current_period_end?: string;
      } = { status: 'active' };

      let shouldUpsert = true;
      if (stripeSubId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(stripeSubId);
          updateData.status = subscription.status;
          const period = getSubscriptionPeriod(subscription);
          if (period) {
            updateData.current_period_start = new Date(period.start * 1000).toISOString();
            updateData.current_period_end = new Date(period.end * 1000).toISOString();
          }
        } catch (error) {
          logger.error({ error, stripeSubId }, 'Failed to retrieve subscription for invoice');
          shouldUpsert = false;
        }
      }

      if (shouldUpsert) {
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

      try {
        const canceledAt = subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : new Date().toISOString();

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

        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled', canceled_at: canceledAt })
          .eq('stripe_subscription_id', stripeSubId);

        if (updateError) {
          logger.error(
            { error: updateError, stripeSubId },
            'Failed to update subscription for deleted event',
          );
        }

        if (existingSub?.user_id) {
          try {
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
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId = invoice.customer as string | null;
      const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;
      logger.warn({ invoiceId: invoice.id, stripeSubId }, 'Payment failed for invoice');

      if (stripeSubId) {
        try {
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
      } else if (stripeCustomerId) {
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

      if (stripeCustomerId && refundedAmount > 0) {
        try {
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

      try {
        const charge = await stripe.charges.retrieve(chargeId);
        const stripeCustomerId = charge.customer as string | null;

        if (stripeCustomerId) {
          const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('stripe_customer_id', stripeCustomerId)
            .maybeSingle();

          if (!profileError && profile?.id) {
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'past_due', cancel_at_period_end: true })
              .eq('stripe_customer_id', stripeCustomerId);

            if (updateError) {
              logger.error(
                { error: updateError, stripeCustomerId },
                'Failed to update subscription for dispute',
              );
            }

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
      break;
    }
    default:
      logger.warn({ eventType: event.type }, 'Unhandled Stripe event type');
  }
}
