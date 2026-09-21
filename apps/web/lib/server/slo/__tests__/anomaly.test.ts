import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: vi.fn() }) }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { OPERATIONAL_DOMAINS } from '@/lib/observability/ownership';

import {
  ANOMALY_BASELINE_DAYS,
  ANOMALY_MIN_SAMPLES,
  ANOMALY_RECENT_HOURS,
  ANOMALY_SERIES,
  evaluateAnomalies,
  measureAnomalySeries,
} from '../anomaly';
import { findSlo } from '../catalogue';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

interface Window {
  samples: number;
  measured: number | null;
}

/**
 * The recent window is the one that starts at `recentFrom`; every other read is
 * the baseline. Answering by window rather than by call order keeps the test
 * honest about which side of the comparison it is feeding.
 */
function windowedDb(answers: Readonly<Record<string, { recent: Window; baseline: Window }>>): {
  db: DatabaseAdapter;
  queries: string[];
} {
  const recentFromIso = new Date(NOW.getTime() - ANOMALY_RECENT_HOURS * 3_600_000).toISOString();
  const queries: string[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      const series = ANOMALY_SERIES.find((candidate) => sql.includes(candidate.value));
      if (!series) throw new Error(`no series matches ${sql}`);
      const answer = answers[series.id];
      if (!answer) return [{ samples: 0, measured: null }];
      const side = params[0] === recentFromIso ? answer.recent : answer.baseline;
      return [{ samples: side.samples, measured: side.measured }];
    }),
  } as unknown as DatabaseAdapter;
  return { db, queries };
}

const NORMAL: Window = { samples: 500, measured: 1_000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the anomaly series registry', () => {
  it('names an objective whose operational domain answers for it', () => {
    for (const series of ANOMALY_SERIES) {
      expect(findSlo(series.sloId), series.id).toBeDefined();
      const owner = OPERATIONAL_DOMAINS.find((domain) => domain.sloId === series.sloId);
      expect(owner, `${series.id} has no operational owner`).toBeDefined();
      expect(owner!.runbook.length).toBeGreaterThan(0);
    }
  });

  it('reads every series from a column the migrations actually create', () => {
    const migrations = path.join(REPO_ROOT, 'apps/web/db/neon');
    const missing: string[] = [];
    for (const series of ANOMALY_SERIES) {
      const source = readFileSync(
        path.join(migrations, '0212_routing_decision_traces.sql'),
        'utf8',
      );
      if (!source.includes(`create table if not exists public.${series.table}`)) {
        missing.push(`${series.id} reads ${series.table}, which no migration creates`);
        continue;
      }
      if (!new RegExp(`^\\s+${series.value}\\b`, 'm').test(source)) {
        missing.push(`${series.id} reads ${series.value}, which ${series.table} does not carry`);
      }
      if (!new RegExp(`^\\s+${series.occurredAt}\\b`, 'm').test(source)) {
        missing.push(`${series.id} orders by ${series.occurredAt}, which ${series.table} lacks`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('warns before it pages', () => {
    for (const series of ANOMALY_SERIES) {
      expect(series.criticalRatio, series.id).toBeGreaterThan(series.warningRatio);
      expect(series.warningRatio, series.id).toBeGreaterThan(1);
    }
  });
});

describe('measuring one window', () => {
  it('excludes rows the series does not sample and reads the percentile of the rest', async () => {
    const { db, queries } = windowedDb({});
    const series = ANOMALY_SERIES[0]!;

    const reading = await measureAnomalySeries(series, new Date(0), NOW, db);

    expect(reading).toEqual({ samples: 0, measured: null });
    expect(queries[0]).toContain(series.eligible);
    expect(queries[0]).toContain(`public.${series.table}`);
  });
});

describe('a series against its own baseline', () => {
  it('pages when the recent window doubles the week behind it', async () => {
    const { db } = windowedDb({
      'turn-cost': { recent: { samples: 500, measured: 2_400 }, baseline: NORMAL },
    });

    const alerts = await evaluateAnomalies(NOW, db);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.id).toBe('turn-cost');
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts[0]!.ratio).toBeCloseTo(2.4);
    expect(alerts[0]!.dedupeKey).toBe('slo-anomaly:turn-cost:critical');
    expect(alerts[0]!.owner?.runbook).toBeTruthy();
  });

  // The failure a cache regression actually produces: every turn still succeeds,
  // so no objective burns and the only thing that moves is what a turn costs.
  it('detects a prompt-cache regression that no availability objective can see', async () => {
    const { db } = windowedDb({
      'turn-cost': { recent: { samples: 800, measured: 1_600 }, baseline: NORMAL },
    });

    const alerts = await evaluateAnomalies(NOW, db);

    expect(alerts.map((alert) => alert.id)).toEqual(['turn-cost']);
    expect(alerts[0]!.severity).toBe('warning');
    expect(alerts[0]!.unit).toBe('uUSD');
  });

  it('separates latency from first token so a slow start is not read as a slow finish', async () => {
    const { db } = windowedDb({
      'turn-time-to-first-token': {
        recent: { samples: 500, measured: 3_000 },
        baseline: NORMAL,
      },
    });

    const alerts = await evaluateAnomalies(NOW, db);

    expect(alerts.map((alert) => alert.id)).toEqual(['turn-time-to-first-token']);
    expect(alerts[0]!.sloId).toBe('first-token');
  });

  it('stays quiet when the recent window is normal', async () => {
    const { db } = windowedDb({
      'turn-cost': { recent: { samples: 500, measured: 1_050 }, baseline: NORMAL },
    });

    expect(await evaluateAnomalies(NOW, db)).toEqual([]);
  });

  it('refuses to alert on a window too small to mean anything', async () => {
    const { db } = windowedDb({
      'turn-cost': {
        recent: { samples: ANOMALY_MIN_SAMPLES - 1, measured: 10_000 },
        baseline: NORMAL,
      },
    });

    expect(await evaluateAnomalies(NOW, db)).toEqual([]);
  });

  it('refuses to alert against a baseline too small to be a normal', async () => {
    const { db } = windowedDb({
      'turn-cost': {
        recent: { samples: 500, measured: 10_000 },
        baseline: { samples: ANOMALY_MIN_SAMPLES - 1, measured: 1_000 },
      },
    });

    expect(await evaluateAnomalies(NOW, db)).toEqual([]);
  });

  it('builds the baseline from the week before the recent window, not including it', async () => {
    const { db } = windowedDb({});

    await evaluateAnomalies(NOW, db);

    const calls = (db.query as unknown as { mock: { calls: [string, unknown[]][] } }).mock.calls;
    const recentFrom = new Date(NOW.getTime() - ANOMALY_RECENT_HOURS * 3_600_000).toISOString();
    expect(calls[0]![1]).toEqual([recentFrom, NOW.toISOString()]);
  });

  it('spans the declared baseline length when the recent window is worth comparing', async () => {
    const { db } = windowedDb({
      'turn-cost': { recent: { samples: 500, measured: 5_000 }, baseline: NORMAL },
    });

    await evaluateAnomalies(NOW, db);

    const calls = (db.query as unknown as { mock: { calls: [string, unknown[]][] } }).mock.calls;
    const recentFrom = new Date(NOW.getTime() - ANOMALY_RECENT_HOURS * 3_600_000);
    const baselineFrom = new Date(
      recentFrom.getTime() - ANOMALY_BASELINE_DAYS * 24 * 3_600_000,
    ).toISOString();
    expect(calls[1]![1]).toEqual([baselineFrom, recentFrom.toISOString()]);
  });
});
