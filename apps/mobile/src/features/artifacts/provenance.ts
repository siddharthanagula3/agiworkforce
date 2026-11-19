import type { MobileArtifactProvenance } from './types';

export function normalizedCloudOwnerId(ownerId: unknown): string | null {
  return typeof ownerId === 'string' && ownerId.trim().length > 0 ? ownerId.trim() : null;
}

export function normalizedArtifactProvenance(value: unknown): MobileArtifactProvenance | null {
  if (!value || typeof value !== 'object') return null;
  const provenance = value as Record<string, unknown>;
  if (provenance.scope === 'local') return { scope: 'local' };
  const ownerId = normalizedCloudOwnerId(provenance.ownerId);
  return provenance.scope === 'cloud' && ownerId ? { scope: 'cloud', ownerId } : null;
}
