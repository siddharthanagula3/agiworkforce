import type { DraftProvenance } from './draftStore';

export function draftIdentityKey(
  draftKey: string | undefined,
  provenance: DraftProvenance | undefined,
): string {
  return provenance?.scope === 'cloud'
    ? `${draftKey ?? ''}:cloud:${provenance.ownerId}`
    : `${draftKey ?? ''}:${provenance?.scope ?? 'unowned'}`;
}
