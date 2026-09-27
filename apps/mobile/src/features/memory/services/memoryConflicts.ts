import { api } from '@/services/api';
import { syncNow } from '@/services/cloudSyncEngine';
import { listReplacedMemoryFacts, restoreReplacedMemoryFact } from '@/storage/memory';

export const MEMORY_CONFLICT_RULE =
  'When two memories disagree, a pinned memory wins, then one you added over one learned from a chat, then the newer one. The replaced one is kept here so you can switch back.';

export interface MemoryConflict {
  id: string;
  replaced: string;
  kept: string;
}

interface CloudMemoryConflict {
  id: string;
  content: string;
  kept: { id: string; content: string };
}

export async function listMemoryConflicts(scope: 'local' | 'cloud'): Promise<MemoryConflict[]> {
  if (scope === 'cloud') {
    const data = await api.get<{ conflicts?: CloudMemoryConflict[] }>('/api/memory/conflicts');
    return (data.conflicts ?? []).map((conflict) => ({
      id: conflict.id,
      replaced: conflict.content,
      kept: conflict.kept.content,
    }));
  }
  const rows = await listReplacedMemoryFacts();
  return rows.map((row) => ({
    id: row.replaced.id,
    replaced: row.replaced.fact,
    kept: row.kept.fact,
  }));
}

export async function restoreReplacedMemory(scope: 'local' | 'cloud', id: string): Promise<void> {
  if (scope === 'cloud') {
    await api.post(`/api/memory/${encodeURIComponent(id)}/restore`);
    await syncNow().catch(() => undefined);
    return;
  }
  if (!(await restoreReplacedMemoryFact(id))) {
    throw new Error('That memory is no longer waiting to be restored.');
  }
}
