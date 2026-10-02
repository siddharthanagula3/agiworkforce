import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';
import { LOW_POWER_CRON_WINDOW_MINUTES } from '@/lib/server/cron-low-power';

function cronEntries(path: string): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

describe('credit settlement recovery schedule', () => {
  it('root vercel.json schedules credit reconciliation', () => {
    const entry = cronEntries('../../vercel.json').find(
      (cron) => cron.path === '/api/cron/reconcile-credits',
    );
    expect(entry).toBeDefined();
    const daily = /^(\d+) 0 \* \* \*$/u.exec(entry!.schedule);
    expect(
      daily,
      'credit reconciliation must run every day after the midnight reset',
    ).not.toBeNull();
    expect(Number(daily![1])).toBeGreaterThan(0);
    expect(Number(daily![1])).toBeLessThan(LOW_POWER_CRON_WINDOW_MINUTES);
  });

  it('root vercel.json schedules the user-schedules runner at the offered cadence', () => {
    const entry = cronEntries('../../vercel.json').find(
      (cron) => cron.path === '/api/cron/run-schedules',
    );
    expect(entry).toBeDefined();
    expect(entry?.schedule).toBe(`*/${SWEEP_INTERVAL_MS / 60_000} * * * *`);
  });
});
