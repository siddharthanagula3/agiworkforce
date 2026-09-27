import type { MemoryFact, MemoryFactSource } from '@/storage/types';

type MemoryOriginFields = Pick<MemoryFact, 'pinned' | 'source' | 'source_conversation_id'>;

export function memoryFactOrigin(entry: Omit<MemoryOriginFields, 'pinned'>): MemoryFactSource {
  if (entry.source) return entry.source;
  return entry.source_conversation_id ? 'learned' : 'typed';
}

export function memoryFactRank(entry: MemoryOriginFields): number {
  if (entry.pinned) return 2;
  return memoryFactOrigin(entry) === 'learned' ? 0 : 1;
}

export function memoryFactChangedAt(entry: Pick<MemoryFact, 'created_at' | 'updated_at'>): number {
  return typeof entry.updated_at === 'number' && Number.isFinite(entry.updated_at)
    ? Math.max(entry.updated_at, entry.created_at)
    : entry.created_at;
}
