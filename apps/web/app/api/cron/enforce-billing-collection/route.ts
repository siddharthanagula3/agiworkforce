import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';
import { recordNotification } from '@/lib/services/notification-service';
import {
  deriveCollectionState,
  type CollectionStage,
} from '@/lib/services/enterprise-collection-state';
import { getOrganizationSeatState } from '@/lib/services/organization-seat-service';
import {
  persistPurchasedSeatsOnOrganization,
  type SeatPersistenceOutcome,
} from '@/app/api/stripe-webhook/lib/seats';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Every row in this sweep sends mail and writes an audit event. Unbounded, a
// backlog outruns maxDuration and the run is killed after some were notified.
const MAX_CONTRACTS_PER_PAGE = 200;
const SWEEP_BUDGET_MS = 240_000;
const AUDIT_ENDPOINT = '/api/cron/enforce-billing-collection';
const AUDIT_SURFACE = 'cron';
const COLLECTION_STAGE_CHANGED_AUDIT_REASON = 'collection_stage_changed';
const CURRENT_COLLECTION_STAGE: CollectionStage = 'current';
const SEAT_CATCH_UP_PLAN_TIER = 'enterprise';

const OWNER_NOTICE_STAGES = new Set<CollectionStage>(['past_due_30', 'past_due_60', 'read_only']);
const DAILY_INTERNAL_REPEAT_STAGES = new Set<CollectionStage>([
  'past_due_60',
  'past_due_90',
  'read_only',
]);

const STAGE_LABELS: Record<CollectionStage, string> = {
  current: 'current',
  past_due_30: 'past due (1-30 days)',
  past_due_60: 'past due (31-60 days)',
  past_due_90: 'past due (61-90 days)',
  read_only: 'read-only for non-payment',
};

interface ContractRow {
  organization_id: string;
  oldest_open_invoice_due_at: string | null;
  collection_stage: CollectionStage;
  last_collection_notice_at: string | null;
  owner_email: string | null;
  owner_user_id: string | null;
  committed_seats: number;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  owner_notice_pending_stage: CollectionStage | null;
  owner_notice_pending_since: string | Date | null;
  owner_notice_email_delivered_at: string | Date | null;
  owner_notice_in_app_recorded_at: string | Date | null;
}

export type OwnerNoticeChannelOutcome =
  'delivered' | 'already_delivered' | 'failed' | 'no_recipient';

export interface OwnerNoticeOutcome {
  stage: CollectionStage;
  email: OwnerNoticeChannelOutcome;
  inApp: OwnerNoticeChannelOutcome;
}

export interface CollectionStageOutcome {
  organizationId: string;
  previousStage: CollectionStage;
  stage: CollectionStage;
  daysPastDue: number;
  changed: boolean;
  ownerNotified: boolean;
  ownerNotice: OwnerNoticeOutcome | null;
  internalNotified: boolean;
  seatCatchUp: SeatPersistenceOutcome | null;
}

export interface CollectionSweepResult {
  outcomes: CollectionStageOutcome[];
  backlog: boolean;
}

async function loadEnterpriseContractsNeedingReview(
  db: DatabaseAdapter,
  reviewedOrganizationIds: readonly string[],
): Promise<ContractRow[]> {
  return db.query<ContractRow>(
    `select c.organization_id,
            c.oldest_open_invoice_due_at,
            c.collection_stage,
            c.last_collection_notice_at,
            c.committed_seats,
            c.stripe_subscription_id,
            c.stripe_customer_id,
            c.owner_notice_pending_stage,
            c.owner_notice_pending_since,
            c.owner_notice_email_delivered_at,
            c.owner_notice_in_app_recorded_at,
            p.email as owner_email,
            o.owner_user_id
       from public.organization_billing_contracts c
       join public.organizations o on o.id = c.organization_id
       left join public.profiles p on p.id = o.owner_user_id
      where c.ended_at is null
        and (c.oldest_open_invoice_due_at is not null or c.collection_stage <> $1::text)
        and not (c.organization_id = any ($3::uuid[]))
      order by c.collection_reviewed_at asc nulls first,
               c.oldest_open_invoice_due_at asc nulls last,
               c.organization_id asc
      limit $2`,
    [CURRENT_COLLECTION_STAGE, MAX_CONTRACTS_PER_PAGE, reviewedOrganizationIds],
  );
}

async function stampCollectionReview(
  db: DatabaseAdapter,
  organizationId: string,
  nowIso: string,
): Promise<void> {
  await db.execute(
    `update public.organization_billing_contracts
        set collection_reviewed_at = $2::timestamptz
      where organization_id = $1::uuid`,
    [organizationId, nowIso],
  );
}

function isoOf(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function internalNoticeThrottleAllows(lastNoticeAtIso: string | null, nowMs: number): boolean {
  if (!lastNoticeAtIso) return true;
  const lastMs = Date.parse(lastNoticeAtIso);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= MS_PER_DAY;
}

function ownerNoticeContent(
  stage: CollectionStage,
  daysPastDue: number,
): { subject: string; text: string; html: string } {
  const label = STAGE_LABELS[stage];
  const text =
    stage === 'read_only'
      ? `Your workspace is now read-only because an invoice has been unpaid for ${daysPastDue} days. Existing data is retained; new work is blocked until payment is received. Contact billing support to resolve this.`
      : `Your workspace billing is ${label}: an invoice has been unpaid for ${daysPastDue} days. Please arrange payment to avoid further restrictions on your account.`;
  return {
    subject: `Billing action needed: workspace is ${label}`,
    text,
    html: `<p>${text}</p>`,
  };
}

function internalNoticeContent(
  organizationId: string,
  stage: CollectionStage,
  daysPastDue: number,
): { subject: string; text: string; html: string } {
  const label = STAGE_LABELS[stage];
  const text = `Organization ${organizationId} is ${label} (${daysPastDue} days past due on its oldest open invoice).`;
  return {
    subject: `[billing] organization ${organizationId} is ${label}`,
    text,
    html: `<p>${text}</p>`,
  };
}

async function reconcileSeatCatchUp(
  db: DatabaseAdapter,
  contract: Pick<
    ContractRow,
    'organization_id' | 'committed_seats' | 'stripe_subscription_id' | 'stripe_customer_id'
  >,
): Promise<SeatPersistenceOutcome | null> {
  const seatState = await getOrganizationSeatState(db, contract.organization_id);
  if (!seatState?.ownerUserId) return null;
  if (contract.committed_seats <= seatState.licensedSeats) return null;

  const outcome = await persistPurchasedSeatsOnOrganization(db, {
    ownerUserId: seatState.ownerUserId,
    seats: contract.committed_seats,
    premiumSeats: 0,
    planTier: SEAT_CATCH_UP_PLAN_TIER,
    stripeSubscriptionId: contract.stripe_subscription_id,
    stripeCustomerId: contract.stripe_customer_id,
  });

  if (outcome === 'persisted') {
    logger.info(
      {
        organizationId: contract.organization_id,
        fromLicensedSeats: seatState.licensedSeats,
        toLicensedSeats: contract.committed_seats,
      },
      'Enterprise seat catch-up raised licensed_seats to committed_seats now that collection is current',
    );
  } else {
    logger.warn(
      {
        organizationId: contract.organization_id,
        committedSeats: contract.committed_seats,
        licensedSeats: seatState.licensedSeats,
        outcome,
      },
      'Enterprise seat catch-up did not apply',
    );
  }

  return outcome;
}

export async function enforceBillingCollection(
  db: DatabaseAdapter,
  nowMs: number = Date.now(),
): Promise<CollectionSweepResult> {
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  const billingAlertEmail = process.env['BILLING_ALERT_EMAIL']?.trim() || null;
  const fromEmail = getHandoffConfig().fromEmail;
  const outcomes: CollectionStageOutcome[] = [];
  const reviewed = new Set<string>();
  const failures: unknown[] = [];
  const nowIso = new Date(nowMs).toISOString();
  let backlog = false;

  let contracts: ContractRow[];
  let reviewedBeforePage: number;
  do {
    reviewedBeforePage = reviewed.size;
    contracts = await loadEnterpriseContractsNeedingReview(db, [...reviewed]);
    for (const contract of contracts) {
      if (Date.now() >= deadline) {
        backlog = true;
        break;
      }
      if (reviewed.has(contract.organization_id)) continue;
      reviewed.add(contract.organization_id);
      try {
        outcomes.push(await reviewContract(db, contract, nowMs, billingAlertEmail, fromEmail));
      } catch (error) {
        failures.push(error);
        logger.error(
          {
            organizationId: contract.organization_id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Enterprise collection enforcement failed for one contract; the rest continue',
        );
      }
      try {
        await stampCollectionReview(db, contract.organization_id, nowIso);
      } catch (error) {
        failures.push(error);
        logger.error(
          {
            organizationId: contract.organization_id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Enterprise collection review time could not be recorded; the contract goes first next run',
        );
      }
    }
  } while (
    !backlog &&
    contracts.length === MAX_CONTRACTS_PER_PAGE &&
    reviewed.size > reviewedBeforePage
  );

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} enterprise contract(s) failed collection enforcement`,
    );
  }

  return { outcomes, backlog };
}

interface OwedOwnerNotice {
  since: string;
  emailDelivered: boolean;
  inAppRecorded: boolean;
}

function owedOwnerNotice(contract: ContractRow, stage: CollectionStage): OwedOwnerNotice | null {
  if (contract.owner_notice_pending_stage !== stage) return null;
  const since = isoOf(contract.owner_notice_pending_since);
  if (!since) return null;
  const notice = {
    since,
    emailDelivered: contract.owner_notice_email_delivered_at !== null,
    inAppRecorded: contract.owner_notice_in_app_recorded_at !== null,
  };
  return notice.emailDelivered && notice.inAppRecorded ? null : notice;
}

async function stampOwnerNoticeChannel(
  db: DatabaseAdapter,
  organizationId: string,
  stage: CollectionStage,
  since: string,
  column: 'owner_notice_email_delivered_at' | 'owner_notice_in_app_recorded_at',
  nowIso: string,
): Promise<void> {
  await db.execute(
    `update public.organization_billing_contracts
        set ${column} = coalesce(${column}, $4::timestamptz)
      where organization_id = $1::uuid
        and owner_notice_pending_stage = $2::text
        and owner_notice_pending_since = $3::timestamptz`,
    [organizationId, stage, since, nowIso],
  );
}

async function deliverOwnerNotice(
  db: DatabaseAdapter,
  contract: ContractRow,
  stage: CollectionStage,
  daysPastDue: number,
  owed: OwedOwnerNotice,
  options: { fromEmail: string; nowIso: string },
): Promise<OwnerNoticeOutcome> {
  const content = ownerNoticeContent(stage, daysPastDue);
  const organizationId = contract.organization_id;

  let inApp: OwnerNoticeChannelOutcome = 'already_delivered';
  if (!owed.inAppRecorded) {
    if (!contract.owner_user_id) {
      inApp = 'no_recipient';
    } else {
      const recorded = await recordNotification(db, {
        userId: contract.owner_user_id,
        category: 'billing',
        severity: stage === 'read_only' ? 'error' : 'warning',
        title: content.subject,
        message: content.text,
        target: { kind: 'settings', id: 'billing' },
        dedupeKey: `billing-collection:${organizationId}:${stage}:${owed.since.slice(0, 10)}`,
      });
      inApp = recorded.failed ? 'failed' : 'delivered';
      if (inApp === 'delivered') {
        await stampOwnerNoticeChannel(
          db,
          organizationId,
          stage,
          owed.since,
          'owner_notice_in_app_recorded_at',
          options.nowIso,
        );
      }
    }
  }

  let email: OwnerNoticeChannelOutcome = 'already_delivered';
  if (!owed.emailDelivered) {
    if (!contract.owner_email) {
      email = 'no_recipient';
    } else {
      const sent = await sendTransactionalEmail({
        from: options.fromEmail,
        to: contract.owner_email,
        ...content,
        idempotencyKey: `billing-collection-owner:${organizationId}:${stage}:${owed.since}:${options.nowIso.slice(0, 10)}`,
      });
      email = sent.delivered ? 'delivered' : 'failed';
      if (sent.delivered) {
        await stampOwnerNoticeChannel(
          db,
          organizationId,
          stage,
          owed.since,
          'owner_notice_email_delivered_at',
          options.nowIso,
        );
      } else {
        logger.error(
          { organizationId, stage, reason: sent.reason },
          'Enterprise collection owner notice could not be delivered; the next run retries it',
        );
      }
    }
  }

  if (email === 'no_recipient' || inApp === 'no_recipient') {
    logger.error(
      { organizationId, stage, email, inApp },
      'Enterprise collection owner notice has no recipient on a channel; it stays owed until one is on file',
    );
  }

  return { stage, email, inApp };
}

async function reviewContract(
  db: DatabaseAdapter,
  contract: ContractRow,
  nowMs: number,
  billingAlertEmail: string | null,
  fromEmail: string,
): Promise<CollectionStageOutcome> {
  const state = deriveCollectionState(nowMs, contract.oldest_open_invoice_due_at);
  const changed = state.stage !== contract.collection_stage;
  const nowIso = new Date(nowMs).toISOString();

  if (changed) {
    const owedNoticeStage = OWNER_NOTICE_STAGES.has(state.stage) ? state.stage : null;
    await db.execute(
      `update public.organization_billing_contracts
          set collection_stage = $2,
              collection_stage_changed_at = $3,
              owner_notice_pending_stage = $4::text,
              owner_notice_pending_since = case when $4::text is null then null else $3::timestamptz end,
              owner_notice_email_delivered_at = null,
              owner_notice_in_app_recorded_at = null
        where organization_id = $1`,
      [contract.organization_id, state.stage, nowIso, owedNoticeStage],
    );
    await recordAuditEvent({
      organizationId: contract.organization_id,
      eventType: 'plan_changed',
      severity: state.stage === 'current' ? 'info' : 'warning',
      endpoint: AUDIT_ENDPOINT,
      surface: AUDIT_SURFACE,
      detail: {
        resourceType: 'organization_billing_contract',
        resourceId: contract.organization_id,
        reason: COLLECTION_STAGE_CHANGED_AUDIT_REASON,
        status: state.stage,
        previousPlanTier: contract.collection_stage,
      },
    });
  }

  const owedNotice = changed
    ? OWNER_NOTICE_STAGES.has(state.stage)
      ? { since: nowIso, emailDelivered: false, inAppRecorded: false }
      : null
    : owedOwnerNotice(contract, state.stage);
  const ownerNotice = owedNotice
    ? await deliverOwnerNotice(db, contract, state.stage, state.daysPastDue, owedNotice, {
        fromEmail,
        nowIso,
      })
    : null;
  const ownerNotified = ownerNotice?.email === 'delivered';

  let internalNotified = false;
  const wantsInternalNotice = changed || DAILY_INTERNAL_REPEAT_STAGES.has(state.stage);
  if (wantsInternalNotice) {
    if (!billingAlertEmail) {
      logger.error(
        { organizationId: contract.organization_id, stage: state.stage },
        'BILLING_ALERT_EMAIL is not configured; internal collection escalation not sent',
      );
    } else if (changed || internalNoticeThrottleAllows(contract.last_collection_notice_at, nowMs)) {
      const content = internalNoticeContent(
        contract.organization_id,
        state.stage,
        state.daysPastDue,
      );
      const sent = await sendTransactionalEmail({
        from: fromEmail,
        to: billingAlertEmail,
        ...content,
      });
      internalNotified = sent.delivered;
      if (sent.delivered) {
        await db.execute(
          `update public.organization_billing_contracts
              set last_collection_notice_at = $2
            where organization_id = $1`,
          [contract.organization_id, nowIso],
        );
      } else {
        logger.error(
          { organizationId: contract.organization_id, stage: state.stage, reason: sent.reason },
          'Enterprise collection internal escalation could not be delivered',
        );
      }
    }
  }

  const seatCatchUp =
    state.stage === CURRENT_COLLECTION_STAGE ? await reconcileSeatCatchUp(db, contract) : null;

  return {
    organizationId: contract.organization_id,
    previousStage: contract.collection_stage,
    stage: state.stage,
    daysPastDue: state.daysPastDue,
    changed,
    ownerNotified,
    ownerNotice,
    internalNotified,
    seatCatchUp,
  };
}

function summarizeOwnerNotices(outcomes: readonly CollectionStageOutcome[]): {
  delivered: number;
  owed: number;
} {
  let delivered = 0;
  let owed = 0;
  for (const outcome of outcomes) {
    const notice = outcome.ownerNotice;
    if (!notice) continue;
    const channels = [notice.email, notice.inApp];
    if (channels.includes('delivered')) delivered += 1;
    if (channels.some((channel) => channel === 'failed' || channel === 'no_recipient')) owed += 1;
  }
  return { delivered, owed };
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { outcomes, backlog } = await enforceBillingCollection(getNeonDb());
    const changed = outcomes.filter((outcome) => outcome.changed).length;
    const ownerNotices = summarizeOwnerNotices(outcomes);
    if (backlog) {
      logger.warn(
        { contracts: outcomes.length, changed, ownerNotices },
        'Enterprise billing collection enforcement stopped at its time budget with contracts left unreviewed',
      );
    } else {
      logger.info(
        { contracts: outcomes.length, changed, ownerNotices },
        'Enterprise billing collection enforcement completed',
      );
    }
    return NextResponse.json({
      message: backlog
        ? 'Enterprise billing collection enforcement stopped with contracts left unreviewed'
        : 'Enterprise billing collection enforcement completed',
      contracts: outcomes.length,
      changed,
      backlog,
      ownerNotices,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Enterprise billing collection enforcement cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
