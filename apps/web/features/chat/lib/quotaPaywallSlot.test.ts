import { describe, expect, it } from 'vitest';
import {
  getDefaultModelFor,
  getModelMetadataById,
  getProviderOfferings,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { isAccountWideUsageBlock } from '@/features/chat/stores/account-usage-block';
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
      recovery: [{ action: 'top_up', href: '/settings/billing' }],
    });

    expect(slot?.recoveryAction).toBe('top_up');
    expect(slot?.showUpgradeCta).toBe(true);
  });

  it('honours a server view_usage refusal instead of promising an upgrade', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      subscriptionSource: null,
      recovery: [{ action: 'view_usage', href: '/settings/usage' }],
    });

    expect(slot?.recoveryAction).toBe('view_usage');
  });

  it('ignores a server recovery action the client cannot render', () => {
    const slot = resolveQuotaPaywallSlot({
      ...base,
      planTier: 'free',
      subscriptionSource: null,
      recovery: [{ action: 'call_support', href: '/help' }],
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

describe('resolveQuotaPaywallSlot · a reached free limit', () => {
  const offerings = Object.entries(getProviderOfferings()).filter(
    ([, offering]) => offering.quotaProbeProtocol === 'chat',
  );
  const [limitedKey, limited] = offerings[0]!;
  const [alternativeKey, alternative] = offerings[1]!;
  const freeRouter = getDefaultModelFor(normalizeBillingPlanTier(null), 'chat');
  const message = 'The free limit for this model is reached.';

  it('builds the limit card from the typed refusal, never the generic error row', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_quota_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      freeLimit: { model: limitedKey, reason: 'allowance_used', alternative_model: alternativeKey },
    });

    expect(slot).toMatchObject({
      reason: message,
      recoveryAction: 'upgrade',
      showUpgradeCta: true,
      showResetTime: false,
      freeLimit: {
        modelId: limitedKey,
        modelName: limited.displayName,
        reason: 'allowance_used',
        alternativeModel: { id: alternativeKey, name: alternative.displayName },
      },
    });
    expect(slot?.resetAt).toBeUndefined();
  });

  it('carries the reset time the refusal names', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_allowance_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      requestedModel: freeRouter,
      resetAt: '2026-10-02T20:00:00.000Z',
    });

    expect(slot).toMatchObject({
      showResetTime: true,
      resetAt: '2026-10-02T20:00:00.000Z',
      freeLimit: { modelId: freeRouter, reason: 'shared_pool_used' },
    });
  });

  it('reads the shared free pool from its code when the route sends no typed limit', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_allowance_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      requestedModel: freeRouter,
    });

    expect(slot?.freeLimit).toEqual({
      modelId: freeRouter,
      modelName: getModelMetadataById(freeRouter)!.name,
      reason: 'shared_pool_used',
    });
    expect(slot?.showResetTime).toBe(false);
  });

  it('carries the server’s own-key option onto a shared free pool card', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_allowance_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      requestedModel: freeRouter,
      recovery: [
        { action: 'upgrade', href: '/pricing' },
        { action: 'byok', href: '/byok' },
      ],
    });

    expect(slot?.freeLimit).toMatchObject({ reason: 'shared_pool_used', byokHref: '/byok' });
    expect(slot?.recoveryAction).toBe('upgrade');
  });

  it('never follows an own-key option off this site', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_allowance_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      requestedModel: freeRouter,
      recovery: [{ action: 'byok', href: 'https://elsewhere.example/byok' }],
    });

    expect(slot?.freeLimit?.byokHref).toBeUndefined();
  });

  it('drops an alternative it cannot name instead of offering a blank switch', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_quota_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      freeLimit: {
        model: limitedKey,
        reason: 'allowance_used',
        alternative_model: 'not-a-registry-model',
      },
    });

    expect(slot?.freeLimit?.alternativeModel).toBeUndefined();
  });

  it('keeps the limit on the turn that hit it rather than blocking the account', () => {
    const slot = resolveQuotaPaywallSlot({
      code: 'free_quota_exhausted',
      message,
      planTier: 'free',
      subscriptionSource: null,
      freeLimit: { model: limitedKey, reason: 'allowance_used' },
    });

    expect(isAccountWideUsageBlock(slot!)).toBe(false);
  });
});
