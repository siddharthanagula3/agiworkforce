import { createStore } from '../state/createStore';
import {
  LANE_CAP,
  PRIORITY_ORDER,
  QueueDequeueRaceError,
  QueueFullError,
  type ContentBlock,
  type MessageQueue,
  type PastedContent,
  type PopAllEditableResult,
  type PromptInputMode,
  type QueueListener,
  type QueuePriority,
  type QueueStorageAdapter,
  type QueuedCommand,
} from './types';

const NON_EDITABLE_MODES = new Set<PromptInputMode>(['task-notification', 'channel-message']);

function isCommandEditable(cmd: QueuedCommand): boolean {
  return !NON_EDITABLE_MODES.has(cmd.mode) && !cmd.isMeta;
}

function extractText(value: string | ContentBlock[]): string {
  if (typeof value === 'string') return value;
  return value
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function extractImages(value: string | ContentBlock[], startId: number): PastedContent[] {
  if (typeof value === 'string') return [];
  const images: PastedContent[] = [];
  let index = 0;
  for (const block of value) {
    if (block.type === 'image' && block.source.type === 'base64') {
      images.push({
        id: startId + index,
        type: 'image',
        content: block.source.data,
        mediaType: block.source.media_type,
        filename: `image${index + 1}`,
      });
      index++;
    }
  }
  return images;
}

let fallbackCounter = 0;
function genId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  fallbackCounter = (fallbackCounter + 1) >>> 0;
  return `q_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

export interface CreateMessageQueueOptions {
  storage?: QueueStorageAdapter;
  laneCap?: number;
  logger?: (event: {
    op: 'enqueue' | 'dequeue' | 'pop' | 'remove' | 'clear';
    cmd?: QueuedCommand;
  }) => void;
}

export function createMessageQueue(options: CreateMessageQueueOptions = {}): MessageQueue {
  const laneCap = Math.max(1, options.laneCap ?? LANE_CAP);
  const storage = options.storage;
  const logger = options.logger;

  type Snapshot = readonly QueuedCommand[];

  const initial: Snapshot = (() => {
    if (!storage) return Object.freeze<QueuedCommand[]>([]);
    const persisted = storage.read();
    if (!persisted) return Object.freeze<QueuedCommand[]>([]);
    const filtered = persisted.filter((cmd) => (cmd.priority ?? 'next') !== 'now');
    return Object.freeze([...filtered]);
  })();

  const store = createStore<Snapshot>(initial);

  const abortHandlers = new Map<string, () => void>();

  function detachAbort(commandId: string): void {
    const handler = abortHandlers.get(commandId);
    if (handler) {
      handler();
      abortHandlers.delete(commandId);
    }
  }

  function persist(snapshot: Snapshot): void {
    if (!storage) return;
    const persistable = snapshot.filter((cmd) => (cmd.priority ?? 'next') !== 'now');
    storage.write(persistable);
  }

  function laneSize(snapshot: Snapshot, lane: QueuePriority): number {
    let count = 0;
    for (const cmd of snapshot) {
      if ((cmd.priority ?? 'next') === lane) count++;
    }
    return count;
  }

  function mutate(updater: (prev: Snapshot) => Snapshot): Snapshot {
    let nextSnapshot: Snapshot = store.getState();
    store.setState((prev) => {
      const next = updater(prev);
      nextSnapshot = next;
      return next;
    });
    if (nextSnapshot !== initial) {
      persist(nextSnapshot);
    }
    return nextSnapshot;
  }

  function findBestIdx(snapshot: Snapshot, filter?: (cmd: QueuedCommand) => boolean): number {
    let bestIdx = -1;
    let bestPriority = Infinity;
    for (let i = 0; i < snapshot.length; i++) {
      const cmd = snapshot[i]!;
      if (filter && !filter(cmd)) continue;
      const priority = PRIORITY_ORDER[cmd.priority ?? 'next'];
      if (priority < bestPriority) {
        bestIdx = i;
        bestPriority = priority;
      }
    }
    return bestIdx;
  }

  function enqueueWith(
    command: Omit<QueuedCommand, 'id' | 'enqueuedAt'> & {
      id?: string;
      enqueuedAt?: number;
    },
    defaultPriority: QueuePriority,
    options?: { signal?: AbortSignal },
  ): QueuedCommand {
    const priority: QueuePriority = command.priority ?? defaultPriority;
    const lane = priority;
    const current = store.getState();
    if (laneSize(current, lane) >= laneCap) {
      throw new QueueFullError(lane, laneCap);
    }
    const id = command.id ?? genId();
    const enqueuedAt = command.enqueuedAt ?? Date.now();
    const stored: QueuedCommand = Object.freeze({
      ...command,
      id,
      enqueuedAt,
      priority,
    }) as QueuedCommand;

    const signal = options?.signal;
    if (signal) {
      if (signal.aborted) {
        return stored;
      }
      const handler = () => {
        mutate((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return Object.freeze(next);
        });
        abortHandlers.delete(id);
        logger?.({ op: 'remove', cmd: stored });
      };
      signal.addEventListener('abort', handler, { once: true });
      abortHandlers.set(id, () => signal.removeEventListener('abort', handler));
    }

    mutate((prev) => Object.freeze([...prev, stored]));
    logger?.({ op: 'enqueue', cmd: stored });
    return stored;
  }

  return {
    getSnapshot: () => store.getState(),

    size: () => store.getState().length,

    laneSize: (lane) => laneSize(store.getState(), lane),

    hasCommands: () => store.getState().length > 0,

    peek: (filter) => {
      const snapshot = store.getState();
      const idx = findBestIdx(snapshot, filter);
      return idx === -1 ? undefined : snapshot[idx];
    },

    subscribe: (listener: QueueListener) => store.subscribe(listener),

    enqueue: (command, options) => enqueueWith(command, 'next', options),

    enqueueNotification: (command, options) => enqueueWith(command, 'later', options),

    dequeue: (filter) => {
      const snapshot = store.getState();
      const idx = findBestIdx(snapshot, filter);
      if (idx === -1 || idx < 0 || idx >= snapshot.length) return undefined;
      const cmdAt = snapshot[idx];
      if (cmdAt === undefined) return undefined;
      const cmd = cmdAt;
      mutate((prev) => {
        const realIdx = prev.findIndex((c) => c.id === cmd.id);
        if (realIdx === -1) return prev;
        const next = [...prev];
        next.splice(realIdx, 1);
        return Object.freeze(next);
      });
      detachAbort(cmd.id);
      logger?.({ op: 'dequeue', cmd });
      return cmd;
    },

    dequeueIf: (expectedId: string) => {
      const snapshot = store.getState();
      const idx = findBestIdx(snapshot);
      if (idx === -1 || idx < 0 || idx >= snapshot.length) {
        throw new QueueDequeueRaceError(expectedId);
      }
      const cmdAt = snapshot[idx];
      if (cmdAt === undefined || cmdAt.id !== expectedId) {
        throw new QueueDequeueRaceError(expectedId);
      }
      const cmd = cmdAt;
      let racedRef = false;
      mutate((prev) => {
        const realIdx = prev.findIndex((c) => c.id === expectedId);
        if (realIdx === -1) {
          racedRef = true;
          return prev;
        }
        const next = [...prev];
        next.splice(realIdx, 1);
        return Object.freeze(next);
      });
      if (racedRef) {
        throw new QueueDequeueRaceError(expectedId);
      }
      detachAbort(expectedId);
      logger?.({ op: 'dequeue', cmd });
      return cmd;
    },

    dequeueAll: () => {
      const snapshot = store.getState();
      if (snapshot.length === 0) return [];
      const taken = [...snapshot];
      mutate(() => Object.freeze<QueuedCommand[]>([]));
      for (const cmd of taken) {
        detachAbort(cmd.id);
        logger?.({ op: 'dequeue', cmd });
      }
      return taken;
    },

    dequeueAllMatching: (predicate) => {
      const snapshot = store.getState();
      const matched = snapshot.filter(predicate);
      if (matched.length === 0) return [];
      mutate((prev) => Object.freeze(prev.filter((cmd) => !predicate(cmd))));
      for (const cmd of matched) {
        detachAbort(cmd.id);
        logger?.({ op: 'dequeue', cmd });
      }
      return matched;
    },

    popAllEditable: (currentInput, currentCursorOffset): PopAllEditableResult | undefined => {
      const snapshot = store.getState();
      if (snapshot.length === 0) return undefined;

      const editable: QueuedCommand[] = [];
      const nonEditable: QueuedCommand[] = [];
      for (const cmd of snapshot) {
        if (isCommandEditable(cmd)) editable.push(cmd);
        else nonEditable.push(cmd);
      }
      if (editable.length === 0) return undefined;

      const queuedTexts = editable.map((cmd) => extractText(cmd.value));
      const newInput = [...queuedTexts, currentInput].filter((s) => s.length > 0).join('\n');

      const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset;

      const pastedContents: PastedContent[] = [];
      let nextImageId = Date.now();
      for (const cmd of editable) {
        if (cmd.pastedContents) {
          for (const content of Object.values(cmd.pastedContents)) {
            if (content.type === 'image') {
              pastedContents.push(content);
            }
          }
        }
        const embedded = extractImages(cmd.value, nextImageId);
        pastedContents.push(...embedded);
        nextImageId += embedded.length;
      }

      mutate(() => Object.freeze([...nonEditable]));
      for (const cmd of editable) {
        detachAbort(cmd.id);
        logger?.({ op: 'pop', cmd });
      }

      return { text: newInput, cursorOffset, pastedContents };
    },

    clear: () => {
      const snapshot = store.getState();
      if (snapshot.length === 0) return;
      mutate(() => Object.freeze<QueuedCommand[]>([]));
      for (const cmd of snapshot) detachAbort(cmd.id);
      logger?.({ op: 'clear' });
    },

    flush: () => {
      if (storage)
        storage.write(store.getState().filter((cmd) => (cmd.priority ?? 'next') !== 'now'));
    },
  };
}

export function createWebStorageAdapter(
  key: string,
  storage: Storage | null | undefined,
): QueueStorageAdapter | null {
  if (!storage) return null;
  return {
    read: () => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const valid = parsed.filter(
          (cmd: unknown): cmd is QueuedCommand =>
            typeof cmd === 'object' &&
            cmd !== null &&
            typeof (cmd as { id?: unknown }).id === 'string' &&
            typeof (cmd as { mode?: unknown }).mode === 'string',
        );
        return valid;
      } catch {
        return null;
      }
    },
    write: (commands) => {
      try {
        storage.setItem(key, JSON.stringify(commands));
      } catch {
        return;
      }
    },
  };
}

export interface SyncKvStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function createKvStorageAdapter(key: string, kv: SyncKvStore): QueueStorageAdapter {
  return {
    read: () => {
      try {
        const raw = kv.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.filter(
          (cmd: unknown): cmd is QueuedCommand =>
            typeof cmd === 'object' &&
            cmd !== null &&
            typeof (cmd as { id?: unknown }).id === 'string' &&
            typeof (cmd as { mode?: unknown }).mode === 'string',
        );
      } catch {
        return null;
      }
    },
    write: (commands) => {
      try {
        kv.set(key, JSON.stringify(commands));
      } catch {
        return;
      }
    },
  };
}
