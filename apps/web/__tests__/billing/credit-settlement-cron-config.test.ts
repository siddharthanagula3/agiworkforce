import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';

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
    expect(entry?.schedule).toBe('30 0 * * *');
  });

  it('root vercel.json schedules the user-schedules runner at the offered cadence', () => {
    const entry = cronEntries('../../vercel.json').find(
      (cron) => cron.path === '/api/cron/run-schedules',
    );
    expect(entry).toBeDefined();
    expect(entry?.schedule).toBe(`*/${SWEEP_INTERVAL_MS / 60_000} * * * *`);
  });
});
