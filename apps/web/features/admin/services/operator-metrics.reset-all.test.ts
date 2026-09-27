import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { resetAllUsersUsage } from './operator-metrics';

function postgresReturning(
  sql: string,
  accounts: Array<{ id: string; user_id: string; used: number }>,
) {
  const readsCentsBefore = /before\.credits_used_cents\s+as\s+cleared_cents/i.test(sql);
  const readsMicrousdBefore = /before\.credits_used_microusd\s+as\s+cleared_microusd/i.test(sql);
  return accounts.map((account) => ({
    id: account.id,
    user_id: account.user_id,
    credits_used_cents: 0,
    ...(readsCentsBefore ? { cleared_cents: account.used } : {}),
    ...(readsMicrousdBefore ? { cleared_microusd: String(account.used * 10_000) } : {}),
  }));
}

describe('resetAllUsersUsage', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue(undefined);
  });

  it('reports and ledgers the consumption that existed before the update, not the zero it wrote', async () => {
    const accounts = [
      { id: 'acct_1', user_id: 'user_1', used: 1250 },
      { id: 'acct_2', user_id: 'user_2', used: 300 },
    ];
    mocks.query.mockImplementation(async (sql: string) => postgresReturning(sql, accounts));

    const result = await resetAllUsersUsage('operator_1');

    expect(result).toEqual({ affectedUsers: 2, clearedCredits: 3100 });
    const [ledgerSql, ledgerValues] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(ledgerSql).toMatch(/insert into public\.credit_transactions/i);
    expect(ledgerValues).toEqual([
      'user_1',
      'acct_1',
      1250,
      JSON.stringify({ reason: 'operator_bulk_reset', actor_id: 'operator_1' }),
      'user_2',
      'acct_2',
      300,
      JSON.stringify({ reason: 'operator_bulk_reset', actor_id: 'operator_1' }),
    ]);
  });

  it('writes nothing to the ledger when no account had consumption', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(resetAllUsersUsage('operator_1')).resolves.toEqual({
      affectedUsers: 0,
      clearedCredits: 0,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
