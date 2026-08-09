import { describe, expect, it } from 'vitest';

import {
  buildAccountIdentityItems,
  buildTrustReviewItems,
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

  it('does not show cloud identity rows while signed out', () => {
    expect(buildAccountIdentityItems(false, undefined)).toEqual([]);
  });

  it('repeats autonomy, review, active Local boundary, and privacy controls in the account menu', () => {
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
      '$(lock) Developer session boundary: Local',
      '$(eye) Privacy & data controls',
    ]);
    expect(items[2]?.description).toContain('AI output can be wrong');
    expect(items[3]?.description).toContain("Ada Lovelace's Cloud plan is not used");
    expect(items[1]?.action).toBe('permission-docs');
    expect(items[4]?.action).toBe('privacy-settings');
  });
});
