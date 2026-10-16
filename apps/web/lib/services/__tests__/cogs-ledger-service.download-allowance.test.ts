import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: vi.fn(),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { countUserDownloadAllowanceGibSince } from '../cogs-ledger-service';

const SINCE = new Date('2026-10-01T00:00:00.000Z');

describe('countUserDownloadAllowanceGibSince (owner decision on media)', () => {
  it('sums the account’s egress since the date, leaving out egress accrued as exempt', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => [{ units: '0.25' }]);

    const gib = await countUserDownloadAllowanceGibSince('user-1', SINCE, {
      query,
    } as unknown as DatabaseAdapter);

    expect(gib).toBe(0.25);
    const [sql, params] = query.mock.calls[0]!;
    expect(String(sql)).toContain('from public.provider_cost_events event');
    expect(String(sql)).toContain('event.user_id = $1');
    expect(String(sql)).toContain('event.feature = $2');
    expect(String(sql)).toContain('event.occurred_at >= $3::timestamptz');
    expect(String(sql)).toContain("coalesce(event.metadata ->> $4, 'false') <> 'true'");
    expect(params).toEqual([
      'user-1',
      'network_egress_gib',
      SINCE.toISOString(),
      'downloadAllowanceExempt',
    ]);
  });

  it('reads an empty ledger as nothing used', async () => {
    const query = vi.fn(async () => [{ units: null }]);

    await expect(
      countUserDownloadAllowanceGibSince('user-1', SINCE, { query } as unknown as DatabaseAdapter),
    ).resolves.toBe(0);
  });
});
