
import { api } from '@/services/api';

export interface MemoryEntry {
  id: string;
  content: string;
  category: string | null;
  source: 'mobile' | 'desktop' | 'web' | 'auto';
  createdAt: string;
  updatedAt: string;
}

export interface SyncStatus {
  lastSync: string | null;
  entriesCount: number;
  sources: { mobile: number; desktop: number; web: number; auto: number };
}

export interface SyncResult {
  synced: number;
  conflicts: number;
}

export async function fetchMemories(): Promise<MemoryEntry[]> {
  const data = await api.get<{ memories: MemoryEntry[] }>('/api/memory');
  return data.memories ?? [];
}

export async function createMemory(content: string, category?: string): Promise<MemoryEntry> {
  const data = await api.post<{ memory: MemoryEntry }>('/api/memory', {
    content,
    category: category || undefined,
    source: 'mobile',
  });
  return data.memory;
}

export async function updateMemory(id: string, content: string): Promise<MemoryEntry> {
  const data = await api.put<{ memory: MemoryEntry }>(`/api/memory/${id}`, {
    content,
  });
  return data.memory;
}

export async function deleteMemory(id: string): Promise<void> {
  await api.delete(`/api/memory/${id}`);
}

export async function searchMemories(query: string): Promise<MemoryEntry[]> {
  const data = await api.get<{ memories: MemoryEntry[] }>(
    `/api/memory/search?q=${encodeURIComponent(query)}`,
  );
  return data.memories ?? [];
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return api.get<SyncStatus>('/api/memory/sync');
}

export async function triggerSync(): Promise<SyncResult> {
  return api.post<SyncResult>('/api/memory/sync');
}
