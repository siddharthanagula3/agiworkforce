import { describe, expect, it } from 'vitest';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
} from '../index';

/**
 * The sign-up screen shows one sentence and a link to the full explanation. The
 * sentence must say no more than the approved statement and no less than the
 * fact it stands in for: a free-model provider, not AGI, may train on content.
 */
describe('the free-model training notice shown at sign-up', () => {
  it('is one sentence, not the pricing-table fragment', () => {
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE).not.toBe(FREE_PLAN_TRAINING_DATA_DISCLOSURE);
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE.match(/[.!?]/g)).toHaveLength(1);
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE.endsWith('.')).toBe(true);
  });

  it('attributes training to free-model providers, hedged, as the full statement does', () => {
    for (const text of [FREE_PLAN_TRAINING_SIGNUP_NOTICE, FREE_PLAN_TRAINING_SIGNUP_STATEMENT]) {
      expect(text).toMatch(/provider/i);
      expect(text).toMatch(/\bmay\b/);
      expect(text).toMatch(/train/i);
      expect(text).toMatch(/\bfree\b/i);
    }
  });

  it('never claims what the full statement reserves for AGI-owned models', () => {
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE).not.toMatch(/AGI (does|will|may)/);
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE).not.toMatch(/never|no provider|not used/i);
  });

  it('points at the full explanation rather than restating the opt-out', () => {
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE).not.toContain('Settings');
    expect(FREE_PLAN_TRAINING_SIGNUP_NOTICE_LINK_LABEL).toBe('Data use details');
  });
});
