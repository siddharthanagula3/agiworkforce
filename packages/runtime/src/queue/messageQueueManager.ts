/**
 * `messageQueueManager` — per-surface priority send pipeline.
 *
 * Three priority lanes (`now` > `next` > `later`), FIFO within a lane, frozen
 * snapshots stable across mutations (compatible with React's
 * `useSyncExternalStore`). Backed by `createStore` from `state/` so the
 * Object.is short-circuit prevents render storms when a no-op enqueue races.
 *
 * **Per-surface, NOT shared.** Cross-surface state-sharing is an explicit
 * non-goal (per Task 1.4 §"Cross-surface state"). Each surface calls
 * `createMessageQueue()` once at boot and routes its own send pipeline through
 * the resulting instance.
 *
 * Reference: tasks/research/deep/u2-utils-direct-h-n.md §2.5 + §5
 *           ~/Desktop/reference/src/utils/messageQueueManager.ts
 */

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

/**
 * Modes that must NOT round-trip into the editable input buffer. System
 * notifications and channel messages contain raw structured data the user
 * never typed.
 */
const NON_EDITABLE_MODES = new Set<PromptInputMode>(['task-notification', 'channel-message']);

function isCommandEditable(cmd: QueuedCommand): boolean {
  return !NON_EDITABLE_MODES.has(cmd.mode) && !cmd.isMeta;
}

/**
 * Extract plain text from a `value` (string or `ContentBlock[]`).
 * Used by `popAllEditable` to reconstruct the input buffer.
 */
function extractText(value: string | ContentBlock[]): string {
  if (typeof value === 'string') return value;
  return value
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Extract images from a `ContentBlock[]` and assign them sequential `PastedContent`
 * IDs starting at `startId`. Insertion order is preserved.
 */
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

/**
 * Crypto-safe random ID. Uses `crypto.randomUUID()` when available (Node 19+,
 * all modern browsers, React Native 0.83+ with polyfill). Falls back to a
 * timestamp+counter token in degraded environments — IDs only need to be
 * unique within the local queue lifetime, not globally cryptographic.
 */
let fallbackCounter = 0;
function genId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  fallbackCounter = (fallbackCounter + 1) >>> 0;
  return `q_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

/**
 * Options for `createMessageQueue`. All optional — a queue with no options is
 * volatile (no persistence) and uses default lane caps.
 */
export interface CreateMessageQueueOptions {
  /**
   * Storage adapter for persisting `next` and `later` lanes. `now` lane is
   * always volatile (urgent messages don't survive process death).
   *
   * The adapter is invoked synchronously after every mutation that touches
   * a persistent lane. Implementations should debounce I/O internally.
   */
  storage?: QueueStorageAdapter;
  /**
   * Per-lane cap override. Default 100 per lane. Caps below 1 are coerced to 1.
   */
  laneCap?: number;
  /**
   * Optional logger — called for every enqueue / dequeue / pop / remove. The
   * reference implementation routes these into `recordQueueOperation` for
   * session replay; we keep the hook generic so each surface can wire its
   * own analytics.
   */
  logger?: (event: {
    op: 'enqueue' | 'dequeue' | 'pop' | 'remove' | 'clear';
    cmd?: QueuedCommand;
  }) => void;
}

/**
 * Build a per-surface message queue. Each surface should call this exactly
 * once at boot — the returned object is the shared send pipeline for that
 * surface's chat UI.
 */
export function createMessageQueue(options: CreateMessageQueueOptions = {}): MessageQueue {
  const laneCap = Math.max(1, options.laneCap ?? LANE_CAP);
  const storage = options.storage;
  const logger = options.logger;

  type Snapshot = readonly QueuedCommand[];

  const initial: Snapshot = (() => {
    if (!storage) return Object.freeze<QueuedCommand[]>([]);
    const persisted = storage.read();
    if (!persisted) return Object.freeze<QueuedCommand[]>([]);
    // Restore only `next` and `later` lanes — `now` is volatile by spec.
    const filtered = persisted.filter((cmd) => (cmd.priority ?? 'next') !== 'now');
    return Object.freeze([...filtered]);
  })();

  const store = createStore<Snapshot>(initial);

  // Track AbortSignal listeners per command so we can detach on dequeue.
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
    // Drop `now` lane from persistence — `now` is by-design volatile.
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

  /**
   * Apply a mutation transactionally — Object.is short-circuit in createStore
   * means we only fire listeners + persist when the snapshot changed.
   */
  function mutate(updater: (prev: Snapshot) => Snapshot): Snapshot {
    let nextSnapshot: Snapshot = store.getState();
    store.setState((prev) => {
      const next = updater(prev);
      nextSnapshot = next;
      return next;
    });
    if (nextSnapshot !== initial) {
      // Only persist post-mutation — but createStore's Object.is guard means
      // no-op mutates won't have called the updater path here.
      persist(nextSnapshot);
    }
    return nextSnapshot;
  }

  /**
   * Find the highest-priority command index. Returns -1 if no candidate.
   * Within a lane, the lowest index (oldest) wins → FIFO.
   */
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

    // Wire AbortSignal — cancellation removes the command from the queue.
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted) {
        // Don't enqueue an already-canceled command.
        return stored;
      }
      const handler = () => {
        // removeById is internal — implemented via mutate below.
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
      if (idx === -1) return undefined;
      const cmd = snapshot[idx]!;
      mutate((prev) => {
        // Re-find under the latest snapshot — defends against concurrent
        // mutations by ID match. If the command moved or was removed, no-op.
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
      if (idx === -1 || snapshot[idx]!.id !== expectedId) {
        throw new QueueDequeueRaceError(expectedId);
      }
      const cmd = snapshot[idx]!;
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

      // Reconstruct text buffer — preserves insertion order across the
      // queued commands, then appends current input.
      const queuedTexts = editable.map((cmd) => extractText(cmd.value));
      const newInput = [...queuedTexts, currentInput].filter((s) => s.length > 0).join('\n');

      // Cursor offset = length of joined queued texts + 1 (the joining \n) +
      // the user's current cursor offset. Matches reference algorithm at
      // ~/Desktop/reference/src/utils/messageQueueManager.ts:450.
      const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset;

      // Reconstruct PastedContent — preserve original IDs (so imageStore
      // lookups still resolve). For ContentBlock[] embedded images, allocate
      // fresh sequential IDs starting from `Date.now()` (insertion order).
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
      // Adapters that debounce should expose their own flush; we route the
      // current state through them so the adapter has a chance to commit.
      if (storage)
        storage.write(store.getState().filter((cmd) => (cmd.priority ?? 'next') !== 'now'));
    },
  };
}

// ---------------------------------------------------------------------------
// Storage adapter helpers
// ---------------------------------------------------------------------------

/**
 * Build a `QueueStorageAdapter` backed by Web Storage (`localStorage` or any
 * compatible API). Used by `apps/desktop` and `apps/web`.
 *
 * Returns `null` if `storage` is unavailable (SSR, disabled cookies, locked
 * Storage), allowing callers to fall back to a volatile queue without
 * branching.
 */
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
        // Defensive: trust shape only after a minimal validation pass.
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
        // QuotaExceededError / SecurityError — silently drop persistence;
        // the queue continues to function in-memory.
      }
    },
  };
}

/**
 * Build a `QueueStorageAdapter` backed by an arbitrary key/value store with
 * synchronous get/set (e.g. MMKV in React Native, `chrome.storage.local`
 * wrapped synchronously). The adapter merely shapes the JSON encode/decode
 * pass — the caller is responsible for the underlying I/O policy.
 */
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
        // Swallow — adapter is fire-and-forget.
      }
    },
  };
}
