import 'server-only';

import { CONNECTORS } from '@/features/connectors/data/connectors';
import {
  allowsPresentTenseCopy,
  getConnectorCapability,
  getDeclaredConnectorActions,
} from '@/lib/connectors/catalog';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { connectableForInternalId } from '@/lib/connectors/directory/connectable';
import type {
  DirectoryAuthMode,
  DirectoryRecord,
  DirectoryRemote,
} from '@/lib/connectors/directory/types';

const AGI_PUBLISHER_LABEL = 'AGI Workforce';

function authModeForCapability(authScheme: string | undefined): DirectoryAuthMode {
  if (authScheme === 'api-key' || authScheme === 'connection-string' || authScheme === 'pat')
    return 'api-key';
  if (authScheme === 'oauth2' || authScheme === 'github-app') return 'oauth';
  return 'unknown';
}

export function buildInternalDirectoryRecords(): DirectoryRecord[] {
  return CONNECTORS.map((connector) => {
    const endpoint = getMcpEndpoint(connector.id);
    const remotes: DirectoryRemote[] = endpoint
      ? [{ url: endpoint.url, transport: endpoint.transport }]
      : [];
    const capability = getConnectorCapability(connector.id);

    return {
      id: connector.id,
      name: connector.name,
      publisher: allowsPresentTenseCopy(connector.id) ? AGI_PUBLISHER_LABEL : connector.name,
      description: connector.description,
      categories: [connector.category],
      remotes,
      authMode: authModeForCapability(capability?.authScheme),
      connectable: connectableForInternalId(connector.id),
      toolNames: getDeclaredConnectorActions(connector.id),
      repositoryUrl: null,
      version: null,
      sourceRegistry: 'internal',
    };
  });
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildInternalHostIndex(
  internalRecords: readonly DirectoryRecord[],
): Map<string, DirectoryRecord> {
  const index = new Map<string, DirectoryRecord>();
  for (const record of internalRecords) {
    for (const remote of record.remotes) {
      const host = hostnameOf(remote.url);
      if (host) index.set(host, record);
    }
  }
  return index;
}

function matchInternalRecord(
  registryRecord: DirectoryRecord,
  internalHosts: Map<string, DirectoryRecord>,
): DirectoryRecord | undefined {
  for (const remote of registryRecord.remotes) {
    const host = hostnameOf(remote.url);
    const match = host ? internalHosts.get(host) : undefined;
    if (match) return match;
  }
  return undefined;
}

export function mergeDirectoryRecords(
  internalRecords: readonly DirectoryRecord[],
  registryRecords: readonly DirectoryRecord[],
): DirectoryRecord[] {
  const internalHosts = buildInternalHostIndex(internalRecords);
  const merged = new Map<string, DirectoryRecord>();
  for (const record of internalRecords) merged.set(record.id, record);

  for (const registryRecord of registryRecords) {
    const matched = matchInternalRecord(registryRecord, internalHosts);
    if (matched) {
      const current = merged.get(matched.id) ?? matched;
      merged.set(matched.id, {
        ...current,
        toolNames: current.toolNames.length > 0 ? current.toolNames : registryRecord.toolNames,
        repositoryUrl: current.repositoryUrl ?? registryRecord.repositoryUrl,
      });
      continue;
    }
    if (!merged.has(registryRecord.id)) merged.set(registryRecord.id, registryRecord);
  }

  return [...merged.values()];
}
