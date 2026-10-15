import { createMessageQueue, type MessageQueue } from '@agiworkforce/client-runtime/queue';

/**
 * What a local session's panel holds that the CLI does not: follow-ups waiting
 * for the running turn, a message that could not be sent, and what is typed
 * but not sent yet. The panel is mounted per session and unmounted on Back, so
 * this lives outside it, by folder and thread, and is there when the session
 * is opened again. It ends with the page, like the panel's other state.
 */
export interface LocalSessionMemory {
  queue: MessageQueue;
  /** The queue waits for the user instead of sending when a turn ends. */
  paused: boolean;
  draft: string;
  contextFiles: string[];
}

const memories = new Map<string, LocalSessionMemory>();

function memoryKey(rootId: string, threadId: string): string {
  return JSON.stringify([rootId, threadId]);
}

export function newLocalSessionMemory(): LocalSessionMemory {
  return { queue: createMessageQueue(), paused: false, draft: '', contextFiles: [] };
}

export function localSessionMemory(rootId: string, threadId: string): LocalSessionMemory {
  const key = memoryKey(rootId, threadId);
  const known = memories.get(key);
  if (known) return known;
  const created = newLocalSessionMemory();
  memories.set(key, created);
  return created;
}

/** The thread is gone, so nothing typed for it can ever be sent. */
export function forgetLocalSession(rootId: string, threadId: string): void {
  memories.delete(memoryKey(rootId, threadId));
}
