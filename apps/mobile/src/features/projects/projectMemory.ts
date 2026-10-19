import { parseManagedMemoryWriteResponse } from '@agiworkforce/types';
import { api } from '@/services/api';
import { syncNow } from '@/services/cloudSyncEngine';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';

const MEMORY_PATH = '/api/memory';

export type ProjectMemoryAddOutcome = 'saved' | 'merged' | 'kept_existing';

export function projectMemoryEntries(
  entries: readonly CloudMemoryEntry[],
  projectId: string,
): CloudMemoryEntry[] {
  return entries
    .filter((entry) => !entry.isDeleted && entry.projectId === projectId)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export async function addProjectMemory(input: {
  projectId: string;
  projectName: string;
  content: string;
}): Promise<ProjectMemoryAddOutcome> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Sign in to AGI Cloud to add project memories.');
  const response = await api.post<unknown>(MEMORY_PATH, {
    content: input.content.trim(),
    projectId: input.projectId,
    source: 'mobile',
  });
  assertCloudAccountEpochCurrent(account);
  const written = parseManagedMemoryWriteResponse(response);
  if (!written) throw new Error('The memory could not be saved. Try again.');

  const store = useCloudMemoryStore.getState();
  for (const id of written.supersededIds) store.hardDeleteCloudMemory(id);
  if (written.supersededBy) {
    void syncNow();
    return 'kept_existing';
  }
  const { memory } = written;
  store.upsertCloudMemory({
    id: memory.id,
    content: memory.content,
    category: memory.category,
    source: 'mobile',
    pinned: memory.pinned === true,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    isDeleted: false,
    projectId: memory.projectId ?? input.projectId,
    projectName: input.projectName,
  });
  void syncNow();
  return written.merged ? 'merged' : 'saved';
}

export async function deleteProjectMemory(id: string): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Sign in to AGI Cloud to manage project memories.');
  await api.delete<unknown>(`${MEMORY_PATH}/${encodeURIComponent(id)}`);
  assertCloudAccountEpochCurrent(account);
  useCloudMemoryStore.getState().hardDeleteCloudMemory(id);
}
