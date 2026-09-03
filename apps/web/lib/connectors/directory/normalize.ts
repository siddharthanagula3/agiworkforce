import { deriveDirectoryCategories } from '@/lib/connectors/directory/categorize';
import type { RegistryEntry, RegistryRemote } from '@/lib/connectors/directory/registry-client';
import type {
  DirectoryAuthMode,
  DirectoryConnectableMode,
  DirectoryRecord,
  DirectoryRemote,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

const GITHUB_NAMESPACE_PREFIX = 'io.github.';
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

  return {
    id: server.name,
    name: server.title ?? server.name,
    publisher: derivePublisherFromNamespace(server.name),
    description: server.description,
    categories: deriveDirectoryCategories(server.description, server.title),
    remotes: directoryRemotes,
    authMode,
    connectable,
    toolNames: [],
    repositoryUrl: server.repository?.url ?? null,
    version: server.version,
    sourceRegistry: 'mcp-registry',
  };
}
