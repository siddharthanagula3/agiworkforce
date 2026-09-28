import { canonicalSourceUrl } from './search-provider';

export const EXTERNAL_RESOURCE_KINDS = [
  'repository',
  'web_page',
  'mcp_server',
  'connector_item',
] as const;
export type ExternalResourceKind = (typeof EXTERNAL_RESOURCE_KINDS)[number];

export const EXTERNAL_RESOURCE_ACCESS_MODES = ['public', 'connector'] as const;
export type ExternalResourceAccess = (typeof EXTERNAL_RESOURCE_ACCESS_MODES)[number];

export const EXTERNAL_RESOURCE_VERSION_KINDS = [
  'commit',
  'branch',
  'revision',
  'modified_at',
  'content_hash',
] as const;
export type ExternalResourceVersionKind = (typeof EXTERNAL_RESOURCE_VERSION_KINDS)[number];

export const EXTERNAL_RESOURCE_LIMITS = Object.freeze({
  uri: 2048,
  identityKey: 2048,
  externalId: 512,
  title: 500,
  version: 200,
  connectorId: 200,
  accountKey: 200,
});

export interface ExternalResourceVersion {
  kind: ExternalResourceVersionKind;
  value: string;
}

export interface ExternalResourceReferenceInput {
  kind: ExternalResourceKind;
  provider: string;
  uri: string;
  externalId?: string | null;
  title?: string | null;
  version?: ExternalResourceVersion | null;
  access: ExternalResourceAccess;
  connectorId?: string | null;
  accountKey?: string | null;
}

export interface NormalizedExternalResourceReference {
  kind: ExternalResourceKind;
  provider: string;
  identityKey: string;
  uri: string;
  externalId: string | null;
  title: string | null;
  version: ExternalResourceVersion | null;
  access: ExternalResourceAccess;
  connectorId: string | null;
  accountKey: string | null;
}

export interface ExternalResourceReference extends NormalizedExternalResourceReference {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RepositoryLocation {
  host: string;
  path: string;
}

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SCP_REPOSITORY_PATTERN = /^git@([^:/\s]+):([^\s]+?)(?:\.git)?\/?$/i;
const TWO_SEGMENT_HOSTS = new Set(['github.com', 'bitbucket.org']);

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function repositoryPath(host: string, segments: readonly string[]): string | null {
  const cleaned = segments.map((segment) => segment.trim()).filter(Boolean);
  const kept = TWO_SEGMENT_HOSTS.has(host) ? cleaned.slice(0, 2) : cleaned;
  if (kept.length < 2) return null;
  const last = kept[kept.length - 1]!.replace(/\.git$/i, '');
  if (!last) return null;
  return [...kept.slice(0, -1), last].join('/');
}

export function parseRepositoryUrl(value: string): RepositoryLocation | null {
  const trimmed = value.trim();
  const scp = SCP_REPOSITORY_PATTERN.exec(trimmed);
  if (scp) {
    const host = scp[1]!.toLowerCase();
    const path = repositoryPath(host, scp[2]!.split('/'));
    return path ? { host, path } : null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!['https:', 'http:', 'ssh:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = repositoryPath(host, parsed.pathname.split('/'));
  return path ? { host, path } : null;
}

function canonicalServerKey(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : '';
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
}

export function externalResourceIdentityKey(
  input: Pick<ExternalResourceReferenceInput, 'kind' | 'provider' | 'uri' | 'externalId'>,
): string | null {
  switch (input.kind) {
    case 'web_page': {
      const key = canonicalSourceUrl(input.uri);
      return key ? `web_page:${key}` : null;
    }
    case 'repository': {
      const location = parseRepositoryUrl(input.uri);
      return location ? `repository:${location.host}/${location.path.toLowerCase()}` : null;
    }
    case 'mcp_server': {
      const key = canonicalServerKey(input.uri);
      return key ? `mcp_server:${key}` : null;
    }
    case 'connector_item': {
      const externalId = trimmedOrNull(input.externalId);
      const provider = input.provider.trim().toLowerCase();
      return externalId ? `connector_item:${provider}:${externalId}` : null;
    }
  }
}

function canonicalUri(kind: ExternalResourceKind, uri: string): string | null {
  if (kind === 'repository') {
    const location = parseRepositoryUrl(uri);
    return location ? `https://${location.host}/${location.path}` : null;
  }
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export type ExternalResourceNormalization =
  { ok: true; reference: NormalizedExternalResourceReference } | { ok: false; reason: string };

function withinLimit(value: string | null, limit: number): boolean {
  return value === null || value.length <= limit;
}

export function normalizeExternalResourceReference(
  input: ExternalResourceReferenceInput,
): ExternalResourceNormalization {
  if (!(EXTERNAL_RESOURCE_KINDS as readonly string[]).includes(input.kind)) {
    return { ok: false, reason: 'unknown kind' };
  }
  const provider = input.provider.trim().toLowerCase();
  if (!PROVIDER_PATTERN.test(provider)) return { ok: false, reason: 'invalid provider' };
  if (!(EXTERNAL_RESOURCE_ACCESS_MODES as readonly string[]).includes(input.access)) {
    return { ok: false, reason: 'unknown access' };
  }
  const uri = canonicalUri(input.kind, input.uri);
  if (!uri || uri.length > EXTERNAL_RESOURCE_LIMITS.uri)
    return { ok: false, reason: 'invalid uri' };
  const identityKey = externalResourceIdentityKey({ ...input, provider });
  if (!identityKey || identityKey.length > EXTERNAL_RESOURCE_LIMITS.identityKey) {
    return { ok: false, reason: 'no identity' };
  }
  const externalId = trimmedOrNull(input.externalId);
  const connectorId = trimmedOrNull(input.connectorId);
  const accountKey = trimmedOrNull(input.accountKey);
  const versionValue = trimmedOrNull(input.version?.value);
  const version =
    input.version &&
    versionValue &&
    (EXTERNAL_RESOURCE_VERSION_KINDS as readonly string[]).includes(input.version.kind)
      ? { kind: input.version.kind, value: versionValue }
      : null;
  if (
    !withinLimit(externalId, EXTERNAL_RESOURCE_LIMITS.externalId) ||
    !withinLimit(connectorId, EXTERNAL_RESOURCE_LIMITS.connectorId) ||
    !withinLimit(accountKey, EXTERNAL_RESOURCE_LIMITS.accountKey) ||
    !withinLimit(version?.value ?? null, EXTERNAL_RESOURCE_LIMITS.version)
  ) {
    return { ok: false, reason: 'value too long' };
  }
  if (input.access === 'connector' && !connectorId) {
    return { ok: false, reason: 'connector access names no connector' };
  }
  return {
    ok: true,
    reference: {
      kind: input.kind,
      provider,
      identityKey,
      uri,
      externalId,
      title: trimmedOrNull(input.title)?.slice(0, EXTERNAL_RESOURCE_LIMITS.title) ?? null,
      version,
      access: input.access,
      connectorId,
      accountKey,
    },
  };
}
