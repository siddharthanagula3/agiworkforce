import { describe, expect, it } from 'vitest';
import { MARKETING_FEATURE_MATRIX } from '../marketing-constants';

describe('marketing plan matrix', () => {
  it('uses the founder-approved shared catalog labels and prices', () => {
    expect(MARKETING_FEATURE_MATRIX.team).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planId: 'pro', label: 'Pro', price: '$20/mo' }),
        expect.objectContaining({ planId: 'max', label: 'Max 5x', price: '$100/mo' }),
        expect.objectContaining({ planId: 'max_15x', label: 'Max 15x', price: '$200/mo' }),
        expect.objectContaining({
          planId: 'team',
          label: 'Team',
          price: '$25/seat/mo',
          billingInterval: 'Monthly or annual ($240/seat/yr)',
        }),
      ]),
    );
  });

  it('does not expose a retired Hobby or Max 20x plan', () => {
    const serialized = JSON.stringify(MARKETING_FEATURE_MATRIX);
    expect(serialized).not.toMatch(/hobby/i);
    expect(serialized).not.toMatch(/20x/i);
  });
});
