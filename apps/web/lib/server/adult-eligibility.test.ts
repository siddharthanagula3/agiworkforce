import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => {
          const [sql] = args as [string];
          if (sql.includes("set_config('request.jwt.claim.sub'")) return [];
          return mocks.query(...args);
        },
        execute: () => 0,
      }),
  })),
}));

import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import {
  adultEligibilityStateOf,
  forgetAdultEligibilityState,
  readAdultEligibilityState,
  submitAdultEligibilityEvidence,
} from './adult-eligibility';

const LEGACY_MINIMUM_AGE = 13;

function row(outcome: string | null, minimumAge: number | null) {
  return { adult_eligibility_outcome: outcome, adult_eligibility_minimum_age: minimumAge };
}

function writes(): unknown[][] {
  return mocks.query.mock.calls
    .filter(([sql]) => String(sql).includes('insert into public.profiles'))
    .map(([, params]) => params as unknown[]);
}

function standingThenWritten(standing: unknown, written: unknown): void {
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('insert into public.profiles')
      ? written === undefined
        ? []
        : [written]
      : standing === undefined
        ? []
        : [standing],
  );
}

beforeEach(() => {
  mocks.query.mockReset();
  forgetAdultEligibilityState();
});

describe('where an account stands against the minimum age', () => {
  it('is unconfirmed when nobody has been asked', () => {
    expect(adultEligibilityStateOf(undefined)).toBe('unconfirmed');
    expect(adultEligibilityStateOf(row(null, null))).toBe('unconfirmed');
  });

  it('is confirmed by an admission made against the current minimum', () => {
    expect(adultEligibilityStateOf(row('eligible', ACCOUNT_MINIMUM_AGE))).toBe('confirmed');
  });

  it('is unconfirmed, not admitted, by an admission made under the earlier 13 and over rule', () => {
    expect(adultEligibilityStateOf(row('eligible', LEGACY_MINIMUM_AGE))).toBe('unconfirmed');
    expect(adultEligibilityStateOf(row('eligible', ACCOUNT_MINIMUM_AGE - 1))).toBe('unconfirmed');
  });

  it('stays refused whatever minimum the refusal was made against', () => {
    expect(adultEligibilityStateOf(row('ineligible', ACCOUNT_MINIMUM_AGE))).toBe('ineligible');
    expect(adultEligibilityStateOf(row('ineligible', LEGACY_MINIMUM_AGE))).toBe('ineligible');
  });

  it('admits nothing from an outcome it does not know', () => {
    expect(adultEligibilityStateOf(row('verified', ACCOUNT_MINIMUM_AGE))).toBe('unconfirmed');
  });
});

describe('judging evidence', () => {
  it('refuses a declared 17 and keeps the refusal without the age', async () => {
    standingThenWritten(undefined, row('ineligible', ACCOUNT_MINIMUM_AGE));

    const state = await submitAdultEligibilityEvidence('person-a', 'web-login', {
      kind: 'declared_age',
      age: 17,
    });

    expect(state).toBe('ineligible');
    expect(writes()).toEqual([
      ['person-a', 'ineligible', ACCOUNT_MINIMUM_AGE, 'declared_age', 'web-login'],
    ]);
  });

  it('admits a declared 18', async () => {
    standingThenWritten(undefined, row('eligible', ACCOUNT_MINIMUM_AGE));

    const state = await submitAdultEligibilityEvidence('person-a', 'web-login', {
      kind: 'declared_age',
      age: 18,
    });

    expect(state).toBe('confirmed');
    expect(writes()).toEqual([
      ['person-a', 'eligible', ACCOUNT_MINIMUM_AGE, 'declared_age', 'web-login'],
    ]);
  });

  it('never writes the declared age or an operating system range', async () => {
    standingThenWritten(undefined, row('eligible', ACCOUNT_MINIMUM_AGE));

    await submitAdultEligibilityEvidence('person-a', 'web-login', {
      kind: 'declared_age',
      age: 44,
    });
    await submitAdultEligibilityEvidence('person-b', 'mobile-auth', {
      kind: 'platform_age_signal',
      lowerBound: 21,
      upperBound: 25,
    });

    const stored = mocks.query.mock.calls.flatMap(([, params]) => (params as unknown[]) ?? []);
    for (const value of [44, 21, 25]) expect(stored).not.toContain(value);
    expect(writes()[1]).toEqual([
      'person-b',
      'eligible',
      ACCOUNT_MINIMUM_AGE,
      'platform_age_signal',
      'mobile-auth',
    ]);
  });

  it('admits an age a surface checked against the current minimum, as a declared age', async () => {
    standingThenWritten(undefined, row('eligible', ACCOUNT_MINIMUM_AGE));

    const state = await submitAdultEligibilityEvidence('person-a', 'web-signup', {
      kind: 'age_checked_on_device',
      minimumAge: ACCOUNT_MINIMUM_AGE,
    });

    expect(state).toBe('confirmed');
    expect(writes()).toEqual([
      ['person-a', 'eligible', ACCOUNT_MINIMUM_AGE, 'declared_age', 'web-signup'],
    ]);
  });

  it('writes nothing and leaves the account to be asked for a check made under the 13 and over rule', async () => {
    standingThenWritten(undefined, undefined);

    const state = await submitAdultEligibilityEvidence('person-a', 'mobile-auth', {
      kind: 'age_checked_on_device',
      minimumAge: LEGACY_MINIMUM_AGE,
    });

    expect(state).toBe('unconfirmed');
    expect(writes()).toEqual([]);
  });

  it('writes nothing for an operating system range that settles nothing', async () => {
    standingThenWritten(undefined, undefined);

    for (const [lowerBound, upperBound] of [
      [16, 18],
      [13, null],
      [null, null],
    ] as const) {
      expect(
        await submitAdultEligibilityEvidence('person-a', 'mobile-auth', {
          kind: 'platform_age_signal',
          lowerBound,
          upperBound,
        }),
      ).toBe('unconfirmed');
    }
    expect(writes()).toEqual([]);
  });

  it('refuses an operating system range that ends below 18', async () => {
    standingThenWritten(undefined, row('ineligible', ACCOUNT_MINIMUM_AGE));

    expect(
      await submitAdultEligibilityEvidence('person-a', 'mobile-auth', {
        kind: 'platform_age_signal',
        lowerBound: 13,
        upperBound: 17,
      }),
    ).toBe('ineligible');
  });

  it('does not reopen a refused account when a later answer says 30', async () => {
    standingThenWritten(row('ineligible', ACCOUNT_MINIMUM_AGE), undefined);

    const state = await submitAdultEligibilityEvidence('person-a', 'web-login', {
      kind: 'declared_age',
      age: 30,
    });

    expect(state).toBe('ineligible');
    expect(writes()).toEqual([]);
  });

  it('does not close an admitted account when a later answer says 16', async () => {
    standingThenWritten(row('eligible', ACCOUNT_MINIMUM_AGE), undefined);

    const state = await submitAdultEligibilityEvidence('person-a', 'web-login', {
      kind: 'declared_age',
      age: 16,
    });

    expect(state).toBe('confirmed');
    expect(writes()).toEqual([]);
  });

  it('asks an account admitted under the 13 and over rule again, and admits it at 18', async () => {
    standingThenWritten(row('eligible', LEGACY_MINIMUM_AGE), row('eligible', ACCOUNT_MINIMUM_AGE));

    expect(await readAdultEligibilityState('person-a')).toBe('unconfirmed');
    expect(
      await submitAdultEligibilityEvidence('person-a', 'web-login', {
        kind: 'declared_age',
        age: 18,
      }),
    ).toBe('confirmed');
  });

  it('answers with what a concurrent submission wrote when its own write changed nothing', async () => {
    let reads = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into public.profiles')) return [];
      reads += 1;
      return reads === 1 ? [] : [row('ineligible', ACCOUNT_MINIMUM_AGE)];
    });

    expect(
      await submitAdultEligibilityEvidence('person-a', 'web-login', {
        kind: 'declared_age',
        age: 30,
      }),
    ).toBe('ineligible');
  });
});

describe('reading the state on a gated request', () => {
  it('remembers a confirmation, so the next request does not read again', async () => {
    mocks.query.mockResolvedValue([row('eligible', ACCOUNT_MINIMUM_AGE)]);

    expect(await readAdultEligibilityState('person-a')).toBe('confirmed');
    expect(await readAdultEligibilityState('person-a')).toBe('confirmed');
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('never remembers an account that is not confirmed', async () => {
    mocks.query.mockResolvedValue([]);

    expect(await readAdultEligibilityState('person-a')).toBe('unconfirmed');
    mocks.query.mockResolvedValue([row('ineligible', ACCOUNT_MINIMUM_AGE)]);
    expect(await readAdultEligibilityState('person-a')).toBe('ineligible');
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('throws when the record cannot be read, so the caller refuses instead of admitting', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'));

    await expect(readAdultEligibilityState('person-a')).rejects.toThrow('database unavailable');
  });

  it('forgets a remembered confirmation once a submission writes', async () => {
    mocks.query.mockResolvedValue([row('eligible', ACCOUNT_MINIMUM_AGE)]);
    await readAdultEligibilityState('person-a');
    forgetAdultEligibilityState('person-a');
    mocks.query.mockResolvedValue([]);

    expect(await readAdultEligibilityState('person-a')).toBe('unconfirmed');
  });
});
