
export { useChatStore, useChatMessageStore } from './chatStore';
export { useChatViewStore } from './chatViewStore';
export { useChatExecutionStore } from './chatExecutionStore';
export {
  useAgentStore,
  initializeAgentStatusListener,
  applyAgentStatusSnapshot,
} from './agentStore';
export { useToolStore, initializeToolEventListener } from './toolStore';

// Sidecar store is now part of unified UI store, re-exported for backwards compatibility
export { useUIStore as useSidecarStore } from '../ui';

export type {
  MessageMetadata,
  Attachment,
  Operation,
  MessageReaction,
  InlinePanelContent,
  InlinePanel,
  SlashCommandMetadata,
  EnhancedMessage,
  ConversationSummary,
  PendingUserMessage,
  Citation,
  TokenUsage,
  FocusMode,
  ActiveView,
  ConversationMode,
} from './types';

export type {
  ChatState,
  ChatSearchResult,
  ConversationSearchResult,
  BackendConversationStats,
  CostOverviewResponse,
  CostAnalyticsResponse,
  ContextCompactionResponse,
} from './chatStore';
export type {
  AgentStatus,
  BackgroundTaskStatus,
  BackgroundTaskPriority,
  BackgroundTask,
  ActionTrailEntry,
  AgentState,
  AgentStatusPayload,
} from './agentStore';
export type {
  FileOperationType,
  FileOperation,
  TerminalCommand,
  ToolExecution,
  Screenshot,
  ActionLogEntryType,
  ActionLogStatus,
  ApprovalScopeType,
  ApprovalScope,
  ActionLogEntry,
  PlanStep,
  PlanData,
  TrustedWorkflow,
  WorkflowContext,
  ApprovalRiskLevel,
  ApprovalStatus,
  ApprovalRequest,
  ToolStreamStateEntry,
  ToolState,
  ToolEventPayload,
} from './toolStore';

export type { ToolLabelEntry } from './chatStore';
export type {
  SidecarSection,
  SidecarMode,
  SidecarState,
  UIState as SidecarStoreState,
} from '../ui';

export {
  selectConversations,
  selectActiveConversationId,
  selectMessages,
  selectIsLoading,
  selectIsLoadingMessages,
  selectIsStreaming,
  selectCurrentStreamingMessageId,
  selectPendingMessages,
  selectCitations,
  selectTokenUsage,
  selectFocusMode,
  selectActiveView,
  selectConversationMode,
  selectDraftContent,
  selectEditingMessageId,
  selectShowMessageTimestamps,
  selectSelectedMessage,
  selectActiveConversation,
  selectNonArchivedConversations,
  selectPinnedConversations,
  selectToolTimelineByMessage,
  selectThinkingByMessage,
  selectAgenticLoopStatus,
  dbIdToUuid,
  uuidToDbId,
} from './chatStore';

export {
  selectAgents,
  selectAgentStatus,
  selectBackgroundTasks,
  selectActionTrail,
  selectIsAutonomousMode,
  selectMissionControlOpen,
  selectRunningAgents,
  selectActiveBackgroundTasks,
} from './agentStore';

export {
  selectFileOperations,
  selectTerminalCommands,
  selectToolExecutions,
  selectScreenshots,
  selectActionLog,
  selectPendingApprovals,
  selectTrustedWorkflows,
  selectActiveContext,
  selectWorkflowContext,
  selectPlan,
  selectActiveToolStreams,
  selectFilters,
  selectRecentFileOperations,
  selectSuccessfulTerminalCommands,
  selectFailedTerminalCommands,
  selectHighRiskApprovals,
  selectRunningToolStreams,
} from './toolStore';

export {
  selectSidecarOpen,
  selectSidecarSection,
  selectSidecarWidth,
  selectSidecarUserSelected,
  selectSidebarWidth,
  selectSidebarCollapsed,
  selectSidecar,
  selectIsSidecarVisible,
  selectActiveSidecarMode,
} from '../ui';
