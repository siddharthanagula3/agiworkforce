import 'server-only';

export const MCP_REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';
const MCP_REGISTRY_SERVERS_PATH = '/v0/servers';
export const MCP_REGISTRY_PAGE_LIMIT = 100;
const MCP_REGISTRY_OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official' as const;
const MCP_REGISTRY_ACTIVE_STATUS = 'active';

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

export interface RegistryServer {
  readonly name: string;
  readonly description: string;
  readonly title?: string;
  readonly version: string;
  readonly remotes?: readonly RegistryRemote[];
  readonly packages?: readonly unknown[];
  readonly repository?: RegistryRepository;
  readonly websiteUrl?: string;
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

export async function fetchRegistryPage(
  cursor: string | null,
  fetchImpl: RegistryFetch = fetch,
): Promise<RegistryPage> {
  const url = new URL(MCP_REGISTRY_SERVERS_PATH, MCP_REGISTRY_BASE_URL);
  url.searchParams.set('limit', String(MCP_REGISTRY_PAGE_LIMIT));
  if (cursor) url.searchParams.set('cursor', cursor);

  const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new RegistryFetchError(
      response.status,
      `MCP registry request failed: ${response.status}`,
    );
  }
  return (await response.json()) as RegistryPage;
}

export function isLatestActiveEntry(entry: RegistryEntry): boolean {
  const official = entry._meta?.[MCP_REGISTRY_OFFICIAL_META_KEY];
  if (official?.isLatest !== true) return false;
  return official.status === undefined || official.status === MCP_REGISTRY_ACTIVE_STATUS;
}
