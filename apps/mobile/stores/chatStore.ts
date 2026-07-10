/**
 * Barrel re-export. All implementation lives in stores/chat/*.
 * Consumer imports remain unchanged: `import { useChatStore } from '@/stores/chatStore'`
 */
export type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
export type { PaywallErrorState, SendMessageOptions } from './chat/chatExecutionStore';

export { useChatMessageStore, useChatCloudMessageStore } from './chat/chatMessageStore';
export { useChatExecutionStore } from './chat/chatExecutionStore';
export { useChatViewStore } from './chat/chatViewStore';

import { useChatMessageStore, useChatCloudMessageStore } from './chat/chatMessageStore';
import {
  useChatExecutionStore,
  compareCloudMessagesByCreatedAtThenId,
} from './chat/chatExecutionStore';
import { useChatViewStore } from './chat/chatViewStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import type { ForkConversationOptions } from './chat/chatMessageStore';
import type { ChatMode, ChatStyle, ToolAccess, ChatFeatures } from './chat/chatViewStore';
import type { PaywallErrorState, SendMessageOptions } from './chat/chatExecutionStore';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

/** Combined state shape — mirrors the original useChatStore state interface. */
export interface CombinedChatState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  /** Conversation ids with a live stream — scope composer streaming state to the open conversation via this, not the global isStreaming. */
  streamingConversationIds: string[];
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
  forkConversation: (
    sourceConversationId: string,
    options?: ForkConversationOptions,
  ) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  markConversationRead: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
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
  clearError: () => void;
  setSendError: (message: string) => void;
  clearPaywallError: () => void;
  setPaywallError: (paywallError: PaywallErrorState) => void;
  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
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
  // SEPARATION-FIX: merge Local + Cloud conversations for UI display only.
  // The two lists live in physically separate MMKV namespaces and must never
  // be written back into each other's stores. Cloud conversations come after
  // local so local chats are shown first in list order.
  const mergedConversations = [...msg.conversations, ...cloud.conversations];
  // Conversations normally live in exactly one store (separate MMKV namespaces),
  // but the live send/stream path writes streaming state to the LOCAL store even
  // for CLOUD conversations — so a cloud conversation can transiently exist in
  // BOTH stores. A blind { ...local, ...cloud } lets the cloud copy (which lacks
  // the in-flight assistant turn until it is mirrored on completion) HIDE the
  // local streaming/error assistant, making cloud replies, the typing indicator,
  // and timeout errors invisible. For overlapping conversations, union by message
  // id: the cloud copy stays authoritative for shared ids (synced / cross-device),
  // while local-only ids (the in-flight assistant turn) are kept and shown.
  // Display-only — neither store is written back (separation invariant intact).
  const mergedMessages: Record<string, ChatMessage[]> = { ...msg.messages, ...cloud.messages };
  for (const convId of Object.keys(msg.messages)) {
    const cloudMsgs = cloud.messages[convId];
    if (!cloudMsgs) continue; // not overlapping — local copy already merged in
    const byId = new Map(msg.messages[convId].map((m) => [m.id, m]));
    for (const m of cloudMsgs) byId.set(m.id, m); // cloud authoritative for shared ids
    mergedMessages[convId] = Array.from(byId.values()).sort(compareCloudMessagesByCreatedAtThenId);
  }
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
    pinConversation: msg.pinConversation,
    makeConversationPermanent: msg.makeConversationPermanent,
    markConversationRead: msg.markConversationRead,
    deleteMessage: msg.deleteMessage,
    enqueueOfflineMessage: msg.enqueueOfflineMessage,
    beginImageGeneration: msg.beginImageGeneration,
    completeImageGeneration: msg.completeImageGeneration,
    failImageGeneration: msg.failImageGeneration,
    resolveOfflineMessage: msg.resolveOfflineMessage,
    clearQueuedPlaceholders: msg.clearQueuedPlaceholders,
    isStreaming: exec.isStreaming,
    streamingConversationIds: exec.streamingConversationIds,
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
    setSendError: exec.setSendError,
    clearPaywallError: exec.clearPaywallError,
    setPaywallError: exec.setPaywallError,
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
