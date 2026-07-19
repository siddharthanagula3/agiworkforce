import 'server-only';

import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import {
  handleCreditTopUp,
  upsertSubscriptionFromSession,
  updateSubscriptionFromStripeSubscription,
  CreditService,
} from './db';

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  if (typeof current === 'string') return current;
  if (current?.id) return current.id;
  return (invoice as unknown as { subscription?: string | null }).subscription ?? null;
}

export async function dispatchStripeEvent(
  db: DatabaseAdapter,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.['type'] === 'credit_topup') {
        logger.info({ sessionId: session.id }, 'Processing credit top-up checkout');
        await handleCreditTopUp(db, stripe, session);
      } else {
        await upsertSubscriptionFromSession(db, stripe, session);
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info({ sessionId: session.id }, 'Async payment succeeded');
      await upsertSubscriptionFromSession(db, stripe, session);
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeSubId = session.subscription as string | null;
      const stripeCustomerId = session.customer as string | null;
      logger.warn({ sessionId: session.id }, 'Async payment failed');

      try {
        if (stripeSubId) {
          await db
            .execute(
              "update subscriptions set status = 'past_due' where stripe_subscription_id = $1",
              [stripeSubId],
            )
            .catch((updateError: unknown) => {
              logger.error(
                { error: updateError, stripeSubId },
                'Failed to update subscription for async payment failed',
              );
            });
        } else if (stripeCustomerId) {
          await db
            .execute("update subscriptions set status = 'past_due' where stripe_customer_id = $1", [
              stripeCustomerId,
            ])
            .catch((updateError: unknown) => {
              logger.error(
                { error: updateError, stripeCustomerId },
                'Failed to update subscription by customer ID for async payment failed',
              );
            });
        }
      } catch (error) {
        logger.error({ error }, 'Error updating subscription for async payment failed');
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.pending_update_applied':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionFromStripeSubscription(db, stripe, subscription);
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = getInvoiceSubscriptionId(invoice);

      logger.info({ invoiceId: invoice.id }, 'Payment succeeded for invoice');
      if (stripeSubId) {
        const subscription = await stripe.subscriptions.retrieve(stripeSubId);
        await updateSubscriptionFromStripeSubscription(db, stripe, subscription);
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

        const existingSubs = await db
          .query<{
            id: string;
            user_id: string;
          }>('select id, user_id from subscriptions where stripe_subscription_id = $1 limit 1', [
            stripeSubId,
          ])
          .catch((fetchError: unknown) => {
            logger.error(
              { error: fetchError, stripeSubId },
              'Failed to fetch subscription for deletion',
            );
            return [] as { id: string; user_id: string }[];
          });

        await db
          .execute(
            "update subscriptions set status = 'canceled', canceled_at = $1 where stripe_subscription_id = $2",
            [canceledAt, stripeSubId],
          )
          .catch((updateError: unknown) => {
            logger.error(
              { error: updateError, stripeSubId },
              'Failed to update subscription for deleted event',
            );
          });

        const existingSub = existingSubs[0];
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
      const stripeSubId = getInvoiceSubscriptionId(invoice);
      logger.warn({ invoiceId: invoice.id, stripeSubId }, 'Payment failed for invoice');

      if (stripeSubId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
          const actualStatus = stripeSubscription.status;

          logger.info(
            { stripeSubId, actualStatus },
            'Retrieved actual subscription status from Stripe after payment failure',
          );

          await db
            .execute('update subscriptions set status = $1 where stripe_subscription_id = $2', [
              actualStatus,
              stripeSubId,
            ])
            .catch((updateError: unknown) => {
              logger.error(
                { error: updateError, stripeSubId, actualStatus },
                'Failed to update subscription for payment failed',
              );
            });
        } catch (error) {
          logger.error(
            { error, stripeSubId },
            'Error fetching/updating subscription for payment failed',
          );
        }
      } else if (stripeCustomerId) {
        try {
          await db
            .execute("update subscriptions set status = 'past_due' where stripe_customer_id = $1", [
              stripeCustomerId,
            ])
            .catch((updateError: unknown) => {
              logger.error(
                { error: updateError, stripeCustomerId },
                'Failed to update subscription by customer ID for payment failed',
              );
            });
        } catch (error) {
          logger.error({ error }, 'Error updating subscription for payment failed');
        }
      }
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const stripeCustomerId = charge.customer as string | null;
      // Revoke only the DELTA of the most recent refund, NOT charge.amount_refunded
      // (which is the running CUMULATIVE total). `charge.refunded` fires once per
      // refund carrying the cumulative amount, so revoking the cumulative each time
      // over-revokes on partial/multiple refunds (e.g. refund $10 then $5 would
      // revoke $10 + $15 = $25 instead of $15). Fall back to the cumulative only
      // when no individual refund is present (single-refund case where they match).
      const latestRefund = charge.refunds?.data?.[0];
      const refundedAmount = latestRefund?.amount ?? charge.amount_refunded;

      logger.info(
        { chargeId: charge.id, customerId: stripeCustomerId, refundedAmount },
        'Processing charge refund',
      );

      if (stripeCustomerId && refundedAmount > 0) {
        try {
          const profiles = await db
            .query<{
              id: string;
            }>('select id from profiles where stripe_customer_id = $1 limit 1', [stripeCustomerId])
            .catch((profileError: unknown) => {
              logger.error(
                { error: profileError, stripeCustomerId },
                'Failed to find user for refund',
              );
              return [] as { id: string }[];
            });

          const profile = profiles[0];
          if (profile?.id) {
            await db
              .execute('select handle_refund($1, $2, $3)', [
                profile.id,
                refundedAmount,
                `Refund for charge ${charge.id}`,
              ])
              .then(() => {
                logger.info(
                  { userId: profile.id, refundedAmount, chargeId: charge.id },
                  'Credits revoked for refund successfully',
                );
              })
              .catch((refundError: unknown) => {
                logger.error(
                  { error: refundError, userId: profile.id, refundedAmount },
                  'Failed to revoke credits for refund',
                );
              });
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
          const profiles = await db
            .query<{
              id: string;
              email: string | null;
            }>('select id, email from profiles where stripe_customer_id = $1 limit 1', [
              stripeCustomerId,
            ])
            .catch(() => [] as { id: string; email: string | null }[]);

          const profile = profiles[0];
          if (profile?.id) {
            await db
              .execute(
                "update subscriptions set status = 'past_due', cancel_at_period_end = true where stripe_customer_id = $1",
                [stripeCustomerId],
              )
              .catch((updateError: unknown) => {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription for dispute',
                );
              });

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
