/**
 * Barrel re-export. All implementation lives in stores/chat/*.
 * Consumer imports remain unchanged: `import { useChatStore } from '@/stores/chatStore'`
 */
export type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
export type { PaywallErrorState } from './chat/chatExecutionStore';

export { useChatMessageStore } from './chat/chatMessageStore';
export { useChatExecutionStore } from './chat/chatExecutionStore';
export { useChatViewStore } from './chat/chatViewStore';

import { useChatMessageStore } from './chat/chatMessageStore';
import { useChatExecutionStore } from './chat/chatExecutionStore';
import { useChatViewStore } from './chat/chatViewStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
import type { PaywallErrorState } from './chat/chatExecutionStore';
import type { Attachment } from '@/components/chat/AttachmentPreview';

/** Combined state shape — mirrors the original useChatStore state interface. */
export interface CombinedChatState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;
  paywallError: PaywallErrorState | null;
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
  chatStyle: ChatStyle;
  toolAccess: ToolAccess;
  features: ChatFeatures;
  setCurrentConversationId: (id: string | null) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string, projectId?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  enqueueOfflineMessage: (
    conversationId: string,
    content: string,
    model: string,
    queueId: string,
  ) => void;
  resolveOfflineMessage: (conversationId: string, queueId: string) => void;
  clearQueuedPlaceholders: (conversationId: string) => void;
  sendMessage: (
    conversationId: string,
    content: string,
    model: string,
    attachments?: Attachment[],
  ) => Promise<void>;
  stopStreaming: () => void;
  retryMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  clearError: () => void;
  clearPaywallError: () => void;
  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
}

function buildCombinedState(
  msg: ReturnType<typeof useChatMessageStore.getState>,
  exec: ReturnType<typeof useChatExecutionStore.getState>,
  view: ReturnType<typeof useChatViewStore.getState>,
): CombinedChatState {
  return {
    conversations: msg.conversations,
    currentConversationId: msg.currentConversationId,
    messages: msg.messages,
    isLoadingConversations: msg.isLoadingConversations,
    isLoadingMessages: msg.isLoadingMessages,
    setCurrentConversationId: msg.setCurrentConversationId,
    loadConversations: msg.loadConversations,
    createConversation: msg.createConversation,
    deleteConversation: msg.deleteConversation,
    loadMessages: msg.loadMessages,
    renameConversation: msg.renameConversation,
    pinConversation: msg.pinConversation,
    makeConversationPermanent: msg.makeConversationPermanent,
    deleteMessage: msg.deleteMessage,
    enqueueOfflineMessage: msg.enqueueOfflineMessage,
    resolveOfflineMessage: msg.resolveOfflineMessage,
    clearQueuedPlaceholders: msg.clearQueuedPlaceholders,
    isStreaming: exec.isStreaming,
    streamingContent: exec.streamingContent,
    streamingReasoning: exec.streamingReasoning,
    error: exec.error,
    paywallError: exec.paywallError,
    retryAttempts: exec.retryAttempts,
    isEditing: exec.isEditing,
    sendMessage: exec.sendMessage,
    stopStreaming: exec.stopStreaming,
    retryMessage: exec.retryMessage,
    editMessage: exec.editMessage,
    clearError: exec.clearError,
    clearPaywallError: exec.clearPaywallError,
    searchQuery: view.searchQuery,
    searchResults: view.searchResults,
    isSearching: view.isSearching,
    chatMode: view.chatMode,
    chatStyle: view.chatStyle,
    toolAccess: view.toolAccess,
    features: view.features,
    searchConversations: view.searchConversations,
    setChatMode: view.setChatMode,
    setChatStyle: view.setChatStyle,
    setToolAccess: view.setToolAccess,
    setFeature: view.setFeature,
  };
}

/** Partial state that can be passed to setState — routes to the correct sub-store. */
type SettableState = Partial<
  Pick<
    CombinedChatState,
    | 'conversations'
    | 'messages'
    | 'currentConversationId'
    | 'chatMode'
    | 'chatStyle'
    | 'toolAccess'
    | 'features'
  >
>;

/**
 * Unified selector hook — mirrors the original useChatStore shape so all
 * existing consumers work without modification.
 *
 * Also exposes `.getState()` and `.setState()` static methods to match the
 * Zustand store API expected by non-component callers (realtime.ts, _layout.tsx).
 */
export function useChatStore<T>(selector: (state: CombinedChatState) => T): T {
  const msgSlice = useChatMessageStore();
  const execSlice = useChatExecutionStore();
  const viewSlice = useChatViewStore();
  return selector(buildCombinedState(msgSlice, execSlice, viewSlice));
}

useChatStore.getState = (): CombinedChatState => {
  return buildCombinedState(
    useChatMessageStore.getState(),
    useChatExecutionStore.getState(),
    useChatViewStore.getState(),
  );
};

/**
 * setState routes message-domain fields to useChatMessageStore.
 * All realtime.ts / _layout.tsx callers only mutate conversations/messages/currentConversationId.
 */
useChatStore.setState = (
  updater: SettableState | ((state: CombinedChatState) => SettableState),
): void => {
  const partial = typeof updater === 'function' ? updater(useChatStore.getState()) : updater;

  const { chatMode, chatStyle, toolAccess, features, ...msgFields } = partial;

  if (Object.keys(msgFields).length > 0) {
    useChatMessageStore.setState(msgFields);
  }
  if (
    chatMode !== undefined ||
    chatStyle !== undefined ||
    toolAccess !== undefined ||
    features !== undefined
  ) {
    const viewUpdate: Partial<ReturnType<typeof useChatViewStore.getState>> = {};
    if (chatMode !== undefined) viewUpdate.chatMode = chatMode;
    if (chatStyle !== undefined) viewUpdate.chatStyle = chatStyle;
    if (toolAccess !== undefined) viewUpdate.toolAccess = toolAccess;
    if (features !== undefined) viewUpdate.features = features;
    useChatViewStore.setState(viewUpdate);
  }
};
