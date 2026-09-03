import {
  CAPABILITY_LAYERS,
  type CapabilityDocumentRef,
  type CapabilityLayer,
  type CapabilityLayerGrant,
  type CapabilityLimit,
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
  limits?: readonly CapabilityLimit[];
}

export function computeCapabilityDocumentVersion(
  input: ComputeCapabilityDocumentVersionInput,
): string {
  const canonical = CAPABILITY_LAYERS.map((layer) => {
    const grant = input.layers[layer];
    const ids = [...grant.granted].sort().join(',');
    return `${layer}=${grant.sourceId}|${ids}`;
  }).join(';');
  // resetsAt is a per-account clock, not policy: hashing it would rewrite the
  // version on every request and defeat staleness detection.
  const canonicalLimits = [...(input.limits ?? [])]
    .map(
      (limit) =>
        `${limit.id}=${limit.limit ?? 'null'}:${limit.unit}:${limit.window}@${limit.policySource}`,
    )
    .sort()
    .join(';');
  return `${input.schemaVersion}#${contentHashHex(`${canonical}||${canonicalLimits}`)}`;
}

export function isCapabilityDocumentStale(
  ref: Pick<CapabilityDocumentRef, 'version'>,
  currentVersion: string,
): boolean {
  if (ref.version === CAPABILITY_DOCUMENT_VERSION_UNRESOLVED) return true;
  return ref.version !== currentVersion;
}
