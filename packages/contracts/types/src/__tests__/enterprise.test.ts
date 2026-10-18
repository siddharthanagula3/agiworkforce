import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  isOrganizationAdminRole,
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

  it('never starts deleting anything on its own', () => {
    // retentionEnforced is the one field in this policy whose default has an
    // irreversible consequence. If it ever ships true, every workspace that
    // has not chosen a retention window begins permanently deleting
    // conversations on the shipped 365-day default.
    expect(DEFAULT_ENTERPRISE_ADMIN_POLICY.retentionEnforced).toBe(false);
  });

  it('distinguishes organization admins from normal members', () => {
    expect(isOrganizationAdminRole('owner')).toBe(true);
    expect(isOrganizationAdminRole('admin')).toBe(true);
    expect(isOrganizationAdminRole('member')).toBe(false);
    expect(isOrganizationAdminRole('viewer')).toBe(false);
  });
});
