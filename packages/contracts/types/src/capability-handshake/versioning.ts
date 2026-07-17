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

/**
 * Sentinel version for a session labeled BEFORE any capability handshake was
 * computed for it (an honest placeholder reference, not a fabricated grant).
 * Always reported stale by `isCapabilityDocumentStale`.
 */
export const CAPABILITY_DOCUMENT_VERSION_UNRESOLVED = 'unresolved';

/**
 * Two independently-seeded FNV-1a 32-bit passes over UTF-16 code units,
 * concatenated to 16 hex chars. Chosen because it is dependency-free,
 * avoids BigInt (consumers compile this package under pre-ES2020 targets),
 * is deterministic across every JS runtime this repo targets (web
 * edge/node, desktop webview, RN), and is collision-resistant enough for a
 * staleness token — this is a change detector, not a security digest; do
 * not use it for integrity or auth.
 */
function fnv1a32Hex(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function contentHashHex(value: string): string {
  // Standard FNV offset basis, plus a second distinct seed for the tail half.
  return fnv1a32Hex(value, 0x811c9dc5) + fnv1a32Hex(value, 0x7ee36d51);
}

export interface ComputeCapabilityDocumentVersionInput {
  /**
   * Caller's layer-composition schema tag (e.g. web's
   * `me-handshake-v1`). Bump it when the RULES that produce the layer
   * grants change; the content hash below covers the input DATA.
   */
  schemaVersion: string;
  /** The same four layer grants passed to `buildEffectiveCapabilityDocument`. */
  layers: Readonly<Record<CapabilityLayer, CapabilityLayerGrant>>;
}

/**
 * Deterministic content version for an `EffectiveCapabilityDocument`, of the
 * form `<schemaVersion>#<fnv1a64-hex>`. Layer order and grant-set iteration
 * order do not affect the result (layers are visited in the canonical
 * `CAPABILITY_LAYERS` order; grant ids are sorted).
 */
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

/**
 * True when `ref` (a session's stored capability-document reference — see
 * `../sessions` `SessionPolicySnapshot`) no longer matches the freshly
 * computed `currentVersion` and the session must re-handshake before its
 * next capability-gated action. An `unresolved` reference is always stale.
 */
export function isCapabilityDocumentStale(
  ref: Pick<CapabilityDocumentRef, 'version'>,
  currentVersion: string,
): boolean {
  if (ref.version === CAPABILITY_DOCUMENT_VERSION_UNRESOLVED) return true;
  return ref.version !== currentVersion;
}
