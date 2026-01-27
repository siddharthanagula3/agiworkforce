/**
 * Unified Chat Store
 *
 * DEPRECATED: This store is maintained for backwards compatibility.
 * New code should use the modular stores directly:
 *
 * - useChatStore: Conversations, messages, citations, token usage
 * - useAgentStore: Agent status, background tasks, action trail
 * - useToolStore: Tool executions, file operations, terminal commands, approvals
 * - useSidecarStore: Sidecar panel state, sidebar state
 *
 * This file re-exports all types and provides a unified hook that combines state
 * from all stores for components that haven't been migrated yet.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from './chat/chatStore';
import {
  useAgentStore,
  initializeAgentStatusListener,
  applyAgentStatusSnapshot,
} from './chat/agentStore';
import { useToolStore } from './chat/toolStore';
import { useUIStore as useSidecarStore } from './ui';

// Re-export all types for backwards compatibility
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
} from './chat/types';

export type {
  AgentStatus,
  BackgroundTaskStatus,
  BackgroundTaskPriority,
  BackgroundTask,
  ActionTrailEntry,
  AgentStatusPayload,
} from './chat/agentStore';

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
} from './chat/toolStore';

export type { SidecarSection, SidecarMode, SidecarState } from './ui';

// Re-export ContextItem type
export type { ContextItem } from '@agiworkforce/types';

// Re-export helper functions
export { dbIdToUuid, uuidToDbId } from './chat/chatStore';

// Re-export initialization functions
export { initializeAgentStatusListener, applyAgentStatusSnapshot };

/**
 * Unified Chat State interface - combines all store states
 * @deprecated Use individual stores instead
 */
export interface UnifiedChatState {
  // From chatStore
  conversations: ReturnType<typeof useChatStore.getState>['conversations'];
  activeConversationId: ReturnType<typeof useChatStore.getState>['activeConversationId'];
  messagesByConversation: ReturnType<typeof useChatStore.getState>['messagesByConversation'];
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  isLoading: ReturnType<typeof useChatStore.getState>['isLoading'];
  isLoadingMessages: ReturnType<typeof useChatStore.getState>['isLoadingMessages'];
  isStreaming: ReturnType<typeof useChatStore.getState>['isStreaming'];
  currentStreamingMessageId: ReturnType<typeof useChatStore.getState>['currentStreamingMessageId'];
  pendingMessages: ReturnType<typeof useChatStore.getState>['pendingMessages'];
  citations: ReturnType<typeof useChatStore.getState>['citations'];
  tokenUsage: ReturnType<typeof useChatStore.getState>['tokenUsage'];
  focusMode: ReturnType<typeof useChatStore.getState>['focusMode'];
  activeView: ReturnType<typeof useChatStore.getState>['activeView'];
  conversationMode: ReturnType<typeof useChatStore.getState>['conversationMode'];
  draftContent: ReturnType<typeof useChatStore.getState>['draftContent'];
  editingMessageId: ReturnType<typeof useChatStore.getState>['editingMessageId'];
  showMessageTimestamps: ReturnType<typeof useChatStore.getState>['showMessageTimestamps'];
  selectedMessage: ReturnType<typeof useChatStore.getState>['selectedMessage'];

  // From agentStore
  agents: ReturnType<typeof useAgentStore.getState>['agents'];
  agentStatus: ReturnType<typeof useAgentStore.getState>['agentStatus'];
  backgroundTasks: ReturnType<typeof useAgentStore.getState>['backgroundTasks'];
  actionTrail: ReturnType<typeof useAgentStore.getState>['actionTrail'];
  fadeTimers: ReturnType<typeof useAgentStore.getState>['fadeTimers'];
  isAutonomousMode: ReturnType<typeof useAgentStore.getState>['isAutonomousMode'];
  missionControlOpen: ReturnType<typeof useAgentStore.getState>['missionControlOpen'];

  // From toolStore
  fileOperations: ReturnType<typeof useToolStore.getState>['fileOperations'];
  terminalCommands: ReturnType<typeof useToolStore.getState>['terminalCommands'];
  toolExecutions: ReturnType<typeof useToolStore.getState>['toolExecutions'];
  screenshots: ReturnType<typeof useToolStore.getState>['screenshots'];
  actionLog: ReturnType<typeof useToolStore.getState>['actionLog'];
  pendingApprovals: ReturnType<typeof useToolStore.getState>['pendingApprovals'];
  trustedWorkflows: ReturnType<typeof useToolStore.getState>['trustedWorkflows'];
  activeContext: ReturnType<typeof useToolStore.getState>['activeContext'];
  workflowContext: ReturnType<typeof useToolStore.getState>['workflowContext'];
  plan: ReturnType<typeof useToolStore.getState>['plan'];
  activeToolStreams: ReturnType<typeof useToolStore.getState>['activeToolStreams'];
  filters: ReturnType<typeof useToolStore.getState>['filters'];

  // From sidecarStore
  sidecarOpen: ReturnType<typeof useSidecarStore.getState>['sidecarOpen'];
  sidecarSection: ReturnType<typeof useSidecarStore.getState>['sidecarSection'];
  sidecarWidth: ReturnType<typeof useSidecarStore.getState>['sidecarWidth'];
  sidecarUserSelected: ReturnType<typeof useSidecarStore.getState>['sidecarUserSelected'];
  sidebarWidth: ReturnType<typeof useSidecarStore.getState>['sidebarWidth'];
  sidebarCollapsed: ReturnType<typeof useSidecarStore.getState>['sidebarCollapsed'];
  sidecar: ReturnType<typeof useSidecarStore.getState>['sidecar'];

  // Actions from chatStore
  ensureActiveConversation: ReturnType<typeof useChatStore.getState>['ensureActiveConversation'];
  createConversation: ReturnType<typeof useChatStore.getState>['createConversation'];
  selectConversation: ReturnType<typeof useChatStore.getState>['selectConversation'];
  renameConversation: ReturnType<typeof useChatStore.getState>['renameConversation'];
  setConversationCustomInstructions: ReturnType<
    typeof useChatStore.getState
  >['setConversationCustomInstructions'];
  getConversationCustomInstructions: ReturnType<
    typeof useChatStore.getState
  >['getConversationCustomInstructions'];
  deleteConversation: ReturnType<typeof useChatStore.getState>['deleteConversation'];
  togglePinnedConversation: ReturnType<typeof useChatStore.getState>['togglePinnedConversation'];
  archiveConversation: ReturnType<typeof useChatStore.getState>['archiveConversation'];
  restoreConversation: ReturnType<typeof useChatStore.getState>['restoreConversation'];
  getArchivedConversations: ReturnType<typeof useChatStore.getState>['getArchivedConversations'];
  getConversationsByProject: ReturnType<typeof useChatStore.getState>['getConversationsByProject'];
  setConversationProject: ReturnType<typeof useChatStore.getState>['setConversationProject'];
  exportConversationToMarkdown: ReturnType<
    typeof useChatStore.getState
  >['exportConversationToMarkdown'];
  addMessage: ReturnType<typeof useChatStore.getState>['addMessage'];
  addOptimisticMessage: ReturnType<typeof useChatStore.getState>['addOptimisticMessage'];
  confirmOptimisticMessage: ReturnType<typeof useChatStore.getState>['confirmOptimisticMessage'];
  failOptimisticMessage: ReturnType<typeof useChatStore.getState>['failOptimisticMessage'];
  retryFailedMessage: ReturnType<typeof useChatStore.getState>['retryFailedMessage'];
  updateMessage: ReturnType<typeof useChatStore.getState>['updateMessage'];
  deleteMessage: ReturnType<typeof useChatStore.getState>['deleteMessage'];
  editMessage: ReturnType<typeof useChatStore.getState>['editMessage'];
  editAndRegenerateFromMessage: ReturnType<
    typeof useChatStore.getState
  >['editAndRegenerateFromMessage'];
  getMessagesAfter: ReturnType<typeof useChatStore.getState>['getMessagesAfter'];
  setIsLoading: ReturnType<typeof useChatStore.getState>['setIsLoading'];
  setStreamingMessage: ReturnType<typeof useChatStore.getState>['setStreamingMessage'];
  appendToStreamingMessage: ReturnType<typeof useChatStore.getState>['appendToStreamingMessage'];
  addInlinePanel: ReturnType<typeof useChatStore.getState>['addInlinePanel'];
  updateInlinePanel: ReturnType<typeof useChatStore.getState>['updateInlinePanel'];
  toggleInlinePanelCollapse: ReturnType<typeof useChatStore.getState>['toggleInlinePanelCollapse'];
  addPendingMessage: ReturnType<typeof useChatStore.getState>['addPendingMessage'];
  removePendingMessage: ReturnType<typeof useChatStore.getState>['removePendingMessage'];
  clearPendingMessages: ReturnType<typeof useChatStore.getState>['clearPendingMessages'];
  getPendingMessagesCount: ReturnType<typeof useChatStore.getState>['getPendingMessagesCount'];
  addCitation: ReturnType<typeof useChatStore.getState>['addCitation'];
  getCitationByIndex: ReturnType<typeof useChatStore.getState>['getCitationByIndex'];
  clearCitations: ReturnType<typeof useChatStore.getState>['clearCitations'];
  updateTokenUsage: ReturnType<typeof useChatStore.getState>['updateTokenUsage'];
  getTokenPercentage: ReturnType<typeof useChatStore.getState>['getTokenPercentage'];
  setFocusMode: ReturnType<typeof useChatStore.getState>['setFocusMode'];
  setActiveView: ReturnType<typeof useChatStore.getState>['setActiveView'];
  setConversationMode: ReturnType<typeof useChatStore.getState>['setConversationMode'];
  setDraftContent: ReturnType<typeof useChatStore.getState>['setDraftContent'];
  startEditingMessage: ReturnType<typeof useChatStore.getState>['startEditingMessage'];
  cancelEditing: ReturnType<typeof useChatStore.getState>['cancelEditing'];
  setSelectedMessage: ReturnType<typeof useChatStore.getState>['setSelectedMessage'];
  toggleMessageTimestamps: ReturnType<typeof useChatStore.getState>['toggleMessageTimestamps'];
  toggleMessageBookmark: ReturnType<typeof useChatStore.getState>['toggleMessageBookmark'];
  toggleMessageReaction: ReturnType<typeof useChatStore.getState>['toggleMessageReaction'];
  getBookmarkedMessages: ReturnType<typeof useChatStore.getState>['getBookmarkedMessages'];
  getConversationStats: ReturnType<typeof useChatStore.getState>['getConversationStats'];
  linkConversationId: ReturnType<typeof useChatStore.getState>['linkConversationId'];

  // Actions from agentStore
  updateAgentStatus: ReturnType<typeof useAgentStore.getState>['updateAgentStatus'];
  setAgentStatus: ReturnType<typeof useAgentStore.getState>['setAgentStatus'];
  addAgent: ReturnType<typeof useAgentStore.getState>['addAgent'];
  removeAgent: ReturnType<typeof useAgentStore.getState>['removeAgent'];
  updateTaskProgress: ReturnType<typeof useAgentStore.getState>['updateTaskProgress'];
  addBackgroundTask: ReturnType<typeof useAgentStore.getState>['addBackgroundTask'];
  updateBackgroundTask: ReturnType<typeof useAgentStore.getState>['updateBackgroundTask'];
  clearBackgroundTasks: ReturnType<typeof useAgentStore.getState>['clearBackgroundTasks'];
  addActionTrailEntry: ReturnType<typeof useAgentStore.getState>['addActionTrailEntry'];
  removeActionTrailEntry: ReturnType<typeof useAgentStore.getState>['removeActionTrailEntry'];
  clearActionTrail: ReturnType<typeof useAgentStore.getState>['clearActionTrail'];
  getActiveActionTrail: ReturnType<typeof useAgentStore.getState>['getActiveActionTrail'];
  setAutonomousMode: ReturnType<typeof useAgentStore.getState>['setAutonomousMode'];
  setMissionControlOpen: ReturnType<typeof useAgentStore.getState>['setMissionControlOpen'];

  // Actions from toolStore
  addFileOperation: ReturnType<typeof useToolStore.getState>['addFileOperation'];
  addTerminalCommand: ReturnType<typeof useToolStore.getState>['addTerminalCommand'];
  updateTerminalOutput: ReturnType<typeof useToolStore.getState>['updateTerminalOutput'];
  addToolExecution: ReturnType<typeof useToolStore.getState>['addToolExecution'];
  addScreenshot: ReturnType<typeof useToolStore.getState>['addScreenshot'];
  addActionLogEntry: ReturnType<typeof useToolStore.getState>['addActionLogEntry'];
  updateActionLogEntry: ReturnType<typeof useToolStore.getState>['updateActionLogEntry'];
  clearActionLog: ReturnType<typeof useToolStore.getState>['clearActionLog'];
  setWorkflowContext: ReturnType<typeof useToolStore.getState>['setWorkflowContext'];
  setPlan: ReturnType<typeof useToolStore.getState>['setPlan'];
  updatePlanStep: ReturnType<typeof useToolStore.getState>['updatePlanStep'];
  clearPlan: ReturnType<typeof useToolStore.getState>['clearPlan'];
  addApprovalRequest: ReturnType<typeof useToolStore.getState>['addApprovalRequest'];
  approveOperation: ReturnType<typeof useToolStore.getState>['approveOperation'];
  rejectOperation: ReturnType<typeof useToolStore.getState>['rejectOperation'];
  removeApprovalRequest: ReturnType<typeof useToolStore.getState>['removeApprovalRequest'];
  setTrustedWorkflow: ReturnType<typeof useToolStore.getState>['setTrustedWorkflow'];
  removeTrustedWorkflow: ReturnType<typeof useToolStore.getState>['removeTrustedWorkflow'];
  recordTrustedAction: ReturnType<typeof useToolStore.getState>['recordTrustedAction'];
  isActionTrusted: ReturnType<typeof useToolStore.getState>['isActionTrusted'];
  addContextItem: ReturnType<typeof useToolStore.getState>['addContextItem'];
  removeContextItem: ReturnType<typeof useToolStore.getState>['removeContextItem'];
  clearContext: ReturnType<typeof useToolStore.getState>['clearContext'];
  updateToolStream: ReturnType<typeof useToolStore.getState>['updateToolStream'];
  removeToolStream: ReturnType<typeof useToolStore.getState>['removeToolStream'];
  clearToolStreams: ReturnType<typeof useToolStore.getState>['clearToolStreams'];
  getActiveToolStreams: ReturnType<typeof useToolStore.getState>['getActiveToolStreams'];
  cancelToolExecution: ReturnType<typeof useToolStore.getState>['cancelToolExecution'];
  setFileOperationFilter: ReturnType<typeof useToolStore.getState>['setFileOperationFilter'];
  setTerminalStatusFilter: ReturnType<typeof useToolStore.getState>['setTerminalStatusFilter'];
  setToolNameFilter: ReturnType<typeof useToolStore.getState>['setToolNameFilter'];

  // Actions from sidecarStore
  setSidecarOpen: ReturnType<typeof useSidecarStore.getState>['setSidecarOpen'];
  setSidecarSection: ReturnType<typeof useSidecarStore.getState>['setSidecarSection'];
  setSidecarSectionFromEvent: ReturnType<
    typeof useSidecarStore.getState
  >['setSidecarSectionFromEvent'];
  setSidecarWidth: ReturnType<typeof useSidecarStore.getState>['setSidecarWidth'];
  setSidebarWidth: ReturnType<typeof useSidecarStore.getState>['setSidebarWidth'];
  setSidebarCollapsed: ReturnType<typeof useSidecarStore.getState>['setSidebarCollapsed'];
  setSidecar: ReturnType<typeof useSidecarStore.getState>['setSidecar'];
  openSidecar: ReturnType<typeof useSidecarStore.getState>['openSidecar'];
  closeSidecar: ReturnType<typeof useSidecarStore.getState>['closeSidecar'];
  getSuggestedSidecarMode: ReturnType<typeof useSidecarStore.getState>['getSuggestedSidecarMode'];

  // Combined actions
  clearHistory: () => void;
  exportConversation: () => Promise<string>;
  resetOnLogout: () => void;
}

/**
 * Unified Chat Store Hook
 *
 * @deprecated Use individual stores directly:
 * - useChatStore for conversations and messages
 * - useAgentStore for agent status and background tasks
 * - useToolStore for tool executions and approvals
 * - useSidecarStore for sidecar panel state
 *
 * This hook combines all stores for backwards compatibility but incurs
 * performance overhead due to combining multiple store subscriptions.
 */
function useUnifiedChatStoreImpl<T = UnifiedChatState>(
  selector?: (state: UnifiedChatState) => T,
): T {
  // Get state from all stores
  const chatState = useChatStore();
  const agentState = useAgentStore();
  const toolState = useToolStore();
  const sidecarState = useSidecarStore();

  // Create combined clearHistory action
  const clearHistory = useCallback(() => {
    chatState.clearHistory();
    agentState.clearActionTrail();
    toolState.clearToolHistory();
  }, [chatState, agentState, toolState]);

  // Create combined resetOnLogout action
  const resetOnLogout = useCallback(() => {
    chatState.resetOnLogout();
    agentState.resetOnLogout();
    toolState.resetOnLogout();
    sidecarState.resetOnLogout();
  }, [chatState, agentState, toolState, sidecarState]);

  // Combine all state into unified state object
  const unifiedState = useMemo<UnifiedChatState>(
    () => ({
      // Chat state
      conversations: chatState.conversations,
      activeConversationId: chatState.activeConversationId,
      messagesByConversation: chatState.messagesByConversation,
      messages: chatState.messages,
      isLoading: chatState.isLoading,
      isLoadingMessages: chatState.isLoadingMessages,
      isStreaming: chatState.isStreaming,
      currentStreamingMessageId: chatState.currentStreamingMessageId,
      pendingMessages: chatState.pendingMessages,
      citations: chatState.citations,
      tokenUsage: chatState.tokenUsage,
      focusMode: chatState.focusMode,
      activeView: chatState.activeView,
      conversationMode: chatState.conversationMode,
      draftContent: chatState.draftContent,
      editingMessageId: chatState.editingMessageId,
      showMessageTimestamps: chatState.showMessageTimestamps,
      selectedMessage: chatState.selectedMessage,

      // Agent state
      agents: agentState.agents,
      agentStatus: agentState.agentStatus,
      backgroundTasks: agentState.backgroundTasks,
      actionTrail: agentState.actionTrail,
      fadeTimers: agentState.fadeTimers,
      isAutonomousMode: agentState.isAutonomousMode,
      missionControlOpen: agentState.missionControlOpen,

      // Tool state
      fileOperations: toolState.fileOperations,
      terminalCommands: toolState.terminalCommands,
      toolExecutions: toolState.toolExecutions,
      screenshots: toolState.screenshots,
      actionLog: toolState.actionLog,
      pendingApprovals: toolState.pendingApprovals,
      trustedWorkflows: toolState.trustedWorkflows,
      activeContext: toolState.activeContext,
      workflowContext: toolState.workflowContext,
      plan: toolState.plan,
      activeToolStreams: toolState.activeToolStreams,
      filters: toolState.filters,

      // Sidecar state
      sidecarOpen: sidecarState.sidecarOpen,
      sidecarSection: sidecarState.sidecarSection,
      sidecarWidth: sidecarState.sidecarWidth,
      sidecarUserSelected: sidecarState.sidecarUserSelected,
      sidebarWidth: sidecarState.sidebarWidth,
      sidebarCollapsed: sidecarState.sidebarCollapsed,
      sidecar: sidecarState.sidecar,

      // Chat actions
      ensureActiveConversation: chatState.ensureActiveConversation,
      createConversation: chatState.createConversation,
      selectConversation: chatState.selectConversation,
      renameConversation: chatState.renameConversation,
      setConversationCustomInstructions: chatState.setConversationCustomInstructions,
      getConversationCustomInstructions: chatState.getConversationCustomInstructions,
      deleteConversation: chatState.deleteConversation,
      togglePinnedConversation: chatState.togglePinnedConversation,
      archiveConversation: chatState.archiveConversation,
      restoreConversation: chatState.restoreConversation,
      getArchivedConversations: chatState.getArchivedConversations,
      getConversationsByProject: chatState.getConversationsByProject,
      setConversationProject: chatState.setConversationProject,
      exportConversationToMarkdown: chatState.exportConversationToMarkdown,
      addMessage: chatState.addMessage,
      addOptimisticMessage: chatState.addOptimisticMessage,
      confirmOptimisticMessage: chatState.confirmOptimisticMessage,
      failOptimisticMessage: chatState.failOptimisticMessage,
      retryFailedMessage: chatState.retryFailedMessage,
      updateMessage: chatState.updateMessage,
      deleteMessage: chatState.deleteMessage,
      editMessage: chatState.editMessage,
      editAndRegenerateFromMessage: chatState.editAndRegenerateFromMessage,
      getMessagesAfter: chatState.getMessagesAfter,
      setIsLoading: chatState.setIsLoading,
      setStreamingMessage: chatState.setStreamingMessage,
      appendToStreamingMessage: chatState.appendToStreamingMessage,
      addInlinePanel: chatState.addInlinePanel,
      updateInlinePanel: chatState.updateInlinePanel,
      toggleInlinePanelCollapse: chatState.toggleInlinePanelCollapse,
      addPendingMessage: chatState.addPendingMessage,
      removePendingMessage: chatState.removePendingMessage,
      clearPendingMessages: chatState.clearPendingMessages,
      getPendingMessagesCount: chatState.getPendingMessagesCount,
      addCitation: chatState.addCitation,
      getCitationByIndex: chatState.getCitationByIndex,
      clearCitations: chatState.clearCitations,
      updateTokenUsage: chatState.updateTokenUsage,
      getTokenPercentage: chatState.getTokenPercentage,
      setFocusMode: chatState.setFocusMode,
      setActiveView: chatState.setActiveView,
      setConversationMode: chatState.setConversationMode,
      setDraftContent: chatState.setDraftContent,
      startEditingMessage: chatState.startEditingMessage,
      cancelEditing: chatState.cancelEditing,
      setSelectedMessage: chatState.setSelectedMessage,
      toggleMessageTimestamps: chatState.toggleMessageTimestamps,
      toggleMessageBookmark: chatState.toggleMessageBookmark,
      toggleMessageReaction: chatState.toggleMessageReaction,
      getBookmarkedMessages: chatState.getBookmarkedMessages,
      getConversationStats: chatState.getConversationStats,
      linkConversationId: chatState.linkConversationId,

      // Agent actions
      updateAgentStatus: agentState.updateAgentStatus,
      setAgentStatus: agentState.setAgentStatus,
      addAgent: agentState.addAgent,
      removeAgent: agentState.removeAgent,
      updateTaskProgress: agentState.updateTaskProgress,
      addBackgroundTask: agentState.addBackgroundTask,
      updateBackgroundTask: agentState.updateBackgroundTask,
      clearBackgroundTasks: agentState.clearBackgroundTasks,
      addActionTrailEntry: agentState.addActionTrailEntry,
      removeActionTrailEntry: agentState.removeActionTrailEntry,
      clearActionTrail: agentState.clearActionTrail,
      getActiveActionTrail: agentState.getActiveActionTrail,
      setAutonomousMode: agentState.setAutonomousMode,
      setMissionControlOpen: agentState.setMissionControlOpen,

      // Tool actions
      addFileOperation: toolState.addFileOperation,
      addTerminalCommand: toolState.addTerminalCommand,
      updateTerminalOutput: toolState.updateTerminalOutput,
      addToolExecution: toolState.addToolExecution,
      addScreenshot: toolState.addScreenshot,
      addActionLogEntry: toolState.addActionLogEntry,
      updateActionLogEntry: toolState.updateActionLogEntry,
      clearActionLog: toolState.clearActionLog,
      setWorkflowContext: toolState.setWorkflowContext,
      setPlan: toolState.setPlan,
      updatePlanStep: toolState.updatePlanStep,
      clearPlan: toolState.clearPlan,
      addApprovalRequest: toolState.addApprovalRequest,
      approveOperation: toolState.approveOperation,
      rejectOperation: toolState.rejectOperation,
      removeApprovalRequest: toolState.removeApprovalRequest,
      setTrustedWorkflow: toolState.setTrustedWorkflow,
      removeTrustedWorkflow: toolState.removeTrustedWorkflow,
      recordTrustedAction: toolState.recordTrustedAction,
      isActionTrusted: toolState.isActionTrusted,
      addContextItem: toolState.addContextItem,
      removeContextItem: toolState.removeContextItem,
      clearContext: toolState.clearContext,
      updateToolStream: toolState.updateToolStream,
      removeToolStream: toolState.removeToolStream,
      clearToolStreams: toolState.clearToolStreams,
      getActiveToolStreams: toolState.getActiveToolStreams,
      cancelToolExecution: toolState.cancelToolExecution,
      setFileOperationFilter: toolState.setFileOperationFilter,
      setTerminalStatusFilter: toolState.setTerminalStatusFilter,
      setToolNameFilter: toolState.setToolNameFilter,

      // Sidecar actions
      setSidecarOpen: sidecarState.setSidecarOpen,
      setSidecarSection: sidecarState.setSidecarSection,
      setSidecarSectionFromEvent: sidecarState.setSidecarSectionFromEvent,
      setSidecarWidth: sidecarState.setSidecarWidth,
      setSidebarWidth: sidecarState.setSidebarWidth,
      setSidebarCollapsed: sidecarState.setSidebarCollapsed,
      setSidecar: sidecarState.setSidecar,
      openSidecar: sidecarState.openSidecar,
      closeSidecar: sidecarState.closeSidecar,
      getSuggestedSidecarMode: sidecarState.getSuggestedSidecarMode,

      // Combined actions
      clearHistory,
      exportConversation: chatState.exportConversation,
      resetOnLogout,
    }),
    [chatState, agentState, toolState, sidecarState, clearHistory, resetOnLogout],
  );

  if (selector) {
    return selector(unifiedState);
  }

  // When no selector is provided, T defaults to UnifiedChatState
  return unifiedState as unknown as T;
}

// Create the exported hook with static methods attached
type UseUnifiedChatStore = {
  (): UnifiedChatState;
  <T>(selector: (state: UnifiedChatState) => T): T;
  getState: () => UnifiedChatState;
  setState: (
    partial: Partial<UnifiedChatState> | ((state: UnifiedChatState) => Partial<UnifiedChatState>),
  ) => void;
  subscribe: (
    listener: (state: UnifiedChatState, prevState: UnifiedChatState) => void,
  ) => () => void;
};

export const useUnifiedChatStore = useUnifiedChatStoreImpl as UseUnifiedChatStore;

// Static methods for direct store access (non-hook usage)
useUnifiedChatStore.getState = (): UnifiedChatState => {
  const chatState = useChatStore.getState();
  const agentState = useAgentStore.getState();
  const toolState = useToolStore.getState();
  const sidecarState = useSidecarStore.getState();

  return {
    // Chat state
    ...chatState,
    // Agent state
    agents: agentState.agents,
    agentStatus: agentState.agentStatus,
    backgroundTasks: agentState.backgroundTasks,
    actionTrail: agentState.actionTrail,
    fadeTimers: agentState.fadeTimers,
    isAutonomousMode: agentState.isAutonomousMode,
    missionControlOpen: agentState.missionControlOpen,
    updateAgentStatus: agentState.updateAgentStatus,
    setAgentStatus: agentState.setAgentStatus,
    addAgent: agentState.addAgent,
    removeAgent: agentState.removeAgent,
    updateTaskProgress: agentState.updateTaskProgress,
    addBackgroundTask: agentState.addBackgroundTask,
    updateBackgroundTask: agentState.updateBackgroundTask,
    clearBackgroundTasks: agentState.clearBackgroundTasks,
    addActionTrailEntry: agentState.addActionTrailEntry,
    removeActionTrailEntry: agentState.removeActionTrailEntry,
    clearActionTrail: agentState.clearActionTrail,
    getActiveActionTrail: agentState.getActiveActionTrail,
    setAutonomousMode: agentState.setAutonomousMode,
    setMissionControlOpen: agentState.setMissionControlOpen,
    // Tool state
    fileOperations: toolState.fileOperations,
    terminalCommands: toolState.terminalCommands,
    toolExecutions: toolState.toolExecutions,
    screenshots: toolState.screenshots,
    actionLog: toolState.actionLog,
    pendingApprovals: toolState.pendingApprovals,
    trustedWorkflows: toolState.trustedWorkflows,
    activeContext: toolState.activeContext,
    workflowContext: toolState.workflowContext,
    plan: toolState.plan,
    activeToolStreams: toolState.activeToolStreams,
    filters: toolState.filters,
    addFileOperation: toolState.addFileOperation,
    addTerminalCommand: toolState.addTerminalCommand,
    updateTerminalOutput: toolState.updateTerminalOutput,
    addToolExecution: toolState.addToolExecution,
    addScreenshot: toolState.addScreenshot,
    addActionLogEntry: toolState.addActionLogEntry,
    updateActionLogEntry: toolState.updateActionLogEntry,
    clearActionLog: toolState.clearActionLog,
    setWorkflowContext: toolState.setWorkflowContext,
    setPlan: toolState.setPlan,
    updatePlanStep: toolState.updatePlanStep,
    clearPlan: toolState.clearPlan,
    addApprovalRequest: toolState.addApprovalRequest,
    approveOperation: toolState.approveOperation,
    rejectOperation: toolState.rejectOperation,
    removeApprovalRequest: toolState.removeApprovalRequest,
    setTrustedWorkflow: toolState.setTrustedWorkflow,
    removeTrustedWorkflow: toolState.removeTrustedWorkflow,
    recordTrustedAction: toolState.recordTrustedAction,
    isActionTrusted: toolState.isActionTrusted,
    addContextItem: toolState.addContextItem,
    removeContextItem: toolState.removeContextItem,
    clearContext: toolState.clearContext,
    updateToolStream: toolState.updateToolStream,
    removeToolStream: toolState.removeToolStream,
    clearToolStreams: toolState.clearToolStreams,
    getActiveToolStreams: toolState.getActiveToolStreams,
    cancelToolExecution: toolState.cancelToolExecution,
    setFileOperationFilter: toolState.setFileOperationFilter,
    setTerminalStatusFilter: toolState.setTerminalStatusFilter,
    setToolNameFilter: toolState.setToolNameFilter,
    // Sidecar state
    sidecarOpen: sidecarState.sidecarOpen,
    sidecarSection: sidecarState.sidecarSection,
    sidecarWidth: sidecarState.sidecarWidth,
    sidecarUserSelected: sidecarState.sidecarUserSelected,
    sidebarWidth: sidecarState.sidebarWidth,
    sidebarCollapsed: sidecarState.sidebarCollapsed,
    sidecar: sidecarState.sidecar,
    setSidecarOpen: sidecarState.setSidecarOpen,
    setSidecarSection: sidecarState.setSidecarSection,
    setSidecarSectionFromEvent: sidecarState.setSidecarSectionFromEvent,
    setSidecarWidth: sidecarState.setSidecarWidth,
    setSidebarWidth: sidecarState.setSidebarWidth,
    setSidebarCollapsed: sidecarState.setSidebarCollapsed,
    setSidecar: sidecarState.setSidecar,
    openSidecar: sidecarState.openSidecar,
    closeSidecar: sidecarState.closeSidecar,
    getSuggestedSidecarMode: sidecarState.getSuggestedSidecarMode,
    // Combined actions
    clearHistory: () => {
      chatState.clearHistory();
      agentState.clearActionTrail();
      toolState.clearToolHistory();
    },
    resetOnLogout: () => {
      chatState.resetOnLogout();
      agentState.resetOnLogout();
      toolState.resetOnLogout();
      sidecarState.resetOnLogout();
    },
  };
};

useUnifiedChatStore.setState = (
  partial: Partial<UnifiedChatState> | ((state: UnifiedChatState) => Partial<UnifiedChatState>),
) => {
  const updates = typeof partial === 'function' ? partial(useUnifiedChatStore.getState()) : partial;

  // Route updates to appropriate stores
  const chatKeys = [
    'conversations',
    'activeConversationId',
    'messagesByConversation',
    'messages',
    'isLoading',
    'isLoadingMessages',
    'isStreaming',
    'currentStreamingMessageId',
    'pendingMessages',
    'citations',
    'tokenUsage',
    'focusMode',
    'activeView',
    'conversationMode',
    'draftContent',
    'editingMessageId',
    'showMessageTimestamps',
    'selectedMessage',
  ] as const;

  const agentKeys = [
    'agents',
    'agentStatus',
    'backgroundTasks',
    'actionTrail',
    'fadeTimers',
    'isAutonomousMode',
    'missionControlOpen',
  ] as const;

  const toolKeys = [
    'fileOperations',
    'terminalCommands',
    'toolExecutions',
    'screenshots',
    'actionLog',
    'pendingApprovals',
    'trustedWorkflows',
    'activeContext',
    'workflowContext',
    'plan',
    'activeToolStreams',
    'filters',
  ] as const;

  const sidecarKeys = [
    'sidecarOpen',
    'sidecarSection',
    'sidecarWidth',
    'sidecarUserSelected',
    'sidebarWidth',
    'sidebarCollapsed',
    'sidecar',
  ] as const;

  const chatUpdates: Record<string, unknown> = {};
  const agentUpdates: Record<string, unknown> = {};
  const toolUpdates: Record<string, unknown> = {};
  const sidecarUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (chatKeys.includes(key as (typeof chatKeys)[number])) {
      chatUpdates[key] = value;
    } else if (agentKeys.includes(key as (typeof agentKeys)[number])) {
      agentUpdates[key] = value;
    } else if (toolKeys.includes(key as (typeof toolKeys)[number])) {
      toolUpdates[key] = value;
    } else if (sidecarKeys.includes(key as (typeof sidecarKeys)[number])) {
      sidecarUpdates[key] = value;
    }
  }

  if (Object.keys(chatUpdates).length > 0) {
    useChatStore.setState(chatUpdates as unknown as Parameters<typeof useChatStore.setState>[0]);
  }
  if (Object.keys(agentUpdates).length > 0) {
    useAgentStore.setState(agentUpdates as unknown as Parameters<typeof useAgentStore.setState>[0]);
  }
  if (Object.keys(toolUpdates).length > 0) {
    useToolStore.setState(toolUpdates as unknown as Parameters<typeof useToolStore.setState>[0]);
  }
  if (Object.keys(sidecarUpdates).length > 0) {
    useSidecarStore.setState(
      sidecarUpdates as unknown as Parameters<typeof useSidecarStore.setState>[0],
    );
  }
};

// Subscribe to all stores
useUnifiedChatStore.subscribe = (
  listener: (state: UnifiedChatState, prevState: UnifiedChatState) => void,
) => {
  let prevState = useUnifiedChatStore.getState();

  const unsubscribeChat = useChatStore.subscribe(() => {
    const nextState = useUnifiedChatStore.getState();
    listener(nextState as UnifiedChatState, prevState as UnifiedChatState);
    prevState = nextState;
  });

  const unsubscribeAgent = useAgentStore.subscribe(() => {
    const nextState = useUnifiedChatStore.getState();
    listener(nextState as UnifiedChatState, prevState as UnifiedChatState);
    prevState = nextState;
  });

  const unsubscribeTool = useToolStore.subscribe(() => {
    const nextState = useUnifiedChatStore.getState();
    listener(nextState as UnifiedChatState, prevState as UnifiedChatState);
    prevState = nextState;
  });

  const unsubscribeSidecar = useSidecarStore.subscribe(() => {
    const nextState = useUnifiedChatStore.getState();
    listener(nextState as UnifiedChatState, prevState as UnifiedChatState);
    prevState = nextState;
  });

  return () => {
    unsubscribeChat();
    unsubscribeAgent();
    unsubscribeTool();
    unsubscribeSidecar();
  };
};

// Export individual stores for migration
export { useChatStore, useAgentStore, useToolStore, useSidecarStore };
