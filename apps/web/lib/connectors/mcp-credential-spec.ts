import 'server-only';

import {
  Client,
  discoverOAuthProtectedResourceMetadata,
  StreamableHTTPClientTransport,
  type FetchLike,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import { createDeadline, guardedFetch, type Deadline } from '@/lib/url-fetch/guarded-fetch';
import { AUTHORIZATION_HEADER_NAME, BEARER_VALUE_PREFIX } from '@/lib/custom-connector-crypto';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import { mcpOAuthFetch } from '@/lib/connectors/mcp-oauth-fetch';
import {
  MCP_REGISTRY_BASE_URL,
  type RegistryEntry,
} from '@/lib/connectors/directory/registry-client';
import type { DirectoryConnectTarget } from '@/lib/connectors/mcp-directory-targets';

export type CredentialPlacement = 'header' | 'body' | 'query';
export type CredentialSpecSource = 'registry' | 'discovery' | 'challenge' | 'default';

export interface ConnectorCredentialSpec {
  readonly headerName: string;
  readonly valuePrefix: string;
  readonly placement: CredentialPlacement;
  readonly source: CredentialSpecSource;
  readonly description: string | null;
}

const REGISTRY_ENTRY_CACHE_METHOD = 'connectors.directory.registry-entry';
const REGISTRY_ENTRY_TTL_MS = 24 * 60 * 60 * 1_000;
const REGISTRY_SERVERS_PATH = '/v0/servers';
const REGISTRY_LATEST_VERSION_PATH = 'versions/latest';
const MCP_REGISTRY_SOURCE = 'mcp-registry';
const PROBE_TIMEOUT_MS = 5_000;
const HEADER_PLACEMENT: CredentialPlacement = 'header';
const KNOWN_PLACEMENTS: ReadonlySet<CredentialPlacement> = new Set(['header', 'body', 'query']);
const WWW_AUTHENTICATE_HEADER = 'www-authenticate';
const CHALLENGE_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const SCHEME_IN_DESCRIPTION_RE = /\b(Bearer|Basic|Token)\b/i;
const CHALLENGE_SCHEME_RE = /^([A-Za-z][A-Za-z0-9._~+/-]*)/;
const PROBE_CLIENT_NAME = 'AGI Workforce';
const PROBE_CLIENT_VERSION = '0';
const PROBE_VERSION_NEGOTIATION = { mode: 'auto' } as const;
const JSON_MEDIA_TYPE = 'application/json';

const registryEntryCache = new NeonMcpResponseCacheStore();

function registryEntryKey(recordId: string) {
  return { method: REGISTRY_ENTRY_CACHE_METHOD, params: recordId, partition: '' };
}

export function registryEntryUrl(recordId: string): string {
  return `${MCP_REGISTRY_BASE_URL}${REGISTRY_SERVERS_PATH}/${encodeURIComponent(recordId)}/${REGISTRY_LATEST_VERSION_PATH}`;
}

async function fetchRegistryEntry(recordId: string): Promise<RegistryEntry | null> {
  const key = registryEntryKey(recordId);
  const cached = await registryEntryCache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached.value) as RegistryEntry;
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch(registryEntryUrl(recordId), {
      headers: { Accept: JSON_MEDIA_TYPE },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const entry = (await response.json()) as RegistryEntry;
    await registryEntryCache.set(key, {
      value: JSON.stringify(entry),
      expiresAt: Date.now() + REGISTRY_ENTRY_TTL_MS,
      scope: 'public',
    });
    return entry;
  } catch (error) {
    logger.warn(
      { recordId, error: error instanceof Error ? error.message : String(error) },
      '[mcp-credential-spec] registry entry unavailable',
    );
    return null;
  }
}

function prefixForHeader(headerName: string, description: string | null): string {
  if (headerName.toLowerCase() !== AUTHORIZATION_HEADER_NAME.toLowerCase()) return '';
  const scheme = description ? SCHEME_IN_DESCRIPTION_RE.exec(description)?.[1] : null;
  return scheme
    ? `${scheme.charAt(0).toUpperCase()}${scheme.slice(1).toLowerCase()} `
    : BEARER_VALUE_PREFIX;
}

function registryHeaderSpec(
  entry: RegistryEntry | null,
  mcpUrl: string,
): Omit<ConnectorCredentialSpec, 'placement'> | null {
  const remotes = entry?.server.remotes ?? [];
  const remote =
    remotes.find((candidate) => candidate.url === mcpUrl && (candidate.headers?.length ?? 0) > 0) ??
    remotes.find((candidate) => (candidate.headers?.length ?? 0) > 0);
  const headers = remote?.headers ?? [];
  const header = headers.find((candidate) => candidate.isSecret === true) ?? headers[0];
  if (!header) return null;
  const description = header.description ?? null;
  return {
    headerName: header.name,
    valuePrefix: prefixForHeader(header.name, description),
    source: 'registry',
    description,
  };
}

async function discoveredPlacement(mcpUrl: string): Promise<CredentialPlacement | null> {
  try {
    const metadata = await Promise.race([
      discoverOAuthProtectedResourceMetadata(mcpUrl, undefined, mcpOAuthFetch),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), PROBE_TIMEOUT_MS)),
    ]);
    const methods = metadata?.bearer_methods_supported ?? [];
    if (methods.includes(HEADER_PLACEMENT)) return HEADER_PLACEMENT;
    const declared = methods.find((method): method is CredentialPlacement =>
      KNOWN_PLACEMENTS.has(method as CredentialPlacement),
    );
    return declared ?? null;
  } catch {
    return null;
  }
}

export function parseChallengeScheme(wwwAuthenticate: string | null): string | null {
  if (!wwwAuthenticate) return null;
  const match = CHALLENGE_SCHEME_RE.exec(wwwAuthenticate.trim());
  return match?.[1] ?? null;
}

function challengeRecordingFetch(
  deadline: Deadline,
  record: (wwwAuthenticate: string | null) => void,
): FetchLike {
  return async (input, init) => {
    const outcome = await guardedFetch(new URL(input), {
      deadline,
      maxRedirects: 0,
      method: init?.method === 'POST' ? 'POST' : 'GET',
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    if (!outcome.ok) throw new Error(outcome.detail);
    if (outcome.kind !== 'response')
      throw new Error('The server answered the probe with a redirect.');
    if (CHALLENGE_STATUSES.has(outcome.response.status)) {
      record(outcome.response.headers.get(WWW_AUTHENTICATE_HEADER));
    }
    return outcome.response;
  };
}

async function challengeScheme(mcpUrl: string): Promise<string | null> {
  const deadline = createDeadline(PROBE_TIMEOUT_MS);
  let challenge: string | null = null;
  const client = new Client(
    { name: PROBE_CLIENT_NAME, version: PROBE_CLIENT_VERSION },
    { versionNegotiation: PROBE_VERSION_NEGOTIATION },
  );
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    fetch: challengeRecordingFetch(deadline, (wwwAuthenticate) => {
      challenge ??= wwwAuthenticate;
    }),
  });
  try {
    await client.connect(transport);
  } catch (error) {
    logger.info(
      { error: error instanceof Error ? error.name : 'unknown' },
      '[mcp-credential-spec] probe connection refused, reading its challenge',
    );
  } finally {
    await client.close().catch(() => undefined);
    deadline.release();
  }
  return parseChallengeScheme(challenge);
}

export async function resolveConnectorCredentialSpec(
  target: DirectoryConnectTarget,
): Promise<ConnectorCredentialSpec> {
  const [entry, placement] = await Promise.all([
    target.record.sourceRegistry === MCP_REGISTRY_SOURCE
      ? fetchRegistryEntry(target.connectorId)
      : Promise.resolve(null),
    discoveredPlacement(target.mcpUrl),
  ]);

  const fromRegistry = registryHeaderSpec(entry, target.mcpUrl);
  if (fromRegistry) return { ...fromRegistry, placement: placement ?? HEADER_PLACEMENT };

  const scheme = await challengeScheme(target.mcpUrl);
  if (scheme) {
    return {
      headerName: AUTHORIZATION_HEADER_NAME,
      valuePrefix: `${scheme} `,
      placement: placement ?? HEADER_PLACEMENT,
      source: 'challenge',
      description: null,
    };
  }

  return {
    headerName: AUTHORIZATION_HEADER_NAME,
    valuePrefix: BEARER_VALUE_PREFIX,
    placement: placement ?? HEADER_PLACEMENT,
    source: placement ? 'discovery' : 'default',
    description: null,
  };
}
