import 'server-only';

import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  handleCreditTopUp,
  upsertSubscriptionFromSession,
  updateSubscriptionFromStripeSubscription,
  CreditService,
} from './db';
import { toStoredSubscriptionStatus } from './subscription-status';
import { readPreDebitWindow, readUnrecoverableMandateCode } from './india-mandate';
import { isValidTopUpPurchase } from '@agiworkforce/types';

function getCustomerId(customer: Stripe.PaymentIntent['customer']): string | null {
  if (typeof customer === 'string') return customer;
  return customer?.id ?? null;
}

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
        if (session.payment_status === 'unpaid') {
          logger.info(
            { sessionId: session.id },
            'Credit top-up awaits asynchronous payment confirmation',
          );
        } else {
          await handleCreditTopUp(db, stripe, session);
        }
      } else {
        await upsertSubscriptionFromSession(db, stripe, session);
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info({ sessionId: session.id }, 'Async payment succeeded');
      if (session.metadata?.['type'] === 'credit_topup') {
        await handleCreditTopUp(db, stripe, session);
      } else {
        await upsertSubscriptionFromSession(db, stripe, session);
      }
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeSubId = session.subscription as string | null;
      const stripeCustomerId = session.customer as string | null;
      logger.warn({ sessionId: session.id }, 'Async payment failed');

      if (session.metadata?.['type'] === 'credit_topup') break;

      if (stripeSubId) {
        await db.execute(
          "update subscriptions set status = 'past_due' where stripe_subscription_id = $1",
          [stripeSubId],
        );
      } else if (stripeCustomerId) {
        await db.execute(
          "update subscriptions set status = 'past_due' where stripe_customer_id = $1",
          [stripeCustomerId],
        );
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

      const canceledAt = subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : new Date().toISOString();

      const [ownerRow] = await db.query<{ user_id: string | null; plan_tier: string | null }>(
        'select user_id, plan_tier from subscriptions where stripe_subscription_id = $1 limit 1',
        [stripeSubId],
      );

      await db.execute(
        "update subscriptions set status = 'canceled', plan_tier = 'free', canceled_at = $1 where stripe_subscription_id = $2",
        [canceledAt, stripeSubId],
      );

      await db.execute(
        `update public.organizations
            set stripe_subscription_id = null,
                seat_billing_updated_at = now()
          where stripe_subscription_id = $1`,
        [stripeSubId],
      );

      await recordAuditEvent({
        userId: ownerRow?.user_id ?? null,
        eventType: 'plan_changed',
        endpoint: '/api/stripe-webhook',
        surface: 'stripe_webhook',
        detail: {
          resourceType: 'subscription',
          previousPlanTier: ownerRow?.plan_tier ?? 'unknown',
          planTier: 'free',
          source: 'stripe_webhook',
          status: 'canceled',
        },
      });
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId = invoice.customer as string | null;
      const stripeSubId = getInvoiceSubscriptionId(invoice);
      logger.warn({ invoiceId: invoice.id, stripeSubId }, 'Payment failed for invoice');

      if (stripeSubId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
        const actualStatus = toStoredSubscriptionStatus(stripeSubscription.status);

        logger.info(
          { stripeSubId, actualStatus },
          'Retrieved actual subscription status from Stripe after payment failure',
        );

        await db.execute('update subscriptions set status = $1 where stripe_subscription_id = $2', [
          actualStatus,
          stripeSubId,
        ]);
      } else if (stripeCustomerId) {
        await db.execute(
          "update subscriptions set status = 'past_due' where stripe_customer_id = $1",
          [stripeCustomerId],
        );
      }
      break;
    }
    case 'payment_intent.processing': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const preDebitWindow = readPreDebitWindow(paymentIntent);
      if (!preDebitWindow) break;

      logger.info(
        {
          paymentIntentId: paymentIntent.id,
          customerId: getCustomerId(paymentIntent.customer),
          approvalRequested: preDebitWindow.approvalRequested,
          completesAt: preDebitWindow.completesAt,
        },
        'India e-mandate pre-debit notification sent; the charge settles after the notification window and cannot be canceled, so entitlement stays untouched until it resolves',
      );
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const mandateCode = readUnrecoverableMandateCode(paymentIntent.last_payment_error);
      if (!mandateCode) break;

      const stripeCustomerId = getCustomerId(paymentIntent.customer);
      logger.error(
        { paymentIntentId: paymentIntent.id, stripeCustomerId, mandateCode },
        'India e-mandate is no longer chargeable; Stripe retries cannot succeed until the customer authorizes a new mandate through a fresh subscription',
      );
      if (!stripeCustomerId) break;

      const [profile] = await db.query<{ id: string }>(
        'select id from profiles where stripe_customer_id = $1 limit 1',
        [stripeCustomerId],
      );
      if (!profile?.id) break;

      await recordAuditEvent({
        userId: profile.id,
        eventType: 'plan_changed',
        severity: 'warning',
        endpoint: '/api/stripe-webhook',
        surface: 'stripe_webhook',
        detail: {
          resourceType: 'subscription',
          resourceId: paymentIntent.id,
          source: 'stripe_webhook',
          reason: `india_mandate_unrecoverable:${mandateCode}`,
        },
      });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const stripeCustomerId = charge.customer as string | null;

      const isCreditTopUpCharge = charge.metadata?.['type'] === 'credit_topup';
      const fullyRefunded =
        charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
      const revokesPlan = fullyRefunded && !isCreditTopUpCharge;
      let refundedCreditTarget = charge.amount_refunded;
      if (isCreditTopUpCharge) {
        const purchasedCents = Number(charge.metadata?.['credit_amount_cents']);
        const purchasedUnits = Number(charge.metadata?.['top_up_units']);
        if (
          !isValidTopUpPurchase({ amountCents: purchasedCents, units: purchasedUnits }) ||
          charge.amount < purchasedCents
        ) {
          throw new Error(`Invalid credit top-up refund metadata for Charge ${charge.id}`);
        }
        refundedCreditTarget = fullyRefunded
          ? purchasedCents
          : Math.floor((purchasedCents * charge.amount_refunded) / charge.amount);
      }

      logger.info(
        {
          chargeId: charge.id,
          customerId: stripeCustomerId,
          amountRefundedCumulative: charge.amount_refunded,
          revokesPlan,
        },
        'Processing charge refund',
      );

      if (stripeCustomerId && (charge.amount_refunded > 0 || revokesPlan)) {
        const profiles = await db.query<{
          id: string;
        }>('select id from profiles where stripe_customer_id = $1 limit 1', [stripeCustomerId]);

        const profile = profiles[0];
        if (profile?.id) {
          const refundLedgerDescription = `Refund for charge ${charge.id}`;
          const [revoked] = await db.query<{ revoked_cents: string | number | null }>(
            `select coalesce(sum(-amount_cents), 0) as revoked_cents
               from credit_transactions
              where user_id = $1 and transaction_type = 'refund' and description = $2`,
            [profile.id, refundLedgerDescription],
          );
          const alreadyRevoked = Number(revoked?.revoked_cents ?? 0) || 0;
          const refundedAmount = Math.max(0, refundedCreditTarget - alreadyRevoked);

          if (refundedAmount > 0) {
            const params = [profile.id, refundedAmount, refundLedgerDescription];
            if (isCreditTopUpCharge) {
              await db.execute('select handle_top_up_refund($1, $2, $3)', params);
            } else {
              await db.execute('select handle_refund($1, $2, $3)', params);
            }
            logger.info(
              {
                userId: profile.id,
                refundedAmount,
                alreadyRevoked,
                amountRefundedCumulative: charge.amount_refunded,
                chargeId: charge.id,
              },
              'Credits revoked for refund successfully',
            );
          }

          if (revokesPlan) {
            const [previous] = await db.query<{ plan_tier: string | null }>(
              'select plan_tier from subscriptions where stripe_customer_id = $1 limit 1',
              [stripeCustomerId],
            );

            await db.execute(
              `update subscriptions
                  set status = 'past_due', plan_tier = 'free', cancel_at_period_end = true
                where stripe_customer_id = $1`,
              [stripeCustomerId],
            );

            await recordAuditEvent({
              userId: profile.id,
              eventType: 'plan_changed',
              endpoint: '/api/stripe-webhook',
              surface: 'stripe_webhook',
              detail: {
                resourceType: 'subscription',
                previousPlanTier: previous?.plan_tier ?? 'unknown',
                planTier: 'free',
                source: 'stripe_webhook',
                status: 'past_due',
                reason: 'charge_refunded',
              },
            });

            logger.warn(
              {
                userId: profile.id,
                chargeId: charge.id,
                previousPlanTier: previous?.plan_tier ?? 'unknown',
              },
              'Entitlement revoked for fully refunded charge; the Stripe subscription itself was left alone and must be canceled in Stripe if the refund was meant to end it',
            );
          }
        } else {
          logger.warn(
            { stripeCustomerId, chargeId: charge.id },
            'No user found for refunded charge - credits not revoked',
          );
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

      const charge = await stripe.charges.retrieve(chargeId);
      const stripeCustomerId = charge.customer as string | null;

      if (stripeCustomerId) {
        const profiles = await db.query<{
          id: string;
          email: string | null;
        }>('select id, email from profiles where stripe_customer_id = $1 limit 1', [
          stripeCustomerId,
        ]);

        const profile = profiles[0];
        if (profile?.id) {
          await db.execute(
            "update subscriptions set status = 'past_due', cancel_at_period_end = true where stripe_customer_id = $1",
            [stripeCustomerId],
          );

          const balance = await CreditService.getBalance(db, profile.id);
          if (balance && balance.credits_remaining_cents > 0) {
            const deduction = await CreditService.deductCredits(
              db,
              profile.id,
              balance.credits_remaining_cents,
              `Credits revoked due to charge dispute ${dispute.id}`,
              { type: 'dispute', disputeId: dispute.id, reason },
              `stripe-dispute:${dispute.id}`,
            );
            if (!deduction.success) {
              throw new Error(deduction.error || 'Failed to revoke credits for dispute');
            }
            logger.info(
              {
                userId: profile.id,
                revokedCents: balance.credits_remaining_cents,
                disputeId: dispute.id,
              },
              'Credits revoked due to dispute',
            );
          }

          await recordAuditEvent({
            userId: profile.id,
            eventType: 'plan_changed',
            severity: 'warning',
            endpoint: '/api/stripe-webhook',
            surface: 'stripe_webhook',
            detail: {
              resourceType: 'subscription',
              resourceId: dispute.id,
              source: 'stripe_webhook',
              status: 'past_due',
              reason: 'charge_dispute_created',
            },
          });

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
      break;
    }
    default:
      logger.warn({ eventType: event.type }, 'Unhandled Stripe event type');
  }
}
