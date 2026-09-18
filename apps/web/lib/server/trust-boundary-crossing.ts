import 'server-only';

import {
  createAuditEvent,
  refuseTrustTransition,
  trustModeContract,
  trustModeOrStrictest,
  type AuditEvent,
  type AuditSurface,
  type KeyAttribution,
  type PrivacyMode,
  type TrustTransitionRefusal,
} from '@agiworkforce/types';

import { scanForSecrets, type SecretDetection } from '@/lib/security/secrets-audit';

/**
 * What the server may do on behalf of a caller who chose a trust mode. Host
 * classification stays where it belongs, in `@agiworkforce/trust-boundaries` on
 * the device surfaces; what the server can enforce is whose key serves a call,
 * whether a fallback is allowed to serve it, and that neither happens silently.
 */

export type CrossingDecision = 'allowed' | 'refused';

export const CROSSING_REFUSAL_REASONS = [
  'secret-in-payload',
  'platform-key-not-permitted',
  'fallback-needs-approval',
  'fallback-leaves-trust-boundary',
] as const;

export type CrossingRefusalReason = (typeof CROSSING_REFUSAL_REASONS)[number];

export interface ProviderEgressRequest {
  readonly mode: PrivacyMode;
  readonly surface: AuditSurface;
  readonly userId: string | null;
  /** Whose credential this route would use. */
  readonly routeKeyAttribution: KeyAttribution;
  /** The route is a fallback rather than the one the caller selected. */
  readonly isFallback?: boolean;
  /** A person approved this specific fallback. */
  readonly fallbackApproved?: boolean;
  /** The bytes about to leave, scanned before they do. */
  readonly payload?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly operationRef?: string;
}

export interface CrossingOutcome {
  readonly decision: CrossingDecision;
  readonly reason: CrossingRefusalReason | null;
  readonly secrets: readonly SecretDetection[];
  /** Every crossing is recorded; the caller persists it. */
  readonly audit: AuditEvent;
}

function crossingAudit(
  input: {
    readonly surface: AuditSurface;
    readonly userId: string | null;
    readonly resource: string;
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly operationRef?: string;
    readonly metadata: Record<string, unknown>;
  },
  decision: CrossingDecision,
): AuditEvent {
  return createAuditEvent({
    userId: input.userId,
    surface: input.surface,
    action: 'settings_changed',
    resource: input.resource,
    resourceType: 'audit-event',
    outcome: decision === 'allowed' ? 'success' : 'denied',
    severity: decision === 'allowed' ? 'info' : 'warning',
    retentionClass: 'security',
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    ...(input.operationRef === undefined ? {} : { operationRef: input.operationRef }),
    metadata: { ...input.metadata, decision },
  });
}

/**
 * A credential in the payload refuses the call in every mode, Managed included:
 * a key that reaches a provider is disclosed to it whoever owns the route.
 */
export function evaluateProviderEgress(request: ProviderEgressRequest): CrossingOutcome {
  const mode = trustModeOrStrictest(request.mode);
  const contract = trustModeContract(mode);
  const base = {
    surface: request.surface,
    userId: request.userId,
    resource: `provider-egress:${mode}`,
    ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
    ...(request.causationId === undefined ? {} : { causationId: request.causationId }),
    ...(request.operationRef === undefined ? {} : { operationRef: request.operationRef }),
  };

  const refuse = (reason: CrossingRefusalReason, secrets: readonly SecretDetection[] = []) => ({
    decision: 'refused' as const,
    reason,
    secrets,
    audit: crossingAudit(
      {
        ...base,
        metadata: { trustMode: mode, reason, keyAttribution: request.routeKeyAttribution },
      },
      'refused',
    ),
  });

  const secrets = request.payload ? scanForSecrets(request.payload) : [];
  if (secrets.length > 0) {
    return refuse('secret-in-payload', secrets);
  }

  if (contract.keyAttribution === 'user-key' && request.routeKeyAttribution !== 'user-key') {
    return refuse('platform-key-not-permitted');
  }

  if (request.isFallback === true) {
    if (contract.failover === 'refuse' && request.fallbackApproved !== true) {
      return refuse('fallback-needs-approval');
    }
    if (
      contract.failover === 'same-trust-boundary' &&
      request.routeKeyAttribution !== contract.keyAttribution
    ) {
      return refuse('fallback-leaves-trust-boundary');
    }
  }

  return {
    decision: 'allowed',
    reason: null,
    secrets,
    audit: crossingAudit(
      {
        ...base,
        metadata: {
          trustMode: mode,
          keyAttribution: request.routeKeyAttribution,
          fallback: request.isFallback === true,
        },
      },
      'allowed',
    ),
  };
}

export interface TrustTransitionOutcome {
  readonly decision: CrossingDecision;
  readonly refusal: TrustTransitionRefusal | null;
  readonly audit: AuditEvent;
}

/**
 * Every change of trust mode is recorded, allowed or not: the record of a
 * refused downgrade is the evidence that the promise held.
 */
export function evaluateTrustTransition(input: {
  readonly from: PrivacyMode;
  readonly to: PrivacyMode;
  readonly approved?: boolean;
  readonly surface: AuditSurface;
  readonly userId: string | null;
  readonly correlationId?: string;
}): TrustTransitionOutcome {
  const refusal = refuseTrustTransition({
    from: input.from,
    to: input.to,
    ...(input.approved === undefined ? {} : { approved: input.approved }),
  });
  const decision: CrossingDecision = refusal === null ? 'allowed' : 'refused';

  return {
    decision,
    refusal,
    audit: crossingAudit(
      {
        surface: input.surface,
        userId: input.userId,
        resource: `trust-mode:${input.from}->${input.to}`,
        ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
        metadata: {
          from: input.from,
          to: input.to,
          ...(refusal === null ? {} : { reason: refusal.reason }),
        },
      },
      decision,
    ),
  };
}
