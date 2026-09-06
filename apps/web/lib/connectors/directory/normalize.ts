import { GITHUB_NAMESPACE_PREFIX, deriveRegistryBadge } from '@/lib/connectors/directory/badge';
import { brandSlugForSignals } from '@/lib/connectors/directory/brand-icons';
import { deriveDirectoryCategories } from '@/lib/connectors/directory/categorize';
import { deriveDisplayTitle } from '@/lib/connectors/directory/display-name';
import {
  hostnameOf,
  isCodeForgeHost,
  isHostingPlatformHost,
  originOf,
  repositoryOwnerOf,
  repositoryOwnerUrl,
} from '@/lib/connectors/directory/hosts';
import { deriveMonogram, deriveMonogramHue } from '@/lib/connectors/directory/monogram';
import { selectDescriptionSource, summarizeDescription } from '@/lib/connectors/directory/summary';
import type { RegistryEntry, RegistryRemote } from '@/lib/connectors/directory/registry-client';
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

function deriveIconSource(
  brandSlug: string | null,
  hasRegistryIcon: boolean,
  siteHost: string | null,
): DirectoryIconSource {
  if (brandSlug) return 'brand';
  if (hasRegistryIcon) return 'registry';
  if (siteHost && !isCodeForgeHost(siteHost) && !isHostingPlatformHost(siteHost)) return 'site';
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
  const remoteHosts = directoryRemotes
    .map((remote) => hostnameOf(remote.url))
    .filter((host): host is string => host !== null);

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

  const title = deriveDisplayTitle(server.name, server.title);
  const displayName = title.name;
  const publisher = derivePublisherFromNamespace(server.name);
  const repositoryUrl = server.repository?.url ?? null;
  const repositoryOwner = repositoryUrl ? repositoryOwnerOf(repositoryUrl) : null;
  const primaryRemoteOrigin = primary?.url ? originOf(primary.url) : null;
  const websiteUrl = server.websiteUrl ?? primaryRemoteOrigin ?? repositoryUrl;
  const websiteHost = websiteUrl ? hostnameOf(websiteUrl) : null;
  const signalHosts = [
    ...remoteHosts,
    ...(websiteHost && !isCodeForgeHost(websiteHost) ? [websiteHost] : []),
  ];
  const registryIconUrl = server.icons?.[0]?.src ?? null;
  const brandSlug = brandSlugForSignals({ publisher, hosts: signalHosts, repositoryOwner });
  const categories = deriveDirectoryCategories({
    name: displayName,
    description: `${server.description} ${title.tagline}`,
    id: server.name,
    hosts: signalHosts,
  });
  const primaryCategory = categories[0] ?? '';
  const descriptionSource = selectDescriptionSource(server.description, displayName, title.tagline);

  return {
    id: server.name,
    name: displayName,
    publisher,
    description: summarizeDescription(descriptionSource, displayName, primaryCategory),
    categories,
    remotes: directoryRemotes,
    authMode,
    connectable,
    toolNames: [],
    repositoryUrl,
    version: server.version,
    sourceRegistry: 'mcp-registry',
    badge: deriveRegistryBadge({ registryName: server.name, remoteHosts }),
    iconUrl: registryIconUrl,
    monogram: deriveMonogram(displayName),
    monogramHue: deriveMonogramHue(categories),
    documentationUrl: null,
    iconSource: deriveIconSource(brandSlug, registryIconUrl !== null, websiteHost),
    brandSlug,
    authorName: repositoryOwner ?? publisher,
    authorUrl: repositoryUrl ? repositoryOwnerUrl(repositoryUrl) : null,
    websiteUrl,
    supportUrl: null,
    privacyPolicyUrl: null,
  };
}
