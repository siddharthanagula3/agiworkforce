import { describe, expect, it } from 'vitest';
import { normalizePlan, normalizeStatus } from './types';

describe('billing value normalization', () => {
  it('preserves Team and Max 15x subscription tiers', () => {
    expect(normalizePlan('team')).toBe('team');
    expect(normalizePlan('max_15x')).toBe('max_15x');
  });

  it('preserves Stripe trial and cancellation states without fabricating active status', () => {
    expect(normalizeStatus('trialing')).toBe('trialing');
    expect(normalizeStatus('canceled')).toBe('canceled');
    expect(normalizeStatus('cancelled')).toBe('canceled');
    expect(normalizeStatus('unknown')).toBe('none');
  });
});
