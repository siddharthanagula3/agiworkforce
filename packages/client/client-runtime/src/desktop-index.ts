export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

export { command, commandWithWarning } from './desktop-command';
export type { CommandResult } from './desktop-command';

export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

export { resolveCommandCapability } from './registry';

export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

export { routeToCloud } from './http';

// Canonical Cloud agent-run projection. Desktop aliases the package root to
// this browser-safe entrypoint, so keep the portable reducer available here
// as well as from index.ts. It has no Tauri or Node dependency.
export {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  startAgentActivityLocally,
} from './agentActivity';
export type {
  AgentActivityApproval,
  AgentActivityArtifactEntry,
  AgentActivityContextEntry,
  AgentActivityEntry,
  AgentActivityErrorEntry,
  AgentActivityProgressEntry,
  AgentActivityRunStatus,
  AgentActivitySourcesEntry,
  AgentActivityState,
  AgentActivityStepStatus,
  AgentActivityToolEntry,
  FinishAgentActivityLocallyOptions,
} from './agentActivity';

// Per-surface priority send pipeline (messageQueueManager) — Task 1.4.
// Mirrored from index.ts so the web/desktop bundle (which aliases
// @agiworkforce/client-runtime -> desktop-index.ts via apps/desktop/vite.config.ts:293)
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

// Shared offline queue + sync manager factories. Mirrored so the
// desktop bundle (which aliases the package root to this file) can
// resolve `createOfflineQueue` and `createOfflineSyncManager` without
// the subpath import shape that the alias breaks. Web/Next reaches the
// `./offline-queue` and `./offline-sync` subpath exports directly via
// the package.json `exports` map.
export { createOfflineQueue } from './offline-queue';
export type {
  MessageRetryStatus,
  OfflineQueueApi,
  OfflineQueueLogger,
  OfflineQueueOptions,
  OfflineQueueState,
  OfflineQueueStorage,
  QueuedMessage,
  QueuedToolExecution,
  SyncCallbacks,
  SyncSummary,
} from './offline-queue';

export { createOfflineSyncManager, SyncState } from './offline-sync';
export type {
  OfflineSyncLogger,
  OfflineSyncManager,
  OfflineSyncNetworkHandlers,
  OfflineSyncOptions,
  OfflineSyncQueueAdapter,
  SyncManagerState,
} from './offline-sync';
