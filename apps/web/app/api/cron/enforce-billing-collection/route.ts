import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
  committed_seats: number;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export interface CollectionStageOutcome {
  organizationId: string;
  previousStage: CollectionStage;
  stage: CollectionStage;
  daysPastDue: number;
  changed: boolean;
  ownerNotified: boolean;
  internalNotified: boolean;
  seatCatchUp: SeatPersistenceOutcome | null;
}

async function loadEnterpriseContractsNeedingReview(db: DatabaseAdapter): Promise<ContractRow[]> {
  return db.query<ContractRow>(
    `select c.organization_id,
            c.oldest_open_invoice_due_at,
            c.collection_stage,
            c.last_collection_notice_at,
            c.committed_seats,
            c.stripe_subscription_id,
            c.stripe_customer_id,
            p.email as owner_email
       from public.organization_billing_contracts c
       join public.organizations o on o.id = c.organization_id
       left join public.profiles p on p.id = o.owner_user_id
      where c.ended_at is null
        and (c.oldest_open_invoice_due_at is not null or c.collection_stage <> $1::text)`,
    [CURRENT_COLLECTION_STAGE],
  );
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
): Promise<CollectionStageOutcome[]> {
  const contracts = await loadEnterpriseContractsNeedingReview(db);
  const billingAlertEmail = process.env['BILLING_ALERT_EMAIL']?.trim() || null;
  const fromEmail = getHandoffConfig().fromEmail;
  const outcomes: CollectionStageOutcome[] = [];

  for (const contract of contracts) {
    const state = deriveCollectionState(nowMs, contract.oldest_open_invoice_due_at);
    const changed = state.stage !== contract.collection_stage;
    const nowIso = new Date(nowMs).toISOString();

    if (changed) {
      await db.execute(
        `update public.organization_billing_contracts
            set collection_stage = $2,
                collection_stage_changed_at = $3
          where organization_id = $1`,
        [contract.organization_id, state.stage, nowIso],
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

    let ownerNotified = false;
    if (changed && OWNER_NOTICE_STAGES.has(state.stage)) {
      if (contract.owner_email) {
        const content = ownerNoticeContent(state.stage, state.daysPastDue);
        const sent = await sendTransactionalEmail({
          from: fromEmail,
          to: contract.owner_email,
          ...content,
        });
        ownerNotified = sent.delivered;
        if (!sent.delivered) {
          logger.error(
            { organizationId: contract.organization_id, stage: state.stage, reason: sent.reason },
            'Enterprise collection owner notice could not be delivered',
          );
        }
      } else {
        logger.error(
          { organizationId: contract.organization_id, stage: state.stage },
          'Enterprise collection owner notice skipped: no owner email on file',
        );
      }
    }

    let internalNotified = false;
    const wantsInternalNotice = changed || DAILY_INTERNAL_REPEAT_STAGES.has(state.stage);
    if (wantsInternalNotice) {
      if (!billingAlertEmail) {
        logger.error(
          { organizationId: contract.organization_id, stage: state.stage },
          'BILLING_ALERT_EMAIL is not configured; internal collection escalation not sent',
        );
      } else if (
        changed ||
        internalNoticeThrottleAllows(contract.last_collection_notice_at, nowMs)
      ) {
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

    outcomes.push({
      organizationId: contract.organization_id,
      previousStage: contract.collection_stage,
      stage: state.stage,
      daysPastDue: state.daysPastDue,
      changed,
      ownerNotified,
      internalNotified,
      seatCatchUp,
    });
  }

  return outcomes;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const outcomes = await enforceBillingCollection(getNeonDb());
    const changed = outcomes.filter((outcome) => outcome.changed).length;
    logger.info(
      { contracts: outcomes.length, changed },
      'Enterprise billing collection enforcement completed',
    );
    return NextResponse.json({
      message: 'Enterprise billing collection enforcement completed',
      contracts: outcomes.length,
      changed,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Enterprise billing collection enforcement cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
