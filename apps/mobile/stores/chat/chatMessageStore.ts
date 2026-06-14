import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';
import { useProjectStore } from '@/src/features/projects/store';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

export interface ForkConversationOptions {
  title?: string;
  model?: string;
}

interface MessageState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

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
}

export const useChatMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},
      isLoadingConversations: false,
      isLoadingMessages: false,

      setCurrentConversationId: (id) => {
        set({ currentConversationId: id });
      },

      loadConversations: async () => {
        set({ isLoadingConversations: true });
        try {
          if (!shouldLoadCloudConversationList()) return;
          const data = await api.get<{ conversations: ConversationSummary[] }>(
            '/api/chat/conversations',
          );
          set((state) => ({
            conversations: mergeCloudConversations(state.conversations, data.conversations ?? []),
          }));
        } catch {
          // Keep existing conversations on failure — offline resilience
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string, projectId?: string) => {
        const selectedModel = useModelStore.getState().selectedModel;
        const requestedMode = useChatAppModeStore.getState().appMode;
        const effectiveProjectId =
          requestedMode === 'local'
            ? (projectId ?? useProjectStore.getState().activeProjectId ?? undefined)
            : undefined;
        const selectedModelMode = executionModeForModel(selectedModel);
        const conversationModel = selectedModelMode === requestedMode ? selectedModel : undefined;

        return createConversationForMode(
          set,
          title,
          effectiveProjectId,
          conversationModel,
          requestedMode,
        );
      },

      forkConversation: async (sourceConversationId, options) => {
        const sourceConversation = get().conversations.find((c) => c.id === sourceConversationId);
        const sourceMessages = get().messages[sourceConversationId] ?? [];
        const sourceMode = sourceConversation
          ? executionModeForConversation(sourceConversation)
          : executionModeForModel(options?.model);
        const requestedModelMode = options?.model
          ? executionModeForModel(options.model)
          : sourceMode;
        const forkModel =
          options?.model && requestedModelMode === sourceMode
            ? options.model
            : sourceConversation?.model;
        const forkTitle =
          options?.title ??
          `${sourceConversation?.title ?? 'Chat'} (${options?.model ? 'model' : 'copy'} fork)`;
        const forkId = await createConversationForMode(
          set,
          forkTitle,
          sourceMode === 'local' ? sourceConversation?.projectId : undefined,
          forkModel,
          sourceMode,
        );
        const now = Date.now();
        const forkedMessages = sourceMessages.map((message, index) => {
          const {
            isStreaming: _isStreaming,
            isQueued: _isQueued,
            offlineQueueId: _offlineQueueId,
            ...safeMessage
          } = message;

          return {
            ...safeMessage,
            id: `${message.id}_fork_${now}_${index}`,
            conversationId: forkId,
            model: forkModel ?? message.model,
          };
        });

        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === forkId
              ? {
                  ...conversation,
                  messageCount: forkedMessages.length,
                  model: forkModel ?? conversation.model,
                  provider: providerForExecutionMode(sourceMode),
                  executionMode: sourceMode,
                  updatedAt: new Date(now).toISOString(),
                }
              : conversation,
          ),
          messages: { ...state.messages, [forkId]: forkedMessages },
          currentConversationId: forkId,
        }));

        return forkId;
      },

      deleteConversation: async (id) => {
        const conversation = get().conversations.find((c) => c.id === id);
        const shouldDeleteRemote = shouldSyncConversationRemote(conversation);
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        });
        if (!shouldDeleteRemote) return;
        try {
          await api.delete(`/api/chat/conversations/${id}`);
        } catch {
          // Optimistic delete stands — offline resilience
        }
      },

      loadMessages: async (conversationId) => {
        const existing = get().messages[conversationId];
        if (existing && existing.length > 0 && !existing.some((m) => m.isStreaming)) return;
        const conversation = get().conversations.find((c) => c.id === conversationId);

        set({ isLoadingMessages: true });
        try {
          if (!shouldLoadRemoteMessages(conversation)) return;
          const data = await api.get<{ messages: ChatMessage[] }>(
            `/api/chat/conversations/${conversationId}`,
          );
          set((state) => ({
            messages: { ...state.messages, [conversationId]: data.messages ?? [] },
          }));
        } catch {
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: state.messages[conversationId] ?? [],
            },
          }));
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      renameConversation: async (id, title) => {
        const conversation = get().conversations.find((c) => c.id === id);
        const shouldRenameRemote = shouldSyncConversationRemote(conversation);
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        }));
        if (!shouldRenameRemote) return;
        try {
          await api.put(`/api/chat/conversations/${id}`, { title });
        } catch {
          // Optimistic rename stands
        }
      },

      pinConversation: async (id) => {
        const conv = get().conversations.find((c) => c.id === id);
        if (!conv) return;
        const shouldPinRemote = shouldSyncConversationRemote(conv);
        const pinned = !conv.pinned;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
        }));
        if (!shouldPinRemote) return;
        try {
          await api.put(`/api/chat/conversations/${id}`, { pinned });
        } catch {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, pinned: !pinned } : c,
            ),
          }));
        }
      },

      makeConversationPermanent: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, temporary: false } : c,
          ),
        }));
      },

      markConversationRead: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, unread: false } : c,
          ),
        }));
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.id !== messageId),
            },
          };
        });
      },

      enqueueOfflineMessage: (conversationId, content, model, queueId) => {
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          conversationId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          model,
          isQueued: true,
          offlineQueueId: queueId,
        };
        set((state) => {
          const existing = state.messages[conversationId] ?? [];
          return {
            messages: { ...state.messages, [conversationId]: [...existing, userMessage] },
          };
        });
      },

      beginImageGeneration: (conversationId, commandContent, prompt, model) => {
        const now = new Date().toISOString();
        const assistantMessageId = generateMessageId();
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          conversationId,
          role: 'user',
          content: commandContent,
          createdAt: now,
          model,
        };
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          createdAt: now,
          model,
          isGeneratingImage: true,
          imageGenStatus: 'generating',
          imageGenProgress: 0,
          imageGenPrompt: prompt,
        };

        set((state) => {
          const existingMessages = state.messages[conversationId] ?? [];
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...existingMessages, userMessage, assistantMessage],
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: commandContent,
                    messageCount: (conversation.messageCount ?? 0) + 2,
                    updatedAt: now,
                    model: conversation.model ?? model,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });

        return assistantMessageId;
      },

      completeImageGeneration: (conversationId, assistantMessageId, result) => {
        const now = new Date().toISOString();
        const finalContent = result.revisedPrompt
          ? `Generated image: ${result.revisedPrompt}`
          : 'Generated image';

        set((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      type: 'image',
                      imageUrl: result.imageUrl,
                      revisedPrompt: result.revisedPrompt,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'completed',
                      imageGenProgress: 100,
                      imageGenError: undefined,
                      model: result.model ?? message.model,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                    model: result.model ?? conversation.model,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });
      },

      failImageGeneration: (conversationId, assistantMessageId, errorMessage) => {
        const now = new Date().toISOString();
        const finalContent = `Image generation failed: ${errorMessage}`;

        set((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'failed',
                      imageGenProgress: 100,
                      imageGenError: errorMessage,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                  }
                : conversation,
            ),
          };
        });
      },

      resolveOfflineMessage: (conversationId, queueId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.offlineQueueId !== queueId),
            },
          };
        });
      },

      clearQueuedPlaceholders: (conversationId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => !m.isStreaming && !m.isQueued),
            },
          };
        });
      },
    }),
    {
      name: 'chat-message-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        const conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
        const conversationIds = new Set(conversations.map((c) => c.id));
        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            messages[id] = msgs.filter((m) => !m.isStreaming).slice(-MAX_MESSAGES_PER_CONVERSATION);
          }
        }
        return { conversations, messages, currentConversationId: state.currentConversationId };
      },
    },
  ),
);

function isCloudChatEnabled(): boolean {
  return FEATURES.cloudChat && !FEATURES.v1LocalOnly;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function shouldLoadCloudConversationList(): boolean {
  return isCloudChatEnabled() && useChatAppModeStore.getState().appMode === 'cloud';
}

function isCloudConversation(conversation: ConversationSummary | undefined): boolean {
  return Boolean(conversation && executionModeForConversation(conversation) === 'cloud');
}

function shouldSyncConversationRemote(conversation: ConversationSummary | undefined): boolean {
  return isCloudChatEnabled() && isCloudConversation(conversation);
}

function shouldLoadRemoteMessages(conversation: ConversationSummary | undefined): boolean {
  if (!isCloudChatEnabled()) return false;
  if (conversation) return isCloudConversation(conversation);
  return useChatAppModeStore.getState().appMode === 'cloud';
}

function mergeCloudConversations(
  existingConversations: ConversationSummary[],
  cloudConversations: ConversationSummary[],
): ConversationSummary[] {
  const normalizedCloudConversations = cloudConversations.map((conversation) => ({
    ...conversation,
    provider: conversation.provider ?? providerForExecutionMode('cloud'),
    executionMode: conversation.executionMode ?? ('cloud' as const),
  }));
  const localConversations = existingConversations.filter(
    (conversation) => executionModeForConversation(conversation) === 'local',
  );
  return [...normalizedCloudConversations, ...localConversations];
}

async function createConversationForMode(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): Promise<string> {
  if (executionMode === 'local') {
    return createStoredConversation(set, title, projectId, model, executionMode);
  }

  if (!isCloudChatEnabled()) {
    throw new Error('AGI Cloud chat is not enabled in this mobile build.');
  }

  try {
    const data = await api.post<{ conversation: ConversationSummary }>('/api/chat/conversations', {
      title: title ?? 'New Chat',
      projectId,
    });
    const conversation = {
      ...data.conversation,
      projectId,
      model: data.conversation.model ?? model,
      provider: data.conversation.provider ?? providerForExecutionMode('cloud'),
      executionMode: data.conversation.executionMode ?? 'cloud',
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messages: { ...state.messages, [conversation.id]: [] },
    }));
    return conversation.id;
  } catch {
    throw new Error('AGI Cloud conversation could not be created.');
  }
}

function createStoredConversation(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): string {
  const localId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const localConversation: ConversationSummary = {
    id: localId,
    title: title ?? 'New Chat',
    updatedAt: now,
    createdAt: now,
    messageCount: 0,
    pinned: false,
    projectId,
    model,
    provider: providerForExecutionMode(executionMode),
    executionMode,
  };
  set((state) => ({
    conversations: [localConversation, ...state.conversations],
    currentConversationId: localId,
    messages: { ...state.messages, [localId]: [] },
  }));
  return localId;
}

rehydrateWhenMmkvReady(useChatMessageStore, 'chat-message-store');
