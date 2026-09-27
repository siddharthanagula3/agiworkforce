import { describe, expect, it } from 'vitest';

import {
  buildAccountIdentityItems,
  buildTrustReviewItems,
  describeAccountPlan,
} from '../features/account-auth/accountPresentation';

describe('AGI Cloud account presentation', () => {
  it('places identity and account ownership before all usage/actions', () => {
    const items = buildAccountIdentityItems(true, {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });

    expect(items.map((item) => [item.label, item.description])).toEqual([
      ['AGI Cloud account', undefined],
      ['$(account) Ada Lovelace', 'ada@example.com'],
      ['$(organization) Personal account', 'Pro plan'],
    ]);
    expect(items.every((item) => !('action' in item))).toBe(true);
  });

  it('shows an honest unavailable state instead of inventing identity', () => {
    expect(buildAccountIdentityItems(true, undefined).map((item) => item.label)).toEqual([
      'AGI Cloud account',
      '$(account) Account identity unavailable',
      '$(organization) Plan owner unavailable',
    ]);
  });

  it('shows a scheduled cancellation without treating already-paid access as expired', () => {
    const identity = {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      accountType: 'Personal account' as const,
      planName: 'Pro',
      tier: 'pro',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      subscriptionSource: 'stripe' as const,
    };

    const endsOn = new Date(identity.currentPeriodEnd).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    expect(describeAccountPlan(identity)).toBe(`Pro plan · ends ${endsOn}`);
    expect(buildAccountIdentityItems(true, identity)[2]).toMatchObject({
      detail: `Access remains active through ${endsOn}, then the plan ends`,
    });
  });

  it('keeps an active renewal on its billing owner instead of an end date', () => {
    const identity = {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      accountType: 'Personal account' as const,
      planName: 'Max 20x',
      tier: 'max_15x',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      subscriptionSource: 'stripe' as const,
    };

    expect(describeAccountPlan(identity)).toBe('Max 20x plan · Web billing');
    expect(buildAccountIdentityItems(true, identity)[2]).toMatchObject({
      detail: 'Plan owner and account boundary',
    });
  });

  it('does not show cloud identity rows while signed out', () => {
    expect(buildAccountIdentityItems(false, undefined)).toEqual([]);
  });

  it('repeats autonomy, review, explicit per-chat boundary, and privacy controls in the account menu', () => {
    const items = buildTrustReviewItems('auto', {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });

    expect(items.map((item) => item.label)).toEqual([
      'Trust & review',
      '$(shield) Autonomy: Edit automatically',
      '$(warning) Review generated code and commands',
      '$(lock) Developer-session boundary: shown in chat',
      '$(eye) Privacy & data controls',
    ]);
    expect(items[2]?.description).toContain('AI output can be wrong');
    expect(items[3]?.description).toContain('plan, a provider key, or a local model');
    expect(items[1]?.action).toBe('permission-docs');
    expect(items[4]?.action).toBe('privacy-settings');
  });
});
