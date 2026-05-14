export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

export { command, commandWithWarning } from './desktop-command';
export type { CommandResult } from './desktop-command';

export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

export { resolveCommandCapability } from './registry';

export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

export { routeToCloud } from './http';

// Per-surface priority send pipeline (messageQueueManager) — Task 1.4.
// Mirrored from index.ts so the web/desktop bundle (which aliases
// @agiworkforce/runtime -> desktop-index.ts via apps/desktop/vite.config.ts:293)
// can resolve these symbols at build time.
export {
  createMessageQueue,
  createWebStorageAdapter,
  createKvStorageAdapter,
  LANE_CAP,
  PRIORITY_ORDER,
  QueueDequeueRaceError,
  QueueFullError,
} from './queue';
export type {
  ContentBlock,
  CreateMessageQueueOptions,
  EditablePromptInputMode,
  MessageQueue,
  PastedContent,
  PopAllEditableResult,
  PromptInputMode,
  QueueListener,
  QueuePriority,
  QueueStorageAdapter,
  QueuedCommand,
  SyncKvStore,
} from './queue';
