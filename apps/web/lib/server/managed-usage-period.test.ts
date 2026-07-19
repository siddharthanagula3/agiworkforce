import { describe, expect, it } from 'vitest';
import { resolveManagedUsagePeriod } from './managed-usage-period';

describe('resolveManagedUsagePeriod', () => {
  it('keeps a monthly Stripe period unchanged', () => {
    const periodStart = new Date('2026-07-18T12:00:00.000Z');
    const periodEnd = new Date('2026-08-18T12:00:00.000Z');

    expect(
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: periodStart,
        subscriptionPeriodEnd: periodEnd,
        referenceAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toEqual({ periodStart, periodEnd });
  });

  it('returns the current monthly allowance window inside an annual Stripe period', () => {
    expect(
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: new Date('2026-01-18T12:00:00.000Z'),
        subscriptionPeriodEnd: new Date('2027-01-18T12:00:00.000Z'),
        referenceAt: new Date('2026-07-25T00:00:00.000Z'),
      }),
    ).toEqual({
      periodStart: new Date('2026-07-18T12:00:00.000Z'),
      periodEnd: new Date('2026-08-18T12:00:00.000Z'),
    });
  });

  it('preserves the subscription anchor across short calendar months', () => {
    expect(
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: new Date('2026-01-31T12:00:00.000Z'),
        subscriptionPeriodEnd: new Date('2027-01-31T12:00:00.000Z'),
        referenceAt: new Date('2026-03-15T00:00:00.000Z'),
      }),
    ).toEqual({
      periodStart: new Date('2026-02-28T12:00:00.000Z'),
      periodEnd: new Date('2026-03-31T12:00:00.000Z'),
    });
  });

  it('starts a new allowance window at the exact monthly boundary', () => {
    expect(
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: new Date('2026-01-18T12:00:00.000Z'),
        subscriptionPeriodEnd: new Date('2027-01-18T12:00:00.000Z'),
        referenceAt: new Date('2026-08-18T12:00:00.000Z'),
      }),
    ).toEqual({
      periodStart: new Date('2026-08-18T12:00:00.000Z'),
      periodEnd: new Date('2026-09-18T12:00:00.000Z'),
    });
  });

  it('rejects invalid or reversed subscription periods', () => {
    expect(() =>
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: new Date('invalid'),
        subscriptionPeriodEnd: new Date('2027-01-18T12:00:00.000Z'),
        referenceAt: new Date('2026-08-18T12:00:00.000Z'),
      }),
    ).toThrow('Invalid managed usage subscription period');

    expect(() =>
      resolveManagedUsagePeriod({
        subscriptionPeriodStart: new Date('2027-01-18T12:00:00.000Z'),
        subscriptionPeriodEnd: new Date('2026-01-18T12:00:00.000Z'),
        referenceAt: new Date('2026-08-18T12:00:00.000Z'),
      }),
    ).toThrow('Invalid managed usage subscription period');
  });
});
