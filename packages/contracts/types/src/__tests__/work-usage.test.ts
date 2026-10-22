import { describe, expect, it } from 'vitest';
import {
  isAccountWideUsageFeature,
  resolveWorkUsageRecovery,
  WORK_USAGE_COPY,
} from '../work-usage';
import { PRODUCT_NAMES } from '../product-names';

describe('work usage recovery', () => {
  it('offers credits to a paid plan whose spent usage credits can clear', () => {
    expect(resolveWorkUsageRecovery('insufficient_credits', 'pro')).toBe('add_credits');
    expect(resolveWorkUsageRecovery('rolling_five_hour_limit_reached', 'pro')).toBe('add_credits');
  });

  it('offers only Upgrade to the Free plan', () => {
    expect(resolveWorkUsageRecovery('free_trial_token_budget_reached', 'free')).toBe('upgrade');
    expect(resolveWorkUsageRecovery('insufficient_credits', 'free')).toBe('upgrade');
  });

  it('upgrades a paid plan when credits cannot clear the limit', () => {
    expect(resolveWorkUsageRecovery('monthly_credit_limit_reached', 'pro')).toBe('upgrade');
  });

  it('leaves refusals another model or a retry can answer to the send error', () => {
    expect(resolveWorkUsageRecovery('flagship_weekly_limit_reached', 'pro')).toBeNull();
    expect(resolveWorkUsageRecovery('rate_limit_exceeded', 'pro')).toBeNull();
    expect(resolveWorkUsageRecovery(null, 'pro')).toBeNull();
  });

  it('treats only plan capacity as account-wide', () => {
    expect(isAccountWideUsageFeature('token_cap')).toBe(true);
    expect(isAccountWideUsageFeature('rolling_capacity')).toBe(true);
    expect(isAccountWideUsageFeature('request_rate')).toBe(false);
  });

  it('names the product from the registry and states no usage figures', () => {
    expect(WORK_USAGE_COPY.title).toContain(PRODUCT_NAMES.work);
    for (const body of Object.values(WORK_USAGE_COPY.body)) {
      expect(body).not.toMatch(/\d|\$|%/);
    }
  });
});
