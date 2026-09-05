import 'server-only';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';

const TTL_SECONDS = 6 * 60 * 60;
const TTL_MS = TTL_SECONDS * 1000;

export interface VideoTaskRecord {
  userId: string;
  model?: string;
}

interface TaskEntry extends VideoTaskRecord {
  expiresAt: number;
}

const localStore = new Map<string, TaskEntry>();

function taskKey(taskId: string): string {
  return `video-task-owner:${taskId}`;
}

function pruneLocal(now: number): void {
  for (const [key, entry] of localStore.entries()) {
    if (entry.expiresAt < now) localStore.delete(key);
  }
}

export async function storeVideoTask(
  taskId: string,
  userId: string,
  model?: string,
): Promise<void> {
  const now = Date.now();
  pruneLocal(now);
  localStore.set(taskId, { userId, ...(model ? { model } : {}), expiresAt: now + TTL_MS });

  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(
      taskKey(taskId),
      { userId, ...(model ? { model } : {}) },
      { ttlSeconds: TTL_SECONDS },
    );
  } catch (err) {
    logger.error(
      { err, taskId, userId },
      '[video-task-store] failed to persist task ownership; cross-instance polling will be denied',
    );
  }
}

export async function getVideoTask(taskId: string): Promise<VideoTaskRecord | undefined> {
  const local = localStore.get(taskId);
  if (local) {
    if (local.expiresAt >= Date.now()) {
      return { userId: local.userId, ...(local.model ? { model: local.model } : {}) };
    }
    localStore.delete(taskId);
  }

  const store = getKeyValueStore();
  if (!store) return undefined;
  try {
    const stored = await store.get<VideoTaskRecord | string>(taskKey(taskId));
    if (!stored) return undefined;
    if (typeof stored === 'string') return { userId: stored };
    return stored.userId ? stored : undefined;
  } catch (err) {
    logger.warn(
      { err, taskId },
      '[video-task-store] ownership lookup failed; denying (fail-closed)',
    );
    return undefined;
  }
}
