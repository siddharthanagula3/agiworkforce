import { describe, expect, it } from 'vitest';

import { formatCredits, getEffectivePlanCreditAllowance } from '@agiworkforce/types';

import { planCreditWindows, summarizePlanChange, webRevenueContextOfPrice } from '../plan-display';

describe('plan credit windows for the subscriber looking at them', () => {
  it('shows a US or unknown subscriber the base windows', () => {
    const base = getEffectivePlanCreditAllowance('pro', null, null);
    expect(planCreditWindows('pro')).toEqual({
      fiveHour: base.fiveHour,
      weekly: base.weekly,
      monthly: base.monthly,
    });
    expect(webRevenueContextOfPrice(null)).toBeNull();
    expect(webRevenueContextOfPrice({ currency: 'eur' })).toBeNull();
  });

  it('shows a rupee subscriber the windows their price pays for', () => {
    const context = webRevenueContextOfPrice({ currency: 'INR' });
    expect(context).toEqual({ channel: 'web', currency: 'inr' });
    const effective = getEffectivePlanCreditAllowance('basic', null, context);
    expect(planCreditWindows('basic', context)?.monthly).toBe(effective.monthly);
    expect(effective.monthly).toBeLessThan(planCreditWindows('basic')!.monthly);
  });

  it('states a downgrade in the rupee subscriber’s own credits', () => {
    const context = webRevenueContextOfPrice({ currency: 'inr' });
    const summary = summarizePlanChange('pro', 'basic', undefined, context);
    const monthly = summary.credits.find((row) => row.label === 'Credits a month');
    expect(monthly).toEqual({
      label: 'Credits a month',
      from: formatCredits(getEffectivePlanCreditAllowance('pro', null, context).monthly),
      to: formatCredits(getEffectivePlanCreditAllowance('basic', null, context).monthly),
    });
  });
});
