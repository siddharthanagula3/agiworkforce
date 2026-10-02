import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';
import { missedExecutionGraceMs } from '@/lib/services/schedule-service';

const HOUR_MS = 60 * 60 * 1000;

describe('missed scheduled-run grace', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows two sweeps of lateness at the normal cadence', () => {
    vi.stubEnv('AGI_DB_LOW_POWER', '0');
    expect(missedExecutionGraceMs()).toBe(2 * SWEEP_INTERVAL_MS);
  });

  it('allows two hourly sweeps in database low-power mode, so a late run is not counted as missed', () => {
    vi.stubEnv('AGI_DB_LOW_POWER', '1');
    expect(missedExecutionGraceMs()).toBe(2 * HOUR_MS);
  });
});
