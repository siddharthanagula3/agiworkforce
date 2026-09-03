import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export interface DirectoryEntryView extends DirectoryRecord {
  readonly toolCount: number;
  readonly connectorUrl: string | null;
}

export function toDirectoryEntryView(record: DirectoryRecord): DirectoryEntryView {
  return {
    ...record,
    toolCount: record.toolNames.length,
    connectorUrl: record.remotes[0]?.url ?? null,
  };
}
