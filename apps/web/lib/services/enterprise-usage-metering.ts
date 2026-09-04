import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { getOrganizationMonthToDateSpendCents } from '@/lib/services/cogs-ledger-service';

const ENTERPRISE_USAGE_METERING_METADATA_KEY = 'enterpriseUsageReporting';
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
  metadata: Record<string, unknown> | null;
}

interface StoredOverageReportState {
  period: string;
  cumulativeOverageReportedCents: number;
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

function dailyIdentifierKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function readStoredOverageReportState(
  metadata: Record<string, unknown> | null,
): StoredOverageReportState | null {
  const stored = metadata?.[ENTERPRISE_USAGE_METERING_METADATA_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const period = (stored as Record<string, unknown>)['period'];
  const cumulativeOverageReportedCents = (stored as Record<string, unknown>)[
    'cumulativeOverageReportedCents'
  ];
  if (typeof period !== 'string' || typeof cumulativeOverageReportedCents !== 'number') {
    return null;
  }
  return { period, cumulativeOverageReportedCents };
}

async function readActiveMeteredContracts(
  db: DatabaseAdapter,
): Promise<EnterpriseBillingContractMeteringRow[]> {
  return db.query<EnterpriseBillingContractMeteringRow>(
    `select organization_id, stripe_customer_id, included_usage_cents_per_period,
            committed_usage_block_cents, overage_stripe_price_id, metadata
       from public.organization_billing_contracts
      where ended_at is null
        and stripe_customer_id is not null`,
    [],
  );
}

async function persistOverageReportState(
  db: DatabaseAdapter,
  organizationId: string,
  state: StoredOverageReportState,
): Promise<void> {
  await db.query(
    `update public.organization_billing_contracts
        set metadata = metadata || $2::jsonb
      where organization_id = $1`,
    [organizationId, JSON.stringify({ [ENTERPRISE_USAGE_METERING_METADATA_KEY]: state })],
  );
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
      const consumedCents = await getOrganizationMonthToDateSpendCents(
        organizationId,
        input.db,
        period,
      );
      const allowance = computeEnterpriseUsageAllowance({
        organizationId,
        period,
        includedUsageCentsPerPeriod: toNumber(contract.included_usage_cents_per_period),
        committedUsageBlockCents: toNumber(contract.committed_usage_block_cents),
        consumedCents,
      });
      const previouslyReported = readStoredOverageReportState(contract.metadata);
      const deltaCents = computeNewOverageToReportCents({
        period,
        overageCents: allowance.overageCents,
        previouslyReported,
      });

      if (deltaCents <= 0) {
        results.push({
          organizationId,
          status: 'skipped_no_new_overage',
          reportedCents: 0,
          cumulativeOverageCents: allowance.overageCents,
        });
        continue;
      }

      const eventName = await resolveMeterEventName(
        input.stripe,
        contract.overage_stripe_price_id,
        meterEventNameCache,
      );
      if (!eventName) {
        logger.error(
          { organizationId, priceId: contract.overage_stripe_price_id },
          '[enterprise-usage-metering] overage price has no attached meter; skipped',
        );
        results.push({
          organizationId,
          status: 'skipped_no_meter',
          reportedCents: 0,
          cumulativeOverageCents: allowance.overageCents,
        });
        continue;
      }

      await input.stripe.billing.meterEvents.create({
        event_name: eventName,
        payload: {
          [METER_EVENT_CUSTOMER_PAYLOAD_KEY]: contract.stripe_customer_id ?? '',
          [METER_EVENT_VALUE_PAYLOAD_KEY]: String(deltaCents),
        },
        identifier: `enterprise-overage:${organizationId}:${dailyIdentifierKey(now)}`,
        timestamp: Math.floor(now.getTime() / 1000),
      });

      await persistOverageReportState(input.db, organizationId, {
        period: period.key,
        cumulativeOverageReportedCents: allowance.overageCents,
      });

      results.push({
        organizationId,
        status: 'reported',
        reportedCents: deltaCents,
        cumulativeOverageCents: allowance.overageCents,
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
