import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_RATE_CARD, INFRASTRUCTURE_VENDORS, MICROUSD_PER_CENT } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/neon-db');

vi.mock('server-only', () => ({}));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getNeonDb: vi.fn(),
}));

import {
  INFRASTRUCTURE_ALLOCATION_SOURCE_PREFIX,
  allocateInfrastructureCosts,
  billingMonthBefore,
  committedMonthlyMicrousd,
} from '../infrastructure-allocation-service';

const NOW = new Date('2026-09-05T06:00:00.000Z');
const HOSTING_MONTH = FEATURE_RATE_CARD.hosting_platform_month.providerCogsMicrousd as number;
const AUTH_MONTH = FEATURE_RATE_CARD.auth_platform_month.providerCogsMicrousd as number;
const AUTH_PER_USER = FEATURE_RATE_CARD.auth_active_user_month.providerCogsMicrousd as number;
const AUTH_INCLUDED = FEATURE_RATE_CARD.auth_active_user_month.includedPerMonth as number;

interface Bill {
  id: string;
  vendor: string;
  billing_month: string;
  amount_microusd: number;
  source: 'invoice' | 'rate_card';
  allocated_at: string | null;
}

interface Ledger {
  activeAccounts: number;
  bills: Bill[];
  attributedMicrousd: number;
  failAllocationFor?: string;
}

function ledgerDb(ledger: Ledger) {
  const statements: Array<[string, unknown[]]> = [];
  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    statements.push([sql, params]);
    if (sql.includes('select count(*)::bigint as accounts')) {
      return [{ accounts: String(ledger.activeAccounts) }];
    }
    if (sql.includes('select vendor from public.infrastructure_vendor_bills')) {
      return ledger.bills.map((bill) => ({ vendor: bill.vendor }));
    }
    if (sql.includes('insert into public.infrastructure_vendor_bills')) {
      ledger.bills.push({
        id: `estimate-${String(params[0])}`,
        vendor: String(params[0]),
        billing_month: String(params[1]),
        amount_microusd: Number(params[2]),
        source: 'rate_card',
        allocated_at: null,
      });
      return [];
    }
    if (sql.includes('where allocated_at is null')) {
      return ledger.bills.filter((bill) => bill.allocated_at === null);
    }
    if (sql.includes('for update')) {
      const bill = ledger.bills.find((candidate) => candidate.id === params[0]);
      if (bill && bill.vendor === ledger.failAllocationFor) throw new Error('lock timeout');
      return bill ? [{ allocated_at: bill.allocated_at }] : [];
    }
    if (sql.includes('coalesce(sum(event.provider_estimated_cost_microusd), 0)')) {
      return [{ microusd: String(ledger.attributedMicrousd) }];
    }
    if (sql.includes('ranked as (')) {
      return [
        {
          population: String(ledger.activeAccounts),
          allocated_microusd: String(ledger.activeAccounts > 0 ? params[7] : 0),
        },
      ];
    }
    if (sql.includes('update public.infrastructure_vendor_bills')) {
      const bill = ledger.bills.find((candidate) => candidate.id === params[0]);
      if (bill) bill.allocated_at = '2026-09-05T06:00:01.000Z';
      return [];
    }
    return [];
  };
  const db = {
    query: vi.fn(run),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      await run(sql, params);
      return 1;
    }),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
  };
  return { db, statements };
}

function invoice(vendor: string, amountMicrousd: number, allocatedAt: string | null = null): Bill {
  return {
    id: `invoice-${vendor}`,
    vendor,
    billing_month: '2026-08-01',
    amount_microusd: amountMicrousd,
    source: 'invoice',
    allocated_at: allocatedAt,
  };
}

function statementsMatching(statements: Array<[string, unknown[]]>, fragment: string) {
  return statements.filter(([sql]) => sql.includes(fragment));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('billingMonthBefore', () => {
  it('names the whole calendar month before the run', () => {
    const month = billingMonthBefore(NOW);

    expect(month.date).toBe('2026-08-01');
    expect(month.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(month.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    expect(billingMonthBefore(new Date('2026-01-05T00:00:00.000Z')).date).toBe('2025-12-01');
  });
});

describe('committedMonthlyMicrousd', () => {
  it('commits a flat platform fee for a vendor that bills one', () => {
    expect(committedMonthlyMicrousd('vercel', 10)).toBe(HOSTING_MONTH);
  });

  it('adds the per-account fee only past the accounts the vendor includes', () => {
    expect(committedMonthlyMicrousd('clerk', AUTH_INCLUDED)).toBe(AUTH_MONTH);
    expect(committedMonthlyMicrousd('clerk', AUTH_INCLUDED + 100)).toBe(
      AUTH_MONTH + Math.round(100 * AUTH_PER_USER),
    );
  });

  it('commits nothing for a vendor that only bills per use', () => {
    expect(committedMonthlyMicrousd('neon', 1_000)).toBeNull();
    expect(committedMonthlyMicrousd('cloudflare_r2', 1_000)).toBeNull();
  });
});

describe('allocateInfrastructureCosts', () => {
  it('spreads an invoice, less what per-use rows already priced, across the active accounts of that month', async () => {
    const ledger: Ledger = {
      activeAccounts: 3,
      bills: [invoice('vercel', 20_000_000)],
      attributedMicrousd: 5_000_000,
    };
    const { db, statements } = ledgerDb(ledger);

    const run = await allocateInfrastructureCosts(NOW, db as never);

    expect(run.billingMonth).toBe('2026-08-01');
    expect(run.activeAccounts).toBe(3);
    expect(run.allocated).toContainEqual({
      vendor: 'vercel',
      billingMonth: '2026-08-01',
      source: 'invoice',
      billMicrousd: 20_000_000,
      attributedMicrousd: 5_000_000,
      allocatedMicrousd: 15_000_000,
      activeAccounts: 3,
    });
    const [allocation] = statementsMatching(statements, 'ranked as (');
    expect(allocation?.[1]).toEqual([
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      'hosting',
      'vercel',
      Math.round(15_000_000 / MICROUSD_PER_CENT),
      `${INFRASTRUCTURE_ALLOCATION_SOURCE_PREFIX}vercel:2026-08-01:`,
      expect.any(String),
      15_000_000,
      true,
    ]);
    expect(allocation?.[0]).toContain('on conflict (source_ref) do nothing');
    expect(ledger.bills.find((bill) => bill.id === 'invoice-vercel')?.allocated_at).not.toBeNull();
  });

  it('estimates a bill from the committed rates for a vendor that sent none, and reports the rest missing', async () => {
    const ledger: Ledger = { activeAccounts: 2, bills: [], attributedMicrousd: 0 };
    const { db } = ledgerDb(ledger);

    const run = await allocateInfrastructureCosts(NOW, db as never);

    const committed = INFRASTRUCTURE_VENDORS.filter(
      (vendor) => committedMonthlyMicrousd(vendor, 2) !== null,
    );
    expect(run.estimated).toEqual(committed);
    expect(run.missing).toEqual(
      INFRASTRUCTURE_VENDORS.filter((vendor) => !committed.includes(vendor)),
    );
    expect(run.allocated.map((allocation) => allocation.source)).toEqual(
      committed.map(() => 'rate_card'),
    );
    const hosting = run.allocated.find((allocation) => allocation.vendor === 'vercel');
    expect(hosting).toMatchObject({
      billMicrousd: HOSTING_MONTH,
      allocatedMicrousd: HOSTING_MONTH,
    });
  });

  it('charges the whole remainder to one unattributed row when no account was active', async () => {
    const ledger: Ledger = {
      activeAccounts: 0,
      bills: [invoice('vercel', 20_000_000)],
      attributedMicrousd: 0,
    };
    const { db, statements } = ledgerDb(ledger);

    const run = await allocateInfrastructureCosts(NOW, db as never);

    const [unattributed] = statementsMatching(statements, "'active_user_month', 0");
    expect(unattributed?.[1]?.slice(0, 5)).toEqual([
      '2026-08-01T00:00:00.000Z',
      'hosting',
      'vercel',
      Math.round(20_000_000 / MICROUSD_PER_CENT),
      `${INFRASTRUCTURE_ALLOCATION_SOURCE_PREFIX}vercel:2026-08-01:unattributed`,
    ]);
    expect(run.allocated.find((allocation) => allocation.vendor === 'vercel')).toMatchObject({
      allocatedMicrousd: 20_000_000,
      activeAccounts: 0,
    });
  });

  it('allocates nothing past what per-use rows already priced', async () => {
    const ledger: Ledger = {
      activeAccounts: 3,
      bills: [invoice('vercel', 20_000_000)],
      attributedMicrousd: 25_000_000,
    };
    const { db, statements } = ledgerDb(ledger);

    const run = await allocateInfrastructureCosts(NOW, db as never);

    expect(run.allocated.find((allocation) => allocation.vendor === 'vercel')).toMatchObject({
      attributedMicrousd: 25_000_000,
      allocatedMicrousd: 0,
    });
    expect(
      statementsMatching(statements, 'ranked as (').filter(([, params]) => params[3] === 'vercel'),
    ).toHaveLength(0);
  });

  it('never allocates a bill twice', async () => {
    const ledger: Ledger = {
      activeAccounts: 3,
      bills: [invoice('vercel', 20_000_000)],
      attributedMicrousd: 0,
    };
    const { db } = ledgerDb(ledger);

    await allocateInfrastructureCosts(NOW, db as never);
    const second = await allocateInfrastructureCosts(NOW, db as never);

    expect(second.allocated.find((allocation) => allocation.vendor === 'vercel')).toBeUndefined();
  });

  it('records a bill it could not allocate as failed and carries on with the rest', async () => {
    const ledger: Ledger = {
      activeAccounts: 3,
      bills: [invoice('vercel', 20_000_000), invoice('neon', 9_000_000)],
      attributedMicrousd: 0,
      failAllocationFor: 'neon',
    };
    const { db } = ledgerDb(ledger);

    const run = await allocateInfrastructureCosts(NOW, db as never);

    expect(run.failed).toEqual([
      { vendor: 'neon', billingMonth: '2026-08-01', reason: 'lock timeout' },
    ]);
    expect(run.allocated.find((allocation) => allocation.vendor === 'vercel')).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'infrastructure_allocation_failed', vendor: 'neon' }),
      expect.any(String),
    );
  });
});
