import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDeliverableCadence, parseCronExpression, SWEEP_INTERVAL_MS } from './schedule-time';

const SWEEP_ROUTE = '/api/cron/run-schedules';

function deployedSweepSchedule(): string {
  const vercelConfig = JSON.parse(
    readFileSync(path.join(process.cwd(), '../../vercel.json'), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };
  const entry = vercelConfig.crons?.find((cron) => cron.path === SWEEP_ROUTE);
  if (!entry) throw new Error(`vercel.json has no cron entry for ${SWEEP_ROUTE}`);
  return entry.schedule;
}

/**
 * Firings per day implied by a cron expression, for the day-granularity
 * expressions Vercel accepts. Fields coarser than a day only make it rarer.
 */
function firingsPerDay(expression: string): number {
  const cron = parseCronExpression(expression);
  return cron.minute.sorted.length * cron.hour.sorted.length;
}

describe('schedule cadence floor', () => {
  it('matches the sweep cadence actually deployed in vercel.json', () => {
    const schedule = deployedSweepSchedule();
    const perDay = firingsPerDay(schedule);
    const deployedIntervalMs = Math.floor((24 * 60 * 60 * 1000) / perDay);

    // If the deployed cron gets faster, the floor must follow it or the product
    // keeps refusing cadences it could now actually deliver.
    expect(SWEEP_INTERVAL_MS).toBe(deployedIntervalMs);
  });

  it('rejects an interval finer than the sweep can deliver', () => {
    expect(() =>
      assertDeliverableCadence(
        { scheduleType: 'interval', intervalMs: 5 * 60 * 1000, timezone: 'UTC' },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).toThrow(/swept once a day/);
  });

  it('accepts an interval at or above the floor', () => {
    expect(() =>
      assertDeliverableCadence(
        { scheduleType: 'interval', intervalMs: SWEEP_INTERVAL_MS, timezone: 'UTC' },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).not.toThrow();
  });

  it('rejects a cron that fires more than once a day', () => {
    for (const expression of ['*/5 * * * *', '0 * * * *', '0 0,12 * * *']) {
      expect(() =>
        assertDeliverableCadence(
          { scheduleType: 'cron', cronExpression: expression, timezone: 'UTC' },
          new Date('2026-07-26T00:00:00Z'),
        ),
      ).toThrow(/once per day/);
    }
  });

  it('accepts daily, weekly, and monthly crons', () => {
    for (const expression of ['30 9 * * *', '0 9 * * 1', '0 9 1 * *']) {
      expect(() =>
        assertDeliverableCadence(
          { scheduleType: 'cron', cronExpression: expression, timezone: 'UTC' },
          new Date('2026-07-26T00:00:00Z'),
        ),
      ).not.toThrow();
    }
  });

  it('leaves one-time schedules alone', () => {
    expect(() =>
      assertDeliverableCadence(
        {
          scheduleType: 'once',
          executeAt: '2026-07-27T00:00:00.000Z',
          timezone: 'UTC',
        },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).not.toThrow();
  });
});
