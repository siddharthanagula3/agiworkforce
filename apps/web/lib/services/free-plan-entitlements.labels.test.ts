import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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
    expect(getProjectLimitErrorMessage('byok')).toBe(
      'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.',
    );
  });
});
