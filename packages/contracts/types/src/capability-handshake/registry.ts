/**
 * Pure composition of the four capability layers into one
 * `EffectiveCapabilityDocument`. No I/O, no model-registry reads, no store
 * access — callers gather each layer's already-normalized `granted` set
 * (see `./types` module doc) and this function only intersects them.
 *
 * @module capability-handshake/registry
 */

import type { PlatformCapability } from '../capabilities';
import {
  CAPABILITY_LAYERS,
  type CapabilityLayer,
  type CapabilityLayerGrant,
  type EffectiveCapabilityDocument,
} from './types';

export interface BuildEffectiveCapabilityDocumentInput {
  sessionId: string;
  version: string;
  computedAt?: string;
  layers: Readonly<Record<CapabilityLayer, CapabilityLayerGrant>>;
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

  for (const capabilityId of union) {
    const missingLayers = CAPABILITY_LAYERS.filter(
      (layer) => !layers[layer].granted.has(capabilityId),
    );
    if (missingLayers.length === 0) {
      granted.push(capabilityId);
    } else {
      deniedBy[capabilityId] = missingLayers;
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
  };
}
