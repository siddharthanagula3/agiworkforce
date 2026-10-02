import { describe, expect, it } from 'vitest';

import { dailyCronTime, hourlyCronMinute } from './published-cron-schedules';

describe('published cron schedules', () => {
  it('formats midnight with two clock digits', () => {
    expect(dailyCronTime('/api/cron/reset-credits')).toBe('00:00 UTC');
  });

  it('refuses to publish a frequent sweep as a daily clock', () => {
    expect(() => dailyCronTime('/api/cron/run-schedules')).toThrow(
      'Expected a daily cron schedule',
    );
  });

  it('refuses to publish a daily purge as an hourly minute', () => {
    expect(() => hourlyCronMinute('/api/cron/purge-deleted-accounts')).toThrow(
      'Expected an hourly cron schedule',
    );
  });

  it('refuses to invent a time for an unregistered job', () => {
    expect(() => dailyCronTime('/api/cron/unregistered-purge')).toThrow(
      'No published cron schedule',
    );
    expect(() => hourlyCronMinute('/api/cron/unregistered-purge')).toThrow(
      'No published cron schedule',
    );
  });
});
