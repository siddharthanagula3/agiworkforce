import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

import {
  explainManagedUsageRequest,
  getObservabilityBreakdown,
  resolveObservabilityWindow,
} from '@/lib/services/route-cache-observability-service';

function fakeDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => 1),
  };
}

describe('route cache observability · breakdown arithmetic', () => {
  it('computes cache hit rate from requests with a cache read over requests', async () => {
    const db = fakeDb([
      {
        key: 'fixture_provider/fixture-model-a',
        requests: '10',
        cache_read_tokens: '4000',
        cache_write_tokens: '500',
        input_tokens: '9000',
        cache_hit_requests: '6',
        actual_cost_cents: '120',
        retail_cost_cents: '480',
        retail_priced_requests: '10',
        retail_priced_actual_cost_cents: '120',
        fallback_count: '0',
        latency_p50_ms: '820',
        latency_p95_ms: '2100',
      },
    ]);

    const rows = await getObservabilityBreakdown(
      'route',
      new Date('2026-09-02T00:00:00Z'),
      new Date('2026-09-03T00:00:00Z'),
      db as never,
    );
    const row = rows[0]!;

    expect(row.cacheHitRate).toBeCloseTo(0.6);
    expect(row.valueMultiplier).toBeCloseTo(4);
    expect(row.retailCoverage).toBeCloseTo(1);
    expect(row.latencyP50Ms).toBe(820);
    expect(row.latencyP95Ms).toBe(2100);
  });

  it('prices the multiplier only over the retail-priced subset, not diluted by the full request count', async () => {
    const db = fakeDb([
      {
        key: 'fixture_provider/fixture-model-a',
        requests: '10',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        input_tokens: '0',
        cache_hit_requests: '0',
        actual_cost_cents: '1000',
        retail_cost_cents: '80',
        retail_priced_requests: '2',
        retail_priced_actual_cost_cents: '100',
        fallback_count: '0',
        latency_p50_ms: null,
        latency_p95_ms: null,
      },
    ]);

    const rows = await getObservabilityBreakdown(
      'route',
      new Date('2026-09-02T00:00:00Z'),
      new Date('2026-09-03T00:00:00Z'),
      db as never,
    );
    const row = rows[0]!;

    expect(row.valueMultiplier).toBeCloseTo(0.8);
    expect(row.retailCoverage).toBeCloseTo(0.2);
  });

  it('reports a null value multiplier when no row in the group carried a retail price', async () => {
    const db = fakeDb([
      {
        key: 'runway/gen-4',
        requests: '3',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        input_tokens: '0',
        cache_hit_requests: '0',
        actual_cost_cents: '900',
        retail_cost_cents: '0',
        retail_priced_requests: '0',
        retail_priced_actual_cost_cents: '0',
        fallback_count: '0',
        latency_p50_ms: null,
        latency_p95_ms: null,
      },
    ]);

    const rows = await getObservabilityBreakdown(
      'model',
      new Date('2026-09-02T00:00:00Z'),
      new Date('2026-09-03T00:00:00Z'),
      db as never,
    );
    const row = rows[0]!;

    expect(row.valueMultiplier).toBeNull();
    expect(row.latencyP50Ms).toBeNull();
    expect(row.cacheHitRate).toBe(0);
  });

  it('passes through the fallback count untouched', async () => {
    const db = fakeDb([
      {
        key: 'fixture_provider/fixture-model-b',
        requests: '50',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        input_tokens: '0',
        cache_hit_requests: '0',
        actual_cost_cents: '0',
        retail_cost_cents: '0',
        retail_priced_requests: '0',
        fallback_count: '7',
        latency_p50_ms: null,
        latency_p95_ms: null,
      },
    ]);

    const rows = await getObservabilityBreakdown(
      'route',
      new Date('2026-09-02T00:00:00Z'),
      new Date('2026-09-03T00:00:00Z'),
      db as never,
    );
    const row = rows[0]!;

    expect(row.fallbackCount).toBe(7);
  });

  it('binds the window and join-slack parameters in order', async () => {
    const db = fakeDb([]);
    const periodStart = new Date('2026-09-02T00:00:00Z');
    const periodEnd = new Date('2026-09-03T00:00:00Z');

    await getObservabilityBreakdown('user', periodStart, periodEnd, db as never);

    const [, params] = db.query.mock.calls[0] as unknown as [string, string[]];
    expect(params[0]).toBe(periodStart.toISOString());
    expect(params[1]).toBe(periodEnd.toISOString());
    expect(new Date(params[2] as string).getTime()).toBeLessThan(periodStart.getTime());
    expect(new Date(params[3] as string).getTime()).toBeGreaterThan(periodEnd.getTime());
  });
});

describe('route cache observability · per-request explain', () => {
  it('flags a fallback when the reserved route differs from the delivered route', async () => {
    const db = fakeDb([
      {
        user_id: 'user_1',
        idempotency_key: 'turn-1',
        requested_provider: 'anthropic',
        requested_model: 'fixture-premium-model',
        delivered_provider: 'anthropic',
        delivered_model: 'fixture-fallback-model',
        route_id: 'anthropic/fixture-fallback-model',
        reserved_route_id: 'anthropic/fixture-premium-model',
        fallback_reason: null,
        fallback_sequence: [{ provider: 'anthropic', model: 'fixture-fallback-model' }],
        cache_read_tokens: '1200',
        cache_write_tokens: '0',
        input_tokens: '3000',
        actual_cost_cents: '40',
        retail_cost_cents: '160',
        latency_ms: '640',
        status: 'completed',
        created_at: '2026-09-03T01:00:00.000Z',
      },
    ]);

    const explain = await explainManagedUsageRequest(
      { userId: 'user_1', idempotencyKey: 'turn-1' },
      db as never,
    );

    expect(explain).not.toBeNull();
    expect(explain?.fallbackOccurred).toBe(true);
    expect(explain?.valueMultiplier).toBeCloseTo(4);
    expect(explain?.fallbackSequence).toHaveLength(1);
  });

  it('reports no fallback when no reservation route was recorded', async () => {
    const db = fakeDb([
      {
        user_id: 'user_2',
        idempotency_key: 'turn-2',
        requested_provider: 'openai',
        requested_model: 'fixture-model',
        delivered_provider: 'openai',
        delivered_model: 'fixture-model',
        route_id: 'openai/fixture-model',
        reserved_route_id: null,
        fallback_reason: null,
        fallback_sequence: [],
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        input_tokens: '500',
        actual_cost_cents: '10',
        retail_cost_cents: null,
        latency_ms: null,
        status: 'completed',
        created_at: '2026-09-03T01:00:00.000Z',
      },
    ]);

    const explain = await explainManagedUsageRequest(
      { userId: 'user_2', idempotencyKey: 'turn-2' },
      db as never,
    );

    expect(explain?.fallbackOccurred).toBe(false);
    expect(explain?.valueMultiplier).toBeNull();
    expect(explain?.retailCostCents).toBeNull();
  });

  it('returns null when the request is not found', async () => {
    const db = fakeDb([]);
    const explain = await explainManagedUsageRequest(
      { userId: 'user_3', idempotencyKey: 'missing' },
      db as never,
    );
    expect(explain).toBeNull();
  });
});

describe('route cache observability · window resolution', () => {
  it('defaults to the last 24 hours', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    const { from, to } = resolveObservabilityWindow(null, null, now);
    expect(to.getTime()).toBe(now.getTime());
    expect(now.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('clamps a from after to back to to', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    const { from, to } = resolveObservabilityWindow('2026-09-03T13:00:00Z', null, now);
    expect(from.getTime()).toBe(to.getTime());
  });

  it('falls back to the default window on an invalid from', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    const { from } = resolveObservabilityWindow('not-a-date', null, now);
    expect(now.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
