/**
 * @file trust-mode-contract.ts
 * @module @agiworkforce/types/trust-mode-contract
 *
 * What each trust mode promises, as an object rather than as prose spread over
 * three surfaces. `PrivacyMode` already named the three modes; nothing said
 * where Local keeps its data, whether BYOK attributes a call to the user's own
 * key, or what Managed does when a route is unavailable, so each surface
 * answered for itself and two of them disagreed.
 *
 * The rule the whole file exists to hold: a mode is never downgraded silently.
 * Moving from a stricter mode to a looser one is a decision a person makes, so
 * the transition returns a refusal a caller must handle, not a fallback.
 */

import { PRIVACY_MODES, type PrivacyMode } from './suite-contracts';

export const STORAGE_LOCATIONS = ['device', 'user-provider', 'managed-cloud'] as const;

export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];

export const KEY_ATTRIBUTIONS = ['none', 'user-key', 'platform-key'] as const;

export type KeyAttribution = (typeof KEY_ATTRIBUTIONS)[number];

/**
 * `refuse` is the only answer that cannot leak: the alternative route would
 * serve the turn under a weaker promise than the one the user chose.
 */
export const FAILOVER_POLICIES = ['refuse', 'same-trust-boundary', 'any-eligible-route'] as const;

export type FailoverPolicy = (typeof FAILOVER_POLICIES)[number];

export interface TrustModeContract {
  readonly mode: PrivacyMode;
  /** Where conversation content comes to rest. */
  readonly storage: StorageLocation;
  /** Whose credential the provider call is billed and attributed to. */
  readonly keyAttribution: KeyAttribution;
  /** What may serve the turn when the chosen route cannot. */
  readonly failover: FailoverPolicy;
  /** Our managed cloud may be reached at all. */
  readonly cloudEgressAllowed: boolean;
  /** Content is copied to another device through our sync service. */
  readonly syncsAcrossDevices: boolean;
  /** Reaching the cloud needs a person to say yes first. */
  readonly cloudFallbackNeedsApproval: boolean;
}

export const TRUST_MODE_CONTRACTS: Readonly<Record<PrivacyMode, TrustModeContract>> = Object.freeze(
  {
    local: {
      mode: 'local',
      storage: 'device',
      keyAttribution: 'none',
      failover: 'refuse',
      cloudEgressAllowed: false,
      syncsAcrossDevices: false,
      cloudFallbackNeedsApproval: true,
    },
    byok: {
      mode: 'byok',
      storage: 'user-provider',
      keyAttribution: 'user-key',
      failover: 'same-trust-boundary',
      cloudEgressAllowed: false,
      syncsAcrossDevices: false,
      cloudFallbackNeedsApproval: true,
    },
    managed: {
      mode: 'managed',
      storage: 'managed-cloud',
      keyAttribution: 'platform-key',
      failover: 'any-eligible-route',
      cloudEgressAllowed: true,
      syncsAcrossDevices: true,
      cloudFallbackNeedsApproval: false,
    },
  },
);

/** Strictest first. A higher index is a weaker promise. */
export const TRUST_MODE_STRICTNESS: readonly PrivacyMode[] = ['local', 'byok', 'managed'];

export function trustModeContract(mode: PrivacyMode): TrustModeContract {
  return TRUST_MODE_CONTRACTS[mode];
}

export function isPrivacyMode(value: string): value is PrivacyMode {
  return (PRIVACY_MODES as readonly string[]).includes(value);
}

export function isDowngrade(from: PrivacyMode, to: PrivacyMode): boolean {
  return TRUST_MODE_STRICTNESS.indexOf(to) > TRUST_MODE_STRICTNESS.indexOf(from);
}

export const TRUST_TRANSITION_REFUSAL_REASONS = [
  'downgrade-needs-approval',
  'cloud-egress-not-allowed',
  'unknown-mode',
] as const;

export type TrustTransitionRefusalReason = (typeof TRUST_TRANSITION_REFUSAL_REASONS)[number];

export interface TrustTransitionRefusal {
  readonly from: PrivacyMode;
  readonly to: PrivacyMode;
  readonly reason: TrustTransitionRefusalReason;
}

export interface TrustTransitionRequest {
  readonly from: PrivacyMode;
  readonly to: PrivacyMode;
  /** A person said yes to this exact transition, in this session. */
  readonly approved?: boolean;
}

/**
 * Null when the transition may proceed. Tightening never needs approval;
 * loosening always does, because the data the user already produced was
 * produced under the stricter promise.
 */
export function refuseTrustTransition(
  request: TrustTransitionRequest,
): TrustTransitionRefusal | null {
  if (!isPrivacyMode(request.from) || !isPrivacyMode(request.to)) {
    return { from: request.from, to: request.to, reason: 'unknown-mode' };
  }
  if (request.from === request.to) return null;
  if (!isDowngrade(request.from, request.to)) return null;
  if (request.approved === true) return null;
  return { from: request.from, to: request.to, reason: 'downgrade-needs-approval' };
}

/**
 * An unreadable mode reads as Local, which is the only reading that cannot leak
 * what a stricter mode was protecting.
 */
export function trustModeOrStrictest(value: string | null | undefined): PrivacyMode {
  return typeof value === 'string' && isPrivacyMode(value) ? value : 'local';
}
