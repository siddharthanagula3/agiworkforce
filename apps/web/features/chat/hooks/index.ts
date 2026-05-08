// Chat Hooks - Public API

export { useSessionTokens } from './use-session-tokens';
export { useKeyboardShortcuts } from './use-keyboard-shortcuts';
export { useAIPreferences } from './use-ai-preferences';
export { useExport as useExportConversation } from './use-export-conversation';
export { useChatPersistence } from './use-chat-persistence';
export * from './use-chat-queries';
export { useChatHistory as useConversationHistory } from './use-conversation-history';
export { useVoiceRecording } from './use-voice-recording';
export { useMessageReactions } from './use-message-reactions';
export {
  // Legacy hook (useState based)
  useConversationBranches,
  // React Query hooks
  useBranches,
  useBranchHistory,
  useIsBranchSession,
  useRootSession,
  useCreateBranch,
  useDeleteBranch,
  useUpdateBranchName,
  useInvalidateBranchQueries,
  useMessageBranches,
  useBranchInfo,
  usePrefetchBranches,
  useConversationTree,
  useBranchCount,
  // Query keys for external use
  branchQueryKeys,
} from './use-conversation-branches';
export * from './use-search-history';
export {
  useAdaptedMessages,
  useAdaptedSessions,
  useAdaptedSession,
  useAdaptedToolEvents,
  useAdaptedModelState,
} from './use-unified-adapter';
export type {
  AdaptedMessage,
  AdaptedToolCall,
  AdaptedToolEvent,
  ConversationSummary,
  AdaptedModelState,
} from './use-unified-adapter';
