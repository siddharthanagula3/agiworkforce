/**
 * Pure capability-admission evaluator. Checks task-declared requirements
 * against an already-computed `EffectiveCapabilityDocument` and returns a
 * TYPED admission result: never a boolean, never a silently-narrowed
 * capability list. A MANDATORY requirement that is not in
 * `document.granted` always fails admission; there is no code path that
 * proceeds with a weaker substitute chosen by "the model" or by config. That
 * is the literal fix for six-app finding A ("no effective-capability
 * handshake" / capability honesty).
 *
 * ## Fit with `packages/ai/routing` admission (WIRED 2026-07-17, see below)
 *
 * `packages/ai/routing/src/auto.ts` `resolveAutoRoute` already returns a
 * discriminated `AutoRouteDecision` (`SelectedAutoRoute | UnavailableAutoRoute`)
 * and its internal `evaluateEligibility` already gates on MODEL-only
 * `IntrinsicCapability` requirements, appending plain strings to
 * `UnavailableAutoRoute.reasons` on mismatch. That covers ONE of the four
 * layers this module composes (`model`) and only for intrinsic
 * model modality, not product capability, tier, surface, or settings.
 *
 * The wired call shape (landed 2026-07-17, `packages/ai/routing/src/auto.ts`
 * `evaluateSessionCapabilityAdmission`): `resolveAutoRoute` accepts the
 * session's `capabilityDocument` + already-translated `PlatformCapability`
 * `capabilityRequirements` (translation onto the shared vocabulary remains
 * the SESSION-OWNING CALLER's job, routing never invents the
 * intrinsic→platform mapping), calls `evaluateCapabilityAdmission` once per
 * resolution, and on `{ admitted: false }`, or on mandatory requirements
 * with NO document (fail-closed), returns
 * `UnavailableAutoRoute { code: 'mandatory_capability_unavailable' }` with
 * `rejected[].capabilityId` / `.reason` / `.deniedByLayers` folded into the
 * existing `reasons: string[]`, same error-reporting shape routing already
 * had, now backed by this typed, four-layer-aware source in addition to the
 * model-only intrinsic check. This module still does not import from
 * `@agiworkforce/routing` (that would invert the existing dependency
 * direction: routing already depends on `@agiworkforce/types`).
 *
 * @module capability-handshake/evaluator
 */

import type { PlatformCapability } from '../capabilities';
import {
  CAPABILITY_LAYERS,
  type CapabilityLayer,
  type CapabilityLimit,
  type EffectiveCapabilityDocument,
} from './types';

export interface CapabilityDecision {
  capabilityId: PlatformCapability;
  allowed: boolean;
  deniedByLayers: readonly CapabilityLayer[];
  policySource: string | null;
  limits: readonly CapabilityLimit[];
}

export function resolveCapabilityDecision(
  document: Pick<EffectiveCapabilityDocument, 'granted' | 'deniedBy' | 'sources' | 'limits'>,
  capabilityId: PlatformCapability,
): CapabilityDecision {
  const deniedByLayers = document.deniedBy[capabilityId] ?? [];
  const allowed = document.granted.includes(capabilityId) && deniedByLayers.length === 0;
  const decidingLayer = deniedByLayers[0];
  return {
    capabilityId,
    allowed,
    deniedByLayers,
    policySource: decidingLayer ? (document.sources[decidingLayer] ?? null) : null,
    limits: (document.limits ?? []).filter((limit) => limit.capabilityId === capabilityId),
  };
}

export type CapabilityRequirementStrength = 'mandatory' | 'optional';

export interface CapabilityRequirement {
  capabilityId: PlatformCapability;
  strength: CapabilityRequirementStrength;
  reason?: string;
}

export interface CapabilityAdmissionRejection {
  capabilityId: PlatformCapability;
  reason?: string;
  deniedByLayers: readonly CapabilityLayer[];
}

export type CapabilityAdmissionResult =
  | {
      admitted: true;
      document: EffectiveCapabilityDocument;
      grantedRequirementIds: readonly PlatformCapability[];
    }
  | {
      admitted: false;
      code: 'mandatory_capability_unavailable';
      document: EffectiveCapabilityDocument;
      rejected: readonly CapabilityAdmissionRejection[];
    };

export function evaluateCapabilityAdmission(
  document: EffectiveCapabilityDocument,
  requirements: readonly CapabilityRequirement[],
): CapabilityAdmissionResult {
  const grantedSet = new Set(document.granted);
  const rejected: CapabilityAdmissionRejection[] = [];

  for (const requirement of requirements) {
    if (requirement.strength !== 'mandatory') continue;
    if (grantedSet.has(requirement.capabilityId)) continue;

    rejected.push({
      capabilityId: requirement.capabilityId,
      ...(requirement.reason !== undefined ? { reason: requirement.reason } : {}),
      deniedByLayers: document.deniedBy[requirement.capabilityId] ?? CAPABILITY_LAYERS,
    });
  }

  if (rejected.length > 0) {
    return { admitted: false, code: 'mandatory_capability_unavailable', document, rejected };
  }

  return {
    admitted: true,
    document,
    grantedRequirementIds: requirements
      .map((requirement) => requirement.capabilityId)
      .filter((capabilityId) => grantedSet.has(capabilityId)),
  };
}
