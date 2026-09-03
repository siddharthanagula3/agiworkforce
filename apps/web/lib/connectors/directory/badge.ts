import type { DirectoryBadge } from '@/lib/connectors/directory/types';

export const GITHUB_NAMESPACE_PREFIX = 'io.github.';

const INTERNAL_BADGE: DirectoryBadge = 'first-party';
const GITHUB_VERIFIED_BADGE: DirectoryBadge = 'registry';
const UNVERIFIED_BADGE: DirectoryBadge = 'community';

export function deriveInternalBadge(): DirectoryBadge {
  return INTERNAL_BADGE;
}

export function deriveRegistryBadge(registryName: string): DirectoryBadge {
  return registryName.startsWith(GITHUB_NAMESPACE_PREFIX)
    ? GITHUB_VERIFIED_BADGE
    : UNVERIFIED_BADGE;
}
