import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getOrganizationMonthToDateSpendCents } from '../cogs-ledger-service';

const ORGANIZATION_A = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_B = '22222222-2222-4222-8222-222222222222';
const PERIOD = { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' };

function harness(rows: Array<Record<string, unknown>>) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('getOrganizationMonthToDateSpendCents', () => {
  it('scopes spend by the cost event’s own funding organization, never by membership', async () => {
    const h = harness([{ spend_cents: 4_250 }]);

    const spend = await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, h.db, PERIOD);

    expect(spend).toBe(4_250);
    const [sql, params] = h.query.mock.calls[0]!;
    expect(String(sql)).not.toContain('organization_members');
    expect(String(sql)).toContain('provider_cost_events');
    expect(String(sql)).toContain('event.organization_id = $1');
    expect(params).toEqual([ORGANIZATION_A, PERIOD.start, PERIOD.end]);
  });

  it('counts a cost event toward exactly one organization when the same user belongs to two', async () => {
    const rowsByOrganization: Record<string, Array<Record<string, unknown>>> = {
      [ORGANIZATION_A]: [{ spend_cents: 1_000 }],
      [ORGANIZATION_B]: [{ spend_cents: 0 }],
    };
    const query = vi.fn(async (_sql: string, params: unknown[] = []) => {
      const organizationId = params[0] as string;
      return rowsByOrganization[organizationId] ?? [];
    });
    const db = { query } as unknown as DatabaseAdapter;

    const spendA = await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, db, PERIOD);
    const spendB = await getOrganizationMonthToDateSpendCents(ORGANIZATION_B, db, PERIOD);

    expect(spendA).toBe(1_000);
    expect(spendB).toBe(0);
    expect(spendA + spendB).toBe(1_000);
  });

  it('bounds the sum to the explicit period without truncating in the database', async () => {
    const h = harness([{ spend_cents: 500 }]);

    await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, h.db, PERIOD);

    const [sql] = h.query.mock.calls[0]!;
    expect(String(sql)).not.toContain('date_trunc');
    expect(String(sql)).toContain('event.occurred_at >= $2::timestamptz');
    expect(String(sql)).toContain('event.occurred_at < $3::timestamptz');
  });

  it('defaults to the current UTC calendar month when no period is supplied', async () => {
    const h = harness([{ spend_cents: 0 }]);

    await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, h.db);

    const [, params] = h.query.mock.calls[0]!;
    const [, start, end] = params as [string, string, string];
    expect(start.endsWith('T00:00:00.000Z')).toBe(true);
    expect(end.endsWith('T00:00:00.000Z')).toBe(true);
    expect(Date.parse(end)).toBeGreaterThan(Date.parse(start));
  });

  it('returns zero when the organization has no cost events this month', async () => {
    const h = harness([{ spend_cents: 0 }]);
    expect(await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, h.db, PERIOD)).toBe(0);
  });

  it('returns zero when the query returns no row', async () => {
    const h = harness([]);
    expect(await getOrganizationMonthToDateSpendCents(ORGANIZATION_A, h.db, PERIOD)).toBe(0);
  });
});
