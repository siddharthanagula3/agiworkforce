import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  FEATURE_RATE_CARD,
  INFRASTRUCTURE_VENDORS,
  MICROUSD_PER_CENT,
  RATE_CARD_FEATURES,
  resolveFeatureRate,
  type InfrastructureVendor,
  type RateCardFeature,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import type { CogsCapability } from '@/lib/services/cogs-ledger-service';

export const INFRASTRUCTURE_ALLOCATION_SOURCE_PREFIX = 'infrastructure_allocation:';

const ALLOCATION_CAPABILITY: Readonly<Record<InfrastructureVendor, CogsCapability>> = {
  vercel: 'hosting',
  neon: 'database',
  cloudflare_r2: 'storage',
  upstash: 'cache',
  clerk: 'auth',
  resend: 'email',
  sentry: 'observability',
};

export type InfrastructureBillSource = 'invoice' | 'rate_card';

export interface BillingMonth {
  start: Date;
  end: Date;
  date: string;
}

export interface InfrastructureAllocation {
  vendor: InfrastructureVendor;
  billingMonth: string;
  source: InfrastructureBillSource;
  billMicrousd: number;
  attributedMicrousd: number;
  allocatedMicrousd: number;
  activeAccounts: number;
}

export interface InfrastructureAllocationRun {
  billingMonth: string;
  activeAccounts: number;
  estimated: InfrastructureVendor[];
  missing: InfrastructureVendor[];
  allocated: InfrastructureAllocation[];
  failed: Array<{ vendor: InfrastructureVendor; billingMonth: string; reason: string }>;
}

interface VendorBillRow {
  id: string;
  vendor: InfrastructureVendor;
  billing_month: string;
  amount_microusd: number | string;
  source: InfrastructureBillSource;
}

const ACTIVE_ACCOUNTS_CTE = `active as (
    select event.user_id
      from public.provider_cost_events event
     where event.occurred_at >= $1::timestamptz
       and event.occurred_at < $2::timestamptz
       and event.user_id is not null
       and event.unit_basis <> 'active_user_month'
    union
    select reservation.user_id
      from public.free_daily_usage_reservations reservation
     where reservation.created_at >= $1::timestamptz
       and reservation.created_at < $2::timestamptz
  )`;

const COUNT_ACTIVE_ACCOUNTS_SQL = `with ${ACTIVE_ACCOUNTS_CTE}
  select count(*)::bigint as accounts from active`;

const ATTRIBUTED_SQL = `select coalesce(sum(event.provider_estimated_cost_microusd), 0)::bigint as microusd
    from public.provider_cost_events event
   where event.feature = any($3::text[])
     and event.occurred_at >= $1::timestamptz
     and event.occurred_at < $2::timestamptz`;

const ALLOCATE_SQL = `with ${ACTIVE_ACCOUNTS_CTE},
  ranked as (
    select active.user_id,
           row_number() over (order by active.user_id) as position,
           count(*) over () as population
      from active
  ),
  inserted as (
    insert into public.provider_cost_events (
      occurred_at, user_id, capability, provider, unit_basis, units,
      provider_cost_cents, billed_cents, source_ref, metadata,
      customer_canonical_microusd, customer_credits,
      provider_estimated_cost_microusd, provider_reported_cost_microusd, reconciliation_status
    )
    select $1::timestamptz, ranked.user_id, $3::text, $4::text, 'active_user_month'::text, 1,
           ($5::bigint / ranked.population
             + (ranked.position <= $5::bigint % ranked.population)::int)::integer,
           0, $6::text || ranked.user_id, $7::jsonb, 0, 0,
           $8::bigint / ranked.population
             + (ranked.position <= $8::bigint % ranked.population)::int,
           case when $9::boolean
             then $8::bigint / ranked.population
               + (ranked.position <= $8::bigint % ranked.population)::int
           end,
           case when $9::boolean then 'provider_reported' else 'estimated' end
      from ranked
    on conflict (source_ref) do nothing
    returning provider_estimated_cost_microusd
  )
  select (select count(*) from active)::bigint as population,
         coalesce((select sum(inserted.provider_estimated_cost_microusd) from inserted), 0)::bigint
           as allocated_microusd`;

const UNATTRIBUTED_SQL = `insert into public.provider_cost_events (
      occurred_at, user_id, capability, provider, unit_basis, units,
      provider_cost_cents, billed_cents, source_ref, metadata,
      customer_canonical_microusd, customer_credits,
      provider_estimated_cost_microusd, provider_reported_cost_microusd, reconciliation_status
    ) values (
      $1::timestamptz, null, $2, $3, 'active_user_month', 0, $4, 0, $5, $6::jsonb, 0, 0, $7,
      case when $8::boolean then $7::bigint end,
      case when $8::boolean then 'provider_reported' else 'estimated' end
    )
    on conflict (source_ref) do nothing`;

function numberFrom(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function billingMonthStarting(start: Date): BillingMonth {
  return {
    start,
    end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
    date: start.toISOString().slice(0, 10),
  };
}

export function billingMonthBefore(now: Date): BillingMonth {
  return billingMonthStarting(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

function billingMonthOf(date: string): BillingMonth {
  const [year, month] = date.split('-').map(Number);
  return billingMonthStarting(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)));
}

function vendorFeatures(vendor: InfrastructureVendor): RateCardFeature[] {
  return RATE_CARD_FEATURES.filter((feature) => FEATURE_RATE_CARD[feature].vendor === vendor);
}

function perUseFeatures(vendor: InfrastructureVendor): RateCardFeature[] {
  return vendorFeatures(vendor).filter((feature) => {
    const unit = FEATURE_RATE_CARD[feature].unit;
    return unit !== 'month' && unit !== 'active_user_month';
  });
}

export function committedMonthlyMicrousd(
  vendor: InfrastructureVendor,
  activeAccounts: number,
): number | null {
  let totalMicrousd = 0;
  let committed = false;
  for (const feature of vendorFeatures(vendor)) {
    const rate = resolveFeatureRate(feature);
    if (rate.providerCogsMicrousd === null) continue;
    if (rate.unit === 'month') {
      totalMicrousd += Math.round(rate.providerCogsMicrousd);
      committed = true;
    } else if (rate.unit === 'active_user_month') {
      const billable = Math.max(0, activeAccounts - (rate.includedPerMonth ?? 0));
      totalMicrousd += Math.round(billable * rate.providerCogsMicrousd);
      committed = true;
    }
  }
  return committed ? totalMicrousd : null;
}

async function countActiveAccounts(db: DatabaseAdapter, month: BillingMonth): Promise<number> {
  const [row] = await db.query<{ accounts: number | string | null }>(COUNT_ACTIVE_ACCOUNTS_SQL, [
    month.start.toISOString(),
    month.end.toISOString(),
  ]);
  return numberFrom(row?.accounts);
}

async function readVendorsBilled(db: DatabaseAdapter, month: BillingMonth): Promise<Set<string>> {
  const rows = await db.query<{ vendor: string }>(
    `select vendor from public.infrastructure_vendor_bills where billing_month = $1::date`,
    [month.date],
  );
  return new Set(rows.map((row) => row.vendor));
}

async function recordCommittedEstimates(
  db: DatabaseAdapter,
  month: BillingMonth,
  activeAccounts: number,
): Promise<{ estimated: InfrastructureVendor[]; missing: InfrastructureVendor[] }> {
  const billed = await readVendorsBilled(db, month);
  const estimated: InfrastructureVendor[] = [];
  const missing: InfrastructureVendor[] = [];
  for (const vendor of INFRASTRUCTURE_VENDORS) {
    if (billed.has(vendor)) continue;
    const amountMicrousd = committedMonthlyMicrousd(vendor, activeAccounts);
    if (amountMicrousd === null) {
      missing.push(vendor);
      continue;
    }
    await db.execute(
      `insert into public.infrastructure_vendor_bills (vendor, billing_month, amount_microusd, source)
       values ($1, $2::date, $3, 'rate_card')
       on conflict (vendor, billing_month) do nothing`,
      [vendor, month.date, amountMicrousd],
    );
    estimated.push(vendor);
  }
  return { estimated, missing };
}

async function allocateBill(
  db: DatabaseAdapter,
  bill: VendorBillRow,
): Promise<InfrastructureAllocation | null> {
  const month = billingMonthOf(bill.billing_month);
  const billMicrousd = numberFrom(bill.amount_microusd);
  const reported = bill.source === 'invoice';

  return db.transaction(async (tx) => {
    const [locked] = await tx.query<{ allocated_at: string | Date | null }>(
      `select allocated_at from public.infrastructure_vendor_bills where id = $1 for update`,
      [bill.id],
    );
    if (!locked || locked.allocated_at !== null) return null;

    const [attributed] = await tx.query<{ microusd: number | string | null }>(ATTRIBUTED_SQL, [
      month.start.toISOString(),
      month.end.toISOString(),
      perUseFeatures(bill.vendor),
    ]);
    const attributedMicrousd = numberFrom(attributed?.microusd);
    const remainderMicrousd = Math.max(0, billMicrousd - attributedMicrousd);
    const remainderCents = Math.round(remainderMicrousd / MICROUSD_PER_CENT);
    const sourceRef = `${INFRASTRUCTURE_ALLOCATION_SOURCE_PREFIX}${bill.vendor}:${bill.billing_month}:`;
    const metadata = JSON.stringify({
      vendor: bill.vendor,
      billingMonth: bill.billing_month,
      billSource: bill.source,
    });

    let activeAccounts = 0;
    let allocatedMicrousd = 0;
    if (remainderMicrousd > 0) {
      const [written] = await tx.query<{
        population: number | string | null;
        allocated_microusd: number | string | null;
      }>(ALLOCATE_SQL, [
        month.start.toISOString(),
        month.end.toISOString(),
        ALLOCATION_CAPABILITY[bill.vendor],
        bill.vendor,
        remainderCents,
        sourceRef,
        metadata,
        remainderMicrousd,
        reported,
      ]);
      activeAccounts = numberFrom(written?.population);
      allocatedMicrousd = numberFrom(written?.allocated_microusd);
      if (activeAccounts === 0) {
        await tx.execute(UNATTRIBUTED_SQL, [
          month.start.toISOString(),
          ALLOCATION_CAPABILITY[bill.vendor],
          bill.vendor,
          remainderCents,
          `${sourceRef}unattributed`,
          metadata,
          remainderMicrousd,
          reported,
        ]);
        allocatedMicrousd = remainderMicrousd;
      }
    }

    await tx.execute(
      `update public.infrastructure_vendor_bills
          set allocated_at = now(),
              updated_at = now(),
              attributed_microusd = $2,
              allocated_microusd = $3,
              active_users = $4
        where id = $1`,
      [bill.id, attributedMicrousd, allocatedMicrousd, activeAccounts],
    );

    return {
      vendor: bill.vendor,
      billingMonth: bill.billing_month,
      source: bill.source,
      billMicrousd,
      attributedMicrousd,
      allocatedMicrousd,
      activeAccounts,
    };
  });
}

export async function allocateInfrastructureCosts(
  now: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<InfrastructureAllocationRun> {
  const month = billingMonthBefore(now);
  const activeAccounts = await countActiveAccounts(db, month);
  const { estimated, missing } = await recordCommittedEstimates(db, month, activeAccounts);

  const bills = await db.query<VendorBillRow>(
    `select id, vendor, billing_month::text as billing_month, amount_microusd, source
       from public.infrastructure_vendor_bills
      where allocated_at is null
        and billing_month < $1::date
      order by billing_month asc, vendor asc`,
    [month.end.toISOString().slice(0, 10)],
  );

  const allocated: InfrastructureAllocation[] = [];
  const failed: InfrastructureAllocationRun['failed'] = [];
  for (const bill of bills) {
    try {
      const result = await allocateBill(db, bill);
      if (result) allocated.push(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          event: 'infrastructure_allocation_failed',
          vendor: bill.vendor,
          billingMonth: bill.billing_month,
          reason,
        },
        'An infrastructure bill could not be allocated to active accounts',
      );
      failed.push({ vendor: bill.vendor, billingMonth: bill.billing_month, reason });
    }
  }

  return { billingMonth: month.date, activeAccounts, estimated, missing, allocated, failed };
}
