export { isTauri, isCloudWeb, isTest } from './detect';

export {
  BROWSER_ACTIVITY_IDLE_MS,
  createBrowserActivityTracker,
  isBrowserUserActive,
  subscribeBrowserActivity,
} from './browserActivity';
export type { BrowserActivityTracker } from './browserActivity';

export { resolveClientChatExecutionMode } from './mode';

export { command } from './desktop-command';

export { DesktopRequiredError } from './errors';

export { resolveCommandCapability } from './registry';

export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

export {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  hasUnavailableWebSearch,
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

export {
  pollDeviceAuthorization,
  refreshDeviceSession,
  requestDeviceAuthorization,
  slowedDevicePollIntervalMs,
} from './deviceAuthorization';
export type {
  DeviceAuthorizationPollResult,
  DeviceAuthorizationPost,
  DeviceAuthorizationRequest,
  DeviceSessionRefreshResult,
} from './deviceAuthorization';

export {
  AUTH_PROVIDER_IDS,
  DEFAULT_AUTH_PROVIDER_IDS,
  PASSKEY_SIGN_IN_METHOD,
  parseAuthProviderIds,
  passkeySignInEnabled,
  resolveAuthProviders,
} from './authProviders';
export type { AuthProvider, AuthProviderId } from './authProviders';
export {
  WORKSPACE_POLICY_POLL_INTERVAL_MS,
  browserWorkspacePolicyEnvironment,
  createWorkspacePolicyPoller,
  disabledWorkspaceFeatures,
  isWorkspaceFeatureEnabled,
  localStorageWorkspacePolicyCache,
  parseEffectiveWorkspacePolicy,
} from './workspacePolicy';
export type {
  WorkspacePolicyCache,
  WorkspacePolicyEnvironment,
  WorkspacePolicyPoller,
  WorkspacePolicyPollerOptions,
  WorkspacePolicySnapshot,
  WorkspacePolicySource,
} from './workspacePolicy';
export * from './connectors';
export * from './sse';
