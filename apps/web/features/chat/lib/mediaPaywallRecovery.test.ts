import { describe, expect, it, vi } from 'vitest';
import {
  resolveMediaPaywallSlot,
  runMediaPaywallRecovery,
  type MediaBillingRefusal,
} from './mediaPaywallRecovery';

function refusal(overrides: Partial<MediaBillingRefusal> = {}): MediaBillingRefusal {
  return {
    isPaywall: true,
    message: 'Usage budget exhausted.',
    code: 'insufficient_credits',
    recoveryAction: 'upgrade',
    ...overrides,
  };
}

describe('resolveMediaPaywallSlot', () => {
  it('never tells a Max 15x account with exhausted credits to upgrade to Max 15x or lower', () => {
    const slot = resolveMediaPaywallSlot({
      feature: 'video',
      currentTier: 'max_15x',
      refusal: refusal(),
      usage: {
        plan_tier: 'max_15x',
        usage_percentage: 100,
        usage_reset_at: '2099-08-31T12:00:00.000Z',
        has_usage_remaining: false,
        period_start: '2099-08-01T12:00:00.000Z',
        period_end: '2099-09-01T12:00:00.000Z',
        subscription_status: 'active',
        session_usage_percentage: 50,
        session_reset_at: null,
        weekly_usage_percentage: 50,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 50,
        flagship_weekly_reset_at: null,
      },
    });

    expect(slot).toMatchObject({
      requiredTier: 'max_15x',
      recoveryAction: 'view_usage',
      showUpgradeCta: true,
      showResetTime: true,
      resetAt: '2099-08-31T12:00:00.000Z',
    });
    expect(slot?.reason?.toLowerCase()).not.toContain('upgrade');
    expect(slot?.reason).toContain('Wait for the reset');
  });

  it('uses required_plans to target the exact lowest qualifying video tier', () => {
    const slot = resolveMediaPaywallSlot({
      feature: 'video',
      currentTier: 'pro',
      refusal: refusal({
        code: 'plan_upgrade_required',
        message: 'Video generation is available on Max 15x and Enterprise plans.',
        requiredPlans: ['enterprise', 'max_15x'],
      }),
      usage: null,
    });

    expect(slot).toMatchObject({
      requiredTier: 'max_15x',
      recoveryAction: 'upgrade',
      showUpgradeCta: true,
    });
  });

  it('routes an inactive subscription to billing repair on its current plan', () => {
    const slot = resolveMediaPaywallSlot({
      feature: 'image',
      currentTier: 'free',
      refusal: refusal({
        code: 'subscription_inactive',
        currentPlan: 'max_15x',
        message: 'Your subscription is past_due. Please update your payment method.',
        recoveryAction: 'manage_billing',
      }),
      usage: null,
    });

    expect(slot).toMatchObject({
      requiredTier: 'max_15x',
      recoveryAction: 'manage_billing',
    });
  });

  it('never treats an organization plan as lower than a personal media tier', () => {
    const slot = resolveMediaPaywallSlot({
      feature: 'image',
      currentTier: 'team',
      refusal: refusal({
        code: 'plan_upgrade_required',
        requiredPlans: ['pro', 'max', 'max_15x', 'team', 'enterprise'],
      }),
      usage: null,
    });

    expect(slot).toMatchObject({ recoveryAction: 'manage_billing' });
    expect(slot?.reason?.toLowerCase()).not.toContain('upgrade');
  });
});

describe('runMediaPaywallRecovery', () => {
  it('opens the upgrade dialog focused on the persisted required tier', () => {
    const openSettings = vi.fn();
    const openUpgrade = vi.fn();

    runMediaPaywallRecovery(
      { recoveryAction: 'upgrade', requiredTier: 'max_15x' },
      { openSettings, openUpgrade },
    );

    expect(openUpgrade).toHaveBeenCalledWith('max_15x');
    expect(openSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['manage_billing', 'billing'],
    ['view_usage', 'usage'],
  ] as const)('opens Settings > %s at the %s section', (recoveryAction, section) => {
    const openSettings = vi.fn();
    const openUpgrade = vi.fn();

    runMediaPaywallRecovery(
      { recoveryAction, requiredTier: 'max_15x' },
      { openSettings, openUpgrade },
    );

    expect(openSettings).toHaveBeenCalledWith(section);
    expect(openUpgrade).not.toHaveBeenCalled();
  });
});
