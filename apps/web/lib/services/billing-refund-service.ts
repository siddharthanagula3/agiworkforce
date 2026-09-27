import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  BILLING_ERROR_REASONS,
  STATUTORY_WITHDRAWAL_DAYS,
  UNUSED_REFUND_WINDOW_DAYS,
  type OperatorAccountBilling,
  type OperatorDisputeView,
  type OperatorRefundRequestView,
  type OperatorRefundStripeReason,
  type RefundAssessment,
  type RefundChargeKind,
  type RefundRequestReason,
  type RefundRequestStatus,
  type RefundRequestView,
  type RefundableChargeView,
} from '@/lib/billing/refund-requests';
import { EEA_COUNTRY_CODES } from '@/lib/eu-access';
import { logger } from '@/lib/logger';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import { getNeonDb } from '@/lib/server/neon-db';
import type { NormalizedCharge, NormalizedPeriod } from '@/lib/server/payments/domain';
import {
  cancelStripeSubscriptionNow,
  listStripeCustomerCharges,
  readStripeCustomerCountry,
  readStripePaymentCustomer,
  readStripePaymentServicePeriod,
  refundStripeCharge,
  retrieveStripeCharge,
} from '@/lib/server/payments/stripe-provider';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { recordNotification } from '@/lib/services/notification-service';

const DAY_MS = 86_400_000;
const CUSTOMER_CHARGE_LIMIT = 24;
const OPERATOR_LIST_LIMIT = 100;
const STATUTORY_WITHDRAWAL_COUNTRIES: ReadonlySet<string> = new Set([...EEA_COUNTRY_CODES, 'GB']);
const STRIPE_REFUND_REFUSALS: Readonly<Record<string, string>> = {
  charge_already_refunded: 'This payment is already refunded.',
  charge_disputed: 'This payment is disputed, so Stripe does not allow a refund while it is open.',
  amount_too_large: 'The amount is more than can still be refunded on this payment.',
  refund_disputed_payment: 'This payment is disputed, so Stripe does not allow a refund.',
};

export class RefundRequestRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'RefundRequestRefusal';
  }
}

interface RefundRequestRow {
  id: string;
  user_id: string;
  charge_id: string;
  charge_kind: RefundChargeKind;
  charge_amount_cents: string | number;
  charge_currency: string;
  charge_created_at: string | Date;
  reason: RefundRequestReason;
  details: string | null;
  statutory_withdrawal: boolean;
  billing_country: string | null;
  assessment: RefundAssessment;
  assessed_refund_cents: string | number | null;
  status: RefundRequestStatus;
  refund_amount_cents: string | number | null;
  decision_note: string | null;
  decided_at: string | Date | null;
  created_at: string | Date;
}

interface DisputeRow {
  id: string;
  charge_id: string;
  amount_cents: string | number;
  currency: string;
  reason: string | null;
  stripe_status: string;
  outcome: 'open' | 'won' | 'lost';
  opened_at: string | Date;
  closed_at: string | Date | null;
  restored_at: string | Date | null;
}

interface CreditPeriodFacts {
  allocatedMicrousd: number;
  usedMicrousd: number;
  topUpMicrousd: number;
}

interface RefundFacts {
  credits: CreditPeriodFacts | null;
  planPeriod: NormalizedPeriod | null;
}

interface RefundDecision {
  assessment: RefundAssessment;
  refundCents: number | null;
}

const REQUEST_COLUMNS = `id, user_id, charge_id, charge_kind, charge_amount_cents, charge_currency,
  charge_created_at, reason, details, statutory_withdrawal, billing_country, assessment,
  assessed_refund_cents, status, refund_amount_cents, decision_note, decided_at, created_at`;

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

function isoOrNull(value: string | Date | null): string | null {
  return value === null ? null : iso(value);
}

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function toRefundRequestView(row: RefundRequestRow): RefundRequestView {
  return {
    id: row.id,
    chargeId: row.charge_id,
    chargeKind: row.charge_kind,
    chargeAmountCents: Number(row.charge_amount_cents),
    chargeCurrency: row.charge_currency,
    chargeCreatedAt: iso(row.charge_created_at),
    reason: row.reason,
    details: row.details,
    assessment: row.assessment,
    assessedRefundCents: numberOrNull(row.assessed_refund_cents),
    status: row.status,
    refundAmountCents: numberOrNull(row.refund_amount_cents),
    decisionNote: row.decision_note,
    decidedAt: isoOrNull(row.decided_at),
    createdAt: iso(row.created_at),
  };
}

function toOperatorRequestView(row: RefundRequestRow): OperatorRefundRequestView {
  return {
    ...toRefundRequestView(row),
    userId: row.user_id,
    billingCountry: row.billing_country,
    statutoryWithdrawal: row.statutory_withdrawal,
  };
}

function toDisputeView(row: DisputeRow): OperatorDisputeView {
  return {
    id: row.id,
    chargeId: row.charge_id,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    reason: row.reason,
    stripeStatus: row.stripe_status,
    outcome: row.outcome,
    openedAt: iso(row.opened_at),
    closedAt: isoOrNull(row.closed_at),
    restoredAt: isoOrNull(row.restored_at),
  };
}

function chargeKindOf(charge: NormalizedCharge): RefundChargeKind {
  return charge.kind === 'top_up' ? 'top_up' : 'plan';
}

function currencyOf(charge: NormalizedCharge): string {
  return charge.amount.currency.toLowerCase();
}

function refundableCentsOf(charge: NormalizedCharge): number {
  return Math.max(0, charge.amount.minorUnits - charge.refundedMinorUnits);
}

function isWithinDays(createdAt: Date, days: number, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= days * DAY_MS;
}

function isWithdrawalCountry(country: string | null): boolean {
  return country !== null && STATUTORY_WITHDRAWAL_COUNTRIES.has(country);
}

function inWithdrawalWindow(charge: NormalizedCharge, now: Date): boolean {
  return isWithinDays(charge.createdAt, STATUTORY_WITHDRAWAL_DAYS, now);
}

async function readRefundFacts(db: DatabaseAdapter, userId: string): Promise<RefundFacts> {
  const [credits] = await db.query<{
    credits_allocated_microusd: string | number;
    credits_used_microusd: string | number;
    top_up_allocated_microusd: string | number;
  }>(
    `select credits_allocated_microusd, credits_used_microusd, top_up_allocated_microusd
       from token_credits
      where user_id = $1 and period_end > now()
      order by period_end desc
      limit 1`,
    [userId],
  );
  const [subscription] = await db.query<{
    current_period_start: string | Date | null;
    current_period_end: string | Date | null;
  }>(
    'select current_period_start, current_period_end from subscriptions where user_id = $1 limit 1',
    [userId],
  );
  const startsAt = subscription?.current_period_start
    ? new Date(subscription.current_period_start)
    : null;
  const endsAt = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  return {
    credits: credits
      ? {
          allocatedMicrousd: Number(credits.credits_allocated_microusd),
          usedMicrousd: Number(credits.credits_used_microusd),
          topUpMicrousd: Number(credits.top_up_allocated_microusd),
        }
      : null,
    planPeriod: startsAt && endsAt ? { startsAt, endsAt } : null,
  };
}

function purchasedRemainingMicrousd(credits: CreditPeriodFacts): number {
  return Math.max(
    0,
    Math.min(credits.topUpMicrousd, credits.allocatedMicrousd - credits.usedMicrousd),
  );
}

function unusedPlanShare(credits: CreditPeriodFacts): number | null {
  const allowance = Math.max(0, credits.allocatedMicrousd - credits.topUpMicrousd);
  if (allowance <= 0) return null;
  const used = Math.min(Math.max(0, credits.usedMicrousd), allowance);
  return (allowance - used) / allowance;
}

function unspentTopUpShare(charge: NormalizedCharge, credits: CreditPeriodFacts): number | null {
  if (charge.purchasedLedgerCents === null) return null;
  const purchased = charge.purchasedLedgerCents * MICROUSD_PER_LEDGER_CENT;
  return Math.min(purchased, purchasedRemainingMicrousd(credits)) / purchased;
}

async function coversCurrentPlanPeriod(
  charge: NormalizedCharge,
  planPeriod: NormalizedPeriod | null,
): Promise<boolean> {
  if (!planPeriod) return false;
  const servicePeriod = charge.paymentReference
    ? await readStripePaymentServicePeriod(charge.paymentReference)
    : null;
  if (servicePeriod) {
    return (
      Math.floor(servicePeriod.endsAt.getTime() / 1000) ===
      Math.floor(planPeriod.endsAt.getTime() / 1000)
    );
  }
  return charge.createdAt >= planPeriod.startsAt && charge.createdAt < planPeriod.endsAt;
}

async function withdrawalRefundCents(
  charge: NormalizedCharge,
  facts: RefundFacts,
): Promise<number | null> {
  if (charge.refundedMinorUnits > 0 || charge.disputed || !facts.credits) return null;
  const share =
    charge.kind === 'top_up'
      ? unspentTopUpShare(charge, facts.credits)
      : (await coversCurrentPlanPeriod(charge, facts.planPeriod))
        ? unusedPlanShare(facts.credits)
        : null;
  return share === null ? null : Math.round(charge.amount.minorUnits * share);
}

function isUnused(charge: NormalizedCharge, credits: CreditPeriodFacts | null): boolean {
  if (!credits) return false;
  if (charge.kind !== 'top_up') return credits.usedMicrousd === 0;
  const purchased = (charge.purchasedLedgerCents ?? 0) * MICROUSD_PER_LEDGER_CENT;
  return purchased > 0 && purchasedRemainingMicrousd(credits) >= purchased;
}

async function billingCountryOf(charge: NormalizedCharge): Promise<string | null> {
  if (charge.billingCountry) return charge.billingCountry;
  const customerCountry = charge.customerReference
    ? await readStripeCustomerCountry(charge.customerReference)
    : null;
  return customerCountry ?? charge.cardCountry;
}

function assessRefundRequest(input: {
  charge: NormalizedCharge;
  reason: RefundRequestReason;
  country: string | null;
  withdrawalCents: number | null;
  unused: boolean;
  priorDiscretionaryRefunds: number;
  now: Date;
}): RefundDecision {
  if (BILLING_ERROR_REASONS.has(input.reason)) {
    return { assessment: 'needs_review', refundCents: null };
  }
  const withdrawalCents =
    input.withdrawalCents === null
      ? null
      : Math.min(input.withdrawalCents, refundableCentsOf(input.charge));
  if (withdrawalCents !== null && withdrawalCents > 0 && isWithdrawalCountry(input.country)) {
    return { assessment: 'statutory_withdrawal', refundCents: withdrawalCents };
  }
  if (
    input.unused &&
    input.priorDiscretionaryRefunds === 0 &&
    isWithinDays(input.charge.createdAt, UNUSED_REFUND_WINDOW_DAYS, input.now)
  ) {
    return { assessment: 'unused_within_policy', refundCents: refundableCentsOf(input.charge) };
  }
  return {
    assessment: 'needs_review',
    refundCents: input.reason === 'statutory_withdrawal' ? withdrawalCents : null,
  };
}

function toRefundableChargeView(
  charge: NormalizedCharge,
  input: { country: string | null; withdrawalEligible: boolean; withdrawalCents: number | null },
): RefundableChargeView {
  return {
    id: charge.reference,
    kind: chargeKindOf(charge),
    amountCents: charge.amount.minorUnits,
    refundedCents: charge.refundedMinorUnits,
    refundableCents: refundableCentsOf(charge),
    currency: currencyOf(charge),
    createdAt: charge.createdAt.toISOString(),
    billingCountry: input.country,
    disputed: charge.disputed,
    withdrawalEligible: input.withdrawalEligible,
    withdrawalRefundCents: input.withdrawalCents,
    receiptUrl: charge.receiptUrl,
  };
}

export async function listRefundableCharges(
  db: DatabaseAdapter,
  userId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<RefundableChargeView[]> {
  const charges = (await listStripeCustomerCharges(customerId, CUSTOMER_CHARGE_LIMIT)).filter(
    (charge) => charge.settled,
  );
  const recent = charges.filter((charge) => inWithdrawalWindow(charge, now));
  const customerCountry = recent.some((charge) => charge.billingCountry === null)
    ? await readStripeCustomerCountry(customerId)
    : null;
  const facts = recent.length > 0 ? await readRefundFacts(db, userId) : null;

  const views: RefundableChargeView[] = [];
  for (const charge of charges) {
    const country = charge.billingCountry ?? customerCountry ?? charge.cardCountry;
    const withdrawalEligible = isWithdrawalCountry(country) && inWithdrawalWindow(charge, now);
    const withdrawalCents =
      withdrawalEligible && facts ? await withdrawalRefundCents(charge, facts) : null;
    views.push(toRefundableChargeView(charge, { country, withdrawalEligible, withdrawalCents }));
  }
  return views;
}

async function countDiscretionaryRefunds(db: DatabaseAdapter, userId: string): Promise<number> {
  const [row] = await db.query<{ refunds: string | number }>(
    `select count(*) as refunds from public.billing_refund_requests
      where user_id = $1 and status = 'refunded' and assessment = 'unused_within_policy'`,
    [userId],
  );
  return Number(row?.refunds ?? 0);
}

export async function listRefundRequests(
  db: DatabaseAdapter,
  userId: string,
): Promise<RefundRequestView[]> {
  const rows = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where user_id = $1
      order by created_at desc
      limit 50`,
    [userId],
  );
  return rows.map(toRefundRequestView);
}

async function findRequestForCharge(
  db: DatabaseAdapter,
  userId: string,
  chargeId: string,
): Promise<RefundRequestRow | null> {
  const [row] = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where user_id = $1 and charge_id = $2
      order by created_at desc
      limit 1`,
    [userId, chargeId],
  );
  return row ?? null;
}

async function recordRefundDecision(
  db: DatabaseAdapter,
  input: {
    requestId: string;
    status: 'refunded' | 'declined';
    decidedBy: 'automatic' | 'operator';
    decidedByUserId: string | null;
    refundAmountCents: number | null;
    stripeRefundId: string | null;
    note: string | null;
  },
): Promise<RefundRequestRow | null> {
  const [row] = await db.query<RefundRequestRow>(
    `update public.billing_refund_requests
        set status = $2,
            decided_by = $3,
            decided_by_user_id = $4,
            refund_amount_cents = $5,
            stripe_refund_id = $6,
            decision_note = $7,
            decided_at = now(),
            updated_at = now()
      where id = $1 and status = 'pending'
      returning ${REQUEST_COLUMNS}`,
    [
      input.requestId,
      input.status,
      input.decidedBy,
      input.decidedByUserId,
      input.refundAmountCents,
      input.stripeRefundId,
      input.note,
    ],
  );
  return row ?? null;
}

async function notifyRefundDecision(db: DatabaseAdapter, row: RefundRequestRow): Promise<void> {
  const refunded = row.status === 'refunded';
  await recordNotification(db, {
    userId: row.user_id,
    category: 'billing',
    severity: refunded ? 'info' : 'warning',
    title: refunded ? 'Your refund is on its way' : 'Your refund request was declined',
    message: refunded
      ? 'We refunded your payment to the card you paid with. Your bank usually shows it within 5 to 10 business days.'
      : `We could not refund this payment. ${row.decision_note ?? ''}`.trim(),
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `refund-request:${row.id}:${row.status}`,
  });
}

async function endPlanAfterRefund(
  subscriptionId: string | null,
  context: Record<string, unknown>,
): Promise<boolean> {
  if (!isStripeSubscriptionId(subscriptionId)) return false;
  try {
    return await cancelStripeSubscriptionNow(subscriptionId);
  } catch (error) {
    logger.error(
      { ...context, error, subscriptionId },
      'Refunded plan could not be canceled in Stripe; the refund stands and the subscription needs an operator',
    );
    return false;
  }
}

export interface FileRefundRequestInput {
  db: DatabaseAdapter;
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  chargeId: string;
  reason: RefundRequestReason;
  details: string | null;
  now?: Date;
}

async function insertRefundRequest(
  input: FileRefundRequestInput,
  charge: NormalizedCharge,
  country: string | null,
  decision: RefundDecision,
): Promise<{ row: RefundRequestRow; created: boolean }> {
  try {
    const [row] = await input.db.query<RefundRequestRow>(
      `insert into public.billing_refund_requests (
         user_id, charge_id, charge_kind, charge_amount_cents, charge_currency,
         charge_created_at, reason, details, statutory_withdrawal, billing_country, assessment,
         assessed_refund_cents
       ) values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12)
       returning ${REQUEST_COLUMNS}`,
      [
        input.userId,
        charge.reference,
        chargeKindOf(charge),
        charge.amount.minorUnits,
        currencyOf(charge),
        charge.createdAt.toISOString(),
        input.reason,
        input.details,
        input.reason === 'statutory_withdrawal',
        country,
        decision.assessment,
        decision.refundCents,
      ],
    );
    if (!row) throw new Error('Refund request insert returned no row');
    return { row, created: true };
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const existing = await findRequestForCharge(input.db, input.userId, charge.reference);
    if (!existing) throw error;
    return { row: existing, created: false };
  }
}

async function settleAutomatically(
  input: FileRefundRequestInput,
  row: RefundRequestRow,
): Promise<RefundRequestRow> {
  const amountCents = numberOrNull(row.assessed_refund_cents);
  if (amountCents === null || amountCents <= 0) return row;

  let result: Awaited<ReturnType<typeof refundStripeCharge>>;
  try {
    result = await refundStripeCharge({
      chargeReference: row.charge_id,
      amountMinorUnits: amountCents,
      reason: 'requested_by_customer',
      metadata: { refund_request_id: row.id, assessment: row.assessment },
      idempotencyKey: `refund-request:${row.id}`,
    });
  } catch (error) {
    logger.error(
      { error, requestId: row.id, chargeId: row.charge_id, userId: input.userId },
      'Automatic refund could not be issued; the request waits for an operator',
    );
    return row;
  }
  if (result.outcome === 'rejected') {
    logger.warn(
      { requestId: row.id, chargeId: row.charge_id, code: result.code },
      'Stripe refused an automatic refund; the request waits for an operator',
    );
    return row;
  }

  if (row.charge_kind === 'plan') {
    await endPlanAfterRefund(input.subscriptionId, { requestId: row.id, userId: input.userId });
  }

  const ownerDb = getNeonDb();
  const decided = await recordRefundDecision(ownerDb, {
    requestId: row.id,
    status: 'refunded',
    decidedBy: 'automatic',
    decidedByUserId: null,
    refundAmountCents: result.refund.amount.minorUnits,
    stripeRefundId: result.refund.reference,
    note: null,
  });
  if (!decided) return row;
  await notifyRefundDecision(ownerDb, decided);
  return decided;
}

export async function fileRefundRequest(
  input: FileRefundRequestInput,
): Promise<{ request: RefundRequestView; created: boolean }> {
  const existing = await findRequestForCharge(input.db, input.userId, input.chargeId);
  if (existing) return { request: toRefundRequestView(existing), created: false };

  const charge = await retrieveStripeCharge(input.chargeId);
  if (!charge || charge.customerReference !== input.customerId) {
    throw new RefundRequestRefusal('That payment is not on your account.', 404);
  }
  if (!charge.settled) {
    throw new RefundRequestRefusal(
      'That payment did not complete, so there is nothing to refund.',
      409,
    );
  }
  if (charge.disputed) {
    throw new RefundRequestRefusal(
      'That payment is disputed with your bank, and the bank decides its outcome, so it cannot also be refunded here.',
      409,
    );
  }
  if (refundableCentsOf(charge) <= 0) {
    throw new RefundRequestRefusal('That payment has already been refunded.', 409);
  }

  const now = input.now ?? new Date();
  const facts = await readRefundFacts(input.db, input.userId);
  const country = await billingCountryOf(charge);
  const decision = assessRefundRequest({
    charge,
    reason: input.reason,
    country,
    withdrawalCents: inWithdrawalWindow(charge, now)
      ? await withdrawalRefundCents(charge, facts)
      : null,
    unused: isUnused(charge, facts.credits),
    priorDiscretionaryRefunds: await countDiscretionaryRefunds(input.db, input.userId),
    now,
  });

  const { row, created } = await insertRefundRequest(input, charge, country, decision);
  if (!created || row.assessment === 'needs_review') {
    return { request: toRefundRequestView(row), created };
  }
  const settled = await settleAutomatically(input, row);
  return { request: toRefundRequestView(settled), created };
}

export async function listPendingRefundRequests(
  db: DatabaseAdapter,
): Promise<OperatorRefundRequestView[]> {
  const rows = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where status = 'pending'
      order by created_at asc
      limit ${OPERATOR_LIST_LIMIT}`,
  );
  return rows.map(toOperatorRequestView);
}

async function customerOfLookup(query: string): Promise<string | null> {
  if (/^(ch|py)_[A-Za-z0-9]+$/.test(query)) {
    return (await retrieveStripeCharge(query))?.customerReference ?? null;
  }
  if (/^pi_[A-Za-z0-9]+$/.test(query)) return readStripePaymentCustomer(query);
  return isStripeCustomerId(query) ? query : null;
}

async function resolveOperatorQuery(
  db: DatabaseAdapter,
  query: string,
): Promise<{ id: string; email: string | null; stripe_customer_id: string | null } | null> {
  const customerId = await customerOfLookup(query);
  const [profile] = customerId
    ? await db.query<{ id: string; email: string | null; stripe_customer_id: string | null }>(
        'select id, email, stripe_customer_id from profiles where stripe_customer_id = $1 limit 1',
        [customerId],
      )
    : await db.query<{ id: string; email: string | null; stripe_customer_id: string | null }>(
        `select id, email, stripe_customer_id from profiles
          where id = $1 or lower(email) = lower($1)
          order by (id = $1) desc
          limit 1`,
        [query],
      );
  return profile ?? null;
}

export async function lookupAccountBilling(
  db: DatabaseAdapter,
  rawQuery: string,
  now: Date = new Date(),
): Promise<OperatorAccountBilling | null> {
  const profile = await resolveOperatorQuery(db, rawQuery.trim());
  if (!profile) return null;

  const [subscription] = await db.query<{
    plan_tier: string | null;
    status: string | null;
    stripe_customer_id: string | null;
  }>('select plan_tier, status, stripe_customer_id from subscriptions where user_id = $1 limit 1', [
    profile.id,
  ]);
  const customerId = isStripeCustomerId(profile.stripe_customer_id)
    ? profile.stripe_customer_id
    : isStripeCustomerId(subscription?.stripe_customer_id)
      ? subscription.stripe_customer_id
      : null;

  const charges = customerId ? await listRefundableCharges(db, profile.id, customerId, now) : [];
  const requests = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where user_id = $1 order by created_at desc limit ${OPERATOR_LIST_LIMIT}`,
    [profile.id],
  );
  const disputes = await db.query<DisputeRow>(
    `select id, charge_id, amount_cents, currency, reason, stripe_status, outcome,
            opened_at, closed_at, restored_at
       from public.billing_disputes
      where user_id = $1
      order by opened_at desc
      limit ${OPERATOR_LIST_LIMIT}`,
    [profile.id],
  );

  return {
    userId: profile.id,
    email: profile.email,
    stripeCustomerId: customerId,
    planTier: subscription?.plan_tier ?? null,
    subscriptionStatus: subscription?.status ?? null,
    charges,
    requests: requests.map(toOperatorRequestView),
    disputes: disputes.map(toDisputeView),
  };
}

export interface OperatorRefundInput {
  operatorUserId: string;
  chargeId: string;
  amountCents: number | null;
  note: string;
  stripeReason: OperatorRefundStripeReason;
  requestId: string | null;
  endPlan: boolean;
  idempotencyKey: string;
}

export interface OperatorRefundResult {
  refundId: string;
  refundStatus: string | null;
  amountCents: number;
  currency: string;
  userId: string | null;
  planEnded: boolean;
  request: OperatorRefundRequestView | null;
}

async function readPendingRequest(
  db: DatabaseAdapter,
  requestId: string,
  chargeId: string,
): Promise<{ assessment: RefundAssessment; assessedCents: number | null }> {
  const [pending] = await db.query<{
    charge_id: string;
    status: string;
    assessment: RefundAssessment;
    assessed_refund_cents: string | number | null;
  }>(
    `select charge_id, status, assessment, assessed_refund_cents
       from public.billing_refund_requests
      where id = $1`,
    [requestId],
  );
  if (!pending || pending.charge_id !== chargeId || pending.status !== 'pending') {
    throw new RefundRequestRefusal('That refund request is not pending for this payment.', 409);
  }
  return {
    assessment: pending.assessment,
    assessedCents: numberOrNull(pending.assessed_refund_cents),
  };
}

export async function issueOperatorRefund(
  db: DatabaseAdapter,
  input: OperatorRefundInput,
): Promise<OperatorRefundResult> {
  const charge = await retrieveStripeCharge(input.chargeId);
  if (!charge) throw new RefundRequestRefusal('No payment has that charge id.', 404);
  if (charge.disputed) {
    throw new RefundRequestRefusal(
      'This payment is disputed. Stripe does not allow a refund while the dispute is open; answer or accept the dispute instead.',
      409,
    );
  }
  const refundable = refundableCentsOf(charge);
  const amountCents = input.amountCents ?? refundable;
  if (refundable <= 0) throw new RefundRequestRefusal('This payment is already refunded.', 409);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > refundable) {
    throw new RefundRequestRefusal(
      `The refund must be between 1 and ${refundable} in the smallest currency unit.`,
      400,
    );
  }

  const pending = input.requestId
    ? await readPendingRequest(db, input.requestId, charge.reference)
    : null;
  const statutoryFloor =
    pending?.assessment === 'statutory_withdrawal' ? (pending.assessedCents ?? 0) : 0;
  if (amountCents < Math.min(statutoryFloor, refundable)) {
    throw new RefundRequestRefusal(
      `This is a statutory withdrawal, so the refund must be at least ${statutoryFloor} in the smallest currency unit.`,
      400,
    );
  }

  const [owner] = charge.customerReference
    ? await db.query<{ user_id: string; stripe_subscription_id: string | null }>(
        `select profile.id as user_id, subscription.stripe_subscription_id
           from profiles profile
           left join subscriptions subscription on subscription.user_id = profile.id
          where profile.stripe_customer_id = $1
          limit 1`,
        [charge.customerReference],
      )
    : [];

  const result = await refundStripeCharge({
    chargeReference: charge.reference,
    amountMinorUnits: amountCents,
    reason: input.stripeReason,
    metadata: {
      operator_user_id: input.operatorUserId,
      ...(input.requestId ? { refund_request_id: input.requestId } : {}),
    },
    idempotencyKey: `operator-refund:${charge.reference}:${input.idempotencyKey}`,
  });
  if (result.outcome === 'rejected') {
    logger.warn(
      { chargeId: charge.reference, code: result.code },
      'Stripe refused an operator refund',
    );
    throw new RefundRequestRefusal(
      STRIPE_REFUND_REFUSALS[result.code ?? ''] ??
        'Stripe refused the refund. Open the payment in the Stripe dashboard to see why.',
      409,
    );
  }
  const refund = result.refund;

  const planEnded =
    input.endPlan && chargeKindOf(charge) === 'plan'
      ? await endPlanAfterRefund(owner?.stripe_subscription_id ?? null, {
          chargeId: charge.reference,
          operatorUserId: input.operatorUserId,
        })
      : false;

  let request: OperatorRefundRequestView | null = null;
  if (input.requestId) {
    const decided = await recordRefundDecision(db, {
      requestId: input.requestId,
      status: 'refunded',
      decidedBy: 'operator',
      decidedByUserId: input.operatorUserId,
      refundAmountCents: refund.amount.minorUnits,
      stripeRefundId: refund.reference,
      note: input.note,
    });
    if (decided) {
      await notifyRefundDecision(db, decided);
      request = toOperatorRequestView(decided);
    }
  }

  return {
    refundId: refund.reference,
    refundStatus: refund.status,
    amountCents: refund.amount.minorUnits,
    currency: refund.amount.currency.toLowerCase(),
    userId: owner?.user_id ?? null,
    planEnded,
    request,
  };
}

export async function declineRefundRequest(
  db: DatabaseAdapter,
  input: { operatorUserId: string; requestId: string; note: string },
): Promise<OperatorRefundRequestView> {
  const decided = await recordRefundDecision(db, {
    requestId: input.requestId,
    status: 'declined',
    decidedBy: 'operator',
    decidedByUserId: input.operatorUserId,
    refundAmountCents: null,
    stripeRefundId: null,
    note: input.note,
  });
  if (!decided) throw new RefundRequestRefusal('That refund request is no longer pending.', 409);
  await notifyRefundDecision(db, decided);
  return toOperatorRequestView(decided);
}
