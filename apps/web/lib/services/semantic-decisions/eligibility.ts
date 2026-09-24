import { modelRegistry } from '@agiworkforce/model-registry';
import type { RoutingTrustMode } from '@agiworkforce/routing';
import type { PrivacyMode } from '@agiworkforce/types';

import { DECISION_TRANSPORT_ID, type DecisionSkipReason } from './kinds';

// Exhaustive over the routing vocabulary, so a trust mode added there fails to
// compile here rather than defaulting into the eligible one.
const CANONICAL_TRUST_MODE: Readonly<Record<RoutingTrustMode, PrivacyMode>> = {
  managed_cloud: 'managed',
  byok: 'byok',
  local: 'local',
  on_device: 'local',
};

// A value nobody mapped reads as the most restrictive mode, never as managed:
// the one spelling that would admit a request is the one it may not guess.
export function canonicalPrivacyMode(trustMode: string): PrivacyMode {
  return Object.prototype.hasOwnProperty.call(CANONICAL_TRUST_MODE, trustMode)
    ? CANONICAL_TRUST_MODE[trustMode as RoutingTrustMode]
    : 'local';
}

// Three conditions, all of which must hold. Managed Cloud alone is not
// permission to add a subprocessor. Pure and total: no I/O, no throw.
export interface DecisionEligibilityFacts {
  /** The session's canonical trust mode, not the routing vocabulary's spelling. */
  privacyMode: PrivacyMode;
  /** Null for a personal account, which is governed by its trust mode alone. */
  workspaceId: string | null;
  zeroDataRetentionOnly: boolean;
  /** The workspace's supplier policy, or null where no policy governs it. */
  workspaceModelPolicy: {
    allowedProviders?: readonly string[];
    blockedProviders?: readonly string[];
  } | null;
  /** Set only when the workspace is pinned away from the processing region. */
  residencyRegion: string | null;
}

export type DecisionEligibility =
  { eligible: true } | { eligible: false; reason: DecisionSkipReason };

type GovernanceRecord = {
  dataRetentionClass?: string;
  residencyRegions?: readonly string[] | null;
};

function transportGovernance(): GovernanceRecord | undefined {
  const governance = modelRegistry.governance as unknown as Readonly<
    Record<string, GovernanceRecord | undefined>
  >;
  return governance[DECISION_TRANSPORT_ID];
}

// Zero retention must be the DEFAULT. Availability on request describes an
// agreement someone would sign, not one this deployment holds.
function transportProvesZeroRetention(): boolean {
  return transportGovernance()?.dataRetentionClass === 'zero_retention';
}

// An unpublished processing location cannot be shown to sit inside a pinned
// jurisdiction, so a pinned workspace is refused rather than assumed.
function transportServesRegion(region: string): boolean {
  const regions = transportGovernance()?.residencyRegions;
  return Array.isArray(regions) && regions.includes(region);
}

export function evaluateDecisionEligibility(facts: DecisionEligibilityFacts): DecisionEligibility {
  if (facts.privacyMode !== 'managed') return { eligible: false, reason: 'trust_mode' };

  if (facts.zeroDataRetentionOnly && !transportProvesZeroRetention()) {
    return { eligible: false, reason: 'zero_data_retention' };
  }

  const policy = facts.workspaceModelPolicy;
  if (policy) {
    const allowed = policy.allowedProviders ?? [];
    const blocked = policy.blockedProviders ?? [];
    // An allow-list is closed, and the transport cannot be named in one, so a
    // workspace that wrote one has not admitted it.
    if (allowed.length > 0 && !allowed.includes(DECISION_TRANSPORT_ID)) {
      return { eligible: false, reason: 'provider_not_permitted' };
    }
    if (blocked.includes(DECISION_TRANSPORT_ID)) {
      return { eligible: false, reason: 'provider_not_permitted' };
    }
  }

  if (facts.residencyRegion !== null && !transportServesRegion(facts.residencyRegion)) {
    return { eligible: false, reason: 'region_excluded' };
  }

  return { eligible: true };
}
