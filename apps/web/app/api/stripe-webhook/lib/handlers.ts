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

      // Resolve the affected account BEFORE the row is downgraded so the audit
      // row can name a subject. The actor here is Stripe, not a user — there is
      // no request, no IP and no user-agent to record, and the Stripe event
      // payload (customer PII, price internals) must never be echoed.
      const [ownerRow] = await db.query<{ user_id: string | null; plan_tier: string | null }>(
        'select user_id, plan_tier from subscriptions where stripe_subscription_id = $1 limit 1',
        [stripeSubId],
      );

      await db.execute(
        // Reset plan_tier to 'free' as well · a deleted subscription must
        // revoke entitlement. Entitlement reads gate on `status` (see
        // lib/entitlement.ts) so this is belt-and-suspenders, but keeping the
        // stored tier honest avoids a paid label on a canceled row.
        //
        // Cancellation policy (founder, 2026-07): cancellations run to the end
        // of the paid billing period with NO mid-period cutoff and NO prorated
        // adjustment. Stripe fires `customer.subscription.deleted` at period
        // end (portal is configured to cancel at period end), so downgrading
        // here does not cut the user off early. We deliberately do NOT claw
        // back remaining credits on cancellation — the user keeps what they
        // paid for (including any separately-purchased top-up balance) through
        // the period. Credit clawback stays ONLY for refunds and disputes
        // (money genuinely returned), handled in their own events below.
        "update subscriptions set status = 'canceled', plan_tier = 'free', canceled_at = $1 where stripe_subscription_id = $2",
        [canceledAt, stripeSubId],
      );

      // Release the organization's binding to this now-dead subscription.
      //
      // `persistPurchasedSeatsOnOrganization` only writes seats when the
      // organization is unbound or already bound to the INCOMING subscription
      // (seats.ts WHERE clause). Nothing used to clear the binding on
      // cancellation, so an organization kept the cancelled subscription's id
      // forever — and a customer who later re-subscribed to Team paid for N
      // seats, hit the mismatch branch, and had NONE of them attach. The
      // failure was silent to them and surfaced only as a CRITICAL log line.
      //
      // The guard itself is right: one organization must not be hijacked by a
      // different subscription. It simply could not tell "bound to a different
      // ACTIVE subscription" from "bound to a DEAD one". Clearing the binding
      // here supplies that distinction at the only moment we know the answer.
      //
      // `licensed_seats` is deliberately left alone. Cancellation policy is no
      // mid-period cutoff, this event fires at period end, and lowering the
      // ceiling below `seats_consumed` would trip the
      // organizations_seats_within_license CHECK and abort the webhook
      // transaction. Membership is what should shrink, and that is a separate
      // decision, not a side effect of a Stripe event.
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
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const stripeCustomerId = charge.customer as string | null;

      // Returning the money has to return the entitlement it bought. Revoking
      // only credits left a fully refunded customer on their paid plan: refunds
      // are issued by hand in the Stripe dashboard (see /refund-policy) and a
      // dashboard refund never fires a cancellation event of its own, so nothing
      // downstream ever downgraded the row.
      //
      // Only a FULL refund revokes. A partial one is a goodwill adjustment on a
      // period the customer still holds, and cutting them off for it would be
      // worse than the bug. `charge.refunded` is Stripe's own fully-refunded
      // flag; the amount comparison covers payloads that omit it.
      //
      // Credit top-ups are carved out because they buy credits, not a plan —
      // handle_refund below is the entire remedy for those. Stripe removed
      // `Charge.invoice` in API 2026-04-22, so a top-up checkout MUST stamp
      // `payment_intent_data.metadata.type = 'credit_topup'`; that metadata is
      // the only thing left that tells the two kinds of charge apart here.
      const isCreditTopUpCharge = charge.metadata?.['type'] === 'credit_topup';
      const fullyRefunded =
        charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
      const revokesPlan = fullyRefunded && !isCreditTopUpCharge;

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
          // `charge.amount_refunded` is the running CUMULATIVE total refunded on
          // this charge, and `charge.refunded` fires once per refund carrying it,
          // so revoking that number on every event double-revokes multiple partial
          // refunds ($10 then $5 would revoke $10 + $15 = $25 for $15 returned).
          // The per-refund amount is not in this payload to subtract instead:
          // since API version 2022-11-15 Stripe stopped including the `refunds`
          // list on a Charge by default (it is expand-only, and webhook payloads
          // cannot be expanded), and this deployment pins 2026-04-22.dahlia — see
          // Stripe's 2024-10-28 changelog, "you couldn't find refund details in
          // the charge.refunded event".
          //
          // So the delta comes from our own ledger: revoke the cumulative total
          // minus what was already revoked for this charge. Cumulative targets are
          // monotonic, so a replayed or out-of-order delivery computes a delta of
          // zero instead of clawing back the same money twice. handle_refund
          // clamps each call to the balance actually left, so a later refund on
          // the same charge can still collect a shortfall an earlier one could not
          // — never more, in total, than the money Stripe returned.
          const refundLedgerDescription = `Refund for charge ${charge.id}`;
          const [revoked] = await db.query<{ revoked_cents: string | number | null }>(
            `select coalesce(sum(-amount_cents), 0) as revoked_cents
               from credit_transactions
              where user_id = $1 and transaction_type = 'refund' and description = $2`,
            [profile.id, refundLedgerDescription],
          );
          const alreadyRevoked = Number(revoked?.revoked_cents ?? 0) || 0;
          const refundedAmount = Math.max(0, charge.amount_refunded - alreadyRevoked);

          if (refundedAmount > 0) {
            await db.execute('select handle_refund($1, $2, $3)', [
              profile.id,
              refundedAmount,
              refundLedgerDescription,
            ]);
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

            // `past_due`, not `canceled`, deliberately. Entitlement gates on
            // status and neither is entitled (lib/entitlement.ts), but
            // `canceled` is treated as TERMINAL by the ordering guard in
            // updateSubscriptionFromStripeSubscription: writing it here for a
            // subscription Stripe is still billing would refuse every later
            // renewal and lock the customer out permanently. `past_due` heals
            // itself — if the subscription survives the refund, the next paid
            // invoice re-derives the tier from the Price. This also matches how
            // charge.dispute.created already records money going back out.
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
