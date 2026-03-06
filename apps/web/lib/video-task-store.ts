/**
 * In-memory store for video task ownership verification.
 *
 * Maps task_id → { userId, expiresAt } with a 6-hour TTL.
 * This is sufficient for the serverless function lifetime in which tasks complete.
 *
 * In a horizontally-scaled deployment, replace with Redis or Supabase storage.
 */

interface TaskEntry {
  userId: string;
  expiresAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Module-level map persists for the lifetime of a serverless function instance.
const taskStore = new Map<string, TaskEntry>();

/**
 * Store a task_id → user_id mapping with TTL.
 */
export function storeVideoTask(taskId: string, userId: string): void {
  // Prune expired entries before inserting to prevent unbounded growth.
  const now = Date.now();
  for (const [key, entry] of taskStore.entries()) {
    if (entry.expiresAt < now) {
      taskStore.delete(key);
    }
  }
  taskStore.set(taskId, { userId, expiresAt: now + TTL_MS });
}

/**
 * Look up the user_id for a task_id.
 * Returns undefined if not found or expired.
 */
export function getVideoTaskOwner(taskId: string): string | undefined {
  const entry = taskStore.get(taskId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    taskStore.delete(taskId);
    return undefined;
  }
  return entry.userId;
}
