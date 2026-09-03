import {
  createMessageQueue,
  createWebStorageAdapter,
  type CreateMessageQueueOptions,
  type MessageQueue,
  type QueueStorageAdapter,
} from '@agiworkforce/client-runtime';

const queues = new Map<string, MessageQueue>();

export interface GetSendQueueOptions extends CreateMessageQueueOptions {
  reset?: boolean;
}

export function getSendQueue(surfaceId: string, options?: GetSendQueueOptions): MessageQueue {
  if (options?.reset) queues.delete(surfaceId);
  let queue = queues.get(surfaceId);
  if (!queue) {
    queue = createMessageQueue(options);
    queues.set(surfaceId, queue);
  }
  return queue;
}

export function defaultBrowserStorage(surfaceId: string): QueueStorageAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (!storage) return null;
  return createWebStorageAdapter(`agiworkforce.queue.${surfaceId}`, storage);
}

export function enqueuePrompt(
  queue: MessageQueue,
  text: string,
  options?: {
    priority?: 'now' | 'next' | 'later';
    signal?: AbortSignal;
    isMeta?: boolean;
    skipSlashCommands?: boolean;
    origin?: { kind: string; [key: string]: unknown };
  },
): ReturnType<MessageQueue['enqueue']> {
  return queue.enqueue(
    {
      value: text,
      mode: 'prompt',
      priority: options?.priority,
      isMeta: options?.isMeta,
      skipSlashCommands: options?.skipSlashCommands,
      origin: options?.origin,
    },
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export function __resetAllSendQueuesForTests(): void {
  queues.clear();
}
