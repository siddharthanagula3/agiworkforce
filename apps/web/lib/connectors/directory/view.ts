import type {
  ConnectorDirectoryEntry,
  ConnectorPersonalSource,
} from '@agiworkforce/cloud-contracts';

import { getConnectorCapability } from '@/lib/connectors/catalog';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export function personalSourcesOf(
  record: DirectoryRecord,
): readonly ConnectorPersonalSource[] | undefined {
  return record.sourceRegistry === 'internal'
    ? getConnectorCapability(record.id)?.personalSources
    : undefined;
}

export function toDirectoryEntryView(record: DirectoryRecord): ConnectorDirectoryEntry {
  const personalSources = personalSourcesOf(record);
  return {
    ...record,
    categories: [...record.categories],
    ...(personalSources ? { personalSources: [...personalSources] } : {}),
    remotes: record.remotes.map((remote) => ({ ...remote })),
    toolNames: [...record.toolNames],
    toolCount: record.toolNames.length,
    connectorUrl: record.remotes[0]?.url ?? null,
  };
}
