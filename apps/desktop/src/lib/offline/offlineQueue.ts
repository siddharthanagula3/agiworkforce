/**
 * Offline Queue (Desktop)
 *
 * Manages a queue of messages and actions sent while offline.
 * Persists to localStorage and syncs when connectivity is restored.
 *
 * Ported from apps/web/lib/offline/offlineQueue.ts for desktop integration.
 */

import { safeGetJSON, safeSetJSON } from '@/utils/localStorage';
import type {
  QueuedMessage,
  QueuedToolExecution,
  OfflineQueueState,
  SyncCallbacks,
  SyncSummary,
} from '@agiworkforce/types';

export type { QueuedMessage, QueuedToolExecution, OfflineQueueState, SyncCallbacks, SyncSummary };

const OFFLINE_QUEUE_KEY = 'agi_offline_queue';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

function getBackoffDelay(retryCount: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_BACKOFF_MS);
}

function loadQueue(): OfflineQueueState {
  try {
    const data = safeGetJSON<OfflineQueueState>(OFFLINE_QUEUE_KEY, {
      messages: [],
      toolExecutions: [],
    });
    return data || { messages: [], toolExecutions: [] };
  } catch (error) {
    console.error('[OfflineQueue] Failed to load queue:', error);
    return { messages: [], toolExecutions: [] };
  }
}

function saveQueue(queue: OfflineQueueState): void {
  try {
    safeSetJSON(OFFLINE_QUEUE_KEY, queue);
  } catch (error) {
    console.error('[OfflineQueue] Failed to save queue:', error);
  }
}

export function queueMessage(sessionId: string, content: string): string {
  if (!sessionId?.trim() || !content?.trim()) {
    throw new Error('sessionId and content are required');
  }

  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const queue = loadQueue();

  const message: QueuedMessage = {
    id,
    sessionId,
    content,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    addedAt: new Date().toISOString(),
  };

  saveQueue({
    ...queue,
    messages: [...queue.messages, message],
  });

  return id;
}

export function queueToolExecution(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  if (!sessionId?.trim() || !toolName?.trim()) {
    throw new Error('sessionId and toolName are required');
  }

  const id = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const queue = loadQueue();

  const execution: QueuedToolExecution = {
    id,
    sessionId,
    toolName,
    toolInput,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    addedAt: new Date().toISOString(),
  };

  saveQueue({
    ...queue,
    toolExecutions: [...queue.toolExecutions, execution],
  });

  return id;
}

export function getQueuedItems(): {
  messages: QueuedMessage[];
  toolExecutions: QueuedToolExecution[];
} {
  const queue = loadQueue();
  return {
    messages: queue.messages,
    toolExecutions: queue.toolExecutions,
  };
}

export function getQueuedItemCount(): number {
  const queue = loadQueue();
  return queue.messages.length + queue.toolExecutions.length;
}

export function clearQueuedMessage(messageId: string): void {
  try {
    const queue = loadQueue();
    const updated: OfflineQueueState = {
      ...queue,
      messages: queue.messages.filter((m) => m.id !== messageId),
    };
    saveQueue(updated);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear message:', error);
  }
}

export function clearQueuedToolExecution(toolId: string): void {
  try {
    const queue = loadQueue();
    const updated: OfflineQueueState = {
      ...queue,
      toolExecutions: queue.toolExecutions.filter((t) => t.id !== toolId),
    };
    saveQueue(updated);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear tool execution:', error);
  }
}

export function clearAllQueued(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear all queued items:', error);
  }
}

function incrementMessageRetry(messageId: string): void {
  const queue = loadQueue();
  const updated: OfflineQueueState = {
    ...queue,
    messages: queue.messages.map((m) =>
      m.id === messageId ? { ...m, retryCount: m.retryCount + 1 } : m,
    ),
  };
  saveQueue(updated);
}

function incrementToolRetry(toolId: string): void {
  const queue = loadQueue();
  const updated: OfflineQueueState = {
    ...queue,
    toolExecutions: queue.toolExecutions.map((t) =>
      t.id === toolId ? { ...t, retryCount: t.retryCount + 1 } : t,
    ),
  };
  saveQueue(updated);
}

export async function syncOfflineQueue(callbacks?: SyncCallbacks): Promise<SyncSummary> {
  const startTime = Date.now();
  const summary: SyncSummary = {
    messagesSynced: 0,
    messagesFailed: 0,
    toolsSynced: 0,
    toolsFailed: 0,
    totalTime: 0,
  };

  try {
    if (!navigator.onLine) {
      console.log('[OfflineQueue] Still offline, skipping sync');
      callbacks?.onSyncComplete?.(false, summary);
      return summary;
    }

    const queue = loadQueue();

    for (const message of queue.messages) {
      try {
        if (message.retryCount >= MAX_RETRIES) {
          console.warn(`[OfflineQueue] Max retries exceeded for message ${message.id}`);
          summary.messagesFailed++;
          clearQueuedMessage(message.id);
          continue;
        }

        if (callbacks?.onMessageSync) {
          await callbacks.onMessageSync(message);
          summary.messagesSynced++;
          clearQueuedMessage(message.id);
        }
      } catch (error) {
        console.error(`[OfflineQueue] Failed to sync message ${message.id}:`, error);
        incrementMessageRetry(message.id);
        summary.messagesFailed++;

        if (error instanceof Error && error.message.includes('401')) {
          throw error;
        }
      }
    }

    for (const tool of queue.toolExecutions) {
      try {
        if (tool.retryCount >= MAX_RETRIES) {
          console.warn(`[OfflineQueue] Max retries exceeded for tool ${tool.id}`);
          summary.toolsFailed++;
          clearQueuedToolExecution(tool.id);
          continue;
        }

        if (callbacks?.onToolSync) {
          await callbacks.onToolSync(tool);
          summary.toolsSynced++;
          clearQueuedToolExecution(tool.id);
        }
      } catch (error) {
        console.error(`[OfflineQueue] Failed to sync tool ${tool.id}:`, error);
        incrementToolRetry(tool.id);
        summary.toolsFailed++;

        if (error instanceof Error && error.message.includes('401')) {
          throw error;
        }
      }
    }

    const updatedQueue = loadQueue();
    saveQueue({ ...updatedQueue, lastSyncTime: new Date().toISOString() });

    summary.totalTime = Date.now() - startTime;
    callbacks?.onSyncComplete?.(true, summary);

    return summary;
  } catch (error) {
    console.error('[OfflineQueue] Sync failed with fatal error:', error);
    summary.totalTime = Date.now() - startTime;
    callbacks?.onSyncComplete?.(false, summary);
    throw error;
  }
}

export function getLastSyncTime(): Date | null {
  try {
    const queue = loadQueue();
    return queue.lastSyncTime ? new Date(queue.lastSyncTime) : null;
  } catch (error) {
    console.error('[OfflineQueue] Failed to get last sync time:', error);
    return null;
  }
}

export function getMessageRetryStatus(messageId: string): {
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;
  nextRetryIn?: number;
} | null {
  const queue = loadQueue();
  const message = queue.messages.find((m) => m.id === messageId);

  if (!message) {
    return null;
  }

  const canRetry = message.retryCount < MAX_RETRIES;
  const nextRetryIn = canRetry ? getBackoffDelay(message.retryCount) : undefined;

  return {
    retryCount: message.retryCount,
    maxRetries: MAX_RETRIES,
    canRetry,
    nextRetryIn,
  };
}

export function subscribeToQueueChanges(callback: () => void): () => void {
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === OFFLINE_QUEUE_KEY) {
      callback();
    }
  };

  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}
