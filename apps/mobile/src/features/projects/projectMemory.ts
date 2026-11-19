import {
  ProjectMemoryEditHandshakeSchema,
  ProjectMemoryEditResponseSchema,
  type ProjectMemoryEditRemoval,
  type ProjectMemoryEditRequest,
  type ProjectMemoryEditResponse,
} from '@agiworkforce/cloud-contracts';
import { parseManagedMemoryWriteResponse } from '@agiworkforce/types';
import { TIMEOUTS } from '@/lib/constants';
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

export type ProjectMemoryRemovalCandidate = ProjectMemoryEditRemoval;
export type ProjectMemoryEditResult = ProjectMemoryEditResponse;

export class ProjectMemoryEditUnreadableError extends Error {
  constructor() {
    super('AGI sent an answer this app could not read.');
    this.name = 'ProjectMemoryEditUnreadableError';
  }
}

function projectMemoryEditPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/memory/edit`;
}

export async function readProjectMemoryEditLimit(
  projectId: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const account = captureCloudAccountEpoch();
  if (!account) return null;
  try {
    const response = await api.get<unknown>(projectMemoryEditPath(projectId), {
      accountEpoch: account,
      ...(signal ? { signal } : {}),
    });
    assertCloudAccountEpochCurrent(account);
    const handshake = ProjectMemoryEditHandshakeSchema.safeParse(response);
    return handshake.success ? handshake.data.maxMessageChars : null;
  } catch {
    return null;
  }
}

export async function editProjectMemory(input: {
  projectId: string;
  message: string;
}): Promise<ProjectMemoryEditResult> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Sign in to AGI Cloud to manage project memories.');
  const request: ProjectMemoryEditRequest = { message: input.message.trim() };
  const response = await api.post<unknown>(projectMemoryEditPath(input.projectId), request, {
    accountEpoch: account,
    timeout: TIMEOUTS.STREAMING,
  });
  assertCloudAccountEpochCurrent(account);
  const parsed = ProjectMemoryEditResponseSchema.safeParse(response);
  if (!parsed.success) {
    void syncNow();
    throw new ProjectMemoryEditUnreadableError();
  }
  const result = parsed.data;
  const store = useCloudMemoryStore.getState();
  const now = new Date().toISOString();
  for (const change of result.changed) {
    const existing = store.entries.find((entry) => entry.id === change.id);
    store.upsertCloudMemory({
      id: change.id,
      content: change.content,
      category: existing?.category ?? 'fact',
      source: existing?.source ?? 'mobile',
      pinned: existing?.pinned ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      isDeleted: false,
      projectId: input.projectId,
      projectName: existing?.projectName ?? null,
    });
  }
  if (result.changed.length > 0) void syncNow();
  return result;
}

export async function deleteProjectMemory(id: string): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Sign in to AGI Cloud to manage project memories.');
  await api.delete<unknown>(`${MEMORY_PATH}/${encodeURIComponent(id)}`);
  assertCloudAccountEpochCurrent(account);
  useCloudMemoryStore.getState().hardDeleteCloudMemory(id);
}
