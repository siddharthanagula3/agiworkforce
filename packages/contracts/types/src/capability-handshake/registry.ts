/**
 * Pure composition of the four capability layers into one
 * `EffectiveCapabilityDocument`. No I/O, no model-registry reads, no store
 * access, callers gather each layer's already-normalized `granted` set
 * (see `./types` module doc) and this function only intersects them.
 *
 * @module capability-handshake/registry
 */

import type { PlatformCapability } from '../capabilities';
import type { CapabilityDenialReason } from '../reason-codes';
import {
  CAPABILITY_LAYER_DENIAL_REASONS,
  CAPABILITY_LAYERS,
  type CapabilityLayer,
  type CapabilityLayerGrant,
  type CapabilityLimit,
  type EffectiveCapabilityDocument,
} from './types';

export function layerDenialReason(
  grant: CapabilityLayerGrant,
  capabilityId: PlatformCapability,
): CapabilityDenialReason {
  return (
    grant.denialReasons?.[capabilityId] ??
    grant.denialReason ??
    CAPABILITY_LAYER_DENIAL_REASONS[grant.layer]
  );
}

export interface BuildEffectiveCapabilityDocumentInput {
  sessionId: string;
  version: string;
  computedAt?: string;
  layers: Readonly<Record<CapabilityLayer, CapabilityLayerGrant>>;
  limits?: readonly CapabilityLimit[];
}

export function buildEffectiveCapabilityDocument(
  input: BuildEffectiveCapabilityDocumentInput,
): EffectiveCapabilityDocument {
  const { layers } = input;

  const union = new Set<PlatformCapability>();
  for (const layer of CAPABILITY_LAYERS) {
    for (const capabilityId of layers[layer].granted) union.add(capabilityId);
  }

  const granted: PlatformCapability[] = [];
  const deniedBy: Partial<Record<PlatformCapability, CapabilityLayer[]>> = {};
  const denialReasons: Partial<Record<PlatformCapability, CapabilityDenialReason>> = {};

  for (const capabilityId of union) {
    const missingLayers = CAPABILITY_LAYERS.filter(
      (layer) => !layers[layer].granted.has(capabilityId),
    );
    if (missingLayers.length === 0) {
      granted.push(capabilityId);
    } else {
      deniedBy[capabilityId] = missingLayers;
      denialReasons[capabilityId] = layerDenialReason(layers[missingLayers[0]!], capabilityId);
    }
  }

  const sources = Object.fromEntries(
    CAPABILITY_LAYERS.map((layer) => [layer, layers[layer].sourceId]),
  ) as Readonly<Record<CapabilityLayer, string>>;

  return {
    sessionId: input.sessionId,
    version: input.version,
    computedAt: input.computedAt ?? new Date().toISOString(),
    sources,
    granted,
    deniedBy,
    denialReasons,
    limits: [...(input.limits ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
