import 'server-only';

export const MCP_REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';
const MCP_REGISTRY_SERVERS_PATH = '/v0/servers';
export const MCP_REGISTRY_PAGE_LIMIT = 100;
export const MCP_REGISTRY_LATEST_VERSION_FILTER = 'latest';
const MCP_REGISTRY_OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official' as const;
export const MCP_REGISTRY_ACTIVE_STATUS = 'active';
export const MCP_REGISTRY_DELETED_STATUS = 'deleted';

export interface RegistryKeyValueInput {
  readonly name: string;
  readonly value?: string;
  readonly isSecret?: boolean;
  readonly isRequired?: boolean;
  readonly description?: string;
}

export interface RegistryRemote {
  readonly type: 'streamable-http' | 'sse' | 'stdio';
  readonly url?: string;
  readonly headers?: readonly RegistryKeyValueInput[];
}

export interface RegistryRepository {
  readonly url: string;
  readonly source: string;
}

export interface RegistryIcon {
  readonly src: string;
  readonly mimeType?: string;
}

export interface RegistryServer {
  readonly name: string;
  readonly description: string;
  readonly title?: string;
  readonly version: string;
  readonly remotes?: readonly RegistryRemote[];
  readonly packages?: readonly unknown[];
  readonly repository?: RegistryRepository;
  readonly websiteUrl?: string;
  readonly icons?: readonly RegistryIcon[];
}

export interface RegistryOfficialMeta {
  readonly status?: string;
  readonly isLatest?: boolean;
}

export interface RegistryEntry {
  readonly server: RegistryServer;
  readonly _meta?: Partial<Record<typeof MCP_REGISTRY_OFFICIAL_META_KEY, RegistryOfficialMeta>>;
}

export interface RegistryPage {
  readonly servers: readonly RegistryEntry[];
  readonly metadata: { readonly count: number; readonly nextCursor?: string };
}

export type RegistryFetch = typeof fetch;

export class RegistryFetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RegistryFetchError';
  }
}

export interface FetchRegistryPageOptions {
  readonly cursor?: string | null;
  readonly updatedSince?: string | null;
}

export async function fetchRegistryPage(
  options: FetchRegistryPageOptions,
  fetchImpl: RegistryFetch = fetch,
): Promise<RegistryPage> {
  const url = new URL(MCP_REGISTRY_SERVERS_PATH, MCP_REGISTRY_BASE_URL);
  url.searchParams.set('limit', String(MCP_REGISTRY_PAGE_LIMIT));
  url.searchParams.set('version', MCP_REGISTRY_LATEST_VERSION_FILTER);
  if (options.cursor) url.searchParams.set('cursor', options.cursor);
  if (options.updatedSince) url.searchParams.set('updated_since', options.updatedSince);

  const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new RegistryFetchError(
      response.status,
      `MCP registry request failed: ${response.status}`,
    );
  }
  return (await response.json()) as RegistryPage;
}

export function isLatestEntry(entry: RegistryEntry): boolean {
  return entry._meta?.[MCP_REGISTRY_OFFICIAL_META_KEY]?.isLatest === true;
}

export function registryEntryStatus(entry: RegistryEntry): string | undefined {
  return entry._meta?.[MCP_REGISTRY_OFFICIAL_META_KEY]?.status;
}

export function isLatestActiveEntry(entry: RegistryEntry): boolean {
  if (!isLatestEntry(entry)) return false;
  const status = registryEntryStatus(entry);
  return status === undefined || status === MCP_REGISTRY_ACTIVE_STATUS;
}

export function isDeletedEntry(entry: RegistryEntry): boolean {
  return registryEntryStatus(entry) === MCP_REGISTRY_DELETED_STATUS;
}
