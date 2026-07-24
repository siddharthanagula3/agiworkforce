import { describe, expect, it } from 'vitest';
import { checkFeatureAccess } from '../featureGates';
import type { SubscriptionInfo } from '../../types/billing';

function subscription(plan_name: string): SubscriptionInfo {
  return { plan_name, status: 'active' } as SubscriptionInfo;
}

describe('desktop feature gates use the shared plan catalog', () => {
  it('treats Team as Pro-level with team administration, not Max individual access', () => {
    expect(checkFeatureAccess('browser_automation', subscription('team')).allowed).toBe(true);
    expect(checkFeatureAccess('team_features', subscription('team')).allowed).toBe(true);
    expect(checkFeatureAccess('custom_workflows', subscription('team')).allowed).toBe(false);
    expect(checkFeatureAccess('sso', subscription('team')).allowed).toBe(false);
  });

  it('gives Max 15x Max features without inventing Team administration', () => {
    expect(checkFeatureAccess('priority_support', subscription('max_15x')).allowed).toBe(true);
    expect(checkFeatureAccess('custom_workflows', subscription('max_15x')).allowed).toBe(true);
    expect(checkFeatureAccess('team_features', subscription('max_15x')).allowed).toBe(false);
  });

  it('fails unknown plans closed to Free rather than granting paid capabilities', () => {
    const result = checkFeatureAccess('browser_automation', subscription('future-phantom-tier'));
    expect(result).toMatchObject({
      allowed: false,
      upgradeRequired: true,
      suggestedPlan: 'pro',
    });
  });
});
