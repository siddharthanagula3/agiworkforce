/**
 * Pure capability-admission evaluator. Checks task-declared requirements
 * against an already-computed `EffectiveCapabilityDocument` and returns a
 * TYPED admission result — never a boolean, never a silently-narrowed
 * capability list. A MANDATORY requirement that is not in
 * `document.granted` always fails admission; there is no code path that
 * proceeds with a weaker substitute chosen by "the model" or by config. That
 * is the literal fix for six-app finding A ("no effective-capability
 * handshake" / capability honesty).
 *
 * ## Fit with `packages/ai/routing` admission (read-only reference; NOT wired in)
 *
 * `packages/ai/routing/src/auto.ts` `resolveAutoRoute` already returns a
 * discriminated `AutoRouteDecision` (`SelectedAutoRoute | UnavailableAutoRoute`)
 * and its internal `evaluateEligibility` already gates on MODEL-only
 * `IntrinsicCapability` requirements, appending plain strings to
 * `UnavailableAutoRoute.reasons` on mismatch. That covers ONE of the four
 * layers this module composes (`model`) and only for intrinsic
 * model modality, not product capability, tier, surface, or settings.
 *
 * The intended future call shape (stage 2, out of this module's scope):
 * a routing-admission caller builds `requirements` from
 * `AutoTaskPolicy`/`AutoRoutingRequest.requiredCapabilities` (translated
 * onto `PlatformCapability` ids), calls `evaluateCapabilityAdmission`
 * alongside `evaluateEligibility`, and on `{ admitted: false }` folds
 * `rejected[].capabilityId` / `.reason` into the existing
 * `UnavailableAutoRoute.reasons: string[]` — same error-reporting shape
 * routing already has, now backed by a typed, four-layer-aware source
 * instead of the model-only check. This module does not import from
 * `@agiworkforce/routing` (that would invert the existing dependency
 * direction: routing already depends on `@agiworkforce/types`) and does not
 * modify `packages/ai/routing` — see the W5 stage-1 dispatch scope.
 *
 * @module capability-handshake/evaluator
 */

import type { PlatformCapability } from '../capabilities';
import { CAPABILITY_LAYERS, type CapabilityLayer, type EffectiveCapabilityDocument } from './types';

export type CapabilityRequirementStrength = 'mandatory' | 'optional';

/**
 * One task-declared capability requirement. `reason` is surfaced verbatim in
 * a rejection so a UI or log can explain WHY a task was refused, not just
 * which id failed.
 */
export interface CapabilityRequirement {
  capabilityId: PlatformCapability;
  strength: CapabilityRequirementStrength;
  reason?: string;
}

export interface CapabilityAdmissionRejection {
  capabilityId: PlatformCapability;
  reason?: string;
  /** Which of the four layers withheld this capability — mirrors `EffectiveCapabilityDocument.deniedBy`. */
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

/**
 * Evaluate `requirements` against `document`. Returns `admitted: false` if
 * ANY `mandatory` requirement is missing from `document.granted` — a single
 * missing mandatory capability rejects the whole admission, regardless of
 * how many other requirements (mandatory or optional) are satisfied.
 * `optional` requirements never block admission: callers read
 * `grantedRequirementIds` (on success) or `document.granted` directly to
 * decide graceful degradation for the ones that were not satisfied.
 */
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
      // `reason` is genuinely optional (no "given but empty" state to preserve),
      // so an absent requirement reason omits the key rather than assigning
      // `undefined` — required under `exactOptionalPropertyTypes` and the
      // semantically honest choice here (present-with-undefined and absent
      // would mean the same thing to every reader of this type).
      ...(requirement.reason !== undefined ? { reason: requirement.reason } : {}),
      // Absent from `deniedBy` means no layer ever granted it (denied by all four implicitly).
      deniedByLayers: document.deniedBy[requirement.capabilityId] ?? CAPABILITY_LAYERS,
    });
  }

  if (rejected.length > 0) {
    return { admitted: false, code: 'mandatory_capability_unavailable', document, rejected };
  }

  // Every `mandatory` requirement is granted (checked above) by construction.
  // `optional` requirements are filtered against `document.granted` here so an
  // unmet optional requirement never appears in `grantedRequirementIds` —
  // "granted" must mean granted, not merely "requested and not blocking."
  return {
    admitted: true,
    document,
    grantedRequirementIds: requirements
      .map((requirement) => requirement.capabilityId)
      .filter((capabilityId) => grantedSet.has(capabilityId)),
  };
}
