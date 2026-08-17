import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BILLING_PLAN_PRODUCT_LIMITS, PLATFORM_SCHEDULE_RUNS_PER_SWEEP } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';
import {
  assertDeliverableCadence,
  describeSweepCadence,
  parseCronExpression,
  SWEEP_INTERVAL_MS,
} from './schedule-time';

const SWEEP_ROUTE = '/api/cron/run-schedules';

function deployedSweepSchedule(): string {
  const vercelConfig = JSON.parse(
    readFileSync(path.join(process.cwd(), '../../vercel.json'), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };
  const entry = vercelConfig.crons?.find((cron) => cron.path === SWEEP_ROUTE);
  if (!entry) throw new Error(`vercel.json has no cron entry for ${SWEEP_ROUTE}`);
  return entry.schedule;
}

function firingsPerDay(expression: string): number {
  const cron = parseCronExpression(expression);
  return cron.minute.sorted.length * cron.hour.sorted.length;
}

describe('schedule cadence floor', () => {
  it('matches the sweep cadence actually deployed in vercel.json', () => {
    const schedule = deployedSweepSchedule();
    const perDay = firingsPerDay(schedule);
    const deployedIntervalMs = Math.floor((24 * 60 * 60 * 1000) / perDay);

    expect(SWEEP_INTERVAL_MS).toBe(deployedIntervalMs);
  });

  it('rejects an interval finer than the sweep can deliver', () => {
    expect(
      () =>
        assertDeliverableCadence(
          { scheduleType: 'interval', intervalMs: 5 * 60 * 1000, timezone: 'UTC' },
          new Date('2026-07-26T00:00:00Z'),
        ),
      // Matched against the derived phrase rather than a literal cadence, so
      // this assertion survives the sweep changing speed. Pinning "once a day"
      // here is what made the message and vercel.json able to disagree.
    ).toThrow(new RegExp(`swept ${describeSweepCadence().cadence}`));
  });

  it('accepts an interval at or above the floor', () => {
    expect(() =>
      assertDeliverableCadence(
        { scheduleType: 'interval', intervalMs: SWEEP_INTERVAL_MS, timezone: 'UTC' },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).not.toThrow();
  });

  it('rejects a cron that fires more often than the deployed sweep', () => {
    const tooOften = SWEEP_INTERVAL_MS / 60_000 > 5 ? '*/5 * * * *' : '* * * * *';
    expect(() =>
      assertDeliverableCadence(
        { scheduleType: 'cron', cronExpression: tooOften, timezone: 'UTC' },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).toThrow(/cannot fire more often/);
  });

  it('accepts a cron exactly at the deployed sweep and rejects one just under it', () => {
    const sweepMinutes = SWEEP_INTERVAL_MS / 60_000;
    expect(sweepMinutes).toBeLessThanOrEqual(60);

    expect(() =>
      assertDeliverableCadence(
        {
          scheduleType: 'cron',
          cronExpression: `*/${sweepMinutes} * * * *`,
          timezone: 'UTC',
        },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).not.toThrow();

    expect(() =>
      assertDeliverableCadence(
        {
          scheduleType: 'cron',
          cronExpression: `*/${Math.max(1, Math.floor(sweepMinutes / 2))} * * * *`,
          timezone: 'UTC',
        },
        new Date('2026-07-26T00:00:00Z'),
      ),
    ).toThrow(/cannot fire more often/);
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

  it('treats a local daily cron as daily across daylight-saving transitions', () => {
    for (const now of [
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-10-25T00:00:00.000Z'),
    ]) {
      expect(() =>
        assertDeliverableCadence(
          {
            scheduleType: 'cron',
            cronExpression: '30 9 * * *',
            timezone: 'America/Chicago',
          },
          now,
        ),
      ).not.toThrow();
    }
  });

  it('sells no more scheduled tasks than the deployed sweep attempts in a day', () => {
    const runsPerDay = firingsPerDay(deployedSweepSchedule()) * PLATFORM_SCHEDULE_RUNS_PER_SWEEP;
    const quotas = Object.values(BILLING_PLAN_PRODUCT_LIMITS)
      .map((limits) => limits.maxScheduledTasks)
      // Enterprise is 'custom': a negotiated contract, sized against capacity by
      // hand rather than by this table.
      .filter((quota): quota is number => typeof quota === 'number');

    expect(quotas.reduce((total, quota) => total + quota, 0)).toBeLessThanOrEqual(runsPerDay);
    expect(Math.max(...quotas)).toBeLessThanOrEqual(PLATFORM_SCHEDULE_RUNS_PER_SWEEP);
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
