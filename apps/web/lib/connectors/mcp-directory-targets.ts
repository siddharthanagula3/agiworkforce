import 'server-only';

import { createHash } from 'node:crypto';

import { isKnownConnectorId } from '@/lib/connectors/catalog';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { resolveAuthModeForRecord } from '@/lib/connectors/directory/auth-probe';
import { getSnapshotRecords } from '@/lib/connectors/directory/memory-cache';
import type {
  DirectoryAuthMode,
  DirectoryRecord,
  DirectoryRemote,
} from '@/lib/connectors/directory/types';

export const DIRECTORY_SERVER_ID_PREFIX = 'dir-';
const SERVER_ID_DIGEST_LENGTH = 12;
const SERVER_ID_DIGEST_ALGORITHM = 'sha256';

export type DirectoryNetworkTransport = 'streamable-http' | 'sse';

const NETWORK_TRANSPORTS: ReadonlySet<DirectoryRemote['transport']> = new Set<
  DirectoryRemote['transport']
>(['streamable-http', 'sse']);

export interface DirectoryConnectTarget {
  readonly record: DirectoryRecord;
  readonly connectorId: string;
  readonly serverId: string;
  readonly mcpUrl: string;
  readonly transport: DirectoryNetworkTransport;
  readonly name: string;
  readonly documentationUrl: string | null;
}

export function directoryServerId(recordId: string): string {
  const digest = createHash(SERVER_ID_DIGEST_ALGORITHM)
    .update(recordId)
    .digest('hex')
    .slice(0, SERVER_ID_DIGEST_LENGTH);
  return `${DIRECTORY_SERVER_ID_PREFIX}${digest}`;
}

export function isDirectoryServerId(ref: string): boolean {
  return ref.startsWith(DIRECTORY_SERVER_ID_PREFIX);
}

export function isCuratedConnectorId(connectorId: string): boolean {
  return isKnownConnectorId(connectorId) || getMcpEndpoint(connectorId) !== null;
}

export function normalizeRemoteUrl(url: string): string | null {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function networkRemote(record: DirectoryRecord): DirectoryRemote | null {
  return record.remotes.find((remote) => NETWORK_TRANSPORTS.has(remote.transport)) ?? null;
}

export function directoryTargetFor(record: DirectoryRecord): DirectoryConnectTarget | null {
  if (isCuratedConnectorId(record.id)) return null;
  const remote = networkRemote(record);
  if (!remote) return null;
  return {
    record,
    connectorId: record.id,
    serverId: directoryServerId(record.id),
    mcpUrl: remote.url,
    transport: remote.transport as DirectoryNetworkTransport,
    name: record.name,
    documentationUrl: record.documentationUrl,
  };
}

interface DirectoryIndex {
  readonly byId: ReadonlyMap<string, DirectoryRecord>;
  readonly byServerId: ReadonlyMap<string, DirectoryRecord>;
  readonly byRemoteUrl: ReadonlyMap<string, DirectoryRecord>;
}

const indexCache = new WeakMap<readonly DirectoryRecord[], DirectoryIndex>();

function buildIndex(records: readonly DirectoryRecord[]): DirectoryIndex {
  const byId = new Map<string, DirectoryRecord>();
  const byServerId = new Map<string, DirectoryRecord>();
  const byRemoteUrl = new Map<string, DirectoryRecord>();
  for (const record of records) {
    byId.set(record.id, record);
    byServerId.set(directoryServerId(record.id), record);
    if (isCuratedConnectorId(record.id)) continue;
    for (const remote of record.remotes) {
      if (!NETWORK_TRANSPORTS.has(remote.transport)) continue;
      const normalized = normalizeRemoteUrl(remote.url);
      if (normalized && !byRemoteUrl.has(normalized)) byRemoteUrl.set(normalized, record);
    }
  }
  return { byId, byServerId, byRemoteUrl };
}

async function loadIndex(): Promise<DirectoryIndex> {
  const records = await getSnapshotRecords();
  let index = indexCache.get(records);
  if (!index) {
    index = buildIndex(records);
    indexCache.set(records, index);
  }
  return index;
}

export async function resolveDirectoryTarget(ref: string): Promise<DirectoryConnectTarget | null> {
  if (!ref || isCuratedConnectorId(ref)) return null;
  const index = await loadIndex();
  const record = isDirectoryServerId(ref) ? index.byServerId.get(ref) : index.byId.get(ref);
  return record ? directoryTargetFor(record) : null;
}

export async function findDirectoryTargetByRemoteUrl(
  url: string,
): Promise<DirectoryConnectTarget | null> {
  const normalized = normalizeRemoteUrl(url);
  if (!normalized) return null;
  const record = (await loadIndex()).byRemoteUrl.get(normalized);
  return record ? directoryTargetFor(record) : null;
}

export async function resolveDirectoryConnectAuthMode(
  target: DirectoryConnectTarget,
): Promise<DirectoryAuthMode> {
  if (target.record.authMode !== 'unknown') return target.record.authMode;
  return (await resolveAuthModeForRecord(target.record)).authMode;
}
