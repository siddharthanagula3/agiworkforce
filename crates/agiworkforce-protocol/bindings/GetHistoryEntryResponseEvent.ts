import type { HistoryEntry } from './HistoryEntry';

export type GetHistoryEntryResponseEvent = {
  offset: number;
  log_id: bigint;
  entry: HistoryEntry | null;
};
