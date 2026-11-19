import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import { mobileTopUpBudgetMicrousd } from '@/lib/server/mobile-iap-top-up-budget';
import {
  READ_ONLY_PROBE_SQL,
  READ_ONLY_STATEMENT,
  formatTopUpRefundTable,
  readOverRevokedTopUpRefunds,
  type MobileRefundLedgerRow,
  type TopUpReceiptRow,
} from '../mobile-top-up-refund-report/report';
import { parseReportArgs, runTopUpRefundReport } from '../mobile-top-up-refund-report/cli';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const TEN_DOLLARS_CENTS = 1_000;
const CREDITS_FOR_TEN_DOLLARS = 500;
const GRANTED_MICROUSD = 2_500_000;
const RETAIL_AS_BUDGET_MICROUSD = 10_000_000;

let nextId = 0;

function receipt(overrides: Partial<TopUpReceiptRow> = {}): TopUpReceiptRow {
  nextId += 1;
  return {
    id: `receipt-${nextId}`,
    user_id: 'user_a',
    platform: 'ios',
    store_transaction_id: `2000000${nextId}`,
    product_id: 'com.example.topup.10',
    units_granted: CREDITS_FOR_TEN_DOLLARS,
    intended_amount_cents: TEN_DOLLARS_CENTS,
    refunded_amount_cents: TEN_DOLLARS_CENTS,
    status: 'refunded',
    environment: 'production',
    ...overrides,
  };
}

function refundEntry(
  of: TopUpReceiptRow,
  requestedMicrousd: number,
  balanceRevoked: Record<string, number> = { balance_revoked_microusd: requestedMicrousd },
): MobileRefundLedgerRow {
  nextId += 1;
  return {
    id: `entry-${nextId}`,
    user_id: of.user_id,
    transaction_type: 'refund',
    description: `Mobile ${of.platform} refund ${of.store_transaction_id}`,
    amount_microusd: String(-requestedMicrousd),
    metadata: { top_up_refund: true, ...balanceRevoked },
    created_at: '2026-10-30T10:00:00.000Z',
  };
}

function reversalEntry(of: TopUpReceiptRow, amountMicrousd: number): MobileRefundLedgerRow {
  nextId += 1;
  return {
    id: `entry-${nextId}`,
    user_id: of.user_id,
    transaction_type: 'purchase',
    description: `Mobile ${of.platform} refund reversed ${of.store_transaction_id}`,
    amount_microusd: String(amountMicrousd),
    metadata: null,
    created_at: '2026-11-01T10:00:00.000Z',
  };
}

interface FixtureDatabase {
  db: DatabaseAdapter;
  statements: string[];
  executed: string[];
  disposed: () => boolean;
}

function fixtureDatabase(
  receipts: TopUpReceiptRow[],
  entries: MobileRefundLedgerRow[],
  readOnly = 'on',
): FixtureDatabase {
  const statements: string[] = [];
  const executed: string[] = [];
  let disposed = false;
  let inTransaction = false;
  const db = createDatabaseAdapterFake({
    query: (async (sql: string, params?: unknown[]) => {
      statements.push(sql);
      if (!inTransaction) throw new Error('read outside the report transaction');
      if (sql === READ_ONLY_PROBE_SQL) return [{ transaction_read_only: readOnly }];
      if (sql.includes('from public.credit_transactions')) {
        const prefixes = (params ?? []) as string[];
        return entries.filter((entry) =>
          prefixes.some((prefix) => entry.description.startsWith(prefix)),
        );
      }
      if (sql.includes('from public.mobile_iap_transactions')) {
        const userIds = new Set((params?.[0] ?? []) as string[]);
        return receipts.filter((row) => userIds.has(row.user_id));
      }
      throw new Error(`unexpected read: ${sql}`);
    }) as DatabaseAdapter['query'],
    execute: async (sql: string) => {
      statements.push(sql);
      executed.push(sql);
      return 0;
    },
    dispose: async () => {
      disposed = true;
    },
  });
  const transaction = db.transaction.bind(db);
  db.transaction = async <T>(run: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
    inTransaction = true;
    try {
      return await transaction(run);
    } finally {
      inTransaction = false;
    }
  };
  return { db, statements, executed, disposed: () => disposed };
}

async function reportOf(receipts: TopUpReceiptRow[], entries: MobileRefundLedgerRow[]) {
  const { db } = fixtureDatabase(receipts, entries);
  return readOverRevokedTopUpRefunds(db, { includeSandbox: false, now: NOW });
}

describe('over-revoked mobile top-up refund report', () => {
  it('lists a refund that revoked the retail price and owes back the difference', async () => {
    const refunded = receipt();
    const report = await reportOf([refunded], [refundEntry(refunded, RETAIL_AS_BUDGET_MICROUSD)]);

    expect(report.refunds).toHaveLength(1);
    expect(report.refunds[0]).toMatchObject({
      userId: 'user_a',
      platform: 'ios',
      storeTransactionId: refunded.store_transaction_id,
      grantedMicrousd: GRANTED_MICROUSD,
      revokedMicrousd: RETAIL_AS_BUDGET_MICROUSD,
      reGrantedMicrousd: 0,
      shouldHaveRevokedMicrousd: GRANTED_MICROUSD,
      owedMicrousd: 7_500_000,
      owedCents: 750,
      owedCredits: 1_500,
    });
    expect(report.totals).toMatchObject({ refunds: 1, accounts: 1, owedMicrousd: 7_500_000 });
  });

  it('takes what should have been revoked from the function the refund handler uses', async () => {
    const refunded = receipt({ units_granted: 1_337, intended_amount_cents: 2_999 });
    const report = await reportOf(
      [refunded],
      [refundEntry(refunded, refunded.intended_amount_cents * 10_000)],
    );

    expect(report.refunds[0]?.shouldHaveRevokedMicrousd).toBe(
      mobileTopUpBudgetMicrousd(refunded, refunded.refunded_amount_cents),
    );
  });

  it('does not list a refund processed by the fixed handler', async () => {
    const refunded = receipt();
    const report = await reportOf(
      [refunded],
      [refundEntry(refunded, mobileTopUpBudgetMicrousd(refunded, TEN_DOLLARS_CENTS))],
    );

    expect(report.refunds).toEqual([]);
    expect(report.totals.owedMicrousd).toBe(0);
  });

  it('does not list a fixed partial refund followed by the rest of the refund', async () => {
    const refunded = receipt({ refunded_amount_cents: TEN_DOLLARS_CENTS });
    const firstHalf = mobileTopUpBudgetMicrousd(refunded, 333);
    const remainder = mobileTopUpBudgetMicrousd(refunded, TEN_DOLLARS_CENTS) - firstHalf;
    const report = await reportOf(
      [refunded],
      [refundEntry(refunded, firstHalf), refundEntry(refunded, remainder)],
    );

    expect(report.refunds).toEqual([]);
  });

  it('owes nothing for an old refund that the old handler also reversed at retail', async () => {
    const reversed = receipt({ refunded_amount_cents: 0, status: 'granted' });
    const report = await reportOf(
      [reversed],
      [
        refundEntry(reversed, RETAIL_AS_BUDGET_MICROUSD),
        reversalEntry(reversed, RETAIL_AS_BUDGET_MICROUSD),
      ],
    );

    expect(report.refunds).toEqual([]);
  });

  it('owes the difference for an old refund that the fixed handler reversed at budget', async () => {
    const reversed = receipt({ refunded_amount_cents: 0, status: 'granted' });
    const report = await reportOf(
      [reversed],
      [refundEntry(reversed, RETAIL_AS_BUDGET_MICROUSD), reversalEntry(reversed, GRANTED_MICROUSD)],
    );

    expect(report.refunds[0]).toMatchObject({
      receiptStatus: 'granted',
      revokedMicrousd: RETAIL_AS_BUDGET_MICROUSD,
      reGrantedMicrousd: GRANTED_MICROUSD,
      shouldHaveRevokedMicrousd: 0,
      owedMicrousd: 7_500_000,
      reversalEntries: 1,
    });
  });

  it('measures a partial refund against the refunded share of the grant', async () => {
    const partial = receipt({
      platform: 'android',
      store_transaction_id: 'GPA.3333-4444-5555-66666',
      refunded_amount_cents: 500,
    });
    const report = await reportOf([partial], [refundEntry(partial, 5_000_000)]);

    expect(report.refunds[0]).toMatchObject({
      platform: 'android',
      refundedRetailCents: 500,
      revokedMicrousd: 5_000_000,
      shouldHaveRevokedMicrousd: 1_250_000,
      owedMicrousd: 3_750_000,
      owedCents: 375,
    });
  });

  it('counts only the balance the ledger could take when the credits were already spent', async () => {
    const spent = receipt();
    const legacy = receipt({ user_id: 'user_b' });
    const report = await reportOf(
      [spent, legacy],
      [
        refundEntry(spent, RETAIL_AS_BUDGET_MICROUSD, { balance_revoked_microusd: 3_000_000 }),
        refundEntry(legacy, RETAIL_AS_BUDGET_MICROUSD, { balance_revoked_cents: 400 }),
      ],
    );

    expect(report.refunds.map((refund) => refund.owedMicrousd)).toEqual([500_000, 1_500_000]);
    expect(report.totals).toMatchObject({ refunds: 2, accounts: 2, owedMicrousd: 2_000_000 });
  });

  it('leaves out sandbox receipts unless asked and reports ledger entries no receipt names', async () => {
    const sandbox = receipt({ environment: 'sandbox' });
    const orphan = refundEntry(receipt({ user_id: 'user_c' }), RETAIL_AS_BUDGET_MICROUSD);
    const entries = [refundEntry(sandbox, RETAIL_AS_BUDGET_MICROUSD), orphan];

    const production = await reportOf([sandbox], entries);
    expect(production.refunds).toEqual([]);
    expect(production.unmatchedLedgerEntries.map((entry) => entry.id)).toEqual([orphan.id]);

    const { db } = fixtureDatabase([sandbox], entries);
    const withSandbox = await readOverRevokedTopUpRefunds(db, { includeSandbox: true, now: NOW });
    expect(withSandbox.refunds.map((refund) => refund.environment)).toEqual(['sandbox']);
  });

  it('opens one read-only transaction and sends no statement that writes', async () => {
    const refunded = receipt();
    const fixture = fixtureDatabase([refunded], [refundEntry(refunded, RETAIL_AS_BUDGET_MICROUSD)]);
    await readOverRevokedTopUpRefunds(fixture.db, { includeSandbox: false, now: NOW });

    expect(fixture.executed).toEqual([READ_ONLY_STATEMENT]);
    expect(fixture.statements[0]).toBe(READ_ONLY_STATEMENT);
    expect(fixture.statements[1]).toBe(READ_ONLY_PROBE_SQL);
    for (const sql of fixture.statements.slice(1)) {
      expect(sql.trimStart().toLowerCase().startsWith('select')).toBe(true);
    }
  });

  it('reads nothing when the database does not confirm the transaction is read-only', async () => {
    const refunded = receipt();
    const fixture = fixtureDatabase(
      [refunded],
      [refundEntry(refunded, RETAIL_AS_BUDGET_MICROUSD)],
      'off',
    );
    const errors: string[] = [];
    const code = await runTopUpRefundReport(
      [],
      {},
      async () => fixture.db,
      () => {},
      (line) => errors.push(line),
      () => NOW,
    );

    expect(code).toBe(1);
    expect(errors.at(-1)).toMatch(/^Refused: /);
    expect(fixture.statements).toEqual([READ_ONLY_STATEMENT, READ_ONLY_PROBE_SQL]);
    expect(fixture.disposed()).toBe(true);
  });
});

describe('report command line', () => {
  it('has no write mode: an apply flag is refused before any database is opened', async () => {
    const open = vi.fn();
    const errors: string[] = [];
    const code = await runTopUpRefundReport(
      ['--apply'],
      {},
      open,
      () => {},
      (line) => errors.push(line),
    );

    expect(code).toBe(2);
    expect(open).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('Usage: pnpm report:mobile-top-up-refunds');
    expect(parseReportArgs(['--json', '--include-sandbox'])).toEqual({
      json: true,
      includeSandbox: true,
    });
  });

  it('prints a table with totals, or the same report as JSON', async () => {
    const refunded = receipt();
    const entries = [refundEntry(refunded, RETAIL_AS_BUDGET_MICROUSD)];
    const env = { AGI_DATABASE_URL: 'postgresql://reader:secret@db.example.test/agi' };

    const table: string[] = [];
    const notices: string[] = [];
    await runTopUpRefundReport(
      [],
      env,
      async () => fixtureDatabase([refunded], entries).db,
      (line) => table.push(line),
      (line) => notices.push(line),
      () => NOW,
    );
    const text = table.join('\n');
    expect(text).toContain(refunded.store_transaction_id);
    expect(text).toMatch(/TOTAL 1 refund\(s\), 1 account\(s\)/);
    expect(text).toContain('1,500');
    expect(notices.join('\n')).toContain('db.example.test/agi');
    expect(notices.join('\n')).not.toContain('secret');

    const json: string[] = [];
    await runTopUpRefundReport(
      ['--json'],
      env,
      async () => fixtureDatabase([refunded], entries).db,
      (line) => json.push(line),
      () => {},
      () => NOW,
    );
    const parsed = JSON.parse(json.join('\n'));
    expect(parsed.totals.owedCents).toBe(750);
    expect(parsed.refunds[0].storeTransactionId).toBe(refunded.store_transaction_id);
    expect(formatTopUpRefundTable(parsed)).toBe(text);
  });
});
