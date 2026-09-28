import type { ConnectorDirectoryEntry } from '@agiworkforce/cloud-contracts';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export function toDirectoryEntryView(record: DirectoryRecord): ConnectorDirectoryEntry {
  return {
    ...record,
    categories: [...record.categories],
    remotes: record.remotes.map((remote) => ({ ...remote })),
    toolNames: [...record.toolNames],
    toolCount: record.toolNames.length,
    connectorUrl: record.remotes[0]?.url ?? null,
  };
}
