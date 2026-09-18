import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_STATUSES,
  accountAccessDecision,
  effectiveAccountStatus,
  isAccountStatus,
  LOCKOUT_RECOVERY_PATH,
  SUSPENSION_APPEAL_PATH,
} from './account-status';

const ACTIVE = { status: 'active', deletionScheduled: false, erased: false };

describe('effectiveAccountStatus', () => {
  it('reads a scheduled deletion off the date 0071 records, which no column ever held as a state', () => {
    expect(effectiveAccountStatus({ ...ACTIVE, deletionScheduled: true })).toBe(
      'deletion_scheduled',
    );
  });

  it('reads an erasure off the tombstone that outlives the profile row', () => {
    expect(effectiveAccountStatus({ status: null, deletionScheduled: false, erased: true })).toBe(
      'deleted',
    );
  });

  it('lets an erasure win over every other state, because nothing is left to describe', () => {
    expect(
      effectiveAccountStatus({ status: 'suspended', deletionScheduled: true, erased: true }),
    ).toBe('deleted');
  });

  it('lets a decision about the account win over a deletion the user scheduled', () => {
    expect(
      effectiveAccountStatus({ status: 'suspended', deletionScheduled: true, erased: false }),
    ).toBe('suspended');
  });

  it('leaves an unrecognised value unrecognised rather than calling it active', () => {
    expect(effectiveAccountStatus({ ...ACTIVE, status: 'whatever' })).toBeNull();
  });

  it('reports an ordinary account as active', () => {
    expect(effectiveAccountStatus(ACTIVE)).toBe('active');
    expect(effectiveAccountStatus({ status: null, deletionScheduled: false, erased: false })).toBe(
      null,
    );
  });
});

describe('accountAccessDecision', () => {
  it('sends a lockout to the recovery it actually has, and a suspension to a different one', () => {
    const locked = accountAccessDecision('locked');
    const suspended = accountAccessDecision('suspended');

    expect(locked).toMatchObject({
      allowed: false,
      reason: 'locked',
      recoveryPath: LOCKOUT_RECOVERY_PATH,
    });
    expect(suspended).toMatchObject({
      allowed: false,
      reason: 'suspended',
      recoveryPath: SUSPENSION_APPEAL_PATH,
    });
    expect(locked.allowed === false && locked.message).toContain(LOCKOUT_RECOVERY_PATH);
    expect(locked.allowed === false && locked.message).not.toBe(
      suspended.allowed === false && suspended.message,
    );
  });

  it('treats a ban as a suspension for the user, whatever it is called internally', () => {
    expect(accountAccessDecision('banned')).toMatchObject({ reason: 'suspended' });
  });

  it('lets a scheduled deletion through, because cancelling it is done signed in', () => {
    expect(accountAccessDecision('deletion_scheduled')).toEqual({ allowed: true });
    expect(accountAccessDecision('active')).toEqual({ allowed: true });
    expect(accountAccessDecision(null)).toEqual({ allowed: true });
  });

  it('refuses a deleted account and offers no way back, rather than a route that leads nowhere', () => {
    expect(accountAccessDecision('deleted')).toMatchObject({
      allowed: false,
      reason: 'deleted',
      recoveryPath: null,
    });
  });

  it('decides on every status in the vocabulary and on nothing outside it', () => {
    for (const status of ACCOUNT_STATUSES) {
      expect(isAccountStatus(status)).toBe(true);
      expect(typeof accountAccessDecision(status).allowed).toBe('boolean');
    }
    expect(isAccountStatus('recovery_pending')).toBe(false);
  });
});
