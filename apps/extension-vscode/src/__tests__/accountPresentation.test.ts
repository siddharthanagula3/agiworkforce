import { describe, expect, it } from 'vitest';

import { buildAccountIdentityItems } from '../features/account-auth/accountPresentation';

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
});
