import { describe, expect, it } from 'vitest';

import { PROVIDER_TRAITS, type ProviderAdapter } from '../provider-adapter';
import {
  DATA_RETENTION_REQUIREMENTS,
  PROVIDER_STATE_KINDS,
  ZERO_DATA_RETENTION_TRAIT,
  adapterMeetsRetentionRequirement,
  isDataRetentionRequirement,
  isProviderStateKind,
  providerStateKindsFor,
  retentionDenial,
  retentionRequirementFor,
} from '../provider-state';

type AdapterFacts = Pick<ProviderAdapter, 'id' | 'traits'>;

const zeroRetention: AdapterFacts = {
  id: 'anthropic',
  traits: [ZERO_DATA_RETENTION_TRAIT, 'server-side-file-store'],
};

const silent: AdapterFacts = { id: 'openai' };

describe('retention requirement', () => {
  it('names the trait an adapter must declare, and the traits list has it', () => {
    expect(PROVIDER_TRAITS).toContain(ZERO_DATA_RETENTION_TRAIT);
  });

  it('reads a silence as a refusal rather than as consent', () => {
    expect(adapterMeetsRetentionRequirement(silent, 'zero-retention')).toBe(false);
    expect(adapterMeetsRetentionRequirement({ traits: [] }, 'zero-retention')).toBe(false);
    expect(adapterMeetsRetentionRequirement(zeroRetention, 'zero-retention')).toBe(true);
  });

  it('lets every adapter serve the default requirement', () => {
    for (const adapter of [silent, zeroRetention]) {
      expect(adapterMeetsRetentionRequirement(adapter, 'default')).toBe(true);
      expect(retentionDenial(adapter, 'default')).toBeNull();
    }
  });

  it('returns a denial the router can read instead of throwing', () => {
    const denial = retentionDenial(silent, 'zero-retention');
    expect(denial?.requirement).toBe('zero-retention');
    expect(denial?.reason).toContain('openai');
    expect(denial?.reason).toContain(ZERO_DATA_RETENTION_TRAIT);
    expect(retentionDenial(zeroRetention, 'zero-retention')).toBeNull();
  });

  it('folds the boolean the policy stores into the requirement', () => {
    expect(retentionRequirementFor(true)).toBe('zero-retention');
    expect(retentionRequirementFor(false)).toBe('default');
    expect(retentionRequirementFor(undefined)).toBe('default');
  });
});

describe('provider-held state', () => {
  it('lists only the state a call will actually create', () => {
    expect(providerStateKindsFor(zeroRetention, {})).toEqual([]);
    expect(providerStateKindsFor(zeroRetention, { usesPromptCache: true })).toEqual([
      'prompt-cache',
    ]);
    expect(
      providerStateKindsFor(zeroRetention, { usesPromptCache: true, uploadsFiles: true }),
    ).toEqual(['prompt-cache', 'server-file']);
  });

  it('claims no server-side file store the adapter has not declared', () => {
    expect(providerStateKindsFor(silent, { uploadsFiles: true })).toEqual([]);
  });

  it('recognises its own vocabularies and nothing else', () => {
    for (const kind of PROVIDER_STATE_KINDS) expect(isProviderStateKind(kind)).toBe(true);
    for (const requirement of DATA_RETENTION_REQUIREMENTS) {
      expect(isDataRetentionRequirement(requirement)).toBe(true);
    }
    expect(isProviderStateKind('anything-else')).toBe(false);
    expect(isDataRetentionRequirement('zero')).toBe(false);
  });
});
