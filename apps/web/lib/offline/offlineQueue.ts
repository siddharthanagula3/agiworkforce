/**
 * Offline Queue
 *
 * Manages a queue of messages and actions sent while offline.
 * Persists to localStorage and syncs when connectivity is restored.
 *
 * Features:
 * - Queue messages while offline
 * - Queue tool execution requests
 * - Persist queue to localStorage
 * - Retry with exponential backoff
 * - Clear successful items after sync
 */

import { safeGetJSON, safeSetJSON } from '@/utils/localStorage';

/**
 * Queued message sent while offline
 */
interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string; // ISO string
  retryCount: number;
  addedAt: string; // ISO string
}

/**
 * Queued tool execution request
 */
interface QueuedToolExecution {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string; // ISO string
  retryCount: number;
  addedAt: string; // ISO string
}

/**
 * Offline queue state
 */
interface OfflineQueueState {
  messages: QueuedMessage[];
  toolExecutions: QueuedToolExecution[];
  lastSyncTime?: string; // ISO string
}

/**
 * Callback for sync operations
 */
interface SyncCallbacks {
  onMessageSync?: (message: QueuedMessage) => Promise<void>;
  onToolSync?: (tool: QueuedToolExecution) => Promise<void>;
  onSyncComplete?: (success: boolean, summary: SyncSummary) => void;
}

/**
 * Summary of sync operation results
 */
export interface SyncSummary {
  messagesSynced: number;
  messagesFailed: number;
  toolsSynced: number;
  toolsFailed: number;
  totalTime: number; // milliseconds
}

// Storage key
const OFFLINE_QUEUE_KEY = 'agi_offline_queue';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 30000; // 30 seconds

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(retryCount: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * Load queue from localStorage
 */
function loadQueue(): OfflineQueueState {
  try {
    const data = safeGetJSON<OfflineQueueState>(OFFLINE_QUEUE_KEY);
    return data || { messages: [], toolExecutions: [] };
  } catch (error) {
    console.error('[OfflineQueue] Failed to load queue:', error);
    return { messages: [], toolExecutions: [] };
  }
}

/**
 * Save queue to localStorage
 */
function saveQueue(queue: OfflineQueueState): void {
  try {
    safeSetJSON(OFFLINE_QUEUE_KEY, queue);
  } catch (error) {
    console.error('[OfflineQueue] Failed to save queue:', error);
  }
}

/**
 * Add a message to the offline queue
 */
export function queueMessage(sessionId: string, content: string): string {
  try {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queue = loadQueue();

    const message: QueuedMessage = {
      id,
      sessionId,
      content,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      addedAt: new Date().toISOString(),
    };

    queue.messages.push(message);
    saveQueue(queue);

    return id;
  } catch (error) {
    console.error('[OfflineQueue] Failed to queue message:', error);
    throw error;
  }
}

/**
 * Add a tool execution request to the offline queue
 */
export function queueToolExecution(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  try {
    const id = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    queue.toolExecutions.push(execution);
    saveQueue(queue);

    return id;
  } catch (error) {
    console.error('[OfflineQueue] Failed to queue tool execution:', error);
    throw error;
  }
}

/**
 * Get all queued items (for UI display)
 */
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

/**
 * Get count of queued items
 */
export function getQueuedItemCount(): number {
  const queue = loadQueue();
  return queue.messages.length + queue.toolExecutions.length;
}

/**
 * Clear a specific message from queue (after successful sync)
 */
export function clearQueuedMessage(messageId: string): void {
  try {
    const queue = loadQueue();
    queue.messages = queue.messages.filter((m) => m.id !== messageId);
    saveQueue(queue);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear message:', error);
  }
}

/**
 * Clear a specific tool execution from queue (after successful sync)
 */
export function clearQueuedToolExecution(toolId: string): void {
  try {
    const queue = loadQueue();
    queue.toolExecutions = queue.toolExecutions.filter((t) => t.id !== toolId);
    saveQueue(queue);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear tool execution:', error);
  }
}

/**
 * Clear all queued items
 */
export function clearAllQueued(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear all queued items:', error);
  }
}

/**
 * Increment retry count for a message
 */
function incrementMessageRetry(messageId: string): void {
  const queue = loadQueue();
  const message = queue.messages.find((m) => m.id === messageId);
  if (message) {
    message.retryCount++;
    saveQueue(queue);
  }
}

/**
 * Increment retry count for a tool execution
 */
function incrementToolRetry(toolId: string): void {
  const queue = loadQueue();
  const tool = queue.toolExecutions.find((t) => t.id === toolId);
  if (tool) {
    tool.retryCount++;
    saveQueue(queue);
  }
}

/**
 * Check if online by testing server connectivity
 */
async function isOnline(): Promise<boolean> {
  try {
    // Check navigator.onLine first (quick check)
    if (!navigator.onLine) {
      return false;
    }

    // Verify with a lightweight server health check
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      clearTimeout(timeoutId);
      return false;
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to check online status:', error);
    return navigator.onLine;
  }
}

/**
 * Sync offline queue with server
 * Attempts to send all queued messages and tool executions
 */
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
    // Check connectivity first
    const online = await isOnline();
    if (!online) {
      console.log('[OfflineQueue] Still offline, skipping sync');
      callbacks?.onSyncComplete?.(false, summary);
      return summary;
    }

    const queue = loadQueue();

    // Sync messages
    for (const message of queue.messages) {
      try {
        // Check if max retries exceeded
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

        // Re-throw if we should stop processing (e.g., auth error)
        if (error instanceof Error && error.message.includes('401')) {
          throw error;
        }
      }
    }

    // Sync tool executions
    for (const tool of queue.toolExecutions) {
      try {
        // Check if max retries exceeded
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

        // Re-throw if we should stop processing
        if (error instanceof Error && error.message.includes('401')) {
          throw error;
        }
      }
    }

    // Update last sync time
    const updatedQueue = loadQueue();
    updatedQueue.lastSyncTime = new Date().toISOString();
    saveQueue(updatedQueue);

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

/**
 * Get last successful sync time
 */
export function getLastSyncTime(): Date | null {
  try {
    const queue = loadQueue();
    return queue.lastSyncTime ? new Date(queue.lastSyncTime) : null;
  } catch (error) {
    console.error('[OfflineQueue] Failed to get last sync time:', error);
    return null;
  }
}

/**
 * Get details about retry status for a message
 */
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

/**
 * Subscribe to offline queue changes (for reactive UI updates)
 * Returns unsubscribe function
 */
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
