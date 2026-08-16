
export type QueuePriority = 'now' | 'next' | 'later';

export const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
};

export const LANE_CAP = 100;

export type EditablePromptInputMode = 'prompt' | 'bash';
export type PromptInputMode = EditablePromptInputMode | 'task-notification' | 'channel-message';

export interface PastedContent {
  id: number;
  type: 'image' | 'text';
  content: string;
  mediaType?: string;
  filename?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; data: string; media_type: string };
    };

export interface QueuedCommand {
  readonly id: string;
  value: string | ContentBlock[];
  preExpansionValue?: string;
  mode: PromptInputMode;
  pastedContents?: Record<number, PastedContent>;
  isMeta?: boolean;
  skipSlashCommands?: boolean;
  priority?: QueuePriority;
  enqueuedAt: number;
  origin?: { kind: string; [key: string]: unknown };
  uuid?: string;
}

export interface QueueStorageAdapter {
  read(): readonly QueuedCommand[] | null;
  write(commands: readonly QueuedCommand[]): void;
}

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

export class QueueDequeueRaceError extends Error {
  readonly commandId: string;
  constructor(commandId: string) {
    super(`compare-and-swap dequeue lost the race for command "${commandId}"`);
    this.name = 'QueueDequeueRaceError';
    this.commandId = commandId;
  }
}

export interface PopAllEditableResult {
  text: string;
  cursorOffset: number;
  pastedContents: PastedContent[];
}

export type QueueListener = () => void;

export interface MessageQueue {
  getSnapshot(): readonly QueuedCommand[];
  size(): number;
  laneSize(lane: QueuePriority): number;
  hasCommands(): boolean;
  peek(filter?: (cmd: QueuedCommand) => boolean): QueuedCommand | undefined;

  subscribe(listener: QueueListener): () => void;

  enqueue(
    command: Omit<QueuedCommand, 'id' | 'enqueuedAt'> & {
      id?: string;
      enqueuedAt?: number;
    },
    options?: { signal?: AbortSignal },
  ): QueuedCommand;
  enqueueNotification(
    command: Omit<QueuedCommand, 'id' | 'enqueuedAt'> & {
      id?: string;
      enqueuedAt?: number;
    },
    options?: { signal?: AbortSignal },
  ): QueuedCommand;
  dequeue(filter?: (cmd: QueuedCommand) => boolean): QueuedCommand | undefined;
  dequeueIf(expectedId: string): QueuedCommand;
  dequeueAll(): QueuedCommand[];
  dequeueAllMatching(predicate: (cmd: QueuedCommand) => boolean): QueuedCommand[];
  popAllEditable(
    currentInput: string,
    currentCursorOffset: number,
  ): PopAllEditableResult | undefined;
  clear(): void;

  flush(): void;
}
