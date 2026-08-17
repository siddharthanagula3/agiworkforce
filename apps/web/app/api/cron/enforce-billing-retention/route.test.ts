import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FINANCIAL_RETENTION_RULES } from '@/lib/billing/financial-record-retention';

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/enforce-billing-retention') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.query.mockResolvedValue([{ retention_key: 'a' }]);
});

describe('GET /api/cron/enforce-billing-retention', () => {
  it('401s and touches NO financial row without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('runs every rule in the schedule', async () => {
    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(FINANCIAL_RETENTION_RULES.length);
    expect(body.applied).toHaveLength(FINANCIAL_RETENTION_RULES.length);
    expect(body.purged + body.minimised).toBe(FINANCIAL_RETENTION_RULES.length);
  });

  it('deletes the credit ledger only past the statutory period', async () => {
    await GET(req());

    const ledgerDelete = mocks.query.mock.calls.find(([sql]) =>
      sql.includes('delete from public.credit_transactions'),
    );

    expect(ledgerDelete, 'nothing ages the credit ledger out').toBeDefined();
    expect(ledgerDelete?.[1][0]).toBe('2922 days');
  });

  it('empties metadata rather than deleting the row it belongs to', async () => {
    await GET(req());

    const minimise = mocks.query.mock.calls.find(
      ([sql]) =>
        sql.includes('update public.credit_transactions') && sql.includes('metadata = null'),
    );

    expect(minimise).toBeDefined();
    expect(minimise?.[1][0]).toBe('730 days');
  });

  it('never issues a statement against live plan or balance state', async () => {
    await GET(req());

    for (const [sql] of mocks.query.mock.calls) {
      expect(sql).not.toContain('public.subscriptions');
      expect(sql).not.toContain('public.token_credits');
    }
  });

  it('keeps sweeping the remaining tables when one rule fails', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('public.usage_events') ? Promise.reject(new Error('neon down')) : [],
    );

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failed).toBe(2);
    expect(mocks.query).toHaveBeenCalledTimes(FINANCIAL_RETENTION_RULES.length);
  });

  it('reports failure when the whole sweep is dead', async () => {
    mocks.query.mockRejectedValue(new Error('neon down'));

    const response = await GET(req());

    expect(response.status).toBe(500);
  });
});
