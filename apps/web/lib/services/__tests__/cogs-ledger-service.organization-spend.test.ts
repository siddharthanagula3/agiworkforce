import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getOrganizationMonthToDateSpendCents } from '../cogs-ledger-service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function harness(rows: Array<Record<string, unknown>>) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('getOrganizationMonthToDateSpendCents', () => {
  it('sums provider cost across every member of the organization', async () => {
    const h = harness([{ spend_cents: 4_250 }]);

    const spend = await getOrganizationMonthToDateSpendCents(ORGANIZATION_ID, h.db);

    expect(spend).toBe(4_250);
    const [sql, params] = h.query.mock.calls[0]!;
    expect(String(sql)).toContain('organization_members');
    expect(String(sql)).toContain('provider_cost_events');
    expect(params).toEqual([ORGANIZATION_ID]);
  });

  it('returns zero when the organization has no cost events this month', async () => {
    const h = harness([{ spend_cents: 0 }]);
    expect(await getOrganizationMonthToDateSpendCents(ORGANIZATION_ID, h.db)).toBe(0);
  });

  it('returns zero when the query returns no row', async () => {
    const h = harness([]);
    expect(await getOrganizationMonthToDateSpendCents(ORGANIZATION_ID, h.db)).toBe(0);
  });
});
