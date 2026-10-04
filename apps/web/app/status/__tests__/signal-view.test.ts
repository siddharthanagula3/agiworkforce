import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HealthCheckResult } from '@/lib/server/health-check';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import {
  formatAge,
  STALE_AFTER_SECONDS,
  viewSignal,
  type CheckRow,
  type HealthSignal,
} from '../signal-view';

const CHECKED_AT = '2026-09-21T12:00:00.000Z';
const CHECKED_AT_MS = Date.parse(CHECKED_AT);
const MS_PER_SECOND = 1_000;

const ROWS: CheckRow[] = [
  { key: 'environment', label: 'Configuration' },
  { key: 'database', label: 'Postgres' },
  { key: 'cache', label: 'Cache store' },
  { key: 'stripe', label: 'Payments' },
  { key: 'chat', label: 'Chat routing' },
];

function checks(): HealthCheckResult['checks'] {
  const ok = { status: 'healthy' as const };
  return {
    database: ok,
    stripe: ok,
    environment: ok,
    chat: ok,
    work: ok,
    voice: ok,
    search: ok,
    vector: ok,
    cache: ok,
  };
}

function signal(
  state: HealthCheckResult['status'],
  patch: Partial<HealthCheckResult['checks']> = {},
): HealthSignal {
  return { state, checkedAt: CHECKED_AT, checks: { ...checks(), ...patch } };
}

function secondsAfterCheck(seconds: number): number {
  return CHECKED_AT_MS + seconds * MS_PER_SECOND;
}

function labels(view: { rows: { row: CheckRow }[] }): string[] {
  return view.rows.map(({ row }) => row.label);
}

describe('viewSignal', () => {
  it('reports a healthy run with its age, every row and nothing failing', () => {
    const view = viewSignal(signal('healthy'), secondsAfterCheck(42), ROWS);

    expect(view.state).toBe('healthy');
    expect(view.reported).toBe('healthy');
    expect(view.checkedAtMs).toBe(CHECKED_AT_MS);
    expect(view.ageSeconds).toBe(42);
    expect(view.failing).toEqual([]);
    expect(labels(view)).toEqual(ROWS.map((row) => row.label));
  });

  it('names the failing check of a degraded run and lists it first', () => {
    const view = viewSignal(
      signal('degraded', { stripe: { status: 'unhealthy', message: 'unavailable' } }),
      secondsAfterCheck(5),
      ROWS,
    );

    expect(view.state).toBe('degraded');
    expect(view.failing).toEqual(['Payments']);
    expect(labels(view)).toEqual([
      'Payments',
      'Configuration',
      'Postgres',
      'Cache store',
      'Chat routing',
    ]);
    expect(view.rows[0]?.check).toEqual({ status: 'unhealthy', message: 'unavailable' });
  });

  it('keeps the listed order among several failing checks of an unhealthy run', () => {
    const down = { status: 'unhealthy' as const, message: 'unavailable' };
    const view = viewSignal(
      signal('unhealthy', { chat: down, database: down }),
      secondsAfterCheck(5),
      ROWS,
    );

    expect(view.state).toBe('unhealthy');
    expect(view.failing).toEqual(['Postgres', 'Chat routing']);
    expect(labels(view)).toEqual([
      'Postgres',
      'Chat routing',
      'Configuration',
      'Cache store',
      'Payments',
    ]);
  });

  it('calls a result stale only once its age exceeds two reuse windows', () => {
    expect(STALE_AFTER_SECONDS).toBe(2 * RENDER_CACHE_SECONDS.liveSignal);

    const atThreshold = viewSignal(signal('healthy'), secondsAfterCheck(STALE_AFTER_SECONDS), ROWS);
    const pastThreshold = viewSignal(
      signal('healthy'),
      secondsAfterCheck(STALE_AFTER_SECONDS) + 1,
      ROWS,
    );

    expect(atThreshold.state).toBe('healthy');
    expect(atThreshold.ageSeconds).toBe(STALE_AFTER_SECONDS);
    expect(pastThreshold.state).toBe('stale');
    expect(pastThreshold.ageSeconds).toBe(STALE_AFTER_SECONDS);
  });

  it('keeps the rows, the run time and what the run reported when the result is stale', () => {
    const fortyMinutes = 40 * 60;
    const view = viewSignal(
      signal('degraded', { stripe: { status: 'unhealthy', message: 'unavailable' } }),
      secondsAfterCheck(fortyMinutes),
      ROWS,
    );

    expect(view.state).toBe('stale');
    expect(view.reported).toBe('degraded');
    expect(view.checkedAtMs).toBe(CHECKED_AT_MS);
    expect(view.ageSeconds).toBe(fortyMinutes);
    expect(view.failing).toEqual(['Payments']);
    expect(view.rows).toHaveLength(ROWS.length);
  });

  it('has no rows, no time and no failing names when the run did not complete', () => {
    const view = viewSignal(
      { state: 'unknown', checkedAt: null, checks: null },
      secondsAfterCheck(0),
      ROWS,
    );

    expect(view).toEqual({
      state: 'unknown',
      reported: null,
      checkedAtMs: null,
      ageSeconds: null,
      rows: [],
      failing: [],
    });
  });

  it('treats a result whose run time cannot be read as unknown rather than fresh', () => {
    const view = viewSignal(
      { state: 'healthy', checkedAt: 'not a time', checks: checks() },
      secondsAfterCheck(0),
      ROWS,
    );

    expect(view.state).toBe('unknown');
    expect(view.rows).toEqual([]);
  });

  it('never reports a negative age when the run time is ahead of the reader clock', () => {
    const view = viewSignal(signal('healthy'), secondsAfterCheck(-30), ROWS);

    expect(view.state).toBe('healthy');
    expect(view.ageSeconds).toBe(0);
  });
});

describe('formatAge', () => {
  it.each([
    [0, 'less than a minute ago'],
    [59, 'less than a minute ago'],
    [60, '1 min ago'],
    [40 * 60 + 42, '40 min ago'],
    [60 * 60, '1 h ago'],
    [98 * 60, '1 h 38 min ago'],
    [24 * 60 * 60, '1 day ago'],
    [3 * 24 * 60 * 60 + 5, '3 days ago'],
  ])('writes %i seconds as "%s"', (seconds, expected) => {
    expect(formatAge(seconds)).toBe(expected);
  });
});
