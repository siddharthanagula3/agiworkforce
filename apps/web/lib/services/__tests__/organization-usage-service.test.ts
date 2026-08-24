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
    if (/group by 1/.test(text)) {
      if (/user_id as key/.test(text)) return rows['member'] ?? [];
      if (/model as key/.test(text)) return rows['model'] ?? [];
      if (/provider as key/.test(text)) return rows['provider'] ?? [];
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
