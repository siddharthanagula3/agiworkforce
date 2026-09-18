import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: vi.fn() }) }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  burnRateOf,
  evaluateBurnRates,
  measureSlo,
  measureSloBySegment,
  measureSloCatalogue,
  BURN_RATE_MIN_SAMPLES,
  BURN_RATE_THRESHOLDS,
} from '../attainment';
import { findSlo, measuredSlos } from '../catalogue';

const NOW = new Date('2026-09-17T00:00:00.000Z');

interface Captured {
  sql: string;
  params: unknown[];
}

function fakeDb(answer: (sql: string, params: unknown[]) => Record<string, unknown>): {
  db: DatabaseAdapter;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [answer(sql, params)];
    }),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

const CHAT = findSlo('chat')!;
const FIRST_TOKEN = findSlo('first-token')!;

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeRows(rows: Record<string, unknown>[]): { db: DatabaseAdapter; calls: Captured[] } {
  const calls: Captured[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows;
    }),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

describe('SLO segmentation', () => {
  it('reads one attainment per region without losing the aggregate query shape', async () => {
    const { db, calls } = fakeRows([
      { segment_value: 'iad1', eligible: '100', good: '99', latency_p95_ms: '820' },
      { segment_value: 'sfo1', eligible: '100', good: '80', latency_p95_ms: '2100' },
    ]);

    const segments = await measureSloBySegment(
      CHAT,
      'region',
      new Date('2026-08-18T00:00:00.000Z'),
      NOW,
      db,
    );

    expect(calls[0]?.sql).toContain('group by 1');
    expect(calls[0]?.sql).toContain('coalesce(region');
    expect(segments.map((entry) => entry.value)).toEqual(['iad1', 'sfo1']);
    expect(segments[0]?.attainment).toBeCloseTo(0.99, 6);
    expect(segments[1]?.attainment).toBeCloseTo(0.8, 6);
  });

  it('splits by the model column, not by a column name it invented', async () => {
    const { db, calls } = fakeRows([
      { segment_value: 'a/b', eligible: '10', good: '10', latency_p95_ms: null },
    ]);

    await measureSloBySegment(CHAT, 'model', new Date('2026-08-18T00:00:00.000Z'), NOW, db);

    expect(calls[0]?.sql).toContain('coalesce(model_key');
  });

  it('passes the latency threshold through for a latency indicator', async () => {
    const { db, calls } = fakeRows([
      { segment_value: 'openai', eligible: '10', good: '9', latency_p95_ms: '900' },
    ]);

    const segments = await measureSloBySegment(
      FIRST_TOKEN,
      'provider',
      new Date('2026-08-18T00:00:00.000Z'),
      NOW,
      db,
    );

    expect(calls[0]?.params).toHaveLength(3);
    expect(segments[0]?.latencyP95Ms).toBe(900);
  });

  it('returns nothing, and runs no query, for a segment the indicator does not carry', async () => {
    const { db, calls } = fakeRows([]);

    const segments = await measureSloBySegment(
      findSlo('work')!,
      'model',
      new Date('2026-08-18T00:00:00.000Z'),
      NOW,
      db,
    );

    expect(segments).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('drops a bucket with no sample instead of reporting it as a zero-percent outage', async () => {
    const { db } = fakeRows([
      { segment_value: 'iad1', eligible: '0', good: '0', latency_p95_ms: null },
      { segment_value: 'sfo1', eligible: '5', good: '5', latency_p95_ms: null },
    ]);

    const segments = await measureSloBySegment(
      CHAT,
      'region',
      new Date('2026-08-18T00:00:00.000Z'),
      NOW,
      db,
    );

    expect(segments.map((entry) => entry.value)).toEqual(['sfo1']);
  });
});

describe('SLO attainment', () => {
  it('computes attainment and the remaining error budget from the counted rows', async () => {
    const { db } = fakeDb(() => ({ eligible: '1000', good: '995', latency_p95_ms: null }));

    const measured = await measureSlo(CHAT, new Date('2026-08-18T00:00:00.000Z'), NOW, db);

    expect(measured.samples).toBe(1_000);
    expect(measured.good).toBe(995);
    expect(measured.attainment).toBeCloseTo(0.995, 6);
    expect(measured.errorBudgetRemaining).toBeCloseTo(0.5, 6);
  });

  it('reports no attainment rather than zero when the window holds no sample', async () => {
    const { db } = fakeDb(() => ({ eligible: '0', good: '0', latency_p95_ms: null }));

    const measured = await measureSlo(CHAT, new Date('2026-08-18T00:00:00.000Z'), NOW, db);

    expect(measured.samples).toBe(0);
    expect(measured.attainment).toBeNull();
    expect(measured.errorBudgetRemaining).toBeNull();
  });

  it('bounds the reported error budget at zero once the objective is blown through', async () => {
    const { db } = fakeDb(() => ({ eligible: '100', good: '50', latency_p95_ms: null }));

    const measured = await measureSlo(CHAT, new Date('2026-08-18T00:00:00.000Z'), NOW, db);

    expect(measured.errorBudgetRemaining).toBe(0);
  });

  it('passes the latency deadline as a bound parameter, never as inlined text', async () => {
    const { db, calls } = fakeDb(() => ({ eligible: '10', good: '9', latency_p95_ms: '2500.4' }));

    const measured = await measureSlo(FIRST_TOKEN, new Date('2026-09-16T00:00:00.000Z'), NOW, db);

    expect(calls[0]?.params).toEqual([
      '2026-09-16T00:00:00.000Z',
      '2026-09-17T00:00:00.000Z',
      FIRST_TOKEN.thresholdMs,
    ]);
    expect(calls[0]?.sql).toContain('ttft_ms <= $3');
    expect(measured.latencyP95Ms).toBe(2_500);
  });

  it('reads each indicator from the table its definition names', async () => {
    const { db, calls } = fakeDb(() => ({ eligible: '0', good: '0', latency_p95_ms: null }));

    await measureSloCatalogue(NOW, db);

    expect(calls).toHaveLength(measuredSlos().length);
    for (const [index, slo] of measuredSlos().entries()) {
      expect(calls[index]?.sql).toContain(`from public.${slo.source?.table}`);
    }
  });

  it('turns a failure ratio into multiples of the error budget', () => {
    const attainment = {
      id: 'chat',
      domain: 'Chat',
      kind: 'availability' as const,
      objective: 0.99,
      windowDays: 30,
      windowStart: NOW.toISOString(),
      windowEnd: NOW.toISOString(),
      samples: 100,
      good: 90,
      attainment: 0.9,
      errorBudgetRemaining: 0,
      latencyP95Ms: null,
    };

    expect(burnRateOf(attainment, 0.99)).toBeCloseTo(10, 6);
    expect(burnRateOf({ ...attainment, attainment: null }, 0.99)).toBeNull();
  });

  it('alerts on a fast burn and says which window fired', async () => {
    const { db } = fakeDb(() => ({ eligible: '500', good: '400', latency_p95_ms: null }));

    const alerts = await evaluateBurnRates(NOW, db);

    const chat = alerts.filter((alert) => alert.id === 'chat');
    expect(chat.map((alert) => alert.window)).toEqual(['fast', 'slow']);
    expect(chat[0]?.severity).toBe('critical');
    expect(chat[0]?.burnRate).toBeCloseTo(20, 6);
  });

  it('stays silent below the sample floor, so one bad minute is not an incident', async () => {
    const { db } = fakeDb(() => ({
      eligible: String(BURN_RATE_MIN_SAMPLES - 1),
      good: '0',
      latency_p95_ms: null,
    }));

    await expect(evaluateBurnRates(NOW, db)).resolves.toEqual([]);
  });

  it('stays silent while every measured domain is inside its budget', async () => {
    const { db } = fakeDb(() => ({ eligible: '1000', good: '1000', latency_p95_ms: null }));

    await expect(evaluateBurnRates(NOW, db)).resolves.toEqual([]);
  });

  it('evaluates a short and a long window so a sharp outage and a slow bleed both surface', () => {
    expect(BURN_RATE_THRESHOLDS.map((threshold) => threshold.hours)).toEqual([1, 6]);
    expect(BURN_RATE_THRESHOLDS.every((threshold) => threshold.burnRate > 1)).toBe(true);
  });
});
