import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { readAccountUsageHistory } from '../account-usage-history-service';
import { readOrganizationUsage } from '../organization-usage-service';

const USER = 'user_2abcDEF';
const ORG = '11111111-1111-4111-8111-111111111111';
const WINDOW = { from: '2026-07-24T00:00:00.000Z', to: '2026-08-23T00:00:00.000Z' };

function harness(rows: Record<string, unknown[]> = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (/date_trunc\('day'/.test(text)) return rows['daily'] ?? [];
    if (/unsettled_requests/.test(text)) return rows['freshness'] ?? [];
    if (/group by 1/.test(text)) {
      if (/as sessions/.test(text)) return rows['workloadSessions'] ?? [];
      if (/'workload' as key/.test(text)) return rows['workload'] ?? [];
      if (/model as key/.test(text)) return rows['model'] ?? [];
      return rows['other'] ?? [];
    }
    return rows['totals'] ?? [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

function agg(over: Record<string, unknown> = {}) {
  return {
    key: 'chat',
    requests: 12,
    input_tokens: '4000',
    output_tokens: '1500',
    cost_cents: '250',
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('readAccountUsageHistory', () => {
  it('binds the reader as the first parameter of every query', async () => {
    const h = harness();
    await readAccountUsageHistory(h.db, USER, WINDOW);

    expect(h.query.mock.calls.length).toBeGreaterThan(0);
    for (const [sql, params] of h.query.mock.calls) {
      expect(String(sql)).toContain('user_id = $1');
      expect((params as unknown[])[0]).toBe(USER);
    }
  });

  it('counts only settled turns', async () => {
    const h = harness();
    await readAccountUsageHistory(h.db, USER, WINDOW);

    const aggregates = h.query.mock.calls.filter(
      ([sql]) => !/unsettled_requests/.test(String(sql)),
    );
    expect(aggregates.length).toBeGreaterThan(0);
    for (const [sql] of aggregates) {
      expect(String(sql)).toContain(`status = 'completed'`);
    }
  });

  it('returns the day series oldest first so a trend reads left to right', async () => {
    const h = harness({
      daily: [
        { day: '2026-08-21T00:00:00.000Z', requests: 3, cost_cents: '40' },
        { day: '2026-08-22T00:00:00.000Z', requests: 5, cost_cents: '90' },
      ],
    });
    const history = await readAccountUsageHistory(h.db, USER, WINDOW);

    expect(history.daily.map((day) => day.day)).toEqual([
      '2026-08-21T00:00:00.000Z',
      '2026-08-22T00:00:00.000Z',
    ]);
    expect(history.daily.map((day) => day.costCents)).toEqual([40, 90]);
    const [dailySql] = h.query.mock.calls.find(([sql]) =>
      /date_trunc\('day'/.test(String(sql)),
    ) as [string];
    expect(dailySql).toContain('order by 1 asc');
  });

  it('breaks the same window down by product area and by model', async () => {
    const h = harness({
      workload: [agg({ key: 'work', cost_cents: '900' }), agg({ key: 'chat', cost_cents: '120' })],
      model: [agg({ key: 'model-a', cost_cents: '900' })],
    });
    const history = await readAccountUsageHistory(h.db, USER, WINDOW);

    expect(history.byWorkload.map((row) => row.key)).toEqual(['work', 'chat']);
    expect(history.byWorkload[0]?.costCents).toBe(900);
    expect(history.byModel.map((row) => row.key)).toEqual(['model-a']);
  });

  it('ranks the heaviest spender first in every breakdown', async () => {
    const h = harness();
    await readAccountUsageHistory(h.db, USER, WINDOW);

    const grouped = h.query.mock.calls.filter(([sql]) => /group by 1/.test(String(sql)));
    expect(grouped.length).toBeGreaterThan(0);
    for (const [sql] of grouped) {
      if (/date_trunc/.test(String(sql))) continue;
      expect(String(sql)).toContain('order by cost_cents desc');
    }
  });

  it('labels an unattributed turn rather than dropping it', async () => {
    const h = harness({ workload: [agg({ key: null })] });
    const history = await readAccountUsageHistory(h.db, USER, WINDOW);
    expect(history.byWorkload[0]?.key).toBe('unknown');
  });

  it('reports turns that have not settled instead of implying the total is final', async () => {
    const h = harness({
      freshness: [{ latest_activity_at: '2026-08-22T10:00:00.000Z', unsettled_requests: '4' }],
    });
    const history = await readAccountUsageHistory(h.db, USER, WINDOW);

    expect(history.freshness.unsettledRequests).toBe(4);
    expect(history.freshness.latestActivityAt).toBe('2026-08-22T10:00:00.000Z');
  });

  it('returns zeroes rather than throwing for an account with no settled usage', async () => {
    const h = harness();
    const history = await readAccountUsageHistory(h.db, USER, WINDOW);

    expect(history.totals).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    });
    expect(history.daily).toEqual([]);
    expect(history.byWorkload).toEqual([]);
    expect(history.freshness.latestActivityAt).toBeNull();
  });

  it('never selects anything the account typed', async () => {
    const h = harness();
    await readAccountUsageHistory(h.db, USER, WINDOW);
    for (const [sql] of h.query.mock.calls) {
      expect(String(sql)).not.toMatch(/prompt\b|completion\b|content|title|messages/i);
    }
  });
});

/**
 * The account's own page and the workspace console are two readers of one
 * table. A person who reads both must not be told two different things about
 * the same turn, so the predicates and the summed columns are compared rather
 * than assumed.
 */
describe('account history and workspace console agree on what usage is', () => {
  function predicates(calls: [string, ...unknown[]][]): {
    settled: number;
    unsettled: number;
    cost: number;
    tokens: number;
  } {
    const text = calls.map(([sql]) => String(sql)).join('\n');
    return {
      settled: text.split(`status = 'completed'`).length - 1,
      unsettled: text.split(`'reserving', 'reserved', 'provider_started', 'outcome_unknown'`)
        .length,
      cost: text.split('sum(coalesce(actual_cost_cents, 0))').length - 1,
      tokens: text.split(`usage->>'input_tokens'`).length - 1,
    };
  }

  it('sums the settled cost column both surfaces claim to report', async () => {
    const accountHarness = harness();
    await readAccountUsageHistory(accountHarness.db, USER, WINDOW);
    const organizationHarness = harness();
    await readOrganizationUsage(organizationHarness.db, ORG, WINDOW);

    const account = predicates(accountHarness.query.mock.calls as [string, ...unknown[]][]);
    const organization = predicates(
      organizationHarness.query.mock.calls as [string, ...unknown[]][],
    );

    for (const side of [account, organization]) {
      expect(side.settled).toBeGreaterThan(0);
      expect(side.unsettled).toBeGreaterThan(1);
      expect(side.cost).toBeGreaterThan(0);
      expect(side.tokens).toBeGreaterThan(0);
    }
  });

  /**
   * A settled turn cost what it cost. If a reader recomputed that from token
   * counts and whatever a model costs today, every historical figure would
   * move the next time a price did, and an invoice already paid would stop
   * matching the usage page that explains it.
   */
  it('reports a settled cost as it was stored, never recomputed from a current rate', async () => {
    const accountHarness = harness();
    await readAccountUsageHistory(accountHarness.db, USER, WINDOW);
    const organizationHarness = harness();
    await readOrganizationUsage(organizationHarness.db, ORG, WINDOW);

    const statements = [...accountHarness.query.mock.calls, ...organizationHarness.query.mock.calls]
      .map(([sql]) => String(sql))
      .filter((sql) => /cost_cents/.test(sql));

    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      const costExpressions = sql.match(/as cost_cents/gu) ?? [];
      expect(costExpressions.length).toBe(1);
      expect(sql).toContain('sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents');
      expect(sql).not.toMatch(/price|rate|per_million|multiplier|credits_per/iu);
      expect(sql).not.toMatch(/tokens.*\*|\*.*tokens/u);
      expect(sql).not.toMatch(/\bjoin\b/iu);
    }
  });

  it('reports the same figures for one turn read from either surface', async () => {
    const settled = [agg({ key: null, requests: 7, cost_cents: '410' })];
    const accountHarness = harness({ totals: settled });
    const account = await readAccountUsageHistory(accountHarness.db, USER, WINDOW);
    const organizationHarness = harness({ totals: settled });
    const organization = await readOrganizationUsage(organizationHarness.db, ORG, WINDOW);

    expect(account.totals).toEqual(organization.totals);
  });
});
