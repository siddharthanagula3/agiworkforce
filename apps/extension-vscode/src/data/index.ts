/**
 * data/ — Persistence, workspace context, and session state.
 * conversationStore: conversation CRUD + pruning (VS Code globalState).
 * checkpointManager: git-based workspace state snapshots.
 * contextBuilder/contextBudget: workspace context gathering + token budgeting.
 * sendQueue: message queue backed by @agiworkforce/runtime.
 * usageMeter: usage meter resolution for the sidebar banner.
 * tokenCounter: session-level token tracking + status bar display.
 * workspaceIndexer: file-watcher based workspace file index.
 */
export { ConversationStore } from './conversationStore';
export type { StoredMessage, StoredConversation } from './conversationStore';

export {
  CheckpointManager,
  initCheckpointManager,
  getCheckpointManager,
} from './checkpointManager';
export type { Checkpoint } from './checkpointManager';

export { getContextBudget, estimateTokens } from './contextBudget';
export type { ContextBudget } from './contextBudget';

export { ContextBuilder, getContextBuilder } from './contextBuilder';
export type {
  ActiveFileContext,
  OpenFileEntry,
  DiagnosticEntry,
  ContextBuildOptions,
} from './contextBuilder';

export { getVSCodeSendQueue, __resetVSCodeSendQueueForTests } from './sendQueue';
export type { MementoLike } from './sendQueue';

export {
  resolvePlanTier,
  resolveUsageMeter,
  formatManagedUsageLabel,
  daysUntilReset,
} from './usageMeter';

export { TokenCounter, getTokenCounter, activateTokenCounter } from './tokenCounter';

export { WorkspaceIndexer } from './workspaceIndexer';
export type { FileEntry } from './workspaceIndexer';
