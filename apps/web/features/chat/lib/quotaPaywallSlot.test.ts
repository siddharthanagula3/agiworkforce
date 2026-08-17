import { describe, expect, it } from 'vitest';
import { resolveQuotaPaywallSlot } from './quotaPaywallSlot';

const base = {
  code: 'rolling_five_hour_limit_reached',
  message: 'Your rolling 5-hour usage limit is reached.',
  planTier: 'max_15x',
  subscriptionSource: 'stripe',
};

describe('resolveQuotaPaywallSlot', () => {
  it('returns nothing for a code that is not a quota block', () => {
    expect(resolveQuotaPaywallSlot({ ...base, code: 'idempotency_conflict' })).toBeNull();
  });

  it('takes the server recovery action over the locally derived one', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      planTier: 'free',
      subscriptionSource: null,
      recovery: { action: 'top_up', href: '/settings/billing' },
    });

    expect(slot?.recoveryAction).toBe('top_up');
    expect(slot?.showUpgradeCta).toBe(true);
  });

  it('honours a server view_usage refusal instead of promising an upgrade', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      subscriptionSource: null,
      recovery: { action: 'view_usage', href: '/settings/usage' },
    });

    expect(slot?.recoveryAction).toBe('view_usage');
  });

  it('ignores a server recovery action the client cannot render', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      planTier: 'free',
      subscriptionSource: null,
      recovery: { action: 'call_support', href: '/help' },
    });

    expect(slot?.recoveryAction).toBe('upgrade');
  });

  it('still derives a top-up locally when the server sends no recovery', () => {
    const slot = resolveQuotaPaywallSlot(base);

    expect(slot?.recoveryAction).toBe('top_up');
    expect(slot?.showUpgradeCta).toBe(true);
  });

  it('falls back to an upgrade when credits cannot clear the block', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      code: 'monthly_credit_limit_reached',
      planTier: 'basic',
    });

    expect(slot?.recoveryAction).toBe('upgrade');
    expect(slot?.requiredTier).toBe('pro');
  });
});
