/**
 * @agiworkforce/client-runtime
 *
 * Runtime detection, capability-aware command dispatch, and event bus abstraction.
 * Works across Tauri (desktop), cloud web, and test environments.
 *
 * @packageDocumentation
 */

export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

export { resolveClientChatExecutionMode } from './mode';

export { command, commandWithWarning } from './command';
export type { CommandResult } from './command';

export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

export { resolveCommandCapability } from './registry';

export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

export { routeToCloud } from './http';

export {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  isGenerationProgressEntry,
  isLocalPlaceholderActivityEntry,
  REASONING_PROGRESS_SUMMARY,
  startAgentActivityLocally,
  withoutGenerationProgress,
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

export { pollDeviceAuthorization, requestDeviceAuthorization } from './deviceAuthorization';
export type {
  DeviceAuthorizationPollResult,
  DeviceAuthorizationPost,
  DeviceAuthorizationRequest,
} from './deviceAuthorization';

export {
  AUTH_PROVIDER_IDS,
  DEFAULT_AUTH_PROVIDER_IDS,
  parseAuthProviderIds,
  resolveAuthProviders,
} from './authProviders';
export type { AuthProvider, AuthProviderId } from './authProviders';
