import { describe, expect, it } from 'vitest';
import {
  MANAGED_USAGE_BUCKET_COPY,
  MANAGED_USAGE_BUCKET_ORDER,
  formatUsageRemaining,
  formatUsageResetIn,
  managedUsageBucketLabel,
  selectUsageWarning,
} from '../usage-vocabulary';

describe('managed usage vocabulary', () => {
  it('covers every bucket in the presentation order', () => {
    expect([...MANAGED_USAGE_BUCKET_ORDER].sort()).toEqual(
      Object.keys(MANAGED_USAGE_BUCKET_COPY).sort(),
    );
  });

  it('names buckets by what they govern, not how they are computed', () => {
    for (const bucket of MANAGED_USAGE_BUCKET_ORDER) {
      expect(managedUsageBucketLabel(bucket)).not.toMatch(/rolling/i);
    }
  });

  it('orders narrowest window first, so the binding limit reads first', () => {
    expect(MANAGED_USAGE_BUCKET_ORDER[0]).toBe('session');
    expect(MANAGED_USAGE_BUCKET_ORDER[MANAGED_USAGE_BUCKET_ORDER.length - 1]).toBe('period');
  });
});

describe('formatUsageResetIn', () => {
  const now = Date.UTC(2026, 7, 5, 12, 0, 0);

  it('says nothing when there is nothing meaningful to say', () => {
    expect(formatUsageResetIn(null, now)).toBeNull();
    expect(formatUsageResetIn(undefined, now)).toBeNull();
    expect(formatUsageResetIn('not-a-date', now)).toBeNull();
  });

  it('returns null for an elapsed reset rather than a negative countdown', () => {
    expect(formatUsageResetIn(new Date(now - 2 * 60 * 60_000), now)).toBeNull();
  });

  it('uses minutes under an hour', () => {
    expect(formatUsageResetIn(new Date(now + 25 * 60_000), now)).toBe('Resets in 25 min');
  });

  it('uses hours under a day, singular at one', () => {
    expect(formatUsageResetIn(new Date(now + 3 * 60 * 60_000), now)).toBe('Resets in 3 hours');
    expect(formatUsageResetIn(new Date(now + 60 * 60_000), now)).toBe('Resets in 1 hour');
  });

  it('uses days beyond that, rather than false precision on a long window', () => {
    expect(formatUsageResetIn(new Date(now + 3 * 24 * 60 * 60_000), now)).toBe('Resets in 3 days');
  });

  it('accepts an ISO string, a Date and an epoch number alike', () => {
    const target = new Date(now + 2 * 60 * 60_000);
    expect(formatUsageResetIn(target.toISOString(), now)).toBe('Resets in 2 hours');
    expect(formatUsageResetIn(target, now)).toBe('Resets in 2 hours');
    expect(formatUsageResetIn(target.getTime(), now)).toBe('Resets in 2 hours');
  });
});

describe('formatUsageRemaining', () => {
  it('always states REMAINING, never used', () => {
    expect(formatUsageRemaining(12)).toBe('12% left');
  });

  it('clamps out-of-range input instead of printing it', () => {
    expect(formatUsageRemaining(140)).toBe('100% left');
    expect(formatUsageRemaining(-5)).toBe('None left');
  });

  it('says None left rather than 0% left', () => {
    expect(formatUsageRemaining(0)).toBe('None left');
  });
});

describe('selectUsageWarning', () => {
  const AT = '2026-08-05T12:00:00.000Z';
  const NOW = Date.parse('2026-08-05T09:00:00.000Z');

  it('stays silent while there is plenty left', () => {
    expect(
      selectUsageWarning([
        { bucket: 'session', percentRemaining: 80 },
        { bucket: 'weekly', percentRemaining: 60 },
      ]),
    ).toBeNull();
  });

  it('warns at the reference threshold of 75% used', () => {
    const warning = selectUsageWarning([{ bucket: 'weekly', percentRemaining: 25 }]);
    expect(warning?.headline).toBe("You've used 75% of your weekly limit");
    expect(warning?.severity).toBe('warning');
  });

  it('picks the BINDING limit, not the first one over the line', () => {
    const warning = selectUsageWarning([
      { bucket: 'weekly', percentRemaining: 20 },
      { bucket: 'session', percentRemaining: 5 },
    ]);
    expect(warning?.bucket).toBe('session');
    expect(warning?.headline).toBe("You've used 95% of your current session limit");
  });

  it('escalates when running out is imminent', () => {
    expect(selectUsageWarning([{ bucket: 'weekly', percentRemaining: 8 }])?.severity).toBe(
      'critical',
    );
  });

  it('reads correctly at zero rather than saying 100%', () => {
    const warning = selectUsageWarning([{ bucket: 'period', percentRemaining: 0 }]);
    expect(warning?.headline).toBe("You've used all of your limit for this billing period");
  });

  it('breaks ties toward the narrowest window, so the message does not flicker', () => {
    const warning = selectUsageWarning([
      { bucket: 'period', percentRemaining: 10 },
      { bucket: 'session', percentRemaining: 10 },
    ]);
    expect(warning?.bucket).toBe('session');
  });

  it('clamps a nonsensical server number instead of inverting the copy', () => {
    expect(selectUsageWarning([{ bucket: 'weekly', percentRemaining: -20 }])?.headline).toBe(
      "You've used all of your weekly limit",
    );
    expect(selectUsageWarning([{ bucket: 'weekly', percentRemaining: 140 }])).toBeNull();
  });

  it('ignores a bucket with no usable number', () => {
    expect(
      selectUsageWarning([
        { bucket: 'session', percentRemaining: Number.NaN },
        { bucket: 'weekly', percentRemaining: 90 },
      ]),
    ).toBeNull();
  });

  it('carries the reset line only when the server supplied an instant', () => {
    expect(
      selectUsageWarning([{ bucket: 'weekly', percentRemaining: 10, resetAt: AT }], NOW)
        ?.resetLabel,
    ).toBe('Resets in 3 hours');
    expect(selectUsageWarning([{ bucket: 'weekly', percentRemaining: 10 }])?.resetLabel).toBeNull();
  });

  it('never names a bucket in prose using its meter label', () => {
    for (const bucket of MANAGED_USAGE_BUCKET_ORDER) {
      const warning = selectUsageWarning([{ bucket, percentRemaining: 10 }]);
      expect(warning?.headline).not.toContain(MANAGED_USAGE_BUCKET_COPY[bucket].label);
    }
  });
});
