import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// BIZ-003: plan IDENTITY (the stable `pro` / `max_15x` ids) must survive a
// display RENAME. This file pins the direction of that dependency — the
// user-facing limit messages must resolve their plan name from the shared
// billing catalog, never from a retyped copy. Renaming Max 5x in the catalog
// used to leave this module printing the old name forever.
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    BILLING_PLAN_PRICING: {
      ...actual.BILLING_PLAN_PRICING,
      max: { ...actual.BILLING_PLAN_PRICING.max, label: 'Renamed Max' },
      pro: { ...actual.BILLING_PLAN_PRICING.pro, label: 'Renamed Pro' },
    },
  };
});

import {
  getCustomRemoteMcpLimitErrorMessage,
  getKnowledgeStorageLimitErrorMessage,
  getProjectLimitErrorMessage,
} from './free-plan-entitlements';

describe('plan labels in entitlement messages follow the catalog', () => {
  it('uses the renamed label while the plan id stays the lookup key', () => {
    expect(getProjectLimitErrorMessage('pro')).toBe(
      'Renamed Pro accounts can have up to 25 Projects. Delete a Project or upgrade to add another.',
    );
  });

  it('renames the plan in the connector and storage messages too', () => {
    expect(getCustomRemoteMcpLimitErrorMessage('max')).toContain('Renamed Max');
    expect(getKnowledgeStorageLimitErrorMessage('pro', 1024 ** 3)).toContain('Renamed Pro');
  });

  it('still refuses to name a plan that has no managed allowance', () => {
    // `byok` is deliberately absent from the safe-label map, so it must fall
    // through to the generic wording rather than gaining a name from the catalog.
    expect(getProjectLimitErrorMessage('byok')).toBe(
      'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.',
    );
  });
});
