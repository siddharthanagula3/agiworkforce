import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { getOrganizationMonthToDateSpendCents } from '@/lib/services/cogs-ledger-service';

const METER_EVENT_CUSTOMER_PAYLOAD_KEY = 'stripe_customer_id';
const METER_EVENT_VALUE_PAYLOAD_KEY = 'value';

export interface EnterpriseUsagePeriod {
  key: string;
  start: string;
  end: string;
}

export interface EnterpriseUsageAllowance {
  organizationId: string;
  period: EnterpriseUsagePeriod;
  allowanceCents: number;
  consumedCents: number;
  overageCents: number;
}

export type EnterpriseOverageReportStatus =
  | 'reported'
  | 'skipped_no_new_overage'
  | 'skipped_no_overage_price'
  | 'skipped_no_meter'
  | 'failed';

export interface EnterpriseOverageReportResult {
  organizationId: string;
  status: EnterpriseOverageReportStatus;
  reportedCents: number;
  cumulativeOverageCents: number;
  error?: string;
}

interface EnterpriseBillingContractMeteringRow {
  organization_id: string;
  stripe_customer_id: string | null;
  included_usage_cents_per_period: number | string | null;
  committed_usage_block_cents: number | string | null;
  overage_stripe_price_id: string | null;
  overage_reported_period: string | null;
  overage_reported_cents: number | string | null;
  overage_pending_period: string | null;
  overage_pending_cents: number | string | null;
  overage_pending_cumulative_cents: number | string | null;
  overage_pending_identifier: string | null;
  overage_pending_at: string | Date | null;
}

interface StoredOverageReportState {
  period: string;
  cumulativeOverageReportedCents: number;
}

interface PendingOverageReport {
  period: string;
  cents: number;
  cumulativeCents: number;
  identifier: string;
  at: Date;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

export function resolveEnterpriseUsagePeriod(now: Date): EnterpriseUsagePeriod {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthLabel = String(month + 1).padStart(2, '0');
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return {
    key: `${year}-${monthLabel}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function computeEnterpriseUsageAllowance(input: {
  organizationId: string;
  period: EnterpriseUsagePeriod;
  includedUsageCentsPerPeriod: number;
  committedUsageBlockCents: number;
  consumedCents: number;
}): EnterpriseUsageAllowance {
  const allowanceCents = Math.max(
    0,
    input.includedUsageCentsPerPeriod + input.committedUsageBlockCents,
  );
  const consumedCents = Math.max(0, input.consumedCents);
  const overageCents = Math.max(0, consumedCents - allowanceCents);
  return {
    organizationId: input.organizationId,
    period: input.period,
    allowanceCents,
    consumedCents,
    overageCents,
  };
}

export function computeNewOverageToReportCents(input: {
  period: EnterpriseUsagePeriod;
  overageCents: number;
  previouslyReported: StoredOverageReportState | null;
}): number {
  const priorCents =
    input.previouslyReported && input.previouslyReported.period === input.period.key
      ? input.previouslyReported.cumulativeOverageReportedCents
      : 0;
  return Math.max(0, input.overageCents - priorCents);
}

function overageMeterEventIdentifier(
  organizationId: string,
  period: EnterpriseUsagePeriod,
  cumulativeOverageCents: number,
): string {
  return `enterprise-overage:${organizationId}:${period.key}:${cumulativeOverageCents}`;
}

function readReportedOverage(
  contract: EnterpriseBillingContractMeteringRow,
): StoredOverageReportState | null {
  if (!contract.overage_reported_period) return null;
  return {
    period: contract.overage_reported_period,
    cumulativeOverageReportedCents: toNumber(contract.overage_reported_cents),
  };
}

function readPendingOverage(
  contract: EnterpriseBillingContractMeteringRow,
): PendingOverageReport | null {
  if (
    !contract.overage_pending_identifier ||
    !contract.overage_pending_period ||
    contract.overage_pending_at === null
  ) {
    return null;
  }
  return {
    period: contract.overage_pending_period,
    cents: toNumber(contract.overage_pending_cents),
    cumulativeCents: toNumber(contract.overage_pending_cumulative_cents),
    identifier: contract.overage_pending_identifier,
    at: new Date(contract.overage_pending_at),
  };
}

async function readActiveMeteredContracts(
  db: DatabaseAdapter,
): Promise<EnterpriseBillingContractMeteringRow[]> {
  return db.query<EnterpriseBillingContractMeteringRow>(
    `select organization_id, stripe_customer_id, included_usage_cents_per_period,
            committed_usage_block_cents, overage_stripe_price_id,
            overage_reported_period, overage_reported_cents,
            overage_pending_period, overage_pending_cents, overage_pending_cumulative_cents,
            overage_pending_identifier, overage_pending_at
       from public.organization_billing_contracts
      where ended_at is null
        and stripe_customer_id is not null`,
    [],
  );
}

async function claimPendingOverageReport(
  db: DatabaseAdapter,
  organizationId: string,
  pending: PendingOverageReport,
  baseline: StoredOverageReportState | null,
): Promise<boolean> {
  const claimed = await db.query<{ organization_id: string }>(
    `update public.organization_billing_contracts
        set overage_pending_period = $2,
            overage_pending_cents = $3,
            overage_pending_cumulative_cents = $4,
            overage_pending_identifier = $5,
            overage_pending_at = $6
      where organization_id = $1
        and overage_pending_identifier is null
        and overage_reported_period is not distinct from $7::text
        and overage_reported_cents = $8::bigint
      returning organization_id`,
    [
      organizationId,
      pending.period,
      pending.cents,
      pending.cumulativeCents,
      pending.identifier,
      pending.at.toISOString(),
      baseline?.period ?? null,
      baseline?.cumulativeOverageReportedCents ?? 0,
    ],
  );
  return claimed.length > 0;
}

async function commitPendingOverageReport(
  db: DatabaseAdapter,
  organizationId: string,
  pending: PendingOverageReport,
): Promise<void> {
  await db.query(
    `update public.organization_billing_contracts
        set overage_reported_period = overage_pending_period,
            overage_reported_cents = overage_pending_cumulative_cents,
            overage_pending_period = null,
            overage_pending_cents = null,
            overage_pending_cumulative_cents = null,
            overage_pending_identifier = null,
            overage_pending_at = null
      where organization_id = $1
        and overage_pending_identifier = $2`,
    [organizationId, pending.identifier],
  );
}

async function sendOverageMeterEvent(
  stripe: Stripe,
  eventName: string,
  stripeCustomerId: string,
  pending: PendingOverageReport,
): Promise<void> {
  await stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: {
      [METER_EVENT_CUSTOMER_PAYLOAD_KEY]: stripeCustomerId,
      [METER_EVENT_VALUE_PAYLOAD_KEY]: String(pending.cents),
    },
    identifier: pending.identifier,
    timestamp: Math.floor(pending.at.getTime() / 1000),
  });
}

async function resolveMeterEventName(
  stripe: Stripe,
  priceId: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(priceId)) return cache.get(priceId) ?? null;
  const price = await stripe.prices.retrieve(priceId);
  const meterId = price.recurring?.meter ?? null;
  if (!meterId) {
    cache.set(priceId, null);
    return null;
  }
  const meter = await stripe.billing.meters.retrieve(meterId);
  cache.set(priceId, meter.event_name);
  return meter.event_name;
}

function resolvePreviousPeriod(period: EnterpriseUsagePeriod): EnterpriseUsagePeriod {
  return resolveEnterpriseUsagePeriod(new Date(Date.parse(period.start) - 1));
}

function lastInstantOf(period: EnterpriseUsagePeriod): Date {
  return new Date(Date.parse(period.end) - 1000);
}

async function settlePeriodOverage(input: {
  db: DatabaseAdapter;
  stripe: Stripe;
  contract: EnterpriseBillingContractMeteringRow;
  stripeCustomerId: string;
  period: EnterpriseUsagePeriod;
  at: Date;
  baseline: StoredOverageReportState | null;
  meterEventName: () => Promise<string | null>;
}): Promise<{
  status: 'reported' | 'skipped_no_new_overage' | 'skipped_no_meter';
  reportedCents: number;
  cumulativeOverageCents: number;
  baseline: StoredOverageReportState | null;
}> {
  const { db, contract, period, baseline } = input;
  const organizationId = contract.organization_id;
  const consumedCents = await getOrganizationMonthToDateSpendCents(organizationId, db, period);
  const allowance = computeEnterpriseUsageAllowance({
    organizationId,
    period,
    includedUsageCentsPerPeriod: toNumber(contract.included_usage_cents_per_period),
    committedUsageBlockCents: toNumber(contract.committed_usage_block_cents),
    consumedCents,
  });
  const deltaCents = computeNewOverageToReportCents({
    period,
    overageCents: allowance.overageCents,
    previouslyReported: baseline,
  });

  if (deltaCents <= 0) {
    return {
      status: 'skipped_no_new_overage',
      reportedCents: 0,
      cumulativeOverageCents: allowance.overageCents,
      baseline,
    };
  }

  const eventName = await input.meterEventName();
  if (!eventName) {
    return {
      status: 'skipped_no_meter',
      reportedCents: 0,
      cumulativeOverageCents: allowance.overageCents,
      baseline,
    };
  }

  const pending: PendingOverageReport = {
    period: period.key,
    cents: deltaCents,
    cumulativeCents: allowance.overageCents,
    identifier: overageMeterEventIdentifier(organizationId, period, allowance.overageCents),
    at: input.at,
  };
  if (!(await claimPendingOverageReport(db, organizationId, pending, baseline))) {
    throw new Error(
      'another run holds an unconfirmed overage report or advanced the reported baseline for this organization',
    );
  }
  await sendOverageMeterEvent(input.stripe, eventName, input.stripeCustomerId, pending);
  await commitPendingOverageReport(db, organizationId, pending);

  return {
    status: 'reported',
    reportedCents: deltaCents,
    cumulativeOverageCents: allowance.overageCents,
    baseline: { period: period.key, cumulativeOverageReportedCents: allowance.overageCents },
  };
}

export async function reportEnterpriseOverageUsage(input: {
  db: DatabaseAdapter;
  stripe: Stripe;
  now?: Date;
}): Promise<EnterpriseOverageReportResult[]> {
  const now = input.now ?? new Date();
  const period = resolveEnterpriseUsagePeriod(now);
  const contracts = await readActiveMeteredContracts(input.db);
  const meterEventNameCache = new Map<string, string | null>();
  const results: EnterpriseOverageReportResult[] = [];

  for (const contract of contracts) {
    const organizationId = contract.organization_id;

    if (!contract.overage_stripe_price_id) {
      logger.info(
        { organizationId },
        '[enterprise-usage-metering] contract has no overage price configured; skipped',
      );
      results.push({
        organizationId,
        status: 'skipped_no_overage_price',
        reportedCents: 0,
        cumulativeOverageCents: 0,
      });
      continue;
    }

    try {
      const overagePriceId = contract.overage_stripe_price_id;
      const stripeCustomerId = contract.stripe_customer_id ?? '';
      const meterEventName = () =>
        resolveMeterEventName(input.stripe, overagePriceId, meterEventNameCache);
      const skipNoMeter = (cumulativeOverageCents: number) => {
        logger.error(
          { organizationId, priceId: overagePriceId },
          '[enterprise-usage-metering] overage price has no attached meter; skipped',
        );
        results.push({
          organizationId,
          status: 'skipped_no_meter',
          reportedCents: 0,
          cumulativeOverageCents,
        });
      };

      let baseline = readReportedOverage(contract);
      let reportedCents = 0;
      const unconfirmed = readPendingOverage(contract);
      if (unconfirmed) {
        const eventName = await meterEventName();
        if (!eventName) {
          skipNoMeter(unconfirmed.cumulativeCents);
          continue;
        }
        await sendOverageMeterEvent(input.stripe, eventName, stripeCustomerId, unconfirmed);
        await commitPendingOverageReport(input.db, organizationId, unconfirmed);
        baseline = {
          period: unconfirmed.period,
          cumulativeOverageReportedCents: unconfirmed.cumulativeCents,
        };
        reportedCents = unconfirmed.cents;
      }

      const periodsToSettle =
        baseline?.period === period.key ? [period] : [resolvePreviousPeriod(period), period];
      let cumulativeOverageCents = 0;
      let missingMeter = false;
      for (const target of periodsToSettle) {
        const settled = await settlePeriodOverage({
          db: input.db,
          stripe: input.stripe,
          contract,
          stripeCustomerId,
          period: target,
          at: target.key === period.key ? now : lastInstantOf(target),
          baseline,
          meterEventName,
        });
        cumulativeOverageCents = settled.cumulativeOverageCents;
        if (settled.status === 'skipped_no_meter') {
          skipNoMeter(settled.cumulativeOverageCents);
          missingMeter = true;
          break;
        }
        baseline = settled.baseline;
        reportedCents += settled.reportedCents;
      }
      if (missingMeter) continue;

      results.push({
        organizationId,
        status: reportedCents > 0 ? 'reported' : 'skipped_no_new_overage',
        reportedCents,
        cumulativeOverageCents,
      });
    } catch (error) {
      logger.error(
        { error, organizationId },
        '[enterprise-usage-metering] overage report failed for organization',
      );
      results.push({
        organizationId,
        status: 'failed',
        reportedCents: 0,
        cumulativeOverageCents: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
