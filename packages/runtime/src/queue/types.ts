/**
 * Types for `messageQueueManager` — the priority send pipeline shared by all
 * 6 AGI Workforce surfaces (CLI, desktop, web, mobile, Chrome ext, VS Code).
 *
 * Three priority lanes:
 *   `now`   — urgent system messages (e.g. interrupt, plan-mode confirmations).
 *   `next`  — default for user-initiated input. Highest priority a human gets.
 *   `later` — task notifications, scheduled tasks, dispatch echoes. Never starves
 *             user input.
 *
 * Within a lane, commands dequeue FIFO.
 *
 * Reference: tasks/research/deep/u2-utils-direct-h-n.md §2.5 + reference
 * implementation at ~/Desktop/reference/src/utils/messageQueueManager.ts.
 */

/** Priority lanes — ordered `now` < `next` < `later` (lower number = higher priority). */
export type QueuePriority = 'now' | 'next' | 'later';

/** Numeric ordering for priorities (lower = higher priority). */
export const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
};

/** Lane cap — each lane rejects new sends past 100 commands. */
export const LANE_CAP = 100;

/**
 * `PromptInputMode` — discriminator for queued commands.
 *
 * Editable modes can be pulled back into the input buffer via UP/ESC.
 * Non-editable modes (notifications, channel messages, system prompts) carry
 * raw structured data and must NOT leak into the user's input.
 */
export type EditablePromptInputMode = 'prompt' | 'bash';
export type PromptInputMode = EditablePromptInputMode | 'task-notification' | 'channel-message';

/**
 * Pasted content — images, file refs, or text blobs the user pasted into the
 * prompt. Preserved across queue → input round-trips so imageStore lookups
 * still resolve. ID is stable; matches reference/src/utils/config.ts shape.
 */
export interface PastedContent {
  /** Stable numeric ID; preserved across `popAllEditable`. */
  id: number;
  type: 'image' | 'text';
  content: string;
  mediaType?: string;
  filename?: string;
}

/**
 * Generic content block supporting both string text and structured (image)
 * payloads. Uses a minimal shape rather than @anthropic-ai/sdk imports so
 * `packages/runtime` stays provider-neutral per `provider-adapter.ts`.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; data: string; media_type: string };
    };

/**
 * `QueuedCommand` — every send pipeline (typed input, queue dequeue, dispatch
 * echo, slash command) wraps the prompt in this shape.
 *
 * `id` is generated at enqueue and is the only identity used for atomic dequeue
 * compare-and-swap.
 */
export interface QueuedCommand {
  /** Stable monotonic ID assigned at enqueue. Used for compare-and-swap dequeue. */
  readonly id: string;
  /** Either a plain string or a multi-block payload (with images/refs). */
  value: string | ContentBlock[];
  /** Pre-expansion text — preserved for popAllEditable to round-trip. */
  preExpansionValue?: string;
  /** Mode discriminator — controls editability and rendering. */
  mode: PromptInputMode;
  /** Pasted attachments — see `PastedContent`. */
  pastedContents?: Record<number, PastedContent>;
  /** True for system-generated commands (subagent ticks, plan verification). */
  isMeta?: boolean;
  /** When true, command is sent as text — never routed through slash dispatch. */
  skipSlashCommands?: boolean;
  /** Lane assignment — defaults to `next` for user input, `later` for notifications. */
  priority?: QueuePriority;
  /** Wall-clock timestamp at enqueue (epoch ms). */
  enqueuedAt: number;
  /** Origin tag for analytics / dispatch routing. */
  origin?: { kind: string; [key: string]: unknown };
  /** Optional UUID supplied by caller (e.g. Dispatch message ID for replay defense). */
  uuid?: string;
}

/**
 * Storage adapter for persisting `next` and `later` lanes across app restart.
 * `now` lane is always volatile — urgent messages don't survive process death.
 *
 * Each surface supplies its own adapter:
 *   - desktop / web → `localStorage` wrapper
 *   - mobile        → `MMKV` wrapper (or `AsyncStorage` fallback)
 *   - CLI           → JSON file under `~/.agiworkforce/queue/<surfaceId>.json`
 *   - extension     → `chrome.storage.local` wrapper
 *
 * The adapter is intentionally synchronous-shaped to match the queue's
 * synchronous mutation API; async backends should wrap their I/O in
 * fire-and-forget Promises and use `flush()` for explicit drain.
 */
export interface QueueStorageAdapter {
  /** Read the persisted snapshot. Returns `null` if no prior state. */
  read(): readonly QueuedCommand[] | null;
  /** Persist the current snapshot. Implementations may debounce. */
  write(commands: readonly QueuedCommand[]): void;
}

/**
 * `QueueFullError` — thrown when a lane has reached `LANE_CAP` and a new
 * enqueue is rejected. Carries the lane name so callers can implement
 * lane-specific backpressure handling (e.g. surface a toast for `next`,
 * silently drop for `later`).
 */
export class QueueFullError extends Error {
  readonly lane: QueuePriority;
  readonly cap: number;
  constructor(lane: QueuePriority, cap: number = LANE_CAP) {
    super(`message queue lane "${lane}" is full (cap=${cap})`);
    this.name = 'QueueFullError';
    this.lane = lane;
    this.cap = cap;
  }
}

/**
 * `QueueDequeueRaceError` — thrown when an atomic dequeue compare-and-swap
 * fails because another consumer raced ahead and removed the command first.
 * Callers should retry against a fresh snapshot.
 */
export class QueueDequeueRaceError extends Error {
  readonly commandId: string;
  constructor(commandId: string) {
    super(`compare-and-swap dequeue lost the race for command "${commandId}"`);
    this.name = 'QueueDequeueRaceError';
    this.commandId = commandId;
  }
}

/**
 * Result of `popAllEditable` — combined input text + cursor position + restored
 * pasted attachments. Returned to the input buffer when ESC/UP pulls queued
 * commands back for editing.
 */
export interface PopAllEditableResult {
  text: string;
  cursorOffset: number;
  pastedContents: PastedContent[];
}

/**
 * Subscriber callback — invoked after every queue mutation. Compatible with
 * React's `useSyncExternalStore`.
 */
export type QueueListener = () => void;

/**
 * Read-only public interface the queue exposes to callers.
 * Hides the internal mutable array; consumers see only frozen snapshots.
 */
export interface MessageQueue {
  /** ----- Read ----- */
  /** Frozen current snapshot — reference-stable until next mutation. */
  getSnapshot(): readonly QueuedCommand[];
  /** Number of commands across all lanes. */
  size(): number;
  /** Per-lane size (for backpressure visibility). */
  laneSize(lane: QueuePriority): number;
  /** True when at least one command is queued. */
  hasCommands(): boolean;
  /** Peek the highest-priority command without removing. */
  peek(filter?: (cmd: QueuedCommand) => boolean): QueuedCommand | undefined;

  /** ----- Subscribe (useSyncExternalStore-compatible) ----- */
  subscribe(listener: QueueListener): () => void;

  /** ----- Write ----- */
  /**
   * Add a command. Generates `id` if absent. Defaults priority to `next`.
   * Throws `QueueFullError` when the chosen lane is at cap.
   *
   * If `signal` is provided, an `abort` event removes the command from the
   * queue (so callers can wire AbortControllers to UI cancel buttons).
   */
  enqueue(
    command: Omit<QueuedCommand, 'id' | 'enqueuedAt'> & {
      id?: string;
      enqueuedAt?: number;
    },
    options?: { signal?: AbortSignal },
  ): QueuedCommand;
  /**
   * Convenience wrapper — defaults priority to `later` for task notifications.
   * Otherwise identical to `enqueue`.
   */
  enqueueNotification(
    command: Omit<QueuedCommand, 'id' | 'enqueuedAt'> & {
      id?: string;
      enqueuedAt?: number;
    },
    options?: { signal?: AbortSignal },
  ): QueuedCommand;
  /**
   * Remove and return the highest-priority command, or undefined if empty.
   * Within a lane, FIFO. `filter` narrows the candidate set without disturbing
   * the rest of the queue.
   */
  dequeue(filter?: (cmd: QueuedCommand) => boolean): QueuedCommand | undefined;
  /**
   * Atomic compare-and-swap dequeue — succeeds only when the command matching
   * `expectedId` is still at the head of its lane. Throws `QueueDequeueRaceError`
   * if another consumer raced ahead. Use after `peek` to safely transfer
   * ownership of a specific command.
   */
  dequeueIf(expectedId: string): QueuedCommand;
  /** Remove and return everything; logs a `dequeue` per command. */
  dequeueAll(): QueuedCommand[];
  /** Remove and return all matching `predicate`, preserving priority order. */
  dequeueAllMatching(predicate: (cmd: QueuedCommand) => boolean): QueuedCommand[];
  /**
   * Pop all editable commands and combine them with `currentInput` for editing.
   * Non-editable modes (`task-notification`, `channel-message`) are left
   * untouched. Preserves `PastedContent.id` ordering (insertion order).
   */
  popAllEditable(
    currentInput: string,
    currentCursorOffset: number,
  ): PopAllEditableResult | undefined;
  /** Clear everything (e.g. ESC cancellation). */
  clear(): void;

  /** ----- Lifecycle ----- */
  /**
   * Drain pending persistence writes (no-op when no storage adapter wired).
   * Call before app shutdown if your adapter debounces.
   */
  flush(): void;
}
