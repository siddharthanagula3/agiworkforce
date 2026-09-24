import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import {
  canonicalPrivacyMode,
  evaluateDecisionEligibility,
  type DecisionEligibilityFacts,
} from '../eligibility';
import { DECISION_TRANSPORT_ID } from '../kinds';

const MANAGED: DecisionEligibilityFacts = {
  privacyMode: 'managed',
  workspaceId: 'workspace-1',
  zeroDataRetentionOnly: false,
  workspaceModelPolicy: null,
  residencyRegion: null,
};

describe('the routing trust vocabulary against the canonical one', () => {
  it.each([
    ['managed_cloud', 'managed'],
    ['byok', 'byok'],
    ['local', 'local'],
    ['on_device', 'local'],
  ] as const)('maps %s to %s', (routing, canonical) => {
    expect(canonicalPrivacyMode(routing)).toBe(canonical);
  });

  it.each(['', 'managed', 'MANAGED_CLOUD', 'cloud', 'unknown', 'constructor', '__proto__'])(
    'CRITICAL: falls back to local rather than reading %s as managed',
    (value) => {
      expect(canonicalPrivacyMode(value)).toBe('local');
    },
  );

  it('refuses a request built from an unmapped trust mode', () => {
    expect(
      evaluateDecisionEligibility({ ...MANAGED, privacyMode: canonicalPrivacyMode('cloud') }),
    ).toEqual({ eligible: false, reason: 'trust_mode' });
  });
});

describe('decision eligibility', () => {
  it('admits a managed workspace with no policy against it', () => {
    expect(evaluateDecisionEligibility(MANAGED)).toEqual({ eligible: true });
  });

  it('admits a personal account with no workspace when it is managed', () => {
    expect(evaluateDecisionEligibility({ ...MANAGED, workspaceId: null })).toEqual({
      eligible: true,
    });
  });

  it.each(['local', 'byok'] as const)('refuses a %s session', (privacyMode) => {
    expect(evaluateDecisionEligibility({ ...MANAGED, privacyMode })).toEqual({
      eligible: false,
      reason: 'trust_mode',
    });
  });

  it('refuses a zero-data-retention workspace, because the transport does not prove ZDR', () => {
    const governance = modelRegistry.governance as unknown as Record<
      string,
      { dataRetentionClass?: string } | undefined
    >;
    // The record says zero retention is available on request, which is an
    // agreement someone would have to sign, not one this deployment holds.
    expect(governance[DECISION_TRANSPORT_ID]?.dataRetentionClass).not.toBe('zero_retention');
    expect(evaluateDecisionEligibility({ ...MANAGED, zeroDataRetentionOnly: true })).toEqual({
      eligible: false,
      reason: 'zero_data_retention',
    });
  });

  it('refuses a workspace whose supplier allow-list does not name the transport', () => {
    expect(
      evaluateDecisionEligibility({
        ...MANAGED,
        workspaceModelPolicy: { allowedProviders: ['openai', 'anthropic'] },
      }),
    ).toEqual({ eligible: false, reason: 'provider_not_permitted' });
  });

  it('refuses a workspace that blocked the transport by name', () => {
    expect(
      evaluateDecisionEligibility({
        ...MANAGED,
        workspaceModelPolicy: { blockedProviders: [DECISION_TRANSPORT_ID] },
      }),
    ).toEqual({ eligible: false, reason: 'provider_not_permitted' });
  });

  it('leaves an empty policy alone rather than reading it as a refusal', () => {
    expect(
      evaluateDecisionEligibility({
        ...MANAGED,
        workspaceModelPolicy: { allowedProviders: [], blockedProviders: [] },
      }),
    ).toEqual({ eligible: true });
  });

  it('refuses a workspace pinned to a region the transport publishes nothing about', () => {
    expect(evaluateDecisionEligibility({ ...MANAGED, residencyRegion: 'eu' })).toEqual({
      eligible: false,
      reason: 'region_excluded',
    });
  });

  it('refuses on the first failing condition rather than weighing them', () => {
    expect(
      evaluateDecisionEligibility({
        ...MANAGED,
        privacyMode: 'byok',
        zeroDataRetentionOnly: true,
        residencyRegion: 'eu',
      }),
    ).toEqual({ eligible: false, reason: 'trust_mode' });
  });
});
