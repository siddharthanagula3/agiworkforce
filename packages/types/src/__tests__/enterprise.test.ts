import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  getUsageCostShare,
  isOrganizationAdminRole,
  MANAGED_COMPUTE_MARGIN_POLICY,
  requiresManagedComputeMarginReview,
  type AdminPolicy,
} from '../enterprise';

describe('enterprise contracts', () => {
  it('keeps normal chat sync limited to web, desktop, and mobile by default', () => {
    expect(DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces).toEqual(['web', 'desktop', 'mobile']);
    expect(DEFAULT_ENTERPRISE_ADMIN_POLICY.allowCliCloudSync).toBe(false);
    expect(DEFAULT_ENTERPRISE_ADMIN_POLICY.allowVsCodeCloudSync).toBe(false);
    expect(DEFAULT_ENTERPRISE_ADMIN_POLICY.allowChromeCloudSync).toBe(false);
  });

  it('keeps managed compute disabled until an admin explicitly enables it', () => {
    const policy: AdminPolicy = {
      organizationId: 'org-1',
      updatedAt: '2026-05-21T00:00:00.000Z',
      ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    };

    expect(policy.defaultPrivacyMode).toBe('byok');
    expect(policy.allowedPrivacyModes).toEqual(['local', 'byok']);
    expect(policy.allowManagedCompute).toBe(false);
    expect(policy.requireLocalToByokPreview).toBe(true);
  });

  it('distinguishes organization admins from normal members', () => {
    expect(isOrganizationAdminRole('owner')).toBe(true);
    expect(isOrganizationAdminRole('admin')).toBe(true);
    expect(isOrganizationAdminRole('member')).toBe(false);
    expect(isOrganizationAdminRole('viewer')).toBe(false);
  });

  it('flags managed compute when provider cost consumes the margin guardrail', () => {
    expect(MANAGED_COMPUTE_MARGIN_POLICY.warningAtRevenueShare).toBe(0.35);
    expect(getUsageCostShare({ providerCostUsd: 0.35, chargedAmountUsd: 1 })).toBe(0.35);
    expect(requiresManagedComputeMarginReview({ providerCostUsd: 0.35, chargedAmountUsd: 1 })).toBe(
      true,
    );
    expect(requiresManagedComputeMarginReview({ providerCostUsd: 0.1, chargedAmountUsd: 1 })).toBe(
      false,
    );
    expect(requiresManagedComputeMarginReview({ providerCostUsd: 0.1, chargedAmountUsd: 0 })).toBe(
      true,
    );
  });
});
