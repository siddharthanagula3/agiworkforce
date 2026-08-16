import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

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

  it('keeps every schedule daily or less frequent', () => {
    // A sub-daily cron is rejected on the Hobby plan, and the rejection kills
    // the whole deployment rather than just the cron: pushes succeed and no
    // build ever queues.
    const subDaily = scheduledCrons().filter((cron) => {
      const [minute, hour] = cron.schedule.split(/\s+/);
      return minute === '*' || hour === '*' || hour?.includes('/') || hour?.includes(',');
    });

    expect(subDaily.map((cron) => `${cron.path} @ ${cron.schedule}`)).toEqual([]);
  });
});
