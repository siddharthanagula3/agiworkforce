/**
 * data/ — Persistence, workspace context, and session state.
 * contextBuilder/contextBudget: workspace context gathering + token budgeting.
 * sendQueue: message queue backed by @agiworkforce/client-runtime.
 * usageMeter: usage meter resolution for the sidebar banner.
 * tokenCounter: session-level token tracking + status bar display.
 * workspaceIndexer: file-watcher based workspace file index.
 */

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
