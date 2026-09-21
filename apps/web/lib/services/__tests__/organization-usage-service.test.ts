import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  readOrganizationUsage,
  resolveUsageWindow,
  USAGE_MAX_WINDOW_DAYS,
} from '../organization-usage-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-23T00:00:00.000Z');

function harness(rows: Record<string, unknown[]> = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (/date_trunc\('day'/.test(text)) return rows['daily'] ?? [];
    if (/unsettled_requests/.test(text)) return rows['freshness'] ?? [];
    if (/group by 1/.test(text)) {
      if (/as sessions/.test(text)) return rows['workloadSessions'] ?? [];
      if (/user_id as key/.test(text)) return rows['member'] ?? [];
      if (/model as key/.test(text)) return rows['model'] ?? [];
      if (/provider as key/.test(text)) return rows['provider'] ?? [];
      if (/'workload' as key/.test(text)) return rows['workload'] ?? [];
      if (/'projectId' as key/.test(text)) return rows['project'] ?? [];
    }
    return rows['totals'] ?? [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

function agg(over: Record<string, unknown> = {}) {
  return {
    key: 'user-a',
    requests: 12,
    input_tokens: '4000',
    output_tokens: '1500',
    cost_cents: '250',
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('readOrganizationUsage', () => {
  const window = { from: '2026-07-24T00:00:00.000Z', to: '2026-08-23T00:00:00.000Z' };

  it('binds the organization as the first parameter of every query', async () => {
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    expect(h.query).toHaveBeenCalled();
    for (const [, params] of h.query.mock.calls) {
      expect((params as unknown[])[0]).toBe(ORG);
    }
  });

  it('counts only settled turns', async () => {
    // A declined or in-flight reservation has cost the workspace nothing, and
    // counting it would inflate the number an administrator budgets against.
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    for (const [sql] of h.query.mock.calls) {
      expect(String(sql)).toContain("status = 'completed'");
    }
  });

  it('never selects a margin column', async () => {
    // gross_margin is OUR margin, not the customer's cost. It must not reach a
    // customer-facing response by accident.
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    for (const [sql] of h.query.mock.calls) {
      expect(String(sql)).not.toMatch(/gross_margin/i);
    }
  });

  it('never selects conversation content', async () => {
    // An administrator gets spend and volume. Reading what their staff asked
    // the model is a different power, and this surface must not grant it.
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    for (const [sql] of h.query.mock.calls) {
      expect(String(sql)).not.toMatch(/messages|content|prompt\b|completion\b(?!_tokens)/i);
    }
  });

  it('does not read the ledger that nothing writes to', async () => {
    // organization_usage_ledger has no writer, so a dashboard on it would
    // report zero forever while looking authoritative.
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    for (const [sql] of h.query.mock.calls) {
      expect(String(sql)).not.toContain('organization_usage_ledger');
      expect(String(sql)).toContain('managed_usage_requests');
    }
  });

  it('sums numeric strings the driver returns rather than concatenating them', async () => {
    const h = harness({ totals: [agg({ cost_cents: '2500', input_tokens: '900' })] });
    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.totals.costCents).toBe(2500);
    expect(usage.totals.inputTokens).toBe(900);
  });

  it('returns zeroes rather than throwing on an empty workspace', async () => {
    const h = harness({ totals: [] });
    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.totals).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    });
    expect(usage.byMember).toEqual([]);
  });

  it('labels a null grouping key rather than dropping the row', async () => {
    const h = harness({ member: [agg({ key: null })] });
    const usage = await readOrganizationUsage(h.db, ORG, window);
    expect(usage.byMember[0]?.key).toBe('unknown');
  });

  /**
   * The question an owner actually has is "who is spending this", and an
   * answer in membership order buries the one member who matters behind
   * forty who spent nothing.
   */
  it('ranks the heaviest spender first so an owner can see who is driving the bill', async () => {
    const h = harness({
      member: [
        agg({ key: 'user-heavy', requests: 400, cost_cents: '90000' }),
        agg({ key: 'user-light', requests: 2, cost_cents: '30' }),
      ],
    });
    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.byMember.map((row) => row.key)).toEqual(['user-heavy', 'user-light']);
    expect(usage.byMember[0]?.costCents).toBe(90000);

    const memberQuery = h.query.mock.calls.find(([sql]) => /user_id as key/.test(String(sql)));
    expect(memberQuery).toBeDefined();
    expect(String(memberQuery?.[0])).toContain('order by cost_cents desc');
  });

  it('bounds each breakdown so one workspace cannot return an unbounded set', async () => {
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    const grouped = h.query.mock.calls.filter(([sql]) => /group by 1/.test(String(sql)));
    expect(grouped.length).toBeGreaterThan(0);
    for (const [sql] of grouped) {
      if (/date_trunc/.test(String(sql))) continue;
      expect(String(sql)).toMatch(/limit \d+/);
    }
  });
});

describe('readOrganizationUsage product area and project', () => {
  const window = { from: '2026-07-24T00:00:00.000Z', to: '2026-08-23T00:00:00.000Z' };

  it('groups settled spend by workload and by project from the recorded attribution', async () => {
    const h = harness({
      workload: [agg({ key: 'research', cost_cents: '900' }), agg({ key: null })],
      project: [agg({ key: 'project-1', cost_cents: '400' })],
    });

    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.byWorkload.map((row) => [row.key, row.costCents])).toEqual([
      ['research', 900],
      ['unknown', 250],
    ]);
    expect(usage.byProject[0]).toMatchObject({ key: 'project-1', costCents: 400 });
  });

  it('names Work sessions and Code sessions rather than leaving them to be inferred', async () => {
    const h = harness({
      workloadSessions: [
        agg({ key: 'work', sessions: 4, requests: 20, cost_cents: '900' }),
        agg({ key: 'code', sessions: 2, requests: 7, cost_cents: '300' }),
        agg({ key: 'chat', sessions: 9, requests: 40, cost_cents: '100' }),
      ],
    });

    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.workSessions).toMatchObject({
      workload: 'work',
      sessions: 4,
      requests: 20,
      costCents: 900,
    });
    expect(usage.codeSessions).toMatchObject({
      workload: 'code',
      sessions: 2,
      requests: 7,
      costCents: 300,
    });
  });

  it('counts a session once however many turns it produced', async () => {
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    const sessionQuery = h.query.mock.calls.find(([sql]) => /as sessions/.test(String(sql)));
    expect(String(sessionQuery?.[0])).toContain("count(distinct usage->>'sessionId')");
  });

  it('reports zero Work and Code sessions rather than omitting the field', async () => {
    const h = harness({ workloadSessions: [] });
    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.workSessions).toEqual({
      workload: 'work',
      sessions: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    });
    expect(usage.codeSessions.sessions).toBe(0);
  });
});

describe('readOrganizationUsage freshness', () => {
  const window = { from: '2026-07-24T00:00:00.000Z', to: '2026-08-23T00:00:00.000Z' };

  it('says when the answer was computed and how recent the newest turn in it is', async () => {
    const h = harness({
      freshness: [{ latest_activity_at: '2026-08-22T18:30:00.000Z', unsettled_requests: 3 }],
    });

    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.freshness.latestActivityAt).toBe('2026-08-22T18:30:00.000Z');
    expect(usage.freshness.unsettledRequests).toBe(3);
    expect(Number.isNaN(Date.parse(usage.freshness.asOf))).toBe(false);
  });

  it('reports a null newest turn for a window with no settled activity', async () => {
    const h = harness({ freshness: [{ latest_activity_at: null, unsettled_requests: 0 }] });
    const usage = await readOrganizationUsage(h.db, ORG, window);

    expect(usage.freshness.latestActivityAt).toBeNull();
    expect(usage.freshness.unsettledRequests).toBe(0);
  });

  it('counts in-flight turns, not turns that were released or declined', async () => {
    const h = harness();
    await readOrganizationUsage(h.db, ORG, window);

    const freshnessQuery = h.query.mock.calls.find(([sql]) =>
      /unsettled_requests/.test(String(sql)),
    );
    const sql = String(freshnessQuery?.[0]);
    expect(sql).toContain('provider_started');
    expect(sql).toContain('outcome_unknown');
    expect(sql).not.toContain("'released'");
    expect(sql).not.toContain("'declined'");
  });
});

describe('resolveUsageWindow', () => {
  it('defaults to a trailing window when nothing is asked for', () => {
    const { from, to } = resolveUsageWindow(null, null, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(new Date(from).getTime()).toBeLessThan(NOW.getTime());
  });

  it('clamps an open-ended range', () => {
    // Otherwise one admin can request a group-by over every row the workspace
    // has ever produced, on the connection that serves live turns.
    const { from } = resolveUsageWindow('1999-01-01T00:00:00.000Z', null, NOW);
    const days = (NOW.getTime() - new Date(from).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(USAGE_MAX_WINDOW_DAYS);
  });

  it('survives an unparseable date instead of producing Invalid Date', () => {
    const { from, to } = resolveUsageWindow('not-a-date', 'also-not-a-date', NOW);
    expect(Number.isNaN(new Date(from).getTime())).toBe(false);
    expect(Number.isNaN(new Date(to).getTime())).toBe(false);
  });

  it('never returns a window that runs backwards', () => {
    const { from, to } = resolveUsageWindow('2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    expect(new Date(from).getTime()).toBeLessThanOrEqual(new Date(to).getTime());
  });
});
