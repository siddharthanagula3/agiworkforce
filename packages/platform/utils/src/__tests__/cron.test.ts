import { describe, expect, it } from 'vitest';

import { describeCronCadence, parseCronExpression } from '../cron';

describe('parseCronExpression', () => {
  it('rejects malformed, out-of-range, and impossible cron expressions', () => {
    expect(() => parseCronExpression('* * *')).toThrow(/five fields/i);
    expect(() => parseCronExpression('60 * * * *')).toThrow(/minute/i);
    expect(() => parseCronExpression('0 9 31 2 *')).toThrow(/never occur/i);
    expect(() => parseCronExpression(`${'1,'.repeat(200)}1 * * * *`)).toThrow(/too long/i);
  });

  it('expands a stepped numeric cron field through the end of its range', () => {
    expect(parseCronExpression('5/10 * * * *').minute.sorted).toEqual([5, 15, 25, 35, 45, 55]);
  });

  it('reads day of week 7 as Sunday', () => {
    expect(parseCronExpression('0 9 * * 7').dayOfWeek.sorted).toEqual([0]);
  });
});

describe('describeCronCadence', () => {
  it('describes a daily cron in words', () => {
    expect(describeCronCadence('0 9 * * *')).toBe('Daily at 9:00 AM');
  });

  it('describes every day of the week spelled out as daily', () => {
    expect(describeCronCadence('0 9 * * 0,1,2,3,4,5,6')).toBe('Daily at 9:00 AM');
  });

  it('describes a single weekly day, matching the leader phrasing', () => {
    expect(describeCronCadence('0 9 * * 1')).toBe('Weekly on Monday at 9:00 AM');
  });

  it('describes the two-day weekly preset the schedule form builds', () => {
    expect(describeCronCadence('5 8 * * 1,5')).toBe('Weekly on Monday and Friday at 8:05 AM');
  });

  it('describes three or more weekly days with a serial comma', () => {
    expect(describeCronCadence('30 7 * * 1,2,3,4,5')).toBe(
      'Weekly on Monday, Tuesday, Wednesday, Thursday, and Friday at 7:30 AM',
    );
  });

  it('describes a monthly day of month', () => {
    expect(describeCronCadence('0 9 15 * *')).toBe('Monthly on day 15 at 9:00 AM');
  });

  it('formats midnight and noon correctly', () => {
    expect(describeCronCadence('0 0 * * *')).toBe('Daily at 12:00 AM');
    expect(describeCronCadence('0 12 * * *')).toBe('Daily at 12:00 PM');
  });

  it('falls back to the raw expression for shapes it does not describe', () => {
    expect(describeCronCadence('*/15 9 * * *')).toBe('*/15 9 * * *');
    expect(describeCronCadence('0 9,17 * * *')).toBe('0 9,17 * * *');
    expect(describeCronCadence('0 9 * 6 *')).toBe('0 9 * 6 *');
  });

  it('falls back to the raw text for an invalid cron expression', () => {
    expect(describeCronCadence('not a cron')).toBe('not a cron');
  });
});
