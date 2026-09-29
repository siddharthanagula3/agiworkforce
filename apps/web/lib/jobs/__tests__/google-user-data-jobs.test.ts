import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { jobsCarryingGoogleUserData } from '../google-user-data-jobs';
import type { BackgroundJob } from '../job-service';

const TRIGGER_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

function triggerJob(id: string, source: string): BackgroundJob {
  return {
    id,
    kind: 'event-triggers.fire',
    payload: { triggerId: TRIGGER_ID, event: { source, type: 'x' } },
  } as unknown as BackgroundJob;
}

function database(connectors: unknown): DatabaseAdapter {
  return {
    query: vi.fn(async () => [{ task_id: TASK_ID, trigger_id: TRIGGER_ID, connectors }]),
  } as unknown as DatabaseAdapter;
}

describe('jobsCarryingGoogleUserData', () => {
  it('withholds every generic connector trigger event, whose sender records no connector', async () => {
    const carrying = await jobsCarryingGoogleUserData(database(['github']), [
      triggerJob('job-connector', 'connector'),
      triggerJob('job-gmail', 'gmail'),
    ]);

    expect([...carrying].sort()).toEqual(['job-connector', 'job-gmail']);
  });

  it('withholds a routine whose connector list names a custom, workspace or directory server', async () => {
    for (const id of ['custom-abc123', 'orgmcp-p0123456789', 'dir-576ba7c2e4ab']) {
      const carrying = await jobsCarryingGoogleUserData(database([id]), [
        triggerJob('job-1', 'github'),
      ]);
      expect(carrying.has('job-1')).toBe(true);
    }
  });

  it('clears a routine whose explicit connector list holds no Google or custom server', async () => {
    const carrying = await jobsCarryingGoogleUserData(database(['github', 'linear']), [
      triggerJob('job-1', 'github'),
    ]);

    expect(carrying.has('job-1')).toBe(false);
  });
});
