import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import type { Stripe } from '@/lib/stripe-types';
import { recordNotification } from '@/lib/services/notification-service';
import { toStoredSubscriptionStatus } from './subscription-status';

const MERCHANT_KEPT_FUNDS: ReadonlySet<string> = new Set(['won', 'warning_closed', 'prevented']);

interface DisputeRow {
  id: string;
  user_id: string | null;
  stripe_customer_id: string | null;
  outcome: 'open' | 'won' | 'lost';
  revoked_account_id: string | null;
  revoked_credits_microusd: string | number;
  revoked_top_up_microusd: string | number;
  prior_subscription_status: string | null;
  prior_cancel_at_period_end: boolean | null;
  revoked_at: string | null;
  restored_at: string | null;
}

interface Revocation {
  account_id: string | null;
  revoked_microusd: string | number;
  top_up_microusd: string | number;
}

function chargeIdOf(dispute: Stripe.Dispute): string {
  return typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
}

function customerIdOf(customer: Stripe.Charge['customer']): string | null {
  if (typeof customer === 'string') return customer;
  return customer?.id ?? null;
}

function microusd(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

async function findAccountByCustomer(
  db: DatabaseAdapter,
  stripeCustomerId: string,
): Promise<string | null> {
  const [profile] = await db.query<{ id: string }>(
    'select id from profiles where stripe_customer_id = $1 limit 1',
    [stripeCustomerId],
  );
  return profile?.id ?? null;
}

async function readDispute(db: DatabaseAdapter, disputeId: string): Promise<DisputeRow | null> {
  const [row] = await db.query<DisputeRow>(
    `select id, user_id, stripe_customer_id, outcome, revoked_account_id,
            revoked_credits_microusd, revoked_top_up_microusd,
            prior_subscription_status, prior_cancel_at_period_end, revoked_at, restored_at
       from public.billing_disputes
      where id = $1
      for update`,
    [disputeId],
  );
  return row ?? null;
}

interface DisputeParties {
  chargeId: string;
  stripeCustomerId: string | null;
  userId: string | null;
}

async function resolveParties(db: DatabaseAdapter, charge: Stripe.Charge): Promise<DisputeParties> {
  const stripeCustomerId = customerIdOf(charge.customer);
  const userId = stripeCustomerId ? await findAccountByCustomer(db, stripeCustomerId) : null;
  return { chargeId: charge.id, stripeCustomerId, userId };
}

async function recordDispute(
  db: DatabaseAdapter,
  dispute: Stripe.Dispute,
  parties: DisputeParties,
): Promise<DisputeRow | null> {
  await db.execute(
    `insert into public.billing_disputes (
       id, user_id, stripe_customer_id, charge_id, amount_cents, currency, reason,
       stripe_status, opened_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
     on conflict (id) do nothing`,
    [
      dispute.id,
      parties.userId,
      parties.stripeCustomerId,
      parties.chargeId,
      dispute.amount,
      dispute.currency,
      dispute.reason ?? null,
      dispute.status,
      dispute.created,
    ],
  );
  return readDispute(db, dispute.id);
}

export async function handleDisputeCreated(
  db: DatabaseAdapter,
  dispute: Stripe.Dispute,
  charge: Stripe.Charge,
): Promise<void> {
  logger.warn(
    {
      disputeId: dispute.id,
      chargeId: chargeIdOf(dispute),
      amount: dispute.amount,
      reason: dispute.reason,
    },
    'CRITICAL: Charge dispute created - requires immediate attention',
  );

  const parties = await resolveParties(db, charge);
  const row = await recordDispute(db, dispute, parties);
  if (!row || row.revoked_at || row.outcome !== 'open') {
    logger.info(
      { disputeId: dispute.id, outcome: row?.outcome ?? null },
      'Dispute hold already applied or no longer needed',
    );
    return;
  }
  if (!parties.stripeCustomerId || !parties.userId) {
    logger.error(
      { stripeCustomerId: parties.stripeCustomerId, disputeId: dispute.id },
      'Could not find user for disputed charge',
    );
    return;
  }

  const [subscription] = await db.query<{
    status: string | null;
    cancel_at_period_end: boolean | null;
  }>(
    `select status, cancel_at_period_end from subscriptions
      where stripe_customer_id = $1 limit 1 for update`,
    [parties.stripeCustomerId],
  );
  await db.execute(
    "update subscriptions set status = 'past_due', cancel_at_period_end = true where stripe_customer_id = $1",
    [parties.stripeCustomerId],
  );

  const [revocation] = await db.query<Revocation>(
    'select * from public.revoke_disputed_credits_microusd($1, $2)',
    [parties.userId, dispute.id],
  );
  const revokedMicrousd = microusd(revocation?.revoked_microusd);
  await db.execute(
    `update public.billing_disputes
        set revoked_at = now(),
            revoked_account_id = $2,
            revoked_credits_microusd = $3,
            revoked_top_up_microusd = $4,
            prior_subscription_status = $5,
            prior_cancel_at_period_end = $6,
            updated_at = now()
      where id = $1`,
    [
      dispute.id,
      revocation?.account_id ?? null,
      revokedMicrousd,
      microusd(revocation?.top_up_microusd),
      subscription?.status ?? null,
      subscription?.cancel_at_period_end ?? null,
    ],
  );

  await recordAuditEvent({
    userId: parties.userId,
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
      userId: parties.userId,
      disputeId: dispute.id,
      chargeId: parties.chargeId,
      amount: dispute.amount,
      reason: dispute.reason,
      revokedMicrousd,
    },
    'ALERT: User subscription flagged due to dispute',
  );
}

async function recordDisputeOpenedBeforeTracking(
  db: DatabaseAdapter,
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<DisputeRow | null> {
  const parties = await resolveParties(db, await stripe.charges.retrieve(chargeIdOf(dispute)));
  await recordDispute(db, dispute, parties);

  const [deduction] = parties.userId
    ? await db.query<{
        credit_account_id: string;
        revoked_microusd: string | number;
        created_at: string | Date;
      }>(
        `select credit_account_id, amount_microusd as revoked_microusd, created_at
           from public.credit_transactions
          where user_id = $1
            and transaction_type = 'deduction'
            and metadata->>'idempotency_key' = $2
          limit 1`,
        [parties.userId, `stripe-dispute:${dispute.id}`],
      )
    : [];
  if (deduction && parties.userId) {
    const [account] = await db.query<{ top_up_allocated_microusd: string | number }>(
      'select top_up_allocated_microusd from public.token_credits where id = $1 and user_id = $2',
      [deduction.credit_account_id, parties.userId],
    );
    const revokedMicrousd = microusd(deduction.revoked_microusd);
    await db.execute(
      `update public.billing_disputes
          set revoked_at = $2,
              revoked_account_id = $3,
              revoked_credits_microusd = $4,
              revoked_top_up_microusd = $5,
              updated_at = now()
        where id = $1 and revoked_at is null`,
      [
        dispute.id,
        deduction.created_at,
        deduction.credit_account_id,
        revokedMicrousd,
        Math.min(revokedMicrousd, microusd(account?.top_up_allocated_microusd)),
      ],
    );
  }
  logger.warn(
    { disputeId: dispute.id, userId: parties.userId, legacyRevocation: Boolean(deduction) },
    'Dispute reached its outcome without a recorded opening; its revocation was read back from the ledger',
  );
  return readDispute(db, dispute.id);
}

async function liftDisputeHold(
  db: DatabaseAdapter,
  stripe: Stripe,
  dispute: DisputeRow,
): Promise<boolean> {
  if (!dispute.stripe_customer_id) return false;

  const [stillOpen] = await db.query<{ id: string }>(
    `select id from public.billing_disputes
      where stripe_customer_id = $1 and outcome = 'open' and id <> $2
      limit 1`,
    [dispute.stripe_customer_id, dispute.id],
  );
  if (stillOpen) {
    logger.info(
      { disputeId: dispute.id, openDisputeId: stillOpen.id },
      'Plan hold stays while another dispute on the account is open',
    );
    return false;
  }

  const [subscription] = await db.query<{
    stripe_subscription_id: string | null;
    status: string | null;
    cancel_at_period_end: boolean | null;
  }>(
    `select stripe_subscription_id, status, cancel_at_period_end from subscriptions
      where stripe_customer_id = $1 limit 1 for update`,
    [dispute.stripe_customer_id],
  );
  if (!subscription || subscription.status !== 'past_due' || !subscription.cancel_at_period_end) {
    return false;
  }

  let status = dispute.prior_subscription_status;
  let cancelAtPeriodEnd = dispute.prior_cancel_at_period_end ?? false;
  if (isStripeSubscriptionId(subscription.stripe_subscription_id)) {
    const live = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    status = toStoredSubscriptionStatus(live.status);
    cancelAtPeriodEnd = live.cancel_at_period_end;
  }
  if (!status) return false;

  await db.execute(
    'update subscriptions set status = $2, cancel_at_period_end = $3 where stripe_customer_id = $1',
    [dispute.stripe_customer_id, status, cancelAtPeriodEnd],
  );
  return true;
}

async function restoreWonDispute(
  db: DatabaseAdapter,
  stripe: Stripe,
  dispute: DisputeRow,
  stripeStatus: string,
  closedAtSeconds: number,
): Promise<void> {
  const claimed = await db.query<{ id: string }>(
    `update public.billing_disputes
        set outcome = 'won',
            stripe_status = $2,
            closed_at = coalesce(closed_at, to_timestamp($3)),
            restored_at = now(),
            restored_credits_microusd = 0,
            updated_at = now()
      where id = $1 and restored_at is null
      returning id`,
    [dispute.id, stripeStatus, closedAtSeconds],
  );
  if (claimed.length === 0) return;
  if (!dispute.user_id) return;

  const revokedMicrousd = microusd(dispute.revoked_credits_microusd);
  let restoredMicrousd = 0;
  if (revokedMicrousd > 0 && dispute.revoked_account_id) {
    const [restored] = await db.query<{ restored: string | number }>(
      'select public.restore_disputed_credits_microusd($1, $2, $3, $4, $5) as restored',
      [
        dispute.user_id,
        dispute.id,
        dispute.revoked_account_id,
        revokedMicrousd,
        microusd(dispute.revoked_top_up_microusd),
      ],
    );
    restoredMicrousd = microusd(restored?.restored);
    await db.execute(
      'update public.billing_disputes set restored_credits_microusd = $2 where id = $1',
      [dispute.id, restoredMicrousd],
    );
  }

  const planRestored = await liftDisputeHold(db, stripe, dispute);

  await recordAuditEvent({
    userId: dispute.user_id,
    eventType: 'plan_changed',
    endpoint: '/api/stripe-webhook',
    surface: 'stripe_webhook',
    detail: {
      resourceType: 'subscription',
      resourceId: dispute.id,
      source: 'stripe_webhook',
      status: stripeStatus,
      reason: 'charge_dispute_won',
    },
  });

  await recordNotification(db, {
    userId: dispute.user_id,
    category: 'billing',
    severity: 'info',
    title: 'Your plan and credits are back',
    message: planRestored
      ? 'The payment dispute on your account has closed, so your plan and the credits held during it are available again.'
      : 'The payment dispute on your account has closed, so the credits held during it are available again.',
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `dispute-restored:${dispute.id}`,
  });

  logger.info(
    { disputeId: dispute.id, userId: dispute.user_id, restoredMicrousd, planRestored },
    'Won dispute restored what its opening revoked',
  );
}

async function closeLostDispute(
  db: DatabaseAdapter,
  dispute: DisputeRow,
  stripeStatus: string,
  closedAtSeconds: number,
): Promise<void> {
  if (dispute.restored_at) {
    logger.error(
      { disputeId: dispute.id, userId: dispute.user_id },
      'A dispute already restored as won is now reported lost; the restoration stands and needs an operator',
    );
  }
  const closed = await db.query<{ id: string }>(
    `update public.billing_disputes
        set outcome = 'lost',
            stripe_status = $2,
            closed_at = coalesce(closed_at, to_timestamp($3)),
            updated_at = now()
      where id = $1 and outcome <> 'lost'
      returning id`,
    [dispute.id, stripeStatus, closedAtSeconds],
  );
  if (closed.length === 0 || !dispute.user_id) return;

  await recordAuditEvent({
    userId: dispute.user_id,
    eventType: 'plan_changed',
    severity: 'warning',
    endpoint: '/api/stripe-webhook',
    surface: 'stripe_webhook',
    detail: {
      resourceType: 'subscription',
      resourceId: dispute.id,
      source: 'stripe_webhook',
      status: stripeStatus,
      reason: 'charge_dispute_lost',
    },
  });
  logger.warn(
    { disputeId: dispute.id, userId: dispute.user_id },
    'Dispute lost; the plan hold and the revoked credits are final',
  );
}

export async function handleDisputeOutcome(
  db: DatabaseAdapter,
  stripe: Stripe,
  dispute: Stripe.Dispute,
  eventCreatedSeconds: number,
): Promise<void> {
  const row =
    (await readDispute(db, dispute.id)) ??
    (await recordDisputeOpenedBeforeTracking(db, stripe, dispute));
  if (!row) return;

  if (MERCHANT_KEPT_FUNDS.has(dispute.status)) {
    await restoreWonDispute(db, stripe, row, dispute.status, eventCreatedSeconds);
  } else if (dispute.status === 'lost') {
    await closeLostDispute(db, row, dispute.status, eventCreatedSeconds);
  } else {
    await db.execute(
      'update public.billing_disputes set stripe_status = $2, updated_at = now() where id = $1',
      [dispute.id, dispute.status],
    );
  }
}
