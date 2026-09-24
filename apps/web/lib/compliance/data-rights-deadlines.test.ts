import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DATA_RIGHTS_JURISDICTION,
  compareByDeadline,
  isDataRightsJurisdiction,
  resolveDataRightsDeadline,
} from './data-rights-deadlines';

const AT = (iso: string) => new Date(iso);

describe('which clock a request runs on', () => {
  it('uses the shorter of the two when the request records no jurisdiction', () => {
    const none = resolveDataRightsDeadline({
      createdAt: '2026-01-10T00:00:00.000Z',
      jurisdiction: null,
      now: AT('2026-01-10T00:00:00.000Z'),
    });
    const usState = resolveDataRightsDeadline({
      createdAt: '2026-01-10T00:00:00.000Z',
      jurisdiction: 'us_state',
      now: AT('2026-01-10T00:00:00.000Z'),
    });

    expect(none.jurisdiction).toBe(DEFAULT_DATA_RIGHTS_JURISDICTION);
    expect(Date.parse(none.dueAt)).toBeLessThan(Date.parse(usState.dueAt));
  });

  it('rejects anything that is not one of the two regimes', () => {
    expect(isDataRightsJurisdiction('gdpr')).toBe(true);
    expect(isDataRightsJurisdiction('us_state')).toBe(true);
    expect(isDataRightsJurisdiction('ccpa')).toBe(false);
    expect(isDataRightsJurisdiction(null)).toBe(false);
  });
});

describe('the one-month clock', () => {
  it('lands on the same day of the next month, not thirty days later', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-15T09:30:00.000Z',
      jurisdiction: 'gdpr',
      now: AT('2026-01-15T09:30:00.000Z'),
    });
    expect(deadline.dueAt).toBe('2026-02-15T09:30:00.000Z');
  });

  it('clamps to the end of a shorter month rather than spilling into the next', () => {
    expect(
      resolveDataRightsDeadline({
        createdAt: '2026-01-31T00:00:00.000Z',
        jurisdiction: 'gdpr',
        now: AT('2026-01-31T00:00:00.000Z'),
      }).dueAt,
    ).toBe('2026-02-28T00:00:00.000Z');

    expect(
      resolveDataRightsDeadline({
        createdAt: '2024-01-31T00:00:00.000Z',
        jurisdiction: 'gdpr',
        now: AT('2024-01-31T00:00:00.000Z'),
      }).dueAt,
    ).toBe('2024-02-29T00:00:00.000Z');
  });

  it('may be extended by two further months and no more', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-15T00:00:00.000Z',
      jurisdiction: 'gdpr',
      now: AT('2026-01-15T00:00:00.000Z'),
    });
    expect(deadline.extendable).toBe(true);
    expect(deadline.extendedDueAt).toBe('2026-04-15T00:00:00.000Z');
  });
});

describe('the forty-five day clock', () => {
  it('is forty-five days from receipt', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'us_state',
      now: AT('2026-01-01T00:00:00.000Z'),
    });
    expect(deadline.dueAt).toBe('2026-02-15T00:00:00.000Z');
  });

  it('may be extended once by another forty-five days', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'us_state',
      now: AT('2026-01-01T00:00:00.000Z'),
    });
    expect(deadline.extendable).toBe(true);
    expect(deadline.extendedDueAt).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('days remaining and the overdue flag', () => {
  it('counts whole days left while the clock still runs', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-15T00:00:00.000Z',
      jurisdiction: 'gdpr',
      now: AT('2026-02-05T00:00:00.000Z'),
    });
    expect(deadline.daysRemaining).toBe(10);
    expect(deadline.overdue).toBe(false);
  });

  it('is not overdue on the due instant itself', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-15T00:00:00.000Z',
      jurisdiction: 'gdpr',
      now: AT('2026-02-15T00:00:00.000Z'),
    });
    expect(deadline.daysRemaining).toBe(0);
    expect(deadline.overdue).toBe(false);
  });

  it('goes negative and flags once the due instant has passed', () => {
    const deadline = resolveDataRightsDeadline({
      createdAt: '2026-01-15T00:00:00.000Z',
      jurisdiction: 'gdpr',
      now: AT('2026-02-20T00:00:00.000Z'),
    });
    expect(deadline.daysRemaining).toBe(-5);
    expect(deadline.overdue).toBe(true);
  });

  it('refuses a receipt time it cannot read rather than inventing one', () => {
    expect(() =>
      resolveDataRightsDeadline({
        createdAt: 'whenever',
        jurisdiction: null,
        now: AT('2026-01-01T00:00:00.000Z'),
      }),
    ).toThrow();
  });
});

describe('the queue order', () => {
  it('puts the earliest due first, and breaks a tie on receipt', () => {
    const rows = [
      { createdAt: '2026-03-01T00:00:00.000Z', dueAt: '2026-04-01T00:00:00.000Z' },
      { createdAt: '2026-01-01T00:00:00.000Z', dueAt: '2026-02-01T00:00:00.000Z' },
      { createdAt: '2026-02-20T00:00:00.000Z', dueAt: '2026-04-01T00:00:00.000Z' },
    ];
    expect([...rows].sort(compareByDeadline).map((row) => row.createdAt)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-20T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
  });
});
