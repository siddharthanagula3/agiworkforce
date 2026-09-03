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
