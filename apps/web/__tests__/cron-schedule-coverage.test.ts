import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';

/**
 * A cron route that nothing schedules never runs, and nothing says so —
 * expire-organization-invitations shipped and sat idle. This asserts the set
 * of routes and the set of schedules are the same set, so the next one cannot
 * ship unscheduled either.
 */

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

  // A sub-daily cron is rejected on the Hobby plan, and the rejection kills the
  // whole deployment rather than just the cron: pushes succeed and no build ever
  // queues. The account moved to Pro on 2026-08-16, so sub-daily is permitted —
  // but only for the jobs whose cadence is a product promise rather than a
  // housekeeping choice. Every other job stays daily, so a future downgrade
  // breaks one line here instead of the deploy.
  //
  //   run-schedules      — the cadence users are offered for scheduled tasks.
  //   drain-audit-streams — a security team integrating a SIEM expects events
  //                         within minutes. Delivered daily it would be an
  //                         export with extra steps, and the /workspace posture
  //                         describes it as streaming.
  //
  // Adding a third entry needs the same test: is the cadence something a
  // customer was promised, or a choice we made for our own convenience?
  const SUB_DAILY_ALLOWED = new Set(['/api/cron/run-schedules', '/api/cron/drain-audit-streams']);

  function isSubDaily(schedule: string): boolean {
    const [minute, hour] = schedule.split(/\s+/);
    return (
      minute === '*' || hour === '*' || Boolean(hour?.includes('/')) || Boolean(hour?.includes(','))
    );
  }

  it('keeps every housekeeping schedule daily or less frequent', () => {
    const unexpected = scheduledCrons().filter(
      (cron) => isSubDaily(cron.schedule) && !SUB_DAILY_ALLOWED.has(cron.path),
    );

    expect(unexpected.map((cron) => `${cron.path} @ ${cron.schedule}`)).toEqual([]);
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
