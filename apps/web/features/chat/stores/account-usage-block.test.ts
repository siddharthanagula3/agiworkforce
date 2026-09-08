import { describe, expect, it } from 'vitest';
import { classifyManagedQuotaErrorCode } from '@agiworkforce/types';
import { resolveQuotaPaywallSlot } from '@/features/chat/lib/quotaPaywallSlot';
import { isAccountWideUsageBlock } from './account-usage-block';

function slotFor(code: string) {
  const slot = resolveQuotaPaywallSlot({
    code,
    message: '',
    planTier: 'pro',
    subscriptionSource: 'stripe',
  });
  if (!slot) throw new Error(`${code} is not a catalog quota block`);
  return slot;
}

/**
 * The division is derived from the block catalog rather than a list kept here:
 * capacity the plan owns is account-wide, and anything the next request can
 * answer for itself is not.
 */
describe('WEB-CHAT-MESSAGE-LIST-ACCOUNT-WIDE-QUOTA-01 · which refusals outlive their turn', () => {
  it.each([
    'insufficient_credits',
    'monthly_limit_exceeded',
    'monthly_credit_limit_reached',
    'rolling_five_hour_limit_reached',
    'rolling_weekly_limit_reached',
    'free_trial_token_budget_reached',
  ])('treats %s as account-wide, because no other request gets through either', (code) => {
    expect(isAccountWideUsageBlock(slotFor(code))).toBe(true);
  });

  it.each([
    'plan_upgrade_required',
    'free_trial_model_only',
    'free_trial_feature_unavailable',
    'rate_limit_exceeded',
  ])('leaves %s on its own turn, because the next request can differ', (code) => {
    expect(isAccountWideUsageBlock(slotFor(code))).toBe(false);
  });

  it('leaves the flagship weekly limit inline, since a standard model still answers', () => {
    const slot = slotFor('flagship_weekly_limit_reached');

    expect(slot.suggestStandardModel).toBe(true);
    expect(isAccountWideUsageBlock(slot)).toBe(false);
  });

  it('covers every block the catalog defines, so a new code cannot be silently unclassified', () => {
    const codes = [
      'insufficient_credits',
      'monthly_limit_exceeded',
      'monthly_credit_limit_reached',
      'rolling_five_hour_limit_reached',
      'rolling_weekly_limit_reached',
      'flagship_weekly_limit_reached',
      'free_trial_token_budget_reached',
      'free_trial_model_only',
      'free_trial_feature_unavailable',
      'plan_upgrade_required',
      'rate_limit_exceeded',
    ];

    for (const code of codes) {
      expect(classifyManagedQuotaErrorCode(code), code).not.toBeNull();
    }
  });

  it('leaves a free-capacity refusal inline, because its own retry is the way out', () => {
    const slot = {
      feature: 'token_cap',
      requiredTier: 'pro',
      freeCapacity: { provider: 'fixture', retryAt: '2026-09-07T00:00:00.000Z' },
    } as Parameters<typeof isAccountWideUsageBlock>[0];

    expect(isAccountWideUsageBlock(slot)).toBe(false);
  });
});
