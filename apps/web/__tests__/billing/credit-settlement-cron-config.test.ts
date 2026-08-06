import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function cronEntries(path: string): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

describe('credit settlement recovery schedule', () => {
  // The Vercel project's Root Directory is the repo root, so the ROOT
  // vercel.json is the only cron registry (apps/web/vercel.json was dead
  // config, deleted 2026-07-17 — WEB-API-HOST-REWRITES-INERT-01).
  //
  // Reconciliation is DAILY, not every minute: the Vercel Hobby plan rejects
  // sub-daily crons at deploy time (PROD-VERCEL-DEPLOY-TOPOLOGY-01). Restore
  // '* * * * *' here and in vercel.json when the founder upgrades to Pro.
  it('root vercel.json schedules credit reconciliation', () => {
    const entry = cronEntries('../../vercel.json').find(
      (cron) => cron.path === '/api/cron/reconcile-credits',
    );
    expect(entry).toBeDefined();
    expect(entry?.schedule).toBe('30 0 * * *');
  });

  it('root vercel.json schedules the user-schedules runner', () => {
    const entry = cronEntries('../../vercel.json').find(
      (cron) => cron.path === '/api/cron/run-schedules',
    );
    expect(entry).toBeDefined();
    // Hourly since 2026-08-04. Total scheduled-run throughput is
    // invocations/day * the per-invocation claim limit, shared across all users,
    // and BILLING_PLAN_PRODUCT_LIMITS.maxScheduledTasks is sized against it.
    // Changing this cadence means re-deriving those catalog limits and
    // SWEEP_INTERVAL_MS in apps/web/lib/schedules/schedule-time.ts.
    expect(entry?.schedule).toBe('0 * * * *');
  });
});
