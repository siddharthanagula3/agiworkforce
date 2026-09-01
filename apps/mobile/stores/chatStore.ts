export type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
export type { CloudWorkMode } from '@agiworkforce/types';
export type { SendMessageOptions } from './chat/chatExecutionStore';
export type { PaywallErrorState } from '@/src/features/chat/utils/paywallRecovery';
export {
  paywallActivityErrorFromApiError,
  paywallErrorStateFromApiError,
} from '@/src/features/chat/utils/paywallRecovery';
export type { ProviderConsentErrorState } from '@/src/features/chat/utils/providerConsentRecovery';
export type { FreeCapacityErrorState } from '@/src/features/chat/utils/freeCapacityRecovery';

export { useChatMessageStore, useChatCloudMessageStore } from './chat/chatMessageStore';
export { useChatExecutionStore } from './chat/chatExecutionStore';
export { useChatViewStore } from './chat/chatViewStore';

import { useChatMessageStore, useChatCloudMessageStore } from './chat/chatMessageStore';
import { useChatExecutionStore } from './chat/chatExecutionStore';
import { useChatViewStore } from './chat/chatViewStore';
import type { ChatMessage, ConversationSummary, MessageAttachment } from '@/types/chat';
import type { ForkConversationOptions } from './chat/chatMessageStore';
import type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
import type { SendMessageOptions } from './chat/chatExecutionStore';
import type { PaywallErrorState } from '@/src/features/chat/utils/paywallRecovery';
import type { ProviderConsentErrorState } from '@/src/features/chat/utils/providerConsentRecovery';
import type { FreeCapacityErrorState } from '@/src/features/chat/utils/freeCapacityRecovery';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { CloudWorkMode } from '@agiworkforce/types';

export interface CombinedChatState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingConversationIds: string[];
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;
  paywallError: PaywallErrorState | null;
  providerConsentError: ProviderConsentErrorState | null;
  freeCapacityError: FreeCapacityErrorState | null;
  retryAttempts: Record<string, number>;
  isEditing: boolean;
  searchQuery: string;
  searchResults: Array<{
    conversationId: string;
    messageId: string;
    snippet: string;
    matchStart?: number;
    matchLength?: number;
  }>;
  isSearching: boolean;
  chatMode: ChatMode;
  workMode: CloudWorkMode;
  chatStyle: ChatStyle;
  toolAccess: ToolAccess;
  features: ChatFeatures;
  setCurrentConversationId: (id: string | null) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string, projectId?: string) => Promise<string>;
  forkConversation: (
    sourceConversationId: string,
    options?: ForkConversationOptions,
  ) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setConversationModel: (id: string, model: string) => Promise<boolean>;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  markConversationRead: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setMessageReaction: (
    conversationId: string,
    messageId: string,
    reaction: 'thumbsUp' | 'thumbsDown' | null,
  ) => void;
  enqueueOfflineMessage: (
    conversationId: string,
    content: string,
    model: string,
    queueId: string,
  ) => void;
  beginImageGeneration: (
    conversationId: string,
    commandContent: string,
    prompt: string,
    model: string,
    attachments?: MessageAttachment[],
  ) => string;
  completeImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    result: { imageUrl: string; revisedPrompt?: string; model?: string },
  ) => void;
  failImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    errorMessage: string,
  ) => void;
  beginVideoGeneration: (
    conversationId: string,
    commandContent: string,
    prompt: string,
    model: string,
  ) => string;
  updateVideoGenerationProgress: (
    conversationId: string,
    assistantMessageId: string,
    progress: number | undefined,
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout',
  ) => void;
  completeVideoGeneration: (
    conversationId: string,
    assistantMessageId: string,
    result: { videoUrl: string; thumbnailUrl?: string; model?: string },
  ) => void;
  failVideoGeneration: (
    conversationId: string,
    assistantMessageId: string,
    errorMessage: string,
  ) => void;
  recordVideoGenerationTask: (
    conversationId: string,
    assistantMessageId: string,
    taskId: string,
  ) => void;
  isVideoGenerationCancelRequested: (conversationId: string, assistantMessageId: string) => boolean;
  stopVideoGeneration: (conversationId: string, assistantMessageId: string) => Promise<void>;
  resolveOfflineMessage: (conversationId: string, queueId: string) => void;
  clearQueuedPlaceholders: (conversationId: string) => void;
  sendMessage: (
    conversationId: string,
    content: string,
    model: string,
    attachments?: Attachment[],
    options?: SendMessageOptions,
  ) => Promise<boolean>;
  stopStreaming: () => void;
  retryMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  resolveToolApproval: (
    conversationId: string,
    assistantMessageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => Promise<void>;
  clearError: () => void;
  setSendError: (message: string) => void;
  clearPaywallError: () => void;
  setPaywallError: (paywallError: PaywallErrorState) => void;
  clearProviderConsentError: () => void;
  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setWorkMode: (mode: CloudWorkMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
}

function buildCombinedState(
  msg: ReturnType<typeof useChatMessageStore.getState>,
  cloud: ReturnType<typeof useChatCloudMessageStore.getState>,
  exec: ReturnType<typeof useChatExecutionStore.getState>,
  view: ReturnType<typeof useChatViewStore.getState>,
): CombinedChatState {
  const mergedConversations = [...msg.conversations, ...cloud.conversations];
  const mergedMessages: Record<string, ChatMessage[]> = { ...msg.messages, ...cloud.messages };
  return {
    conversations: mergedConversations,
    currentConversationId: msg.currentConversationId,
    messages: mergedMessages,
    isLoadingConversations: msg.isLoadingConversations,
    isLoadingMessages: msg.isLoadingMessages,
    setCurrentConversationId: msg.setCurrentConversationId,
    loadConversations: msg.loadConversations,
    createConversation: msg.createConversation,
    forkConversation: msg.forkConversation,
    deleteConversation: msg.deleteConversation,
    loadMessages: msg.loadMessages,
    renameConversation: msg.renameConversation,
    setConversationModel: msg.setConversationModel,
    pinConversation: msg.pinConversation,
    makeConversationPermanent: msg.makeConversationPermanent,
    markConversationRead: msg.markConversationRead,
    deleteMessage: msg.deleteMessage,
    setMessageReaction: msg.setMessageReaction,
    enqueueOfflineMessage: msg.enqueueOfflineMessage,
    beginImageGeneration: msg.beginImageGeneration,
    completeImageGeneration: msg.completeImageGeneration,
    failImageGeneration: msg.failImageGeneration,
    beginVideoGeneration: msg.beginVideoGeneration,
    updateVideoGenerationProgress: msg.updateVideoGenerationProgress,
    completeVideoGeneration: msg.completeVideoGeneration,
    failVideoGeneration: msg.failVideoGeneration,
    recordVideoGenerationTask: msg.recordVideoGenerationTask,
    isVideoGenerationCancelRequested: msg.isVideoGenerationCancelRequested,
    stopVideoGeneration: msg.stopVideoGeneration,
    resolveOfflineMessage: msg.resolveOfflineMessage,
    clearQueuedPlaceholders: msg.clearQueuedPlaceholders,
    isStreaming: exec.isStreaming,
    streamingConversationIds: exec.streamingConversationIds,
    streamingContent: exec.streamingContent,
    streamingReasoning: exec.streamingReasoning,
    error: exec.error,
    paywallError: exec.paywallError,
    providerConsentError: exec.providerConsentError,
    freeCapacityError: exec.freeCapacityError,
    retryAttempts: exec.retryAttempts,
    isEditing: exec.isEditing,
    sendMessage: exec.sendMessage,
    stopStreaming: exec.stopStreaming,
    retryMessage: exec.retryMessage,
    editMessage: exec.editMessage,
    resolveToolApproval: exec.resolveToolApproval,
    clearError: exec.clearError,
    setSendError: exec.setSendError,
    clearPaywallError: exec.clearPaywallError,
    setPaywallError: exec.setPaywallError,
    clearProviderConsentError: exec.clearProviderConsentError,
    searchQuery: view.searchQuery,
    searchResults: view.searchResults,
    isSearching: view.isSearching,
    chatMode: view.chatMode,
    workMode: view.workMode,
    chatStyle: view.chatStyle,
    toolAccess: view.toolAccess,
    features: view.features,
    searchConversations: view.searchConversations,
    setChatMode: view.setChatMode,
    setWorkMode: view.setWorkMode,
    setChatStyle: view.setChatStyle,
    setToolAccess: view.setToolAccess,
    setFeature: view.setFeature,
  };
}

type SettableState = Partial<
  Pick<
    CombinedChatState,
    | 'conversations'
    | 'messages'
    | 'currentConversationId'
    | 'chatMode'
    | 'workMode'
    | 'chatStyle'
    | 'toolAccess'
    | 'features'
  >
>;

export function useChatStore<T>(selector: (state: CombinedChatState) => T): T {
  const msgSlice = useChatMessageStore();
  const cloudSlice = useChatCloudMessageStore();
  const execSlice = useChatExecutionStore();
  const viewSlice = useChatViewStore();
  return selector(buildCombinedState(msgSlice, cloudSlice, execSlice, viewSlice));
}

useChatStore.getState = (): CombinedChatState => {
  return buildCombinedState(
    useChatMessageStore.getState(),
    useChatCloudMessageStore.getState(),
    useChatExecutionStore.getState(),
    useChatViewStore.getState(),
  );
};

useChatStore.setState = (
  updater: SettableState | ((state: CombinedChatState) => SettableState),
): void => {
  const partial = typeof updater === 'function' ? updater(useChatStore.getState()) : updater;

  const { chatMode, workMode, chatStyle, toolAccess, features, ...msgFields } = partial;

  if (Object.keys(msgFields).length > 0) {
    useChatMessageStore.setState(msgFields);
  }
  if (
    chatMode !== undefined ||
    workMode !== undefined ||
    chatStyle !== undefined ||
    toolAccess !== undefined ||
    features !== undefined
  ) {
    const viewUpdate: Partial<ReturnType<typeof useChatViewStore.getState>> = {};
    if (chatMode !== undefined) viewUpdate.chatMode = chatMode;
    if (workMode !== undefined) viewUpdate.workMode = workMode;
    if (chatStyle !== undefined) viewUpdate.chatStyle = chatStyle;
    if (toolAccess !== undefined) viewUpdate.toolAccess = toolAccess;
    if (features !== undefined) viewUpdate.features = features;
    useChatViewStore.setState(viewUpdate);
  }
};
