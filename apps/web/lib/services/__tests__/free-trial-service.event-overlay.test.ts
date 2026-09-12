import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canAccessModelForSubscriptionTier, listCanonicalModels } from '@agiworkforce/types';

import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { EVENT_ENABLED_ENV, EVENT_MODELS_ENV } from '@/lib/server/event-access';
import { isFreeTrialRequest } from '@/lib/services/free-trial-service';

/**
 * `isFreeTrialRequest` is the single chokepoint: answering yes both engages the
 * free budget and skips the "free supports Auto Economy only" 403. Routing the
 * event overlay through it means a promoted model is metered exactly like a
 * permanently free one, instead of arriving as unbudgeted traffic.
 */
// Derived, not named: any model a free account cannot already reach proves the
// same thing, and a literal here would be a second copy of the catalogue.
const EVENT_MODEL = listCanonicalModels()
  .map((model) => model.id)
  .find((id) => !canAccessModelForSubscriptionTier(id, 'free'))!;
const UNPROMOTED_MODEL = listCanonicalModels()
  .map((model) => model.id)
  .find((id) => id !== EVENT_MODEL && !canAccessModelForSubscriptionTier(id, 'free'))!;
const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

describe('free trial admission · event overlay', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [EVENT_ENABLED_ENV, EVENT_MODELS_ENV]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [EVENT_ENABLED_ENV, EVENT_MODELS_ENV]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('guards the fixture: the event model is not permanently free', () => {
    expect(FREE_TRIAL_MODELS).not.toContain(EVENT_MODEL);
  });

  it('refuses the event model on free while the promotion is off', () => {
    expect(isFreeTrialRequest({ requestedModel: EVENT_MODEL, planTier: 'free' })).toBe(false);
  });

  it('serves the event model on the free budget while the promotion is on', () => {
    process.env[EVENT_ENABLED_ENV] = '1';
    process.env[EVENT_MODELS_ENV] = EVENT_MODEL;

    expect(isFreeTrialRequest({ requestedModel: EVENT_MODEL, planTier: 'free' })).toBe(true);
  });

  it('keeps serving the permanently free models either way', () => {
    const permanent = FREE_TRIAL_MODELS[0] as string;
    expect(isFreeTrialRequest({ requestedModel: permanent, planTier: 'free' })).toBe(true);

    process.env[EVENT_ENABLED_ENV] = '1';
    process.env[EVENT_MODELS_ENV] = EVENT_MODEL;
    expect(isFreeTrialRequest({ requestedModel: permanent, planTier: 'free' })).toBe(true);
  });

  it('still refuses a model the promotion does not name', () => {
    process.env[EVENT_ENABLED_ENV] = '1';
    process.env[EVENT_MODELS_ENV] = EVENT_MODEL;

    expect(isFreeTrialRequest({ requestedModel: UNPROMOTED_MODEL, planTier: 'free' })).toBe(false);
  });

  it.each(PAID_TIERS)('does not put %s on the free budget', (tier) => {
    process.env[EVENT_ENABLED_ENV] = '1';
    process.env[EVENT_MODELS_ENV] = EVENT_MODEL;

    expect(isFreeTrialRequest({ requestedModel: EVENT_MODEL, planTier: tier })).toBe(false);
  });

  it('matches the canonical id regardless of casing or padding', () => {
    process.env[EVENT_ENABLED_ENV] = '1';
    process.env[EVENT_MODELS_ENV] = EVENT_MODEL;

    expect(
      isFreeTrialRequest({ requestedModel: `  ${EVENT_MODEL.toUpperCase()} `, planTier: 'free' }),
    ).toBe(true);
  });
});
