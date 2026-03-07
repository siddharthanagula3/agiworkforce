/**
 * Chat Store Module
 *
 * This module provides a modular store architecture for chat-related state.
 * The stores are split by domain for better maintainability:
 *
 * - chatStore: Conversations, messages, citations, token usage
 * - agentStore: Agent status, background tasks, action trail
 * - toolStore: Tool executions, file operations, terminal commands, approvals
 * - sidecarStore: Sidecar panel state, sidebar state (now consolidated in ui.ts)
 *
 * For backwards compatibility, we also export a unified hook that combines all stores.
 */

// Export all stores
export { useChatStore } from './chatStore';
export {
  useAgentStore,
  initializeAgentStatusListener,
  applyAgentStatusSnapshot,
} from './agentStore';
export { useToolStore, initializeToolEventListener } from './toolStore';

// Sidecar store is now part of unified UI store, re-exported for backwards compatibility
export { useUIStore as useSidecarStore } from '../ui';

// Export all types from types.ts
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

// Export types from individual stores
export type { ChatState } from './chatStore';
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

// Export selectors from all stores
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
