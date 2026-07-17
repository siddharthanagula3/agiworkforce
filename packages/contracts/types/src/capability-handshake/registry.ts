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
  /** Monotonic per-session version/hash — caller-supplied so it can incorporate model/tier/settings versions. */
  version: string;
  /** Defaults to `new Date().toISOString()`. Pass explicitly in tests for determinism. */
  computedAt?: string;
  /** Exactly one grant per layer — the type system requires all four, matching "intersection of four layers," not a variable-length list. */
  layers: Readonly<Record<CapabilityLayer, CapabilityLayerGrant>>;
}

/**
 * Builds the server-authoritative `EffectiveCapabilityDocument` for a
 * session from its four layer grants. A capability is `granted` only when
 * EVERY layer's `granted` set contains it; a capability present in at least
 * one layer's set but not all four is recorded in `deniedBy` with the
 * layers that withheld it (fail-closed — see `./types` module doc).
 */
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
