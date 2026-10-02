import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  LOW_POWER_CRON_WINDOW_MINUTES,
  dbLowPowerEnabled,
  lowPowerCronSkip,
} from '@/lib/server/cron-low-power';

const at = (minute: number) => Date.UTC(2026, 9, 2, 13, minute, 30);

describe('database low-power cron gate', () => {
  it('is off unless AGI_DB_LOW_POWER is set to an on value', () => {
    expect(dbLowPowerEnabled({})).toBe(false);
    for (const value of ['0', 'false', 'off', 'yes', '']) {
      expect(dbLowPowerEnabled({ AGI_DB_LOW_POWER: value })).toBe(false);
    }
    for (const value of ['1', 'true', 'on', ' ON ', 'True']) {
      expect(dbLowPowerEnabled({ AGI_DB_LOW_POWER: value })).toBe(true);
    }
  });

  it('never skips a run while the mode is off', () => {
    expect(lowPowerCronSkip(at(40), {})).toBeNull();
  });

  it('lets runs through inside the window at the top of each hour', () => {
    const env = { AGI_DB_LOW_POWER: '1' };
    expect(lowPowerCronSkip(at(0), env)).toBeNull();
    expect(lowPowerCronSkip(at(LOW_POWER_CRON_WINDOW_MINUTES - 1), env)).toBeNull();
  });

  it('answers a run outside the window without doing its work', async () => {
    const skipped = lowPowerCronSkip(at(LOW_POWER_CRON_WINDOW_MINUTES), { AGI_DB_LOW_POWER: '1' });

    expect(skipped?.status).toBe(200);
    await expect(skipped?.json()).resolves.toEqual({ skipped: 'db_low_power' });
  });
});
