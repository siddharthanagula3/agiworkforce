import { describe, expect, it } from 'vitest';

import { PRIVACY_MODES } from '../suite-contracts';
import {
  FAILOVER_POLICIES,
  KEY_ATTRIBUTIONS,
  STORAGE_LOCATIONS,
  TRUST_MODE_CONTRACTS,
  TRUST_MODE_STRICTNESS,
  isDowngrade,
  isPrivacyMode,
  refuseTrustTransition,
  trustModeContract,
  trustModeOrStrictest,
} from '../trust-mode-contract';

describe('every mode answers every question', () => {
  it('covers the three modes and no others', () => {
    expect(Object.keys(TRUST_MODE_CONTRACTS).sort()).toEqual([...PRIVACY_MODES].sort());
    expect([...TRUST_MODE_STRICTNESS].sort()).toEqual([...PRIVACY_MODES].sort());
  });

  it('states a storage location, a key attribution and a failover policy', () => {
    for (const mode of PRIVACY_MODES) {
      const contract = trustModeContract(mode);
      expect(STORAGE_LOCATIONS, mode).toContain(contract.storage);
      expect(KEY_ATTRIBUTIONS, mode).toContain(contract.keyAttribution);
      expect(FAILOVER_POLICIES, mode).toContain(contract.failover);
      expect(contract.mode).toBe(mode);
    }
  });

  it('keeps local on the device, with no cloud egress and no sync', () => {
    const local = trustModeContract('local');
    expect(local.storage).toBe('device');
    expect(local.cloudEgressAllowed).toBe(false);
    expect(local.syncsAcrossDevices).toBe(false);
    expect(local.failover).toBe('refuse');
    expect(local.cloudFallbackNeedsApproval).toBe(true);
  });

  it('attributes a byok call to the user key and keeps failover inside the boundary', () => {
    const byok = trustModeContract('byok');
    expect(byok.keyAttribution).toBe('user-key');
    expect(byok.storage).toBe('user-provider');
    expect(byok.failover).toBe('same-trust-boundary');
    expect(byok.cloudEgressAllowed).toBe(false);
  });

  it('is the only mode that may reach our cloud, and says so once', () => {
    const permitted = PRIVACY_MODES.filter((mode) => trustModeContract(mode).cloudEgressAllowed);
    expect(permitted).toEqual(['managed']);
    expect(trustModeContract('managed').failover).toBe('any-eligible-route');
  });
});

describe('transitions', () => {
  it('allows tightening without asking', () => {
    expect(refuseTrustTransition({ from: 'managed', to: 'byok' })).toBeNull();
    expect(refuseTrustTransition({ from: 'managed', to: 'local' })).toBeNull();
    expect(refuseTrustTransition({ from: 'byok', to: 'local' })).toBeNull();
    expect(refuseTrustTransition({ from: 'local', to: 'local' })).toBeNull();
  });

  it('refuses every loosening that nobody approved', () => {
    for (const [from, to] of [
      ['local', 'byok'],
      ['local', 'managed'],
      ['byok', 'managed'],
    ] as const) {
      const refusal = refuseTrustTransition({ from, to });
      expect(refusal?.reason, `${from}->${to}`).toBe('downgrade-needs-approval');
      expect(isDowngrade(from, to)).toBe(true);
      expect(refuseTrustTransition({ from, to, approved: true })).toBeNull();
    }
  });

  it('refuses a mode it does not know rather than guessing', () => {
    const refusal = refuseTrustTransition({
      from: 'local',
      to: 'anything' as (typeof PRIVACY_MODES)[number],
    });
    expect(refusal?.reason).toBe('unknown-mode');
  });
});

describe('an unreadable mode', () => {
  it('reads as the strictest one', () => {
    expect(trustModeOrStrictest(null)).toBe('local');
    expect(trustModeOrStrictest(undefined)).toBe('local');
    expect(trustModeOrStrictest('')).toBe('local');
    expect(trustModeOrStrictest('Managed')).toBe('local');
    expect(trustModeOrStrictest('managed')).toBe('managed');
    expect(isPrivacyMode('managed')).toBe(true);
    expect(isPrivacyMode('cloud')).toBe(false);
  });
});
