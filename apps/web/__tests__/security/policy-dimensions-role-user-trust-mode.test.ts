import { describe, expect, it } from 'vitest';

import {
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
  PRIVACY_MODES,
  TRUST_MODE_CONTRACTS,
  TRUST_MODE_STRICTNESS,
  canonicalOrganizationPermission,
  expandOrganizationPermissions,
  isDowngrade,
  refuseTrustTransition,
  trustModeContract,
  trustModeOrStrictest,
  type PrivacyMode,
} from '@agiworkforce/types';

/**
 * Role, user and trust mode each decide something the others do not, and a test
 * that only covers one of them cannot see a grant leaking across the other two.
 * Each axis is asserted here on its own.
 */
describe('role decides what a member may do', () => {
  it('no legacy spelling grants more than its canonical permission', () => {
    for (const permission of ORGANIZATION_PERMISSIONS) {
      const canonical = canonicalOrganizationPermission(permission);
      expect(canonical, permission).not.toBeNull();
      const expanded = expandOrganizationPermissions([permission]);
      expect(expanded.has(canonical as string), permission).toBe(true);
    }
  });

  it('an unknown permission string expands to nothing rather than to everything', () => {
    expect(expandOrganizationPermissions(['not.a.permission']).size).toBe(0);
    expect(expandOrganizationPermissions([]).size).toBe(0);
  });

  it('a primary-owner permission is never grantable to another role', () => {
    for (const permission of PRIMARY_OWNER_ONLY_PERMISSIONS) {
      expect(GRANTABLE_ORGANIZATION_PERMISSIONS, permission).not.toContain(permission);
    }
    expect(PRIMARY_OWNER_ONLY_PERMISSIONS.length).toBeGreaterThan(0);
  });
});

describe('trust mode decides where content may go', () => {
  it.each(PRIVACY_MODES)('%s declares a complete contract', (mode) => {
    const contract = trustModeContract(mode as PrivacyMode);

    expect(contract.mode).toBe(mode);
    expect(contract.storage).toBeTruthy();
    expect(contract.keyAttribution).toBeTruthy();
    expect(contract.failover).toBeTruthy();
  });

  it('only the weakest mode allows cloud egress and cross-device sync', () => {
    for (const mode of PRIVACY_MODES as readonly PrivacyMode[]) {
      const contract = TRUST_MODE_CONTRACTS[mode];
      if (contract.cloudEgressAllowed) {
        expect(mode, 'a strict mode must not reach the cloud').toBe('managed');
      }
      if (contract.syncsAcrossDevices) {
        expect(mode, 'a strict mode must not sync off the device').toBe('managed');
      }
      if (!contract.cloudEgressAllowed) {
        expect(contract.cloudFallbackNeedsApproval, mode).toBe(true);
      }
    }
  });

  it('a downgrade is refused until a person approves that exact transition', () => {
    expect(refuseTrustTransition({ from: 'local', to: 'managed' })).toMatchObject({
      reason: 'downgrade-needs-approval',
    });
    expect(refuseTrustTransition({ from: 'local', to: 'managed', approved: true })).toBeNull();
    expect(refuseTrustTransition({ from: 'managed', to: 'local' })).toBeNull();
    expect(refuseTrustTransition({ from: 'local', to: 'local' })).toBeNull();
  });

  it('an unreadable mode reads as the strictest one, not as the default', () => {
    for (const value of [null, undefined, '', 'cloud', 'MANAGED']) {
      expect(trustModeOrStrictest(value)).toBe(TRUST_MODE_STRICTNESS[0]);
    }
    expect(refuseTrustTransition({ from: 'local', to: 'cloud' as PrivacyMode })).toMatchObject({
      reason: 'unknown-mode',
    });
  });

  it('strictness is a total order, so every pair has a direction', () => {
    expect(new Set(TRUST_MODE_STRICTNESS).size).toBe(PRIVACY_MODES.length);
    for (const from of TRUST_MODE_STRICTNESS) {
      for (const to of TRUST_MODE_STRICTNESS) {
        if (from === to) continue;
        expect(isDowngrade(from, to)).toBe(!isDowngrade(to, from));
      }
    }
  });
});
