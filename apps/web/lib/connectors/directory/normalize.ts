import { GITHUB_NAMESPACE_PREFIX, deriveRegistryBadge } from '@/lib/connectors/directory/badge';
import { brandSlugForPublisher } from '@/lib/connectors/directory/brand-icons';
import { deriveDirectoryCategories } from '@/lib/connectors/directory/categorize';
import { deriveMonogram } from '@/lib/connectors/directory/monogram';
import type {
  RegistryEntry,
  RegistryRemote,
  RegistryRepository,
} from '@/lib/connectors/directory/registry-client';
import type {
  DirectoryAuthMode,
  DirectoryConnectableMode,
  DirectoryIconSource,
  DirectoryRecord,
  DirectoryRemote,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

const REMOTE_TRANSPORT_PRIORITY: readonly DirectoryTransport[] = [
  'streamable-http',
  'sse',
  'stdio',
];
const GITHUB_REPOSITORY_SOURCE = 'github';

export function derivePublisherFromNamespace(name: string): string {
  const namespace = name.split('/')[0] ?? name;
  if (namespace.startsWith(GITHUB_NAMESPACE_PREFIX)) {
    return namespace.slice(GITHUB_NAMESPACE_PREFIX.length);
  }
  const segments = namespace.split('.');
  return segments.length > 1 ? [...segments].reverse().join('.') : namespace;
}

function pickPrimaryRemote(remotes: readonly RegistryRemote[]): RegistryRemote | null {
  for (const transport of REMOTE_TRANSPORT_PRIORITY) {
    const found = remotes.find((remote) => remote.type === transport && remote.url);
    if (found) return found;
  }
  return remotes.find((remote) => remote.url) ?? null;
}

function hasSecretHeader(remote: RegistryRemote | null): boolean {
  return (remote?.headers ?? []).some((header) => header.isSecret === true);
}

function deriveAuthorUrl(repository: RegistryRepository | undefined): string | null {
  if (repository?.source !== GITHUB_REPOSITORY_SOURCE) return null;
  try {
    const owner = new URL(repository.url).pathname.split('/').filter(Boolean)[0];
    return owner ? `https://github.com/${owner}` : null;
  } catch {
    return null;
  }
}

function deriveIconSource(
  brandSlug: string | null,
  hasRegistryIcon: boolean,
  hasWebsite: boolean,
): DirectoryIconSource {
  if (brandSlug) return 'brand';
  if (hasRegistryIcon) return 'registry';
  if (hasWebsite) return 'site';
  return 'monogram';
}

export function normalizeRegistryEntry(entry: RegistryEntry): DirectoryRecord | null {
  const server = entry.server;
  const remotes = server.remotes ?? [];
  const packageCount = server.packages?.length ?? 0;
  const hasPackagesOnly = remotes.length === 0 && packageCount > 0;
  if (remotes.length === 0 && !hasPackagesOnly) return null;

  const primary = pickPrimaryRemote(remotes);
  const directoryRemotes: DirectoryRemote[] = remotes
    .filter((remote): remote is RegistryRemote & { url: string } => Boolean(remote.url))
    .map((remote) => ({ url: remote.url, transport: remote.type }));

  let authMode: DirectoryAuthMode;
  let connectable: DirectoryConnectableMode;
  if (hasPackagesOnly) {
    authMode = 'none';
    connectable = 'desktop-and-cli';
  } else if (hasSecretHeader(primary)) {
    authMode = 'api-key';
    connectable = 'api-key-form';
  } else {
    authMode = 'unknown';
    connectable = 'needs-setup';
  }

  const displayName = server.title ?? server.name;
  const publisher = derivePublisherFromNamespace(server.name);
  const websiteUrl = server.websiteUrl ?? null;
  const registryIconUrl = server.icons?.[0]?.src ?? null;
  const brandSlug = brandSlugForPublisher(publisher);

  return {
    id: server.name,
    name: displayName,
    publisher,
    description: server.description,
    categories: deriveDirectoryCategories(server.description, server.title),
    remotes: directoryRemotes,
    authMode,
    connectable,
    toolNames: [],
    repositoryUrl: server.repository?.url ?? null,
    version: server.version,
    sourceRegistry: 'mcp-registry',
    badge: deriveRegistryBadge(server.name),
    iconUrl: registryIconUrl,
    monogram: deriveMonogram(displayName),
    documentationUrl: null,
    iconSource: deriveIconSource(brandSlug, registryIconUrl !== null, websiteUrl !== null),
    brandSlug,
    authorName: publisher,
    authorUrl: deriveAuthorUrl(server.repository),
    websiteUrl,
    supportUrl: null,
    privacyPolicyUrl: null,
  };
}
