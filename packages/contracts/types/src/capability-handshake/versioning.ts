/**
 * Real per-session capability-document versioning (W5 tail; replaces the
 * explicit placeholder versions the first stage-2 consumers shipped with).
 *
 * The contract (`./types` `CapabilityDocumentRef.version`): "Monotonic
 * per-session version/hash. Bump on any input-layer change (model switch,
 * tier change, settings edit) so stale snapshots are detectable, never
 * silently reused." This module implements the HASH form of that contract:
 * a deterministic content hash over the four layer grants, so
 *   - recomputing with identical inputs yields the identical version
 *     (idempotent — no storage or counter needed), and
 *   - ANY input-layer change (a layer's `sourceId` or its grant set)
 *     changes the version, which is exactly the "bump on any input-layer
 *     change" requirement.
 * A caller-visible schema tag prefixes the hash so a change to the
 * layer-composition RULES (not just the inputs) also invalidates old
 * versions.
 *
 * Staleness is a pure string comparison plus one sentinel: sessions labeled
 * before any handshake was computed carry
 * `CAPABILITY_DOCUMENT_VERSION_UNRESOLVED` (see web
 * `chat-session-label-service.ts`), and an unresolved reference is ALWAYS
 * stale — "never silently reused" applies doubly to a snapshot that was
 * never resolved at all (fail-closed, matching this module's posture).
 *
 * @module capability-handshake/versioning
 */

import {
  CAPABILITY_LAYERS,
  type CapabilityDocumentRef,
  type CapabilityLayer,
  type CapabilityLayerGrant,
} from './types';

export const CAPABILITY_DOCUMENT_VERSION_UNRESOLVED = 'unresolved';

function fnv1a32Hex(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function contentHashHex(value: string): string {
  return fnv1a32Hex(value, 0x811c9dc5) + fnv1a32Hex(value, 0x7ee36d51);
}

export interface ComputeCapabilityDocumentVersionInput {
  schemaVersion: string;
  layers: Readonly<Record<CapabilityLayer, CapabilityLayerGrant>>;
}

export function computeCapabilityDocumentVersion(
  input: ComputeCapabilityDocumentVersionInput,
): string {
  const canonical = CAPABILITY_LAYERS.map((layer) => {
    const grant = input.layers[layer];
    const ids = [...grant.granted].sort().join(',');
    return `${layer}=${grant.sourceId}|${ids}`;
  }).join(';');
  return `${input.schemaVersion}#${contentHashHex(canonical)}`;
}

export function isCapabilityDocumentStale(
  ref: Pick<CapabilityDocumentRef, 'version'>,
  currentVersion: string,
): boolean {
  if (ref.version === CAPABILITY_DOCUMENT_VERSION_UNRESOLVED) return true;
  return ref.version !== currentVersion;
}
