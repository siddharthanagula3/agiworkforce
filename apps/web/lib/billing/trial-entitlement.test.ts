import { describe, expect, it } from 'vitest';

import { toEntitlement } from '@agiworkforce/types';

import { resolveCheckoutTrialDays } from './trial-policy';
import { resolveTrialEntitlement, startTrial, trialEndsAt } from './trial-entitlement';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-18T00:00:00.000Z');

describe('a trial is the trialed plan entitlement with an end date', () => {
  it('grants the trialed plan while the trial is running', () => {
    const trial = resolveTrialEntitlement({
      trialedPlan: 'pro',
      startedAt: new Date(NOW - 2 * DAY_MS).toISOString(),
      endsAt: new Date(NOW + 5 * DAY_MS).toISOString(),
      now: NOW,
    });

    expect(trial.status).toBe('active');
    expect(trial.entitlement).toEqual(toEntitlement('pro'));
    expect(trial.daysRemaining).toBe(5);
  });

  it('falls back to the free entitlement the moment the trial ends', () => {
    const trial = resolveTrialEntitlement({
      trialedPlan: 'pro',
      startedAt: new Date(NOW - 20 * DAY_MS).toISOString(),
      endsAt: new Date(NOW - 1).toISOString(),
      now: NOW,
    });

    expect(trial.status).toBe('expired');
    expect(trial.entitlement).toEqual(toEntitlement('free'));
    expect(trial.daysRemaining).toBe(0);
    expect(trial.trialedPlan).toBe('pro');
  });

  it('reports no trial when no trial was ever started', () => {
    const trial = resolveTrialEntitlement({
      trialedPlan: 'pro',
      startedAt: null,
      endsAt: null,
      now: NOW,
    });

    expect(trial.status).toBe('none');
    expect(trial.entitlement).toEqual(toEntitlement('free'));
  });

  it('treats an unparseable end date as no trial rather than an endless one', () => {
    const trial = resolveTrialEntitlement({
      trialedPlan: 'pro',
      startedAt: '2026-09-01T00:00:00.000Z',
      endsAt: 'whenever',
      now: NOW,
    });

    expect(trial.status).toBe('none');
    expect(trial.entitlement).toEqual(toEntitlement('free'));
  });
});

describe('starting a trial', () => {
  it('starts nothing when checkout granted no trial days', () => {
    expect(startTrial({ trialedPlan: 'pro', trialDays: null, startedAtMs: NOW })).toBeNull();
    expect(startTrial({ trialedPlan: 'pro', trialDays: 0, startedAtMs: NOW })).toBeNull();
  });

  it('starts nothing for a plan the catalog offers no trial on, whatever checkout said', () => {
    expect(startTrial({ trialedPlan: 'pro', trialDays: 14, startedAtMs: NOW })).toBeNull();
  });

  it('composes with the eligibility rule, which refuses a returning customer', () => {
    expect(
      resolveCheckoutTrialDays({
        trialDays: 14,
        priorStoreOrStripeSubscription: true,
        customerHasSubscriptionHistory: false,
      }),
    ).toBeNull();
    expect(
      resolveCheckoutTrialDays({
        trialDays: 14,
        priorStoreOrStripeSubscription: false,
        customerHasSubscriptionHistory: false,
      }),
    ).toBe(14);
  });

  it('ends a trial exactly the granted number of days later', () => {
    expect(trialEndsAt(NOW, 14)).toBe(new Date(NOW + 14 * DAY_MS).toISOString());
  });
});
