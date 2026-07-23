/**
 * @agiworkforce/client-runtime
 *
 * Runtime detection, capability-aware command dispatch, and event bus abstraction.
 * Works across Tauri (desktop), cloud web, and test environments.
 *
 * @packageDocumentation
 */

// Runtime environment detection
export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

// Capability-aware command dispatch
export { command, commandWithWarning } from './command';
export type { CommandResult } from './command';

// Error types for capability gating
export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

// Command capability registry
export { resolveCommandCapability } from './registry';

// Event bus abstraction
export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

// HTTP transport (typically not used directly — command() handles routing)
export { routeToCloud } from './http';

// Canonical Cloud agent-event projection. Portable across Web, Desktop, and
// React Native; rendered by each surface using its native UI primitives.
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

// NOTE: agentContext / AsyncLocalStorage have moved to the subpath barrel
// `@agiworkforce/client-runtime/node` (see ./node.ts). They depend on node:async_hooks
// and were previously transitively pulled into mobile/web bundles, requiring a
// polyfill at `apps/mobile/lib/polyfills/async_hooks.cjs`. With the split,
// the universal entry no longer references node built-ins.

// Central state architecture — createStore + onChangeAppState choke-point
export {
  createStore,
  appStateStore,
  onChangeAppState,
  onFanOutError,
  registerApiCacheInvalidator,
  registerTelemetryHandler,
  registerPersistenceHandler,
  registerModelSwitchListener,
  MAX_FANOUT_DEPTH,
  initialAppState,
  initialAuthState,
  initialChatState,
  initialSettingsState,
  initialSubscriptionsState,
  initialMcpState,
  initialMemoryState,
} from './state';
export type {
  Store,
  Listener,
  OnChange,
  FanOutError,
  CircularFanOutError,
  AppStateTelemetryEvent,
  ModelSwitchEvent,
  AppState,
  AuthState,
  ChatState,
  SettingsState,
  SubscriptionsState,
  McpState,
  MemoryState,
  PlanTier,
} from './state';

// Per-surface priority send pipeline (messageQueueManager) — Task 1.4
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

// Shared offline queue + sync manager factories. Mirrored on the
// universal entry (alongside the dedicated `./offline-queue` and
// `./offline-sync` subpath exports in package.json) so TypeScript
// resolution via the package `main`/`types` field — and the desktop
// vite bundle that aliases the package root to `desktop-index.ts` —
// can both see these symbols from `'@agiworkforce/client-runtime'`.
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
