import { NETWORK_CONDITION_RULES, isNetworkCondition } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import { ERROR_CATEGORIES, classifyError, networkConditionForErrorCategory } from '../errors';

describe('what a failed upstream call says about the network', () => {
  it('answers for every category the taxonomy defines', () => {
    expect(ERROR_CATEGORIES.length).toBeGreaterThan(0);
    for (const category of ERROR_CATEGORIES) {
      const condition = networkConditionForErrorCategory(category);
      if (condition === null) continue;
      expect(isNetworkCondition(condition), category).toBe(true);
    }
  });

  it('blames the provider and never our own backend, which it cannot see', () => {
    for (const category of ERROR_CATEGORIES) {
      const condition = networkConditionForErrorCategory(category);
      if (condition === null) continue;
      expect(NETWORK_CONDITION_RULES[condition].origin, category).toBe('provider');
    }
  });

  it('says nothing about a network for a refusal that arrived over a working one', () => {
    for (const category of [
      'safety',
      'content_blocked',
      'invalid_input',
      'billing_exhausted',
      'quota_exhausted',
      'rate_limit',
      'auth',
      'context_overflow',
    ] as const) {
      expect(networkConditionForErrorCategory(category), category).toBeNull();
    }
  });

  it('reads a dead socket off a real classification rather than a hand-made one', () => {
    const classified = classifyError(new TypeError('fetch failed'));
    expect(classified.category).toBe('connection');
    expect(networkConditionForErrorCategory(classified.category)).toBe('provider_degraded');
  });
});
