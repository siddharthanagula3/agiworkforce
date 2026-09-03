import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

function cronRouteNames(): string[] {
  const dir = join(process.cwd(), 'app', 'api', 'cron');
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .sort();
}

function scheduledCrons(): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

describe('cron routes and vercel.json schedules agree', () => {
  it('schedules every cron route that exists', () => {
    const scheduled = new Set(scheduledCrons().map((cron) => cron.path.replace('/api/cron/', '')));
    const unscheduled = cronRouteNames().filter((name) => !scheduled.has(name));

    expect(
      unscheduled,
      `these cron routes exist but nothing runs them: ${unscheduled.join(', ')}`,
    ).toEqual([]);
  });

  it('points every schedule at a route that exists', () => {
    const routes = new Set(cronRouteNames());
    const dangling = scheduledCrons()
      .map((cron) => cron.path.replace('/api/cron/', ''))
      .filter((name) => !routes.has(name));

    expect(dangling, `these schedules point at no route: ${dangling.join(', ')}`).toEqual([]);
  });

  const PRODUCT_CADENCE_CRONS = new Set([
    '/api/cron/run-schedules',
    '/api/cron/drain-audit-streams',
  ]);
  const MONITORING_CRONS = new Set(['/api/cron/health-probe', '/api/cron/page-security-anomalies']);
  const MONITORING_MIN_INTERVAL_MINUTES = 10;

  function isSubDaily(schedule: string): boolean {
    const [minute, hour] = schedule.split(/\s+/);
    return (
      minute === '*' || hour === '*' || Boolean(hour?.includes('/')) || Boolean(hour?.includes(','))
    );
  }

  function subDailyIntervalMinutes(schedule: string): number {
    const [minute, hour] = schedule.split(/\s+/);
    if (!minute) return 0;
    const minuteStep = minute.match(/^\*\/(\d+)$/);
    if (minuteStep) return Number(minuteStep[1]);
    if (minute === '*') return 1;
    const hourStep = hour?.match(/^\*\/(\d+)$/);
    if (hourStep) return Number(hourStep[1]) * 60;
    return 0;
  }

  it('keeps every housekeeping schedule daily or less frequent', () => {
    const unexpected = scheduledCrons().filter(
      (cron) =>
        isSubDaily(cron.schedule) &&
        !PRODUCT_CADENCE_CRONS.has(cron.path) &&
        !MONITORING_CRONS.has(cron.path),
    );

    expect(unexpected.map((cron) => `${cron.path} @ ${cron.schedule}`)).toEqual([]);
  });

  it('keeps monitoring crons at or above their stated minimum interval', () => {
    const tooFrequent = scheduledCrons().filter(
      (cron) =>
        MONITORING_CRONS.has(cron.path) &&
        subDailyIntervalMinutes(cron.schedule) < MONITORING_MIN_INTERVAL_MINUTES,
    );

    expect(tooFrequent.map((cron) => `${cron.path} @ ${cron.schedule}`)).toEqual([]);
  });

  it('runs the schedule sweep at the cadence the product offers users', () => {
    const sweep = scheduledCrons().find((cron) => cron.path === '/api/cron/run-schedules');
    expect(sweep, 'the user-schedule sweep must be scheduled').toBeDefined();

    const sweepMinutes = SWEEP_INTERVAL_MS / 60_000;
    expect(
      sweep?.schedule,
      `vercel.json must fire the sweep every ${sweepMinutes} minutes to match SWEEP_INTERVAL_MS, ` +
        'or users are offered schedules the platform never runs',
    ).toBe(`*/${sweepMinutes} * * * *`);
  });
});
